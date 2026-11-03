import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { GraduationCap, type LucideIcon } from 'lucide-react';

/**
 * Piezas comunes de la vitrina: dibujos de la interfaz del campus con datos de ejemplo. Su
 * tamaño sigue a la letra de la escena (`em`), que se ajusta al hueco disponible.
 */

/**
 * Dónde flota una pieza sobre su vista: `x` e `y` desde la esquina, `z` hacia quien mira y `turn`
 * su giro. `float` desfasa su vaivén para que no se muevan todas a la vez.
 */
export function placed({ x, y, z, turn, float }: { x: string; y: string; z: string; turn?: string; float?: string }) {
  return { '--sx': x, '--sy': y, '--sz': z, '--r': turn, '--f': float } as CSSProperties;
}

/** Un celular con la barra de estado; dentro, su pantalla. */
export function Phone({
  className = '',
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className={`phone ${className}`} style={style}>
      <div className="phone-screen">
        <span className="phone-notch" />
        <p className="phone-status">
          <span>9:41</span>
          <span className="phone-signal">
            <i />
            <i />
            <i />
          </span>
        </p>
        {children}
      </div>
    </div>
  );
}

/** Menú lateral del campus, con la sede y los apartados de cada papel. */
export function AppSidebar({
  platformName,
  site,
  groups,
  user,
}: {
  platformName: string;
  /** La sede, con su bandera. */
  site: ReactNode;
  groups: { title: string; links: { icon: LucideIcon; label: string; current?: boolean; count?: number }[] }[];
  user?: { initials: string; name: string; role: string };
}) {
  return (
    <aside className="app-side">
      <p className="app-brand">
        <span className="tile">
          <GraduationCap className="i" />
        </span>
        <span>{platformName}</span>
      </p>
      <div className="app-sede">
        <span className="app-label">Sede</span>
        <span className="app-pill">{site}</span>
      </div>
      {groups.map((group) => (
        <Fragment key={group.title}>
          <p className="app-label">{group.title}</p>
          <div className="app-nav">
            {group.links.map((link) => (
              <span key={link.label} className={link.current ? 'on' : undefined}>
                <link.icon className="i" />
                {link.label}
                {link.count !== undefined && <em className="count">{link.count}</em>}
              </span>
            ))}
          </div>
        </Fragment>
      ))}
      {user && (
        <div className="app-user">
          <span className="avatar">{user.initials}</span>
          <div>
            <b>{user.name}</b>
            <small>{user.role}</small>
          </div>
        </div>
      )}
    </aside>
  );
}
