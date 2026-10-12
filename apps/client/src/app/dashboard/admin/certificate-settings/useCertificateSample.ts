'use client';

import { useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import type { Course } from '@/types/models';

interface CourseOption {
  guid: string;
  title: string;
}

export interface CourseSigner {
  title: string;
  teacher: {
    firstName: string;
    lastName: string;
    signatureUrl: string | null;
    signatureName: string | null;
    signatureTitle: string | null;
  };
}

export function useCertificateSample() {
  const { notify } = useAlerts();
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [courseGuid, setCourseGuid] = useState('');
  const [signer, setSigner] = useState<CourseSigner | null>(null);

  useEffect(() => {
    api
      .get<Course[]>('/courses')
      .then(({ data }) => setCourses(Array.isArray(data) ? data.map(({ guid, title }) => ({ guid, title })) : []))
      .catch((error: unknown) => notify.error('No se pudieron cargar los cursos', errorMessage(error)));
  }, [notify]);

  useEffect(() => {
    setSigner(null);
    if (!courseGuid) return;

    let current = true;
    api
      .get<CourseSigner>(`/settings/signature/course/${encodeURIComponent(courseGuid)}`)
      .then(({ data }) => current && setSigner(data))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [courseGuid]);

  return { courses, courseGuid, setCourseGuid, signer };
}
