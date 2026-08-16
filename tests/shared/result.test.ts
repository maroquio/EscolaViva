/*
 * `Result` é o que todo caso de uso devolve. O discriminante `ok` é o que a camada web usa
 * para decidir entre redirecionar e re-renderizar o formulário com as mensagens, então o formato
 * é contrato, não detalhe.
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

/** Issues de zod de verdade: é delas que `schemaErrors` vive em todos os casos de uso. */
function issuesOf(schema: z.ZodTypeAny, input: unknown): z.ZodIssue[] {
  const parsed = schema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues;
}

describe('success', () => {
  test('marca ok como verdadeiro e carrega o valor', () => {
    const value = { id: 'm1', status: 'active' };

    const result = success(value);

    expect(result).toEqual({ ok: true, valor: value });
  });

  test('aceita void como valor, para caso de uso que não devolve nada', () => {
    const nothing = undefined;

    const result = success(nothing);

    expect(result).toEqual({ ok: true, valor: undefined });
  });
});

describe('failure', () => {
  test('marca ok como falso e carrega os erros na ordem recebida', () => {
    const first: ApplicationError = { codigo: 'nota_invalida', mensagem: 'nota fora de 0 a 10' };
    const second: ApplicationError = { codigo: 'bimestre_fechado', mensagem: 'bimestre fechado' };

    const result = failure(first, second);

    expect(result).toEqual({ ok: false, erros: [first, second] });
  });

  test('sem argumento nenhum devolve lista de erros vazia', () => {
    const withoutErrors: ApplicationError[] = [];

    const result = failure(...withoutErrors);

    expect(result).toEqual({ ok: false, erros: [] });
  });
});

describe('fieldFailure', () => {
  test('produz um único erro amarrado ao campo do formulário', () => {
    const field = 'email';

    const result = fieldFailure(field, 'email_em_uso', 'já existe usuário com este e-mail');

    expect(result).toEqual({
      ok: false,
      erros: [{ campo: 'email', codigo: 'email_em_uso', mensagem: 'já existe usuário com este e-mail' }],
    });
  });
});

describe('schemaErrors', () => {
  test('converte cada issue de zod preservando o nome do campo', () => {
    const schema = z.object({ nome: z.string().min(3, 'nome curto demais') });

    const errors = schemaErrors(issuesOf(schema, { nome: 'Jo' }));

    expect(errors).toEqual([{ codigo: 'too_small', mensagem: 'nome curto demais', campo: 'nome' }]);
  });

  test('preserva o caminho completo de campo aninhado, com o índice do array', () => {
    const schema = z.object({
      notas: z.array(z.object({ valor: z.number().max(10, 'nota acima de dez') })),
    });

    const errors = schemaErrors(issuesOf(schema, { notas: [{ valor: 8 }, { valor: 11 }] }));

    expect(errors).toEqual([{ codigo: 'too_big', mensagem: 'nota acima de dez', campo: 'notas.1.valor' }]);
  });

  test('converte todas as issues de uma vez, e não só a primeira', () => {
    const schema = z.object({
      nome: z.string().min(3, 'nome curto demais'),
      ano: z.number().int('ano precisa ser inteiro'),
    });

    const errors = schemaErrors(issuesOf(schema, { nome: 'Jo', ano: 2026.5 }));

    expect(errors.map((error) => error.campo)).toEqual(['nome', 'ano']);
  });

  test('omite a chave campo quando o erro é da raiz do schema', () => {
    const schema = z
      .object({ dataInicio: z.string(), dataFim: z.string() })
      .refine((value) => value.dataFim > value.dataInicio, 'fim antes do início');

    const errors = schemaErrors(issuesOf(schema, { dataInicio: '2026-12-15', dataFim: '2026-02-01' }));

    expect(errors).toEqual([{ codigo: 'custom', mensagem: 'fim antes do início' }]);
    expect(Object.hasOwn(errors[0] ?? {}, 'campo')).toBe(false);
  });

  test('lista vazia de issues vira lista vazia de erros', () => {
    const schema = z.object({ nome: z.string() });

    const errors = schemaErrors(issuesOf(schema, { nome: 'Ana' }));

    expect(errors).toEqual([]);
  });
});
