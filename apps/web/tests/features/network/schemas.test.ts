import { describe, expect, test } from 'vitest';
import {
  academicYearSchema,
  schoolSchema,
  userSchema,
} from '../../../src/features/network/schemas';

const anInvitationWith = (roleAssignments: readonly { schoolId: string; role: string }[]) => ({
  name: 'Joana Ribeiro',
  cpf: '52998224725',
  email: 'joana@escolaviva.test',
  phone: '',
  roleAssignments,
});

describe('the school form', () => {
  test('takes a school with no INEP code, because the server takes it as absent too', () => {
    expect(schoolSchema.safeParse({ name: 'Escola Central', inepCode: '' }).success).toBe(true);
  });

  test('refuses a name that is only spaces, so nobody sends a form to be told it was blank', () => {
    expect(schoolSchema.safeParse({ name: '   ', inepCode: '' }).success).toBe(false);
  });
});

describe('the invitation form', () => {
  test('refuses an invitation with no assignment at all, even though an account with no role is a state /no-role exists for', () => {
    expect(userSchema.safeParse(anInvitationWith([])).success).toBe(false);
  });

  test('puts a half-filled assignment on the row it belongs to, because the server refusal names no row', () => {
    const parsed = userSchema.safeParse(anInvitationWith([{ schoolId: '', role: 'registrar' }]));
    const firstProblem = parsed.success ? undefined : parsed.error.issues[0];

    expect(parsed.success).toBe(false);
    expect(firstProblem?.path).toEqual(['roleAssignments', 0, 'schoolId']);
  });
});

describe('the academic year form', () => {
  test('refuses the string an <input type="number"> holds, which is why the form registers the year with valueAsNumber', () => {
    const parsed = academicYearSchema.safeParse({
      year: '2026',
      startDate: '2026-02-02',
      endDate: '2026-12-18',
    });

    expect(parsed.success).toBe(false);
  });

  test('carries no rule about the dates, because defineAcademicYear owns whether they make sense', () => {
    const endsBeforeItStarts = academicYearSchema.safeParse({
      year: 2026,
      startDate: '2026-12-18',
      endDate: '2026-02-02',
    });

    expect(endsBeforeItStarts.success).toBe(true);
  });

  test('and guards only against a typo in the year, which is the one thing the server cannot read minds about', () => {
    expect(
      academicYearSchema.safeParse({ year: 20260, startDate: '2026-02-02', endDate: '2026-12-18' })
        .success,
    ).toBe(false);
  });
});
