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
import {
  BIMESTRES,
  LIMITES_DA_AVALIACAO,
  MEIO_DIA_UTC,
  VOCABULARIO_DA_AVALIACAO,
  avaliacao,
} from '../../avaliacao';
import { PAPEL } from '../../identidade';
import {
  FORMATOS,
  TAMANHO_DA_DATA_ISO,
  TEMPO,
  VARIAVEIS_DE_CONTEXTO,
} from '../../shared/constantes';
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
import {
  APRESENTACAO,
  AVISOS,
  CAMPOS,
  DIAGNOSTICOS,
  ERROS_DE_FORMULARIO,
  NOTA_FORA_DA_FAIXA,
  PARAMETROS,
  PREFIXOS_DE_ID,
  RESUMO_DE_NOTA_FORA_DA_FAIXA,
  ROTAS,
  TEMPLATES,
  TITULOS,
} from '../constantes';
import { formatarData, renderizar, type DadosDeTemplate } from '../render';
import type { Params } from './mapa';

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

/**
 * Os nomes dos `:params` deste grupo, conferidos contra os próprios padrões de `ROTAS.professor`.
 *
 * A montagem do endereço já é checada pelo compilador — `ROTAS.professor.chamada({ turmaId })` não
 * compila com a chave errada. A leitura, `c.req.param('turmaId')`, é a outra ponta do mesmo nome e
 * é só uma string: o `satisfies` a amarra ao mapa, de modo que renomear o parâmetro na declaração
 * da rota quebre a compilação aqui em vez de devolver 404 em produção.
 */
const PARAMETROS_DE_ROTA = {
  turmaDisciplinaId: 'turmaDisciplinaId',
  turmaId: 'turmaId',
} as const satisfies Params<
  typeof ROTAS.professor.notas.padrao | typeof ROTAS.professor.chamada.padrao
>;

/** O bimestre que a tela de notas abre quando a URL não pede outro. */
const BIMESTRE_PADRAO = 1;

/**
 * O que o `.eta` não tem como importar chega por `it`, e é este o único caminho: o Eta não lê
 * TypeScript, então redigitar `/parciais/_vazio`, `erro-` ou `· turno` dentro do template abriria
 * a segunda fonte de verdade que a constante existe para fechar. Quem sabe ler `constantes.ts` é
 * o handler, e é ele que carrega o valor até a tela.
 *
 * `PARCIAIS` vai para as três telas que incluem `_vazio` — painel, notas e chamada; o fechamento
 * não tem estado vazio a mostrar. `SEPARADORES` vai para as quatro, cujo sobretítulo emenda turma,
 * série e turno numa linha só. `PREFIXOS` vai para as duas que dão `id=` a um recado de erro: a
 * célula recusada do diário (`erro-<matriculaId>`) e o bimestre que não fechou
 * (`pendencia-<bimestre>`), cada um apontado por um `aria-describedby` que precisa casar byte a
 * byte com ele.
 */
const PARCIAIS = { parciais: TEMPLATES.parciais };
const SEPARADORES = {
  separador: APRESENTACAO.separador,
  separadorDeTurno: APRESENTACAO.separadorDeTurno,
};
const PREFIXOS = { prefixos: PREFIXOS_DE_ID };

/** Curto: mora dentro da célula. A explicação inteira está no resumo do topo e no rodapé. */
const NOTA_INVALIDA = NOTA_FORA_DA_FAIXA(
  LIMITES_DA_AVALIACAO.nota.minimo,
  LIMITES_DA_AVALIACAO.nota.maximo,
);

/**
 * O resumo no topo do formulário, distinto do erro que aparece em cada célula.
 *
 * O campo e o código vêm de `ERROS_DE_FORMULARIO.notaInvalida`; a frase, de
 * `RESUMO_DE_NOTA_FORA_DA_FAIXA`, ao lado do texto por célula que ela acompanha. Aquele objeto não
 * declara `mensagem` justamente por isto: o texto cita o intervalo da nota, que só existe depois
 * de ler `LIMITES_DA_AVALIACAO`, e nenhuma frase fixa serviria.
 */
const RESUMO_DE_NOTAS_INVALIDAS: ErroDeAplicacao = {
  ...ERROS_DE_FORMULARIO.notaInvalida,
  mensagem: RESUMO_DE_NOTA_FORA_DA_FAIXA(
    LIMITES_DA_AVALIACAO.nota.minimo,
    LIMITES_DA_AVALIACAO.nota.maximo,
  ),
};

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

/** `Number` só entende ponto; quem digita usa a vírgula do teclado. */
const SEPARADOR_DECIMAL_DO_NUMBER = '.';

const doisDigitos = (valor: number): string =>
  String(valor).padStart(APRESENTACAO.colunaDeDoisDigitos, APRESENTACAO.preenchimentoDeDigito);

/**
 * "Hoje" é o dia do relógio local da escola, não o dia UTC.
 *
 * Homônima da `hoje()` de `academico/aplicacao/cadastrarAluno.ts` e deliberadamente não fundida com
 * ela: aquela é UTC, porque compara com uma data de nascimento gravada; esta abre a chamada do dia
 * de quem está na sala. Às 21h de Brasília as duas devolvem datas diferentes, e é a diferença que
 * está certa.
 */
const hoje = (): string => {
  const d = clockDoSistema.agora();
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
};

const dataOuNula = (bruto: string | undefined): string | null => {
  if (bruto === undefined || !FORMATOS.dataIso.test(bruto)) return null;
  // O formato sozinho aceita 2026-02-30: converter e comparar a volta separa data de sequência.
  const convertida = new Date(`${bruto}${MEIO_DIA_UTC}`);
  if (Number.isNaN(convertida.getTime())) return null;
  return convertida.toISOString().slice(0, TAMANHO_DA_DATA_ISO) === bruto ? bruto : null;
};

/**
 * O dia anterior e o seguinte da chamada. `MEIO_DIA_UTC` vem de `avaliacao`, ao lado da
 * `MEIA_NOITE_UTC` de que ele se distingue: longe da meia-noite, somar 24 h não tropeça em fuso.
 */
const deslocarDia = (data: string, dias: number): string => {
  const base = new Date(`${data}${MEIO_DIA_UTC}`).getTime();
  return new Date(base + dias * TEMPO.msPorDia).toISOString().slice(0, TAMANHO_DA_DATA_ISO);
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
  hrefChamada: ROTAS.professor.chamada({ turmaId: turma.turmaId }),
  hrefFechamento: ROTAS.professor.fechamento({ turmaId: turma.turmaId }),
  disciplinas: turma.disciplinas.map((d) => ({
    ...d,
    hrefNotas: ROTAS.professor.notas({ turmaDisciplinaId: d.id }),
  })),
});

function alocacaoOu404(alocacoes: readonly Alocacao[], turmaDisciplinaId: string): Alocacao {
  const alocacao = alocacoes.find((candidata) => candidata.id === turmaDisciplinaId);
  if (alocacao === undefined) throw new NaoEncontrado(DIAGNOSTICOS.disciplinaForaDoQuadro);
  return alocacao;
}

function turmaOu404(alocacoes: readonly Alocacao[], turmaId: string): TurmaDoProfessor {
  const turma = agruparPorTurma(alocacoes).find((candidata) => candidata.turmaId === turmaId);
  if (turma === undefined) throw new NaoEncontrado(DIAGNOSTICOS.turmaForaDoQuadro);
  return turma;
}

/* --- Montagem das telas ----------------------------------------------------- */

/** Campo em branco apaga a nota; vírgula e ponto são o mesmo separador para quem digita. */
const comoNota = (digitado: string): number | null | undefined => {
  if (digitado === '') return null;
  const numero = Number(
    digitado.replace(APRESENTACAO.separadorDecimal, SEPARADOR_DECIMAL_DO_NUMBER),
  );
  if (
    !Number.isFinite(numero) ||
    numero < LIMITES_DA_AVALIACAO.nota.minimo ||
    numero > LIMITES_DA_AVALIACAO.nota.maximo
  ) {
    return undefined;
  }
  return numero;
};

function lerNotas(corpo: CorpoDeFormulario, matriculas: readonly { id: string }[]) {
  const valores = new Map<string, string>();
  const porMatricula = new Map<string, string>();
  const notas = matriculas.map((matricula) => {
    const digitado = campo(corpo, `${CAMPOS.diario.nota}${matricula.id}`);
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
    ...PARCIAIS,
    ...SEPARADORES,
    ...PREFIXOS,
    titulo: TITULOS.professor.notas(alocacao.disciplinaNome, alocacao.turmaNome),
    alocacao,
    bimestre,
    bimestres: BIMESTRES,
    fechado: estados.some((estado) => estado.bimestre === bimestre && estado.fechado),
    acaoDoFormulario: ROTAS.professor.notas({ turmaDisciplinaId: alocacao.id }),
    hrefChamada: ROTAS.professor.chamada({ turmaId: alocacao.turmaId }),
    hrefFechamento: ROTAS.professor.fechamento({ turmaId: alocacao.turmaId }),
    campoBimestre: CAMPOS.bimestre,
    prefixoNota: CAMPOS.diario.nota,
    notaMinima: LIMITES_DA_AVALIACAO.nota.minimo,
    notaMaxima: LIMITES_DA_AVALIACAO.nota.maximo,
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
  if (gravadas === 0) return AVISOS.notasNenhuma;
  return gravadas === 1 ? AVISOS.notaUma : AVISOS.notasVarias(gravadas);
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
    ...PARCIAIS,
    ...SEPARADORES,
    titulo: TITULOS.professor.chamada(turma.turmaNome),
    turma: comLinks(turma),
    data,
    diaAnterior: deslocarDia(data, -1),
    diaSeguinte: deslocarDia(data, 1),
    acaoDoFormulario: ROTAS.professor.chamada({ turmaId: turma.turmaId }),
    campoData: CAMPOS.data,
    prefixoPresenca: CAMPOS.diario.presenca,
    prefixoJustificativa: CAMPOS.diario.justificativa,
    limiteDaJustificativa: LIMITES_DA_AVALIACAO.justificativa,
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
  ...SEPARADORES,
  ...PREFIXOS,
  titulo: TITULOS.professor.fechamento(turma.turmaNome),
  turma: comLinks(turma),
  estados,
  acaoDoFormulario: ROTAS.professor.fechamento({ turmaId: turma.turmaId }),
  campoBimestre: CAMPOS.bimestre,
  rotuloDoFechamento: VOCABULARIO_DA_AVALIACAO.fechamento,
  bimestreRecusado,
  erros: problemas,
});

/* --- Rotas ------------------------------------------------------------------ */

export const rotasProfessor = new Hono<{ Variables: Variaveis }>();

rotasProfessor.use(exigirPapel(PAPEL.professor));

rotasProfessor.get(ROTAS.professor.painel.padrao, async (c) => {
  const turmas = agruparPorTurma(await alocacoesDoProfessor(c)).map(comLinks);
  return renderizar(c, TEMPLATES.professor.painel, {
    ...PARCIAIS,
    ...SEPARADORES,
    titulo: TITULOS.professor.painel,
    turmas,
  });
});

rotasProfessor.get(ROTAS.professor.notas.padrao, async (c) => {
  const alocacao = alocacaoOu404(
    await alocacoesDoProfessor(c),
    c.req.param(PARAMETROS_DE_ROTA.turmaDisciplinaId),
  );
  // Bimestre digitado à mão na URL cai no primeiro em vez de virar erro: é navegação, não escrita.
  const bimestre = bimestreOuNulo(c.req.query(PARAMETROS.bimestre)) ?? BIMESTRE_PADRAO;
  return renderizar(c, TEMPLATES.professor.notas, await telaDeNotas(c, alocacao, bimestre, null));
});

rotasProfessor.post(ROTAS.professor.notas.padrao, async (c) => {
  const alocacao = alocacaoOu404(
    await alocacoesDoProfessor(c),
    c.req.param(PARAMETROS_DE_ROTA.turmaDisciplinaId),
  );
  const corpo = c.get(VARIAVEIS_DE_CONTEXTO.corpo);
  const bimestre = bimestreOuNulo(campo(corpo, CAMPOS.bimestre));
  // No POST o bimestre veio de um campo oculto que esta aplicação escreveu: valor fora do conjunto
  // não é engano de quem digita, e não vira tela de formulário.
  if (bimestre === null) throw new RegraDeNegocio(DIAGNOSTICOS.bimestreNoLancamento);

  const redeId = redeAtual(c);
  const matriculas = await academico.matriculasAtivasDaTurma(redeId, alocacao.turmaId);
  const { valores, porMatricula, notas } = lerNotas(corpo, matriculas);
  const recusar = async (problemas: readonly ErroDeAplicacao[]): Promise<Response> =>
    renderizar(
      c,
      TEMPLATES.professor.notas,
      await telaDeNotas(c, alocacao, bimestre, { valores, porMatricula, problemas }),
    );

  if (porMatricula.size > 0) return await recusar([RESUMO_DE_NOTAS_INVALIDAS]);

  const resultado = await avaliacao.lancarNotas({
    redeId, turmaDisciplinaId: alocacao.id, bimestre, lancadaPor: usuarioAtual(c).id, notas,
  });
  if (!resultado.ok) return await recusar(resultado.erros);

  const parametros = {
    [PARAMETROS.bimestre]: String(bimestre),
    [PARAMETROS.ok]: mensagemDeNotas(resultado.valor),
  };
  return c.redirect(
    comParametros(ROTAS.professor.notas({ turmaDisciplinaId: alocacao.id }), parametros),
    303,
  );
});

rotasProfessor.get(ROTAS.professor.chamada.padrao, async (c) => {
  const turma = turmaOu404(await alocacoesDoProfessor(c), c.req.param(PARAMETROS_DE_ROTA.turmaId));
  const data = dataOuNula(c.req.query(PARAMETROS.data)) ?? hoje();
  return renderizar(c, TEMPLATES.professor.chamada, await telaDeChamada(c, turma, data, null));
});

rotasProfessor.post(ROTAS.professor.chamada.padrao, async (c) => {
  const turma = turmaOu404(await alocacoesDoProfessor(c), c.req.param(PARAMETROS_DE_ROTA.turmaId));
  const corpo = c.get(VARIAVEIS_DE_CONTEXTO.corpo);
  const data = dataOuNula(campo(corpo, CAMPOS.data));
  if (data === null) throw new RegraDeNegocio(DIAGNOSTICOS.dataDeChamadaMalformada);

  const redeId = redeAtual(c);
  const matriculas = await academico.matriculasAtivasDaTurma(redeId, turma.turmaId);
  const informadas = new Map<string, { presente: boolean; justificativa: string }>();
  const linhas = matriculas.map((matricula) => {
    const presente = marcado(corpo, `${CAMPOS.diario.presenca}${matricula.id}`);
    const justificativa = campo(corpo, `${CAMPOS.diario.justificativa}${matricula.id}`);
    informadas.set(matricula.id, { presente, justificativa });
    return { matriculaId: matricula.id, presente, justificativa: ouNulo(justificativa) };
  });

  const resultado = await avaliacao.registrarChamada({
    redeId, turmaId: turma.turmaId, data, linhas,
  });
  if (!resultado.ok) {
    const tela = await telaDeChamada(c, turma, data, { informadas, problemas: resultado.erros });
    return renderizar(c, TEMPLATES.professor.chamada, tela);
  }

  const parametros = {
    [PARAMETROS.data]: data,
    [PARAMETROS.ok]: AVISOS.chamadaRegistrada(formatarData(data)),
  };
  return c.redirect(
    comParametros(ROTAS.professor.chamada({ turmaId: turma.turmaId }), parametros),
    303,
  );
});

rotasProfessor.get(ROTAS.professor.fechamento.padrao, async (c) => {
  const turma = turmaOu404(await alocacoesDoProfessor(c), c.req.param(PARAMETROS_DE_ROTA.turmaId));
  const estados = await avaliacao.estadoDeFechamento(redeAtual(c), turma.turmaId);
  return renderizar(
    c,
    TEMPLATES.professor.fechamento,
    telaDeFechamento(turma, estados, [], null),
  );
});

rotasProfessor.post(ROTAS.professor.fechamento.padrao, async (c) => {
  const turma = turmaOu404(await alocacoesDoProfessor(c), c.req.param(PARAMETROS_DE_ROTA.turmaId));
  const bimestre = bimestreOuNulo(campo(c.get(VARIAVEIS_DE_CONTEXTO.corpo), CAMPOS.bimestre));
  if (bimestre === null) throw new RegraDeNegocio(DIAGNOSTICOS.bimestreNoFechamento);

  const redeId = redeAtual(c);
  // Síncrono de propósito: a conferência de todas as notas da turma acontece com o navegador
  // esperando, e é esse tempo que o Estágio 05 vai ter de justificar antes de mudar qualquer coisa.
  const resultado = await avaliacao.fecharBimestre({
    redeId, turmaId: turma.turmaId, bimestre, fechadoPor: usuarioAtual(c).id,
  });
  if (!resultado.ok) {
    const estados = await avaliacao.estadoDeFechamento(redeId, turma.turmaId);
    return renderizar(
      c,
      TEMPLATES.professor.fechamento,
      telaDeFechamento(turma, estados, resultado.erros, bimestre),
    );
  }

  const parametros = { [PARAMETROS.ok]: AVISOS.bimestreFechado(bimestre, turma.turmaNome) };
  return c.redirect(
    comParametros(ROTAS.professor.fechamento({ turmaId: turma.turmaId }), parametros),
    303,
  );
});
