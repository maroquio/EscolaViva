/**
 * Rotas da secretaria — quem estuda, em que turma e com quem.
 *
 * Duas regras governam o arquivo inteiro. A primeira é o alcance: a secretaria enxerga a rede da
 * sessão e, dentro dela, apenas as unidades em que tem o papel. Pedir um aluno, uma turma ou uma
 * matrícula de fora disso responde 404 — 403 confirmaria que o registro existe, e a existência de
 * um aluno já é informação. A segunda é o POST-Redirect-GET: toda escrita termina em
 * redirecionamento com a mensagem na query, e o formulário recusado volta re-renderizado, com o
 * que foi digitado e cada erro ancorado no campo que o causou.
 */

import { Hono, type Context } from 'hono';
import {
  LIMITES_DO_ACADEMICO,
  VOCABULARIO_DO_ACADEMICO,
  academico,
  type Aluno,
  type AnoLetivo,
  type Matricula,
  type Turma,
} from '../../academico';
import { PAPEL, identidade } from '../../identidade';
import {
  AUSENTE,
  LOCALE,
  TAMANHO_DA_DATA_ISO,
  TAMANHO_DO_CPF_COM_MASCARA,
  VARIAVEIS_DE_CONTEXTO,
} from '../../shared/constantes';
import {
  ehIdentificador,
  exigirPapel,
  redeAtual,
  usuarioAtual,
  type CorpoDeFormulario,
  type Variaveis,
} from '../../shared/http';
import { fatiar } from '../../shared/paginacao';
import { clockDoSistema } from '../../shared/ports';
import type { ErroDeAplicacao } from '../../shared/resultado';
import {
  APRESENTACAO,
  AVISOS,
  CAMPOS,
  MARCADO,
  PAGINAS_DE_ERRO,
  PARAMETROS,
  ROTAS,
  SUFIXOS_DE_ID,
  TEMPLATES,
  TITULOS,
  VALORES_INICIAIS,
} from '../constantes';
import { navegacao, paginaDaQuery } from '../paginacao';
import { renderizar, renderizarErro } from '../render';
import type { Params } from './mapa';

type Contexto = Context<{ Variables: Variaveis }>;
type Valores = Record<string, string | boolean>;
type Erros = readonly ErroDeAplicacao[];
type Unidade = { id: string; nome: string };
type Dados = Record<string, unknown>;

/** A turma como as telas da secretaria a mostram: já com o nome da unidade e o ano resolvidos. */
type TurmaEmLista = {
  id: string;
  nome: string;
  serie: string;
  turno: string;
  anoLetivoId: string;
  unidadeNome: string;
  ano: number | null;
};

/**
 * Os nomes dos `:params` deste grupo, conferidos contra os próprios padrões de `ROTAS.secretaria`.
 *
 * A montagem do endereço já é checada pelo compilador — `ROTAS.secretaria.aluno({ id })` não compila
 * com a chave errada. A leitura, `c.req.param('id')`, é a outra ponta do mesmo nome e é só uma
 * string: o `satisfies` a amarra ao mapa, de modo que renomear o parâmetro na declaração da rota
 * quebre a compilação aqui em vez de devolver 404 em produção. Os oito padrões entram na união
 * porque são os oito que este arquivo lê — todos por `:id`, e é o mapa que diz isso, não o comentário.
 */
const PARAMETROS_DE_ROTA = {
  id: 'id',
} as const satisfies Params<
  | typeof ROTAS.secretaria.aluno.padrao
  | typeof ROTAS.secretaria.alunoResponsavelNovo.padrao
  | typeof ROTAS.secretaria.alunoResponsaveis.padrao
  | typeof ROTAS.secretaria.alunoMatricular.padrao
  | typeof ROTAS.secretaria.matriculaTransferir.padrao
  | typeof ROTAS.secretaria.turma.padrao
  | typeof ROTAS.secretaria.turmaDisciplinaNova.padrao
  | typeof ROTAS.secretaria.turmaDisciplinas.padrao
>;

/**
 * O que o Eta não consegue importar e toda tela desta secretaria usa.
 *
 * O `.eta` não passa pelo compilador e não lê TypeScript: até aqui cada template redeclarava o
 * caminho dos seus parciais, o travessão da célula vazia, o rótulo da opção em branco e o sufixo de
 * id que `descricao()` monta do outro lado, em `render.ts`. Eram cópias que só divergiam na tela —
 * um `-erro` escrito à mão de um lado e um `SUFIXOS_DE_ID.erro` do outro, e o `aria-describedby`
 * apontando para um id que não existe. Vai em todo `renderizar` deste arquivo pelo mesmo motivo que
 * `render.ts` injeta `it.rotas` em todos: é contexto da camada, não dado de uma tela.
 */
const DA_CAMADA = {
  parciais: TEMPLATES.parciais,
  sufixos: SUFIXOS_DE_ID,
  semValor: AUSENTE,
  opcaoVazia: APRESENTACAO.opcaoVazia,
} as const;

/** O vocabulário é do acadêmico; aqui ele só vira tabela de tradução para a tela. */
const NOME_DO_TURNO: Record<string, string> = VOCABULARIO_DO_ACADEMICO.turno;
const TURNOS = Object.entries(NOME_DO_TURNO).map(([valor, nome]) => ({ valor, nome }));

const NOME_DA_SITUACAO: Record<string, string> = VOCABULARIO_DO_ACADEMICO.situacaoDeMatricula;

const hoje = (): string => clockDoSistema.agora().toISOString().slice(0, TAMANHO_DA_DATA_ISO);
const porNome = (a: Unidade, b: Unidade): number => a.nome.localeCompare(b.nome, LOCALE);

const texto = (corpo: CorpoDeFormulario, campo: string): string => {
  const valor = corpo[campo];
  return typeof valor === 'string' ? valor.trim() : '';
};

const marcado = (corpo: CorpoDeFormulario, campo: string): boolean => texto(corpo, campo) !== '';

const escolhido = (valor: string | undefined, permitidos: readonly string[]): string | null =>
  valor !== undefined && permitidos.includes(valor) ? valor : null;

const concluir = (c: Contexto, destino: string, mensagem: string): Response =>
  c.redirect(`${destino}?${PARAMETROS.ok}=${encodeURIComponent(mensagem)}`, 303);

const naoEncontrado = (c: Contexto): Response =>
  renderizarErro(
    c,
    404,
    PAGINAS_DE_ERRO.registroForaDoAlcance.titulo,
    PAGINAS_DE_ERRO.registroForaDoAlcance.detalhe,
  );

/* --- Alcance da secretaria -------------------------------------------------- */

/** As unidades em que a pessoa é secretaria: o limite de tudo o que ela lê e escreve aqui. */
const unidadesDaSecretaria = (c: Contexto): Unidade[] => {
  const nomePorId = new Map<string, string>();
  for (const atribuicao of usuarioAtual(c).papeis) {
    if (atribuicao.papel === PAPEL.secretaria) {
      nomePorId.set(atribuicao.unidadeId, atribuicao.unidadeNome);
    }
  }
  return [...nomePorId].map(([id, nome]) => ({ id, nome })).sort(porNome);
};

const idsDe = (unidades: readonly Unidade[]): string[] => unidades.map(({ id }) => id);

/**
 * O alcance vira uma condição da consulta, e não uma consulta por unidade concatenada aqui. Era
 * essa concatenação que impedia a lista de ter recorte: quem monta a lista em memória já pagou o
 * custo inteiro antes de decidir mostrar vinte linhas.
 */
const turmasDoAlcance = (
  redeId: string,
  unidades: readonly Unidade[],
  anoLetivoId: string | null,
): Promise<Turma[]> =>
  academico.listarTurmas(redeId, {
    unidadeIds: idsDe(unidades),
    ...(anoLetivoId === null ? {} : { anoLetivoId }),
  });

const turmaNoAlcance = async (c: Contexto, turmaId: string): Promise<Turma | null> => {
  if (!ehIdentificador(turmaId)) return null;
  const turma = await academico.turmaPorId(redeAtual(c), turmaId);
  if (turma === null) return null;
  return unidadesDaSecretaria(c).some(({ id }) => id === turma.unidadeId) ? turma : null;
};

/* --- Modelos de exibição ---------------------------------------------------- */

const turmaEmLista = (
  turma: Turma,
  ano: ReadonlyMap<string, number>,
  unidade: ReadonlyMap<string, string>,
): TurmaEmLista => ({
  id: turma.id,
  nome: turma.nome,
  serie: turma.serie,
  turno: NOME_DO_TURNO[turma.turno] ?? turma.turno,
  anoLetivoId: turma.anoLetivoId,
  unidadeNome: unidade.get(turma.unidadeId) ?? AUSENTE,
  ano: ano.get(turma.anoLetivoId) ?? null,
});

const matriculaEmLista = (matricula: Matricula): Dados => ({
  ...matricula,
  situacaoNome: NOME_DA_SITUACAO[matricula.situacao] ?? matricula.situacao,
});

export const rotasSecretaria = new Hono<{ Variables: Variaveis }>();

rotasSecretaria.use(exigirPapel(PAPEL.secretaria));

/* --- Painel ----------------------------------------------------------------- */

/**
 * A tabela do painel é a única do sistema recortada em memória, e por um motivo que não vale para
 * as outras: as unidades vêm dos papéis da sessão, não de uma consulta — não existe SQL onde
 * pendurar o LIMIT. O que era caro aqui não era a lista de unidades, e sim as contagens: uma
 * consulta por unidade, mais uma por turma. Agora são três agregações, e só para a página aberta.
 */
rotasSecretaria.get(ROTAS.secretaria.painel.padrao, async (c) => {
  const redeId = redeAtual(c);
  const unidades = unidadesDaSecretaria(c);
  const pagina = fatiar(unidades, paginaDaQuery(c));

  const [anosLetivos, totais, porUnidade] = await Promise.all([
    academico.listarAnosLetivos(redeId),
    academico.totaisDoAlcance(redeId, idsDe(unidades)),
    academico.contagensPorUnidade(redeId, idsDe(pagina.itens)),
  ]);

  const contagens = pagina.itens.map((unidade) => ({
    nome: unidade.nome,
    ...(porUnidade.get(unidade.id) ?? { turmas: 0, matriculas: 0, responsaveis: 0 }),
  }));

  return renderizar(c, TEMPLATES.secretaria.painel, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.painel,
    unidades: contagens,
    navegacao: navegacao(c, pagina),
    anoCorrente: anosLetivos[0] ?? null,
    totais,
  });
});

/* --- Alunos ----------------------------------------------------------------- */

rotasSecretaria.get(ROTAS.secretaria.alunos.padrao, async (c) => {
  const redeId = redeAtual(c);
  const termo = (c.req.query(PARAMETROS.busca) ?? '').trim();
  const pagina =
    termo === ''
      ? fatiar<Aluno>([], 1)
      : await academico.paginaDeAlunos(redeId, termo, paginaDaQuery(c));
  const encontrados = pagina.itens;

  // A turma ao lado do nome sai de uma consulta para a página inteira. Antes vinha de percorrer as
  // matrículas de todas as turmas do alcance — a rede inteira lida para enfeitar vinte linhas.
  const ativas = await academico.matriculasAtivasDosAlunos(
    redeId,
    encontrados.map((aluno) => aluno.id),
    idsDe(unidadesDaSecretaria(c)),
  );
  const ativaPorAluno = new Map(ativas.map((matricula) => [matricula.alunoId, matricula]));

  const alunos = encontrados.map((aluno) => {
    const matricula = ativaPorAluno.get(aluno.id) ?? null;
    return {
      id: aluno.id,
      nome: aluno.nome,
      dataNascimento: aluno.dataNascimento,
      turmaNome: matricula?.turmaNome ?? null,
      ano: matricula?.ano ?? null,
      situacao: matricula?.situacao ?? null,
      situacaoNome: matricula === null ? null : (NOME_DA_SITUACAO[matricula.situacao] ?? null),
    };
  });

  return renderizar(c, TEMPLATES.secretaria.alunos, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.alunos,
    // O `name` do campo é o parâmetro que esta mesma rota lê de volta: um GET fecha o ciclo aqui.
    campoDaBusca: PARAMETROS.busca,
    limiteDoNome: LIMITES_DO_ACADEMICO.aluno.nome,
    termo,
    buscou: termo !== '',
    alunos,
    navegacao: navegacao(c, pagina),
  });
});

/** O formulário de aluno, em branco no GET e de volta com o que foi digitado quando recusado. */
const formDeAluno = (c: Contexto, valores: Valores, erros: Erros): Response =>
  renderizar(c, TEMPLATES.secretaria.alunoNovo, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.alunoNovo,
    limiteDoNome: LIMITES_DO_ACADEMICO.aluno.nome,
    valores,
    erros,
  });

rotasSecretaria.get(ROTAS.secretaria.alunoNovo.padrao, (c) =>
  formDeAluno(c, VALORES_INICIAIS.aluno, []));

rotasSecretaria.post(ROTAS.secretaria.alunos.padrao, async (c) => {
  const corpo = c.get(VARIAVEIS_DE_CONTEXTO.corpo);
  const valores = {
    nome: texto(corpo, CAMPOS.aluno.nome),
    dataNascimento: texto(corpo, CAMPOS.aluno.dataNascimento),
  };
  const resultado = await academico.cadastrarAluno({ redeId: redeAtual(c), ...valores });
  if (resultado.ok) {
    return concluir(
      c,
      ROTAS.secretaria.aluno({ id: resultado.valor.id }),
      AVISOS.alunoCadastrado,
    );
  }
  return formDeAluno(c, valores, resultado.erros);
});

/**
 * O aluno, se estiver ao alcance desta secretaria. É o mesmo critério da ficha, sem as tabelas
 * dela: as páginas de formulário precisam do porteiro, não do conteúdo.
 *
 * Aluno que estuda em outra unidade da rede não é assunto desta secretaria — e ela não fica
 * sabendo que ele existe. Aluno ainda sem matrícula é da rede: aparece para todas.
 */
const alunoNoAlcance = async (c: Contexto, alunoId: string): Promise<Aluno | null> => {
  if (!ehIdentificador(alunoId)) return null;
  const redeId = redeAtual(c);
  const unidadeIds = idsDe(unidadesDaSecretaria(c));

  const [aluno, historico, temMatricula] = await Promise.all([
    academico.alunoPorId(redeId, alunoId),
    academico.paginaDeMatriculasDoAluno(redeId, alunoId, unidadeIds, 1),
    academico.alunoTemMatricula(redeId, alunoId),
  ]);
  if (aluno === null) return null;
  return temMatricula && historico.total === 0 ? null : aluno;
};

/**
 * Tudo o que a ficha mostra. Devolve `null` quando o aluno não existe ou está fora do alcance.
 *
 * A ficha só lê: as opções dos formulários — responsáveis, anos letivos, turmas do alcance —
 * saíram daqui e são consultadas em cada página de escrita, uma vez, por quem realmente as usa.
 *
 * As duas tabelas da tela — responsáveis vinculados e histórico de matrículas — têm cada uma o
 * seu parâmetro de página, porque avançar uma não pode mexer na outra.
 *
 * A matrícula ativa é consultada à parte, e não procurada entre as linhas exibidas: é dela que sai
 * o botão de transferência, que precisa continuar aparecendo na segunda página do histórico.
 */
const fichaDoAluno = async (c: Contexto, alunoId: string): Promise<Dados | null> => {
  if (!ehIdentificador(alunoId)) return null;
  const redeId = redeAtual(c);
  const unidadeIds = idsDe(unidadesDaSecretaria(c));

  const [aluno, vinculos, historico, ativas, temMatricula] = await Promise.all([
    academico.alunoPorId(redeId, alunoId),
    academico.paginaDeResponsaveisDoAluno(
      redeId,
      alunoId,
      paginaDaQuery(c, PARAMETROS.paginaDeResponsaveis),
    ),
    academico.paginaDeMatriculasDoAluno(
      redeId,
      alunoId,
      unidadeIds,
      paginaDaQuery(c, PARAMETROS.paginaDeMatriculas),
    ),
    academico.matriculasAtivasDosAlunos(redeId, [alunoId], unidadeIds),
    academico.alunoTemMatricula(redeId, alunoId),
  ]);
  if (aluno === null) return null;
  if (temMatricula && historico.total === 0) return null;

  const ativa = ativas[0] ?? null;

  return {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.aluno,
    aluno,
    vinculos: vinculos.itens,
    navegacaoVinculos: navegacao(c, vinculos, PARAMETROS.paginaDeResponsaveis),
    matriculas: historico.itens.map(matriculaEmLista),
    navegacaoMatriculas: navegacao(c, historico, PARAMETROS.paginaDeMatriculas),
    ativa: ativa === null ? null : matriculaEmLista(ativa),
  };
};

rotasSecretaria.get(ROTAS.secretaria.aluno.padrao, async (c) => {
  const ficha = await fichaDoAluno(c, c.req.param(PARAMETROS_DE_ROTA.id));
  return ficha === null ? naoEncontrado(c) : renderizar(c, TEMPLATES.secretaria.aluno, ficha);
});

/**
 * As opções do vínculo: os responsáveis da rede menos os que já respondem por este aluno —
 * vincular duas vezes é o mesmo vínculo. A lista de vínculos usada no corte é a primeira página,
 * a mesma que a ficha abre.
 */
const formDeVinculo = async (
  c: Contexto,
  aluno: Aluno,
  valores: Valores,
  erros: Erros,
): Promise<Response> => {
  const redeId = redeAtual(c);
  const [responsaveis, vinculados] = await Promise.all([
    academico.listarResponsaveis(redeId),
    academico.paginaDeResponsaveisDoAluno(redeId, aluno.id, 1),
  ]);
  const jaVinculados = new Set(vinculados.itens.map((vinculo) => vinculo.responsavelId));

  return renderizar(c, TEMPLATES.secretaria.alunoResponsavelNovo, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.vincularResponsavel,
    limiteDoParentesco: LIMITES_DO_ACADEMICO.parentesco.descricao,
    // O que a caixa de responsável financeiro envia quando marcada; o dono do valor é `MARCADO`.
    marcado: MARCADO,
    aluno,
    disponiveis: responsaveis.filter((pessoa) => !jaVinculados.has(pessoa.id)),
    temResponsaveis: responsaveis.length > 0,
    valores,
    erros,
  });
};

rotasSecretaria.get(ROTAS.secretaria.alunoResponsavelNovo.padrao, async (c) => {
  const aluno = await alunoNoAlcance(c, c.req.param(PARAMETROS_DE_ROTA.id));
  return aluno === null ? naoEncontrado(c) : await formDeVinculo(c, aluno, {}, []);
});

rotasSecretaria.post(ROTAS.secretaria.alunoResponsaveis.padrao, async (c) => {
  const aluno = await alunoNoAlcance(c, c.req.param(PARAMETROS_DE_ROTA.id));
  if (aluno === null) return naoEncontrado(c);

  const corpo = c.get(VARIAVEIS_DE_CONTEXTO.corpo);
  const valores = {
    responsavelId: texto(corpo, CAMPOS.vinculo.responsavelId),
    parentesco: texto(corpo, CAMPOS.vinculo.parentesco),
    financeiro: marcado(corpo, CAMPOS.vinculo.financeiro),
  };
  const resultado = await academico.vincularResponsavel({
    redeId: redeAtual(c),
    alunoId: aluno.id,
    ...valores,
  });
  if (resultado.ok) {
    return concluir(c, ROTAS.secretaria.aluno({ id: aluno.id }), AVISOS.responsavelVinculado);
  }
  return await formDeVinculo(c, aluno, valores, resultado.erros);
});

/* --- Matrículas ------------------------------------------------------------- */

/**
 * O que os dois seletores de turma precisam: as turmas do alcance, já com o ano e o nome da
 * unidade, e a lista de anos letivos — que sai da mesma consulta que nomeia o ano de cada turma.
 */
const opcoesDeTurma = async (
  c: Contexto,
): Promise<{ turmas: TurmaEmLista[]; anosLetivos: AnoLetivo[] }> => {
  const redeId = redeAtual(c);
  const unidades = unidadesDaSecretaria(c);
  const [turmas, anosLetivos] = await Promise.all([
    turmasDoAlcance(redeId, unidades, null),
    academico.listarAnosLetivos(redeId),
  ]);
  const anoPorId = new Map(anosLetivos.map((anoLetivo) => [anoLetivo.id, anoLetivo.ano]));
  const nomePorUnidade = new Map(unidades.map(({ id, nome }) => [id, nome]));
  return { turmas: turmas.map((turma) => turmaEmLista(turma, anoPorId, nomePorUnidade)), anosLetivos };
};

const formDeMatricula = async (
  c: Contexto,
  aluno: Aluno,
  valores: Valores,
  erros: Erros,
): Promise<Response> => {
  const { turmas, anosLetivos } = await opcoesDeTurma(c);
  return renderizar(c, TEMPLATES.secretaria.alunoMatriculaNova, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.matricular,
    aluno,
    turmas,
    anosLetivos,
    hoje: hoje(),
    valores,
    erros,
  });
};

rotasSecretaria.get(ROTAS.secretaria.alunoMatricular.padrao, async (c) => {
  const aluno = await alunoNoAlcance(c, c.req.param(PARAMETROS_DE_ROTA.id));
  return aluno === null ? naoEncontrado(c) : await formDeMatricula(c, aluno, {}, []);
});

rotasSecretaria.post(ROTAS.secretaria.matriculas.padrao, async (c) => {
  const corpo = c.get(VARIAVEIS_DE_CONTEXTO.corpo);
  const aluno = await alunoNoAlcance(c, texto(corpo, CAMPOS.matricula.alunoId));
  if (aluno === null) return naoEncontrado(c);

  const valores = {
    turmaId: texto(corpo, CAMPOS.matricula.turmaId),
    anoLetivoId: texto(corpo, CAMPOS.matricula.anoLetivoId),
    dataMatricula: texto(corpo, CAMPOS.matricula.dataMatricula),
  };
  // Turma de outra unidade responde 404 aqui, e não erro de campo: a tela não confirma que ela existe.
  if (valores.turmaId !== '' && (await turmaNoAlcance(c, valores.turmaId)) === null) {
    return naoEncontrado(c);
  }

  const resultado = await academico.matricular({
    redeId: redeAtual(c),
    alunoId: aluno.id,
    ...valores,
  });
  if (resultado.ok) {
    return concluir(c, ROTAS.secretaria.aluno({ id: aluno.id }), AVISOS.matriculaRegistrada);
  }
  return await formDeMatricula(c, aluno, valores, resultado.erros);
});

/** A matrícula ativa desta secretaria, com o aluno dela. Fora do alcance, `null`. */
const transferenciaNoAlcance = async (
  c: Contexto,
  matriculaId: string,
): Promise<{ matricula: Matricula; aluno: Aluno } | null> => {
  if (!ehIdentificador(matriculaId)) return null;
  const matricula = await academico.matriculaPorId(redeAtual(c), matriculaId);
  if (matricula === null) return null;
  if (!unidadesDaSecretaria(c).some(({ id }) => id === matricula.unidadeId)) return null;
  const aluno = await alunoNoAlcance(c, matricula.alunoId);
  return aluno === null ? null : { matricula, aluno };
};

/** A turma de origem sai do seletor: transferir para onde já se está não é transferência. */
const formDeTransferencia = async (
  c: Contexto,
  matricula: Matricula,
  aluno: Aluno,
  valores: Valores,
  erros: Erros,
): Promise<Response> => {
  const { turmas } = await opcoesDeTurma(c);
  return renderizar(c, TEMPLATES.secretaria.matriculaTransferencia, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.transferir,
    aluno,
    ativa: matriculaEmLista(matricula),
    turmas: turmas.filter((turma) => turma.id !== matricula.turmaId),
    hoje: hoje(),
    valores,
    erros,
  });
};

rotasSecretaria.get(ROTAS.secretaria.matriculaTransferir.padrao, async (c) => {
  const alvo = await transferenciaNoAlcance(c, c.req.param(PARAMETROS_DE_ROTA.id));
  if (alvo === null) return naoEncontrado(c);
  return await formDeTransferencia(c, alvo.matricula, alvo.aluno, {}, []);
});

rotasSecretaria.post(ROTAS.secretaria.matriculaTransferir.padrao, async (c) => {
  const matriculaId = c.req.param(PARAMETROS_DE_ROTA.id);
  const alvo = await transferenciaNoAlcance(c, matriculaId);
  if (alvo === null) return naoEncontrado(c);

  const corpo = c.get(VARIAVEIS_DE_CONTEXTO.corpo);
  const valores = {
    turmaDestinoId: texto(corpo, CAMPOS.transferencia.turmaDestinoId),
    data: texto(corpo, CAMPOS.transferencia.data),
  };
  if (valores.turmaDestinoId !== '' && (await turmaNoAlcance(c, valores.turmaDestinoId)) === null) {
    return naoEncontrado(c);
  }

  const resultado = await academico.transferir({ redeId: redeAtual(c), matriculaId, ...valores });
  if (resultado.ok) {
    return concluir(
      c,
      ROTAS.secretaria.aluno({ id: alvo.aluno.id }),
      AVISOS.transferenciaConcluida,
    );
  }
  return await formDeTransferencia(c, alvo.matricula, alvo.aluno, valores, resultado.erros);
});

/* --- Responsáveis ----------------------------------------------------------- */

const telaDeResponsaveis = async (c: Contexto): Promise<Response> => {
  const pagina = await academico.paginaDeResponsaveis(redeAtual(c), paginaDaQuery(c));
  return renderizar(c, TEMPLATES.secretaria.responsaveis, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.responsaveis,
    responsaveis: pagina.itens,
    navegacao: navegacao(c, pagina),
  });
};

const formDeResponsavel = (c: Contexto, valores: Valores, erros: Erros): Response =>
  renderizar(c, TEMPLATES.secretaria.responsavelNovo, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.responsavelNovo,
    limiteDoNome: LIMITES_DO_ACADEMICO.responsavel.nome,
    limiteDoEmail: LIMITES_DO_ACADEMICO.responsavel.email,
    limiteDoTelefone: LIMITES_DO_ACADEMICO.responsavel.telefone,
    // Só o que cabe na caixa: quem decide se o CPF vale é `shared/documento`, com ou sem pontuação.
    limiteDoCpfComMascara: TAMANHO_DO_CPF_COM_MASCARA,
    valores,
    erros,
  });

rotasSecretaria.get(ROTAS.secretaria.responsaveis.padrao, (c) => telaDeResponsaveis(c));

rotasSecretaria.get(ROTAS.secretaria.responsavelNovo.padrao, (c) =>
  formDeResponsavel(c, VALORES_INICIAIS.responsavel, []));

rotasSecretaria.post(ROTAS.secretaria.responsaveis.padrao, async (c) => {
  const corpo = c.get(VARIAVEIS_DE_CONTEXTO.corpo);
  const valores = {
    nome: texto(corpo, CAMPOS.responsavel.nome),
    email: texto(corpo, CAMPOS.responsavel.email),
    telefone: texto(corpo, CAMPOS.responsavel.telefone),
    cpf: texto(corpo, CAMPOS.responsavel.cpf),
  };
  const resultado = await academico.cadastrarResponsavel({ redeId: redeAtual(c), ...valores });
  if (resultado.ok) {
    return concluir(c, ROTAS.secretaria.responsaveis(), AVISOS.responsavelCadastrado);
  }
  return formDeResponsavel(c, valores, resultado.erros);
});

/* --- Turmas ----------------------------------------------------------------- */

const telaDeTurmas = async (c: Contexto): Promise<Response> => {
  const redeId = redeAtual(c);
  const unidades = unidadesDaSecretaria(c);
  const anosLetivos = await academico.listarAnosLetivos(redeId);

  // Filtro fora do alcance não filtra por ele: vale como "todas", e nunca vira consulta.
  const unidadeId = escolhido(c.req.query(PARAMETROS.unidade), idsDe(unidades));
  const anoLetivoId = escolhido(c.req.query(PARAMETROS.ano), anosLetivos.map(({ id }) => id));
  const alvo = unidadeId === null ? unidades : unidades.filter(({ id }) => id === unidadeId);

  // A ordenação é a da consulta — série e nome. Reordenar por unidade em memória valeria só para
  // as vinte linhas da página, e a segunda página começaria de novo pela primeira unidade.
  const pagina = await academico.paginaDeTurmas(
    redeId,
    { unidadeIds: idsDe(alvo), ...(anoLetivoId === null ? {} : { anoLetivoId }) },
    paginaDaQuery(c),
  );

  const anoPorId = new Map(anosLetivos.map((anoLetivo) => [anoLetivo.id, anoLetivo.ano]));
  const nomePorUnidade = new Map(unidades.map(({ id, nome }) => [id, nome]));

  return renderizar(c, TEMPLATES.secretaria.turmas, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.turmas,
    // O `name` de cada seletor do filtro é o parâmetro que esta mesma rota lê de volta acima.
    campoDaUnidade: PARAMETROS.unidade,
    campoDoAno: PARAMETROS.ano,
    unidades,
    anosLetivos,
    filtro: { unidadeId: unidadeId ?? '', anoLetivoId: anoLetivoId ?? '' },
    turmas: pagina.itens.map((turma) => turmaEmLista(turma, anoPorId, nomePorUnidade)),
    navegacao: navegacao(c, pagina),
  });
};

/**
 * O formulário precisa das unidades do alcance e dos anos letivos, mas não da página de turmas:
 * recusar um nome repetido deixou de custar a consulta que monta a lista.
 */
const formDeTurma = async (c: Contexto, valores: Valores, erros: Erros): Promise<Response> =>
  renderizar(c, TEMPLATES.secretaria.turmaNova, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.turmaNova,
    limiteDoNome: LIMITES_DO_ACADEMICO.turma.nome,
    limiteDaSerie: LIMITES_DO_ACADEMICO.turma.serie,
    unidades: unidadesDaSecretaria(c),
    anosLetivos: await academico.listarAnosLetivos(redeAtual(c)),
    turnos: TURNOS,
    valores,
    erros,
  });

rotasSecretaria.get(ROTAS.secretaria.turmas.padrao, (c) => telaDeTurmas(c));

rotasSecretaria.get(ROTAS.secretaria.turmaNova.padrao, (c) =>
  formDeTurma(c, VALORES_INICIAIS.turma, []));

rotasSecretaria.post(ROTAS.secretaria.turmas.padrao, async (c) => {
  const corpo = c.get(VARIAVEIS_DE_CONTEXTO.corpo);
  const valores = {
    nome: texto(corpo, CAMPOS.turma.nome),
    serie: texto(corpo, CAMPOS.turma.serie),
    turno: texto(corpo, CAMPOS.turma.turno),
    unidadeId: texto(corpo, CAMPOS.turma.unidadeId),
    anoLetivoId: texto(corpo, CAMPOS.turma.anoLetivoId),
  };
  const unidades = unidadesDaSecretaria(c);
  if (valores.unidadeId !== '' && !unidades.some(({ id }) => id === valores.unidadeId)) {
    return naoEncontrado(c);
  }

  const resultado = await academico.cadastrarTurma({ redeId: redeAtual(c), ...valores });
  if (resultado.ok) {
    return concluir(c, ROTAS.secretaria.turma({ id: resultado.valor.id }), AVISOS.turmaCadastrada);
  }
  return formDeTurma(c, valores, resultado.erros);
});

/** O cabeçalho da turma, do jeito que as duas telas dela mostram. */
const turmaParaTela = async (c: Contexto, turma: Turma): Promise<TurmaEmLista> => {
  const anosLetivos = await academico.listarAnosLetivos(redeAtual(c));
  const anoPorId = new Map(anosLetivos.map((anoLetivo) => [anoLetivo.id, anoLetivo.ano]));
  const nomePorUnidade = new Map(unidadesDaSecretaria(c).map(({ id, nome }) => [id, nome]));
  return turmaEmLista(turma, anoPorId, nomePorUnidade);
};

/** Duas tabelas, dois parâmetros: `pDisciplinas` para as alocações e `pMatriculas` para a turma. */
const telaDaTurma = async (c: Contexto, turma: Turma): Promise<Response> => {
  const redeId = redeAtual(c);
  const [alocacoes, matriculas] = await Promise.all([
    academico.paginaDeTurmaDisciplinas(
      redeId,
      turma.id,
      paginaDaQuery(c, PARAMETROS.paginaDeDisciplinas),
    ),
    academico.paginaDeMatriculasAtivasDaTurma(
      redeId,
      turma.id,
      paginaDaQuery(c, PARAMETROS.paginaDeMatriculas),
    ),
  ]);
  // Uma consulta por tela, não uma por linha: o professor alocado pode já não estar na unidade.
  const nomes = await identidade.nomesDeUsuarios(
    redeId,
    alocacoes.itens.map((a) => a.professorUsuarioId),
  );

  return renderizar(c, TEMPLATES.secretaria.turma, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.turma(turma.nome),
    turma: await turmaParaTela(c, turma),
    alocacoes: alocacoes.itens.map((alocacao) => ({
      id: alocacao.id,
      disciplinaNome: alocacao.disciplinaNome,
      professorNome: nomes.get(alocacao.professorUsuarioId) ?? AUSENTE,
    })),
    navegacaoAlocacoes: navegacao(c, alocacoes, PARAMETROS.paginaDeDisciplinas),
    matriculas: matriculas.itens.map(matriculaEmLista),
    navegacaoMatriculas: navegacao(c, matriculas, PARAMETROS.paginaDeMatriculas),
  });
};

rotasSecretaria.get(ROTAS.secretaria.turma.padrao, async (c) => {
  const turma = await turmaNoAlcance(c, c.req.param(PARAMETROS_DE_ROTA.id));
  return turma === null ? naoEncontrado(c) : await telaDaTurma(c, turma);
});

/** Só quem tem papel de professor na unidade desta turma pode ser alocado nela. */
const formDeAlocacao = async (
  c: Contexto,
  turma: Turma,
  valores: Valores,
  erros: Erros,
): Promise<Response> => {
  const redeId = redeAtual(c);
  const [disciplinas, professores] = await Promise.all([
    academico.listarDisciplinas(redeId),
    identidade.professoresDaUnidade(redeId, turma.unidadeId),
  ]);
  return renderizar(c, TEMPLATES.secretaria.turmaDisciplinaNova, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.alocar,
    turma: await turmaParaTela(c, turma),
    disciplinas,
    professores,
    valores,
    erros,
  });
};

rotasSecretaria.get(ROTAS.secretaria.turmaDisciplinaNova.padrao, async (c) => {
  const turma = await turmaNoAlcance(c, c.req.param(PARAMETROS_DE_ROTA.id));
  if (turma === null) return naoEncontrado(c);
  return await formDeAlocacao(c, turma, { disciplinaId: '', professorUsuarioId: '' }, []);
});

rotasSecretaria.post(ROTAS.secretaria.turmaDisciplinas.padrao, async (c) => {
  const turmaId = c.req.param(PARAMETROS_DE_ROTA.id);
  const turma = await turmaNoAlcance(c, turmaId);
  if (turma === null) return naoEncontrado(c);

  const corpo = c.get(VARIAVEIS_DE_CONTEXTO.corpo);
  const valores = {
    disciplinaId: texto(corpo, CAMPOS.alocacao.disciplinaId),
    professorUsuarioId: texto(corpo, CAMPOS.alocacao.professorUsuarioId),
  };
  const resultado = await academico.alocarProfessor({ redeId: redeAtual(c), turmaId, ...valores });
  if (resultado.ok) {
    return concluir(c, ROTAS.secretaria.turma({ id: turmaId }), AVISOS.disciplinaAlocada);
  }
  return await formDeAlocacao(c, turma, valores, resultado.erros);
});

/* --- Disciplinas ------------------------------------------------------------ */

const telaDeDisciplinas = async (c: Contexto): Promise<Response> => {
  const pagina = await academico.paginaDeDisciplinas(redeAtual(c), paginaDaQuery(c));
  return renderizar(c, TEMPLATES.secretaria.disciplinas, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.disciplinas,
    disciplinas: pagina.itens,
    navegacao: navegacao(c, pagina),
  });
};

const formDeDisciplina = (c: Contexto, valores: Valores, erros: Erros): Response =>
  renderizar(c, TEMPLATES.secretaria.disciplinaNova, {
    ...DA_CAMADA,
    titulo: TITULOS.secretaria.disciplinaNova,
    limiteDoNome: LIMITES_DO_ACADEMICO.disciplina.nome,
    valores,
    erros,
  });

rotasSecretaria.get(ROTAS.secretaria.disciplinas.padrao, (c) => telaDeDisciplinas(c));

rotasSecretaria.get(ROTAS.secretaria.disciplinaNova.padrao, (c) =>
  formDeDisciplina(c, VALORES_INICIAIS.disciplina, []));

rotasSecretaria.post(ROTAS.secretaria.disciplinas.padrao, async (c) => {
  const valores = { nome: texto(c.get(VARIAVEIS_DE_CONTEXTO.corpo), CAMPOS.disciplina.nome) };
  const resultado = await academico.cadastrarDisciplina({ redeId: redeAtual(c), ...valores });
  if (resultado.ok) {
    return concluir(c, ROTAS.secretaria.disciplinas(), AVISOS.disciplinaCadastrada);
  }
  return formDeDisciplina(c, valores, resultado.erros);
});
