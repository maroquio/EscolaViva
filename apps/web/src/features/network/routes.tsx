import { Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { NETWORK_CHILD_ROUTES, WILDCARD_ROUTE } from '../../constants';
import { ErrorBoundary } from '../../shared/ui/ErrorBoundary';
import { Loading } from '../../shared/ui/Loading';
import { NotFound } from '../../shared/ui/NotFound';
import { AcademicYearForm } from './AcademicYearForm';
import { AcademicYearList } from './AcademicYearList';
import { Dashboard } from './Dashboard';
import { SchoolForm } from './SchoolForm';
import { SchoolList } from './SchoolList';
import { UserForm } from './UserForm';
import { UserList } from './UserList';

export default function NetworkRoutes(): React.ReactElement {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path={NETWORK_CHILD_ROUTES.schools} element={<SchoolList />} />
          <Route path={NETWORK_CHILD_ROUTES.newSchool} element={<SchoolForm />} />
          <Route path={NETWORK_CHILD_ROUTES.users} element={<UserList />} />
          <Route path={NETWORK_CHILD_ROUTES.newUser} element={<UserForm />} />
          <Route path={NETWORK_CHILD_ROUTES.academicYears} element={<AcademicYearList />} />
          <Route path={NETWORK_CHILD_ROUTES.newAcademicYear} element={<AcademicYearForm />} />
          <Route path={WILDCARD_ROUTE} element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
