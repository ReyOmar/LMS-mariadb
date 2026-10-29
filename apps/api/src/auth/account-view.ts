/** Campos que se devuelven al listar o consultar una cuenta. Nunca incluyen el hash. */
export const ACCOUNT_VIEW = {
  guid: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  country: true,
  createdAt: true,
  updatedAt: true,
  lastAccessAt: true,
  usesDefaultPassword: true,
  photoUrl: true,
} as const;
