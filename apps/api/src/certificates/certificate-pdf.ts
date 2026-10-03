import { formatScore } from '../common/domain/grading';

// Los tipos de `@types/pdfkit` declaran el módulo como una instancia y no como el
// constructor, así que con `import` no se puede hacer `new`. Se carga sin tipar.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

/** A4 apaisado, en puntos PostScript. */
const WIDTH = 842;
const HEIGHT = 595;

/** Datos con los que se compone el certificado. */
export interface CertificateData {
  studentName: string;
  courseTitle: string;
  startedAt: Date;
  completedAt: Date;
  /** Horas que acredita el programa. No es lo que tardó el alumno. */
  totalHours: number;
  /** Hasta cuándo acredita. Nulo cuando la sede no declara vigencia. */
  validUntil: Date | null;
  /** Promedio del curso en escala 0–100, o `null` si el curso no tuvo evaluaciones. */
  averageScore: number | null;
  verificationCode: string;
  teacherName: string;
  platformName: string;
  primaryColor: string;
  secondaryColor: string;
  totalModules: number;
  totalResources: number;
  legalText: string;
  customTitle: string | null;
  subtitle: string | null;
  showModules: boolean;
  showResources: boolean;
  showScore: boolean;
  showSignature: boolean;
  showEnrollmentDate: boolean;
  signatureName: string | null;
  signatureTitle: string | null;
  /**
   * Imágenes ya cargadas en memoria. Se reciben como `Buffer` y no como ruta de disco
   * porque con el almacenamiento en R2 los archivos no existen en el sistema de ficheros.
   */
  logo: Buffer | null;
  signature: Buffer | null;
}

/**
 * Compone el certificado y lo devuelve como PDF en memoria, para que quien llama decida el
 * destino (R2 o disco) sin copias locales intermedias.
 */
export function composeCertificate(data: CertificateData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [WIDTH, HEIGHT],
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      info: {
        Title: `Certificado - ${data.courseTitle}`,
        Author: data.platformName,
        Subject: `Certificado de finalización de ${data.studentName}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      draw(doc, data);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function draw(doc: PDFKit.PDFDocument, data: CertificateData): void {
  const primary = data.primaryColor;
  const secondary = data.secondaryColor;

  doc.rect(0, 0, WIDTH, HEIGHT).fill('#FAFAFA');

  // Marco académico doble
  doc
    .rect(24, 24, WIDTH - 48, HEIGHT - 48)
    .lineWidth(3)
    .stroke(primary);
  doc
    .rect(30, 30, WIDTH - 60, HEIGHT - 60)
    .lineWidth(1)
    .stroke(secondary);

  corner(doc, 36, 36, primary, false, false);
  corner(doc, WIDTH - 36, 36, secondary, true, false);
  corner(doc, 36, HEIGHT - 36, secondary, false, true);
  corner(doc, WIDTH - 36, HEIGHT - 36, primary, true, true);

  const yHeader = drawHeader(doc, data, primary);
  const ySeparator = yHeader + 10;
  separator(doc, ySeparator, 160, primary);

  doc
    .fontSize(32)
    .font('Times-Bold')
    .fillColor('#1E293B')
    .text(data.customTitle || 'CERTIFICADO', 0, ySeparator + 15, { align: 'center', width: WIDTH });

  doc
    .fontSize(11)
    .font('Times-Roman')
    .fillColor('#64748B')
    .text(data.subtitle || 'DE FINALIZACIÓN ACADÉMICA', 0, ySeparator + 50, {
      align: 'center',
      width: WIDTH,
      characterSpacing: 5,
    });

  doc
    .fontSize(12)
    .font('Times-Italic')
    .fillColor('#94A3B8')
    .text('El presente documento se otorga a:', 0, ySeparator + 80, { align: 'center', width: WIDTH });

  doc
    .fontSize(28)
    .font('Times-BoldItalic')
    .fillColor(primary)
    .text(data.studentName, 0, ySeparator + 105, { align: 'center', width: WIDTH });

  const yNameLine = ySeparator + 140;
  separator(doc, yNameLine, Math.min(data.studentName.length * 15 + 60, 500), primary);

  doc
    .fontSize(12)
    .font('Times-Italic')
    .fillColor('#64748B')
    .text(
      'Por haber completado y aprobado satisfactoriamente los requisitos del programa formativo:',
      0,
      yNameLine + 15,
      { align: 'center', width: WIDTH },
    );

  doc
    .fontSize(18)
    .font('Times-Bold')
    .fillColor('#1E293B')
    .text(`"${data.courseTitle}"`, 60, yNameLine + 35, { align: 'center', width: WIDTH - 120 });

  const yLegal = yNameLine + 65;
  doc
    .fontSize(10)
    .font('Times-Roman')
    .fillColor('#475569')
    .text(data.legalText, 80, yLegal, { align: 'center', width: WIDTH - 160, lineGap: 4 });

  drawMetrics(doc, data, yLegal + 45);

  if (data.showSignature) drawSignature(doc, data);

  doc
    .fontSize(8)
    .font('Times-Roman')
    .fillColor('#94A3B8')
    .text(`Código de verificación institucional: ${data.verificationCode}`, 0, HEIGHT - 45, {
      align: 'center',
      width: WIDTH,
    });
}

/** Dibuja el logotipo o, si no hay, el nombre de la plataforma. Devuelve la Y siguiente. */
function drawHeader(doc: PDFKit.PDFDocument, data: CertificateData, primary: string): number {
  const y = 55;

  if (data.logo) {
    try {
      doc.image(data.logo, WIDTH / 2 - 45, y, { fit: [90, 90], align: 'center', valign: 'center' });
      return y + 105;
    } catch {
      // Un logotipo ilegible no puede impedir emitir el certificado: se cae al texto.
    }
  }

  doc
    .fontSize(16)
    .font('Times-Bold')
    .fillColor(primary)
    .text(data.platformName.toUpperCase(), 0, y, { align: 'center', width: WIDTH, characterSpacing: 2 });
  return y + 30;
}

function drawMetrics(doc: PDFKit.PDFDocument, data: CertificateData, y: number): void {
  const metrics: { label: string; value: string }[] = [];

  if (data.showEnrollmentDate) {
    metrics.push({ label: 'Fecha de inscripción', value: date(data.startedAt) });
  }
  metrics.push({ label: 'Fecha de expedición', value: date(data.completedAt) });
  // «Intensidad horaria» y no «Duración»: son las horas que dura el programa, no las que
  // tardó esta persona en hacerlo. Quien lee el certificado no tiene por qué adivinarlo.
  metrics.push({ label: 'Intensidad horaria', value: `${data.totalHours} horas` });
  if (data.validUntil) {
    metrics.push({ label: 'Válido hasta', value: date(data.validUntil) });
  }

  if (data.showModules) metrics.push({ label: 'Módulos', value: String(data.totalModules) });
  if (data.showResources) metrics.push({ label: 'Recursos', value: String(data.totalResources) });
  if (data.showScore && data.averageScore !== null) {
    metrics.push({ label: 'Calificación promedio', value: formatScore(data.averageScore) });
  }

  const width = (WIDTH - 120) / metrics.length;
  metrics.forEach((metric, i) => {
    const x = 60 + i * width;
    doc
      .fontSize(9)
      .font('Times-Roman')
      .fillColor('#64748B')
      .text(metric.label.toUpperCase(), x, y, { width, align: 'center' });
    doc
      .fontSize(12)
      .font('Times-Bold')
      .fillColor('#1E293B')
      .text(metric.value, x, y + 14, { width, align: 'center' });
  });
}

function drawSignature(doc: PDFKit.PDFDocument, data: CertificateData): void {
  const y = HEIGHT - 110;

  if (data.signature) {
    try {
      doc.image(data.signature, WIDTH / 2 - 60, y - 40, { fit: [120, 35], align: 'center', valign: 'center' });
    } catch {
      // Sin la imagen queda la línea y el nombre, que es lo que da validez formal.
    }
  }

  const width = 220;
  doc
    .moveTo(WIDTH / 2 - width / 2, y)
    .lineTo(WIDTH / 2 + width / 2, y)
    .lineWidth(0.8)
    .stroke('#94A3B8');

  doc
    .fontSize(11)
    .font('Times-Bold')
    .fillColor('#1E293B')
    .text(data.signatureName || data.teacherName, 0, y + 8, { align: 'center', width: WIDTH });

  doc
    .fontSize(10)
    .font('Times-Italic')
    .fillColor('#64748B')
    .text(data.signatureTitle || 'Instructor / Examinador Académico', 0, y + 22, { align: 'center', width: WIDTH });
}

/** Línea horizontal con degradado, usada bajo la cabecera y bajo el nombre. */
function separator(doc: PDFKit.PDFDocument, y: number, width: number, color: string): void {
  const x1 = WIDTH / 2 - width / 2;
  const x2 = WIDTH / 2 + width / 2;
  const gradient = doc.linearGradient(x1, y, x2, y);
  gradient.stop(0, '#E2E8F0').stop(0.5, color).stop(1, '#E2E8F0');
  doc.moveTo(x1, y).lineTo(x2, y).lineWidth(1).stroke(gradient);
}

/** Adorno en forma de escuadra para las esquinas del marco. */
function corner(doc: PDFKit.PDFDocument, x: number, y: number, color: string, flipX: boolean, flipY: boolean) {
  const size = 16;
  const dx = flipX ? -1 : 1;
  const dy = flipY ? -1 : 1;

  doc
    .moveTo(x, y + dy * size)
    .lineTo(x, y)
    .lineTo(x + dx * size, y)
    .lineWidth(2)
    .lineCap('round')
    .stroke(color);
}

function date(value: Date): string {
  const day = String(value.getDate()).padStart(2, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${value.getFullYear()}`;
}
