'use client';

import { useRef, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import type { User } from '@/types/models';
import type { AssignedCourse } from './components/accounts';

/** Ficha abierta y sus cursos; la respuesta de una ficha que ya se cerró o cambió se descarta. */
export function useAccountDetails() {
  const { notify } = useAlerts();
  const [selected, setSelected] = useState<User | null>(null);
  const [courses, setCourses] = useState<AssignedCourse[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const request = useRef<string | null>(null);

  const open = async (user: User) => {
    request.current = user.guid;
    setSelected(user);
    setCourses([]);
    setLoadingCourses(true);
    const isCurrent = () => request.current === user.guid;

    try {
      const { data } = await api.get<AssignedCourse[]>(`/courses/user/${encodeURIComponent(user.guid)}`);
      if (isCurrent()) setCourses(Array.isArray(data) ? data : []);
    } catch (error) {
      if (isCurrent()) notify.error('No se pudieron cargar sus cursos', errorMessage(error));
    } finally {
      if (isCurrent()) setLoadingCourses(false);
    }
  };

  const close = () => {
    request.current = null;
    setSelected(null);
  };

  /** Pone al día la ficha abierta tras guardar esa misma cuenta. */
  const refreshIfOpen = (saved: User) => {
    if (selected?.guid === saved.guid) void open({ ...selected, ...saved });
  };

  return { selected, courses, loadingCourses, open, close, refreshIfOpen };
}
