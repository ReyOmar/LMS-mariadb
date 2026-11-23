'use client';

import { useSession } from '@/contexts/SessionContext';
import { AdminToday } from '@/components/features/dashboards/admin/AdminToday';
import { ExaminerToday } from '@/components/features/dashboards/examiner/ExaminerToday';
import { StudentToday } from '@/components/features/dashboards/student/StudentToday';

/** «Hoy»: el inicio de cada rol, con lo que le toca hacer y cómo va lo suyo. */
export default function DashboardPage() {
  const { role } = useSession();

  return (
    <>
      {role === 'admin' && <AdminToday />}
      {role === 'teacher' && <ExaminerToday />}
      {role === 'student' && <StudentToday />}
    </>
  );
}
