'use client';

import { apiUrl } from '@/lib/api';

/** Lo que hace cada ruta de la API de integración. El detalle está en `docs/INTEGRACION.md`. */
const ROUTES = [
  [
    'POST',
    '/enrollment-requests',
    'pide que una persona haga el curso de una infracción: la sede, la persona y la infracción',
  ],
  ['GET', '/enrollment-requests/{identificador}', 'consulta si ya lo terminó y con qué certificado'],
  ['DELETE', '/enrollment-requests/{identificador}', 'la retira mientras espera, si ya no hace falta'],
] as const;

/** Lo que necesita el equipo del otro sistema para conectarse. */
export function ConnectionGuide() {
  return (
    <dl className="grid gap-3 text-sm">
      <div>
        <dt className="font-bold">Dirección</dt>
        <dd className="font-mono text-xs break-all text-muted-foreground mt-0.5">{apiUrl()}/integration/v1</dd>
      </div>
      <div>
        <dt className="font-bold">Autenticación</dt>
        <dd className="text-muted-foreground mt-0.5">
          La clave del sistema en la cabecera <span className="font-mono text-xs">X-Api-Key</span>. Cada clave pertenece
          a una sede: lo que se pida con ella se matricula en esta.
        </dd>
      </div>
      <div>
        <dt className="font-bold">Qué hace</dt>
        <dd className="mt-1">
          <ul className="space-y-1.5 text-muted-foreground">
            {ROUTES.map(([method, path, description]) => (
              <li key={`${method} ${path}`}>
                <span className="font-mono text-xs text-foreground">
                  {method} {path}
                </span>{' '}
                {description}.
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-2">
            El otro sistema no necesita conocer los cursos del campus: envía la sede, la persona y la infracción, y aquí
            se elige el curso que la atiende. Si tiene una dirección de avisos, el campus le avisa de cada cambio —como
            que la persona terminó el curso— con la solicitud firmada con su clave. El contrato completo está en la
            documentación de integración del proyecto.
          </p>
        </dd>
      </div>
    </dl>
  );
}
