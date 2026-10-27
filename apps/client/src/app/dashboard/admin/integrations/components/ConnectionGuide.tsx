'use client';

import { apiUrl } from '@/lib/api';

/** Lo que necesita el equipo del otro sistema para conectarse. El detalle está en `docs/INTEGRACION.md`. */
export function ConnectionGuide() {
  const endpoint = `${apiUrl()}/integration/v1/enrollment-requests`;

  return (
    <dl className="grid gap-3 text-sm">
      <div>
        <dt className="font-bold">Dirección</dt>
        <dd className="font-mono text-xs break-all text-muted-foreground mt-0.5">{endpoint}</dd>
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
        <dd className="text-muted-foreground mt-0.5">
          <span className="font-mono text-xs">POST</span> pide matricular a una persona (nombre, apellido, correo y
          código del curso), <span className="font-mono text-xs">GET …/{'{identificador}'}</span> consulta si ya lo
          terminó y con qué certificado, y <span className="font-mono text-xs">DELETE</span> la retira mientras espera.
          El equipo técnico tiene el contrato completo en la documentación de integración del proyecto.
        </dd>
      </div>
    </dl>
  );
}
