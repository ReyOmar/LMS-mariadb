#!/usr/bin/env node
'use strict';

/**
 * Actualización de una instalación de la versión de julio de 2026 a la actual.
 *
 * La versión de julio no tenía sedes, calificaba de 0 a 5, agrupaba los recursos en lecciones
 * y guardaba los archivos en `uploads/` sin carpetas. `prisma db push`
 * sólo sabe igualar la estructura: sin estos pasos fallaría (columnas obligatorias en tablas
 * con filas) o perdería datos (los recursos al retirar las lecciones).
 *
 * Se ejecuta en `~/lms-api`, con `DATABASE_URL` exportada en la terminal, en este orden:
 *
 *   node prisma/migracion-julio/migrar.js diagnostico      sólo lee: qué hay y qué hay que revisar
 *   node prisma/migracion-julio/migrar.js antes            prepara los datos para el esquema nuevo
 *   npx prisma db push --accept-data-loss                  aplica el esquema nuevo
 *   node prisma/migracion-julio/migrar.js despues          completa lo que el esquema nuevo añade
 *   node prisma/migracion-julio/migrar.js archivos --origen <carpeta uploads antigua> [--mover]
 *   npx prisma db seed                                     administrador y correos de cada sede
 *   node prisma/migracion-julio/migrar.js comprobar        repasa el resultado
 *
 * `antes` sólo puede ejecutarse una vez: convierte las notas a la escala 0–100. Si se corta a
 * mitad, restaura la copia de la base y vuelve a empezar. `despues`, `archivos` y `comprobar`
 * pueden repetirse sin daño.
 */

const fs = require('fs');
const path = require('path');
const mariadb = require('mariadb');

// ── Claves de almacenamiento (mismas reglas que src/storage/folders.ts) ──────────────────

const FOLDERS = ['logos', 'portadas', 'fondos', 'avatars', 'entregas', 'certificados', 'firmas', 'recursos'];
const FILE_NAME = /^[^./\\:\p{Cc}][^/\\:\p{Cc}]*$/u;

function isStorageKey(value) {
  if (typeof value !== 'string') return false;
  const [folder, name, ...rest] = value.split('/');
  return rest.length === 0 && FOLDERS.includes(folder) && Boolean(name) && FILE_NAME.test(name);
}

/**
 * Columnas que guardan un archivo. `soloUrls`: la columna también admite direcciones externas
 * (un vídeo de YouTube), así que sólo se toca lo que apunte al almacenamiento del campus.
 */
const FILE_COLUMNS = [
  { table: 'usuarios', id: 'guid', column: 'foto_url', folder: 'avatars' },
  { table: 'usuarios', id: 'guid', column: 'firma_url', folder: 'firmas' },
  { table: 'lms_cursos', id: 'guid', column: 'imagen_portada', folder: 'portadas' },
  { table: 'lms_recursos', id: 'guid', column: 'archivo_adjunto', folder: 'recursos' },
  { table: 'lms_recursos', id: 'guid', column: 'url_archivo', folder: 'recursos', soloUrls: true },
  { table: 'lms_recursos', id: 'guid', column: 'contenido_html', folder: 'recursos', soloUrls: true },
  { table: 'lms_entregas', id: 'guid', column: 'url_archivo_adjunto', folder: 'entregas' },
  { table: 'lms_certificados', id: 'id', column: 'archivo_pdf', folder: 'certificados' },
  { table: 'lms_configuracion', id: 'id', column: 'logo_url', folder: 'logos' },
  { table: 'lms_configuracion', id: 'id', column: 'favicon_url', folder: 'logos' },
  { table: 'lms_configuracion', id: 'id', column: 'login_fondo_url', folder: 'logos' },
];

const DOWNLOAD_PATH = '/storage/download/';

/**
 * Clave `carpeta/nombre` de un valor guardado por la versión de julio, o `null` si no apunta a
 * un archivo del campus. Julio guardaba la clave tal cual, un nombre suelto sin carpeta (los
 * archivos más antiguos y los PDF de los certificados), o la URL completa de descarga en los
 * bloques de imagen (`https://api-…/api/storage/download/recursos/…`).
 */
function keyFromStored(value, spec) {
  if (value == null) return null;
  let text = String(value).trim();
  if (!text || text.startsWith('data:') || /\s|</.test(text)) return null;

  const download = text.indexOf(DOWNLOAD_PATH);
  if (download >= 0) {
    text = text.slice(download + DOWNLOAD_PATH.length);
  } else if (/^https?:\/\//i.test(text)) {
    try {
      text = new URL(text).pathname.replace(/^\/+/, '');
    } catch {
      return null;
    }
  } else if (spec.soloUrls) {
    return isStorageKey(text) ? text : null;
  }

  text = text.split(/[?#]/)[0];
  try {
    text = decodeURIComponent(text);
  } catch {
    return null;
  }
  if (!text.includes('/') && !spec.soloUrls) text = `${spec.folder}/${text}`;
  return isStorageKey(text) ? text : null;
}

// ── Conexión ───────────────────────────────────────────────────────────────────────────────

function connectionOptions() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    fail(
      'Falta DATABASE_URL. Expórtala en esta terminal con la misma cadena de la aplicación:\n' +
        "  export DATABASE_URL='mysql://usuario:clave@127.0.0.1:3306/base'",
    );
  }
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    bigIntAsNumber: true,
    decimalAsNumber: true,
    dateStrings: true,
  };
}

let db;

async function q(sql, params = []) {
  return db.query(sql, params);
}

async function one(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] ? Object.values(rows[0])[0] : null;
}

async function tableExists(table) {
  return (
    (await one('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', [
      table,
    ])) > 0
  );
}

async function columnExists(table, column) {
  return (
    (await one(
      'SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
      [table, column],
    )) > 0
  );
}

/** Ejecuta una sentencia, la anuncia y dice cuántas filas tocó. */
async function step(description, sql, params = []) {
  const result = await q(sql, params);
  const isData = /^\s*(UPDATE|DELETE|INSERT)/i.test(sql);
  const rows = isData && typeof result?.affectedRows === 'number' ? ` (${result.affectedRows} filas)` : '';
  console.log(`  ✓ ${description}${rows}`);
  return result;
}

function title(text) {
  console.log(`\n── ${text} ${'─'.repeat(Math.max(0, 70 - text.length))}`);
}

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function storageDir({ required }) {
  const dir = process.env.STORAGE_DIR?.trim();
  if (!dir && required) {
    fail(
      'Falta STORAGE_DIR. Expórtala con la misma carpeta que tendrá la aplicación:\n' +
        "  export STORAGE_DIR='/home/usuario/lms-data/uploads'",
    );
  }
  return dir ? path.resolve(dir) : null;
}

// ── Estado de la base ──────────────────────────────────────────────────────────────────────

async function isJulySchema() {
  return (await tableExists('lms_lecciones')) && !(await columnExists('usuarios', 'pais'));
}

async function isNewSchema() {
  return !(await tableExists('lms_lecciones')) && (await columnExists('lms_matriculas', 'fecha_finalizacion'));
}

/** Valores de archivo que no se reconocen como clave del almacenamiento. */
async function unrecognizedFileValues() {
  const found = [];
  for (const spec of FILE_COLUMNS) {
    if (!(await columnExists(spec.table, spec.column))) continue;
    const rows = await q(
      `SELECT ${spec.id} AS id, ${spec.column} AS valor FROM ${spec.table} WHERE ${spec.column} IS NOT NULL AND ${spec.column} <> ''`,
    );
    for (const row of rows) {
      const text = String(row.valor).trim();
      if (spec.soloUrls && !text.includes(DOWNLOAD_PATH) && !isStorageKey(text)) continue;
      if (!keyFromStored(text, spec)) found.push({ ...spec, id: row.id, valor: text });
    }
  }
  return found;
}

// ── diagnostico ────────────────────────────────────────────────────────────────────────────

async function diagnostico() {
  const julio = await isJulySchema();
  const nueva = await isNewSchema();
  console.log(`Base: ${await one('SELECT DATABASE()')} · MariaDB ${await one('SELECT VERSION()')}`);
  if (nueva) {
    console.log('\nLa base ya tiene el esquema nuevo: no queda nada de julio que preparar.');
    return;
  }
  if (!julio) fail('La base no tiene la forma de la versión de julio ni de la actual. No sigas: revisa la copia.');
  console.log('Esquema de julio reconocido.');

  title('Contenido');
  for (const table of [
    'usuarios',
    'lms_cursos',
    'lms_modulos',
    'lms_lecciones',
    'lms_recursos',
    'lms_matriculas',
    'lms_entregas',
    'lms_certificados',
    'lms_plantillas_correo',
  ]) {
    console.log(`  ${table.padEnd(24)} ${await one(`SELECT COUNT(*) FROM ${table}`)}`);
  }

  let blocking = 0;
  let notes = 0;
  const block = (text) => {
    blocking++;
    console.log(`  ✗ ${text}`);
  };
  const note = (text) => {
    notes++;
    console.log(`  ! ${text}`);
  };

  title('Revisión');

  const nonAscii = await q("SELECT email FROM usuarios WHERE email REGEXP '[^ -~]'");
  if (nonAscii.length) {
    block(
      `Correos con caracteres no ASCII (ya no podrían entrar): ${nonAscii.map((r) => r.email).join(', ')}. ` +
        "Cámbialos por su forma ASCII: UPDATE usuarios SET email = '…' WHERE email = '…';",
    );
  }
  const pendingNonAscii = await q(
    "SELECT email FROM lms_solicitudes_acceso WHERE estado = 'PENDIENTE' AND email REGEXP '[^ -~]'",
  );
  if (pendingNonAscii.length) {
    note(
      `Solicitudes pendientes con correo no ASCII: ${pendingNonAscii.map((r) => r.email).join(', ')}. Recházalas tras actualizar.`,
    );
  }

  const maxGrade = await one('SELECT MAX(calificacion) FROM lms_entregas');
  const maxPassing = await one('SELECT MAX(nota_aprobacion) FROM lms_cursos');
  if ((maxGrade ?? 0) > 5 || (maxPassing ?? 0) > 5) {
    block(
      `Hay notas por encima de 5 (entregas: ${maxGrade}, aprobación: ${maxPassing}). La conversión a 0–100 ` +
        'multiplica por 20: no sigas hasta saber de dónde salen.',
    );
  }

  const configRows = await one('SELECT COUNT(*) FROM lms_configuracion');
  if (configRows > 1) block(`lms_configuracion tiene ${configRows} filas; debe tener una (pasa a ser la de Colombia).`);

  const longAttachments = await one('SELECT COUNT(*) FROM lms_recursos WHERE CHAR_LENGTH(archivo_adjunto) > 191');
  if (longAttachments > 0) {
    note(
      `${longAttachments} recurso(s) guardan el adjunto dentro de la base (Base64). «antes» los escribe como ` +
        'archivos en STORAGE_DIR/recursos: exporta STORAGE_DIR antes de ejecutarlo.',
    );
  }

  const inactive = await q('SELECT email FROM usuarios WHERE activo = 0');
  if (inactive.length) {
    note(
      `Cuentas desactivadas: ${inactive.map((r) => r.email).join(', ')}. La versión nueva no desactiva cuentas: ` +
        'podrán volver a entrar. Si alguna no debe, elimínala desde el panel después de actualizar.',
    );
  }

  const multiLesson = await q(
    `SELECT c.titulo AS curso, m.titulo AS modulo, COUNT(*) AS lecciones
     FROM lms_lecciones l JOIN lms_modulos m ON m.guid = l.modulo_guid JOIN lms_cursos c ON c.guid = m.curso_guid
     GROUP BY m.guid HAVING COUNT(*) > 1`,
  );
  for (const row of multiLesson) {
    note(
      `«${row.curso}» › «${row.modulo}» tiene ${row.lecciones} lecciones. Las lecciones desaparecen: sus recursos ` +
        'quedan seguidos en el módulo, en el mismo orden.',
    );
  }

  for (const table of ['lms_cursos', 'lms_modulos', 'lms_lecciones', 'lms_recursos']) {
    const deleted = await one(`SELECT COUNT(*) FROM ${table} WHERE deleted_at IS NOT NULL`);
    if (deleted > 0) note(`${table}: ${deleted} fila(s) marcadas como borradas; en la versión nueva volverán a verse.`);
  }

  const late = await one("SELECT COUNT(*) FROM lms_entregas WHERE estado = 'ENTREGADA_TARDE'");
  if (late > 0) console.log(`  · ${late} entrega(s) «entregada tarde» pasarán a «entregada».`);

  const orphanContacts = await one(
    `SELECT COUNT(*) FROM lms_contacto_chat t
     WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.guid = t.solicitante_guid)
        OR NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.guid = t.receptor_guid)`,
  );
  if (orphanContacts > 0) console.log(`  · ${orphanContacts} contacto(s) de chat de cuentas ya borradas se retirarán.`);

  const embedded = await one(`SELECT COUNT(*) FROM lms_recursos WHERE contenido_html LIKE '%<img%${DOWNLOAD_PATH}%'`);
  if (embedded > 0) {
    note(
      `${embedded} texto(s) de recursos incrustan imágenes con la dirección antigua de descarga. La versión nueva ` +
        'sólo sirve el material con enlace firmado: vuelve a insertar esas imágenes desde el constructor.',
    );
  }

  const unknown = await unrecognizedFileValues();
  for (const item of unknown.slice(0, 20)) {
    note(
      `${item.table}.${item.column} (${item.id}): «${item.valor.slice(0, 80)}» no se reconoce como archivo; se deja tal cual.`,
    );
  }
  if (unknown.length > 20) note(`… y ${unknown.length - 20} valores de archivo más sin reconocer.`);

  title('Resultado');
  if (blocking) {
    console.log(`  ${blocking} problema(s) que impiden seguir. Corrígelos y repite el diagnóstico.`);
    process.exitCode = 1;
  } else {
    console.log(`  Se puede seguir con «antes». ${notes ? `Revisa los ${notes} aviso(s) de arriba.` : ''}`);
  }
}

// ── antes ──────────────────────────────────────────────────────────────────────────────────

const MARKER_TABLE = '_migracion_julio';

async function antes() {
  if (await tableExists(MARKER_TABLE)) {
    fail(
      '«antes» ya se ejecutó en esta base (quizá a medias). No lo repitas: convertiría otra vez las notas. ' +
        'Si se cortó, restaura la copia de la base y empieza de nuevo; si terminó, sigue con «npx prisma db push».',
    );
  }
  if (!(await isJulySchema())) fail('La base no tiene la forma de la versión de julio.');

  const maxGrade = (await one('SELECT MAX(calificacion) FROM lms_entregas')) ?? 0;
  const maxPassing = (await one('SELECT MAX(nota_aprobacion) FROM lms_cursos')) ?? 0;
  if (maxGrade > 5 || maxPassing > 5)
    fail('Hay notas por encima de 5. Ejecuta «diagnostico» y revísalo antes de seguir.');
  if ((await one('SELECT COUNT(*) FROM lms_configuracion')) > 1) fail('lms_configuracion tiene más de una fila.');
  const nonAscii = await one("SELECT COUNT(*) FROM usuarios WHERE email REGEXP '[^ -~]'");
  if (nonAscii > 0) fail('Hay correos con caracteres no ASCII. Ejecuta «diagnostico» para verlos.');

  const longAttachments = await q(
    'SELECT guid, archivo_adjunto, archivo_adjunto_nombre FROM lms_recursos WHERE CHAR_LENGTH(archivo_adjunto) > 191',
  );
  const storage = storageDir({ required: longAttachments.length > 0 });

  await q(`CREATE TABLE ${MARKER_TABLE} (inicio DATETIME NOT NULL)`);
  await q(`INSERT INTO ${MARKER_TABLE} VALUES (NOW())`);

  title('Calificaciones: de 0–5 a 0–100');
  await step(
    'Nota de los cuestionarios antiguos que sólo la guardaban en el texto',
    `UPDATE lms_entregas
     SET calificacion = CAST(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(contenido_texto, '|', 1), ':', -1)) AS DECIMAL(6,2))
     WHERE calificacion IS NULL AND estado IN ('CALIFICADA', 'EN_REVISION')
       AND contenido_texto REGEXP '^NOTA: *[0-9]+(\\\\.[0-9]+)? *(\\\\||$)'`,
  );
  await step(
    'Notas de las entregas × 20',
    'UPDATE lms_entregas SET calificacion = LEAST(GREATEST(ROUND(calificacion * 20, 2), 0), 100) WHERE calificacion IS NOT NULL',
  );
  await step(
    'Nota mínima de aprobación de cada curso × 20 (3,0 → 60)',
    'UPDATE lms_cursos SET nota_aprobacion = LEAST(GREATEST(ROUND(nota_aprobacion * 20, 2), 0), 100)',
  );
  await step(
    'Nota media de los certificados × 20',
    'UPDATE lms_certificados SET nota_promedio = LEAST(GREATEST(ROUND(nota_promedio * 20, 2), 0), 100) WHERE nota_promedio IS NOT NULL',
  );
  await step(
    '«Entregada tarde» pasa a «entregada»',
    "UPDATE lms_entregas SET estado = 'ENTREGADA' WHERE estado = 'ENTREGADA_TARDE'",
  );

  title('Recursos: de la lección al módulo');
  await step('Columna modulo_guid', 'ALTER TABLE lms_recursos ADD COLUMN modulo_guid VARCHAR(191) NULL');
  await step(
    'Módulo y posición de cada recurso (orden de la lección y, dentro, el del recurso)',
    `UPDATE lms_recursos r JOIN (
       SELECT r2.guid, l.modulo_guid,
              ROW_NUMBER() OVER (PARTITION BY l.modulo_guid
                                 ORDER BY l.orden, l.created_at, l.guid, r2.orden, r2.created_at, r2.guid) - 1 AS posicion
       FROM lms_recursos r2 JOIN lms_lecciones l ON l.guid = r2.leccion_guid
     ) x ON x.guid = r.guid
     SET r.modulo_guid = x.modulo_guid, r.orden = x.posicion`,
  );
  const withoutModule = await one('SELECT COUNT(*) FROM lms_recursos WHERE modulo_guid IS NULL');
  if (withoutModule > 0) fail(`${withoutModule} recurso(s) sin módulo. Restaura la copia y revisa lms_lecciones.`);

  if (longAttachments.length) {
    title('Adjuntos guardados dentro de la base');
    for (const row of longAttachments) {
      const key = writeEmbeddedAttachment(storage, row);
      await q('UPDATE lms_recursos SET archivo_adjunto = ? WHERE guid = ?', [key, row.guid]);
      console.log(`  ✓ ${row.guid} → ${key}`);
    }
  }

  title('Sedes: todo lo existente pasa a Colombia');
  const country = "ENUM('COLOMBIA','MEXICO') NOT NULL DEFAULT 'COLOMBIA'";
  for (const table of [
    'usuarios',
    'lms_cursos',
    'lms_solicitudes_acceso',
    'lms_configuracion',
    'lms_plantillas_correo',
  ]) {
    await step(`${table}.pais`, `ALTER TABLE ${table} ADD COLUMN pais ${country}`);
  }
  await step(
    'lms_solicitudes_acceso.updated_at',
    'ALTER TABLE lms_solicitudes_acceso ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)',
  );
  await step('Fecha de las solicitudes', 'UPDATE lms_solicitudes_acceso SET updated_at = created_at');

  title('Certificados: titular, curso y sede guardados en el propio certificado');
  await step(
    'Columnas nombre_titular, curso_titulo y pais',
    `ALTER TABLE lms_certificados
       ADD COLUMN nombre_titular VARCHAR(191) NOT NULL DEFAULT '',
       ADD COLUMN curso_titulo VARCHAR(191) NOT NULL DEFAULT '',
       ADD COLUMN pais ${country}`,
  );
  await step(
    'Nombre del titular y título del curso',
    `UPDATE lms_certificados ce
     JOIN usuarios u ON u.guid = ce.usuario_guid
     JOIN lms_cursos cu ON cu.guid = ce.curso_guid
     SET ce.nombre_titular = CONCAT(u.nombre, ' ', u.apellido), ce.curso_titulo = cu.titulo`,
  );

  title('Limpieza para las claves ajenas nuevas');
  await step(
    'Contactos de chat de cuentas o cursos que ya no existen',
    `DELETE t FROM lms_contacto_chat t
     WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.guid = t.solicitante_guid)
        OR NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.guid = t.receptor_guid)
        OR NOT EXISTS (SELECT 1 FROM lms_cursos c WHERE c.guid = t.curso_guid)`,
  );

  title('Archivos: claves «carpeta/nombre»');
  await normalizeFileColumns();

  // `db push` rehace casi todas las claves ajenas, y MariaDB rechaza a veces crear una con el
  // nombre de la que acaba de retirar (errno 121, «Duplicate key on write or update»), lo que
  // deja el esquema a medias. Sin ellas, `db push` sólo tiene que crearlas.
  title('Claves ajenas de julio (db push las vuelve a crear)');
  const foreignKeys = await q(
    `SELECT table_name AS tabla, constraint_name AS nombre FROM information_schema.referential_constraints
     WHERE constraint_schema = DATABASE() ORDER BY table_name, constraint_name`,
  );
  for (const { tabla, nombre } of foreignKeys) {
    await q(`ALTER TABLE \`${tabla}\` DROP FOREIGN KEY \`${nombre}\``);
  }
  console.log(`  ✓ ${foreignKeys.length} retiradas`);

  title('Listo');
  console.log('  Ahora aplica el esquema:  npx prisma db push --accept-data-loss');
}

/** Escribe en el almacenamiento un adjunto que la base guardaba como Base64 y devuelve su clave. */
function writeEmbeddedAttachment(storage, row) {
  const raw = String(row.archivo_adjunto);
  const base64 = raw.includes(',') && raw.startsWith('data:') ? raw.slice(raw.indexOf(',') + 1) : raw;
  const ext = (path.extname(row.archivo_adjunto_nombre || '') || '.bin').toLowerCase();
  const name = `${Date.now()}-${require('crypto').randomBytes(4).toString('hex')}${ext}`;
  const dir = path.join(storage, 'recursos');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), Buffer.from(base64, 'base64'));
  return `recursos/${name}`;
}

async function normalizeFileColumns() {
  for (const spec of FILE_COLUMNS) {
    const rows = await q(
      `SELECT ${spec.id} AS id, ${spec.column} AS valor FROM ${spec.table} WHERE ${spec.column} IS NOT NULL AND ${spec.column} <> ''`,
    );
    let changed = 0;
    for (const row of rows) {
      const key = keyFromStored(row.valor, spec);
      if (key && key !== row.valor) {
        await q(`UPDATE ${spec.table} SET ${spec.column} = ? WHERE ${spec.id} = ?`, [key, row.id]);
        changed++;
      }
    }
    console.log(`  ✓ ${spec.table}.${spec.column} (${changed} de ${rows.length} ajustadas)`);
  }
}

// ── despues ────────────────────────────────────────────────────────────────────────────────

/**
 * Índices de julio que el esquema nuevo cubre con otros y que `db push` no retira solo: respaldan
 * una clave ajena, aunque otro índice que empieza por la misma columna ya la cubre.
 */
const REDUNDANT_INDEXES = [
  { table: 'lms_mensajes', index: 'lms_mensajes_destinatario_guid_idx' },
  { table: 'lms_mensajes', index: 'lms_mensajes_remitente_guid_idx' },
  { table: 'lms_modulos', index: 'lms_modulos_curso_guid_idx' },
  { table: 'lms_notificaciones', index: 'lms_notificaciones_usuario_guid_idx' },
];

async function despues() {
  if (!(await isNewSchema())) {
    fail('La base aún no tiene el esquema nuevo. Ejecuta antes «npx prisma db push --accept-data-loss».');
  }

  title('Matrículas: fin de la vuelta y avance');
  await step(
    'Matrículas ya certificadas',
    `UPDATE lms_matriculas m
     JOIN (SELECT usuario_guid, curso_guid, MAX(fecha_completado) AS fecha
           FROM lms_certificados WHERE curso_guid IS NOT NULL GROUP BY usuario_guid, curso_guid) c
       ON c.usuario_guid = m.usuario_guid AND c.curso_guid = m.curso_guid
     SET m.fecha_finalizacion = c.fecha
     WHERE m.fecha_finalizacion IS NULL AND c.fecha >= m.fecha_matricula`,
  );
  await step(
    'Recursos completados de cada matrícula',
    `UPDATE lms_matriculas m SET m.recursos_completados = (
       SELECT COUNT(*) FROM lms_progreso_recurso p
       JOIN lms_recursos r ON r.guid = p.recurso_guid
       JOIN lms_modulos mo ON mo.guid = r.modulo_guid
       WHERE p.usuario_guid = m.usuario_guid AND mo.curso_guid = m.curso_guid)`,
  );

  title('Índices redundantes');
  for (const { table, index } of REDUNDANT_INDEXES) {
    const exists = await one(
      'SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?',
      [table, index],
    );
    if (exists > 0) await step(`${table}.${index}`, `DROP INDEX ${index} ON ${table}`);
    else console.log(`  · ${table}.${index} ya no existe`);
  }

  title('Plantillas de correo: escala 0–100');
  await step(
    'Asuntos sin «/5.0»',
    "UPDATE lms_plantillas_correo SET asunto = REPLACE(asunto, '/5.0', '') WHERE asunto LIKE '%/5.0%'",
  );
  await step(
    'Cuerpos: «/5.0» pasa a «puntos»',
    "UPDATE lms_plantillas_correo SET cuerpo_html = REPLACE(cuerpo_html, '/5.0', ' puntos') WHERE cuerpo_html LIKE '%/5.0%'",
  );
  await step(
    'El correo de calificación muestra el comentario del examinador',
    `UPDATE lms_plantillas_correo p JOIN lms_eventos_correo e ON e.id = p.evento_id
     SET p.cuerpo_html = REPLACE(p.cuerpo_html, '{{mensaje_aprobacion}}', '{{mensaje_aprobacion}}\\n{{comentario}}')
     WHERE e.identificador = 'CALIFICACION_RECIBIDA' AND p.cuerpo_html NOT LIKE '%{{comentario}}%'`,
  );

  title('Listo');
  console.log('  Sigue con «archivos» y después con «npx prisma db seed».');
}

// ── archivos ───────────────────────────────────────────────────────────────────────────────

/** Claves de archivo que usa la base, con el sitio de donde salen. */
async function referencedKeys() {
  const keys = new Map();
  for (const spec of FILE_COLUMNS) {
    const rows = await q(
      `SELECT ${spec.id} AS id, ${spec.column} AS valor FROM ${spec.table} WHERE ${spec.column} IS NOT NULL`,
    );
    for (const row of rows) {
      const value = String(row.valor).trim();
      if (isStorageKey(value) && !keys.has(value)) keys.set(value, `${spec.table}.${spec.column} (${row.id})`);
    }
  }
  return keys;
}

/** Dónde puede estar un archivo en la carpeta antigua: dentro de su carpeta o suelto. */
function sourceOf(origin, key) {
  const [folder, name] = key.split('/');
  for (const candidate of [path.join(origin, folder, name), path.join(origin, name)]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

async function archivos() {
  if (!(await isNewSchema())) fail('Ejecuta primero «antes», «npx prisma db push --accept-data-loss» y «despues».');
  const storage = storageDir({ required: true });
  const origin = argument('--origen');
  if (!origin) fail('Indica la carpeta de archivos de la versión de julio: --origen /home/usuario/…/uploads');
  const originDir = path.resolve(origin);
  if (!fs.existsSync(originDir)) fail(`No existe ${originDir}.`);
  if (originDir === storage)
    fail('--origen y STORAGE_DIR son la misma carpeta: usa una carpeta nueva para STORAGE_DIR.');
  const move = process.argv.includes('--mover');

  title(`De ${originDir} a ${storage}${move ? ' (moviendo)' : ' (copiando)'}`);
  for (const folder of FOLDERS) fs.mkdirSync(path.join(storage, folder), { recursive: true, mode: 0o700 });

  const keys = await referencedKeys();
  let placed = 0;
  let already = 0;
  const missing = [];
  for (const [key, where] of keys) {
    const target = path.join(storage, key);
    if (fs.existsSync(target)) {
      already++;
      continue;
    }
    const source = sourceOf(originDir, key);
    if (!source) {
      missing.push(`${key}  ← ${where}`);
      continue;
    }
    if (move) {
      try {
        fs.renameSync(source, target);
      } catch {
        fs.copyFileSync(source, target);
        fs.rmSync(source);
      }
    } else {
      fs.copyFileSync(source, target);
    }
    placed++;
  }

  console.log(`  ✓ ${placed} archivo(s) ${move ? 'movidos' : 'copiados'}; ${already} ya estaban en su sitio.`);
  if (missing.length) {
    console.log(`  ! ${missing.length} archivo(s) que la base usa y no están en el origen:`);
    for (const line of missing) console.log(`      ${line}`);
    console.log('    Búscalos en la copia de seguridad y vuelve a ejecutar este paso.');
  }
  console.log('  Lo que quede en el origen no lo usa ninguna fila: puedes conservarlo como copia o borrarlo.');
}

// ── comprobar ──────────────────────────────────────────────────────────────────────────────

async function comprobar() {
  let problems = 0;
  const problem = (text) => {
    problems++;
    console.log(`  ✗ ${text}`);
  };
  const ok = (text) => console.log(`  ✓ ${text}`);

  title('Esquema');
  if (!(await isNewSchema())) {
    problem('La base no tiene el esquema nuevo.');
    return finish(problems);
  }
  ok('Esquema nuevo aplicado');
  if (await tableExists(MARKER_TABLE)) problem(`Sigue la tabla ${MARKER_TABLE}: el «db push» no terminó.`);

  title('Datos');
  const maxGrade = await one('SELECT MAX(calificacion) FROM lms_entregas');
  const minPassing = await one('SELECT MIN(nota_aprobacion) FROM lms_cursos');
  ok(`Nota más alta de una entrega: ${maxGrade ?? '—'} · aprobación más baja: ${minPassing ?? '—'} (escala 0–100)`);
  const badPassing = await one('SELECT COUNT(*) FROM lms_cursos WHERE nota_aprobacion > 100 OR nota_aprobacion < 0');
  if (badPassing > 0) problem(`${badPassing} curso(s) con nota de aprobación fuera de 0–100.`);
  for (const row of await q('SELECT pais, rol, COUNT(*) AS n FROM usuarios GROUP BY pais, rol ORDER BY pais, rol')) {
    ok(`${row.pais} · ${row.rol}: ${row.n}`);
  }
  const templates = await q('SELECT pais, COUNT(*) AS n FROM lms_plantillas_correo GROUP BY pais');
  ok(`Plantillas de correo: ${templates.map((r) => `${r.pais} ${r.n}`).join(', ') || 'ninguna'}`);
  if (templates.length < 2) problem('Faltan las plantillas de alguna sede: ejecuta «npx prisma db seed».');
  const nonAscii = await one("SELECT COUNT(*) FROM usuarios WHERE email REGEXP '[^ -~]'");
  if (nonAscii > 0) problem(`${nonAscii} cuenta(s) con correo no ASCII: no podrán entrar.`);

  title('Cuestionarios');
  const quizzes = await q(
    'SELECT guid, titulo, quiz_config FROM lms_recursos WHERE quiz_config IS NOT NULL AND quiz_config <> ""',
  );
  const parser = loadQuizParser();
  if (!parser) {
    console.log(
      '  · No se encontró dist/courses/quiz-config.js: sube la API compilada para revisar los cuestionarios.',
    );
  } else {
    let valid = 0;
    for (const quiz of quizzes) {
      try {
        parser.parseQuizConfig(quiz.quiz_config);
        valid++;
      } catch (error) {
        problem(`«${quiz.titulo}» (${quiz.guid}): ${error.message}. Rehazlo desde el constructor.`);
      }
    }
    ok(`${valid} de ${quizzes.length} cuestionario(s) válidos`);
  }

  title('Archivos');
  const storage = storageDir({ required: false });
  if (!storage) {
    console.log('  · Exporta STORAGE_DIR para comprobar que cada archivo está en su sitio.');
  } else {
    const keys = await referencedKeys();
    const missing = [...keys].filter(([key]) => !fs.existsSync(path.join(storage, key)));
    ok(`${keys.size - missing.length} de ${keys.size} archivo(s) en ${storage}`);
    for (const [key, where] of missing.slice(0, 30)) problem(`Falta ${key}  ← ${where}`);
    if (missing.length > 30) problem(`… y ${missing.length - 30} más.`);
  }
  const unknown = await unrecognizedFileValues();
  for (const item of unknown.slice(0, 20)) {
    console.log(
      `  ! ${item.table}.${item.column} (${item.id}) no es un archivo del campus: «${item.valor.slice(0, 80)}»`,
    );
  }

  finish(problems);
}

function loadQuizParser() {
  const file = path.join(__dirname, '..', '..', 'dist', 'courses', 'quiz-config.js');
  return fs.existsSync(file) ? require(file) : null;
}

function finish(problems) {
  title('Resultado');
  console.log(problems ? `  ${problems} problema(s) por revisar.` : '  Todo en orden.');
  if (problems) process.exitCode = 1;
}

// ── Entrada ────────────────────────────────────────────────────────────────────────────────

const STEPS = { diagnostico, antes, despues, archivos, comprobar };

async function main() {
  const name = process.argv[2];
  const run = STEPS[name];
  if (!run) fail(`Indica un paso: ${Object.keys(STEPS).join(' | ')}`);

  db = await mariadb.createConnection(connectionOptions());
  try {
    await run();
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}`);
  if (process.argv[2] === 'antes') {
    console.error('  «antes» se detuvo a medias: restaura la copia de la base antes de volver a intentarlo.');
  }
  process.exit(1);
});
