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

| Endpoint | Efecto de la suplantación |
|---|---|
| `GET /estudiantes/student/progreso` | Leer el progreso de cualquier alumno |
| `POST /estudiantes/student/completar-recurso` | **Marcar recursos como completados en nombre de otro** |
| `GET /estudiantes/student/dias-activos` | Leer actividad ajena |
| `GET /estudiantes/student/notificaciones` | Leer notificaciones ajenas |
| `GET /estudiantes/student/metricas` | Leer métricas ajenas |
| `POST /estudiantes/student/heartbeat` | Inflar el tiempo activo de otro usuario |
| `POST /estudiantes/student/certificados/generar` | **Emitir un certificado a nombre de otro** |
| `GET /estudiantes/student/certificados/verificar/:curso` | Leer estado de curso ajeno |
| `GET /estudiantes/student/certificados` | Listar certificados ajenos |
| `GET /configuracion/firma` · `POST /configuracion/firma` | **Leer y sobrescribir la firma digital de un examinador** |

El último es especialmente grave: la firma es lo que da validez al certificado emitido.

### SEC-02 — Respuestas correctas del cuestionario expuestas al alumno (crítico)

`GET /cursos/:guid` devuelve el curso completo, incluido `recursos.quiz_config`, que es un JSON con
`opciones[].es_correcta`. El componente `QuizPlayer` recibe ese JSON crudo (`quiz_config_raw`) y sólo
*omite* el campo en su interfaz TypeScript. Las respuestas viajan al navegador: son visibles en la
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
[...profGuids].filter((g) => cursos.some((c) => allMatriculas.some((m) => m.curso_guid === c.guid)))
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
`replace('NOTA: ', '').split(' | ')` se rompe en cuanto un comentario contenga ` | `, y `parseFloat`
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
- Validación de *magic bytes* en las subidas para evitar suplantación de extensión.
- `helmet`, `compress`, rate limiting global y CORS explícito.
- Sanitización con DOMPurify y lista blanca restrictiva en el cliente.
- `AlertContext` con interfaces de error amigables, que es la base sobre la que construir el manejo de
  errores pedido.
- La interfaz de usuario en general: es la parte más madura del proyecto.

---

## 8. Plan de intervención

Orden elegido para que cada fase deje el sistema en estado funcional:

| Fase | Contenido | Hallazgos que cierra |
|---|---|---|
| A | Dominio único: escala de notas 0–100, umbral 80, países | BUG-07, BUG-10, ARQ-04 |
| B | Multi-país en esquema, JWT y consultas | (nueva funcionalidad) |
| C | Autorización: fin de la suplantación, propiedad de recursos | SEC-01 … SEC-08, SEC-12 |
| D | Tiempo real sobre SSE | CP-01, SEC-13, ARQ-07 |
| E | Almacenamiento y ficheros | BUG-01, BUG-03, BUG-08, SEC-09, SEC-10, ARQ-05 |
| F | Simplificación: lecciones, scheduler, estado de quiz | ARQ-01, ARQ-02, ARQ-03 |
| G | Cliente: selector de país, escala 0–100, transporte SSE | (nueva funcionalidad) |
| H | Limpieza, documentación y despliegue | CP-02, CP-03, COD-* |

---

## 9. Resultado

Estado de cada hallazgo tras la refactorización.

### Seguridad

| Id | Hallazgo | Cómo quedó |
|---|---|---|
| SEC-01 | Suplantación vía `?usuario_guid=` | Cerrado. El patrón desapareció de los diez endpoints; la identidad sale del token y `@CurrentUser()` falla si no hay sesión en lugar de devolver `undefined` |
| SEC-02 | Respuestas del cuestionario expuestas | Cerrado. Dos proyecciones del curso; las preguntas se piden al abrir el intento y salen sin `es_correcta` |
| SEC-03 | Ficha de curso sin matrícula | Cerrado. `getCursoParaEstudiante` exige matrícula y curso publicado |
| SEC-04 | Calificar entregas ajenas | Cerrado. `cursoDeEntregaQueGestiona` comprueba la propiedad |
| SEC-05 | Monitoreo de alumnos ajenos | Cerrado. El endpoint ya no acepta `profesor_guid` |
| SEC-06 | IDOR en certificados | Cerrado. Sólo el titular o un administrador de su sede |
| SEC-07 | Notificaciones ajenas | Cerrado. El filtro incluye al propietario |
| SEC-08 | Mensajería sin contacto aceptado | Cerrado. `asegurarContactoAceptado` en envío y lectura |
| SEC-09 | Archivos públicos | Cerrado. URL firmada con caducidad para entregas, certificados, firmas y material de curso |
| SEC-10 | SVG servido en línea | Mitigado. Se conserva el formato para los logotipos, pero se sirve con una CSP que impide ejecutar scripts |
| SEC-11 | Enumeración de usuarios | Cerrado. Un solo mensaje para correo inexistente, contraseña incorrecta y sede equivocada |
| SEC-12 | Endpoints sin DTO | Cerrado. Todos los cuerpos tienen clase con `class-validator` |
| SEC-13 | Token en la query del WebSocket | Cerrado. SSE leído con `fetch` y cabecera `Authorization` |

### Corrección

| Id | Hallazgo | Cómo quedó |
|---|---|---|
| BUG-01 | Borrado de archivos en uso | Cerrado. Disco y base usan la misma clave `carpeta/nombre` |
| BUG-02 | Borrar profesor arrastraba sus cursos | Cerrado. Relación `Restrict` y traspaso explícito, con selector en la interfaz |
| BUG-03 | Certificado sin logotipo | Cerrado. Las imágenes se leen del almacenamiento, no del disco |
| BUG-04 | Métrica `profesoresActivos` sin sentido | Cerrado. Recuentos con agregados de base de datos |
| BUG-05 | `rejectRequest` borraba la solicitud | Cerrado. Queda como `RECHAZADA`, con motivo |
| BUG-06 | `logout` cerraba todas las sesiones | Resuelto de otra forma. Se mantiene una sola sesión por cuenta, pero ahora es explícito y persistente; cerrar sesión libera el registro |
| BUG-07 | `escala` decorativa | Cerrado. Se retiró la columna y su enum: el sistema tiene una única escala |
| BUG-08 | Límite de archivo ignorado | Cerrado. Se aplica el del recurso, si no el de la sede, y nunca por encima del tope del servidor |
| BUG-09 | Verificación de correo sin consumir | Cerrado. Se consume al crear la solicitud y caduca |
| BUG-10 | `@Max(5)` en el DTO | Cerrado. Los límites salen del dominio |

### Arquitectura

| Id | Hallazgo | Cómo quedó |
|---|---|---|
| ARQ-01 | Capa `lms_lecciones` vestigial | Eliminada. Los recursos cuelgan del módulo |
| ARQ-02 | Republicación por sondeo | Eliminado. `updateCurso` avisa en el momento del cambio |
| ARQ-03 | Estado obsoleto del quiz | Eliminado. Los intentos se conservan y el reinicio afecta al progreso del módulo, no al contador |
| ARQ-04 | La nota como texto parseable | Cerrado. Campos propios; se retiró `contenido_texto` |
| ARQ-05 | Columna `TEXT` para una clave | Cerrado. Columna dimensionada y comentario corregido |
| ARQ-06 | Dashboards cargando tablas enteras | Cerrado. Agregados en base de datos |
| ARQ-07 | Difusión indiscriminada | Cerrado. Todo evento exige destino con país y rol |
| ARQ-08 | Tres fuentes para la URL de la API | Cerrado. Sólo `lib/env.ts` |

### Despliegue y calidad

| Id | Hallazgo | Cómo quedó |
|---|---|---|
| CP-01 | WebSockets bloqueados | Resuelto. Tiempo real sobre SSE; no hace falta pedir nada al hosting |
| CP-02 | Artefactos versionados | Cerrado. `prod/` y el zip fuera del repositorio |
| CP-03 | README desactualizado | Reescrito, junto con la guía de cPanel y un documento de decisiones |
| COD-01 | `any` en fronteras | Reducido en la API; el cliente conserva `any` en estructuras de pantalla |
| COD-02 | Páginas de más de mil líneas | Parcial. Se dividieron login, menú lateral y las pantallas de configuración; el constructor de cursos y el panel de calificaciones siguen siendo grandes |
| COD-03 | `catch {}` vacíos | Cerrado en los caminos que ocultaban fallos; se conservan donde la operación es prescindible, con el motivo escrito |
| COD-04 | Comentarios con identificadores muertos | Cerrado |
| COD-05 | `seedMatriculas` expuesto | Eliminado |

### Lo que queda pendiente

Trabajo identificado y no abordado, para que no se pierda:

1. **`constructor-cursos/page.tsx` y `examiner/calificaciones/page.tsx`** siguen por encima
   de las mil líneas. Funcionan y están migrados, pero mezclan estado, llamadas y
   presentación. Dividirlos es la siguiente refactorización natural.
2. **Sin pruebas de integración.** Las 35 pruebas cubren el dominio puro (escala,
   cuestionarios, sedes). Las reglas de acceso —que son lo que más importa— se comprueban
   leyendo el código, no ejecutándolo. Un conjunto de pruebas sobre `CursoAccesoService` con
   una base de datos de prueba sería la mejor inversión siguiente.
3. **Tipado del cliente.** `types/models.ts` no refleja las respuestas actuales de la API y
   varias pantallas siguen usando `any`. Generar los tipos desde la API cerraría la brecha.
