'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { useDebounce } from '@/hooks/useDebounce';
import {
  BookOpen,
  Users,
  GraduationCap,
  Presentation,
  Plus,
  Loader2,
  CheckCircle,
  Search,
  UserPlus,
  UserMinus,
  ChevronRight,
  Inbox,
  BookMarked,
} from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import { useSession } from '@/contexts/SessionContext';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { COURSE_STATUS_LABEL } from '@/lib/labels';
import { shortDate } from '@/lib/dates';
import { initials, plural } from '@/lib/text';
import {
  batchSummary,
  candidateSearch,
  CANDIDATES_SHOWN,
  filterCourses,
  hasExaminer,
  isSearchTooShort,
  MIN_SEARCH_LENGTH,
  restartWarning,
  type AssignableCourse,
  type AssignmentFilter,
  type EnrollmentFailure,
} from './assignment';
import { useCurrentList } from '@/hooks/useCurrentList';
import { useInFlight } from '@/hooks/useInFlight';
import { LoadMoreButton } from '@/components/ui/LoadMoreButton';

interface Person {
  guid: string;
  firstName: string;
  lastName: string;
  email: string;
}

/** Alumno que se puede matricular. `certified`: ya tiene certificado de este curso. */
interface Candidate extends Person {
  certified: boolean;
}

/** Una cuenta matriculada, tal y como llega: la persona con su estado en el curso. */
interface EnrolledStudent extends Person {
  active: boolean;
  enrolledAt: string;
}

/** El listado llega por páginas; `cursor` es por dónde sigue y `null` que ya no queda nada. */
interface EnrolledResponse {
  total?: number;
  cursor: string | null;
  enrolledStudents: EnrolledStudent[];
}

/** Examinadores que se piden de una vez; el servidor no entrega más por página. */
const MAX_EXAMINERS = 200;

/** Color del avatar según el rol, el mismo que en la pantalla de cuentas, en tono legible. */
const AVATAR_TONE = {
  student: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  examiner: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
} as const;

/** Iniciales de la persona sobre el color de su rol. */
function PersonInitials({
  person,
  tone,
}: {
  person: Pick<Person, 'firstName' | 'lastName'>;
  tone: keyof typeof AVATAR_TONE;
}) {
  return (
    <div
      aria-hidden="true"
      className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center font-bold text-sm ${AVATAR_TONE[tone]}`}
    >
      {initials(person.firstName, person.lastName)}
    </div>
  );
}

const fullName = (person: Person) => `${person.firstName} ${person.lastName}`;

/**
 * El servidor responde 409 cuando la lista de candidatos estaba desfasada: el alumno ya está dentro o
 * terminó el curso después de cargarla y hay que confirmar que empieza de nuevo.
 */
const isAlreadyEnrolled = (error: unknown) => isAxiosError(error) && error.response?.status === 409;

export default function CourseAssignmentPage() {
  const [courses, setCourses] = useState<AssignableCourse[]>([]);
  const [teachers, setTeachers] = useState<Person[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  // Curso sobre el que se trabaja y pestaña abierta
  const [selectedCourseGuid, setSelectedCourseGuid] = useState('');
  const [activeTab, setActiveTab] = useState<'students' | 'teacher'>('students');
  /** Curso cuyos datos se están pidiendo: una respuesta de otro curso que llegue tarde se ignora. */
  const currentCourse = useRef('');

  // Filtros del listado de cursos
  const [courseSearch, setCourseSearch] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('all');

  // Matriculados del curso elegido
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([]);
  const [totalEnrolled, setTotalEnrolled] = useState(0);
  const [enrolledCursor, setEnrolledCursor] = useState<string | null>(null);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);
  const [loadingMoreEnrolled, setLoadingMoreEnrolled] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const debouncedStudentSearch = useDebounce(studentSearch, 300);
  const appliedStudentSearch = candidateSearch(debouncedStudentSearch);
  // Alumnos elegidos para matricular de una vez; se conservan al cambiar la búsqueda.
  const [selected, setSelected] = useState<Map<string, Candidate>>(new Map());
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const enrollingBatch = batchProgress !== null;
  /** Alumno que se está matriculando suelto: su botón espera para no enviar el alta dos veces. */
  const enrolling = useInFlight<string>();
  const [teacherSearch, setTeacherSearch] = useState('');
  const appliedTeacherSearch = useDebounce(teacherSearch, 300);
  // Resultado de buscar en el servidor; sin búsqueda se muestran los examinadores ya cargados.
  const [teacherMatches, setTeacherMatches] = useState<Person[] | null>(null);
  const [changingTeacher, setChangingTeacher] = useState(false);

  const { user } = useSession();
  const { notify, showAlert, showConfirmation } = useAlerts();

  // Dentro del mismo curso también se cruzan respuestas: una búsqueda anterior que tarda más,
  // o una página de «Ver más» que llega tras recargar.
  const enrolledList = useCurrentList();
  const candidateList = useCurrentList();

  const loadEnrollments = useCallback(
    async (courseGuid: string) => {
      // Una recarga de un curso que ya no está abierto —un alta que termina después de cambiar de
      // curso— no pide una lista nueva: invalidaría la carga del curso abierto, que se quedaría vacío.
      if (currentCourse.current !== courseGuid) return;
      const isCurrent = enrolledList.start();
      setLoadingEnrollments(true);
      try {
        const { data } = await api.get<EnrolledResponse>(`/enrollments/${courseGuid}`);
        if (currentCourse.current !== courseGuid || !isCurrent()) return;
        setEnrolledStudents(data.enrolledStudents ?? []);
        setTotalEnrolled(data.total ?? 0);
        setEnrolledCursor(data.cursor);
      } catch (error) {
        notify.error('No se pudieron cargar las matrículas', errorMessage(error));
      } finally {
        if (isCurrent()) setLoadingEnrollments(false);
      }
    },
    [notify, enrolledList],
  );

  /** Alumnos de la sede que aún no están en el curso, según lo que se busque. */
  const loadCandidates = useCallback(
    async (courseGuid: string, search: string) => {
      // Como en las matrículas: la recarga de otro curso no invalida la del abierto.
      if (currentCourse.current !== courseGuid) return;
      const isCurrent = candidateList.start();
      try {
        const { data } = await api.get<Candidate[]>(`/enrollments/${courseGuid}/candidates`, {
          params: { search: search.trim() || undefined },
        });
        if (currentCourse.current !== courseGuid || !isCurrent()) return;
        setCandidates(Array.isArray(data) ? data : []);
      } catch (error) {
        notify.error('No se pudieron cargar los estudiantes', errorMessage(error));
      }
    },
    [notify, candidateList],
  );

  const selectCourse = useCallback(
    (guid: string) => {
      currentCourse.current = guid;
      setSelectedCourseGuid(guid);
      setEnrolledStudents([]);
      setTotalEnrolled(0);
      setEnrolledCursor(null);
      setCandidates([]);
      setSelected(new Map());
      setStudentSearch('');
      setTeacherSearch('');
      if (guid) void loadEnrollments(guid);
    },
    [loadEnrollments],
  );

  useEffect(() => {
    const load = async () => {
      try {
        const [coursesResponse, teachersResponse] = await Promise.all([
          api.get<AssignableCourse[]>('/courses'),
          api.get<{ users: Person[] }>('/auth/users', { params: { role: 'TEACHER', limit: MAX_EXAMINERS } }),
        ]);
        setCourses(Array.isArray(coursesResponse.data) ? coursesResponse.data : []);
        setTeachers(teachersResponse.data?.users ?? []);

        // Se puede llegar con un curso ya elegido desde la ficha de un examinador.
        const courseFromUrl = new URLSearchParams(window.location.search).get('course');
        if (courseFromUrl) {
          selectCourse(courseFromUrl);
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch (error) {
        notify.error('No se pudieron cargar los cursos', errorMessage(error));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [notify, selectCourse]);

  // Los candidatos se piden al elegir curso y cada vez que cambia la búsqueda.
  useEffect(() => {
    if (selectedCourseGuid) void loadCandidates(selectedCourseGuid, appliedStudentSearch);
  }, [selectedCourseGuid, appliedStudentSearch, loadCandidates]);

  // La búsqueda va al servidor: la lista inicial sólo trae los primeros examinadores de la sede.
  useEffect(() => {
    const search = appliedTeacherSearch.trim();
    if (!search) {
      setTeacherMatches(null);
      return;
    }
    let current = true;
    api
      .get<{ users: Person[] }>('/auth/users', { params: { role: 'TEACHER', search, limit: MAX_EXAMINERS } })
      .then(({ data }) => current && setTeacherMatches(data.users ?? []))
      .catch(() => current && setTeacherMatches([]));
    return () => {
      current = false;
    };
  }, [appliedTeacherSearch]);

  // Otra persona puede matricular o dar de baja a la vez: se recargan las dos listas del curso
  // abierto, no el catálogo entero, para no ofrecer como candidato a quien ya está dentro.
  // Durante una matrícula en bloque cada alta propia llega aquí; se recarga una vez al final.
  useRealtimeEvent('enrollment:changed', (data) => {
    const courseGuid = (data as { courseGuid?: string } | null)?.courseGuid;
    if (!selectedCourseGuid || enrollingBatch || (courseGuid && courseGuid !== selectedCourseGuid)) return;
    void loadEnrollments(selectedCourseGuid);
    void loadCandidates(selectedCourseGuid, appliedStudentSearch);
  });

  /** Siguiente tanda de matriculados, desde la marca de la última fila recibida. */
  const loadMoreEnrolled = async () => {
    const courseGuid = selectedCourseGuid;
    if (!courseGuid || !enrolledCursor || loadingMoreEnrolled) return;
    const isCurrent = enrolledList.extend();
    setLoadingMoreEnrolled(true);
    try {
      const { data } = await api.get<EnrolledResponse>(`/enrollments/${courseGuid}`, {
        params: { cursor: enrolledCursor },
      });
      if (currentCourse.current !== courseGuid || !isCurrent()) return;
      setEnrolledStudents((prev) => [...prev, ...(data.enrolledStudents ?? [])]);
      setEnrolledCursor(data.cursor);
    } catch (error) {
      notify.error('No se pudieron cargar más matriculados', errorMessage(error));
    } finally {
      setLoadingMoreEnrolled(false);
    }
  };

  // ── Acciones ──

  const confirmRestart = (names: string[]) =>
    showConfirmation('¿Volver a empezar el curso?', restartWarning(names), 'Matricular de nuevo', 'danger');

  /** Quien ya no es candidato sale de la lista y de la selección, para no matricularlo dos veces. */
  const dropCandidate = (userGuid: string) => {
    setCandidates((prev) => prev.filter((candidate) => candidate.guid !== userGuid));
    setSelected((prev) => {
      if (!prev.has(userGuid)) return prev;
      const next = new Map(prev);
      next.delete(userGuid);
      return next;
    });
  };

  const toggleCandidate = (candidate: Candidate) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(candidate.guid)) next.delete(candidate.guid);
      else next.set(candidate.guid, candidate);
      return next;
    });

  const allVisibleSelected = candidates.length > 0 && candidates.every((candidate) => selected.has(candidate.guid));

  const toggleVisibleCandidates = () =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const candidate of candidates) {
        if (allVisibleSelected) next.delete(candidate.guid);
        else next.set(candidate.guid, candidate);
      }
      return next;
    });

  const enrollStudent = (candidate: Candidate) =>
    enrolling.run(candidate.guid, async () => {
      const courseGuid = selectedCourseGuid;
      if (!courseGuid) return;
      if (candidate.certified && !(await confirmRestart([fullName(candidate)]))) return;
      try {
        await api.post(`/enrollments/${courseGuid}`, { userGuid: candidate.guid, confirmRestart: candidate.certified });
        notify.success('Estudiante matriculado');
        dropCandidate(candidate.guid);
        void loadEnrollments(courseGuid);
      } catch (error) {
        notify.error(errorMessage(error, 'No se pudo matricular al estudiante.'));
        if (isAlreadyEnrolled(error)) {
          dropCandidate(candidate.guid);
          void loadEnrollments(courseGuid);
          void loadCandidates(courseGuid, appliedStudentSearch);
        }
      }
    });

  /**
   * Matricula a los seleccionados de uno en uno —el cupo se comprueba en cada alta— y al
   * terminar resume quién entró y quién no, con el motivo.
   */
  const enrollSelected = async () => {
    const courseGuid = selectedCourseGuid;
    const students = [...selected.values()];
    if (!courseGuid || students.length === 0) return;

    const certified = students.filter((student) => student.certified).map(fullName);
    if (certified.length > 0 && !(await confirmRestart(certified))) return;

    let added = 0;
    const failures: EnrollmentFailure[] = [];
    setBatchProgress({ done: 0, total: students.length });
    for (const [index, student] of students.entries()) {
      try {
        await api.post(`/enrollments/${courseGuid}`, { userGuid: student.guid, confirmRestart: student.certified });
        added++;
      } catch (error) {
        failures.push({ name: fullName(student), reason: errorMessage(error, 'No se pudo matricular.') });
      }
      setBatchProgress({ done: index + 1, total: students.length });
    }
    setBatchProgress(null);
    setSelected(new Map());

    const summary = batchSummary(added, failures);
    if (failures.length === 0) notify.success(summary.title);
    else if (added === 0) showAlert.error(summary.title, summary.message);
    else showAlert.warning(summary.title, summary.message, false);

    void loadEnrollments(courseGuid);
    void loadCandidates(courseGuid, appliedStudentSearch);
  };

  const unenrollStudent = async (student: EnrolledStudent) => {
    const courseGuid = selectedCourseGuid;
    if (!courseGuid) return;
    const confirmed = await showConfirmation(
      `¿Desmatricular a ${fullName(student)}?`,
      'Perderá el acceso al curso. Su avance y sus entregas se conservan: si vuelves a matricularlo antes de que ' +
        'obtenga el certificado, retomará el curso donde lo dejó.',
      'Desmatricular',
    );
    if (!confirmed) return;
    try {
      await api.delete(`/enrollments/${courseGuid}/${student.guid}`);
      notify.success('Estudiante removido');
      // Vuelve a ser candidato: se refrescan las dos listas.
      void loadEnrollments(courseGuid);
      void loadCandidates(courseGuid, appliedStudentSearch);
    } catch (error) {
      notify.error(errorMessage(error, 'No se pudo retirar al estudiante.'));
    }
  };

  const setCourseTeacher = (courseGuid: string, teacher: AssignableCourse['teacher']) =>
    setCourses((prev) =>
      prev.map((course) => (course.guid === courseGuid ? { ...course, teacherGuid: teacher.guid, teacher } : course)),
    );

  /** Pone el curso a cargo de otra persona. Un doble clic no lanza una segunda petición. */
  const changeTeacher = async (teacher: AssignableCourse['teacher'], successMessage: string) => {
    const courseGuid = selectedCourseGuid;
    if (!courseGuid || changingTeacher) return;
    setChangingTeacher(true);
    try {
      await api.post(`/courses/${courseGuid}/assign`, { teacherGuid: teacher.guid });
      notify.success(successMessage);
      setCourseTeacher(courseGuid, teacher);
    } catch (error) {
      notify.error('No se pudo cambiar el responsable', errorMessage(error));
    } finally {
      setChangingTeacher(false);
    }
  };

  const assignTeacher = (teacher: Person) => changeTeacher({ ...teacher, role: 'TEACHER' }, 'Examinador asignado');

  /**
   * Devuelve el curso al administrador que lo gestiona.
   * Un curso siempre tiene responsable —es obligatorio en la base de datos—, así que
   * «quitar examinador» significa reasignárselo a uno mismo.
   */
  const unassignTeacher = () => {
    if (!user) return;
    void changeTeacher(
      { guid: user.guid, firstName: user.firstName, lastName: user.lastName, role: 'ADMIN' },
      'El curso vuelve a tu cargo',
    );
  };

  // ── Datos derivados ──
  const selectedCourse = courses.find((course) => course.guid === selectedCourseGuid);
  // El correo sólo se conoce si el examinador está en la lista cargada; el nombre viene con el curso.
  const currentTeacher =
    selectedCourse && hasExaminer(selectedCourse)
      ? {
          ...selectedCourse.teacher,
          email: teachers.find((teacher) => teacher.guid === selectedCourse.teacherGuid)?.email,
        }
      : null;
  const filteredCourses = filterCourses(courses, courseSearch, assignmentFilter);

  const filteredTeachers = teacherMatches ?? teachers;

  if (loading) {
    return <PageLoader message="Preparando panel de asignaciones..." />;
  }

  return (
    <div className="animate-in fade-in duration-700 max-w-7xl mx-auto">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <BookMarked className="h-6 w-6 sm:h-8 sm:w-8 text-primary" /> Asignación y matrículas
        </h1>
        <p className="text-muted-foreground mt-1">
          Selecciona un curso para matricular estudiantes o asignar un examinador.
        </p>
      </header>

      <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-14rem)] lg:h-[calc(100vh-14rem)]">
        {/* = = = = = PANEL IZQUIERDO: LISTA DE CURSOS = = = = = */}
        <div
          className={`w-full lg:w-72 shrink-0 bg-card border border-border shadow-sm rounded-3xl flex flex-col overflow-hidden ${selectedCourseGuid ? 'hidden lg:flex' : 'flex'}`}
        >
          <div className="p-5 border-b border-border/50 bg-muted/20">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" /> Directorio de cursos
            </h2>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              {filteredCourses.length} {plural(filteredCourses.length, 'curso', 'cursos')}{' '}
              {assignmentFilter !== 'all' ? plural(filteredCourses.length, 'encontrado', 'encontrados') : 'en total'}
            </p>

            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar curso..."
                  aria-label="Buscar curso"
                  value={courseSearch}
                  onChange={(e) => setCourseSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm"
                />
              </div>
              <div className="flex bg-background border border-border rounded-xl p-1 shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAssignmentFilter('all')}
                  aria-pressed={assignmentFilter === 'all'}
                  className={`flex-1 text-[10px] font-bold py-1.5 px-2 rounded-lg transition-all ${assignmentFilter === 'all' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setAssignmentFilter('assigned')}
                  aria-pressed={assignmentFilter === 'assigned'}
                  className={`flex-1 text-[10px] font-bold py-1.5 px-2 rounded-lg transition-all ${assignmentFilter === 'assigned' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Asignados
                </button>
                <button
                  type="button"
                  onClick={() => setAssignmentFilter('unassigned')}
                  aria-pressed={assignmentFilter === 'unassigned'}
                  className={`flex-1 text-[10px] font-bold py-1.5 px-2 rounded-lg transition-all ${assignmentFilter === 'unassigned' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Sin asignar
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredCourses.length === 0 ? (
              <div className="text-center py-10 opacity-50">
                <BookOpen className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">No se encontraron cursos</p>
              </div>
            ) : (
              filteredCourses.map((c) => (
                <button
                  type="button"
                  key={c.guid}
                  onClick={() => selectCourse(c.guid)}
                  // Mientras se matricula en bloque no se cambia de curso: el progreso es del abierto.
                  disabled={enrollingBatch}
                  className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 group flex flex-col gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                    selectedCourseGuid === c.guid
                      ? 'bg-primary/10 border-primary shadow-sm'
                      : 'bg-background border-border hover:border-primary/50 hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3
                      className={`font-bold leading-tight ${selectedCourseGuid === c.guid ? 'text-primary' : 'text-foreground group-hover:text-primary'}`}
                    >
                      {c.title}
                    </h3>
                    {selectedCourseGuid === c.guid && <ChevronRight className="h-4 w-4 text-primary shrink-0" />}
                  </div>
                  <div className="flex items-center justify-between mt-auto pt-2">
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${c.status === 'PUBLISHED' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'}`}
                    >
                      {COURSE_STATUS_LABEL[c.status]}
                    </span>
                    {hasExaminer(c) ? (
                      <span className="text-[10px] font-bold text-blue-500 flex items-center gap-1">
                        <Presentation className="h-3 w-3" /> Asignado
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                        Sin examinador
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* = = = = = PANEL DERECHO: DETALLE DE LA ASIGNACIÓN = = = = = */}
        <div className="flex-1 bg-card border border-border shadow-sm rounded-3xl overflow-hidden flex flex-col relative">
          {!selectedCourse ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center animate-in zoom-in-95 duration-500">
              <div className="h-24 w-24 bg-primary/5 rounded-full flex items-center justify-center mb-6">
                <Users className="h-10 w-10 text-primary opacity-50" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Selecciona un curso</h2>
              <p className="text-muted-foreground max-w-sm">
                Haz clic en uno de los cursos del panel izquierdo para comenzar a matricular estudiantes o asignar a un
                examinador.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col h-full animate-in fade-in zoom-in-95 duration-300">
              {/* Cabecera y pestañas */}
              <div className="p-6 border-b border-border bg-gradient-to-br from-card to-muted/20 shrink-0">
                <button
                  type="button"
                  onClick={() => selectCourse('')}
                  disabled={enrollingBatch}
                  className="lg:hidden flex items-center gap-2 text-sm font-bold text-primary mb-3 hover:underline disabled:opacity-60"
                >
                  <ChevronRight className="h-4 w-4 rotate-180" /> Volver a cursos
                </button>
                <h2 className="text-2xl font-bold text-foreground mb-1">{selectedCourse.title}</h2>
                <p className="text-sm text-muted-foreground mb-6">Gestiona quién participa en este curso.</p>

                <div className="flex p-1 bg-muted/50 rounded-xl w-fit">
                  <button
                    type="button"
                    onClick={() => setActiveTab('students')}
                    className={`px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
                      activeTab === 'students'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <GraduationCap className="h-4 w-4" /> Estudiantes
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('teacher')}
                    className={`px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
                      activeTab === 'teacher'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Presentation className="h-4 w-4" /> Examinador
                  </button>
                </div>
              </div>

              {/* Contenido de la pestaña */}
              <div className="flex-1 overflow-hidden relative min-h-0">
                {/* --- PESTAÑA DE ESTUDIANTES --- */}
                {activeTab === 'students' && (
                  <div className="absolute inset-0 flex flex-col animate-in fade-in slide-in-from-left-4 duration-300 overflow-y-auto">
                    {/* Una columna salvo en pantallas muy anchas: en dos no caben los nombres ni los correos. */}
                    <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6 p-4 sm:p-6 min-h-full 2xl:h-full">
                      {/* Lista de matriculados */}
                      <div className="flex flex-col min-h-[280px] max-h-80 2xl:max-h-none 2xl:h-full bg-background border border-border/50 rounded-2xl overflow-hidden shadow-sm">
                        <div className="p-4 border-b border-border/50 bg-emerald-500/5 flex items-center justify-between">
                          <h3 className="font-bold text-sm flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-emerald-500" /> Ya matriculados
                          </h3>
                          <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold px-2.5 py-0.5 rounded-full text-xs">
                            {totalEnrolled}
                          </span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                          {loadingEnrollments ? (
                            <div className="flex justify-center py-10">
                              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                          ) : enrolledStudents.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-6">
                              <Inbox className="h-8 w-8 text-muted-foreground/30 mb-3" />
                              <p className="text-sm font-medium text-muted-foreground">Ningún estudiante matriculado</p>
                              <p className="text-xs text-muted-foreground/60 mt-1">
                                Búscalos y añádelos en «Agregar estudiantes».
                              </p>
                            </div>
                          ) : (
                            enrolledStudents.map((m) => {
                              return (
                                <div
                                  key={m.guid}
                                  className="flex items-center justify-between gap-3 p-3 bg-card border border-border/30 rounded-xl hover:border-red-500/30 hover:shadow-sm transition-all"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <PersonInitials person={m} tone="student" />
                                    <div className="min-w-0">
                                      <p className="text-sm font-bold truncate">{fullName(m)}</p>
                                      <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                                      <p className="text-[11px] text-muted-foreground/80">
                                        Matrícula: {shortDate(m.enrolledAt)}
                                      </p>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => unenrollStudent(m)}
                                    aria-label={`Desmatricular a ${fullName(m)}`}
                                    title="Desmatricular"
                                    className="p-2 shrink-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                  >
                                    <UserMinus className="h-4 w-4" />
                                  </button>
                                </div>
                              );
                            })
                          )}

                          {enrolledCursor && (
                            <LoadMoreButton
                              loading={loadingMoreEnrolled}
                              onClick={loadMoreEnrolled}
                              className="w-full px-4 py-2 text-xs"
                            >
                              {`Ver más (${enrolledStudents.length} de ${totalEnrolled})`}
                            </LoadMoreButton>
                          )}
                        </div>
                      </div>

                      {/* Buscador para añadir */}
                      <div className="flex flex-col min-h-[320px] max-h-[36rem] 2xl:max-h-none 2xl:h-full">
                        <div className="mb-3">
                          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                            <UserPlus className="h-4 w-4 text-primary" /> Agregar estudiantes
                          </h3>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <input
                              type="text"
                              placeholder="Buscar por nombre o correo..."
                              aria-label="Buscar estudiantes por nombre o correo"
                              value={studentSearch}
                              onChange={(e) => setStudentSearch(e.target.value)}
                              className="w-full pl-11 pr-4 py-3 bg-background border border-border rounded-xl text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all shadow-sm"
                            />
                          </div>
                          {isSearchTooShort(studentSearch) && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Escribe al menos {MIN_SEARCH_LENGTH} caracteres para buscar.
                            </p>
                          )}
                        </div>

                        {enrollingBatch ? (
                          <div role="status" className="mb-3">
                            <p className="text-xs font-bold text-muted-foreground mb-1.5 flex items-center gap-2">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Matriculando {batchProgress.done} de{' '}
                              {batchProgress.total}…
                            </p>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 transition-all"
                                style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          (candidates.length > 0 || selected.size > 0) && (
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                              <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={allVisibleSelected}
                                  onChange={toggleVisibleCandidates}
                                  disabled={candidates.length === 0}
                                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                                />
                                Seleccionar los de la lista
                              </label>
                              {selected.size > 0 && (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setSelected(new Map())}
                                    className="px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground rounded-xl transition-colors"
                                  >
                                    Quitar selección
                                  </button>
                                  <button
                                    type="button"
                                    onClick={enrollSelected}
                                    className="flex items-center gap-1 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-colors"
                                  >
                                    <UserPlus className="h-4 w-4" /> Agregar seleccionados ({selected.size})
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        )}

                        <div className="flex-1 overflow-y-auto space-y-2 pb-6">
                          {candidates.length === 0 ? (
                            <div className="text-center py-10 bg-muted/10 rounded-2xl border border-dashed border-border">
                              <p className="text-sm text-muted-foreground font-medium">
                                {appliedStudentSearch
                                  ? 'No se encontraron estudiantes'
                                  : 'Todos los estudiantes están matriculados'}
                              </p>
                            </div>
                          ) : (
                            candidates.map((student) => {
                              const isSelected = selected.has(student.guid);
                              return (
                                <div
                                  key={student.guid}
                                  className={`flex items-center justify-between gap-3 p-3 bg-background border rounded-xl hover:border-emerald-500/50 hover:shadow-md transition-all ${
                                    isSelected ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border/50'
                                  }`}
                                >
                                  <label className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleCandidate(student)}
                                      disabled={enrollingBatch}
                                      className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                                    />
                                    <PersonInitials person={student} tone="student" />
                                    <div className="min-w-0">
                                      <p className="text-sm font-bold truncate">{fullName(student)}</p>
                                      <p className="text-xs text-muted-foreground truncate">{student.email}</p>
                                      {student.certified && (
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                                          Ya certificado · volvería a empezar
                                        </p>
                                      )}
                                    </div>
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => enrollStudent(student)}
                                    disabled={enrollingBatch || enrolling.has(student.guid)}
                                    aria-label={`Agregar a ${fullName(student)}`}
                                    title="Agregar al curso"
                                    className="p-2 shrink-0 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground rounded-xl transition-colors disabled:opacity-50 disabled:pointer-events-none"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </button>
                                </div>
                              );
                            })
                          )}

                          {candidates.length >= CANDIDATES_SHOWN && (
                            <p className="text-xs text-center text-muted-foreground py-2">
                              Se muestran los primeros {CANDIDATES_SHOWN}. Escribe para afinar la búsqueda.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* --- PESTAÑA DE EXAMINADOR --- */}
                {activeTab === 'teacher' && (
                  <div className="absolute inset-0 flex flex-col animate-in fade-in slide-in-from-right-4 duration-300 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 sm:p-6 min-h-full md:h-full">
                      {/* Examinador asignado */}
                      <div className="flex flex-col min-h-[200px] md:h-full bg-background border border-border/50 rounded-2xl overflow-hidden shadow-sm">
                        <div className="p-4 border-b border-border/50 bg-blue-500/5 flex items-center justify-between">
                          <h3 className="font-bold text-sm flex items-center gap-2">
                            <Presentation className="h-4 w-4 text-blue-500" /> Examinador asignado
                          </h3>
                          <span className="bg-blue-500/10 text-blue-600 font-bold px-2.5 py-0.5 rounded-full text-xs">
                            {currentTeacher ? 1 : 0}
                          </span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3">
                          {currentTeacher ? (
                            <div className="flex items-center justify-between p-3 bg-card border border-blue-500/20 rounded-xl group hover:border-red-500/30 hover:shadow-sm transition-all">
                              <div className="flex items-center gap-3 overflow-hidden">
                                <PersonInitials person={currentTeacher} tone="examiner" />
                                <div className="truncate">
                                  <p className="text-sm font-bold truncate">
                                    {currentTeacher.firstName} {currentTeacher.lastName}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">{currentTeacher.email}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={unassignTeacher}
                                disabled={changingTeacher}
                                className="p-2 shrink-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                aria-label="Remover examinador"
                                title="Remover examinador"
                              >
                                <UserMinus className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-6">
                              <Inbox className="h-8 w-8 text-muted-foreground/30 mb-3" />
                              <p className="text-sm font-medium text-muted-foreground">Sin examinador asignado</p>
                              <p className="text-xs text-muted-foreground/60 mt-1">
                                Busca y asigna un examinador desde el panel derecho.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Buscar y asignar examinador */}
                      <div className="flex flex-col h-full">
                        <div className="mb-4">
                          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                            <UserPlus className="h-4 w-4 text-primary" />{' '}
                            {currentTeacher ? 'Reemplazar examinador' : 'Asignar examinador'}
                          </h3>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <input
                              type="text"
                              placeholder="Buscar por nombre o correo..."
                              aria-label="Buscar examinadores por nombre o correo"
                              value={teacherSearch}
                              onChange={(e) => setTeacherSearch(e.target.value)}
                              className="w-full pl-11 pr-4 py-3 bg-background border border-border rounded-xl text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all shadow-sm"
                            />
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 pb-6">
                          {filteredTeachers.length === 0 ? (
                            <div className="text-center py-10 bg-muted/10 rounded-2xl border border-dashed border-border">
                              <p className="text-sm text-muted-foreground font-medium">
                                {teacherSearch ? 'No se encontraron examinadores' : 'No hay examinadores disponibles'}
                              </p>
                            </div>
                          ) : (
                            filteredTeachers.map((teacher) => {
                              const isAssignedTeacher = selectedCourse.teacherGuid === teacher.guid;
                              return (
                                <div
                                  key={teacher.guid}
                                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                                    isAssignedTeacher
                                      ? 'bg-blue-500/5 border-blue-500/30'
                                      : 'bg-background border-border/50 hover:border-blue-500/50 hover:shadow-md'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 overflow-hidden">
                                    <PersonInitials person={teacher} tone="examiner" />
                                    <div className="truncate">
                                      <p className="text-sm font-bold truncate">
                                        {teacher.firstName} {teacher.lastName}
                                      </p>
                                      <p className="text-xs text-muted-foreground truncate">{teacher.email}</p>
                                    </div>
                                  </div>
                                  {isAssignedTeacher ? (
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 bg-blue-500/10 px-2 py-1 rounded-md shrink-0">
                                      Actual
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => void assignTeacher(teacher)}
                                      disabled={changingTeacher}
                                      className="flex items-center gap-1 px-4 py-2 shrink-0 bg-blue-500/10 hover:bg-blue-500 text-blue-600 hover:text-white text-xs font-bold rounded-xl transition-colors"
                                    >
                                      <Plus className="h-4 w-4" /> Asignar
                                    </button>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
