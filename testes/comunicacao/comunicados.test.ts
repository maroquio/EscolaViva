/*
 * Comunicado, mural e taxa de leitura contra o banco real.
 *
 * Duas coisas concentram o valor deste arquivo: a lista vazia de destinatários, que significa "a
 * unidade inteira" e não pode alcançar ninguém de fora dela; e o `lido_em`, que é a instrumentação
 * da dor do Estágio 04 — ele precisa ser idempotente, senão a taxa medida vira ruído.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { comunicacao, type Comunicado } from '../../src/communication';
import { limparBanco, sqlDeTeste } from '../apoio/banco';
import {
  cenarioCompleto,
  criarAluno,
  criarComunicado,
  criarMatricula,
  criarResponsavel,
  criarTurma,
  vincularAlunoResponsavel,
  type Cenario,
} from '../apoio/fabricas';

const INSTANTE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const LEITURA_ANTIGA = new Date('2026-01-05T08:30:00.000Z');

let cenario: Cenario;

beforeEach(async () => {
  await limparBanco();
  cenario = await cenarioCompleto();
});

/** Publica e estreita o `Result`: quando isto falha, o erro do arranjo aparece por inteiro. */
async function publicar(entrada: {
  unidadeId?: string;
  titulo?: string;
  corpo?: string;
  destinatarios?: { responsavelId: string }[];
}): Promise<Comunicado> {
  const resultado = await comunicacao.publicarComunicado({
    redeId: cenario.rede.id,
    unidadeId: entrada.unidadeId ?? cenario.unidades[0].id,
    titulo: entrada.titulo ?? 'Reunião de pais',
    corpo: entrada.corpo ?? 'A reunião começa às 19h no auditório.',
    autorUsuarioId: cenario.secretaria.id,
    destinatarios: entrada.destinatarios ?? [],
  });
  if (!resultado.ok) {
    throw new Error(`publicação recusada no arranjo: ${JSON.stringify(resultado.erros)}`);
  }
  return resultado.valor;
}

async function destinatariosDe(comunicadoId: string): Promise<string[]> {
  const linhas = await sqlDeTeste()<{ guardian_id: string }[]>`
    SELECT guardian_id FROM announcement_recipient
     WHERE announcement_id = ${comunicadoId}`;
  return linhas.map((linha) => linha.guardian_id).sort();
}

async function leiturasDe(comunicadoId: string, responsavelId: string): Promise<(Date | null)[]> {
  const linhas = await sqlDeTeste()<{ read_at: Date | null }[]>`
    SELECT read_at FROM announcement_recipient
     WHERE announcement_id = ${comunicadoId} AND guardian_id = ${responsavelId}`;
  return linhas.map((linha) => linha.read_at);
}

/** Um responsável com aluno matriculado ativo na unidade indicada. */
async function responsavelNaUnidade(unidadeId: string): Promise<string> {
  const turma = await criarTurma({
    networkId: cenario.rede.id,
    schoolId: unidadeId,
    academicYearId: cenario.anoLetivo.id,
  });
  const aluno = await criarAluno({ networkId: cenario.rede.id });
  const responsavel = await criarResponsavel({ networkId: cenario.rede.id });
  await vincularAlunoResponsavel({
    networkId: cenario.rede.id,
    studentId: aluno.id,
    guardianId: responsavel.id,
  });
  await criarMatricula({
    networkId: cenario.rede.id,
    studentId: aluno.id,
    classGroupId: turma.id,
    academicYearId: cenario.anoLetivo.id,
  });
  return responsavel.id;
}

describe('publicarComunicado', () => {
  test('publica com o nome do autor e a data de publicação preenchida', async () => {
    const comunicado = await publicar({
      destinatarios: [{ responsavelId: cenario.responsaveis[0].id }],
    });

    expect(comunicado.titulo).toBe('Reunião de pais');
    expect(comunicado.corpo).toBe('A reunião começa às 19h no auditório.');
    expect(comunicado.autorNome).toBe(cenario.secretaria.name);
    expect(comunicado.unidadeId).toBe(cenario.unidades[0].id);
    expect(comunicado.publicadoEm).toMatch(INSTANTE_ISO);
  });

  test('grava um destinatário para cada responsável da lista', async () => {
    const escolhidos = [cenario.responsaveis[0].id, cenario.responsaveis[2].id];

    const comunicado = await publicar({
      destinatarios: escolhidos.map((responsavelId) => ({ responsavelId })),
    });

    expect(await destinatariosDe(comunicado.id)).toEqual([...escolhidos].sort());
  });

  test('o mesmo responsável repetido na lista vira um destinatário só', async () => {
    const comunicado = await publicar({
      destinatarios: [
        { responsavelId: cenario.responsaveis[0].id },
        { responsavelId: cenario.responsaveis[0].id },
      ],
    });

    expect(await destinatariosDe(comunicado.id)).toEqual([cenario.responsaveis[0].id]);
  });

  test('a lista vazia alcança todo responsável com aluno matriculado ativo na unidade', async () => {
    const comunicado = await publicar({ destinatarios: [] });

    expect(await destinatariosDe(comunicado.id)).toEqual(
      cenario.responsaveis.map((responsavel) => responsavel.id).sort(),
    );
  });

  test('a lista vazia não alcança responsável de outra unidade da mesma rede', async () => {
    const deOutraUnidade = await responsavelNaUnidade(cenario.unidades[1].id);

    const comunicado = await publicar({ destinatarios: [] });

    expect(await destinatariosDe(comunicado.id)).not.toContain(deOutraUnidade);
  });

  test('a lista vazia não alcança responsável de outra rede', async () => {
    const outra = await cenarioCompleto();

    const comunicado = await publicar({ destinatarios: [] });

    const alcancados = await destinatariosDe(comunicado.id);
    for (const responsavel of outra.responsaveis) {
      expect(alcancados).not.toContain(responsavel.id);
    }
  });

  test('a lista vazia ignora responsável cujo aluno não tem matrícula ativa', async () => {
    const desligado = await responsavelNaUnidade(cenario.unidades[0].id);
    await sqlDeTeste()`
      UPDATE enrollment SET status = 'cancelled'
       WHERE student_id IN (SELECT student_id FROM student_guardian WHERE guardian_id = ${desligado})`;

    const comunicado = await publicar({ destinatarios: [] });

    expect(await destinatariosDe(comunicado.id)).not.toContain(desligado);
  });

  test('recusa quando não há responsável nenhum para receber', async () => {
    const resultado = await comunicacao.publicarComunicado({
      redeId: cenario.rede.id,
      unidadeId: cenario.unidades[1].id,
      titulo: 'Aviso',
      corpo: 'Corpo do aviso.',
      autorUsuarioId: cenario.secretaria.id,
      destinatarios: [],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'destinatarios', codigo: 'sem_destinatarios' })],
    });
  });

  test('recusa título vazio e título longo demais', async () => {
    const vazio = comunicacao.publicarComunicado({
      redeId: cenario.rede.id,
      unidadeId: cenario.unidades[0].id,
      titulo: '   ',
      corpo: 'Corpo do aviso.',
      autorUsuarioId: cenario.secretaria.id,
      destinatarios: [{ responsavelId: cenario.responsaveis[0].id }],
    });
    const longo = comunicacao.publicarComunicado({
      redeId: cenario.rede.id,
      unidadeId: cenario.unidades[0].id,
      titulo: 't'.repeat(161),
      corpo: 'Corpo do aviso.',
      autorUsuarioId: cenario.secretaria.id,
      destinatarios: [{ responsavelId: cenario.responsaveis[0].id }],
    });

    const [semTitulo, tituloLongo] = await Promise.all([vazio, longo]);

    expect(semTitulo).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'titulo', codigo: 'titulo_invalido' })],
    });
    expect(tituloLongo).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'titulo', codigo: 'titulo_invalido' })],
    });
  });

  test('recusa corpo vazio', async () => {
    const resultado = await comunicacao.publicarComunicado({
      redeId: cenario.rede.id,
      unidadeId: cenario.unidades[0].id,
      titulo: 'Aviso',
      corpo: '  ',
      autorUsuarioId: cenario.secretaria.id,
      destinatarios: [{ responsavelId: cenario.responsaveis[0].id }],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'corpo', codigo: 'corpo_invalido' })],
    });
  });

  test('recusa unidade que não é desta rede', async () => {
    const outra = await cenarioCompleto();

    const resultado = await comunicacao.publicarComunicado({
      redeId: cenario.rede.id,
      unidadeId: outra.unidades[0].id,
      titulo: 'Aviso',
      corpo: 'Corpo do aviso.',
      autorUsuarioId: cenario.secretaria.id,
      destinatarios: [{ responsavelId: cenario.responsaveis[0].id }],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'unidadeId', codigo: 'unidade_desconhecida' })],
    });
  });

  test('recusa autor que não é desta rede', async () => {
    const outra = await cenarioCompleto();

    const resultado = await comunicacao.publicarComunicado({
      redeId: cenario.rede.id,
      unidadeId: cenario.unidades[0].id,
      titulo: 'Aviso',
      corpo: 'Corpo do aviso.',
      autorUsuarioId: outra.secretaria.id,
      destinatarios: [{ responsavelId: cenario.responsaveis[0].id }],
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'autorUsuarioId', codigo: 'autor_desconhecido' })],
    });
  });
});

describe('marcarComoLido', () => {
  test('registra a leitura do destinatário', async () => {
    const comunicado = await publicar({
      destinatarios: [{ responsavelId: cenario.responsaveis[0].id }],
    });

    const resultado = await comunicacao.marcarComoLido({
      redeId: cenario.rede.id,
      comunicadoId: comunicado.id,
      responsavelId: cenario.responsaveis[0].id,
    });

    expect(resultado).toEqual({ ok: true, valor: undefined });
    expect(await leiturasDe(comunicado.id, cenario.responsaveis[0].id)).not.toEqual([null]);
  });

  test('a segunda chamada não desloca a data da primeira leitura', async () => {
    const comunicado = await criarComunicado({
      networkId: cenario.rede.id,
      schoolId: cenario.unidades[0].id,
      authorUserId: cenario.secretaria.id,
      destinatarios: [{ guardianId: cenario.responsaveis[0].id, readAt: LEITURA_ANTIGA }],
    });

    await comunicacao.marcarComoLido({
      redeId: cenario.rede.id,
      comunicadoId: comunicado.id,
      responsavelId: cenario.responsaveis[0].id,
    });

    expect(await leiturasDe(comunicado.id, cenario.responsaveis[0].id)).toEqual([LEITURA_ANTIGA]);
  });

  test('não cria leitura para quem não é destinatário', async () => {
    const comunicado = await publicar({
      destinatarios: [{ responsavelId: cenario.responsaveis[0].id }],
    });

    const resultado = await comunicacao.marcarComoLido({
      redeId: cenario.rede.id,
      comunicadoId: comunicado.id,
      responsavelId: cenario.responsaveis[1].id,
    });

    expect(resultado).toEqual({ ok: true, valor: undefined });
    expect(await leiturasDe(comunicado.id, cenario.responsaveis[1].id)).toEqual([]);
  });

  test('não marca a leitura a partir de outra rede', async () => {
    const comunicado = await publicar({
      destinatarios: [{ responsavelId: cenario.responsaveis[0].id }],
    });

    await comunicacao.marcarComoLido({
      redeId: crypto.randomUUID(),
      comunicadoId: comunicado.id,
      responsavelId: cenario.responsaveis[0].id,
    });

    expect(await leiturasDe(comunicado.id, cenario.responsaveis[0].id)).toEqual([null]);
  });

  test('recusa identificador que não é uuid', async () => {
    const resultado = await comunicacao.marcarComoLido({
      redeId: cenario.rede.id,
      comunicadoId: 'nao-e-uuid',
      responsavelId: cenario.responsaveis[0].id,
    });

    expect(resultado).toEqual({
      ok: false,
      erros: [expect.objectContaining({ campo: 'comunicadoId' })],
    });
  });
});

describe('muralDoResponsavel', () => {
  test('traz os comunicados do responsável do mais recente para o mais antigo', async () => {
    const base = {
      networkId: cenario.rede.id,
      schoolId: cenario.unidades[0].id,
      authorUserId: cenario.secretaria.id,
      destinatarios: [{ guardianId: cenario.responsaveis[0].id }],
    };
    const antigo = await criarComunicado({
      ...base,
      title: 'Aviso de março',
      publishedAt: new Date('2026-03-01T12:00:00.000Z'),
    });
    const recente = await criarComunicado({
      ...base,
      title: 'Aviso de maio',
      publishedAt: new Date('2026-05-01T12:00:00.000Z'),
    });

    const mural = await comunicacao.muralDoResponsavel(
      cenario.rede.id,
      cenario.responsaveis[0].id,
    );

    expect(mural).toEqual([
      {
        comunicadoId: recente.id,
        titulo: 'Aviso de maio',
        publicadoEm: '2026-05-01T12:00:00.000Z',
        lidoEm: null,
      },
      {
        comunicadoId: antigo.id,
        titulo: 'Aviso de março',
        publicadoEm: '2026-03-01T12:00:00.000Z',
        lidoEm: null,
      },
    ]);
  });

  test('não traz comunicado de que o responsável não é destinatário', async () => {
    await publicar({ destinatarios: [{ responsavelId: cenario.responsaveis[0].id }] });

    const mural = await comunicacao.muralDoResponsavel(
      cenario.rede.id,
      cenario.responsaveis[1].id,
    );

    expect(mural).toEqual([]);
  });

  test('não traz comunicado que ainda não foi publicado', async () => {
    await criarComunicado({
      networkId: cenario.rede.id,
      schoolId: cenario.unidades[0].id,
      authorUserId: cenario.secretaria.id,
      publishedAt: null,
      destinatarios: [{ guardianId: cenario.responsaveis[0].id }],
    });

    const mural = await comunicacao.muralDoResponsavel(
      cenario.rede.id,
      cenario.responsaveis[0].id,
    );

    expect(mural).toEqual([]);
  });

  test('mostra a data de leitura de quem já leu', async () => {
    await criarComunicado({
      networkId: cenario.rede.id,
      schoolId: cenario.unidades[0].id,
      authorUserId: cenario.secretaria.id,
      publishedAt: new Date('2026-03-01T12:00:00.000Z'),
      destinatarios: [{ guardianId: cenario.responsaveis[0].id, readAt: LEITURA_ANTIGA }],
    });

    const mural = await comunicacao.muralDoResponsavel(
      cenario.rede.id,
      cenario.responsaveis[0].id,
    );

    expect(mural[0]?.lidoEm).toBe(LEITURA_ANTIGA.toISOString());
  });

  test('não traz comunicado de outra rede', async () => {
    const outra = await cenarioCompleto();
    await criarComunicado({
      networkId: outra.rede.id,
      schoolId: outra.unidades[0].id,
      authorUserId: outra.secretaria.id,
      destinatarios: [{ guardianId: outra.responsaveis[0].id }],
    });

    const mural = await comunicacao.muralDoResponsavel(
      cenario.rede.id,
      outra.responsaveis[0].id,
    );

    expect(mural).toEqual([]);
  });
});

describe('comunicadoParaResponsavel', () => {
  test('devolve o comunicado inteiro para quem é destinatário', async () => {
    const publicado = await publicar({
      destinatarios: [{ responsavelId: cenario.responsaveis[0].id }],
    });

    const comunicado = await comunicacao.comunicadoParaResponsavel(
      cenario.rede.id,
      cenario.responsaveis[0].id,
      publicado.id,
    );

    expect(comunicado).toEqual(publicado);
  });

  test('devolve null para quem não é destinatário', async () => {
    const publicado = await publicar({
      destinatarios: [{ responsavelId: cenario.responsaveis[0].id }],
    });

    const comunicado = await comunicacao.comunicadoParaResponsavel(
      cenario.rede.id,
      cenario.responsaveis[1].id,
      publicado.id,
    );

    expect(comunicado).toBeNull();
  });

  test('devolve null para comunicado que ainda não foi publicado', async () => {
    const rascunho = await criarComunicado({
      networkId: cenario.rede.id,
      schoolId: cenario.unidades[0].id,
      authorUserId: cenario.secretaria.id,
      publishedAt: null,
      destinatarios: [{ guardianId: cenario.responsaveis[0].id }],
    });

    const comunicado = await comunicacao.comunicadoParaResponsavel(
      cenario.rede.id,
      cenario.responsaveis[0].id,
      rascunho.id,
    );

    expect(comunicado).toBeNull();
  });

  test('devolve null quando o comunicado é de outra rede', async () => {
    const publicado = await publicar({
      destinatarios: [{ responsavelId: cenario.responsaveis[0].id }],
    });

    const comunicado = await comunicacao.comunicadoParaResponsavel(
      crypto.randomUUID(),
      cenario.responsaveis[0].id,
      publicado.id,
    );

    expect(comunicado).toBeNull();
  });
});

describe('listarComunicados', () => {
  test('três leituras entre dez destinatários dão taxa de 0,3', async () => {
    const dez = await Promise.all(
      Array.from({ length: 10 }, () => criarResponsavel({ networkId: cenario.rede.id })),
    );
    const comunicado = await publicar({
      destinatarios: dez.map((responsavel) => ({ responsavelId: responsavel.id })),
    });
    for (const responsavel of dez.slice(0, 3)) {
      await comunicacao.marcarComoLido({
        redeId: cenario.rede.id,
        comunicadoId: comunicado.id,
        responsavelId: responsavel.id,
      });
    }

    const estatisticas = await comunicacao.listarComunicados(cenario.rede.id);

    expect(estatisticas).toEqual([
      {
        comunicadoId: comunicado.id,
        titulo: 'Reunião de pais',
        publicadoEm: expect.stringMatching(INSTANTE_ISO),
        destinatarios: 10,
        leituras: 3,
        taxa: 0.3,
      },
    ]);
  });

  test('uma única chamada devolve todos os comunicados da rede com a taxa de cada um', async () => {
    const quantidades = [0, 1, 2, 3, 4, 5];
    const esperados = [];
    for (const lidos of quantidades) {
      const comunicado = await criarComunicado({
        networkId: cenario.rede.id,
        schoolId: cenario.unidades[0].id,
        authorUserId: cenario.secretaria.id,
        publishedAt: new Date(`2026-03-0${lidos + 1}T12:00:00.000Z`),
        destinatarios: cenario.responsaveis.map((responsavel, posicao) => ({
          guardianId: responsavel.id,
          readAt: posicao < lidos ? LEITURA_ANTIGA : null,
        })),
      });
      esperados.push({ comunicadoId: comunicado.id, leituras: lidos, taxa: lidos / 5 });
    }

    const estatisticas = await comunicacao.listarComunicados(cenario.rede.id);

    expect(estatisticas).toHaveLength(6);
    expect(
      estatisticas.map((linha) => ({
        comunicadoId: linha.comunicadoId,
        leituras: linha.leituras,
        taxa: linha.taxa,
      })),
    ).toEqual([...esperados].reverse());
    expect(estatisticas.every((linha) => linha.destinatarios === 5)).toBe(true);
  });

  test('o comunicado sem destinatário aparece com taxa 0', async () => {
    const semNinguem = await criarComunicado({
      networkId: cenario.rede.id,
      schoolId: cenario.unidades[0].id,
      authorUserId: cenario.secretaria.id,
    });

    const estatisticas = await comunicacao.listarComunicados(cenario.rede.id);

    expect(estatisticas).toEqual([
      expect.objectContaining({
        comunicadoId: semNinguem.id,
        destinatarios: 0,
        leituras: 0,
        taxa: 0,
      }),
    ]);
  });

  test('filtra por unidade quando a unidade é informada', async () => {
    const daPrimeira = await publicar({
      unidadeId: cenario.unidades[0].id,
      destinatarios: [{ responsavelId: cenario.responsaveis[0].id }],
    });
    await publicar({
      unidadeId: cenario.unidades[1].id,
      destinatarios: [{ responsavelId: cenario.responsaveis[1].id }],
    });

    const estatisticas = await comunicacao.listarComunicados(
      cenario.rede.id,
      cenario.unidades[0].id,
    );

    expect(estatisticas.map((linha) => linha.comunicadoId)).toEqual([daPrimeira.id]);
  });

  test('sem filtro traz as duas unidades da rede e nenhuma de outra', async () => {
    await publicar({
      unidadeId: cenario.unidades[0].id,
      destinatarios: [{ responsavelId: cenario.responsaveis[0].id }],
    });
    await publicar({
      unidadeId: cenario.unidades[1].id,
      destinatarios: [{ responsavelId: cenario.responsaveis[1].id }],
    });
    const outra = await cenarioCompleto();
    await criarComunicado({
      networkId: outra.rede.id,
      schoolId: outra.unidades[0].id,
      authorUserId: outra.secretaria.id,
    });

    const estatisticas = await comunicacao.listarComunicados(cenario.rede.id);

    expect(estatisticas).toHaveLength(2);
  });

  test('o comunicado ainda não publicado fica no fim da lista', async () => {
    const rascunho = await criarComunicado({
      networkId: cenario.rede.id,
      schoolId: cenario.unidades[0].id,
      authorUserId: cenario.secretaria.id,
      publishedAt: null,
    });
    const publicado = await publicar({
      destinatarios: [{ responsavelId: cenario.responsaveis[0].id }],
    });

    const estatisticas = await comunicacao.listarComunicados(cenario.rede.id);

    expect(estatisticas.map((linha) => linha.comunicadoId)).toEqual([publicado.id, rascunho.id]);
    expect(estatisticas[1]?.publicadoEm).toBeNull();
  });
});
