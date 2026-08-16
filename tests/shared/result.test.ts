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
    const first: ApplicationError = { code: 'nota_invalida', message: 'nota fora de 0 a 10' };
    const second: ApplicationError = { code: 'bimestre_fechado', message: 'bimestre fechado' };

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

    const result = fieldFailure(field, 'email_em_uso', 'já existe usuário com este e-mail');

    expect(result).toEqual({
      ok: false,
      errors: [{ field: 'email', code: 'email_em_uso', message: 'já existe usuário com este e-mail' }],
    });
  });
});

describe('schemaErrors', () => {
  test('converts each zod issue while preserving the field name', () => {
    const schema = z.object({ nome: z.string().min(3, 'nome curto demais') });

    const errors = schemaErrors(issuesOf(schema, { nome: 'Jo' }));

    expect(errors).toEqual([{ code: 'too_small', message: 'nome curto demais', field: 'nome' }]);
  });

  test('preserves the full path of a nested field, array index included', () => {
    const schema = z.object({
      notas: z.array(z.object({ valor: z.number().max(10, 'nota acima de dez') })),
    });

    const errors = schemaErrors(issuesOf(schema, { notas: [{ valor: 8 }, { valor: 11 }] }));

    expect(errors).toEqual([{ code: 'too_big', message: 'nota acima de dez', field: 'notas.1.valor' }]);
  });

  test('converts every issue at once, not just the first', () => {
    const schema = z.object({
      nome: z.string().min(3, 'nome curto demais'),
      ano: z.number().int('ano precisa ser inteiro'),
    });

    const errors = schemaErrors(issuesOf(schema, { nome: 'Jo', ano: 2026.5 }));

    expect(errors.map((error) => error.field)).toEqual(['nome', 'ano']);
  });

  test('omits the `field` key when the error belongs to the schema root', () => {
    const schema = z
      .object({ dataInicio: z.string(), dataFim: z.string() })
      .refine((value) => value.dataFim > value.dataInicio, 'fim antes do início');

    const errors = schemaErrors(issuesOf(schema, { dataInicio: '2026-12-15', dataFim: '2026-02-01' }));

    expect(errors).toEqual([{ code: 'custom', message: 'fim antes do início' }]);
    expect(Object.hasOwn(errors[0] ?? {}, 'field')).toBe(false);
  });

  test('an empty list of issues becomes an empty list of errors', () => {
    const schema = z.object({ nome: z.string() });

    const errors = schemaErrors(issuesOf(schema, { nome: 'Ana' }));

    expect(errors).toEqual([]);
  });
});
