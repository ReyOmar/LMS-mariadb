# Auditoría técnica — LMS PESV Education

Fecha: 2026-09-17
Alcance: `apps/api` (NestJS 11 + Fastify + Prisma 7 + MariaDB) y `apps/client` (Next.js 15 + React 19).
Volumen: ~10.100 líneas de API, ~21.200 líneas de cliente.

Este documento registra el estado del proyecto **antes** de la refactorización y justifica cada cambio
posterior. Cada hallazgo lleva un identificador estable que se referencia en los commits.

---

## 1. Resumen ejecutivo

El proyecto está bien organizado en superficie (módulos NestJS por dominio, DTOs, guards globales,
filtro de excepciones, contextos de React separados) pero tiene **tres problemas estructurales**:

1. **Autorización por confianza en el cliente.** Múltiples endpoints aceptan `?usuario_guid=` y usan ese
   valor en lugar del sujeto del JWT. Cualquier usuario autenticado puede leer y escribir datos de
   cualquier otro. Es el problema más grave del sistema.
2. **Reglas de negocio duplicadas y hardcodeadas.** La escala de notas `0.0–5.0` y el umbral `3.0`
   aparecen copiados en ocho lugares distintos (servicios, listeners, scheduler, DTOs, PDF, textos de
   correo). Cambiar la escala exige tocar todos.
3. **No existe noción de tenant.** No hay ninguna columna de país. Toda la separación México/Colombia
   pedida es imposible con el modelo actual.

Sobre esas tres bases se apoyan el resto de hallazgos.

---

## 2. Seguridad

### SEC-01 — Suplantación de identidad vía query param (crítico)

Patrón repetido: `const guid = usuario_guid || user.sub;`

| Endpoint                                                 | Efecto de la suplantación                                 |
| -------------------------------------------------------- | --------------------------------------------------------- |
| `GET /estudiantes/student/progreso`                      | Leer el progreso de cualquier alumno                      |
| `POST /estudiantes/student/completar-recurso`            | **Marcar recursos como completados en nombre de otro**    |
| `GET /estudiantes/student/dias-activos`                  | Leer actividad ajena                                      |
| `GET /estudiantes/student/notificaciones`                | Leer notificaciones ajenas                                |
| `GET /estudiantes/student/metricas`                      | Leer métricas ajenas                                      |
| `POST /estudiantes/student/heartbeat`                    | Inflar el tiempo activo de otro usuario                   |
| `POST /estudiantes/student/certificados/generar`         | **Emitir un certificado a nombre de otro**                |
| `GET /estudiantes/student/certificados/verificar/:curso` | Leer estado de curso ajeno                                |
| `GET /estudiantes/student/certificados`                  | Listar certificados ajenos                                |
| `GET /configuracion/firma` · `POST /configuracion/firma` | **Leer y sobrescribir la firma digital de un examinador** |

El último es especialmente grave: la firma es lo que da validez al certificado emitido.

### SEC-02 — Respuestas correctas del cuestionario expuestas al alumno (crítico)

`GET /cursos/:guid` devuelve el curso completo, incluido `recursos.quiz_config`, que es un JSON con
`opciones[].es_correcta`. El componente `QuizPlayer` recibe ese JSON crudo (`quiz_config_raw`) y sólo
_omite_ el campo en su interfaz TypeScript. Las respuestas viajan al navegador: son visibles en la
pestaña Red del inspector antes de contestar. Toda evaluación del sistema es trivialmente superable.

### SEC-03 — `GET /cursos/:guid` sin verificación de matrícula (alto)

El mismo endpoint no comprueba matrícula ni propiedad. Cualquier usuario autenticado puede leer el
contenido íntegro de cualquier curso conociendo su GUID.

### SEC-04 — Calificar entregas ajenas (alto)

`PATCH /evaluaciones/entregas/:guid/calificar` sólo exige rol `PROFESOR`/`ADMINISTRADOR`. No verifica
que la entrega pertenezca a un curso del profesor que califica. Lo mismo en
`GET /evaluaciones/tareas/:tarea_guid/entregas`.

### SEC-05 — Monitoreo de alumnos de otro profesor (medio)

`GET /dashboards/examiner/monitoreo?profesor_guid=` toma el GUID del query en vez del JWT.

### SEC-06 — IDOR en certificados (alto)

`GET /estudiantes/student/certificados/:guid` y `/:guid/pdf` no comprueban propiedad: cualquier
usuario autenticado descarga el PDF de cualquier certificado.

### SEC-07 — Notificaciones ajenas marcables como leídas (bajo)

`PATCH /notificaciones/:id/leer` y `PATCH /estudiantes/student/notificaciones/:id/leer` actualizan por
`id` sin filtrar por propietario.

### SEC-08 — Mensajería sin verificación de contacto (medio)

Existe un sistema de aprobación mutua (`lms_contacto_chat`), pero `POST /notificaciones/mensajes` no lo
consulta. Cualquier usuario puede escribir a cualquier otro conociendo su GUID, saltándose la
aprobación. Con la separación por países esto sería además una vía de cruce de datos.

### SEC-09 — Archivos subidos son públicos (alto)

`GET /storage/download/*` es `@Public()`. El modelo de seguridad declarado es «los nombres son UUID no
enumerables». Bajo esa ruta se sirven **entregas de alumnos, firmas de examinadores y certificados**.
Una URL filtrada (historial, proxy, captura) expone el documento indefinidamente.

### SEC-10 — SVG servido en línea (medio)

`.svg` está en la lista de extensiones permitidas y se sirve con `Content-Disposition: inline`. Un SVG
puede contener scripts. La CSP de helmet lo mitiga parcialmente, pero es un vector innecesario.

### SEC-11 — Enumeración de usuarios en el login (bajo)

`login` distingue «El usuario no está registrado» de «Credenciales inválidas», lo que permite descubrir
qué correos existen.

### SEC-12 — Endpoints sin DTO (medio)

`POST /auth/usuarios/crear`, `POST /auth/verificar-email` y `POST /auth/confirmar-email` reciben
`@Body() body: {...}` (tipo estructural, no clase). El `ValidationPipe` global no valida nada porque no
hay metadatos de clase: entran cadenas vacías, correos mal formados y roles arbitrarios.

### SEC-13 — Token JWT en la query string del WebSocket (bajo)

`wss://host/ws?token=...` deja el token en logs de proxy y de acceso.

---

## 3. Corrección / bugs

### BUG-01 — Borrado de archivos referenciados (crítico, pérdida de datos)

`StorageService.uploadFromBuffer` guarda en local con nombre plano (`1699-ab.pdf`) pero **devuelve la
clave con prefijo de carpeta** (`entregas/1699-ab.pdf`), que es lo que se persiste en la base de datos.

`SchedulerService.cleanupOrphanFiles` (diario, 03:00) compara el listado plano del directorio contra el
conjunto de claves con prefijo. Ninguna coincide. Resultado: **borra todos los archivos locales con más
de 24 h**, incluidas entregas y certificados vigentes, cada vez que corre sin R2 configurado.

### BUG-02 — Borrado de un profesor puede borrar sus cursos (alto)

`UserService.deleteUser` reasigna los cursos a un admin de respaldo sólo si encuentra uno
(`fallbackAdmin`). Si no lo encuentra, continúa y `prisma.usuarios.delete` dispara el
`onDelete: Cascade` de `lms_cursos.profesor` — se pierden cursos, módulos, recursos y matrículas.

### BUG-03 — El logo nunca aparece en el certificado en producción

`certificados.service` resuelve el logo como `path.join(process.cwd(), 'uploads', config.logo_url)`.
Con R2 activo el archivo no existe en disco y el logo se omite silenciosamente.

### BUG-04 — Métrica `profesoresActivos` sin sentido

```ts
[...profGuids].filter((g) => cursos.some((c) => allMatriculas.some((m) => m.curso_guid === c.guid)));
```

El predicado no usa `g`: devuelve todos los profesores o ninguno. El dashboard de administración
muestra un número que no significa nada.

### BUG-05 — `rejectRequest` borra la solicitud

Rechazar elimina la fila en vez de marcarla `RECHAZADA`. El solicitante puede volver a pedir acceso
inmediatamente y el estado `RECHAZADA` del enum queda muerto. No hay trazabilidad de rechazos.

### BUG-06 — `logout` cierra todas las sesiones del usuario

`TokenBlacklistService.revokeUser(sub)` revoca por usuario, no por token. Cerrar sesión en el móvil
cierra también la del escritorio.

### BUG-07 — `escala` del curso es decorativa

`lms_escala_calificacion` (NUMERICA/PORCENTAJE/PUNTOS/LETRAS) existe en el esquema pero **ningún
servicio la lee**. Todo el sistema asume 0–5 siempre.

### BUG-08 — El límite de archivo configurable no se aplica

`lms_configuracion.max_archivo_mb` (por defecto 10) y `lms_recursos.archivo_max_size_mb` se guardan pero
`StorageService` valida contra una constante `MAX_FILE_SIZE = 50MB`. Los tres valores se contradicen.

### BUG-09 — `verificacion_email` nunca se consume

El registro verificado queda en la tabla indefinidamente y `requestAccess` sólo comprueba que exista
alguno verificado para ese correo. No caduca ni se limpia.

### BUG-10 — Validación de nota limitada a `Max(5)`

`CalificarEntregaDto` fija `@Max(5)` en código, ignorando la `nota_aprobacion`/escala del curso.

---

## 4. Arquitectura y sobreingeniería

### ARQ-01 — Capa `lms_lecciones` vestigial

La jerarquía real es `curso → módulo → recurso`, pero el esquema interpone `lms_lecciones`. Cada módulo
crea **exactamente una** lección artificial titulada `"Lección Interna Módulo <guid>"`. Consecuencias:

- Todas las consultas arrastran un `include` extra y un `flatMap` anidado de tres niveles.
  El patrón `leccion.modulo.curso` aparece 14 veces en la API.
- Un `JOIN` adicional en cada lectura de curso.
- Para un desarrollador nuevo, el modelo mental no coincide con el código.

### ARQ-02 — Detección de republicación por polling

`SchedulerService.checkCourseReactivation` corre **cada 5 minutos**, consulta todos los borradores y los
compara con un `Set` en memoria para deducir qué curso pasó de BORRADOR a PUBLICADO. El propio
`updateCurso` ya sabe exactamente cuándo ocurre ese cambio. Además, el estado en memoria se pierde en
cada reinicio y el proceso no es idempotente entre instancias.

### ARQ-03 — Lógica de «estado obsoleto» del quiz

`startQuiz` y `getQuizStatus` intentan deducir si un módulo fue reiniciado comparando «hay entregas
calificadas pero no hay registro de progreso» y entonces borran filas. Es una reconstrucción frágil de
un estado que debería ser explícito. Aparece duplicada en dos métodos con variables paralelas
(`effectiveAttempts`, `effectiveBestNota`).

### ARQ-04 — La nota se transporta como texto parseable

`calificarEntrega` escribe `NOTA: 4.5 | comentario` en `contenido_texto` «por compatibilidad», además
de guardar los valores estructurados en `calificacion` y `comentario_calificacion`.

El cliente **no usa los campos estructurados**: los reconstruye parseando la cadena en cinco sitios
(`AssignmentPlayer`, `examiner/calificaciones`, `examiner/pruebas`, la página de tarea y el listado).
`replace('NOTA: ', '').split(' | ')` se rompe en cuanto un comentario contenga `|`, y `parseFloat`
sobre un texto ausente produce `NaN` que acaba pintado en pantalla. Es un formato serializado ad-hoc
allí donde ya existen dos columnas tipadas.

### ARQ-05 — Columna `TEXT` para lo que es una clave de almacenamiento

`lms_recursos.archivo_adjunto` está declarada `@db.Text` y documentada como «Base64 del archivo
adjunto». El código actual **ya no guarda base64**: sube por `StorageService` y persiste la clave
(`recursos/1699-ab.pdf`). Queda una columna `TEXT` sobredimensionada y un comentario que induce a error
a quien lea el esquema.

### ARQ-06 — Dashboards que cargan tablas completas en memoria

`getAdminDashboardStats` trae **todas** las matrículas, **todas** las entregas calificadas y las filtra
en Node. `getMonitoreoEstudiantes` hace lo mismo con todos los recursos y progresos de un profesor.
Funciona con datos de prueba; se degrada de forma no lineal.

### ARQ-07 — Difusión indiscriminada por WebSocket

`broadcast('dashboard:refresh', ...)` se emite a **todos** los clientes conectados en casi cada
escritura. El cliente aplica un debounce de 300 ms y vuelve a pedir datos. Es la razón declarada por la
que el rate limit global tuvo que subirse a 200 req/min. Con la separación por países esto sería además
una fuga: un evento de Colombia despertaría peticiones en México.

### ARQ-08 — Tres fuentes de verdad para la URL de la API

`lib/env.ts` deduce el host de la API a partir del hostname (`lms.` → `api-lms.`), `layout.tsx` usa
`process.env.NEXT_PUBLIC_API_URL` directamente en el servidor y `WebSocketContext` reescribe el
protocolo con expresiones regulares. Tres reglas distintas que hay que mantener sincronizadas.

---

## 5. Despliegue en cPanel

### CP-01 — WebSockets

El gateway usa `@nestjs/platform-ws` sobre `/ws`. En cPanel las aplicaciones Node se sirven detrás de
Apache con Passenger, que **no propaga la cabecera `Upgrade`** en la configuración estándar. El
resultado observado (tiempo real caído en producción) es el esperado.

No hace falta pedir permisos al hosting: **Server-Sent Events** resuelve el caso de uso completo. Todo
lo que el sistema envía es servidor → cliente (notificaciones, presencia, refrescos, revocación de
sesión). El único mensaje cliente → servidor es el bloqueo de edición de curso, que es una petición
HTTP normal. SSE viaja sobre HTTP/1.1 corriente y atraviesa cualquier proxy inverso.

### CP-02 — Artefactos de build versionados

`apps/client/prod/` (build standalone completo) y `lms-cpanel-deploy.zip` (19 MB) están commiteados en
el repositorio. Se regeneran en cada build; no deben versionarse.

### CP-03 — README desactualizado

Describe PostgreSQL y despliegue en Render. El proyecto usa MariaDB y se despliega en cPanel.

---

## 6. Calidad de código

- **COD-01** — `any` generalizado en fronteras de servicios (`requestUser?: any`, `dto: any`,
  `m: any`), lo que anula la comprobación de tipos justo donde más importa.
- **COD-02** — Ficheros de página de 1.000–1.600 líneas en el cliente
  (`constructor-cursos/page.tsx`: 1.611 líneas) que mezclan estado, llamadas a la API y presentación.
- **COD-03** — `catch {}` vacíos en el gateway y en el parseo de configuración de quiz: los fallos
  desaparecen sin rastro. Es exactamente el «error silencioso» que hay que evitar.
- **COD-04** — Comentarios que referencian identificadores de incidencias ya cerradas
  (`BUG-02 FIX`, `F7.5.2`, `PERF-03`) sin contexto accesible.
- **COD-05** — `seedMatriculas` matricula a todos los alumnos en todos los cursos. Protegido por
  `NODE_ENV`, pero expuesto como endpoint HTTP.

---

## 7. Lo que está bien y se conserva

Para que la refactorización no destruya valor existente, conviene dejar constancia de lo correcto:

- Separación por módulos de dominio en NestJS, con DTOs y `class-validator` donde existen.
- `AllExceptionsFilter` global con formato de respuesta consistente y correlación por `X-Request-ID`.
- Validación de `JWT_SECRET` al arranque, que aborta el proceso ante valores inseguros.
- Validación de _magic bytes_ en las subidas para evitar suplantación de extensión.
- `helmet`, `compress`, rate limiting global y CORS explícito.
- Sanitización con DOMPurify y lista blanca restrictiva en el cliente.
- `AlertContext` con interfaces de error amigables, que es la base sobre la que construir el manejo de
  errores pedido.
- La interfaz de usuario en general: es la parte más madura del proyecto.

---

## 8. Plan de intervención

Orden elegido para que cada fase deje el sistema en estado funcional:

| Fase | Contenido                                                   | Hallazgos que cierra                           |
| ---- | ----------------------------------------------------------- | ---------------------------------------------- |
| A    | Dominio único: escala de notas 0–100, umbral 80, países     | BUG-07, BUG-10, ARQ-04                         |
| B    | Multi-país en esquema, JWT y consultas                      | (nueva funcionalidad)                          |
| C    | Autorización: fin de la suplantación, propiedad de recursos | SEC-01 … SEC-08, SEC-12                        |
| D    | Tiempo real sobre SSE                                       | CP-01, SEC-13, ARQ-07                          |
| E    | Almacenamiento y ficheros                                   | BUG-01, BUG-03, BUG-08, SEC-09, SEC-10, ARQ-05 |
| F    | Simplificación: lecciones, scheduler, estado de quiz        | ARQ-01, ARQ-02, ARQ-03                         |
| G    | Cliente: selector de país, escala 0–100, transporte SSE     | (nueva funcionalidad)                          |
| H    | Limpieza, documentación y despliegue                        | CP-02, CP-03, COD-\*                           |

---

## 9. Resultado

Estado de cada hallazgo tras la refactorización.

### Seguridad

| Id     | Hallazgo                              | Cómo quedó                                                                                                                                                   |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-01 | Suplantación vía `?usuario_guid=`     | Cerrado. El patrón desapareció de los diez endpoints; la identidad sale del token y `@CurrentUser()` falla si no hay sesión en lugar de devolver `undefined` |
| SEC-02 | Respuestas del cuestionario expuestas | Cerrado. Dos proyecciones del curso; las preguntas se piden al abrir el intento y salen sin `es_correcta`                                                    |
| SEC-03 | Ficha de curso sin matrícula          | Cerrado. `getCursoParaEstudiante` exige matrícula y curso publicado                                                                                          |
| SEC-04 | Calificar entregas ajenas             | Cerrado. `cursoDeEntregaQueGestiona` comprueba la propiedad                                                                                                  |
| SEC-05 | Monitoreo de alumnos ajenos           | Cerrado. El endpoint ya no acepta `profesor_guid`                                                                                                            |
| SEC-06 | IDOR en certificados                  | Cerrado. Sólo el titular o un administrador de su sede                                                                                                       |
| SEC-07 | Notificaciones ajenas                 | Cerrado. El filtro incluye al propietario                                                                                                                    |
| SEC-08 | Mensajería sin contacto aceptado      | Cerrado. `asegurarContactoAceptado` en envío y lectura                                                                                                       |
| SEC-09 | Archivos públicos                     | Cerrado. URL firmada con caducidad para entregas, certificados, firmas y material de curso                                                                   |
| SEC-10 | SVG servido en línea                  | Mitigado. Se conserva el formato para los logotipos, pero se sirve con una CSP que impide ejecutar scripts                                                   |
| SEC-11 | Enumeración de usuarios               | Cerrado. Un solo mensaje para correo inexistente, contraseña incorrecta y sede equivocada                                                                    |
| SEC-12 | Endpoints sin DTO                     | Cerrado. Todos los cuerpos tienen clase con `class-validator`                                                                                                |
| SEC-13 | Token en la query del WebSocket       | Cerrado. SSE leído con `fetch` y cabecera `Authorization`                                                                                                    |

### Corrección

| Id     | Hallazgo                                | Cómo quedó                                                                                                                              |
| ------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| BUG-01 | Borrado de archivos en uso              | Cerrado. Disco y base usan la misma clave `carpeta/nombre`                                                                              |
| BUG-02 | Borrar profesor arrastraba sus cursos   | Cerrado. Relación `Restrict` y traspaso explícito, con selector en la interfaz                                                          |
| BUG-03 | Certificado sin logotipo                | Cerrado. Las imágenes se leen del almacenamiento, no del disco                                                                          |
| BUG-04 | Métrica `profesoresActivos` sin sentido | Cerrado. Recuentos con agregados de base de datos                                                                                       |
| BUG-05 | `rejectRequest` borraba la solicitud    | Cerrado. Queda como `RECHAZADA`, con motivo                                                                                             |
| BUG-06 | `logout` cerraba todas las sesiones     | Resuelto de otra forma. Se mantiene una sola sesión por cuenta, pero ahora es explícito y persistente; cerrar sesión libera el registro |
| BUG-07 | `escala` decorativa                     | Cerrado. Se retiró la columna y su enum: el sistema tiene una única escala                                                              |
| BUG-08 | Límite de archivo ignorado              | Cerrado. Se aplica el del recurso, si no el de la sede, y nunca por encima del tope del servidor                                        |
| BUG-09 | Verificación de correo sin consumir     | Cerrado. Se consume al crear la solicitud y caduca                                                                                      |
| BUG-10 | `@Max(5)` en el DTO                     | Cerrado. Los límites salen del dominio                                                                                                  |

### Arquitectura

| Id     | Hallazgo                           | Cómo quedó                                                                                       |
| ------ | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| ARQ-01 | Capa `lms_lecciones` vestigial     | Eliminada. Los recursos cuelgan del módulo                                                       |
| ARQ-02 | Republicación por sondeo           | Eliminado. `updateCurso` avisa en el momento del cambio                                          |
| ARQ-03 | Estado obsoleto del quiz           | Eliminado. Los intentos se conservan y el reinicio afecta al progreso del módulo, no al contador |
| ARQ-04 | La nota como texto parseable       | Cerrado. Campos propios; se retiró `contenido_texto`                                             |
| ARQ-05 | Columna `TEXT` para una clave      | Cerrado. Columna dimensionada y comentario corregido                                             |
| ARQ-06 | Dashboards cargando tablas enteras | Cerrado. Agregados en base de datos                                                              |
| ARQ-07 | Difusión indiscriminada            | Cerrado. Todo evento exige destino con país y rol                                                |
| ARQ-08 | Tres fuentes para la URL de la API | Cerrado. Sólo `lib/env.ts`                                                                       |

### Despliegue y calidad

| Id     | Hallazgo                                | Cómo quedó                                                                                                                                               |
| ------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CP-01  | WebSockets bloqueados                   | Resuelto. Tiempo real sobre SSE; no hace falta pedir nada al hosting                                                                                     |
| CP-02  | Artefactos versionados                  | Cerrado. `prod/` y el zip fuera del repositorio                                                                                                          |
| CP-03  | README desactualizado                   | Reescrito, junto con la guía de cPanel y un documento de decisiones                                                                                      |
| COD-01 | `any` en fronteras                      | Reducido en la API; el cliente conserva `any` en estructuras de pantalla                                                                                 |
| COD-02 | Páginas de más de mil líneas            | Parcial. Se dividieron login, menú lateral y las pantallas de configuración; el constructor de cursos y el panel de calificaciones siguen siendo grandes |
| COD-03 | `catch {}` vacíos                       | Cerrado en los caminos que ocultaban fallos; se conservan donde la operación es prescindible, con el motivo escrito                                      |
| COD-04 | Comentarios con identificadores muertos | Cerrado                                                                                                                                                  |
| COD-05 | `seedMatriculas` expuesto               | Eliminado                                                                                                                                                |

## 10. Segunda pasada

Lo que se abordó después de cerrar el informe anterior.

### Reglas de acceso, ahora comprobadas

`CursoAccesoService` tiene 27 pruebas sobre un doble de Prisma que **interpreta el `where`**
de cada consulta en lugar de devolver valores preparados. Esa diferencia es lo que les da
valor: al quitar experimentalmente el filtro por país del servicio, 7 pruebas fallaron. Con
un simulacro corriente habrían pasado todas.

### Errores que llegaban al usuario como «error interno»

El filtro global sólo entendía las excepciones de Nest. Todo lo demás —un correo repetido,
una clave ajena rota, la base de datos apagada— salía como error 500 con un texto que no
ayudaba a nadie.

| Situación                            | Antes               | Ahora                                                                |
| ------------------------------------ | ------------------- | -------------------------------------------------------------------- |
| Correo o matrícula duplicados        | 500 «error interno» | 409 «Ya existe un registro con ese correo»                           |
| Registro borrado mientras se editaba | 500                 | 404 «El registro que intentas modificar ya no existe»                |
| Base de datos caída                  | 500                 | 503 «La base de datos no está disponible… inténtalo en unos minutos» |
| Dirección inexistente                | `Cannot GET /api/x` | «La dirección solicitada no existe en la API»                        |

Comprobado en ejecución con la base apagada: el mensaje del 503 llega hasta la pantalla de
acceso. El filtro tiene 17 pruebas propias.

### Seguridad

- **Enumeración de cuentas por tiempo de respuesta.** El mensaje de error del acceso ya era
  idéntico en todos los casos, pero un correo inexistente respondía al instante y uno
  registrado tardaba lo que tarda bcrypt. Ahora ambos gastan lo mismo.
- **Código de verificación sin límite de intentos.** Seis dígitos con sólo el límite por
  dirección IP se pueden agotar desde muchas direcciones. El código se invalida a los cinco
  fallos y el mensaje dice cuántos quedan.
- **Certificado emitido dos veces a la vez.** Pulsar «obtener certificado» mientras el
  evento de progreso lo emitía solo provocaba un choque con la restricción única y un 500.
  Ahora se devuelve el que ganó la carrera y se retira el PDF sobrante.
- **Aviso de sesión desplazada en el primer acceso.** Se emitía siempre, incluso sin sesión
  previa a la que desplazar.

### Arranque

- `DATABASE_URL` ausente o mal escrita daba `TypeError: Invalid URL` sin indicar de dónde
  venía. Ahora el proceso se detiene diciendo qué falta y qué formato se espera.
- Un fallo al conectar ya no impide arrancar: `/api/health` responde `degraded`, que es lo
  que permite diagnosticar desde fuera.
- Un error dentro de `bootstrap` salía como rechazo de promesa sin atender.

### Herramientas que no funcionaban

- **ESLint de la API**: la configuración mezclaba `require` con `module.exports` en un
  archivo `.mjs`, así que `npm run lint` fallaba al cargarse y no comprobaba nada. Corregido;
  quedaron tres avisos reales, ya resueltos.
- **ESLint del cliente**: `eslint-config-next` estaba declarado pero no había archivo de
  configuración, y `next lint` se quedaba preguntando cómo crearlo. Configurado en formato
  plano. Salieron 25 errores y 199 avisos: los errores están corregidos y se eliminaron 35
  importaciones muertas y 12 variables calculadas y nunca usadas.

### Código que sobraba

| Qué                                                                                                                     | Dónde                                         |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `@nestjs/websockets`, `@nestjs/platform-ws`, `ws`, `@types/ws`                                                          | Declaradas tras migrar a SSE, sin un solo uso |
| `@fastify/static`, `chokidar`, `@types/dompurify`                                                                       | Nunca importadas                              |
| Petición a `/auth/usuarios/por-rol` en cada carga del constructor                                                       | El resultado no se leía en ninguna parte      |
| Tres copias del bucle «borrar archivos ignorando fallos»                                                                | Ahora `StorageService.borrarVarios`           |
| Dos consultas del panel del examinador casi idénticas                                                                   | Selección y proyección compartidas            |
| Estado muerto del constructor (`bloqueBase64`, `savingBlock`, subidas a `/storage/upload` cuyo resultado se descartaba) | Eliminado                                     |

### Comportamiento corregido

- **«Habilitar nuevo intento» reponía todos.** Borraba todas las entregas calificadas del
  alumno, y como el recuento se lleva contando entregas, el alumno recuperaba todos los
  intentos y perdía el historial que el examinador consulta. Ahora se retira sólo el último.
- **Búsqueda con retardo que no se aplicaba.** `useDebounce` se calculaba y se descartaba.
- **Atenuación del cargador imposible.** `fadeOut` nunca cambiaba de valor.
- **Enlaces `<a href="/">` en el acceso.** Recargaban la aplicación entera; ahora son `Link`.

### El constructor de cursos, dividido

1564 líneas en un archivo → una página de 610 que coordina y nueve piezas con un cometido
cada una (`components/`). Lo que permitió el recorte no fue mover marcado, sino advertir que
`bloqueTipo`, `bloqueTitulo`, `bloqueHtml` y `editingBlockId` eran **derivables** del recurso
seleccionado: cuatro estados y dos copias de la misma deducción desaparecieron.

## 11. Verificación contra base de datos real

Con Docker funcionando se levantó MariaDB 11.4, se aplicó el esquema y se sembró. Todo lo
anterior se había comprobado leyendo código; esta pasada lo ejecutó. Aparecieron dos fallos
que ninguna lectura habría delatado.

### El tiempo real no funcionaba en el navegador

El flujo de eventos respondía perfectamente a `curl`, así que parecía correcto. En el
navegador estaba muerto y reintentando cada tres segundos.

La causa: `reply.hijack()` toma el socket y deja fuera a Fastify, de modo que la cabecera
`Access-Control-Allow-Origin` que añade el marco de trabajo nunca llegaba a escribirse. El
navegador rechazaba la conexión y **el servidor no se enteraba**, porque el rechazo ocurre
en el cliente: el registro de la API no mostraba ni un error. Con `curl` no se notaba
porque `curl` no aplica CORS.

Consecuencia real: sin avisos en vivo, sin presencia, sin bloqueo cooperativo de cursos y
sin aviso de sesión desplazada. En cPanel, con la API en `api.dominio` y el cliente en
`dominio`, habría fallado igual.

Corregido escribiendo la cabecera a mano antes de tomar el socket, y sólo si el origen está
en la lista admitida. Esa lista pasó a `common/cors.ts`: tenerla duplicada habría hecho que
añadir un dominio en un sitio rompiera el tiempo real sin aviso.

### La contraseña temporal nunca se cambiaba

El primer acceso devolvía un token directamente en lugar de exigir contraseña propia, pese
a que la cuenta estaba marcada con `usa_clave_defecto`.

La condición comparaba además la contraseña escrita con la clave por defecto de la sede, y
sólo coincidía en ese caso. Las cuentas creadas por un administrador con una clave temporal
elegida por él —y la del arranque inicial, con una clave aleatoria que el seed imprime en
pantalla— entraban directamente y conservaban indefinidamente una contraseña que otra
persona conoce.

La marca `usa_clave_defecto` ya significa exactamente «esta contraseña no la eligió su
dueño», así que basta con mirarla.

### Lo que sí se comportó como se esperaba

| Comprobación                                              | Resultado                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| Cuenta de una sede intentando entrar en la otra           | 401 con el mismo texto que una contraseña incorrecta                       |
| Curso de la otra sede pedido por identificador directo    | 404 en leer, editar y borrar                                               |
| Listados de cursos y de usuarios                          | Cada sede ve sólo lo suyo                                                  |
| Matricular a un alumno de la otra sede                    | 400 explicando el motivo                                                   |
| Matrícula o correo repetidos                              | 409, ya no 500                                                             |
| Nota 79 / 80 / 150 sobre el umbral de 80                  | Suspenso / aprobado / rechazada por fuera de escala                        |
| Descarga de una entrega sin firma o con la firma alterada | 403                                                                        |
| Examinador de la otra sede calificando                    | 404                                                                        |
| Alumno calificándose a sí mismo                           | 403                                                                        |
| Editar contenido de un curso publicado                    | 400 indicando que pase a Borrador                                          |
| Certificado                                               | Emitido solo al aprobar, PDF válido, verificación pública sin datos de más |
| Segundo inicio de sesión                                  | El token anterior queda revocado al instante                               |
| Desactivar una cuenta                                     | Su token deja de valer en la siguiente petición                            |

Registro de la API durante todo el recorrido: **0 errores y 0 peticiones lentas**. Consola
del navegador en una pestaña limpia: **sin mensajes**.

## 12. Campos que la API nunca devolvió

Al dividir las pantallas grandes y ponerles tipos aparecieron **cinco lecturas de campos
inexistentes**. Ninguna daba error: al llegar la respuesta como `any`, leer una propiedad
que no está devuelve `undefined` y la interfaz simplemente hace lo contrario de lo previsto,
en silencio.

| Se leía                                   | La API devuelve            | Qué estaba roto                                                                                                                      |
| ----------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `entrega.archivo_servidor`                | `archivo_url`              | **El examinador no podía descargar lo que calificaba.** El botón no se dibujaba nunca y el panel decía siempre «Sin archivo adjunto» |
| `progreso.desbloqueados_por_tiempo`       | `desbloqueados_por_espera` | El desbloqueo por espera no se aplicaba: un alumno con una tarea sin calificar quedaba parado indefinidamente                        |
| `progreso.tareas_pendientes_calificacion` | `tareas_pendientes`        | El aviso de «tienes tareas esperando calificación» **no se mostró nunca**                                                            |
| `tarea.tarea_titulo`                      | `titulo`                   | Y si se hubiera mostrado, habría salido sin nombres                                                                                  |
| `finalizacion.puede_generar_certificado`  | `puede_certificarse`       | La pantalla de «curso ya finalizado» tampoco aparecía                                                                                |

Los cinco se corrigieron y se comprobaron con el campus en marcha: la descarga vuelve a
aparecer con su URL firmada, el visor retoma por la tarea pendiente en vez de por una ya
aprobada, y el aviso de tareas sin calificar sale con su nombre.

La causa de fondo era que las respuestas se guardaban en estado `any`. Tipar esas cinco
variables bastó para que el compilador señalara cuatro de los cinco; el quinto lo delató
la propia ejecución.

Se aprovechó para dejar de tragarse los errores: `fetchProgreso` los mandaba a la consola
del navegador, donde nadie los ve. Ahora se muestran.

## 13. Pantallas divididas

| Pantalla                  | Antes | Después        |
| ------------------------- | ----- | -------------- |
| Constructor de cursos     | 1564  | 610 + 9 piezas |
| Calificación manual       | 1101  | 225 + 4 piezas |
| Visor de curso del alumno | 1027  | 761 + 2 piezas |

En los tres casos lo que permitió el recorte no fue mover marcado de sitio, sino separar lo
que se puede razonar solo:

- `constructor-cursos/components/bloques.ts` — la marca `[QUIZ]` y los tipos de bloque.
- `examiner/calificaciones/components/agrupacion.ts` — agrupar, contar y filtrar entregas.
- `cursos/[curso_id]/components/recorrido.ts` — las reglas de «no saltarse contenido».

Son funciones puras: se leen sin marcado alrededor y se pueden comprobar sin montar la
pantalla. La regla de avance, que es la que sostiene el valor del certificado, estaba antes
escrita dos veces —una para pintar el temario y otra para decidir por dónde retomar— y ahora
es una sola.

## 14. Las gráficas no dibujaban

La queja era «no se entienden por los colores». La causa resultó ser otra: **las gráficas
no se estaban dibujando**.

Cada pantalla cargaba las piezas de Recharts por separado con `next/dynamic`:

```ts
const Pie = dynamic(() => import('recharts').then((m) => m.Pie), { ssr: false });
const Cell = dynamic(() => import('recharts').then((m) => m.Cell), { ssr: false });
```

Recharts reconoce a sus hijos **por el tipo del componente**, y el envoltorio que devuelve
`dynamic()` no coincide con ninguno. El efecto medido en el navegador:

| Pantalla                | Qué salía                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------- |
| Panel de administración | El anillo se dibujaba en gris `#808080`, el color por defecto, ignorando los `<Cell>` |
| Calificación manual     | La tarta no dibujaba **nada**: el grupo del sector quedaba vacío                      |
| Monitoreo y pruebas     | Lo mismo, barras incluidas                                                            |

A eso se sumaba que Recharts 3 deja el trazo vacío si el contenedor se mide después del
primer render —justo lo que pasa con la carga diferida—, y que una tarta de una sola
porción con `paddingAngle` se queda sin dibujar.

### Cómo quedó

`components/ui/graficos/` con tres archivos:

- `paleta.ts` — el color **significa** algo: verde aprobado, ámbar pendiente, rojo
  suspenso. Estaba escrito a mano en cuatro pantallas con tonos distintos para lo mismo.
- `Graficos.tsx` — importa Recharts de forma normal y expone seis gráficas con nombre
  (`Anillo`, `BarrasPorTramo`, `BarrasAgrupadas`, `BarrasSegunUmbral`, `AreasDeActividad`,
  `LineaDeAvance`). Sin animación de entrada, que es lo que hace que se dibujen.
- `index.ts` — aquí sí se difiere, pero el **módulo entero**. Dentro, los componentes son
  los de verdad.

Comprobado en ejecución: los sectores salen con su color (`#6366f1`, `#f59e0b`, `#10b981`)
en las cuatro pantallas, y la consola queda sin errores.

### Un intento descartado

Se probó a envolver cada gráfica en un lienzo que esperara a tener tamaño antes de montar,
pensando que Recharts no se recuperaba al crecer el hueco. Al medirlo resultó que el
`ResizeObserver` no disparaba en el entorno de prueba: el problema era que la ventana no
estaba pintando, no la aplicación. El lienzo se retiró, porque habría dejado sin gráfica
allí donde ese observador va limitado.

### De paso

- **La campana de notas de «Pruebas» mentía.** Clasificaba con `< 3` y `< 4` —de la escala
  0–5 anterior— mientras las etiquetas decían 60 y 80. Un alumno con 45 puntos aparecía
  como aprobado.
- El rótulo «Promedio Global (0-5)» seguía en pantalla.
- Tres notas se pintaban con `text-emerald-600` sin variante para modo noche, donde ese
  verde apenas se lee. Ahora usan `colorDeNota`, que ya existía sin usarse.

## 15. Avisos al usuario

**31 bloques `catch` terminaban en `console.error` y nada más.** El usuario veía una
pantalla vacía o creía que algo se había guardado.

La regla quedó escrita en `AlertContext`, que es donde la busca quien vaya a usarla:

| Situación                       | Herramienta         | Por qué                                  |
| ------------------------------- | ------------------- | ---------------------------------------- |
| Algo salió bien                 | `showToast.success` | No interrumpe                            |
| No cargó la pantalla            | `showToast.error`   | El hueco se nota; no hace falta bloquear |
| Falló lo que el usuario pidió   | `showAlert.error`   | Creyó que se guardó: hay que detenerlo   |
| Hay que decidir antes de seguir | `showConfirm`       | Borrados y acciones sin vuelta atrás     |

Se aplicó en los 31 sitios. Los que callan a propósito —un avisador complementario, un
suscriptor de tiempo real— llevan ahora escrito por qué.

## 16. Correo

- **Las variables de plantilla se insertaban sin escapar.** El comentario que escribe un
  examinador entraba tal cual en el HTML del correo: `<script>…</script>` llegaba íntegro
  al mensaje. Ahora se escapan, con una excepción declarada en un solo sitio para los dos
  fragmentos que el propio servicio compone como marcado.
- **La llamada a Brevo no tenía tiempo límite.** Un proveedor que no responde dejaba la
  petición colgada y los reintentos no llegaban a producirse.
- Se añadió un **buzón local** a `docker compose` (Mailpit, `localhost:8025`) para poder
  recorrer los flujos de correo sin credenciales de proveedor. El alta completa —código de
  verificación, solicitud, aviso al administrador, aprobación, bienvenida— se comprobó de
  punta a punta.

## 17. Basura retirada

| Qué                                                                                                        | Dónde                                                                          |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `Badge.tsx`, `ProgressBar.tsx`                                                                             | 93 líneas de componentes que nadie usaba                                       |
| `generar-certificado.dto.ts`, `heartbeat.dto.ts`                                                           | Duplicados de `EmitirCertificadoDto` y `LatidoDto`, sobrantes de un renombrado |
| `MENSAJE_POR_REVOCACION`                                                                                   | Repetía el mapa que ya tiene `RealtimeContext`                                 |
| `esLimiteDePeticiones`, `umbralAprobacion`, `PAIS_POR_DEFECTO`, `useStableCallback`, `CurrentUserOptional` | Exportaciones sin un solo uso                                                  |
| `hexAHsl`                                                                                                  | Dejó de exportarse: sólo se usa dentro de su módulo                            |

## 18. El alumno no podía empezar ningún cuestionario

Al intentar crear un cuestionario de prueba apareció el fallo más grave de toda la
auditoría, y llevaba oculto porque nadie había ejecutado ese camino.

El cliente crea su instancia de axios con `Content-Type: application/json` por defecto.
Dos llamadas no llevan cuerpo:

```ts
api.post(`/cursos/quiz/${recurso_guid}/iniciar`); // empezar un cuestionario
api.post(`/realtime/cursos/${cursoGuid}/bloqueo`); // tomar el aviso de edición
```

Axios **conserva la cabecera** aunque no haya datos, y Fastify rechaza entonces la petición
con `400 Body cannot be empty when content-type is set to 'application/json'`.

Consecuencias reales:

| Llamada                         | Qué estaba roto                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `quiz/:guid/iniciar`            | **Ningún alumno podía empezar un cuestionario.** El botón «Comenzar intento» devolvía un error |
| `realtime/cursos/:guid/bloqueo` | El aviso de «curso en edición» nunca se tomaba: dos editores podían pisarse sin enterarse      |

Comprobado reproduciendo la instancia exacta del cliente contra la API en marcha:

```
cabecera enviada: application/json
RESULTADO: FALLA → 400 Body cannot be empty
```

Corregido en el interceptor de peticiones, que es donde no puede volver a repetirse: si no
hay datos que enviar, la cabecera no se anuncia. Tras el arreglo, la misma prueba devuelve
el intento con sus dos preguntas.

### Lo que permitió encontrarlo

Crear un cuestionario real y resolverlo dos veces. De paso quedó verificado que la
analítica calcula sobre la **mejor nota** de cada alumno y no sobre cada intento: con un 50
y un 100 de la misma persona, la pantalla muestra «1 estudiante evaluado, promedio 100.0»,
no «2 intentos, promedio 75».

También se vio funcionar una protección que no conocía: el curso no se deja pasar a
Borrador mientras alguien tiene un cuestionario abierto.

## 19. Mantenimiento programado

`scheduler.service.ts` es el único sitio que borra archivos sin copia de seguridad:
entregas de alumnos, certificados emitidos y firmas.

- **Se añadió una red de seguridad.** Si la base no devuelve **ninguna** referencia a
  archivos y en disco hay más de unos pocos, la limpieza se cancela y lo registra. Una
  consulta que falle en silencio o una base recién restaurada habrían borrado todo.
- **Se quitó una carrera en el desbloqueo por espera.** Consultaba y luego creaba el
  registro de progreso; si el alumno completaba el recurso en ese instante, la colisión
  abortaba la tarea entera y dejaba sin desbloquear a los siguientes.
- **Ocho pruebas** cubren la limpieza: qué borra, qué respeta, el margen de gracia para lo
  recién subido, las referencias de las seis tablas, el caso remoto y la red de seguridad.
  Comprobado por mutación: al quitar la red, la prueba correspondiente falla.

## 20. Monitoreo y pruebas

Las dos pantallas que quedaban sin dividir y donde se concentraban los `any`.

- **Monitoreo** pasó a usar `AlumnoMonitorizado`, `AvanceDeCurso` y `AvanceDeModulo`, que
  reflejan lo que devuelve `/dashboards/monitoreo`. Sin `any` y sin campos fantasma.
- **Pruebas** siguió el camino del resto: su lógica vive ahora en
  `components/resultados.ts`, con la distinción que más importa escrita en el propio
  módulo —un alumno deja **varios intentos** y lo que cuenta para todas las cifras es su
  **mejor nota**, no cada intento—. Confundirlo infla el total y hunde el promedio de quien
  repitió. 990 → 646 líneas más un módulo de 247.
- `extractNota`, que duplicaba lo que ya hacía el módulo, desapareció.

Avisos del cliente: 80 → 46. Los que quedan son 18 avisos de `<img>` —usar `next/image`
cambiaría el comportamiento de carga con URLs firmadas— y `any` sueltos en pantallas
pequeñas.

## 21. Las tres pantallas que faltaban

Revisadas y comprobadas en ejecución: `verificar`, `legal` y `admin/tema`. Las tres están
bien construidas y sin errores en consola.

- **`verificar`** funciona sin sesión, como debe: con un código real muestra titular,
  programa, fecha, duración, calificación y el código; con uno inventado, «Certificado no
  encontrado». Único arreglo: decía «1 horas».
- **`legal`** lee los textos de la configuración con respaldos razonables y no hace ninguna
  llamada autenticada.
- **`admin/tema`** está correctamente acotada por sede: «Identidad visual de la sede de
  Colombia. Cada sede tiene su propia marca y los cambios sólo afectan a esta».

## 22. La pantalla de cuentas

`admin/usuarios/page.tsx` era la última pantalla grande: 889 líneas con la lista, tres
ventanas y toda la lógica mezclada. Quedó en 227 más siete piezas con nombre propio:

| Pieza                 | Qué hace                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `cuentas.ts`          | Tipos, vocabulario de cada rol y los dos cálculos comprobables: «cuándo entró» y el filtro |
| `ListaDeCuentas`      | Pestañas, buscador, tabla de escritorio y tarjetas de móvil                                |
| `FichaDeUsuario`      | Los datos de una cuenta y sus cursos                                                       |
| `AltaDeAdministrador` | El alta directa, con su propio formulario                                                  |
| `TraspasoDeCursos`    | A quién pasan los cursos de quien se elimina                                               |
| `AvatarDeCuenta`      | Foto o iniciales sobre el color del rol                                                    |
| `UltimoAcceso`        | «En línea», «sin acceso» o la fecha relativa                                               |

De paso: el contador de cada pestaña recorría la lista tres veces, el color del rol estaba
escrito en cuatro sitios —y en la ficha el administrador salía verde en vez de rojo—, y el
tipo `Usuario` estaba duplicado a mano en la pantalla pudiendo usar el de `types/models`.

Comprobado sobre el campus en marcha: las tres pestañas, el buscador con y sin resultados,
la ficha de un administrador —con sus cuentas aprobadas—, la de una alumna —con
«Matriculado»—, el alta con su validación, el aviso al intentar borrarse a uno mismo y el
diálogo de confirmación de borrado.

## 23. Las imágenes y los enlaces no llegaban al alumno

El hallazgo más grande de la auditoría, y estaba en el camino más visible del producto:
**dos de los cinco tipos de bloque del constructor no funcionaban**.

### Lo que ocurría

1. **No se podían crear.** El constructor enviaba `url_archivo` al crear el bloque, pero
   `CreateBloqueDto` sólo admitía `tipo`, `titulo` y `contenido_html`. Con la validación
   estricta activada, la API respondía `400 property url_archivo should not exist`. El
   error se registraba en la consola del navegador y **no se enseñaba**: el examinador
   pulsaba «Confirmar Imagen», no pasaba nada y la ventana se quedaba abierta.

2. **Aunque se hubieran creado, no se veían.** La pantalla del alumno trataba todo recurso
   `ENLACE` como un vídeo de YouTube: si la dirección no era de YouTube, no pintaba nada.
   Una imagen no aparecía y una página externa no se podía abrir, pese a que el propio
   constructor prometía «un enlace clickeable que abrirá una pestaña nueva».

3. **Editar un enlace lo convertía en una imagen.** `openAppEdit` mandaba todo `ENLACE` a
   la ventana de subir imagen; al guardar, el enlace se perdía.

4. **La vista previa mentía.** Enseñaba «Video de YouTube no configurado» para cualquier
   imagen o enlace que el examinador acabara de poner.

### Cómo quedó

Las convenciones de un recurso viven ahora en `lib/recursos.ts`, que es de donde leen el
constructor, su vista previa, el temario y la pantalla del alumno. `destinoDelEnlace()`
responde a la única pregunta que importa —¿esto es una imagen, un vídeo o una página?— y
cada pantalla pinta lo que corresponde. La API admite `url_archivo` al crear, igual que ya
lo admitía al actualizar.

Comprobado de punta a punta con el campus en marcha: creado un bloque de cada clase, la
alumna ve la imagen (`<img>`), el enlace (`<a target="_blank">` a su destino) y el vídeo
(`<lite-youtube videoid=…>`), y cada uno con su icono y su rótulo. Después, desde la
interfaz: crear un enlace, editarlo, comprobar que se guarda y borrarlo.

También se comprobó lo contrario: con el curso publicado, guardar un bloque ahora enseña
«El curso debe estar en Borrador para modificar su contenido», en lugar de fallar en
silencio.

### De paso, en la misma pantalla

- El editor de módulo dejaba un cargador eterno si el curso no cargaba o el módulo ya no
  existía. Ahora distingue los dos casos y ofrece volver.
- «Intentos Máximos Permitidos» era un campo que **no estaba conectado a nada**: se
  escribía y se perdía. Los intentos se configuran en el editor del cuestionario, y eso es
  lo que dice ahora el aviso.
- Los veintidós `any` de la pantalla desaparecieron al usar `Curso`, `Modulo` y `Recurso`.
- `urlExterna` estaba duplicada carácter por carácter en dos módulos.
- `sanitizeHTML` exigía una cadena y reventaba en el servidor con un contenido nulo;
  ahora los acepta, y su documentación está en español como el resto.

## 24. Mensajería

Al revisar `chat.service.ts` línea a línea aparecieron cuatro problemas, tres de ellos con
efecto visible.

### La búsqueda de contactos enseñaba el directorio entero

La consulta escribía **dos veces la clave `OR`** en el mismo objeto:

```ts
where: {
  pais, activo, guid: { not: user.sub },
  OR: [ /* comparte curso conmigo */ ],
  ...(termino ? { OR: [ /* el nombre contiene el texto */ ] } : {}),
}
```

En JavaScript la segunda clave pisa a la primera, así que **en cuanto se escribía una
letra, la restricción de compartir curso desaparecía**. Comprobado con la cuenta de una
alumna: sin texto veía 1 persona —la de su curso—; escribiendo «a» aparecía además un
examinador con el que no comparte nada, con su correo incluido.

Corregido metiendo las dos condiciones en un `AND`. Tras el arreglo, la misma prueba
devuelve una sola persona con cualquier término.

### La conversación se quedaba anclada en su principio

`getConversacion` pedía 200 mensajes **ascendentes**, es decir los 200 **primeros**. En una
conversación larga el historial se congelaba en sus inicios y los mensajes nuevos no
aparecían nunca. Ahora se piden los más recientes y se devuelven en orden de lectura.

### La lista de contactos se traía todo el historial

Para enseñar la vista previa de cada conversación se descargaban **todos** los mensajes
cruzados con todos los contactos y se descartaban casi todos. Ahora se agrupa por pareja
pidiendo el identificador más alto —que por ser autoincremental es el más reciente— y sólo
se leen esos.

### Abrir una conversación rompía la pantalla

La pantalla declaraba un objeto `remitente` anidado que **la API nunca envía**: manda
`remitente_guid` y `es_mio`. El resultado era

```
TypeError: Cannot read properties of undefined (reading 'guid')
```

y la página entera caía en «Application error» al abrir cualquier conversación con
mensajes. Lo mismo ocurría con `u.cursos[0]` en el buscador, otra lista inexistente, al
pulsar «Solicitar».

Los cuatro tipos locales se reescribieron con lo que la API devuelve de verdad. Y ya que
la pantalla no tiene por qué saber por qué curso se conocen dos personas, **el curso pasó a
resolverlo el servidor**: `curso_guid` es opcional y, si no viene, se busca el que
comparten. Un parámetro menos que la interfaz puede equivocar.

Comprobado con el campus en marcha: la conversación se abre, el mensaje se envía y se ve,
pedir contacto sin indicar curso responde 201, y pedirlo con alguien sin curso compartido
sigue respondiendo 403.

## 25. Tiempo de estudio

El visor del curso manda un latido al entrar y luego cada minuto. El servidor sumaba **una
cantidad fija** por latido, con un comentario que decía «debe coincidir con el cliente».

Esa cantidad fija tenía dos consecuencias:

- **Dos pestañas abiertas contaban el doble.** Cada una latía por su cuenta.
- **Cada recarga regalaba un minuto**, porque el primer latido es inmediato.

Ahora se suma el **tiempo realmente transcurrido** desde el latido anterior, con tope en el
corte de sesión. Desaparece de paso el acoplamiento entre los dos repositorios: el servidor
ya no necesita saber cada cuánto late el cliente.

**Seis pruebas** cubren el cálculo —primer latido, minuto completo, dos pestañas, diez
recargas seguidas, hueco largo y reloj hacia atrás—. Comprobado por mutación: al volver a
la cantidad fija fallan tres.

## 26. Revocación de tokens

Al purgar las revocaciones caducadas se borraban de la caché **una a una**. Un usuario con
dos revocaciones —por ejemplo, cambio de contraseña y, horas después, cuenta desactivada—
perdía la segunda en cuanto caducaba la primera, y sus tokens de ese tramo volvían a
aceptarse hasta el siguiente reinicio.

Ahora la caché se reconstruye entera a partir de lo que queda en la base. Es además menos
código: el borrado selectivo desaparece.

**Cinco pruebas** cubren las dos granularidades y el caso de las dos revocaciones.
Comprobado por mutación: al volver al borrado selectivo falla la prueba que lo describe.

## 27. Cuestionarios y duplicación de tipos

- **«Intento» se definía de dos maneras.** Al empezar contaba «toda entrega que no sea
  borrador»; al informar al alumno contaba sólo «calificada». Las dos definiciones viven
  ahora en una función con nombre, para que la pantalla no pueda prometer intentos que el
  servidor no va a conceder.
- **La misma fila se leía tres veces** por petición al corregir un intento. El título viaja
  con el cuestionario y una consulta desaparece.
- **Las preguntas estaban escritas tres veces en el cliente** —editor, reproductor y
  servidor—, con nombres distintos y en dos idiomas. Ahora están en `types/models.ts` con
  la distinción que importa hecha explícita: `PreguntaConRespuestas` lleva cuál es la
  correcta y **sólo puede llegar al editor**; `PreguntaDeCuestionario` es la que ve el
  alumno. Pedir la forma equivocada en una pantalla de alumno es ahora un error de
  compilación.
- Lo mismo con `EstadoDelCuestionario`, `Notificacion`, `PlantillaDeCorreo` y
  `EventoDeCorreo`: existían en el catálogo común y cada pantalla se había hecho su propia
  copia. Las de correo ya se habían desincronizado entre la página y su editor.

## 28. El catálogo de eventos en tiempo real

Los nombres de los eventos están escritos dos veces, en la API y en el cliente, con un
comentario que pide mantenerlos iguales. No hay paquete compartido entre las dos
aplicaciones y montarlo por un fichero de literales costaría más de lo que resuelve, así
que **una prueba compara las dos listas**. Si se separan, falla el build en lugar de fallar
un aviso que nunca llega a la pantalla.

## 29. El cliente ya tiene pruebas

Era lo que faltaba y lo que explica buena parte de lo encontrado en esta auditoría: la API
tenía Jest y el cliente no tenía **dónde ejecutar nada**.

Se montó el mismo arranque que usa la API —Jest con `ts-jest`, una configuración de quince
líneas y el mismo alias `@/`— y se cubrieron los módulos puros, que es donde viven las
decisiones que se equivocan en silencio:

| Módulo                                      | Qué protege                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| `lib/recursos.ts`                           | Qué hay detrás de un enlace: imagen, vídeo o página. El fallo de la sección 23 |
| `lib/calificacion.ts`                       | La escala 0–100 y el umbral 80, incluidas las notas que llegan como cadena     |
| `cursos/[curso_id]/components/recorrido.ts` | Que no se salte contenido: lo que sostiene el certificado                      |
| `admin/usuarios/components/cuentas.ts`      | Búsqueda por pestaña y «cuándo entró por última vez»                           |

**61 pruebas en medio segundo.** Comprobadas por mutación: al abrir un módulo con que
_alguno_ de los recursos anteriores esté hecho —en vez de todos— y al olvidar que una
imagen puede venir subida y no sólo incrustada, fallan cinco.

No cubren pantallas: para eso se sigue ejecutando la aplicación. Cubren las reglas, que es
donde una prueba cuesta segundos y una comprobación a mano cuesta minutos.

## 30. La tarjeta de cifra del panel

`StatCard` cuenta desde cero hasta el número con una animación. Dos detalles:

- **Truncaba los decimales.** `Math.floor` convertía una calificación media de 67,5 en
  «67 / 100». La tarjeta lleva la escala al lado, así que lo que enseña es una nota, no un
  recuento: ahora conserva el decimal y el último fotograma asigna la cifra exacta.
- **No atendía a `prefers-reduced-motion`.** Quien pide menos movimiento ve la cifra
  directamente.

De paso desaparece el `as any` del envoltorio.

Nota de comprobación: el panel no se pudo mirar con la animación en marcha porque el
navegador de pruebas no pinta la página y `requestAnimationFrame` no llega a ejecutarse
—lo que explica, por cierto, que ahí las cifras se vean en cero—. El cálculo del valor
final sí está comprobado.

## 31. Vaciar una conversación es cosa de quien la vacía

Borrar una conversación la borraba **para las dos partes**: cualquiera podía eliminar el
historial de otro sin que se enterase. Ahora se guarda un punto de corte por pareja, de
modo que quien la vacía deja de verla y la otra persona conserva la suya. Los mensajes
posteriores vuelven a aparecer, que es lo que se espera al seguir hablando.

Se guarda un corte por pareja en lugar de una marca por mensaje: vaciar una conversación
larga es una sola escritura, no una por mensaje. Cuando las dos partes han ocultado los
mismos mensajes ya no queda nadie a quien enseñárselos, y el mantenimiento nocturno los
borra de verdad.

El aviso de la interfaz dice ahora lo que hace: «Se eliminará de tu bandeja… La otra
persona conservará su copia.»

**Cinco pruebas** lo fijan, incluida la que importa: que la otra parte no pierda nada.

## 32. «Un administrador cerró tu sesión» cuando nadie lo había hecho

Al iniciar sesión en otro dispositivo, la sesión anterior recibía _«Tu acceso fue retirado
— Un administrador cerró tu sesión o dio de baja tu cuenta»_. Alarmante y falso.

La causa era el orden de las comprobaciones: al entrar de nuevo, la sesión anterior queda
también en la lista de revocadas, y esa lista se consultaba **antes** que la comprobación
de sesión desplazada. La comprobación que existía precisamente para explicarlo era
inalcanzable.

Ahora el orden va de lo más concreto a lo más genérico —cuenta borrada, cuenta desactivada,
sesión desplazada, sesión revocada— y el usuario lee «iniciaste sesión en otro
dispositivo». **Cinco pruebas** fijan ese orden, porque es el tipo de cosa que un
reordenado inocente vuelve a romper.

## 33. Archivos: la memoria era el techo

La pregunta era si el campus aguanta varias subidas y descargas a la vez. La respuesta,
medida contra la API en marcha, era que no: **cada archivo se materializaba entero en
memoria**, tanto al subir como al descargar.

| Escenario                                | Antes                  | Ahora        |
| ---------------------------------------- | ---------------------- | ------------ |
| 12 descargas de 20 MB                    | **+241 MB** de RAM     | **+4,7 MB**  |
| 40 descargas de 20 MB                    | (no se llegó a probar) | **+37,5 MB** |
| 8 subidas de 20 MB rechazadas por tamaño | **+193 MB**            | **+27 MB**   |

Con material de 50 MB y una docena de alumnos abriéndolo a la vez, el proceso pasaba de
600 MB. En un alojamiento compartido eso no es lentitud: es el proceso reiniciándose.

### Qué se cambió y qué no

Lo que se planteaba —URLs firmadas con subida particionada— **ya está a medias en el
proyecto**: las descargas reservadas viajan con firma y caducidad desde la auditoría
anterior, y hay soporte de Cloudflare R2. Pero el despliegue real es cPanel con disco
local, donde no hay a quién delegar la transferencia, y el troceado en partes resuelve
archivos de gigabytes y reanudación, no los 10 MB que admite la sede. Habría sido
maquinaria nueva —sesiones de subida, seguimiento de partes, reensamblado, limpieza de
restos— para un problema que el proyecto no tiene.

Lo que sí resolvía el problema medido era **dejar de acumular**:

- **Descargas**: `StorageService.abrir()` devuelve un flujo en lugar del contenido. Cada
  descarga ocupa el tamaño de un trozo, no el del archivo, y de paso se declara
  `Content-Length` para que el navegador pueda enseñar el progreso. `leer()` sigue ahí para
  lo que de verdad necesita los bytes, como incrustar el logotipo en un certificado.
- **Subidas**: se escriben directamente en un fichero temporal mientras llegan, usando
  `saveRequestFiles()` del plugin que ya se usaba —no hizo falta inventar la gestión de
  temporales— y de ahí pasan a su destino sin volver a memoria. La comprobación de que el
  contenido corresponde a la extensión ahora lee sólo la cabecera del fichero.

### Que no se pierda nada por el camino

- **Escritura atómica.** Copiar no es atómico: si el proceso se corta a media copia,
  quedaba un archivo truncado con nombre definitivo. Ahora se copia a un nombre provisional
  y se renombra al final, que dentro del mismo directorio sí es atómico.
- **Temporales huérfanos.** Si el navegador corta la subida, no hay respuesta que enviar y
  el plugin nunca ejecuta su limpieza: cada subida abortada dejaba un fichero en el
  temporal del sistema para siempre. Se añadió el enganche `onRequestAbort`, que es el
  único aviso que da Fastify en ese caso. Comprobado: **cinco subidas abortadas, cero
  restos**.

Comprobado además que los archivos llegan completos: seis subidas simultáneas de 3 MB con
contenidos distintos, todas descargadas después con el mismo SHA-256 y sin mezclarse; y un
ejecutable renombrado a `.png` sigue rechazándose.

## 34. El peso máximo, comprobado en los dos lados

El tope de la sede (`max_archivo_mb`) existía y el servidor lo aplicaba, pero en el
navegador **sólo lo comprobaba la entrega del alumno**. Subir un logotipo, una portada, una
imagen de material o una foto de perfil consistía en enviar el archivo entero y esperar a
que el servidor lo rechazara.

Ahora la comprobación vive en `subirArchivo()`, que es por donde pasan todas las subidas
del cliente: ninguna pantalla tiene que acordarse. El límite lo pone `ConfigContext` al
cargar la configuración de la sede. El servidor lo sigue comprobando —es el único sitio
donde la comprobación es vinculante—; esto sólo evita el viaje.

De paso, dos incoherencias:

- **El aviso se contradecía.** Un archivo que pasa el tope por unos bytes producía «pesa
  10.0 MB y el máximo permitido es 10.0 MB». El peso del aviso se redondea ahora hacia
  arriba, con el mismo criterio en el cliente y en el servidor: «pesa 10.1 MB y el máximo
  permitido es 10.0 MB».
- **Los dos lados no coincidían en el respaldo.** Sin tope propio de la actividad, el
  navegador usaba un 5 fijo y el servidor el de la sede: se rechazaban archivos que la API
  habría aceptado. Ahora ambos usan el de la sede.

## 35. Borrado de entregas al certificar

Funciona y está bien planteado: al emitir el certificado se retiran los archivos de las
entregas de ese alumno **en ese curso**, conservando la calificación, el comentario y el
propio certificado. La fila se marca antes de borrar el archivo, de modo que un fallo del
almacenamiento no deja la base apuntando a algo que ya no está. Y las dos pantallas lo
explican en lugar de enseñar un enlace roto: «El archivo se retiró al emitir el
certificado.»

El fallo estaba en la **repesca semanal**. Buscaba «certificados de alumnos que tengan
alguna entrega sin purgar», sin exigir que fuera del curso de ese certificado: un alumno
certificado en un curso y con una entrega viva en otro aparecía cada semana sin nada que
hacer, y con el tope de filas esos casos acababan desplazando a los que sí tocaba atender.
Ahora se parte de las entregas que conservan archivo y se cruzan con los certificados que
existen, que es la dirección correcta.

## 36. Pantallas de carga

El indicador de carga parecía roto: aparecía un «0%» y desaparecía. Medido, el motivo es
que **las pantallas cargan en 11–29 ms**; el indicador se montaba y se retiraba en un par
de fotogramas.

Retrasar el contenido para que la barra se llene sería hacer la aplicación más lenta a
propósito. Lo que se hizo:

- **Nada durante los primeros 200 ms.** Una carga de 20 ms ya no enseña ningún indicador:
  el contenido aparece y punto. Comprobado: cero apariciones en medio segundo de muestreo.
- **Cuando de verdad hay espera, la barra avanza y se ve.** Aparece a los 300 ms y sube
  `0 → 7 → 19 → 38 → 51 → 70 → 75` en el primer segundo, luego frena. Medido sobre una
  carga ralentizada a propósito.
- **Nunca llega a 100.** La barra la retira quien termina de cargar; mostrar «100%»
  mientras se sigue esperando es justo lo que hace pensar que algo se colgó.
- **Un reloj de 100 ms en lugar de un fotograma cada 16 ms.** La diferencia no se aprecia
  —la transición CSS suaviza el movimiento—, evita sesenta renders por segundo y funciona
  en una pestaña de segundo plano, donde `requestAnimationFrame` se detiene y la cifra se
  quedaba clavada en cero.
- **Respeta «reducir movimiento»** del sistema, y el bloque anuncia su estado a los
  lectores de pantalla.

Seis pruebas cubren la curva: que empiece en cero, que avance deprisa al principio, que
frene sin detenerse, que **nunca** llegue a 100, que no retroceda y que aguante un reloj
que salte. Ninguna pantalla tuvo que cambiar: son 31 usos en 27 ficheros y todo el
comportamiento vive dentro del componente.

## 37. La pantalla de certificados no cargaba

`Cannot read properties of undefined (reading 'titulo')`: la pantalla de certificados del
alumno **caía entera**. Esperaba la fila de la base de datos —`curso.titulo`,
`tiempo_total_horas`, `archivo_pdf`— y la API devuelve otra cosa: `curso_titulo`, `horas`.

Lo curioso es que el tipo correcto ya estaba escrito en `types/models.ts`; la pantalla se
había hecho su propia copia con los nombres de las columnas. Es el mismo patrón que el de
la mensajería, y la corrección también: usar el compartido y borrar la copia.

De paso, la API no enviaba la fecha de inscripción que el detalle intentaba mostrar. Ahora
la envía.

## 38. Qué horas acredita un certificado

El diploma imprimía «Duración» con esta fórmula:

```ts
tiempoHoras: segundosActivos > 0 ? horasReales : (curso.duracion_horas ?? 1);
```

Es decir: **el tiempo que el alumno estuvo con la pantalla abierta**. Quien iba rápido
recibía un certificado de «0.4 horas». Y como `duracion_horas` **no tenía ningún campo en
la interfaz**, la otra rama nunca se usaba.

Son dos conceptos distintos y sólo uno se certifica:

|                           | Qué es                            | Dónde vive                           |
| ------------------------- | --------------------------------- | ------------------------------------ |
| **Duración del programa** | Las horas que acredita el diploma | `lms_cursos.duracion_horas`          |
| **Tiempo del alumno**     | Lo que estuvo dentro de verdad    | `lms_certificados.tiempo_activo_seg` |

Ahora el certificado acredita las horas del programa, el tiempo real se guarda aparte —le
sirve al examinador para seguir el avance— y la ficha del curso tiene el campo para
declararlas, con el aviso de qué significa. Si un curso no las declara, el certificado
acredita una hora y queda una advertencia en el registro para que alguien lo configure.

## 39. Repetir el mismo curso

Una persona puede cometer una segunda infracción años después y tener que repetir la misma
capacitación. El sistema no lo contemplaba:

- Al rematricularla, **su avance anterior seguía ahí**: el curso aparecía terminado sin
  hacer nada.
- `lms_certificados` tenía una restricción única por alumno y curso, así que **no podía
  emitirse un segundo certificado**.

### La decisión que había que tomar

La idea de partida era borrar el certificado anterior y empezar limpio. No se hizo, y el
motivo es concreto: **el código de verificación es público**. Existe una página `/verificar`
donde cualquiera comprueba un diploma por su código, y ese código puede estar impreso en un
documento ya entregado a una empresa o a una autoridad. Borrarlo haría que una formación
que sí ocurrió pasara a responder «no existe».

Lo que hacen las certificaciones reales es otra cosa: **no se borran, caducan**. Y eso
encaja con la vigencia que una capacitación de este tipo tiene de todos modos.

### Cómo quedó

Una sola regla, fácil de contar: **la vuelta actual del alumno empieza en su
`fecha_matricula`**, que se renueva al rematricular.

- **Rematricular reinicia la vuelta… sólo a quien ya se certificó.** Aquí estuvo el
  segundo error, y era peligroso: la primera versión borraba el avance **siempre**, de modo
  que readmitir a alguien que se había quedado a medias —a veces por una baja
  administrativa, a veces por error— le costaba todo el trabajo hecho. Ahora se distingue
  por una sola cosa, si llegó a certificarse:

  | Situación                                    | Al readmitirlo                                                |
  | -------------------------------------------- | ------------------------------------------------------------- |
  | No se certificó: se quedó a medias           | **Retoma donde lo dejó**; su avance y sus entregas siguen ahí |
  | Ya se certificó: vuelve a necesitar el curso | **Empieza de cero**; los cuestionarios recuperan sus intentos |

  El reinicio va en una transacción: o queda la matrícula al día con el recorrido que le
  corresponde, o no cambia nada.

- **Cada vuelta emite su propio certificado**, numerado (`intento`). El anterior se queda
  como histórico y su código sigue verificándose.
- **Cada sede puede declarar una vigencia** en meses, y **lo recomendado es no ponerla**.
  Un certificado acredita que esa persona completó la formación en una fecha, y ese hecho
  no caduca: si lo presenta medio año después debe seguir sirviendo. Con un plazo de un
  mes, por ejemplo, quien lo presentara a los 45 días lo vería marcado como vencido. El
  campo existe para la sede que tenga una norma de renovación periódica, y el panel lo
  explica con esas palabras para que nadie lo configure por inercia.

  Volver a inscribir a alguien no depende de la vigencia: se puede hacer cuando haga falta.

**Cuatro pruebas más** fijan las dos situaciones de la rematrícula, porque equivocarse en
cualquiera de las dos direcciones se nota tarde y mal. Comprobado por mutación: al volver a
reiniciar siempre, falla la que protege a quien iba a medias.

Comprobado de punta a punta con el campus en marcha, las dos situaciones:

- **Ya certificada**: avance **100 % → 0 %** al rematricular, certificado anterior intacto
  y verificable; tras rehacer las dos tareas —calificadas por el examinador— y el
  cuestionario, un **segundo certificado**. La pantalla del alumno los distingue: «2.ª vez
  que cursas este programa».
- **A medias, sin certificado**: se le da de baja y se le readmite, y **su entrega sigue
  ahí**, en el mismo estado. Probado con una cuenta temporal que se retiró al terminar.

Y con la duración del programa declarada en la ficha del curso, el certificado de la
tercera vuelta acreditó **8 horas** en lugar del tiempo que tardó en hacer clic.

Ocho pruebas cubren la aritmética de vigencia, que es donde los errores de fechas no se ven
hasta que alguien presenta un documento: bordes de mes, años bisiestos y el último instante
del plazo.

## 40. Repaso de limpieza

Barrido sobre todo lo tocado, buscando restos:

- **Nombres viejos**: ninguno. Tras renombrar `uploadFromBuffer`, `leerArchivoDeLaPeticion`,
  `ArchivoSubido`, `HORAS_MINIMAS`, `reiniciarVuelta` y `cargarDesdeBaseDeDatos`, no queda
  ni una referencia a los antiguos.
- **Exportaciones muertas**: ninguna. Las que aparecían sin uso «fuera de su fichero» son
  tipos que sirven de pieza a otros del mismo módulo —`PreguntaConRespuestas` dentro de
  `ConfiguracionDeCuestionario`, `DestinoDeEnlace` como retorno de `destinoDelEnlace`— y
  ahí es donde tienen que estar.
- **Rastros de depuración**: ninguno. Ni `console.log`, ni `TODO`, ni `FIXME`.
- **Dependencias sin usar**: ninguna, en ninguna de las dos aplicaciones.
- **Archivos de prueba**: el árbol sólo tiene código nuevo legítimo. Las cuentas y los
  certificados que generaron las comprobaciones quedaron retirados.

### Un servicio que se había hecho grande

`certificados.service.ts` llegó a 600 líneas mezclando dos preguntas distintas: **a quién
y cuándo** se le emite un certificado, y **qué dice** el documento. La segunda se llevó a
`datos-certificado.service.ts`, que reúne los datos del alumno, del curso y de la marca de
la sede, carga las imágenes y genera el código de verificación.

|                                | Antes | Ahora   |
| ------------------------------ | ----- | ------- |
| `certificados.service.ts`      | 600   | **447** |
| `datos-certificado.service.ts` | —     | 198     |

Ahora se puede cambiar lo que dice el diploma —añadir un dato, cambiar el texto legal— sin
tocar las reglas de emisión, y al revés. Comprobado emitiendo un certificado real después
de la separación.

**`chat.service.ts` (544) se dejó como está** a propósito: sus dos mitades —mensajes y
contactos— comparten la regla de que sólo se escribe a un contacto aceptado, y separarlas
obligaría a que una llamara a la otra para cada comprobación. Es una función con dos caras,
no dos funciones.

### Comprobado ejecutando

Las trece pantallas del campus abren sin error tras todos los cambios: panel, usuarios,
constructor, calificaciones, monitoreo, pruebas, solicitudes, certificados, mensajes, tema,
portada, cursos del alumno y verificación pública. Compilación de producción del cliente
correcta.

## 41. Borrar una cuenta: que se vaya todo lo suyo

Al revisar el borrado con la pregunta «¿qué queda?» aparecieron cuatro columnas que **no
caían con su dueño**, porque no tenían relación declarada en el esquema: los contactos de
chat (las dos partes), la otra parte de una conversación vaciada y las revocaciones de
sesión. Eran filas que sobrevivían para siempre apuntando a cuentas inexistentes —y la
base ya tenía seis.

Con las claves ajenas puestas, lo de cada persona desaparece con ella.

### Y un agujero que no se veía

`resetPassword` busca al usuario **por correo**, no por identificador. Si se borraba una
cuenta y alguien registraba después ese mismo correo, un enlace de recuperación antiguo
todavía vigente **cambiaba la contraseña de la cuenta nueva**. Ahora, al borrar una cuenta
se van también sus secretos pendientes: enlaces de recuperación y códigos de verificación.

De paso, la revocación de sesiones pasó a hacerse **antes** de borrar la fila. Al revés no
podía guardarse —su clave ajena apunta al usuario— y quedaba sólo en memoria.

### Comprobado con una cuenta real

Se creó un estudiante, se le generó de todo —matrícula, entrega con archivo, progreso,
mensajes, contacto de chat, conversación vaciada, sesión de estudio, enlace de
recuperación— y se borró:

```
DESPUÉS DE BORRAR
  no queda nada suyo en ninguna tabla
  archivo de la entrega en disco: borrado

LO QUE NO DEBE TOCARSE
  cursos: 2 → 2
  recursos: 3 → 3
```

Lo que creó como examinador sigue en pie: sus cursos se traspasan antes de borrarlo, con
sus alumnos y su contenido dentro. **Cinco pruebas** fijan las decisiones del servicio.

## 42. El despliegue no funcionaba

Preparando el paquete para cPanel apareció lo peor de esta tanda: **`npm run build` —la
orden documentada para desplegar— fallaba siempre**.

```
Error: <Html> should not be imported outside of pages/_document.
Export encountered an error on /_error: /404, exiting the build.
```

El mensaje señala a un problema de código que no existe. La causa real es que el script de
la raíz pasa el `.env` a la compilación, y el `.env` trae `NODE_ENV=development`:
compilar Next en modo desarrollo produce exactamente ese error. Quien compilara desde
`apps/client` no lo veía; quien siguiera la documentación, sí, siempre.

Corregido fijando `NODE_ENV=production` en las dos compilaciones, que es lo que deben ser
pase lo que pase en el `.env`. Y, ya que el mismo mensaje aparece con artefactos viejos en
`.next`, se añadió una limpieza previa que los retira conservando la caché.

Comprobado de punta a punta, que es lo que faltaba por hacer desde el principio:

| Paso                                          | Resultado                                       |
| --------------------------------------------- | ----------------------------------------------- |
| `npm run build` desde la raíz                 | correcto, con el servidor de desarrollo abierto |
| `node dist/main.js` con `NODE_ENV=production` | `healthy`, entorno `production`, base `ok`      |
| `node server.js` del paquete `prod/`          | listo en 238 ms, `/login` responde 200          |
| La portada en el navegador                    | selector de sede, sin un solo error de consola  |

### Basura retirada

`prisma/prod-seed.js` era **código muerto y peligroso**: usaba PostgreSQL
(`@prisma/adapter-pg`, una dependencia que ni está instalada) en un proyecto MariaDB,
creaba usuarios sin sede —campo obligatorio— y escribía una configuración global de una
sola fila, modelo que dejó de existir con la separación por países. Nadie lo referenciaba;
quien lo hubiera encontrado y ejecutado habría perdido un rato largo.

Y la semilla de verdad dejó de estar bloqueada en producción: es idempotente —no toca un
administrador que ya exista ni una plantilla ya editada—, así que el bloqueo sólo obligaba
a un rodeo con `NODE_ENV=development` y apuntaba a un script de alta que no existe.

### Lo que queda pendiente

Lo de la lista anterior está resuelto: los módulos puros tienen sus pruebas, los servicios se
revisaron de nuevo buscando condiciones de carrera, ESLint no da ningún aviso, borrar una
conversación sólo la oculta para quien la borra, y de los trece efectos con excepción a
`react-hooks/exhaustive-deps` quedan tres, cada uno con su motivo escrito al lado.

Queda, visto y decidido no tocar por ahora:

1. **Calificar mientras el alumno sustituye su entrega.** La nota se aplica al archivo nuevo
   aunque el examinador revisara el anterior. Evitarlo exige que el cliente diga qué
   versión revisó.
2. **El botón Atrás del navegador** abandona «Tema» o «Portada» sin avisar de los cambios
   sin guardar. Cerrar la pestaña, recargar y los enlaces del campus sí avisan; Next.js no
   ofrece una forma fiable de interceptar el retroceso.
3. **El cliente reconoce un cuestionario por la marca `[QUIZ]` del título**, y la API por su
   `quizConfig`. Coinciden porque el constructor pone las dos cosas a la vez; unificarlo
   en `quizConfig` tocaría todas las pantallas que distinguen tareas y cuestionarios.
4. **Consultas que crecerán con los datos**: el panel de cuestionarios no guarda nada en
   memoria, el resumen del administrador lanza unas nueve consultas a la vez y la limpieza
   nocturna de conversaciones ocultas recorre su tabla entera. Con los datos actuales son
   instantáneas; conviene medirlas cuando haya años de uso.
5. **Campos que se guardan sin efecto**: el código de acceso y las fechas de inicio y fin
   de un curso se editan, pero nada los aplica.

## 43. Los archivos, sólo en el disco del servidor

El despliegue real es cPanel, y el soporte de Cloudflare R2 que describen las secciones
anteriores era una segunda rama en cada lectura, escritura y borrado que nadie usaba. Peor:
bastaba con definir sus variables para que los archivos ya guardados en el disco dejaran de
encontrarse. Se retiró entero —código, pruebas, la dependencia `@aws-sdk/client-s3` con sus
cien paquetes y las variables `R2_*`—; las URLs firmadas de las descargas son propias de la
API y se mantienen.

### Cómo quedó el almacenamiento

- **Fuera de la aplicación.** La carpeta se fija con `STORAGE_DIR`; sin ella se usa
  `apps/api/uploads`, que sólo vale en desarrollo y en producción se avisa al arrancar.
- **Escritura atómica.** Las subidas y el PDF del certificado se escriben en `<raíz>/.tmp` y
  se renombran a su carpeta cuando están enteros. Los antiguos `*.parcial` vivían junto al
  destino, eran claves válidas y nada los retiraba tras un corte; `.tmp` no es una carpeta de
  claves y se vacía de restos al arrancar.
- **Fallos de disco con nombre.** Sin espacio o sin cuota, la subida responde 507 con un
  mensaje que dice a quién avisar; sin permiso de escritura, 503, y el registro nombra la
  carpeta. Antes llegaban como «error interno».
- **Arranque y salud.** La API crea las carpetas sin permisos para otras cuentas, comprueba que
  puede escribir sin impedir el arranque y lo expone en `/api/health` (`storage`).
- **Rutas.** Además de validar la forma de la clave, la ruta resuelta tiene que quedar dentro
  de la raíz. Borrar es idempotente.
- **Pruebas en una carpeta temporal.** Las del almacenamiento escribían en la carpeta real.

### Una sola regla para sustituir o quitar un archivo

Portada, foto de perfil, logotipo, favicon, fondo, firma, material de un recurso y entrega
reenviada repetían cada uno a su manera «borra el anterior», y quitar una imagen no tenía
ninguna prueba. Ahora pasan todos por `FileOwnershipService.replace` (la fila apunta a un
archivo ya subido) o `adoptUpload` (se sube y se asigna en un paso): se guarda la fila y
después se borra el anterior si ninguna otra lo usa; si no se puede guardar, se retira lo
recién subido. Cada pantalla tiene su prueba de que quitar la imagen la borra, y la regla se
prueba contra un disco de verdad.

### Certificados

- **El logotipo sólo admite PNG o JPG**, como ya la firma: un SVG se aceptaba y desaparecía en
  silencio de todos los certificados (y de los correos). Los ya subidos se omiten con un aviso
  que dice qué formato usar.
- **Un PDF perdido se recompone.** Cada certificado guarda en `datos_pdf` lo que imprime; si
  falta el archivo, la descarga lo vuelve a componer, lo guarda con la misma clave y lo
  sirve. Antes se pedía al administrador «que lo vuelva a emitir», algo que no existe.
- **El PDF ya no queda huérfano** si la base no llega a confirmar la emisión.

### Una dependencia que no compilaba

`RateLimitGuard` sobrescribe `setResponseHeader`, que `@nestjs/throttler` sólo tiene desde la
6.7.1, pero el lock fijaba la 6.5.0: con `npm ci` la API no compilaba. Se subió la
dependencia, y el lock, regenerado con el npm de Node 22, vuelve a pasar `npm ci`.

### Comprobado ejecutando

La API compilada, con `STORAGE_DIR` en una carpeta nueva: crea las nueve carpetas con
`rwxr-x---`, `/api/health` responde `storage: ok`, un logotipo SVG se rechaza con el mensaje
de formato, uno PNG se guarda y quitarlo lo borra del disco (la descarga pasa a 404), cambiar
la foto de perfil borra la anterior y quitarla borra la actual, y un certificado sin su PDF
se descarga recompuesto y queda guardado de nuevo.

## 44. Las entregas se retiran al certificar, y la vuelta queda cerrada

La retirada de archivos al certificar que describe la sección 35 ya no estaba en el código: el
certificado se emitía y las entregas seguían en el disco para siempre, también al pasar a
`lms_entregas_archivadas` con la rematrícula. Vuelve sin ninguna repesca periódica.

- **Al emitir.** En la transacción que registra el certificado, con la matrícula bloqueada, las
  entregas con archivo de esa vuelta se marcan como retiradas (sin clave y con
  `archivo_purgado`) y conservan el nombre, el estado, la nota y el comentario. Los archivos se
  borran cuando la transacción se confirma, con la regla de siempre (`deleteUnreferenced`): si
  la emisión se deshace no se borra nada, y un fallo del disco no deshace el certificado. El
  personal del curso recibe `submission:files-retired` y el aviso del alumno lo explica.
- **Vueltas ya certificadas.** Al arrancar, la API aplica la misma retirada a las que aún
  conservan archivos. La consulta parte de las entregas con archivo, que son las de las vueltas
  en curso, así que sin pendientes no hace nada.
- **Rematrícula.** Las entregas se archivan sin archivo; la columna de archivo de
  `lms_entregas_archivadas` y su índice se retiraron, con los pasos para sus archivos en
  `DESPLIEGUE-CPANEL.md`. La segunda certificación sólo toca la vuelta nueva.
- **Vuelta cerrada en la API.** El modo de sólo lectura de un curso terminado era sólo del
  cliente: el examinador podía recalificar a un alumno certificado y el alumno reenviar un
  archivo que ya nadie retiraría. Ahora, con la vuelta certificada o dada de baja, la API
  rechaza entregas (antes de recibir el archivo y otra vez al guardarlo), recalificaciones,
  intentos de cuestionario e intentos adicionales. Un intento adicional, además, sólo se
  concede a quien agotó los suyos sin superar el cuestionario: antes se borraba una nota real
  de quien aún tenía intentos.
- **Borrar una tarea o un módulo** soltaba sus entregas (`SetNull`): quedaban sin curso y con
  su archivo para siempre. Recurso, módulo y curso se borran ahora con una sola función que
  se lleva las entregas de sus tareas y retira sus archivos y el material.
- **Una sola definición de vuelta.** Ya hay certificado de la vuelta si su matrícula está
  terminada; la vuelta empieza en `fecha_matricula`, que retomar tras una baja ya no reinicia,
  y el tiempo de estudio del certificado se cuenta desde ahí.
