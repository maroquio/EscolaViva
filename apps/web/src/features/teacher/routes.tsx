import { Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { TEACHER_CHILD_ROUTES, WILDCARD_ROUTE } from '../../constants';
import { ErrorBoundary } from '../../shared/ui/ErrorBoundary';
import { Loading } from '../../shared/ui/Loading';
import { NotFound } from '../../shared/ui/NotFound';
import { Closing } from './Closing';
import { Grades } from './Grades';
import { MyClassGroups } from './MyClassGroups';
import { RollCall } from './RollCall';

export default function TeacherRoutes(): React.ReactElement {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route index element={<MyClassGroups />} />
          <Route path={TEACHER_CHILD_ROUTES.grades} element={<Grades />} />
          <Route path={TEACHER_CHILD_ROUTES.rollCall} element={<RollCall />} />
          <Route path={TEACHER_CHILD_ROUTES.closing} element={<Closing />} />
          <Route path={WILDCARD_ROUTE} element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
