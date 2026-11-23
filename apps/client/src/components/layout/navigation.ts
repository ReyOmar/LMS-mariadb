import {
  Award,
  BookCheck,
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  FileSignature,
  Globe,
  Mail,
  MessageSquare,
  Palette,
  Plug,
  Presentation,
  ShieldAlert,
  Sun,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/contexts/SessionContext';

/**
 * Mapa de navegación del campus.
 *
 * Declararlo como datos, en lugar de repetir el mismo bloque de JSX por cada enlace y por
 * cada rol, hace que añadir una pantalla sea una línea y que la barra superior, la inferior
 * del teléfono y el menú «Más» no puedan quedar desalineados entre sí.
 */

export interface MenuLink {
  href: string;
  /** Nombre completo: el del título de la pestaña del navegador y el del menú «Más». */
  label: string;
  /** Rótulo de las barras, donde el espacio es poco. Sin él se usa `label`. */
  short?: string;
  icon: LucideIcon;
  /** Contador que se pinta junto al rótulo (solicitudes pendientes, mensajes sin leer). */
  counter?: 'requests' | 'messages';
  /** Otras rutas que también son de esta sección (el constructor, para las asignaciones). */
  includes?: string[];
}

export interface MenuSection {
  title: string;
  links: MenuLink[];
}

export interface RoleNavigation {
  /** Pestañas de la barra superior. En el teléfono, las primeras `PHONE_TABS` van en la barra inferior. */
  tabs: MenuLink[];
  /** Lo que no cabe en la barra: va agrupado en «Más». */
  more: MenuSection[];
}

/** Pestañas que caben en la barra inferior del teléfono junto a «Más». */
export const PHONE_TABS = 4;

const TODAY: MenuLink = { href: '/dashboard', label: 'Hoy', icon: Sun };

const MESSAGES: MenuLink = {
  href: '/dashboard/messages',
  label: 'Mensajes',
  icon: MessageSquare,
  counter: 'messages',
};

const GRADING: MenuLink = {
  href: '/dashboard/examiner/grading',
  label: 'Calificación de entregas',
  short: 'Entregas',
  icon: BookCheck,
};

const MONITORING: MenuLink = {
  href: '/dashboard/examiner/monitoring',
  label: 'Monitoreo de estudiantes',
  short: 'Estudiantes',
  icon: Users,
};

export const NAVIGATION: Record<Role, RoleNavigation> = {
  student: {
    tabs: [
      TODAY,
      { href: '/dashboard/student/courses', label: 'Mis cursos', short: 'Cursos', icon: BookOpen },
      { href: '/dashboard/student/certificates', label: 'Mis certificados', short: 'Certificados', icon: Award },
      MESSAGES,
    ],
    more: [],
  },

  teacher: {
    tabs: [
      TODAY,
      {
        href: '/dashboard/examiner/courses',
        label: 'Mis asignaciones',
        short: 'Cursos',
        icon: Presentation,
        includes: ['/dashboard/course-builder'],
      },
      GRADING,
      MONITORING,
      MESSAGES,
    ],
    more: [
      {
        title: 'Evaluación',
        links: [
          { href: '/dashboard/examiner/quizzes', label: 'Monitoreo de pruebas', icon: ClipboardCheck },
          { href: '/dashboard/examiner/signature', label: 'Mi firma', icon: FileSignature },
        ],
      },
    ],
  },

  admin: {
    tabs: [
      TODAY,
      { href: '/dashboard/course-builder', label: 'Gestión de cursos', short: 'Cursos', icon: BookOpen },
      { href: '/dashboard/admin/users', label: 'Usuarios', icon: UserCog },
      {
        href: '/dashboard/admin/access-requests',
        label: 'Solicitudes de acceso',
        short: 'Solicitudes',
        icon: ShieldAlert,
        counter: 'requests',
      },
      MESSAGES,
    ],
    more: [
      {
        title: 'Formación',
        links: [
          { href: '/dashboard/admin/course-assignment', label: 'Asignación y matrículas', icon: ClipboardList },
          GRADING,
          MONITORING,
        ],
      },
      {
        title: 'Configuración',
        links: [
          { href: '/dashboard/admin/certificate-settings', label: 'Certificados', icon: FileSignature },
          { href: '/dashboard/admin/theme', label: 'Tema y apariencia', icon: Palette },
          { href: '/dashboard/admin/landing-settings', label: 'Portada pública', icon: Globe },
          { href: '/dashboard/admin/emails', label: 'Plantillas de correo', icon: Mail },
          { href: '/dashboard/admin/integrations', label: 'Integraciones', icon: Plug },
        ],
      },
    ],
  },
};

/** Páginas que no están en ningún menú, con el nombre que llevan en la pestaña del navegador. */
const PAGES_OUTSIDE_MENU: Record<string, string> = {
  '/login': 'Acceso al campus',
  '/forgot-password': 'Recuperar contraseña',
  '/reset-password': 'Nueva contraseña',
  '/verify': 'Verificar un certificado',
  '/legal': 'Información legal y privacidad',
  '/courses': 'Curso',
};

function linksOf(role: Role): MenuLink[] {
  const { tabs, more } = NAVIGATION[role];
  return [...tabs, ...more.flatMap((section) => section.links)];
}

/**
 * Lo que en el teléfono va en «Más»: las pestañas que no caben en la barra inferior y las
 * secciones que en el ordenador ya estaban en «Más».
 */
export function phoneMoreSections(role: Role): MenuSection[] {
  const { tabs, more } = NAVIGATION[role];
  const overflow = tabs.slice(PHONE_TABS);
  return overflow.length > 0 ? [{ title: 'Secciones', links: overflow }, ...more] : more;
}

/** El inicio sólo está activo en coincidencia exacta; el resto, por prefijo. */
function isUnder(pathname: string, href: string): boolean {
  return href === '/dashboard' ? pathname === '/dashboard' : pathname === href || pathname.startsWith(`${href}/`);
}

/** Si `link` es la sección de la pantalla abierta. */
export function isActiveLink(link: MenuLink, pathname: string): boolean {
  return [link.href, ...(link.includes ?? [])].some((href) => isUnder(pathname, href));
}

/** Si la pantalla abierta es una de las de `sections`: así «Más» se marca cuando se está dentro. */
export function isWithin(sections: MenuSection[], pathname: string): boolean {
  return sections.some((section) => section.links.some((link) => isActiveLink(link, pathname)));
}

/**
 * Nombre de la pantalla que hay en `pathname`, para el título de la pestaña: el de su enlace en el
 * menú de `role` o, si no lo tiene, en el de otro rol. La ruta más larga gana, así que una pantalla
 * interior lleva el nombre de la que la contiene.
 *
 * @returns `null` en la portada y en las rutas que no existen: su título es sólo la marca.
 */
export function pageNameOf(pathname: string, role: Role): string | null {
  const otherRoles = (Object.keys(NAVIGATION) as Role[]).filter((other) => other !== role);
  const pages = [
    ...linksOf(role),
    ...otherRoles.flatMap(linksOf),
    ...Object.entries(PAGES_OUTSIDE_MENU).map(([href, label]) => ({ href, label })),
  ];

  // `sort` es estable: entre dos enlaces a la misma ruta, queda antes el del rol de quien mira.
  const page = pages
    .sort((a, b) => b.href.length - a.href.length)
    .find(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
  return page?.label ?? null;
}

/** Nombre del rol tal como se le muestra a la persona. */
export const ROLE_NAMES: Record<Role, string> = {
  admin: 'Administrador',
  teacher: 'Examinador',
  student: 'En capacitación',
};
