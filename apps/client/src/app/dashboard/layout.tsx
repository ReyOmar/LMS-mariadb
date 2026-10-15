import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { SessionGuard } from '@/components/layout/SessionGuard';
import { DashboardShell } from '@/components/layout/DashboardShell';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGuard>
      <DashboardShell sidebar={<Sidebar />}>{children}</DashboardShell>
    </SessionGuard>
  );
}
