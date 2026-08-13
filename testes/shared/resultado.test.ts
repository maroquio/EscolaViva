/*
 * `Resultado` é o que todo caso de uso devolve. O discriminante `ok` é o que a camada web usa
 * para decidir entre redirecionar e re-renderizar o formulário com as mensagens, então o formato
 * é contrato, não detalhe.
 */

import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import {
  errosDeSchema,
  falha,
  falhaDeCampo,
  sucesso,
  type ErroDeAplicacao,
} from '../../src/shared/resultado';

/** Issues de zod de verdade: é delas que `errosDeSchema` vive em todos os casos de uso. */
function issuesDe(schema: z.ZodTypeAny, entrada: unknown): z.ZodIssue[] {
  const analise = schema.safeParse(entrada);
  return analise.success ? [] : analise.error.issues;
}

describe('sucesso', () => {
  test('marca ok como verdadeiro e carrega o valor', () => {
    const valor = { id: 'm1', situacao: 'ativa' };

    const resultado = sucesso(valor);

    expect(resultado).toEqual({ ok: true, valor });
  });

  test('aceita void como valor, para caso de uso que não devolve nada', () => {
    const nada = undefined;

    const resultado = sucesso(nada);

    expect(resultado).toEqual({ ok: true, valor: undefined });
  });
});

describe('falha', () => {
  test('marca ok como falso e carrega os erros na ordem recebida', () => {
    const primeiro: ErroDeAplicacao = { codigo: 'nota_invalida', mensagem: 'nota fora de 0 a 10' };
    const segundo: ErroDeAplicacao = { codigo: 'bimestre_fechado', mensagem: 'bimestre fechado' };

    const resultado = falha(primeiro, segundo);

    expect(resultado).toEqual({ ok: false, erros: [primeiro, segundo] });
  });

  test('sem argumento nenhum devolve lista de erros vazia', () => {
    const semErros: ErroDeAplicacao[] = [];

    const resultado = falha(...semErros);

    expect(resultado).toEqual({ ok: false, erros: [] });
  });
});

describe('falhaDeCampo', () => {
  test('produz um único erro amarrado ao campo do formulário', () => {
    const campo = 'email';

    const resultado = falhaDeCampo(campo, 'email_em_uso', 'já existe usuário com este e-mail');

    expect(resultado).toEqual({
      ok: false,
      erros: [{ campo: 'email', codigo: 'email_em_uso', mensagem: 'já existe usuário com este e-mail' }],
    });
  });
});

describe('errosDeSchema', () => {
  test('converte cada issue de zod preservando o nome do campo', () => {
    const schema = z.object({ nome: z.string().min(3, 'nome curto demais') });

    const erros = errosDeSchema(issuesDe(schema, { nome: 'Jo' }));

    expect(erros).toEqual([{ codigo: 'too_small', mensagem: 'nome curto demais', campo: 'nome' }]);
  });

  test('preserva o caminho completo de campo aninhado, com o índice do array', () => {
    const schema = z.object({
      notas: z.array(z.object({ valor: z.number().max(10, 'nota acima de dez') })),
    });

    const erros = errosDeSchema(issuesDe(schema, { notas: [{ valor: 8 }, { valor: 11 }] }));

    expect(erros).toEqual([{ codigo: 'too_big', mensagem: 'nota acima de dez', campo: 'notas.1.valor' }]);
  });

  test('converte todas as issues de uma vez, e não só a primeira', () => {
    const schema = z.object({
      nome: z.string().min(3, 'nome curto demais'),
      ano: z.number().int('ano precisa ser inteiro'),
    });

    const erros = errosDeSchema(issuesDe(schema, { nome: 'Jo', ano: 2026.5 }));

    expect(erros.map((erro) => erro.campo)).toEqual(['nome', 'ano']);
  });

  test('omite a chave campo quando o erro é da raiz do schema', () => {
    const schema = z
      .object({ dataInicio: z.string(), dataFim: z.string() })
      .refine((valor) => valor.dataFim > valor.dataInicio, 'fim antes do início');

    const erros = errosDeSchema(issuesDe(schema, { dataInicio: '2026-12-15', dataFim: '2026-02-01' }));

    expect(erros).toEqual([{ codigo: 'custom', mensagem: 'fim antes do início' }]);
    expect(Object.hasOwn(erros[0] ?? {}, 'campo')).toBe(false);
  });

  test('lista vazia de issues vira lista vazia de erros', () => {
    const schema = z.object({ nome: z.string() });

    const erros = errosDeSchema(issuesDe(schema, { nome: 'Ana' }));

    expect(erros).toEqual([]);
  });
});
