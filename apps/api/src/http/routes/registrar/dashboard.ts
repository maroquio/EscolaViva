import { Hono } from 'hono';
import { academics } from '../../../academics';
import { currentNetwork, type Variables } from '../../../shared/http';
import { idsOf, registrarSchools } from '../../registrarScope';
import { sliceItems } from '../../../shared/pagination';
import { REGISTRAR_ROUTES } from '../../constants';
import { pageFromQuery } from '../../pagination';
import type { RegistrarDashboard } from '@escolaviva/contracts/students';
import { pageAsJson } from '../../presenters/page';
import { academicYearAsJson, schoolInDashboardAsJson } from '../../presenters/students';

export const dashboardRoutes = new Hono<{ Variables: Variables }>();

dashboardRoutes.get(REGISTRAR_ROUTES.dashboard, async (c) => {
  const networkId = currentNetwork(c);
  const schools = registrarSchools(c);
  const page = sliceItems(schools, pageFromQuery(c));

  const [academicYears, totals, bySchool] = await Promise.all([
    academics.listAcademicYears(networkId),
    academics.scopeTotals(networkId, idsOf(schools)),
    academics.countsBySchool(networkId, idsOf(page.items)),
  ]);
  const currentYear = academicYears[0];

  const dashboard: RegistrarDashboard = {
    schools: pageAsJson(page, (school) =>
      schoolInDashboardAsJson(school, bySchool.get(school.id)),
    ),
    currentYear: currentYear === undefined ? null : academicYearAsJson(currentYear),
    totals: {
      classGroups: totals.classGroups,
      enrollments: totals.enrollments,
      guardians: totals.guardians,
      subjects: totals.subjects,
    },
  };
  return c.json(dashboard);
});
