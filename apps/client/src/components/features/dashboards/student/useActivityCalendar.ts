'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { calendarDay } from '@/lib/dates';

/** El calendario de actividad: el mes a la vista y los días de ese mes en que el alumno estudió. */
export function useActivityCalendar(userGuid: string | undefined) {
  // Al abrir, el mes de hoy en la sede.
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const { year, month } = calendarDay();
    return new Date(year, month, 1);
  });
  const [activeDays, setActiveDays] = useState<number[]>([]);
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();

  useEffect(() => {
    if (!userGuid) return;
    let current = true;
    setActiveDays([]); // Se vacía ya, para no enseñar un instante los días del mes anterior.
    api
      .get<{ days: number[] }>('/students/active-days', { params: { year, month } })
      .then(({ data }) => {
        // Al pasar de mes deprisa, sólo cuenta la respuesta del mes que está a la vista.
        if (current) setActiveDays(Array.isArray(data.days) ? data.days : []);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [userGuid, year, month]);

  return {
    year,
    month,
    daysInMonth: new Date(year, month + 1, 0).getDate(),
    /** 0 = domingo. */
    firstDayOfWeek: new Date(year, month, 1).getDay(),
    today: calendarDay(),
    activeDays,
    previousMonth: () => setVisibleMonth(new Date(year, month - 1, 1)),
    nextMonth: () => setVisibleMonth(new Date(year, month + 1, 1)),
  };
}

export type ActivityCalendarState = ReturnType<typeof useActivityCalendar>;
