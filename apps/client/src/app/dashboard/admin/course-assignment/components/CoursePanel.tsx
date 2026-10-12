'use client';

import { useState } from 'react';
import { ChevronRight, GraduationCap, Presentation } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AssignableCourse, Person } from '../assignment';
import { StudentsTab } from './StudentsTab';
import { ExaminerTab } from './ExaminerTab';

type Tab = 'students' | 'examiner';

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'students', label: 'Estudiantes', icon: GraduationCap },
  { id: 'examiner', label: 'Examinador', icon: Presentation },
];

interface Props {
  course: AssignableCourse;
  changingHolder: boolean;
  batchRunning: boolean;
  onBatchRunningChange: (running: boolean) => void;
  onBack: () => void;
  onAssign: (examiner: Person) => void;
  onUnassign: () => void;
}

/** Las dos pestañas siguen montadas para no perder lo cargado al pasar de una a otra. */
export function CoursePanel({
  course,
  changingHolder,
  batchRunning,
  onBatchRunningChange,
  onBack,
  onAssign,
  onUnassign,
}: Props) {
  const [tab, setTab] = useState<Tab>('students');

  return (
    <div className="flex-1 flex flex-col h-full animate-in fade-in zoom-in-95 duration-300">
      <div className="p-6 border-b border-border bg-gradient-to-br from-card to-muted/20 shrink-0">
        <button
          type="button"
          onClick={onBack}
          disabled={batchRunning}
          className="lg:hidden flex items-center gap-2 text-sm font-bold text-primary mb-3 hover:underline disabled:opacity-60"
        >
          <ChevronRight className="h-4 w-4 rotate-180" /> Volver a cursos
        </button>
        <h2 className="text-2xl font-bold text-foreground mb-1">{course.title}</h2>
        <p className="text-sm text-muted-foreground mb-6">Gestiona quién participa en este curso.</p>

        <div role="tablist" className="flex p-1 bg-muted/50 rounded-xl w-fit">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`assignment-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`assignment-panel-${id}`}
              onClick={() => setTab(id)}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
                tab === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative min-h-0">
        <TabPanel id="students" hidden={tab !== 'students'}>
          <StudentsTab courseGuid={course.guid} onBatchRunningChange={onBatchRunningChange} />
        </TabPanel>
        <TabPanel id="examiner" hidden={tab !== 'examiner'}>
          <ExaminerTab course={course} changing={changingHolder} onAssign={onAssign} onUnassign={onUnassign} />
        </TabPanel>
      </div>
    </div>
  );
}

function TabPanel({ id, hidden, children }: { id: Tab; hidden: boolean; children: React.ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={`assignment-panel-${id}`}
      aria-labelledby={`assignment-tab-${id}`}
      hidden={hidden}
      className="absolute inset-0 overflow-y-auto animate-in fade-in duration-300"
    >
      {children}
    </div>
  );
}
