/*
 * `Result` is what every use case gives back. The `ok` discriminant is what the web layer reads to
 * decide between redirecting and re-rendering the form with its messages, so the shape is a
 * contract, not a detail.
 */

import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import {
  failure,
  fieldFailure,
  schemaErrors,
  success,
  type ApplicationError,
} from '../../src/shared/result';

/** Real zod issues: they are what `schemaErrors` lives off in every use case. */
function issuesOf(schema: z.ZodTypeAny, input: unknown): z.ZodIssue[] {
  const parsed = schema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues;
}

describe('success', () => {
  test('marks ok as true and carries the value', () => {
    const value = { id: 'm1', status: 'active' };

    const result = success(value);

    expect(result).toEqual({ ok: true, value: value });
  });

  test('takes void as the value, for the use case that gives nothing back', () => {
    const nothing = undefined;

    const result = success(nothing);

    expect(result).toEqual({ ok: true, value: undefined });
  });
});

describe('failure', () => {
  test('marks ok as false and carries the errors in the order received', () => {
    const first: ApplicationError = { code: 'invalid_grade', message: 'nota fora de 0 a 10' };
    const second: ApplicationError = { code: 'term_closed', message: 'bimestre fechado' };

    const result = failure(first, second);

    expect(result).toEqual({ ok: false, errors: [first, second] });
  });

  test('with no argument at all it gives back an empty list of errors', () => {
    const withoutErrors: ApplicationError[] = [];

    const result = failure(...withoutErrors);

    expect(result).toEqual({ ok: false, errors: [] });
  });
});

describe('fieldFailure', () => {
  test('produces a single error tied to the form field', () => {
    const field = 'email';

    const result = fieldFailure(field, 'email_in_use', 'já existe usuário com este e-mail');

    expect(result).toEqual({
      ok: false,
      errors: [{ field: 'email', code: 'email_in_use', message: 'já existe usuário com este e-mail' }],
    });
  });
});

describe('schemaErrors', () => {
  test('converts each zod issue while preserving the field name', () => {
    const schema = z.object({ name: z.string().min(3, 'name too short') });

    const errors = schemaErrors(issuesOf(schema, { name: 'Jo' }));

    expect(errors).toEqual([{ code: 'too_small', message: 'name too short', field: 'name' }]);
  });

  test('preserves the full path of a nested field, array index included', () => {
    const schema = z.object({
      grades: z.array(z.object({ value: z.number().max(10, 'grade above ten') })),
    });

    const errors = schemaErrors(issuesOf(schema, { grades: [{ value: 8 }, { value: 11 }] }));

    expect(errors).toEqual([{ code: 'too_big', message: 'grade above ten', field: 'grades.1.value' }]);
  });

  test('converts every issue at once, not just the first', () => {
    const schema = z.object({
      name: z.string().min(3, 'name too short'),
      year: z.number().int('year must be an integer'),
    });

    const errors = schemaErrors(issuesOf(schema, { name: 'Jo', year: 2026.5 }));

    expect(errors.map((error) => error.field)).toEqual(['name', 'year']);
  });

  test('omits the `field` key when the error belongs to the schema root', () => {
    const schema = z
      .object({ startDate: z.string(), endDate: z.string() })
      .refine((value) => value.endDate > value.startDate, 'fim antes do início');

    const errors = schemaErrors(issuesOf(schema, { startDate: '2026-12-15', endDate: '2026-02-01' }));

    expect(errors).toEqual([{ code: 'custom', message: 'fim antes do início' }]);
    expect(Object.hasOwn(errors[0] ?? {}, 'field')).toBe(false);
  });

  test('an empty list of issues becomes an empty list of errors', () => {
    const schema = z.object({ name: z.string() });

    const errors = schemaErrors(issuesOf(schema, { name: 'Ana' }));

    expect(errors).toEqual([]);
  });
});
