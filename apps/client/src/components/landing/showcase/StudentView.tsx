import type { CSSProperties, ReactNode } from 'react';
import { CircleCheck, Lock, Play, Zap } from 'lucide-react';
import { AgendaHead, AgendaRow, AppTopBar, StudyWeek, TodayHello, placed } from './parts';
import { StudentPhone } from './StudentPhone';

const bar = (share: number) => ({ '--w': share }) as CSSProperties;

/** «Hoy» de quien se capacita, con su celular al lado. Vista de la portada. */
export function StudentView({ platformName, site }: { platformName: string; site: ReactNode }) {
  return (
    <>
      <div className="app with-top">
        <AppTopBar
          platformName={platformName}
          site={site}
          initials="JR"
          tabs={[
            { label: 'Hoy', current: true },
            { label: 'Cursos' },
            { label: 'Certificados' },
            { label: 'Mensajes' },
          ]}
        />
        <div className="app-main hoy">
          <div className="today-main">
            <TodayHello
              eyebrow="Lunes, 26 de octubre"
              title="Buenas tardes, Juana."
              lead={
                <>
                  Te faltan <b>3 recursos</b> para terminar <b>Manejo defensivo</b> y obtener su certificado.
                </>
              }
            />
            <div>
              <AgendaHead title="Para hoy" aside="Manejo defensivo · 75 %" />
              <ol className="ag-list">
                <AgendaRow
                  marker="Vídeo"
                  state="now"
                  title="Conducción nocturna"
                  detail="Módulo 4 · Visibilidad"
                  action={
                    <span className="ag-go">
                      <Play className="i" />
                      Continuar
                    </span>
                  }
                />
                <AgendaRow
                  marker="Tarea"
                  state="locked"
                  title="Plan de viaje con lluvia"
                  detail={
                    <>
                      <Lock className="i" />
                      Se abre al completar lo anterior
                    </>
                  }
                />
                <AgendaRow
                  marker="Cuestionario"
                  state="locked"
                  title="Evaluación final"
                  detail={
                    <>
                      <Lock className="i" />
                      Se abre al entregar la tarea
                    </>
                  }
                />
              </ol>
            </div>
            <div>
              <AgendaHead title="Tus otros cursos" aside="1 pendiente" />
              <ol className="ag-list">
                <AgendaRow
                  marker="2 de 8"
                  title="Primeros auxilios en carretera"
                  detail="En curso · 25 % completado"
                  action={<span className="ag-ghost">Seguir</span>}
                />
              </ol>
            </div>
          </div>
          <div className="today-side">
            <div className="app-card side-card">
              <p className="side-head">
                <b>Tu semana</b>
                <small>2 h 40 min</small>
              </p>
              <StudyWeek levels={[2, 3, 0, 1, 3, 0, 0]} today={0} />
              <p className="streak">
                <Zap className="i" />
                <span>
                  <b>4 días seguidos</b> estudiando
                </span>
              </p>
            </div>
            <div className="app-card side-card">
              <p className="side-head">
                <b>Tus cursos</b>
                <small>2 asignados</small>
              </p>
              <p className="course-row">
                <span>Manejo defensivo</span>
                <b>75 %</b>
              </p>
              <span className="row-bar">
                <i style={bar(0.75)} />
              </span>
              <p className="course-row">
                <span>Normas de tránsito</span>
                <b>100 %</b>
              </p>
              <span className="row-bar done">
                <i style={bar(1)} />
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="sat floaty" style={placed({ x: '-5%', y: '7%', z: '90px', float: '-1s' })}>
        <span className="sat-icon ok">
          <CircleCheck className="i" />
        </span>
        <p>
          <b>Entrega calificada</b>
          <small>Inspección preoperacional · 92/100</small>
        </p>
      </div>

      <StudentPhone className="floaty" style={placed({ x: '77%', y: '20%', z: '140px', float: '-3s' })} />
    </>
  );
}
