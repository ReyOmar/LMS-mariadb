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
la omita, que es lo que asegura `CursoAccesoService`.

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

Un JWT es válido por sí mismo hasta que caduca. Sin esa consulta, desactivar una cuenta o
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

### ¿Por qué se borran los archivos de las entregas al emitir el certificado?

Porque el certificado es ya el documento que acredita la capacitación y los borradores
entregados sólo consumen almacenamiento. Se conservan el nombre del archivo y la
calificación, así que el alumno sigue viendo qué entregó y qué nota obtuvo.

---

## Interfaz

### ¿Por qué hay un `mensajeDeError` central?

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
pantalla es una línea en `navegacion.ts`.
