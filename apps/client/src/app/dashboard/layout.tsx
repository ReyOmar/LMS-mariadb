import { Sidebar } from '@/components/layout/Sidebar';
import { SessionGuard } from '@/components/layout/SessionGuard';
import { DashboardShell } from '@/components/layout/DashboardShell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGuard>
      <DashboardShell sidebar={<Sidebar />}>{children}</DashboardShell>
    </SessionGuard>
  );
}
