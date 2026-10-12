import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { FORMATS_BY_FOLDER, Folder, PDF_IMAGES } from './folders';

/** Extensiones admitidas y su tipo MIME. Lo que no esté aquí no se sube. */
const ALLOWED_TYPES: Readonly<Record<string, string>> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
};

/** Pueden llevar scripts dentro: se sirven con una CSP que impide ejecutarlos. */
const ACTIVE_CONTENT_FORMATS = ['.svg'];

/** Bytes que identifican un formato y la posición del archivo en la que aparecen. */
interface FileSignature {
  readonly offset: number;
  readonly bytes: readonly number[];
}

const leading = (...bytes: number[]): FileSignature => ({ offset: 0, bytes });

const ZIP = leading(0x50, 0x4b, 0x03, 0x04);
/** Contenedor de la ofimática anterior a 2007 (.doc, .xls, .ppt). */
const OLE2 = leading(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);

/** Firmas conocidas de cada extensión: basta con que coincida una para no ser un binario renombrado. */
const FILE_SIGNATURES: Readonly<Record<string, readonly FileSignature[]>> = {
  '.pdf': [leading(0x25, 0x50, 0x44, 0x46)],
  '.png': [leading(0x89, 0x50, 0x4e, 0x47)],
  '.jpg': [leading(0xff, 0xd8, 0xff)],
  '.jpeg': [leading(0xff, 0xd8, 0xff)],
  '.gif': [leading(0x47, 0x49, 0x46, 0x38)],
  '.webp': [leading(0x52, 0x49, 0x46, 0x46)],
  '.zip': [ZIP, leading(0x50, 0x4b, 0x05, 0x06)],
  // Los formatos de Office modernos son ZIP por dentro.
  '.docx': [ZIP],
  '.xlsx': [ZIP],
  '.pptx': [ZIP],
  '.doc': [OLE2],
  '.xls': [OLE2],
  '.ppt': [OLE2],
  '.rar': [leading(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07)],
  // MP4 declara su formato en la caja `ftyp`, tras los cuatro bytes de su tamaño.
  '.mp4': [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }],
  '.mp3': [leading(0x49, 0x44, 0x33), leading(0xff, 0xfb), leading(0xff, 0xf3), leading(0xff, 0xf2)],
};

const FILE_SIGNATURE_LENGTH = Math.max(
  ...Object.values(FILE_SIGNATURES).flatMap((signatures) => signatures.map((s) => s.offset + s.bytes.length)),
);

/** No tienen firma, pero un binario renombrado se delata en su contenido. */
const TEXT_FORMATS = ['.txt', '.csv'];

const TEXT_SAMPLE_LENGTH = 8 * 1024;

/** Ejecutables de Windows (MZ) y de Linux (ELF). */
const EXECUTABLE_SIGNATURES = [leading(0x4d, 0x5a), leading(0x7f, 0x45, 0x4c, 0x46)];

function hasSignature(header: Buffer, { offset, bytes }: FileSignature): boolean {
  return header.length >= offset + bytes.length && bytes.every((byte, i) => header[offset + i] === byte);
}

function looksLikeText(sample: Buffer): boolean {
  return !sample.includes(0) && !EXECUTABLE_SIGNATURES.some((signature) => hasSignature(sample, signature));
}

function extensionOf(name: string): string {
  return path.extname(name).toLowerCase();
}

function unsupportedInFolderMessage(folder: Folder, formats: readonly string[]): string {
  switch (folder) {
    case 'entregas':
      return `En las entregas sólo se admiten estos formatos: ${formats.join(', ')}.`;
    case 'logos':
      return 'El logotipo y el favicon tienen que ser PNG o JPG: son los formatos que muestran los certificados y los correos.';
    case 'firmas':
      return 'La firma tiene que ser PNG o JPG: son los formatos que el certificado sabe imprimir.';
    default:
      return `Aquí sólo se admiten imágenes: ${formats.join(', ')}.`;
  }
}

/**
 * Extensión de un archivo que se quiere subir a `folder`.
 * @throws BadRequestException si el formato no se admite en la plataforma o en esa carpeta.
 */
export function acceptedExtension(originalName: string, folder: Folder): string {
  const extension = extensionOf(originalName);
  if (!ALLOWED_TYPES[extension]) {
    throw new BadRequestException(
      `No se admiten archivos "${extension || 'sin extensión'}". Formatos válidos: ${Object.keys(ALLOWED_TYPES).join(', ')}.`,
    );
  }

  const folderFormats = FORMATS_BY_FOLDER[folder];
  if (folderFormats && !folderFormats.includes(extension)) {
    throw new BadRequestException(unsupportedInFolderMessage(folder, folderFormats));
  }
  return extension;
}

async function readHeader(filePath: string, length: number): Promise<Buffer> {
  const file = await fs.promises.open(filePath, 'r');
  try {
    const header = Buffer.alloc(length);
    const { bytesRead } = await file.read(header, 0, length, 0);
    return header.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

/**
 * Comprueba, leyendo sólo su cabecera, que el contenido corresponda a la extensión: impide
 * subir un ejecutable renombrado como `.pdf` o como `.txt`.
 * @throws BadRequestException si no corresponde.
 */
export async function verifyContent(filePath: string, extension: string): Promise<void> {
  const signatures = FILE_SIGNATURES[extension];
  const isText = TEXT_FORMATS.includes(extension);
  if (!signatures && !isText) return;

  const header = await readHeader(filePath, isText ? TEXT_SAMPLE_LENGTH : FILE_SIGNATURE_LENGTH);
  const valid = signatures ? signatures.some((signature) => hasSignature(header, signature)) : looksLikeText(header);
  if (!valid) {
    throw new BadRequestException(
      `El contenido del archivo no corresponde a un ${extension}. Puede estar dañado o tener la extensión cambiada.`,
    );
  }
}

export function contentTypeOf(key: string): string {
  return ALLOWED_TYPES[extensionOf(key)] ?? 'application/octet-stream';
}

export function hasActiveContent(key: string): boolean {
  return ACTIVE_CONTENT_FORMATS.includes(extensionOf(key));
}

export function canEmbedInPdf(key: string): boolean {
  return (PDF_IMAGES as readonly string[]).includes(extensionOf(key));
}
