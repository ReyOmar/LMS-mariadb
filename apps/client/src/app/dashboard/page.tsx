'use client';

import { useSession } from '@/contexts/SessionContext';
import { AdminDashboard } from '@/components/features/dashboards/AdminDashboard';
import { ExaminerDashboard } from '@/components/features/dashboards/ExaminerDashboard';
import { StudentDashboard } from '@/components/features/dashboards/StudentDashboard';

/** El panel de inicio es distinto para cada rol. */
export default function DashboardPage() {
  const { role } = useSession();

  return (
    <>
      {role === 'admin' && <AdminDashboard />}
      {role === 'teacher' && <ExaminerDashboard />}
      {role === 'student' && <StudentDashboard />}
    </>
  );
}
