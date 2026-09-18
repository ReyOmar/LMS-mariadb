import {
  Award,
  BarChart3,
  BookCheck,
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  Compass,
  FileSignature,
  Globe,
  Mail,
  MessageSquare,
  Palette,
  Presentation,
  ShieldAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/contexts/RoleContext';

/**
 * Mapa de navegación del campus.
 *
 * Declararlo como datos, en lugar de repetir el mismo bloque de JSX por cada enlace y por
 * cada rol, hace que añadir una pantalla sea una línea y que el menú no pueda quedar
 * desalineado entre roles. Antes el mismo `<Link>` con sus nueve atributos aparecía
 * dieciséis veces en el componente.
 */

export interface EnlaceDeMenu {
  href: string;
  etiqueta: string;
  icono: LucideIcon;
  /** Contador que se pinta a la derecha (solicitudes pendientes, mensajes sin leer). */
  contador?: 'solicitudes' | 'mensajes';
}

export interface SeccionDeMenu {
  titulo: string;
  enlaces: EnlaceDeMenu[];
}

const MENSAJES: EnlaceDeMenu = {
  href: '/dashboard/mensajes',
  etiqueta: 'Mensajes',
  icono: MessageSquare,
  contador: 'mensajes',
};

export const NAVEGACION: Record<Role, SeccionDeMenu[]> = {
  student: [
    {
      titulo: 'Área de aprendizaje',
      enlaces: [
        { href: '/dashboard', etiqueta: 'Mi tablero', icono: Compass },
        { href: '/dashboard/student/cursos', etiqueta: 'Mis cursos', icono: BookOpen },
        { href: '/dashboard/student/certificados', etiqueta: 'Mis certificados', icono: Award },
        MENSAJES,
      ],
    },
  ],

  teacher: [
    {
      titulo: 'Evaluación',
      enlaces: [
        { href: '/dashboard', etiqueta: 'Mis asignaciones', icono: Presentation },
        { href: '/dashboard/examiner/monitoreo', etiqueta: 'Monitoreo de estudiantes', icono: Users },
        { href: '/dashboard/examiner/pruebas', etiqueta: 'Monitoreo de pruebas', icono: ClipboardCheck },
        { href: '/dashboard/examiner/calificaciones', etiqueta: 'Calificación de entregas', icono: BookCheck },
        { href: '/dashboard/examiner/firma', etiqueta: 'Mi firma', icono: FileSignature },
        MENSAJES,
      ],
    },
  ],

  admin: [
    {
      titulo: 'Visión general',
      enlaces: [{ href: '/dashboard', etiqueta: 'Panel de la sede', icono: BarChart3 }],
    },
    {
      titulo: 'Formación',
      enlaces: [
        { href: '/dashboard/constructor-cursos', etiqueta: 'Gestión de cursos', icono: BookOpen },
        { href: '/dashboard/admin/asignacion-cursos', etiqueta: 'Asignación y matrículas', icono: ClipboardList },
        { href: '/dashboard/examiner/calificaciones', etiqueta: 'Calificación de entregas', icono: BookCheck },
        { href: '/dashboard/examiner/monitoreo', etiqueta: 'Monitoreo de estudiantes', icono: Users },
      ],
    },
    {
      titulo: 'Administración',
      enlaces: [
        { href: '/dashboard/admin/usuarios', etiqueta: 'Usuarios', icono: Users },
        {
          href: '/dashboard/admin/solicitudes',
          etiqueta: 'Solicitudes de acceso',
          icono: ShieldAlert,
          contador: 'solicitudes',
        },
        { href: '/dashboard/admin/certificados-config', etiqueta: 'Certificados', icono: FileSignature },
        { href: '/dashboard/admin/tema', etiqueta: 'Tema y apariencia', icono: Palette },
        { href: '/dashboard/admin/landing-config', etiqueta: 'Portada pública', icono: Globe },
        { href: '/dashboard/admin/correos', etiqueta: 'Plantillas de correo', icono: Mail },
        MENSAJES,
      ],
    },
  ],
};

/** Nombre del rol tal como se le muestra a la persona. */
export const NOMBRE_DE_ROL: Record<Role, string> = {
  admin: 'Administrador',
  teacher: 'Examinador',
  student: 'En capacitación',
};
