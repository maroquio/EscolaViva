import { Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { GUARDIAN_CHILD_ROUTES, WILDCARD_ROUTE } from '../../constants';
import { ErrorBoundary } from '../../shared/ui/ErrorBoundary';
import { Loading } from '../../shared/ui/Loading';
import { NotFound } from '../../shared/ui/NotFound';
import { Announcement } from './Announcement';
import { Attendance } from './Attendance';
import { Board } from './Board';
import { MyStudents } from './MyStudents';
import { ReportCard } from './ReportCard';

export default function GuardianRoutes(): React.ReactElement {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route index element={<MyStudents />} />
          <Route path={GUARDIAN_CHILD_ROUTES.reportCard} element={<ReportCard />} />
          <Route path={GUARDIAN_CHILD_ROUTES.attendance} element={<Attendance />} />
          <Route path={GUARDIAN_CHILD_ROUTES.board} element={<Board />} />
          <Route path={GUARDIAN_CHILD_ROUTES.announcement} element={<Announcement />} />
          <Route path={WILDCARD_ROUTE} element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
