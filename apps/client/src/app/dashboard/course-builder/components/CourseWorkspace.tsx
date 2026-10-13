'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/contexts/SessionContext';
import { useCourseLock } from '@/hooks/useCourseLock';
import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import type { Course } from '@/types/models';
import { useCourseWorkspace, type CourseWorkspace as Workspace } from '../useCourseWorkspace';
import { useOutlineActions } from '../useOutlineActions';
import { useCourseExit } from '../useCourseExit';
import { useCoverEditor } from '../useCoverEditor';
import { CourseInUseAlert, DraftExitAlert } from './Notices';
import { CourseHeader } from './CourseHeader';
import { CourseSettings } from './CourseSettings';
import { ModuleSettings } from './ModuleSettings';
import { CourseOutline } from './CourseOutline';
import { ResourcePreview } from './ResourcePreview';
import { BUILDER_PATH, newResourceEditorUrl, resourceEditorUrl } from './paths';
import { resolveSelection, toggleSelection, type Selection } from './selection';

interface Props {
  courseGuid: string;
  initialSelection: Selection;
}

/** Un curso abierto en el constructor. Mientras sea de otra persona, sólo se puede salir. */
export function CourseWorkspace({ courseGuid, initialSelection }: Props) {
  const router = useRouter();
  const { role } = useSession();
  const isTeacher = role === 'teacher';
  const leave = useCallback(
    (destination?: string) => router.push(destination ?? (isTeacher ? '/dashboard' : BUILDER_PATH)),
    [router, isTeacher],
  );
  const workspace = useCourseWorkspace(courseGuid, leave);
  const otherEditor = useCourseLock(courseGuid);

  if (!workspace.course) {
    return workspace.error ? (
      <LoadFailed message={workspace.error} onRetry={() => void workspace.reload()} />
    ) : (
      <PageLoader message="Abriendo el curso..." />
    );
  }

  return (
    <>
      <OpenCourse
        course={workspace.course}
        workspace={workspace}
        initialSelection={initialSelection}
        canDelete={!isTeacher}
        leave={leave}
      />
      {otherEditor && (
        <CourseInUseAlert
          courseTitle={workspace.course.title}
          editor={otherEditor}
          exitText={isTeacher ? 'Volver a mis asignaciones' : 'Volver a gestión de cursos'}
          onExit={() => leave()}
        />
      )}
    </>
  );
}

interface OpenCourseProps {
  course: Course;
  workspace: Workspace;
  initialSelection: Selection;
  canDelete: boolean;
  leave: (destination?: string) => void;
}

function OpenCourse({ course, workspace, initialSelection, canDelete, leave }: OpenCourseProps) {
  const router = useRouter();
  const outline = useOutlineActions(workspace);
  const cover = useCoverEditor(workspace.saveCover);
  const exit = useCourseExit({
    courseGuid: course.guid,
    isDraft: course.status === 'DRAFT',
    publish: workspace.publish,
    leave,
  });
  const [selection, setSelection] = useState(initialSelection);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>(() =>
    initialSelection.type === 'RESOURCE' ? { [initialSelection.moduleGuid]: true } : {},
  );

  const readOnly = course.status !== 'DRAFT';
  const selected = resolveSelection(course, selection);

  const deleteCourse = async () => {
    if (await workspace.deleteCourse()) leave();
  };

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-700 h-[calc(100vh-6rem)] flex flex-col overflow-hidden bg-background">
      <CourseHeader
        course={course}
        canDelete={canDelete}
        readOnly={readOnly}
        onBack={exit.tryToLeave}
        onChangeStatus={(status) => void workspace.changeStatus(status)}
        onDelete={() => void deleteCourse()}
      />

      <div className="flex flex-1 h-[calc(100%-80px)] overflow-hidden">
        <div className="flex-1 bg-muted/10 overflow-y-auto p-4 pb-28 sm:p-8 sm:pb-28 lg:pb-8 relative">
          {selected.type === 'NONE' && (
            <CourseSettings
              key={course.guid}
              course={course}
              readOnly={readOnly}
              cover={cover}
              onSave={(changes) => void workspace.saveFields(changes)}
              onRemoveCover={() => void workspace.removeCover()}
            />
          )}

          {selected.type === 'MODULE' && (
            <ModuleSettings
              key={selected.module.guid}
              module={selected.module}
              readOnly={readOnly}
              onRename={(title) => void outline.renameModule(selected.module.guid, title)}
            />
          )}

          {selected.type === 'RESOURCE' && (
            <ResourcePreview
              resource={selected.resource}
              readOnly={readOnly}
              onEdit={() => router.push(resourceEditorUrl(course.guid, selected.module.guid, selected.resource.guid))}
              onDelete={() => void outline.deleteResource(selected.resource.guid)}
            />
          )}
        </div>

        <CourseOutline
          course={course}
          selection={selection}
          expandedModules={expandedModules}
          readOnly={readOnly}
          onToggleModule={(guid) => setExpandedModules((current) => ({ ...current, [guid]: !current[guid] }))}
          onSelect={(picked) => setSelection((current) => toggleSelection(current, picked))}
          onDeleteModule={(courseModule) => void outline.deleteModule(courseModule)}
          onCreateModule={outline.createModule}
          onNewResource={(moduleGuid, kind) => router.push(newResourceEditorUrl(course.guid, moduleGuid, kind))}
          onMoveResource={(moduleGuid, from, to) => void outline.moveResource(moduleGuid, from, to)}
        />
      </div>

      {exit.asking && (
        <DraftExitAlert
          unsavedCover={cover.previewUrl !== null}
          onPublishAndExit={() => void exit.publishAndLeave()}
          onExitWithoutPublishing={exit.leaveWithoutPublishing}
          onCancel={exit.stay}
        />
      )}
    </div>
  );
}
