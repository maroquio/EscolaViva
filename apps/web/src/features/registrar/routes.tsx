import { Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { REGISTRAR_CHILD_ROUTES, WILDCARD_ROUTE } from '../../constants';
import { ErrorBoundary } from '../../shared/ui/ErrorBoundary';
import { Loading } from '../../shared/ui/Loading';
import { NotFound } from '../../shared/ui/NotFound';
import { Dashboard } from './Dashboard';
import { AssignmentForm } from './class-groups/AssignmentForm';
import { ClassGroupForm } from './class-groups/ClassGroupForm';
import { ClassGroupList } from './class-groups/ClassGroupList';
import { ClassGroupRecord } from './class-groups/ClassGroupRecord';
import { GuardianForm } from './guardians/GuardianForm';
import { GuardianList } from './guardians/GuardianList';
import { EnrollmentForm } from './students/EnrollmentForm';
import { GuardianLinkForm } from './students/GuardianLinkForm';
import { StudentForm } from './students/StudentForm';
import { StudentRecord } from './students/StudentRecord';
import { StudentSearch } from './students/StudentSearch';
import { TransferForm } from './students/TransferForm';
import { SubjectForm } from './subjects/SubjectForm';
import { SubjectList } from './subjects/SubjectList';

export default function RegistrarRoutes(): React.ReactElement {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route index element={<Dashboard />} />

          <Route path={REGISTRAR_CHILD_ROUTES.students} element={<StudentSearch />} />
          <Route path={REGISTRAR_CHILD_ROUTES.newStudent} element={<StudentForm />} />
          <Route path={REGISTRAR_CHILD_ROUTES.student} element={<StudentRecord />} />
          <Route
            path={REGISTRAR_CHILD_ROUTES.newStudentGuardian}
            element={<GuardianLinkForm />}
          />
          <Route path={REGISTRAR_CHILD_ROUTES.enroll} element={<EnrollmentForm />} />

          <Route
            path={REGISTRAR_CHILD_ROUTES.enrollmentTransfer}
            element={<TransferForm />}
          />

          <Route path={REGISTRAR_CHILD_ROUTES.guardians} element={<GuardianList />} />
          <Route path={REGISTRAR_CHILD_ROUTES.newGuardian} element={<GuardianForm />} />

          <Route path={REGISTRAR_CHILD_ROUTES.classGroups} element={<ClassGroupList />} />
          <Route path={REGISTRAR_CHILD_ROUTES.newClassGroup} element={<ClassGroupForm />} />
          <Route path={REGISTRAR_CHILD_ROUTES.classGroup} element={<ClassGroupRecord />} />
          <Route
            path={REGISTRAR_CHILD_ROUTES.newClassGroupSubject}
            element={<AssignmentForm />}
          />

          <Route path={REGISTRAR_CHILD_ROUTES.subjects} element={<SubjectList />} />
          <Route path={REGISTRAR_CHILD_ROUTES.newSubject} element={<SubjectForm />} />
          <Route path={WILDCARD_ROUTE} element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
