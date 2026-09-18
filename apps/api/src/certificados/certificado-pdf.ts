import { formatearNota } from '../common/domain/calificacion';

// PDFKit no trae tipos propios utilizables con `import` en este proyecto.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');

/** A4 apaisado, en puntos PostScript. */
const ANCHO = 842;
const ALTO = 595;

/** Datos con los que se compone el certificado. */
export interface DatosCertificado {
  nombreEstudiante: string;
  tituloCurso: string;
  fechaInicio: Date;
  fechaCompletado: Date;
  tiempoHoras: number;
  /** Promedio del curso en escala 0–100, o `null` si el curso no tuvo evaluaciones. */
  notaPromedio: number | null;
  codigoVerificacion: string;
  nombreProfesor: string;
  nombrePlataforma: string;
  colorPrimario: string;
  colorSecundario: string;
  totalModulos: number;
  totalRecursos: number;
  textoLegal: string;
  tituloPersonalizado: string | null;
  subtitulo: string | null;
  mostrarModulos: boolean;
  mostrarRecursos: boolean;
  mostrarNota: boolean;
  mostrarFirma: boolean;
  mostrarFechaIngreso: boolean;
  firmaNombre: string | null;
  firmaCargo: string | null;
  /**
   * Imágenes ya cargadas en memoria.
   *
   * Se reciben como `Buffer` y no como ruta de disco a propósito: con el almacenamiento en
   * R2 los archivos no existen en el sistema de ficheros, y la versión anterior los
   * buscaba en `uploads/` y se rendía en silencio. El resultado era que en producción el
   * certificado salía siempre sin logotipo y sin firma.
   */
  logo: Buffer | null;
  firma: Buffer | null;
}

/**
 * Compone el certificado y lo devuelve como PDF en memoria.
 *
 * Devolver un `Buffer` en lugar de escribir en una ruta permite que quien llama decida
 * el destino (R2 o disco) con la misma ruta de código, sin la copia local intermedia que
 * antes quedaba huérfana cuando la subida a R2 fallaba.
 */
export function componerCertificado(datos: DatosCertificado): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [ANCHO, ALTO],
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      info: {
        Title: `Certificado - ${datos.tituloCurso}`,
        Author: datos.nombrePlataforma,
        Subject: `Certificado de finalización de ${datos.nombreEstudiante}`,
      },
    });

    const trozos: Buffer[] = [];
    doc.on('data', (trozo: Buffer) => trozos.push(trozo));
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);

    try {
      dibujar(doc, datos);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function dibujar(doc: PDFKit.PDFDocument, datos: DatosCertificado): void {
  const primario = datos.colorPrimario;
  const secundario = datos.colorSecundario;

  doc.rect(0, 0, ANCHO, ALTO).fill('#FAFAFA');

  // Marco académico doble
  doc
    .rect(24, 24, ANCHO - 48, ALTO - 48)
    .lineWidth(3)
    .stroke(primario);
  doc
    .rect(30, 30, ANCHO - 60, ALTO - 60)
    .lineWidth(1)
    .stroke(secundario);

  esquina(doc, 36, 36, primario, false, false);
  esquina(doc, ANCHO - 36, 36, secundario, true, false);
  esquina(doc, 36, ALTO - 36, secundario, false, true);
  esquina(doc, ANCHO - 36, ALTO - 36, primario, true, true);

  const yCabecera = dibujarCabecera(doc, datos, primario);
  const ySeparador = yCabecera + 10;
  separador(doc, ySeparador, 160, primario);

  doc
    .fontSize(32)
    .font('Times-Bold')
    .fillColor('#1E293B')
    .text(datos.tituloPersonalizado || 'CERTIFICADO', 0, ySeparador + 15, { align: 'center', width: ANCHO });

  doc
    .fontSize(11)
    .font('Times-Roman')
    .fillColor('#64748B')
    .text(datos.subtitulo || 'DE FINALIZACIÓN ACADÉMICA', 0, ySeparador + 50, {
      align: 'center',
      width: ANCHO,
      characterSpacing: 5,
    });

  doc
    .fontSize(12)
    .font('Times-Italic')
    .fillColor('#94A3B8')
    .text('El presente documento se otorga a:', 0, ySeparador + 80, { align: 'center', width: ANCHO });

  doc
    .fontSize(28)
    .font('Times-BoldItalic')
    .fillColor(primario)
    .text(datos.nombreEstudiante, 0, ySeparador + 105, { align: 'center', width: ANCHO });

  const yLineaNombre = ySeparador + 140;
  separador(doc, yLineaNombre, Math.min(datos.nombreEstudiante.length * 15 + 60, 500), primario);

  doc
    .fontSize(12)
    .font('Times-Italic')
    .fillColor('#64748B')
    .text(
      'Por haber completado y aprobado satisfactoriamente los requisitos del programa formativo:',
      0,
      yLineaNombre + 15,
      { align: 'center', width: ANCHO },
    );

  doc
    .fontSize(18)
    .font('Times-Bold')
    .fillColor('#1E293B')
    .text(`"${datos.tituloCurso}"`, 60, yLineaNombre + 35, { align: 'center', width: ANCHO - 120 });

  const yLegal = yLineaNombre + 65;
  doc
    .fontSize(10)
    .font('Times-Roman')
    .fillColor('#475569')
    .text(datos.textoLegal, 80, yLegal, { align: 'center', width: ANCHO - 160, lineGap: 4 });

  dibujarMetricas(doc, datos, yLegal + 45);

  if (datos.mostrarFirma) dibujarFirma(doc, datos);

  doc
    .fontSize(8)
    .font('Times-Roman')
    .fillColor('#94A3B8')
    .text(`Código de verificación institucional: ${datos.codigoVerificacion}`, 0, ALTO - 45, {
      align: 'center',
      width: ANCHO,
    });
}

/** Dibuja el logotipo o, si no hay, el nombre de la plataforma. Devuelve la Y siguiente. */
function dibujarCabecera(doc: PDFKit.PDFDocument, datos: DatosCertificado, primario: string): number {
  const y = 55;

  if (datos.logo) {
    try {
      doc.image(datos.logo, ANCHO / 2 - 45, y, { fit: [90, 90], align: 'center', valign: 'center' });
      return y + 105;
    } catch {
      // Un logotipo ilegible no puede impedir emitir el certificado: se cae al texto.
    }
  }

  doc
    .fontSize(16)
    .font('Times-Bold')
    .fillColor(primario)
    .text(datos.nombrePlataforma.toUpperCase(), 0, y, { align: 'center', width: ANCHO, characterSpacing: 2 });
  return y + 30;
}

function dibujarMetricas(doc: PDFKit.PDFDocument, datos: DatosCertificado, y: number): void {
  const metricas: { etiqueta: string; valor: string }[] = [];

  if (datos.mostrarFechaIngreso) {
    metricas.push({ etiqueta: 'Fecha de inscripción', valor: fecha(datos.fechaInicio) });
  }
  metricas.push({ etiqueta: 'Fecha de expedición', valor: fecha(datos.fechaCompletado) });
  metricas.push({ etiqueta: 'Duración', valor: `${datos.tiempoHoras} horas` });

  if (datos.mostrarModulos) metricas.push({ etiqueta: 'Módulos', valor: String(datos.totalModulos) });
  if (datos.mostrarRecursos) metricas.push({ etiqueta: 'Recursos', valor: String(datos.totalRecursos) });
  if (datos.mostrarNota && datos.notaPromedio !== null) {
    metricas.push({ etiqueta: 'Calificación promedio', valor: formatearNota(datos.notaPromedio) });
  }

  const ancho = (ANCHO - 120) / metricas.length;
  metricas.forEach((metrica, i) => {
    const x = 60 + i * ancho;
    doc
      .fontSize(9)
      .font('Times-Roman')
      .fillColor('#64748B')
      .text(metrica.etiqueta.toUpperCase(), x, y, { width: ancho, align: 'center' });
    doc
      .fontSize(12)
      .font('Times-Bold')
      .fillColor('#1E293B')
      .text(metrica.valor, x, y + 14, { width: ancho, align: 'center' });
  });
}

function dibujarFirma(doc: PDFKit.PDFDocument, datos: DatosCertificado): void {
  const y = ALTO - 110;

  if (datos.firma) {
    try {
      doc.image(datos.firma, ANCHO / 2 - 60, y - 40, { fit: [120, 35], align: 'center', valign: 'center' });
    } catch {
      // Sin la imagen queda la línea y el nombre, que es lo que da validez formal.
    }
  }

  const ancho = 220;
  doc
    .moveTo(ANCHO / 2 - ancho / 2, y)
    .lineTo(ANCHO / 2 + ancho / 2, y)
    .lineWidth(0.8)
    .stroke('#94A3B8');

  doc
    .fontSize(11)
    .font('Times-Bold')
    .fillColor('#1E293B')
    .text(datos.firmaNombre || datos.nombreProfesor, 0, y + 8, { align: 'center', width: ANCHO });

  doc
    .fontSize(10)
    .font('Times-Italic')
    .fillColor('#64748B')
    .text(datos.firmaCargo || 'Instructor / Examinador Académico', 0, y + 22, { align: 'center', width: ANCHO });
}

/** Línea horizontal con degradado, usada bajo la cabecera y bajo el nombre. */
function separador(doc: PDFKit.PDFDocument, y: number, ancho: number, color: string): void {
  const x1 = ANCHO / 2 - ancho / 2;
  const x2 = ANCHO / 2 + ancho / 2;
  const degradado = doc.linearGradient(x1, y, x2, y);
  degradado.stop(0, '#E2E8F0').stop(0.5, color).stop(1, '#E2E8F0');
  doc.moveTo(x1, y).lineTo(x2, y).lineWidth(1).stroke(degradado);
}

/** Adorno en forma de escuadra para las esquinas del marco. */
function esquina(doc: PDFKit.PDFDocument, x: number, y: number, color: string, volteaX: boolean, volteaY: boolean) {
  const tamano = 16;
  const dx = volteaX ? -1 : 1;
  const dy = volteaY ? -1 : 1;

  doc
    .moveTo(x, y + dy * tamano)
    .lineTo(x, y)
    .lineTo(x + dx * tamano, y)
    .lineWidth(2)
    .lineCap('round')
    .stroke(color);
}

function fecha(valor: Date): string {
  const dia = String(valor.getDate()).padStart(2, '0');
  const mes = String(valor.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${valor.getFullYear()}`;
}
