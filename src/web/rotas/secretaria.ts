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
import { academico, type Matricula, type Turma } from '../../academico';
import { identidade } from '../../identidade';
import {
  exigirPapel,
  redeAtual,
  usuarioAtual,
  type CorpoDeFormulario,
  type Variaveis,
} from '../../shared/http';
import { clockDoSistema } from '../../shared/ports';
import type { ErroDeAplicacao } from '../../shared/resultado';
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

/**
 * O acadêmico compara id com coluna `uuid`: um `:id` digitado à mão viraria erro de conversão do
 * PostgreSQL, isto é, 500 no lugar de 404. A borda recusa antes de chegar lá.
 */
const FORMATO_DE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ehIdentificador = (valor: string): boolean => FORMATO_DE_ID.test(valor);

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

const turmasDoAlcance = async (
  redeId: string,
  unidades: readonly Unidade[],
  anoLetivoId: string | null,
): Promise<Turma[]> => {
  const listas = await Promise.all(unidades.map(({ id }) =>
    academico.listarTurmas(redeId, anoLetivoId === null ? { unidadeId: id } : { unidadeId: id, anoLetivoId })));
  return listas.flat();
};

const matriculasAtivasDoAlcance = async (redeId: string, turmas: readonly Turma[]): Promise<Matricula[]> => {
  const listas = await Promise.all(turmas.map(({ id }) => academico.matriculasAtivasDaTurma(redeId, id)));
  return listas.flat();
};

const turmaNoAlcance = async (c: Contexto, turmaId: string): Promise<Turma | null> => {
  if (!ehIdentificador(turmaId)) return null;
  const turma = await academico.turmaPorId(redeAtual(c), turmaId);
  if (turma === null) return null;
  return unidadesDaSecretaria(c).some(({ id }) => id === turma.unidadeId) ? turma : null;
};

/**
 * O histórico de matrículas de um aluno. Com responsável vinculado, o próprio módulo devolve tudo
 * — todos os anos, todas as situações. Sem nenhum vínculo, o que resta alcançar são as matrículas
 * ativas das turmas sob a secretaria.
 */
const matriculasDoAluno = async (
  redeId: string,
  alunoId: string,
  vinculos: readonly { responsavelId: string }[],
  turmas: readonly Turma[],
): Promise<Matricula[]> => {
  const listas = vinculos.length > 0
    ? await Promise.all(vinculos.map((v) => academico.matriculasDoResponsavel(redeId, v.responsavelId)))
    : [await matriculasAtivasDoAlcance(redeId, turmas)];

  const encontradas = new Map<string, Matricula>();
  for (const matricula of listas.flat()) {
    if (matricula.alunoId === alunoId) encontradas.set(matricula.id, matricula);
  }
  return [...encontradas.values()]
    .sort((a, b) => b.ano - a.ano || b.dataMatricula.localeCompare(a.dataMatricula));
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

rotasSecretaria.get('/', async (c) => {
  const redeId = redeAtual(c);
  const unidades = unidadesDaSecretaria(c);
  const [anosLetivos, disciplinas, turmas, gruposDeResponsaveis] = await Promise.all([
    academico.listarAnosLetivos(redeId),
    academico.listarDisciplinas(redeId),
    turmasDoAlcance(redeId, unidades, null),
    Promise.all(unidades.map(({ id }) => academico.responsaveisDaUnidade(redeId, id))),
  ]);
  const matriculas = await matriculasAtivasDoAlcance(redeId, turmas);

  const contagens = unidades.map((unidade, posicao) => ({
    nome: unidade.nome,
    turmas: turmas.filter((turma) => turma.unidadeId === unidade.id).length,
    matriculas: matriculas.filter((matricula) => matricula.unidadeId === unidade.id).length,
    responsaveis: (gruposDeResponsaveis[posicao] ?? []).length,
  }));

  return renderizar(c, '/secretaria/painel', {
    titulo: 'Painel da secretaria',
    unidades: contagens,
    anoCorrente: anosLetivos[0] ?? null,
    totais: {
      turmas: turmas.length,
      matriculas: matriculas.length,
      responsaveis: new Set(gruposDeResponsaveis.flat().map(({ id }) => id)).size,
      disciplinas: disciplinas.length,
    },
  });
});

/* --- Alunos ----------------------------------------------------------------- */

rotasSecretaria.get('/alunos', async (c) => {
  const redeId = redeAtual(c);
  const termo = (c.req.query('q') ?? '').trim();
  const encontrados = termo === '' ? [] : await academico.buscarAlunos(redeId, termo);
  const turmas = encontrados.length === 0 ? [] : await turmasDoAlcance(redeId, unidadesDaSecretaria(c), null);
  const ativas = await matriculasAtivasDoAlcance(redeId, turmas);
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

  return renderizar(c, '/secretaria/alunos', { titulo: 'Alunos', termo, buscou: termo !== '', alunos });
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

/** Tudo o que a ficha mostra. Devolve `null` quando o aluno não existe ou está fora do alcance. */
const fichaDoAluno = async (c: Contexto, alunoId: string): Promise<Dados | null> => {
  if (!ehIdentificador(alunoId)) return null;
  const redeId = redeAtual(c);
  const unidades = unidadesDaSecretaria(c);

  const [aluno, vinculos, responsaveis, anosLetivos, turmas] = await Promise.all([
    academico.alunoPorId(redeId, alunoId),
    academico.responsaveisDoAluno(redeId, alunoId),
    academico.listarResponsaveis(redeId),
    academico.listarAnosLetivos(redeId),
    turmasDoAlcance(redeId, unidades, null),
  ]);
  if (aluno === null) return null;

  const matriculas = await matriculasDoAluno(redeId, alunoId, vinculos, turmas);
  const doAlcance = matriculas.filter((m) => unidades.some(({ id }) => id === m.unidadeId));
  // Aluno que estuda em outra unidade da rede não é assunto desta secretaria — e ela não fica
  // sabendo que ele existe. Aluno ainda sem matrícula é da rede: aparece para todas.
  if (matriculas.length > 0 && doAlcance.length === 0) return null;

  const anoPorId = new Map(anosLetivos.map((anoLetivo) => [anoLetivo.id, anoLetivo.ano]));
  const nomePorUnidade = new Map(unidades.map(({ id, nome }) => [id, nome]));
  const ativa = doAlcance.find((matricula) => matricula.situacao === 'ativa') ?? null;

  return {
    titulo: 'Ficha do aluno',
    aluno,
    vinculos,
    responsaveis,
    anosLetivos,
    turmas: turmas.map((turma) => turmaEmLista(turma, anoPorId, nomePorUnidade)),
    matriculas: doAlcance.map(matriculaEmLista),
    ativa: ativa === null ? null : matriculaEmLista(ativa),
    hoje: hoje(),
  };
};

const renderizarFicha = (c: Contexto, ficha: Dados, valores: Valores, erros: Erros): Response =>
  renderizar(c, '/secretaria/aluno', { ...ficha, valores, erros });

rotasSecretaria.get('/alunos/:id', async (c) => {
  const ficha = await fichaDoAluno(c, c.req.param('id'));
  return ficha === null ? naoEncontrado(c) : renderizarFicha(c, ficha, {}, []);
});

rotasSecretaria.post('/alunos/:id/responsaveis', async (c) => {
  const alunoId = c.req.param('id');
  const ficha = await fichaDoAluno(c, alunoId);
  if (ficha === null) return naoEncontrado(c);

  const corpo = c.get('corpo');
  const valores = {
    responsavelId: texto(corpo, 'responsavelId'),
    parentesco: texto(corpo, 'parentesco'),
    financeiro: marcado(corpo, 'financeiro'),
  };
  const resultado = await academico.vincularResponsavel({ redeId: redeAtual(c), alunoId, ...valores });
  if (resultado.ok) return concluir(c, `${BASE}/alunos/${alunoId}`, 'Responsável vinculado.');
  return renderizarFicha(c, ficha, valores, resultado.erros);
});

/* --- Matrículas ------------------------------------------------------------- */

rotasSecretaria.post('/matriculas', async (c) => {
  const corpo = c.get('corpo');
  const alunoId = texto(corpo, 'alunoId');
  const ficha = await fichaDoAluno(c, alunoId);
  if (ficha === null) return naoEncontrado(c);

  const valores = {
    turmaId: texto(corpo, 'turmaId'),
    anoLetivoId: texto(corpo, 'anoLetivoId'),
    dataMatricula: texto(corpo, 'dataMatricula'),
  };
  // Turma de outra unidade responde 404 aqui, e não erro de campo: a tela não confirma que ela existe.
  if (valores.turmaId !== '' && (await turmaNoAlcance(c, valores.turmaId)) === null) {
    return naoEncontrado(c);
  }

  const resultado = await academico.matricular({ redeId: redeAtual(c), alunoId, ...valores });
  if (resultado.ok) return concluir(c, `${BASE}/alunos/${alunoId}`, 'Matrícula registrada.');
  return renderizarFicha(c, ficha, valores, resultado.erros);
});

rotasSecretaria.post('/matriculas/:id/transferir', async (c) => {
  const matriculaId = c.req.param('id');
  if (!ehIdentificador(matriculaId)) return naoEncontrado(c);

  const redeId = redeAtual(c);
  const matricula = await academico.matriculaPorId(redeId, matriculaId);
  const unidades = unidadesDaSecretaria(c);
  if (matricula === null || !unidades.some(({ id }) => id === matricula.unidadeId)) {
    return naoEncontrado(c);
  }
  const ficha = await fichaDoAluno(c, matricula.alunoId);
  if (ficha === null) return naoEncontrado(c);

  const corpo = c.get('corpo');
  const valores = { turmaDestinoId: texto(corpo, 'turmaDestinoId'), data: texto(corpo, 'data') };
  if (valores.turmaDestinoId !== '' && (await turmaNoAlcance(c, valores.turmaDestinoId)) === null) {
    return naoEncontrado(c);
  }

  const resultado = await academico.transferir({ redeId, matriculaId, ...valores });
  if (resultado.ok) return concluir(c, `${BASE}/alunos/${matricula.alunoId}`, 'Transferência concluída.');
  return renderizarFicha(c, ficha, valores, resultado.erros);
});

/* --- Responsáveis ----------------------------------------------------------- */

const paginaDeResponsaveis = async (c: Contexto, valores: Valores, erros: Erros): Promise<Response> =>
  renderizar(c, '/secretaria/responsaveis', {
    titulo: 'Responsáveis',
    responsaveis: await academico.listarResponsaveis(redeAtual(c)),
    valores,
    erros,
  });

rotasSecretaria.get('/responsaveis', (c) =>
  paginaDeResponsaveis(c, { nome: '', email: '', telefone: '' }, []));

rotasSecretaria.post('/responsaveis', async (c) => {
  const corpo = c.get('corpo');
  const valores = {
    nome: texto(corpo, 'nome'),
    email: texto(corpo, 'email'),
    telefone: texto(corpo, 'telefone'),
  };
  const resultado = await academico.cadastrarResponsavel({ redeId: redeAtual(c), ...valores });
  if (resultado.ok) return concluir(c, `${BASE}/responsaveis`, 'Responsável cadastrado.');
  return paginaDeResponsaveis(c, valores, resultado.erros);
});

/* --- Turmas ----------------------------------------------------------------- */

const paginaDeTurmas = async (c: Contexto, valores: Valores, erros: Erros): Promise<Response> => {
  const redeId = redeAtual(c);
  const unidades = unidadesDaSecretaria(c);
  const anosLetivos = await academico.listarAnosLetivos(redeId);

  // Filtro fora do alcance não filtra por ele: vale como "todas", e nunca vira consulta.
  const unidadeId = escolhido(c.req.query('unidade'), unidades.map(({ id }) => id));
  const anoLetivoId = escolhido(c.req.query('ano'), anosLetivos.map(({ id }) => id));
  const alvo = unidadeId === null ? unidades : unidades.filter(({ id }) => id === unidadeId);
  const turmas = await turmasDoAlcance(redeId, alvo, anoLetivoId);

  const anoPorId = new Map(anosLetivos.map((anoLetivo) => [anoLetivo.id, anoLetivo.ano]));
  const nomePorUnidade = new Map(unidades.map(({ id, nome }) => [id, nome]));

  return renderizar(c, '/secretaria/turmas', {
    titulo: 'Turmas',
    unidades,
    anosLetivos,
    turnos: TURNOS,
    filtro: { unidadeId: unidadeId ?? '', anoLetivoId: anoLetivoId ?? '' },
    turmas: turmas.map((turma) => turmaEmLista(turma, anoPorId, nomePorUnidade))
      .sort((a, b) => String(a.unidadeNome).localeCompare(String(b.unidadeNome), 'pt-BR')),
    valores,
    erros,
  });
};

rotasSecretaria.get('/turmas', (c) =>
  paginaDeTurmas(c, { nome: '', serie: '', turno: '', unidadeId: '', anoLetivoId: '' }, []));

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
  return paginaDeTurmas(c, valores, resultado.erros);
});

const paginaDaTurma = async (
  c: Contexto,
  turmaId: string,
  valores: Valores,
  erros: Erros,
): Promise<Response | null> => {
  const turma = await turmaNoAlcance(c, turmaId);
  if (turma === null) return null;

  const redeId = redeAtual(c);
  const [alocacoes, disciplinas, professores, matriculas, anosLetivos] = await Promise.all([
    academico.listarTurmaDisciplinas(redeId, turma.id),
    academico.listarDisciplinas(redeId),
    identidade.professoresDaUnidade(redeId, turma.unidadeId),
    academico.matriculasAtivasDaTurma(redeId, turma.id),
    academico.listarAnosLetivos(redeId),
  ]);
  // Uma consulta por tela, não uma por linha: o professor alocado pode já não estar na unidade.
  const nomes = await identidade.nomesDeUsuarios(redeId, alocacoes.map((a) => a.professorUsuarioId));
  const anoPorId = new Map(anosLetivos.map((anoLetivo) => [anoLetivo.id, anoLetivo.ano]));
  const nomePorUnidade = new Map(unidadesDaSecretaria(c).map(({ id, nome }) => [id, nome]));

  return renderizar(c, '/secretaria/turma', {
    titulo: `Turma ${turma.nome}`,
    turma: turmaEmLista(turma, anoPorId, nomePorUnidade),
    alocacoes: alocacoes.map((alocacao) => ({
      id: alocacao.id,
      disciplinaNome: alocacao.disciplinaNome,
      professorNome: nomes.get(alocacao.professorUsuarioId) ?? '—',
    })),
    disciplinas,
    professores,
    matriculas: matriculas.map(matriculaEmLista),
    valores,
    erros,
  });
};

rotasSecretaria.get('/turmas/:id', async (c) => {
  const pagina = await paginaDaTurma(c, c.req.param('id'), { disciplinaId: '', professorUsuarioId: '' }, []);
  return pagina ?? naoEncontrado(c);
});

rotasSecretaria.post('/turmas/:id/disciplinas', async (c) => {
  const turmaId = c.req.param('id');
  if ((await turmaNoAlcance(c, turmaId)) === null) return naoEncontrado(c);

  const corpo = c.get('corpo');
  const valores = {
    disciplinaId: texto(corpo, 'disciplinaId'),
    professorUsuarioId: texto(corpo, 'professorUsuarioId'),
  };
  const resultado = await academico.alocarProfessor({ redeId: redeAtual(c), turmaId, ...valores });
  if (resultado.ok) return concluir(c, `${BASE}/turmas/${turmaId}`, 'Disciplina alocada.');
  return (await paginaDaTurma(c, turmaId, valores, resultado.erros)) ?? naoEncontrado(c);
});

/* --- Disciplinas ------------------------------------------------------------ */

const paginaDeDisciplinas = async (c: Contexto, valores: Valores, erros: Erros): Promise<Response> =>
  renderizar(c, '/secretaria/disciplinas', {
    titulo: 'Disciplinas',
    disciplinas: await academico.listarDisciplinas(redeAtual(c)),
    valores,
    erros,
  });

rotasSecretaria.get('/disciplinas', (c) => paginaDeDisciplinas(c, { nome: '' }, []));

rotasSecretaria.post('/disciplinas', async (c) => {
  const valores = { nome: texto(c.get('corpo'), 'nome') };
  const resultado = await academico.cadastrarDisciplina({ redeId: redeAtual(c), ...valores });
  if (resultado.ok) return concluir(c, `${BASE}/disciplinas`, 'Disciplina cadastrada.');
  return paginaDeDisciplinas(c, valores, resultado.erros);
});
