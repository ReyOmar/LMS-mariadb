import { readFileSync } from 'fs';
import { join } from 'path';
import { CreateCourseDto, CreateModuleDto, UpdateCourseDto, UpdateModuleDto } from './courses/dto/courses.dto';
import { CreateResourceDto, UpdateResourceDto } from './courses/dto/resources.dto';
import { CreateUserDto } from './auth/dto/create-user.dto';
import { UpdateUserDto } from './auth/dto/update-user.dto';
import { UpdateProfileDto } from './auth/dto/update-profile.dto';
import { RequestAccessDto } from './auth/dto/request-access.dto';
import { RejectAccessRequestDto } from './auth/dto/reject-access-request.dto';
import { GradeSubmissionDto } from './assessments/dto/grade-submission.dto';
import { SendMessageDto } from './notifications/dto/messages.dto';
import { UpdateTemplateDto } from './mail/dto/update-template.dto';
import { UpdateSettingsDto } from './settings/dto/update-settings.dto';
import { UpdateCertificateSettingsDto } from './settings/dto/update-certificate-settings.dto';
import { UpdateSignatureDto } from './settings/dto/update-signature.dto';
import { ExternalEnrollmentDto } from './integrations/dto/external-enrollment.dto';
import { CreateIntegrationClientDto } from './integrations/dto/integration-admin.dto';
import { maxLengthOf } from './common/testing/validation-metadata';
import { EMAIL_TEMPLATES } from '../prisma/email-templates';

/**
 * Lo que admite cada DTO cabe en su columna. Un texto que la validación deja pasar y la base
 * rechaza llega al usuario como «demasiado largo para el campo», sin decir cuál ni cuánto.
 */

/** Caracteres que caben con certeza: en utf8mb4 cada uno puede ocupar 4 bytes. */
const CAPACITY_BY_TYPE: Record<string, number> = {
  Text: Math.floor(65_535 / 4),
  MediumText: Math.floor(16_777_215 / 4),
};

/** Sin tipo nativo, Prisma crea en MariaDB un VARCHAR(191). */
const DEFAULT_VARCHAR = 191;

function columnCapacities(): Map<string, number> {
  const schema = readFileSync(join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const capacities = new Map<string, number>();
  for (const [, model, body] of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    for (const [, field, attributes] of body.matchAll(/^\s+(\w+)\s+String\??(.*)$/gm)) {
      const native = /@db\.(\w+)(?:\((\d+)\))?/.exec(attributes);
      const capacity = !native ? DEFAULT_VARCHAR : native[2] ? Number(native[2]) : CAPACITY_BY_TYPE[native[1]];
      capacities.set(`${model}.${field}`, capacity);
    }
  }
  return capacities;
}

type Column = [dto: new () => object, properties: string[], model: string, fields?: string[]];

const NAMES = ['firstName', 'lastName'];
const LEGAL = [
  'legalEntityName',
  'legalEntityTaxId',
  'legalAddress',
  'privacyEmail',
  'legalTerms',
  'legalPrivacy',
  'legalData',
];

const COLUMNS: Column[] = [
  [CreateCourseDto, ['title'], 'Course'],
  [UpdateCourseDto, ['title', 'description', 'shortDescription', 'coverImage'], 'Course'],
  [CreateModuleDto, ['title'], 'CourseModule'],
  [UpdateModuleDto, ['title', 'description'], 'CourseModule'],
  [CreateResourceDto, ['title', 'contentHtml'], 'Resource'],
  [UpdateResourceDto, ['title', 'contentHtml', 'referenceUrl', 'attachmentKey', 'attachmentName'], 'Resource'],
  [CreateUserDto, NAMES, 'User'],
  [UpdateUserDto, NAMES, 'User'],
  [UpdateProfileDto, NAMES, 'User'],
  [UpdateSignatureDto, ['signatureName', 'signatureTitle'], 'User'],
  [RequestAccessDto, NAMES, 'AccessRequest'],
  [RejectAccessRequestDto, ['reason'], 'AccessRequest', ['rejectionReason']],
  [GradeSubmissionDto, ['feedback'], 'Submission'],
  [SendMessageDto, ['subject', 'content'], 'Message'],
  [UpdateTemplateDto, ['subject', 'bodyHtml'], 'EmailTemplate'],
  [
    UpdateSettingsDto,
    [
      'platformName',
      'logoUrl',
      'faviconUrl',
      'loginBackgroundUrl',
      'font',
      'welcomeMessage',
      'landingHeroTitle1',
      'landingHeroTitle2',
      'landingHeroSubtitle',
      'landingPhone',
      'landingPhoneSub',
      'landingEmail',
      'landingEmailSub',
      'landingOffice',
      'landingOfficeSub',
      'landingFooterText',
      ...LEGAL,
    ],
    'CountrySettings',
  ],
  // Cada versión publicada de los textos legales guarda una copia de los de la sede.
  [UpdateSettingsDto, LEGAL, 'LegalVersion'],
  [UpdateCertificateSettingsDto, ['certCustomTitle', 'certSubtitle', 'certLegalText'], 'CountrySettings'],
  [ExternalEnrollmentDto, ['externalId', 'email', 'firstName', 'lastName'], 'ExternalEnrollment'],
  [ExternalEnrollmentDto, ['infractionCode', 'infractionDescription'], 'Infraction', ['code', 'description']],
  [CreateIntegrationClientDto, ['name'], 'IntegrationClient'],
];

describe('Los textos que admite la API caben en la base', () => {
  const capacities = columnCapacities();
  const capacity = (column: string) => {
    const value = capacities.get(column);
    if (value === undefined) throw new Error(`No existe la columna ${column} en schema.prisma`);
    return value;
  };

  const cases = COLUMNS.flatMap(([dto, properties, model, fields]) =>
    properties.map((property, i) => [`${dto.name}.${property}`, dto, property, `${model}.${fields?.[i] ?? property}`]),
  ) as [string, new () => object, string, string][];

  it.each(cases)('%s → %s', (_, dto, property, column) => {
    const limit = maxLengthOf(dto, property);

    expect(limit).toBeDefined();
    expect(limit).toBeLessThanOrEqual(capacity(column));
  });

  it.each(EMAIL_TEMPLATES.map((event) => [event.key, event]))(
    'la plantilla de serie %s cabe al sembrarla',
    (_, event) => {
      const fits: [string, string][] = [
        [event.key, 'EmailEvent.key'],
        [event.displayName, 'EmailEvent.displayName'],
        [event.description, 'EmailEvent.description'],
        [event.template.internalName, 'EmailTemplate.internalName'],
        [event.template.subject, 'EmailTemplate.subject'],
        [event.template.bodyHtml, 'EmailTemplate.bodyHtml'],
      ];
      const tooLong = fits.filter(([text, column]) => text.length > capacity(column)).map(([, column]) => column);

      expect(tooLong).toEqual([]);
    },
  );

  it('el nombre completo cabe en el certificado y en el aviso de un mensaje nuevo', () => {
    const fullName = maxLengthOf(CreateUserDto, 'firstName')! + 1 + maxLengthOf(CreateUserDto, 'lastName')!;

    expect(fullName).toBeLessThanOrEqual(capacity('Certificate.holderName'));
    expect('Mensaje de '.length + fullName).toBeLessThanOrEqual(capacity('Notification.title'));
  });
});
