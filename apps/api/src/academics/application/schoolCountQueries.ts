import { reader } from '../../shared/db';
import * as classGroups from '../infra/classGroupRepository';
import * as enrollments from '../infra/enrollmentRepository';
import * as guardians from '../infra/guardianRepository';
import * as subjects from '../infra/subjectRepository';

export type SchoolCounts = {
  readonly classGroups: number;
  readonly enrollments: number;
  readonly guardians: number;
};

export async function scopeTotals(
  networkId: string,
  schoolIds: readonly string[],
): Promise<{ classGroups: number; enrollments: number; guardians: number; subjects: number }> {
  const sql = reader();
  const [byClassGroup, byEnrollment, howManyGuardians, howManySubjects] = await Promise.all([
    classGroups.countBySchool(sql, networkId, schoolIds),
    enrollments.countActiveBySchool(sql, networkId, schoolIds),
    guardians.countInSchools(sql, networkId, schoolIds),
    subjects.count(sql, networkId),
  ]);
  const sum = (counts: ReadonlyMap<string, number>): number =>
    schoolIds.reduce((total, id) => total + (counts.get(id) ?? 0), 0);
  return {
    classGroups: sum(byClassGroup),
    enrollments: sum(byEnrollment),
    guardians: howManyGuardians,
    subjects: howManySubjects,
  };
}

export async function countsBySchool(
  networkId: string,
  schoolIds: readonly string[],
): Promise<Map<string, SchoolCounts>> {
  const sql = reader();
  const [byClassGroup, byEnrollment, byGuardian] = await Promise.all([
    classGroups.countBySchool(sql, networkId, schoolIds),
    enrollments.countActiveBySchool(sql, networkId, schoolIds),
    guardians.countBySchool(sql, networkId, schoolIds),
  ]);
  return new Map(
    schoolIds.map((schoolId): [string, SchoolCounts] => [
      schoolId,
      {
        classGroups: byClassGroup.get(schoolId) ?? 0,
        enrollments: byEnrollment.get(schoolId) ?? 0,
        guardians: byGuardian.get(schoolId) ?? 0,
      },
    ]),
  );
}
