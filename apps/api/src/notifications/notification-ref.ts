/** A qué apunta un aviso (`ref_tipo`): con ello se retira cuando lo referido desaparece. */
export const NOTIFICATION_REF = {
  course: 'curso',
  quiz: 'quiz',
  submission: 'entrega',
  certificate: 'certificado',
  /** La otra persona de una conversación: sus mensajes y sus solicitudes de contacto. */
  person: 'mensaje',
} as const;
