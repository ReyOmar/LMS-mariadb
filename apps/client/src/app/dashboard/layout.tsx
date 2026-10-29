import type { ReactNode } from 'react';
import { SessionGuard } from '@/components/layout/SessionGuard';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <SessionGuard>{children}</SessionGuard>;
}
