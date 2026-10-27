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
  Plug,
  Presentation,
  ShieldAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/contexts/SessionContext';

/**
 * Mapa de navegación del campus.
 *
 * Declararlo como datos, en lugar de repetir el mismo bloque de JSX por cada enlace y por
 * cada rol, hace que añadir una pantalla sea una línea y que el menú no pueda quedar
 * desalineado entre roles.
 */

export interface MenuLink {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Contador que se pinta a la derecha (solicitudes pendientes, mensajes sin leer). */
  counter?: 'requests' | 'messages';
}

export interface MenuSection {
  title: string;
  links: MenuLink[];
}

const MESSAGES: MenuLink = {
  href: '/dashboard/messages',
  label: 'Mensajes',
  icon: MessageSquare,
  counter: 'messages',
};

export const NAVIGATION: Record<Role, MenuSection[]> = {
  student: [
    {
      title: 'Área de aprendizaje',
      links: [
        { href: '/dashboard', label: 'Mi tablero', icon: Compass },
        { href: '/dashboard/student/courses', label: 'Mis cursos', icon: BookOpen },
        { href: '/dashboard/student/certificates', label: 'Mis certificados', icon: Award },
        MESSAGES,
      ],
    },
  ],

  teacher: [
    {
      title: 'Evaluación',
      links: [
        { href: '/dashboard', label: 'Mis asignaciones', icon: Presentation },
        { href: '/dashboard/examiner/monitoring', label: 'Monitoreo de estudiantes', icon: Users },
        { href: '/dashboard/examiner/quizzes', label: 'Monitoreo de pruebas', icon: ClipboardCheck },
        { href: '/dashboard/examiner/grading', label: 'Calificación de entregas', icon: BookCheck },
        { href: '/dashboard/examiner/signature', label: 'Mi firma', icon: FileSignature },
        MESSAGES,
      ],
    },
  ],

  admin: [
    {
      title: 'Visión general',
      links: [{ href: '/dashboard', label: 'Panel de la sede', icon: BarChart3 }],
    },
    {
      title: 'Formación',
      links: [
        { href: '/dashboard/course-builder', label: 'Gestión de cursos', icon: BookOpen },
        { href: '/dashboard/admin/course-assignment', label: 'Asignación y matrículas', icon: ClipboardList },
        { href: '/dashboard/examiner/grading', label: 'Calificación de entregas', icon: BookCheck },
        { href: '/dashboard/examiner/monitoring', label: 'Monitoreo de estudiantes', icon: Users },
      ],
    },
    {
      title: 'Administración',
      links: [
        { href: '/dashboard/admin/users', label: 'Usuarios', icon: Users },
        {
          href: '/dashboard/admin/access-requests',
          label: 'Solicitudes de acceso',
          icon: ShieldAlert,
          counter: 'requests',
        },
        { href: '/dashboard/admin/certificate-settings', label: 'Certificados', icon: FileSignature },
        { href: '/dashboard/admin/theme', label: 'Tema y apariencia', icon: Palette },
        { href: '/dashboard/admin/landing-settings', label: 'Portada pública', icon: Globe },
        { href: '/dashboard/admin/emails', label: 'Plantillas de correo', icon: Mail },
        { href: '/dashboard/admin/integrations', label: 'Integraciones', icon: Plug },
        MESSAGES,
      ],
    },
  ],
};

/** Nombre del rol tal como se le muestra a la persona. */
export const ROLE_NAMES: Record<Role, string> = {
  admin: 'Administrador',
  teacher: 'Examinador',
  student: 'En capacitación',
};
