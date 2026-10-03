# Decisiones de diseño

Por qué el sistema es como es. Cada apartado responde a una pregunta que se repite al leer
el código, para que nadie tenga que deducir el motivo ni deshacer una decisión sin saber qué
resolvía.

---

## Separación por sede

### ¿Por qué el país está en la fila y no en bases de datos separadas?

Dos bases de datos garantizarían la separación por construcción, pero duplicarían el
despliegue, las migraciones, las copias de seguridad y el coste, y harían imposible un
informe conjunto si algún día hace falta. Con una columna `pais` en las tablas raíz y el
filtro aplicado en el servidor, la separación es igual de efectiva mientras ninguna consulta
la omita, que es lo que asegura `CourseAccessService`.

### ¿Por qué el correo es único en todo el sistema y no por sede?

Porque la recuperación de contraseña sólo dispone del correo. Si la misma dirección pudiera
existir en las dos sedes, el enlace de recuperación no sabría a cuál de las dos cuentas
apunta. Una persona pertenece a una sede; si cambia, se traslada su cuenta.

### ¿Por qué el login pide la sede si el correo ya identifica al usuario?

Por dos razones. La primera es de interfaz: la sede decide qué marca, qué textos y qué datos
de contacto se muestran antes de que haya sesión. La segunda es de seguridad: el mensaje de
error no distingue «no existe», «contraseña incorrecta» y «sede equivocada». Si los
distinguiera, cualquiera podría averiguar en qué sede está registrada una persona probando
correos.

### ¿Por qué el login sí dice que una solicitud está pendiente o fue rechazada?

Es la única excepción a la regla anterior, y se acepta a sabiendas: escribiendo un correo
cualquiera en el acceso se puede saber si alguien pidió entrar y si se le rechazó. A cambio,
quien solicitó acceso tiene una forma de consultar en qué punto está su solicitud sin
cuenta, sin otro canal y sin escribir a la administración. El riesgo es bajo: no revela la
sede, ni si existe una cuenta, ni ningún dato de la persona, y la ruta tiene el mismo
límite de intentos por minuto que cualquier acceso. Si un día pesa más la privacidad de
quien solicita, basta con quitar esos dos mensajes en `AuthService.login`: el correo de
aprobación o de rechazo ya le comunica la decisión.

### ¿Por qué los administradores también están atados a una sede?

Es la lectura literal del requisito: ningún dato cruza entre sedes. Un rol con visión global
sería una excepción permanente a esa regla y la primera vía por la que reaparecería el
cruce. Si en el futuro hace falta, se añade como rol nuevo y explícito, no relajando el
filtro existente.

---

## Calificación

### ¿Por qué 0–100 y no 0–5?

Lo pidió el negocio. Lo que importa técnicamente es que ahora existe **una** definición de
la escala. Antes el par «0–5 / umbral 3.0» estaba copiado en ocho lugares —servicios,
listeners, tareas programadas, DTOs, generación de PDF y textos de correo— y cambiarlo
obligaba a encontrarlos todos.

### ¿Por qué un valor corrupto se convierte en 0 y no en 100?

`normalizarNota(NaN)` devuelve 0. Ante un dato que no se entiende, aprobar a quien no debía
es peor que suspender a quien sí: lo primero emite un certificado que no debería existir, lo
segundo se corrige recalificando.

### ¿Por qué el umbral está en el curso y no es una constante?

Porque distintos programas exigen distintos mínimos. La constante es sólo el valor por
defecto de un curso nuevo. `umbralAprobacion()` cae en ella cuando el curso no lo define o
guarda un valor imposible, para que un dato ausente nunca deje pasar una entrega.

---

## Autorización

### ¿Por qué el guard consulta la base de datos en cada petición?

Un JWT es válido por sí mismo hasta que caduca. Sin esa consulta, borrar una cuenta o
cambiarle el rol no surtiría efecto hasta 24 horas después. Cuesta una consulta por petición
y compra que las decisiones del administrador se apliquen al instante.

### ¿Por qué una sola sesión activa por cuenta?

Porque el certificado acredita que **una persona concreta** hizo la formación. Compartir
credenciales lo vaciaría de sentido. La sesión vigente se guarda en la fila del usuario
(`sesion_actual_jti`) y no sólo en memoria, para que la política sobreviva a un reinicio del
servidor.

### ¿Por qué las respuestas del cuestionario no viajan con la ficha del curso?

Porque estaban llegando al navegador del alumno antes de empezar el examen, visibles en la
pestaña Red del inspector. Ahora hay dos proyecciones del mismo curso —una para quien lo
edita y otra para quien lo estudia— y las preguntas se piden al abrir el intento, ya sin la
marca de cuál es la opción correcta.

### ¿Por qué las descargas van firmadas en lugar de protegidas con el token?

Porque `<img>`, `<video>` y `<a download>` no pueden enviar la cabecera `Authorization`. La
firma HMAC con caducidad resuelve el caso: el enlace funciona en cualquier etiqueta HTML y
deja de funcionar solo al cabo de una hora. El material de marca queda abierto porque la
portada lo necesita antes de que exista sesión.

---

## Tiempo real

### ¿Por qué SSE y no WebSocket?

Porque el despliegue vive en cPanel, donde Apache no propaga la cabecera `Upgrade` y la
conexión WebSocket nunca llega a establecerse. SSE es HTTP corriente y atraviesa cualquier
proxy. Encaja además con el uso real: todo lo que el sistema empuja va en una sola
dirección.

### ¿Por qué `fetch` con lectura por streaming y no `EventSource`?

`EventSource` no permite añadir cabeceras, así que el token tendría que viajar en la URL y
acabaría escrito en los registros de acceso de Apache y de cualquier proxy intermedio. Con
`fetch` va donde corresponde, a cambio de implementar la reconexión a mano.

### ¿Por qué todo evento exige un destino con país?

Para que un cambio en Colombia no provoque ni un refresco de pantalla en México. Hacer el
país obligatorio en la firma del método impide olvidarlo.

---

## Modelo de datos

### ¿Por qué desapareció `lms_lecciones`?

Porque cada módulo creaba **exactamente una** lección artificial llamada «Lección Interna
Módulo &lt;guid&gt;». No representaba nada: sumaba un JOIN a cada lectura, un `flatMap`
anidado a cada recorrido y hacía que el modelo del código no coincidiera con el de la
aplicación. Los recursos cuelgan ahora directamente del módulo.

### ¿Por qué borrar un profesor exige decir a quién pasan sus cursos?

Porque antes no lo exigía y el resultado era pérdida de datos. El código buscaba «algún
administrador» y, si no lo encontraba, seguía adelante: la cascada de la base de datos se
llevaba por delante los cursos con sus módulos, recursos, matrículas y entregas. La relación
es ahora `Restrict` y el traspaso es explícito.

### ¿Por qué la nota tiene su propia columna en lugar de ir en el texto?

La tenía, pero nadie la usaba: el cliente reconstruía la nota partiendo la cadena
`"NOTA: 4.5 | comentario"` en cinco pantallas distintas. Bastaba un comentario con una barra
vertical para romperlo, y un texto ausente producía un `NaN` que acababa pintado en
pantalla.

### ¿Cuándo se borra un archivo?

Sólo cuando alguien lo pide: al eliminar el curso, el módulo, el recurso o la cuenta a los
que pertenece, o al sustituirlo por otro —una portada o un logotipo nuevos, otra foto, una
entrega corregida—. **Ninguna tarea automática borra archivos.** Las entregas conservan el
suyo después del certificado, y no hay limpieza de «huérfanos»: decidir que un archivo sobra
comparándolo con la base basta con que falle una referencia —una imagen o un enlace dentro
de un texto, una base restaurada de una copia, otro entorno que comparta el bucket— para
llevarse algo en uso. El precio es que puede quedar algún archivo sin uso, como una portada
subida y no guardada.

La única consecuencia indirecta es **volver a matricular a quien ya se certificó**: la nueva
vuelta empieza de cero, así que se retiran sus entregas anteriores de ese curso con sus
archivos. El certificado emitido se conserva.

---

## Base de datos

### ¿Por qué el listado de cuentas no pide sus recuentos con `_count`?

Porque Prisma lo resuelve agrupando **las tablas enteras** de matrículas y cursos en cada
página, para quedarse después con 50 filas. Con cinco años de alumnos (25 000 cuentas,
80 000 matrículas) la página de estudiantes pasaba de 3 ms a más de 400. Ahora la página se
pide sola y los recuentos se piden aparte, con `groupBy` sobre las cuentas de esa página
(`UserService.pageCounts`), que recorren el índice por persona. Conviene no volver a meter
`_count` en un listado paginado de algo que crece.

### ¿Por qué la búsqueda sigue siendo `LIKE '%texto%'`?

Porque hoy basta y es la que encuentra lo que la gente espera: cualquier trozo del nombre,
del apellido o del correo, sin tildes ni mayúsculas (las columnas usan
`utf8mb4_unicode_ci`, que ya las ignora; `searchTerm` quita además las tildes del término,
lo que no cambia ningún resultado). Su coste crece con la sede, porque no puede usar
índices y recorre todas las cuentas. Medido en este servidor (MariaDB 11.4):

| Cuentas | Primera página, término frecuente | Término raro o sin resultados | Recuento de pestañas |
| ------- | --------------------------------- | ----------------------------- | -------------------- |
| 25 000  | 1,7 ms                            | 75–100 ms                     | 50–70 ms             |
| 100 000 | 3–6 ms                            | 180–270 ms                    | 175–300 ms           |

El buscador espera a que se deje de teclear (300 ms) y los candidatos del chat no se buscan
con una sola letra, así que cada búsqueda es una consulta y no una por tecla.

**Cuándo cambiarla:** si una sede supera unas 50 000 cuentas, o si los tiempos de arriba
empiezan a notarse. El camino previsto:

1. Índice `@@fulltext([firstName, lastName, email])` en `User` (desde Prisma, como todo el
   esquema).
2. Buscar cada palabra por prefijo, todas obligatorias:
   `MATCH(nombre, apellido, email) AGAINST ('+ana* +ruiz*' IN BOOLEAN MODE)`.
3. Mantener `LIKE` para términos de menos de 3 caracteres (por debajo, FULLTEXT no indexa) y
   usar `email LIKE 'texto%'` cuando el término lleve `@`, que sí aprovecha el índice único
   del correo.

El precio es que se deja de encontrar un trozo del **interior** de una palabra: «art» ya no
daría con «Martínez». MariaDB no tiene el analizador _ngram_ de MySQL, que lo evitaría.

---

## Retención de datos

### ¿Por qué la aplicación no borra registros antiguos?

Porque la regla del propietario es que **nada se borra si no lo borra alguien**: una
formación, una entrega o un aviso siguen ahí hasta que una persona elimina el curso, la
cuenta o la conversación. No hay tareas que purguen historial por antigüedad.

El crecimiento lo permite. Medido con 5 000 alumnos nuevos al año, cada año añade más o
menos:

| Tabla                                       | Por año       |
| ------------------------------------------- | ------------- |
| Avance por recurso (`lms_progreso_recurso`) | ~95 MB        |
| Entregas (`lms_entregas`)                   | ~39 MB        |
| Avisos (`lms_notificaciones`)               | ~55 MB        |
| Sesiones de estudio (`lms_sesion_activa`)   | hasta ~100 MB |

Unos 300 MB al año: cabe en cualquier plan de alojamiento, y las consultas que recorren
estas tablas están acotadas por curso o por persona.

Lo único que se borra solo, cada noche, son **los códigos de verificación y los enlaces de
recuperación caducados**, que no son contenido de nadie sino secretos de un solo uso, y los
mensajes que **las dos partes** ya vaciaron de su bandeja, que nadie puede volver a ver.

Fijar un plazo de conservación es una decisión del propietario, a tomar con asesoría legal
(Ley 1581 de 2012 en Colombia, LFPDPPP en México). Si se decide, estos son los candidatos:

- **Avisos leídos antiguos** (por ejemplo, de más de un año). No afectan a nada más.
- **Detalle de las sesiones de estudio** de cursos ya certificados. Ojo: las horas del
  certificado y de los paneles se suman de ese detalle al vuelo, así que antes habría que
  guardar el total en otro sitio.
- **Archivos de entregas** de cursos certificados hace años. La fila con la nota puede
  quedarse; el archivo es lo que ocupa.
- **Solicitudes de acceso rechazadas**: son datos de personas que no llegaron a tener cuenta.
- **Cuentas sin actividad** durante años. Borrar una cuenta se lleva también sus
  certificados, así que no es un plazo sin más: habría que decidir qué se conserva como
  prueba de la formación.

---

## Comportamiento ante errores

### ¿Por qué un fallo de correo no deshace la operación?

Porque la operación ya ocurrió. Calificar una entrega y que el correo falle no puede
significar que la nota se pierda. Los avisos se emiten como eventos y el listener los
atiende después, capturando cualquier error.

### ¿Qué pasa si un examinador tarda en calificar?

A las 48 horas el sistema desbloquea el siguiente recurso para que el alumno no quede
parado, y se lo explica en un aviso. **No da la tarea por aprobada**: el certificado sigue
exigiendo que todas las tareas estén calificadas, así que nadie se certifica por esa vía.

### ¿Qué pasa si un alumno suspende un cuestionario?

Se le devuelve al principio del módulo: se borra su progreso en los recursos de estudio de
ese módulo para que los repase antes de volver a intentarlo. **Los intentos se conservan**,
de modo que el límite configurado se respeta; antes cada suspenso borraba el contador y el
límite no limitaba nada. Si agota los intentos, el examinador puede concederle uno más y
queda registrado quién lo hizo.

### ¿Qué pasa si se cierra la pestaña a mitad de un examen?

El intento sigue abierto en el servidor con su hora de inicio. Al volver se retoma: las
mismas preguntas, el cronómetro donde iba y las respuestas que se habían marcado, guardadas
localmente. Si el tiempo se agotó mientras tanto, el intento se corrige con 0 y se dice por
qué.

---

## Interfaz

### ¿Por qué hay un `errorMessage` central?

Porque cada pantalla resolvía los errores a su manera y varias acababan mostrando
`undefined` o un volcado de excepción. La API devuelve siempre un `message` pensado para
leerse; lo que faltaba era cubrir los casos sin respuesta —sin conexión, tiempo agotado,
servidor caído—, que es justo cuando el usuario más necesita saber qué pasa.

### ¿Por qué el guardado es explícito en las pantallas de configuración?

Porque guardar en cada pulsación de tecla impide distinguir «lo escribí» de «quedó
guardado». Con un borrador y una barra que sólo aparece cuando hay cambios pendientes, el
estado es visible y nada se pierde al navegar sin darse cuenta.

### ¿Por qué el menú lateral se describe como datos?

Porque el mismo bloque JSX con sus nueve atributos aparecía dieciséis veces, y bastaba
olvidar una línea para que un rol tuviera un menú distinto al de otro. Ahora añadir una
pantalla es una línea en `components/layout/navigation.ts`.

---

## Código y dependencias

### ¿Por qué el código está en inglés y la base de datos en español?

El código se escribe en inglés porque es el idioma de las librerías, de la documentación
técnica y de cualquier desarrollador que se incorpore; mezclar idiomas en los nombres obliga
a adivinar cada vez cómo se llama algo. Todo lo que lee una persona —interfaz, errores,
correos— sigue en español.

La base de datos conserva sus nombres porque renombrar tablas y columnas con datos reales es
una migración con riesgo que no aporta nada al usuario. Prisma traduce los nombres con
`@map`/`@@map`. Lo que sí son datos —identificadores de eventos de correo, variables de las
plantillas, carpetas del almacenamiento, el JSON guardado de los cuestionarios— se deja tal
cual, y donde hace falta se convierte en un único punto (`courses/quiz-config.ts`).

### ¿Por qué hay `overrides` en los `package.json`?

Los paquetes de la izquierda llegan como dependencia de otro que fija una versión exacta, y esa
versión tenía avisos de seguridad en `npm audit`. El `override` instala la corregida:

| Paquete             | Lo fija                    | Fijado → instalado                                     |
| ------------------- | -------------------------- | ------------------------------------------------------ |
| `fastify`           | `@nestjs/platform-fastify` | 5.11.3 → 5.12                                          |
| `mariadb`           | `@prisma/adapter-mariadb`  | 3.4.5 → 3.4.7 (misma rama, la que admite el adaptador) |
| `mysql2`            | `prisma` (CLI)             | 3.15.3 → 3.24                                          |
| `deepmerge-ts`      | `@prisma/config`           | 7.1.5 → 8                                              |
| `postcss` (cliente) | `next`                     | 8.4.31 → la misma que usa Tailwind                     |

Al actualizar esos paquetes principales conviene revisar si el `override` sigue haciendo
falta (`npm ls <paquete>`) y quitarlo cuando ya no.

### ¿Qué aviso de seguridad queda abierto y por qué se acepta?

`npm audit --omit=dev` sólo informa de uno, de severidad baja, en el cliente: `quill`
(el editor de texto enriquecido, vía `react-quill-new`) puede exportar HTML con código
inyectado. No hay versión corregida; la «solución» que propone `npm audit fix --force` es
bajar a una versión anterior del editor.

No es explotable aquí porque ningún HTML se pinta sin pasar antes por `sanitizeHTML`
(DOMPurify), tanto el que escribe el editor como el que llega de la API. Cuando `quill`
publique la corrección basta con actualizar `react-quill-new`.

---

## Protección de datos

### ¿Cómo se prueba la autorización de tratamiento de datos?

La ley colombiana exige obtener la autorización a más tardar al recoger los datos y
conservar su prueba (Decreto 1377 de 2013, arts. 5 y 8), y la mexicana pone el aviso de
privacidad a disposición antes del tratamiento. Por eso:

- La solicitud de acceso no se envía sin marcar la autorización, y la API guarda cuándo se
  dio y sobre qué versión de la política.
- Al aprobarla, esa prueba pasa a la cuenta.
- Quien entra sin haber aceptado la versión vigente de su sede —cuentas anteriores, altas
  hechas por un administrador o una política que ha cambiado— debe aceptarla para seguir o
  cerrar la sesión.

La versión es la fecha en que la administración editó por última vez los textos legales o
los datos del responsable; mientras no los edite, rige la de los textos de serie.

### ¿Por qué se muestra un aviso breve junto a la casilla de autorización?

Porque la autorización sólo vale si se da informada en ese momento. En Colombia hay que
decir, al pedirla, para qué se tratan los datos, que los sensibles son facultativos, qué
derechos hay y cómo contactar al responsable (Ley 1581, art. 12). En México, si los datos se
recogen por medios electrónicos, hay que mostrar el aviso simplificado —identidad y
domicilio del responsable, datos, finalidades y cómo limitar su uso— con el enlace al
integral (LFPDPPP de 2025, art. 16). `collectionNotice` redacta ese aviso con los datos del
responsable de la sede, y se muestra en la solicitud de acceso y en el diálogo que pide
aceptar la versión vigente. La casilla colombiana dice «previa, expresa e informada»; la
mexicana pide confirmar que se leyó el aviso, que es lo que exige allí la ley.

La página legal avisa a los administradores —sólo a ellos— si falta algún dato del
responsable que la ley obliga a publicar.

### ¿Por qué el aviso de almacenamiento no ofrece rechazarlo?

Porque el campus sólo guarda en el navegador lo imprescindible para funcionar —la sesión,
las preferencias, la apariencia de la sede y los borradores de cuestionario— y no usa
cookies publicitarias, analíticas ni de seguimiento. Los datos personales que se guardan
(la sesión) sólo existen después de iniciar sesión, y para eso ya se ha aceptado la
política. El aviso informa, enlaza el detalle y cumple la advertencia visible que piden los
Lineamientos del Aviso de Privacidad en México. Los vídeos de YouTube son la excepción: al
reproducirlos, YouTube puede usar sus cookies, y así se dice.

### ¿Por qué la sección de cookies no nombra las claves del navegador?

Porque a quien lee no le dicen nada y cambian con el código. Se describe por categorías
—sesión, preferencias, apariencia de la sede, borradores—, con su finalidad, su duración y
cómo borrarlo, como hace la propia SIC en su documentación de cookies. `BROWSER_STORAGE`
tiene que seguir cubriendo todo lo que se guarda: quien añada una clave nueva debe
encajarla en una categoría o crear otra.

### ¿Por qué los textos legales admiten «## » y «- »?

Para que se lean por apartados y listas sin meter HTML en un campo que edita la
administración. `parseLegalText` convierte esas marcas en subtítulos y listas; un texto sin
marcas se sigue viendo como párrafos, así que los textos ya guardados no cambian.

### ¿Por qué las tipografías se sirven desde el propio dominio?

Antes se descargaban de Google Fonts en cada visita, lo que entregaba la dirección IP de
cada visitante a un tercero y añadía una conexión externa a cada carga. `next/font` las
descarga al compilar y las sirve junto al resto del cliente.
