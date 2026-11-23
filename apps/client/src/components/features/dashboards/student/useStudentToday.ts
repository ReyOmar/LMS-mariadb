'use client';

import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { calendarDay } from '@/lib/dates';
import { buildSyllabus, pathProgressFrom } from '@/app/courses/[courseId]/components/progression';
import type { Course, CourseProgress } from '@/types/models';
import {
  dayKey,
  nextSteps,
  previousMonth,
  studyIntensity,
  studyStreak,
  weekOf,
  type NextStep,
  type StudyIntensity,
} from './today';

/**
 * Los próximos pasos del curso que se está haciendo, con el mismo temario y las mismas reglas
 * que el visor del curso. Se vuelven a pedir cuando cambia el avance del curso.
 *
 * @returns `null` mientras cargan o si no hay curso; una lista vacía si no queda nada pendiente.
 */
export function useCourseSteps(course: Course | null): NextStep[] | null {
  const [steps, setSteps] = useState<NextStep[] | null>(null);
  const guid = course?.guid;
  const completedResources = course?.completedResources;

  useEffect(() => {
    setSteps(null);
    if (!guid) return;
    let current = true;
    Promise.all([api.get<Course>(`/courses/${guid}`), api.get<CourseProgress>(`/students/progress/${guid}`)])
      .then(([content, progress]) => {
        if (!current) return;
        const syllabus = buildSyllabus(
          content.data.modules ?? [],
          pathProgressFrom(progress.data),
          content.data.strictOrder ?? true,
        );
        setSteps(nextSteps(syllabus));
      })
      // Los pasos son una ayuda: si no cargan, queda el botón para entrar al curso.
      .catch(() => current && setSteps([]));
    return () => {
      current = false;
    };
  }, [guid, completedResources]);

  return steps;
}

export interface StudyDay {
  key: string;
  /** «Lu», «Ma»…: el día de la semana, corto. */
  label: string;
  studied: boolean;
  /** Minutos de estudio en el visor ese día. */
  minutes: number;
  intensity: StudyIntensity;
  isToday: boolean;
  /** Aún no ha llegado: no se puede haber estudiado. */
  future: boolean;
}

const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

/** Lo que la API cuenta de un mes: los días con actividad y los minutos de estudio de cada uno. */
interface ActiveDays {
  days: number[];
  minutes?: Record<string, number>;
}

/**
 * La semana de estudio: qué días de esta semana se estudió, cuánto tiempo y cuántos días seguidos
 * van. Se piden el mes actual y el anterior, porque la semana y la racha pueden empezar en él.
 */
export function useStudyWeek(userGuid: string | undefined) {
  // El día se fija al abrir el tablero: es el que se está mirando.
  const [today] = useState(calendarDay);
  const [activity, setActivity] = useState<{ active: Set<string>; minutes: Map<string, number> } | null>(null);

  useEffect(() => {
    if (!userGuid) return;
    let current = true;
    const months = [previousMonth(today), { year: today.year, month: today.month }];
    Promise.all(
      months.map((target) =>
        api.get<ActiveDays>('/students/active-days', { params: target }).then(({ data }) => ({ target, data })),
      ),
    )
      .then((answers) => {
        if (!current) return;
        const active = new Set<string>();
        const minutes = new Map<string, number>();
        for (const { target, data } of answers) {
          for (const day of Array.isArray(data.days) ? data.days : []) active.add(dayKey({ ...target, day }));
          for (const [day, value] of Object.entries(data.minutes ?? {})) {
            minutes.set(dayKey({ ...target, day: Number(day) }), Number(value) || 0);
          }
        }
        setActivity({ active, minutes });
      })
      // Sin los días, la semana se ve vacía en lugar de romper el tablero.
      .catch(() => current && setActivity({ active: new Set(), minutes: new Map() }));
    return () => {
      current = false;
    };
  }, [userGuid, today]);

  return useMemo(() => {
    if (!activity) return null;
    const { active, minutes } = activity;
    const todayKey = dayKey(today);
    const todayValue = Date.UTC(today.year, today.month, today.day);
    const days: StudyDay[] = weekOf(today).map((day, index) => {
      const key = dayKey(day);
      const studied = active.has(key);
      const dayMinutes = minutes.get(key) ?? 0;
      return {
        key,
        label: WEEKDAYS[index],
        studied,
        minutes: dayMinutes,
        intensity: studyIntensity(dayMinutes, studied),
        isToday: key === todayKey,
        future: Date.UTC(day.year, day.month, day.day) > todayValue,
      };
    });
    const weekMinutes = days.reduce((total, day) => total + day.minutes, 0);
    return { days, weekMinutes, streak: studyStreak(active, today) };
  }, [activity, today]);
}
