import type { Connection } from '../../shared/db';
import { INTERNAL_ERRORS } from '../constants';
import { isValidShift, type ClassGroup, type Shift } from '../domain/classGroup';

export type ClassGroupRow = {
  id: string;
  network_id: string;
  school_id: string;
  academic_year_id: string;
  name: string;
  grade_level: string;
  shift: string;
};

export function toShift(value: string): Shift {
  if (!isValidShift(value)) throw new Error(INTERNAL_ERRORS.unknownShift(value));
  return value;
}

export const toClassGroup = (row: ClassGroupRow): ClassGroup => ({
  id: row.id,
  networkId: row.network_id,
  schoolId: row.school_id,
  academicYearId: row.academic_year_id,
  name: row.name,
  gradeLevel: row.grade_level,
  shift: toShift(row.shift),
});

export const classGroups = (sql: Connection) => sql`
    SELECT id, network_id, school_id, academic_year_id, name, grade_level, shift
      FROM class_group`;
