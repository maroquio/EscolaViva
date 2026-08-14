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
import { academico, type Aluno, type AnoLetivo, type Matricula, type Turma } from '../../academico';
import { identidade } from '../../identidade';
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
import { navegacao, paginaDaQuery } from '../paginacao';
import { renderizar, renderizarErro } from '../render';

type Contexto = Context<{ Variables: Variaveis }>;
type Valores = Record<string, string | boolean>;
type Erros = readonly ErroDeAplicacao[];
type Unidade = { id: string; nome: string };
type Dados = Record<string, unknown>;

const PAPEL = 'secretaria' as const;
const BASE = '/secretaria';
const REDIRECIONAMENTO = 303;

const NOME_DO_TURNO: Record<string, string> = {
  matutino: 'Matutino', vespertino: 'Vespertino', noturno: 'Noturno', integral: 'Integral',
};
const TURNOS = Object.entries(NOME_DO_TURNO).map(([valor, nome]) => ({ valor, nome }));

const NOME_DA_SITUACAO: Record<string, string> = {
  ativa: 'Ativa', transferida: 'Transferida', cancelada: 'Cancelada', concluida: 'Concluída',
};

const hoje = (): string => clockDoSistema.agora().toISOString().slice(0, 10);
const porNome = (a: Unidade, b: Unidade): number => a.nome.localeCompare(b.nome, 'pt-BR');

const texto = (corpo: CorpoDeFormulario, campo: string): string => {
  const valor = corpo[campo];
  return typeof valor === 'string' ? valor.trim() : '';
};

const marcado = (corpo: CorpoDeFormulario, campo: string): boolean => texto(corpo, campo) !== '';

const escolhido = (valor: string | undefined, permitidos: readonly string[]): string | null =>
  valor !== undefined && permitidos.includes(valor) ? valor : null;

const concluir = (c: Contexto, destino: string, mensagem: string): Response =>
  c.redirect(`${destino}?ok=${encodeURIComponent(mensagem)}`, REDIRECIONAMENTO);

const naoEncontrado = (c: Contexto): Response =>
  renderizarErro(c, 404, 'Registro não encontrado',
    'O endereço não existe, ou o registro pertence a outra unidade. Use o menu para voltar a uma tela conhecida.');

/* --- Alcance da secretaria -------------------------------------------------- */

/** As unidades em que a pessoa é secretaria: o limite de tudo o que ela lê e escreve aqui. */
const unidadesDaSecretaria = (c: Contexto): Unidade[] => {
  const nomePorId = new Map<string, string>();
  for (const atribuicao of usuarioAtual(c).papeis) {
    if (atribuicao.papel === PAPEL) nomePorId.set(atribuicao.unidadeId, atribuicao.unidadeNome);
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

const turmaEmLista = (turma: Turma, ano: ReadonlyMap<string, number>, unidade: ReadonlyMap<string, string>): Dados => ({
  id: turma.id,
  nome: turma.nome,
  serie: turma.serie,
  turno: NOME_DO_TURNO[turma.turno] ?? turma.turno,
  anoLetivoId: turma.anoLetivoId,
  unidadeNome: unidade.get(turma.unidadeId) ?? '—',
  ano: ano.get(turma.anoLetivoId) ?? null,
});

const matriculaEmLista = (matricula: Matricula): Dados => ({
  ...matricula,
  situacaoNome: NOME_DA_SITUACAO[matricula.situacao] ?? matricula.situacao,
});

export const rotasSecretaria = new Hono<{ Variables: Variaveis }>();

rotasSecretaria.use(exigirPapel(PAPEL));

/* --- Painel ----------------------------------------------------------------- */

/**
 * A tabela do painel é a única do sistema recortada em memória, e por um motivo que não vale para
 * as outras: as unidades vêm dos papéis da sessão, não de uma consulta — não existe SQL onde
 * pendurar o LIMIT. O que era caro aqui não era a lista de unidades, e sim as contagens: uma
 * consulta por unidade, mais uma por turma. Agora são três agregações, e só para a página aberta.
 */
rotasSecretaria.get('/', async (c) => {
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

  return renderizar(c, '/secretaria/painel', {
    titulo: 'Painel da secretaria',
    unidades: contagens,
    navegacao: navegacao(c, pagina),
    anoCorrente: anosLetivos[0] ?? null,
    totais,
  });
});

/* --- Alunos ----------------------------------------------------------------- */

rotasSecretaria.get('/alunos', async (c) => {
  const redeId = redeAtual(c);
  const termo = (c.req.query('q') ?? '').trim();
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

  return renderizar(c, '/secretaria/alunos', {
    titulo: 'Alunos',
    termo,
    buscou: termo !== '',
    alunos,
    navegacao: navegacao(c, pagina),
  });
});

rotasSecretaria.get('/alunos/novo', (c) =>
  renderizar(c, '/secretaria/aluno_novo', {
    titulo: 'Cadastrar aluno',
    valores: { nome: '', dataNascimento: '' },
    erros: [],
  }));

rotasSecretaria.post('/alunos', async (c) => {
  const corpo = c.get('corpo');
  const valores = { nome: texto(corpo, 'nome'), dataNascimento: texto(corpo, 'dataNascimento') };
  const resultado = await academico.cadastrarAluno({ redeId: redeAtual(c), ...valores });
  if (resultado.ok) return concluir(c, `${BASE}/alunos/${resultado.valor.id}`, 'Aluno cadastrado.');
  return renderizar(c, '/secretaria/aluno_novo', {
    titulo: 'Cadastrar aluno', valores, erros: resultado.erros,
  });
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
    academico.paginaDeResponsaveisDoAluno(redeId, alunoId, paginaDaQuery(c, 'pResponsaveis')),
    academico.paginaDeMatriculasDoAluno(redeId, alunoId, unidadeIds, paginaDaQuery(c, 'pMatriculas')),
    academico.matriculasAtivasDosAlunos(redeId, [alunoId], unidadeIds),
    academico.alunoTemMatricula(redeId, alunoId),
  ]);
  if (aluno === null) return null;
  if (temMatricula && historico.total === 0) return null;

  const ativa = ativas[0] ?? null;

  return {
    titulo: 'Ficha do aluno',
    aluno,
    vinculos: vinculos.itens,
    navegacaoVinculos: navegacao(c, vinculos, 'pResponsaveis'),
    matriculas: historico.itens.map(matriculaEmLista),
    navegacaoMatriculas: navegacao(c, historico, 'pMatriculas'),
    ativa: ativa === null ? null : matriculaEmLista(ativa),
  };
};

rotasSecretaria.get('/alunos/:id', async (c) => {
  const ficha = await fichaDoAluno(c, c.req.param('id'));
  return ficha === null ? naoEncontrado(c) : renderizar(c, '/secretaria/aluno', ficha);
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

  return renderizar(c, '/secretaria/aluno_responsavel_novo', {
    titulo: 'Vincular responsável',
    aluno,
    disponiveis: responsaveis.filter((pessoa) => !jaVinculados.has(pessoa.id)),
    temResponsaveis: responsaveis.length > 0,
    valores,
    erros,
  });
};

rotasSecretaria.get('/alunos/:id/responsaveis/novo', async (c) => {
  const aluno = await alunoNoAlcance(c, c.req.param('id'));
  return aluno === null ? naoEncontrado(c) : await formDeVinculo(c, aluno, {}, []);
});

rotasSecretaria.post('/alunos/:id/responsaveis', async (c) => {
  const aluno = await alunoNoAlcance(c, c.req.param('id'));
  if (aluno === null) return naoEncontrado(c);

  const corpo = c.get('corpo');
  const valores = {
    responsavelId: texto(corpo, 'responsavelId'),
    parentesco: texto(corpo, 'parentesco'),
    financeiro: marcado(corpo, 'financeiro'),
  };
  const resultado = await academico.vincularResponsavel({
    redeId: redeAtual(c),
    alunoId: aluno.id,
    ...valores,
  });
  if (resultado.ok) return concluir(c, `${BASE}/alunos/${aluno.id}`, 'Responsável vinculado.');
  return await formDeVinculo(c, aluno, valores, resultado.erros);
});

/* --- Matrículas ------------------------------------------------------------- */

/**
 * O que os dois seletores de turma precisam: as turmas do alcance, já com o ano e o nome da
 * unidade, e a lista de anos letivos — que sai da mesma consulta que nomeia o ano de cada turma.
 */
const opcoesDeTurma = async (c: Contexto): Promise<{ turmas: Dados[]; anosLetivos: AnoLetivo[] }> => {
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
  return renderizar(c, '/secretaria/aluno_matricula_nova', {
    titulo: 'Matricular em uma turma',
    aluno,
    turmas,
    anosLetivos,
    hoje: hoje(),
    valores,
    erros,
  });
};

rotasSecretaria.get('/alunos/:id/matricular', async (c) => {
  const aluno = await alunoNoAlcance(c, c.req.param('id'));
  return aluno === null ? naoEncontrado(c) : await formDeMatricula(c, aluno, {}, []);
});

rotasSecretaria.post('/matriculas', async (c) => {
  const corpo = c.get('corpo');
  const aluno = await alunoNoAlcance(c, texto(corpo, 'alunoId'));
  if (aluno === null) return naoEncontrado(c);

  const valores = {
    turmaId: texto(corpo, 'turmaId'),
    anoLetivoId: texto(corpo, 'anoLetivoId'),
    dataMatricula: texto(corpo, 'dataMatricula'),
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
  if (resultado.ok) return concluir(c, `${BASE}/alunos/${aluno.id}`, 'Matrícula registrada.');
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
  return renderizar(c, '/secretaria/matricula_transferencia', {
    titulo: 'Transferir de turma',
    aluno,
    ativa: matriculaEmLista(matricula),
    turmas: turmas.filter((turma) => turma['id'] !== matricula.turmaId),
    hoje: hoje(),
    valores,
    erros,
  });
};

rotasSecretaria.get('/matriculas/:id/transferir', async (c) => {
  const alvo = await transferenciaNoAlcance(c, c.req.param('id'));
  if (alvo === null) return naoEncontrado(c);
  return await formDeTransferencia(c, alvo.matricula, alvo.aluno, {}, []);
});

rotasSecretaria.post('/matriculas/:id/transferir', async (c) => {
  const matriculaId = c.req.param('id');
  const alvo = await transferenciaNoAlcance(c, matriculaId);
  if (alvo === null) return naoEncontrado(c);

  const corpo = c.get('corpo');
  const valores = { turmaDestinoId: texto(corpo, 'turmaDestinoId'), data: texto(corpo, 'data') };
  if (valores.turmaDestinoId !== '' && (await turmaNoAlcance(c, valores.turmaDestinoId)) === null) {
    return naoEncontrado(c);
  }

  const resultado = await academico.transferir({ redeId: redeAtual(c), matriculaId, ...valores });
  if (resultado.ok) {
    return concluir(c, `${BASE}/alunos/${alvo.aluno.id}`, 'Transferência concluída.');
  }
  return await formDeTransferencia(c, alvo.matricula, alvo.aluno, valores, resultado.erros);
});

/* --- Responsáveis ----------------------------------------------------------- */

const telaDeResponsaveis = async (c: Contexto): Promise<Response> => {
  const pagina = await academico.paginaDeResponsaveis(redeAtual(c), paginaDaQuery(c));
  return renderizar(c, '/secretaria/responsaveis', {
    titulo: 'Responsáveis',
    responsaveis: pagina.itens,
    navegacao: navegacao(c, pagina),
  });
};

const formDeResponsavel = (c: Contexto, valores: Valores, erros: Erros): Response =>
  renderizar(c, '/secretaria/responsavel_novo', {
    titulo: 'Cadastrar responsável',
    valores,
    erros,
  });

rotasSecretaria.get('/responsaveis', (c) => telaDeResponsaveis(c));

rotasSecretaria.get('/responsaveis/novo', (c) =>
  formDeResponsavel(c, { nome: '', email: '', telefone: '', cpf: '' }, []));

rotasSecretaria.post('/responsaveis', async (c) => {
  const corpo = c.get('corpo');
  const valores = {
    nome: texto(corpo, 'nome'),
    email: texto(corpo, 'email'),
    telefone: texto(corpo, 'telefone'),
    cpf: texto(corpo, 'cpf'),
  };
  const resultado = await academico.cadastrarResponsavel({ redeId: redeAtual(c), ...valores });
  if (resultado.ok) return concluir(c, `${BASE}/responsaveis`, 'Responsável cadastrado.');
  return formDeResponsavel(c, valores, resultado.erros);
});

/* --- Turmas ----------------------------------------------------------------- */

const telaDeTurmas = async (c: Contexto): Promise<Response> => {
  const redeId = redeAtual(c);
  const unidades = unidadesDaSecretaria(c);
  const anosLetivos = await academico.listarAnosLetivos(redeId);

  // Filtro fora do alcance não filtra por ele: vale como "todas", e nunca vira consulta.
  const unidadeId = escolhido(c.req.query('unidade'), idsDe(unidades));
  const anoLetivoId = escolhido(c.req.query('ano'), anosLetivos.map(({ id }) => id));
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

  return renderizar(c, '/secretaria/turmas', {
    titulo: 'Turmas',
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
  renderizar(c, '/secretaria/turma_nova', {
    titulo: 'Cadastrar turma',
    unidades: unidadesDaSecretaria(c),
    anosLetivos: await academico.listarAnosLetivos(redeAtual(c)),
    turnos: TURNOS,
    valores,
    erros,
  });

rotasSecretaria.get('/turmas', (c) => telaDeTurmas(c));

rotasSecretaria.get('/turmas/nova', (c) =>
  formDeTurma(c, { nome: '', serie: '', turno: '', unidadeId: '', anoLetivoId: '' }, []));

rotasSecretaria.post('/turmas', async (c) => {
  const corpo = c.get('corpo');
  const valores = {
    nome: texto(corpo, 'nome'),
    serie: texto(corpo, 'serie'),
    turno: texto(corpo, 'turno'),
    unidadeId: texto(corpo, 'unidadeId'),
    anoLetivoId: texto(corpo, 'anoLetivoId'),
  };
  const unidades = unidadesDaSecretaria(c);
  if (valores.unidadeId !== '' && !unidades.some(({ id }) => id === valores.unidadeId)) {
    return naoEncontrado(c);
  }

  const resultado = await academico.cadastrarTurma({ redeId: redeAtual(c), ...valores });
  if (resultado.ok) return concluir(c, `${BASE}/turmas/${resultado.valor.id}`, 'Turma cadastrada.');
  return formDeTurma(c, valores, resultado.erros);
});

/** O cabeçalho da turma, do jeito que as duas telas dela mostram. */
const turmaParaTela = async (c: Contexto, turma: Turma): Promise<Dados> => {
  const anosLetivos = await academico.listarAnosLetivos(redeAtual(c));
  const anoPorId = new Map(anosLetivos.map((anoLetivo) => [anoLetivo.id, anoLetivo.ano]));
  const nomePorUnidade = new Map(unidadesDaSecretaria(c).map(({ id, nome }) => [id, nome]));
  return turmaEmLista(turma, anoPorId, nomePorUnidade);
};

/** Duas tabelas, dois parâmetros: `pDisciplinas` para as alocações e `pMatriculas` para a turma. */
const telaDaTurma = async (c: Contexto, turma: Turma): Promise<Response> => {
  const redeId = redeAtual(c);
  const [alocacoes, matriculas] = await Promise.all([
    academico.paginaDeTurmaDisciplinas(redeId, turma.id, paginaDaQuery(c, 'pDisciplinas')),
    academico.paginaDeMatriculasAtivasDaTurma(redeId, turma.id, paginaDaQuery(c, 'pMatriculas')),
  ]);
  // Uma consulta por tela, não uma por linha: o professor alocado pode já não estar na unidade.
  const nomes = await identidade.nomesDeUsuarios(
    redeId,
    alocacoes.itens.map((a) => a.professorUsuarioId),
  );

  return renderizar(c, '/secretaria/turma', {
    titulo: `Turma ${turma.nome}`,
    turma: await turmaParaTela(c, turma),
    alocacoes: alocacoes.itens.map((alocacao) => ({
      id: alocacao.id,
      disciplinaNome: alocacao.disciplinaNome,
      professorNome: nomes.get(alocacao.professorUsuarioId) ?? '—',
    })),
    navegacaoAlocacoes: navegacao(c, alocacoes, 'pDisciplinas'),
    matriculas: matriculas.itens.map(matriculaEmLista),
    navegacaoMatriculas: navegacao(c, matriculas, 'pMatriculas'),
  });
};

rotasSecretaria.get('/turmas/:id', async (c) => {
  const turma = await turmaNoAlcance(c, c.req.param('id'));
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
  return renderizar(c, '/secretaria/turma_disciplina_nova', {
    titulo: 'Alocar disciplina e professor',
    turma: await turmaParaTela(c, turma),
    disciplinas,
    professores,
    valores,
    erros,
  });
};

rotasSecretaria.get('/turmas/:id/disciplinas/nova', async (c) => {
  const turma = await turmaNoAlcance(c, c.req.param('id'));
  if (turma === null) return naoEncontrado(c);
  return await formDeAlocacao(c, turma, { disciplinaId: '', professorUsuarioId: '' }, []);
});

rotasSecretaria.post('/turmas/:id/disciplinas', async (c) => {
  const turmaId = c.req.param('id');
  const turma = await turmaNoAlcance(c, turmaId);
  if (turma === null) return naoEncontrado(c);

  const corpo = c.get('corpo');
  const valores = {
    disciplinaId: texto(corpo, 'disciplinaId'),
    professorUsuarioId: texto(corpo, 'professorUsuarioId'),
  };
  const resultado = await academico.alocarProfessor({ redeId: redeAtual(c), turmaId, ...valores });
  if (resultado.ok) return concluir(c, `${BASE}/turmas/${turmaId}`, 'Disciplina alocada.');
  return await formDeAlocacao(c, turma, valores, resultado.erros);
});

/* --- Disciplinas ------------------------------------------------------------ */

const telaDeDisciplinas = async (c: Contexto): Promise<Response> => {
  const pagina = await academico.paginaDeDisciplinas(redeAtual(c), paginaDaQuery(c));
  return renderizar(c, '/secretaria/disciplinas', {
    titulo: 'Disciplinas',
    disciplinas: pagina.itens,
    navegacao: navegacao(c, pagina),
  });
};

const formDeDisciplina = (c: Contexto, valores: Valores, erros: Erros): Response =>
  renderizar(c, '/secretaria/disciplina_nova', {
    titulo: 'Cadastrar disciplina',
    valores,
    erros,
  });

rotasSecretaria.get('/disciplinas', (c) => telaDeDisciplinas(c));

rotasSecretaria.get('/disciplinas/nova', (c) => formDeDisciplina(c, { nome: '' }, []));

rotasSecretaria.post('/disciplinas', async (c) => {
  const valores = { nome: texto(c.get('corpo'), 'nome') };
  const resultado = await academico.cadastrarDisciplina({ redeId: redeAtual(c), ...valores });
  if (resultado.ok) return concluir(c, `${BASE}/disciplinas`, 'Disciplina cadastrada.');
  return formDeDisciplina(c, valores, resultado.erros);
});
