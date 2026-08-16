/*
 * A frequência do EscolaViva é POR DIA — nunca por aula. Este arquivo prova as duas consequências
 * disso: reenviar a chamada de uma data corrige a linha existente em vez de criar uma segunda, e a
 * constraint `attendance_unique_per_day` sustenta a mesma regra no banco.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { LIMITES_DA_AVALIACAO, avaliacao } from '../../src/avaliacao';
import {
  dataDeChamadaValida,
  dataDentroDoAnoLetivo,
} from '../../src/avaliacao/dominio/frequencia';
import { limparBanco, sqlDeTeste } from '../apoio/banco';
import {
  ANO_PADRAO,
  cenarioCompleto,
  criarAluno,
  criarAnoLetivo,
  criarMatricula,
  criarRede,
  criarTurma,
  criarUnidade,
  type Cenario,
} from '../apoio/fabricas';

const DIA_LETIVO = `${ANO_PADRAO}-03-10`;
const OUTRO_DIA_LETIVO = `${ANO_PADRAO}-03-11`;

let cenario: Cenario;

beforeEach(async () => {
  await limparBanco();
  cenario = await cenarioCompleto();
});

async function contarFrequencias(redeId: string): Promise<number> {
  const linhas = await sqlDeTeste()<{ total: number }[]>`
    SELECT count(*)::int AS total FROM attendance WHERE network_id = ${redeId}`;
  return linhas[0]?.total ?? 0;
}

async function matriculaDeOutraRede(): Promise<string> {
  const rede = await criarRede({});
  const unidade = await criarUnidade({ networkId: rede.id });
  const anoLetivo = await criarAnoLetivo({ networkId: rede.id });
  const turma = await criarTurma({
    networkId: rede.id,
    schoolId: unidade.id,
    academicYearId: anoLetivo.id,
  });
  const aluno = await criarAluno({ networkId: rede.id });
  const matricula = await criarMatricula({
    networkId: rede.id,
    studentId: aluno.id,
    classGroupId: turma.id,
    academicYearId: anoLetivo.id,
  });
  return matricula.id;
}

describe('frequencia (domínio)', () => {
  test('aceita data ISO que existe no calendário', () => {
    const aceitas = ['2026-03-10', '2024-02-29', '2026-12-31'].map(dataDeChamadaValida);

    expect(aceitas).toEqual([true, true, true]);
  });

  test('recusa data que não existe, mesmo com o formato certo', () => {
    const recusadas = ['2026-02-30', '2026-13-01', '2026-00-10'].map(dataDeChamadaValida);

    expect(recusadas).toEqual([false, false, false]);
  });

  test('recusa qualquer coisa fora do formato AAAA-MM-DD', () => {
    const recusadas = ['10/03/2026', '2026-3-10', '', 'ontem'].map(dataDeChamadaValida);

    expect(recusadas).toEqual([false, false, false, false]);
  });

  test('trata o intervalo do ano letivo como fechado nas duas pontas', () => {
    const inicio = dataDentroDoAnoLetivo('2026-02-01', '2026-02-01', '2026-12-15');
    const fim = dataDentroDoAnoLetivo('2026-12-15', '2026-02-01', '2026-12-15');
    const meio = dataDentroDoAnoLetivo('2026-07-04', '2026-02-01', '2026-12-15');

    expect([inicio, fim, meio]).toEqual([true, true, true]);
  });

  test('deixa de fora a data anterior ao início e a posterior ao fim', () => {
    const antes = dataDentroDoAnoLetivo('2026-01-31', '2026-02-01', '2026-12-15');
    const depois = dataDentroDoAnoLetivo('2026-12-16', '2026-02-01', '2026-12-15');

    expect([antes, depois]).toEqual([false, false]);
  });
});

describe('registrarChamada', () => {
  test('grava a chamada do dia inteiro da turma', async () => {
    const linhas = cenario.matriculas.map((matricula) => ({
      matriculaId: matricula.id,
      presente: true,
    }));

    const resultado = await avaliacao.registrarChamada({
      redeId: cenario.rede.id,
      turmaId: cenario.turmas[0].id,
      data: DIA_LETIVO,
      linhas,
    });

    expect(resultado).toEqual({ ok: true, valor: 5 });
    expect(await contarFrequencias(cenario.rede.id)).toBe(5);
  });

  test('a segunda chamada do mesmo dia atualiza a linha em vez de criar outra', async () => {
    const chamada = {
      redeId: cenario.rede.id,
      turmaId: cenario.turmas[0].id,
      data: DIA_LETIVO,
    };
    await avaliacao.registrarChamada({
      ...chamada,
      linhas: [{ matriculaId: cenario.matriculas[0].id, presente: true }],
    });

    const resultado = await avaliacao.registrarChamada({
      ...chamada,
      linhas: [
        { matriculaId: cenario.matriculas[0].id, presente: false, justificativa: 'Consulta médica' },
      ],
    });

    expect(resultado).toEqual({ ok: true, valor: 1 });
    expect(await contarFrequencias(cenario.rede.id)).toBe(1);
    const registrada = await avaliacao.chamadaDoDia(
      cenario.rede.id,
      cenario.turmas[0].id,
      DIA_LETIVO,
    );
    expect(registrada.get(cenario.matriculas[0].id)).toEqual({
      presente: false,
      justificativa: 'Consulta médica',
    });
  });

  test('a correção que devolve a presença ao aluno apaga a justificativa', async () => {
    const chamada = {
      redeId: cenario.rede.id,
      turmaId: cenario.turmas[0].id,
      data: DIA_LETIVO,
    };
    await avaliacao.registrarChamada({
      ...chamada,
      linhas: [
        { matriculaId: cenario.matriculas[0].id, presente: false, justificativa: 'Atestado' },
      ],
    });

    await avaliacao.registrarChamada({
      ...chamada,
      linhas: [{ matriculaId: cenario.matriculas[0].id, presente: true }],
    });

    const registrada = await avaliacao.chamadaDoDia(
      cenario.rede.id,
      cenario.turmas[0].id,
      DIA_LETIVO,
    );
    expect(registrada.get(cenario.matriculas[0].id)).toEqual({
      presente: true,
      justificativa: null,
    });
  });

  test('dias diferentes convivem como linhas separadas', async () => {
    const chamada = {
      redeId: cenario.rede.id,
      turmaId: cenario.turmas[0].id,
      linhas: [{ matriculaId: cenario.matriculas[0].id, presente: true }],
    };

    await avaliacao.registrarChamada({ ...chamada, data: DIA_LETIVO });
    await avaliacao.registrarChamada({ ...chamada, data: OUTRO_DIA_LETIVO });

    expect(await contarFrequencias(cenario.rede.id)).toBe(2);
  });

  test('recusa data anterior ao início do ano letivo', async () => {
    const resultado = await avaliacao.registrarChamada({
      redeId: cenario.rede.id,
      turmaId: cenario.turmas[0].id,
      data: `${ANO_PADRAO}-01-15`,
      linhas: [{ matriculaId: cenario.matriculas[0].id, presente: true }],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'data', codigo: 'data_fora_do_ano_letivo' })],
    });
    expect(await contarFrequencias(cenario.rede.id)).toBe(0);
  });

  test('recusa data posterior ao fim do ano letivo', async () => {
    const resultado = await avaliacao.registrarChamada({
      redeId: cenario.rede.id,
      turmaId: cenario.turmas[0].id,
      data: `${ANO_PADRAO}-12-20`,
      linhas: [{ matriculaId: cenario.matriculas[0].id, presente: true }],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'data', codigo: 'data_fora_do_ano_letivo' })],
    });
  });

  test('a recusa por data diz qual é o intervalo do ano letivo', async () => {
    const resultado = await avaliacao.registrarChamada({
      redeId: cenario.rede.id,
      turmaId: cenario.turmas[0].id,
      data: `${ANO_PADRAO}-01-15`,
      linhas: [{ matriculaId: cenario.matriculas[0].id, presente: true }],
    });

    const mensagem = resultado.ok ? '' : (resultado.erros[0]?.mensagem ?? '');
    expect(mensagem).toContain(cenario.anoLetivo.startDate);
    expect(mensagem).toContain(cenario.anoLetivo.endDate);
  });

  test('recusa data que não existe no calendário', async () => {
    const resultado = await avaliacao.registrarChamada({
      redeId: cenario.rede.id,
      turmaId: cenario.turmas[0].id,
      data: `${ANO_PADRAO}-02-30`,
      linhas: [{ matriculaId: cenario.matriculas[0].id, presente: true }],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [
        expect.objectContaining({
          campo: 'data',
          mensagem: 'Informe uma data válida no formato AAAA-MM-DD.',
        }),
      ],
    });
  });

  test('recusa data em formato diferente de AAAA-MM-DD', async () => {
    const resultado = await avaliacao.registrarChamada({
      redeId: cenario.rede.id,
      turmaId: cenario.turmas[0].id,
      data: '10/03/2026',
      linhas: [{ matriculaId: cenario.matriculas[0].id, presente: true }],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'data' })],
    });
  });

  test('recusa turma que não é desta rede', async () => {
    const outra = await cenarioCompleto();

    const resultado = await avaliacao.registrarChamada({
      redeId: cenario.rede.id,
      turmaId: outra.turmas[0].id,
      data: DIA_LETIVO,
      linhas: [{ matriculaId: cenario.matriculas[0].id, presente: true }],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'turmaId', codigo: 'nao_encontrada' })],
    });
  });

  test('recusa a chamada com matrícula de outra turma', async () => {
    const aluno = await criarAluno({ networkId: cenario.rede.id });
    const forasteira = await criarMatricula({
      networkId: cenario.rede.id,
      studentId: aluno.id,
      classGroupId: cenario.turmas[1].id,
      academicYearId: cenario.anoLetivo.id,
    });

    const resultado = await avaliacao.registrarChamada({
      redeId: cenario.rede.id,
      turmaId: cenario.turmas[0].id,
      data: DIA_LETIVO,
      linhas: [
        { matriculaId: cenario.matriculas[0].id, presente: true },
        { matriculaId: forasteira.id, presente: false },
      ],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'linhas', codigo: 'matricula_fora_da_turma' })],
    });
    expect(await contarFrequencias(cenario.rede.id)).toBe(0);
  });

  test('recusa a chamada com matrícula de outra rede', async () => {
    const deOutraRede = await matriculaDeOutraRede();

    const resultado = await avaliacao.registrarChamada({
      redeId: cenario.rede.id,
      turmaId: cenario.turmas[0].id,
      data: DIA_LETIVO,
      linhas: [
        { matriculaId: cenario.matriculas[0].id, presente: true },
        { matriculaId: deOutraRede, presente: true },
      ],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'linhas', codigo: 'matricula_fora_da_turma' })],
    });
    expect(await contarFrequencias(cenario.rede.id)).toBe(0);
  });

  test('recusa a chamada com o mesmo aluno duas vezes', async () => {
    const resultado = await avaliacao.registrarChamada({
      redeId: cenario.rede.id,
      turmaId: cenario.turmas[0].id,
      data: DIA_LETIVO,
      linhas: [
        { matriculaId: cenario.matriculas[0].id, presente: true },
        { matriculaId: cenario.matriculas[0].id, presente: false },
      ],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'linhas', codigo: 'matricula_repetida' })],
    });
  });

  test('recusa chamada sem linha nenhuma', async () => {
    const resultado = await avaliacao.registrarChamada({
      redeId: cenario.rede.id,
      turmaId: cenario.turmas[0].id,
      data: DIA_LETIVO,
      linhas: [],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ mensagem: 'Nenhuma linha de chamada foi enviada.' })],
    });
  });

  test('aceita justificativa com exatamente o limite em caracteres', async () => {
    const justificativa = 'x'.repeat(LIMITES_DA_AVALIACAO.caracteresDaJustificativa);

    const resultado = await avaliacao.registrarChamada({
      redeId: cenario.rede.id,
      turmaId: cenario.turmas[0].id,
      data: DIA_LETIVO,
      linhas: [{ matriculaId: cenario.matriculas[0].id, presente: false, justificativa }],
    });

    expect(resultado).toEqual({ ok: true, valor: 1 });
    const registrada = await avaliacao.chamadaDoDia(
      cenario.rede.id,
      cenario.turmas[0].id,
      DIA_LETIVO,
    );
    expect(registrada.get(cenario.matriculas[0].id)?.justificativa?.length).toBe(
      LIMITES_DA_AVALIACAO.caracteresDaJustificativa,
    );
  });

  test('recusa justificativa com um caractere além do limite', async () => {
    const resultado = await avaliacao.registrarChamada({
      redeId: cenario.rede.id,
      turmaId: cenario.turmas[0].id,
      data: DIA_LETIVO,
      linhas: [
        {
          matriculaId: cenario.matriculas[0].id,
          presente: false,
          justificativa: 'x'.repeat(LIMITES_DA_AVALIACAO.caracteresDaJustificativa + 1),
        },
      ],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ mensagem: 'A justificativa é longa demais.' })],
    });
    expect(await contarFrequencias(cenario.rede.id)).toBe(0);
  });
});

describe('constraint frequencia_unica_por_dia', () => {
  test('o banco barra a segunda linha do mesmo aluno no mesmo dia', async () => {
    const sql = sqlDeTeste();
    const inserir = async (): Promise<void> => {
      await sql`
        INSERT INTO attendance (id, network_id, enrollment_id, attendance_date, present)
        VALUES (${crypto.randomUUID()}, ${cenario.rede.id}, ${cenario.matriculas[0].id},
                ${DIA_LETIVO}, true)`;
    };
    await inserir();

    await expect(inserir()).rejects.toThrow(/attendance_unique_per_day/);

    expect(await contarFrequencias(cenario.rede.id)).toBe(1);
  });
});
