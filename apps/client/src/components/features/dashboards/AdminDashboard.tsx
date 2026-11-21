'use client';

import { PageLoader } from '@/components/ui/PageLoader';
import { useSession } from '@/contexts/SessionContext';
import { useCountry } from '@/contexts/CountryContext';
import { formatNumber } from '@/lib/country';
import { useAdminDashboard } from './admin/useAdminDashboard';
import { SiteStats } from './admin/SiteStats';
import { WeeklyActivityPanel } from './admin/WeeklyActivityPanel';
import { EnrollmentPanel } from './admin/EnrollmentPanel';

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

export function AdminDashboard() {
  const { stats, loading } = useAdminDashboard();
  const { user } = useSession();
  const { name: countryName, country } = useCountry();
  const count = (value: number) => formatNumber(value, country);

  if (loading) return <PageLoader message="Cargando panel de la sede…" />;

  return (
    <div className="animate-fade-slide-in">
      {/* ── Cabecera con el saludo ── */}
      <header className="mb-10">
        <p className="text-sm font-medium text-muted-foreground mb-1">{timeOfDayGreeting()},</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{user?.firstName || 'Administrador'}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Panel de control de la sede{countryName ? ` de ${countryName}` : ''}
        </p>
      </header>

      {/* ── Tarjetas de cifras ── */}
      <SiteStats stats={stats} count={count} />

      {/* ── Fila de gráficas ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 items-start gap-6 mb-10">
        <WeeklyActivityPanel days={stats?.weeklyActivity ?? []} />
        <EnrollmentPanel courses={stats?.courseBreakdown ?? []} total={stats?.totalEnrollments ?? 0} count={count} />
      </div>
    </div>
  );
}
