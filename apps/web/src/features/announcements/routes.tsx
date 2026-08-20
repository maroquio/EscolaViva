import { Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { ANNOUNCEMENT_CHILD_ROUTES, WILDCARD_ROUTE } from '../../constants';
import { ErrorBoundary } from '../../shared/ui/ErrorBoundary';
import { Loading } from '../../shared/ui/Loading';
import { NotFound } from '../../shared/ui/NotFound';
import { AnnouncementForm } from './AnnouncementForm';
import { AnnouncementList } from './AnnouncementList';

export default function AnnouncementsRoutes(): React.ReactElement {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route index element={<AnnouncementList />} />
          <Route path={ANNOUNCEMENT_CHILD_ROUTES.newAnnouncement} element={<AnnouncementForm />} />
          <Route path={WILDCARD_ROUTE} element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
