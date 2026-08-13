/**
 * Rotas do professor — o diário de classe.
 *
 * As quatro telas do papel começam pela mesma consulta: `turmaDisciplinasDoProfessor` devolve o que
 * este usuário leciona nesta rede, e é essa lista que autoriza. Turma ou disciplina de outro
 * professor não responde 403, responde 404 — o que não é dele não existe para ele, e a diferença
 * entre "não existe" e "existe e você não pode" é informação que ninguém precisa dar.
 *
 * Os campos do formulário são nomeados pelo id da matrícula (`nota_<uuid>`), nunca por posição:
 * `c.req.parseBody()` guarda um valor por nome, então nome repetido perderia linhas em silêncio. A
 * leitura percorre a lista de matrículas ativas vinda do banco — o formulário informa valores, e
 * nunca quem está na turma.
 *
 * A tela de notas é a rota de referência de desempenho do estágio (p95 < 300 ms): uma consulta de
 * matrículas, uma de notas e uma de fechamento, disparadas juntas. Nenhuma consulta por aluno.
 */

import { Hono, type Context } from 'hono';
import { academico } from '../../academico';
import { avaliacao } from '../../avaliacao';
import {
  NaoEncontrado,
  RegraDeNegocio,
  exigirPapel,
  redeAtual,
  usuarioAtual,
  type CorpoDeFormulario,
  type Variaveis,
} from '../../shared/http';
import { clockDoSistema } from '../../shared/ports';
import type { ErroDeAplicacao } from '../../shared/resultado';
import { formatarData, renderizar, type DadosDeTemplate } from '../render';

type ContextoWeb = Context<{ Variables: Variaveis }>;

/** O que `academico` devolve para o professor: a disciplina alocada com a turma junto. */
type Alocacao = Awaited<ReturnType<typeof academico.turmaDisciplinasDoProfessor>>[number];

type TurmaDoProfessor = {
  turmaId: string;
  turmaNome: string;
  serie: string;
  turno: string;
  disciplinas: { id: string; disciplinaNome: string }[];
};

/** O que o professor digitou e o que foi recusado, para a tela voltar como ele a deixou. */
type LancamentoRecusado = {
  valores: Map<string, string>;
  porMatricula: Map<string, string>;
  problemas: readonly ErroDeAplicacao[];
};

type ChamadaRecusada = {
  informadas: Map<string, { presente: boolean; justificativa: string }>;
  problemas: readonly ErroDeAplicacao[];
};

const RAIZ = '/professor';
const TELA_DE_PAINEL = '/professor/painel';
const TELA_DE_NOTAS = '/professor/notas';
const TELA_DE_CHAMADA = '/professor/chamada';
const TELA_DE_FECHAMENTO = '/professor/fechamento';

// Os nomes de campo são compartilhados com o template para que rota e tela não possam divergir.
const PREFIXO_NOTA = 'nota_';
const PREFIXO_PRESENCA = 'presenca_';
const PREFIXO_JUSTIFICATIVA = 'justificativa_';
const CAMPO_BIMESTRE = 'bimestre';
const CAMPO_DATA = 'data';

const BIMESTRES: readonly number[] = [1, 2, 3, 4];
const BIMESTRE_PADRAO = 1;
const NOTA_MINIMA = 0;
const NOTA_MAXIMA = 10;
/** Espelha o limite que `avaliacao` valida: o navegador avisa antes, o domínio decide depois. */
const LIMITE_DA_JUSTIFICATIVA = 500;

/** Curto: mora dentro da célula. A explicação inteira está no resumo do topo e no rodapé. */
const NOTA_INVALIDA = `Use um número de ${NOTA_MINIMA} a ${NOTA_MAXIMA}.`;

const RESUMO_DE_NOTAS_INVALIDAS: ErroDeAplicacao = {
  campo: 'notas',
  codigo: 'nota_invalida',
  mensagem: `Confira os campos destacados: há nota fora do intervalo de ${NOTA_MINIMA} a ${NOTA_MAXIMA}.`,
};

const caminhoDeNotas = (turmaDisciplinaId: string): string =>
  `${RAIZ}/disciplinas/${turmaDisciplinaId}/notas`;
const caminhoDeChamada = (turmaId: string): string => `${RAIZ}/turmas/${turmaId}/chamada`;
const caminhoDeFechamento = (turmaId: string): string => `${RAIZ}/turmas/${turmaId}/fechamento`;

const comParametros = (caminho: string, parametros: Record<string, string>): string =>
  `${caminho}?${new URLSearchParams(parametros).toString()}`;

/* --- Leitura do formulário e de datas --------------------------------------- */

const campo = (corpo: CorpoDeFormulario, nome: string): string => {
  const valor = corpo[nome];
  return typeof valor === 'string' ? valor.trim() : '';
};

/** Caixa desmarcada não é enviada pelo navegador: a ausência do nome é a própria falta. */
const marcado = (corpo: CorpoDeFormulario, nome: string): boolean => corpo[nome] !== undefined;

/** Campo de texto vazio é ausência de informação, e ausência no banco se escreve `null`. */
const ouNulo = (texto: string): string | null => (texto === '' ? null : texto);

const bimestreOuNulo = (bruto: string | undefined): number | null => {
  const numero = Number(bruto);
  return BIMESTRES.includes(numero) ? numero : null;
};

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const TAMANHO_DA_DATA = 10;
const MS_POR_DIA = 86_400_000;
/** Longe da meia-noite: somar um dia nunca tropeça em fuso nem em horário de verão. */
const MEIO_DIA_UTC = 'T12:00:00Z';

const doisDigitos = (valor: number): string => String(valor).padStart(2, '0');

/** "Hoje" é o dia do relógio local da escola, não o dia UTC. */
const hoje = (): string => {
  const d = clockDoSistema.agora();
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
};

const dataOuNula = (bruto: string | undefined): string | null => {
  if (bruto === undefined || !FORMATO_DATA.test(bruto)) return null;
  // O formato sozinho aceita 2026-02-30: converter e comparar a volta separa data de sequência.
  const convertida = new Date(`${bruto}${MEIO_DIA_UTC}`);
  if (Number.isNaN(convertida.getTime())) return null;
  return convertida.toISOString().slice(0, TAMANHO_DA_DATA) === bruto ? bruto : null;
};

const deslocarDia = (data: string, dias: number): string => {
  const base = new Date(`${data}${MEIO_DIA_UTC}`).getTime();
  return new Date(base + dias * MS_POR_DIA).toISOString().slice(0, TAMANHO_DA_DATA);
};

/* --- Autorização: o professor só enxerga o que leciona ---------------------- */

const alocacoesDoProfessor = (c: ContextoWeb): Promise<Alocacao[]> =>
  academico.turmaDisciplinasDoProfessor(redeAtual(c), usuarioAtual(c).id);

/**
 * A alocação é (turma, disciplina), mas quem trabalha pensa por turma. As linhas já vêm ordenadas
 * por série, turma e disciplina, então agrupar é percorrer uma vez.
 */
function agruparPorTurma(alocacoes: readonly Alocacao[]): TurmaDoProfessor[] {
  const turmas = new Map<string, TurmaDoProfessor>();
  for (const { id, disciplinaNome, turmaId, turmaNome, serie, turno } of alocacoes) {
    const anteriores = turmas.get(turmaId)?.disciplinas ?? [];
    const disciplinas = [...anteriores, { id, disciplinaNome }];
    turmas.set(turmaId, { turmaId, turmaNome, serie, turno, disciplinas });
  }
  return [...turmas.values()];
}

/** Todo endereço da área do professor nasce aqui: nenhum template monta caminho por conta. */
const comLinks = (turma: TurmaDoProfessor) => ({
  ...turma,
  hrefChamada: caminhoDeChamada(turma.turmaId),
  hrefFechamento: caminhoDeFechamento(turma.turmaId),
  disciplinas: turma.disciplinas.map((d) => ({ ...d, hrefNotas: caminhoDeNotas(d.id) })),
});

function alocacaoOu404(alocacoes: readonly Alocacao[], turmaDisciplinaId: string): Alocacao {
  const alocacao = alocacoes.find((candidata) => candidata.id === turmaDisciplinaId);
  if (alocacao === undefined) throw new NaoEncontrado('disciplina fora do quadro do professor');
  return alocacao;
}

function turmaOu404(alocacoes: readonly Alocacao[], turmaId: string): TurmaDoProfessor {
  const turma = agruparPorTurma(alocacoes).find((candidata) => candidata.turmaId === turmaId);
  if (turma === undefined) throw new NaoEncontrado('turma fora do quadro do professor');
  return turma;
}

/* --- Montagem das telas ----------------------------------------------------- */

/** Campo em branco apaga a nota; vírgula e ponto são o mesmo separador para quem digita. */
const comoNota = (digitado: string): number | null | undefined => {
  if (digitado === '') return null;
  const numero = Number(digitado.replace(',', '.'));
  if (!Number.isFinite(numero) || numero < NOTA_MINIMA || numero > NOTA_MAXIMA) return undefined;
  return numero;
};

function lerNotas(corpo: CorpoDeFormulario, matriculas: readonly { id: string }[]) {
  const valores = new Map<string, string>();
  const porMatricula = new Map<string, string>();
  const notas = matriculas.map((matricula) => {
    const digitado = campo(corpo, `${PREFIXO_NOTA}${matricula.id}`);
    valores.set(matricula.id, digitado);
    const valor = comoNota(digitado);
    if (valor === undefined) porMatricula.set(matricula.id, NOTA_INVALIDA);
    return { matriculaId: matricula.id, valor: valor ?? null };
  });
  return { valores, porMatricula, notas };
}

async function telaDeNotas(
  c: ContextoWeb,
  alocacao: Alocacao,
  bimestre: number,
  recusado: LancamentoRecusado | null,
): Promise<DadosDeTemplate> {
  const redeId = redeAtual(c);
  // Três consultas, uma vez cada, em paralelo: é o que sustenta o p95 desta rota.
  const [matriculas, notas, estados] = await Promise.all([
    academico.matriculasAtivasDaTurma(redeId, alocacao.turmaId),
    avaliacao.notasDaTurmaDisciplina(redeId, alocacao.id, bimestre),
    avaliacao.estadoDeFechamento(redeId, alocacao.turmaId),
  ]);

  return {
    titulo: `${alocacao.disciplinaNome} · ${alocacao.turmaNome}`,
    alocacao,
    bimestre,
    bimestres: BIMESTRES,
    fechado: estados.some((estado) => estado.bimestre === bimestre && estado.fechado),
    acaoDoFormulario: caminhoDeNotas(alocacao.id),
    hrefChamada: caminhoDeChamada(alocacao.turmaId),
    hrefFechamento: caminhoDeFechamento(alocacao.turmaId),
    campoBimestre: CAMPO_BIMESTRE,
    prefixoNota: PREFIXO_NOTA,
    notaMinima: NOTA_MINIMA,
    notaMaxima: NOTA_MAXIMA,
    // O digitado tem precedência sobre o gravado: a tela recusada volta como o professor a deixou.
    linhas: matriculas.map((matricula) => ({
      matriculaId: matricula.id,
      alunoNome: matricula.alunoNome,
      valor: recusado?.valores.get(matricula.id) ?? String(notas.get(matricula.id) ?? ''),
      erro: recusado?.porMatricula.get(matricula.id) ?? null,
    })),
    erros: recusado?.problemas ?? [],
  };
}

const mensagemDeNotas = (gravadas: number): string => {
  if (gravadas === 0) return 'Lançamento salvo: nenhuma nota preenchida.';
  return gravadas === 1 ? '1 nota gravada.' : `${gravadas} notas gravadas.`;
};

async function telaDeChamada(
  c: ContextoWeb,
  turma: TurmaDoProfessor,
  data: string,
  recusada: ChamadaRecusada | null,
): Promise<DadosDeTemplate> {
  const redeId = redeAtual(c);
  const [matriculas, registradas] = await Promise.all([
    academico.matriculasAtivasDaTurma(redeId, turma.turmaId),
    avaliacao.chamadaDoDia(redeId, turma.turmaId, data),
  ]);

  return {
    titulo: `Chamada · ${turma.turmaNome}`,
    turma: comLinks(turma),
    data,
    diaAnterior: deslocarDia(data, -1),
    diaSeguinte: deslocarDia(data, 1),
    acaoDoFormulario: caminhoDeChamada(turma.turmaId),
    campoData: CAMPO_DATA,
    prefixoPresenca: PREFIXO_PRESENCA,
    prefixoJustificativa: PREFIXO_JUSTIFICATIVA,
    limiteDaJustificativa: LIMITE_DA_JUSTIFICATIVA,
    // Sem registro no dia, a tela abre com todo mundo presente: a falta é que é a exceção.
    linhas: matriculas.map(({ id, alunoNome }) => {
      const informada = recusada?.informadas.get(id);
      const registrada = registradas.get(id);
      return {
        matriculaId: id,
        alunoNome,
        presente: informada?.presente ?? registrada?.presente ?? true,
        justificativa: informada?.justificativa ?? registrada?.justificativa ?? '',
      };
    }),
    erros: recusada?.problemas ?? [],
  };
}

const telaDeFechamento = (
  turma: TurmaDoProfessor,
  estados: readonly { bimestre: number; fechado: boolean; fechadoEm: string | null }[],
  problemas: readonly ErroDeAplicacao[],
  bimestreRecusado: number | null,
): DadosDeTemplate => ({
  titulo: `Fechamento · ${turma.turmaNome}`,
  turma: comLinks(turma),
  estados,
  acaoDoFormulario: caminhoDeFechamento(turma.turmaId),
  campoBimestre: CAMPO_BIMESTRE,
  bimestreRecusado,
  erros: problemas,
});

/* --- Rotas ------------------------------------------------------------------ */

export const rotasProfessor = new Hono<{ Variables: Variaveis }>();

rotasProfessor.use('*', exigirPapel('professor'));

rotasProfessor.get('/', async (c) => {
  const turmas = agruparPorTurma(await alocacoesDoProfessor(c)).map(comLinks);
  return renderizar(c, TELA_DE_PAINEL, { titulo: 'Minhas turmas', turmas });
});

rotasProfessor.get('/disciplinas/:turmaDisciplinaId/notas', async (c) => {
  const alocacao = alocacaoOu404(await alocacoesDoProfessor(c), c.req.param('turmaDisciplinaId'));
  // Bimestre digitado à mão na URL cai no primeiro em vez de virar erro: é navegação, não escrita.
  const bimestre = bimestreOuNulo(c.req.query(CAMPO_BIMESTRE)) ?? BIMESTRE_PADRAO;
  return renderizar(c, TELA_DE_NOTAS, await telaDeNotas(c, alocacao, bimestre, null));
});

rotasProfessor.post('/disciplinas/:turmaDisciplinaId/notas', async (c) => {
  const alocacao = alocacaoOu404(await alocacoesDoProfessor(c), c.req.param('turmaDisciplinaId'));
  const corpo = c.get('corpo');
  const bimestre = bimestreOuNulo(campo(corpo, CAMPO_BIMESTRE));
  // No POST o bimestre veio de um campo oculto que esta aplicação escreveu: valor fora do conjunto
  // não é engano de quem digita, e não vira tela de formulário.
  if (bimestre === null) throw new RegraDeNegocio('bimestre fora do conjunto no lançamento');

  const redeId = redeAtual(c);
  const matriculas = await academico.matriculasAtivasDaTurma(redeId, alocacao.turmaId);
  const { valores, porMatricula, notas } = lerNotas(corpo, matriculas);
  const recusar = async (problemas: readonly ErroDeAplicacao[]): Promise<Response> =>
    renderizar(c, TELA_DE_NOTAS, await telaDeNotas(c, alocacao, bimestre, { valores, porMatricula, problemas }));

  if (porMatricula.size > 0) return await recusar([RESUMO_DE_NOTAS_INVALIDAS]);

  const resultado = await avaliacao.lancarNotas({
    redeId, turmaDisciplinaId: alocacao.id, bimestre, lancadaPor: usuarioAtual(c).id, notas,
  });
  if (!resultado.ok) return await recusar(resultado.erros);

  const parametros = { bimestre: String(bimestre), ok: mensagemDeNotas(resultado.valor) };
  return c.redirect(comParametros(caminhoDeNotas(alocacao.id), parametros), 303);
});

rotasProfessor.get('/turmas/:turmaId/chamada', async (c) => {
  const turma = turmaOu404(await alocacoesDoProfessor(c), c.req.param('turmaId'));
  const data = dataOuNula(c.req.query(CAMPO_DATA)) ?? hoje();
  return renderizar(c, TELA_DE_CHAMADA, await telaDeChamada(c, turma, data, null));
});

rotasProfessor.post('/turmas/:turmaId/chamada', async (c) => {
  const turma = turmaOu404(await alocacoesDoProfessor(c), c.req.param('turmaId'));
  const corpo = c.get('corpo');
  const data = dataOuNula(campo(corpo, CAMPO_DATA));
  if (data === null) throw new RegraDeNegocio('data de chamada malformada');

  const redeId = redeAtual(c);
  const matriculas = await academico.matriculasAtivasDaTurma(redeId, turma.turmaId);
  const informadas = new Map<string, { presente: boolean; justificativa: string }>();
  const linhas = matriculas.map((matricula) => {
    const presente = marcado(corpo, `${PREFIXO_PRESENCA}${matricula.id}`);
    const justificativa = campo(corpo, `${PREFIXO_JUSTIFICATIVA}${matricula.id}`);
    informadas.set(matricula.id, { presente, justificativa });
    return { matriculaId: matricula.id, presente, justificativa: ouNulo(justificativa) };
  });

  const resultado = await avaliacao.registrarChamada({
    redeId, turmaId: turma.turmaId, data, linhas,
  });
  if (!resultado.ok) {
    const tela = await telaDeChamada(c, turma, data, { informadas, problemas: resultado.erros });
    return renderizar(c, TELA_DE_CHAMADA, tela);
  }

  const parametros = { data, ok: `Chamada de ${formatarData(data)} registrada.` };
  return c.redirect(comParametros(caminhoDeChamada(turma.turmaId), parametros), 303);
});

rotasProfessor.get('/turmas/:turmaId/fechamento', async (c) => {
  const turma = turmaOu404(await alocacoesDoProfessor(c), c.req.param('turmaId'));
  const estados = await avaliacao.estadoDeFechamento(redeAtual(c), turma.turmaId);
  return renderizar(c, TELA_DE_FECHAMENTO, telaDeFechamento(turma, estados, [], null));
});

rotasProfessor.post('/turmas/:turmaId/fechamento', async (c) => {
  const turma = turmaOu404(await alocacoesDoProfessor(c), c.req.param('turmaId'));
  const bimestre = bimestreOuNulo(campo(c.get('corpo'), CAMPO_BIMESTRE));
  if (bimestre === null) throw new RegraDeNegocio('bimestre fora do conjunto no fechamento');

  const redeId = redeAtual(c);
  // Síncrono de propósito: a conferência de todas as notas da turma acontece com o navegador
  // esperando, e é esse tempo que o Estágio 05 vai ter de justificar antes de mudar qualquer coisa.
  const resultado = await avaliacao.fecharBimestre({
    redeId, turmaId: turma.turmaId, bimestre, fechadoPor: usuarioAtual(c).id,
  });
  if (!resultado.ok) {
    const estados = await avaliacao.estadoDeFechamento(redeId, turma.turmaId);
    return renderizar(c, TELA_DE_FECHAMENTO, telaDeFechamento(turma, estados, resultado.erros, bimestre));
  }

  const ok = `${bimestre}º bimestre fechado para a turma ${turma.turmaNome}.`;
  return c.redirect(comParametros(caminhoDeFechamento(turma.turmaId), { ok }), 303);
});
