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
} from '../../shared/constants';
import {
  ehIdentificador,
  exigirPapel,
  redeAtual,
  usuarioAtual,
  type CorpoDeFormulario,
  type Variaveis,
} from '../../shared/http';
import { fatiar } from '../../shared/pagination';
import { clockDoSistema } from '../../shared/ports';
import type { ErroDeAplicacao } from '../../shared/result';
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

type TurmaEmLista = {
  id: string;
  nome: string;
  serie: string;
  turno: string;
  anoLetivoId: string;
  unidadeNome: string;
  ano: number | null;
};

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

const DA_CAMADA = {
  parciais: TEMPLATES.parciais,
  sufixos: SUFIXOS_DE_ID,
  semValor: AUSENTE,
  opcaoVazia: APRESENTACAO.opcaoVazia,
} as const;

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

rotasSecretaria.get(ROTAS.secretaria.alunos.padrao, async (c) => {
  const redeId = redeAtual(c);
  const termo = (c.req.query(PARAMETROS.busca) ?? '').trim();
  const pagina =
    termo === ''
      ? fatiar<Aluno>([], 1)
      : await academico.paginaDeAlunos(redeId, termo, paginaDaQuery(c));
  const encontrados = pagina.itens;

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
    campoDaBusca: PARAMETROS.busca,
    limiteDoNome: LIMITES_DO_ACADEMICO.aluno.nome,
    linhasPorPagina: pagina.tamanho,
    termo,
    buscou: termo !== '',
    alunos,
    navegacao: navegacao(c, pagina),
  });
});

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

const telaDeTurmas = async (c: Contexto): Promise<Response> => {
  const redeId = redeAtual(c);
  const unidades = unidadesDaSecretaria(c);
  const anosLetivos = await academico.listarAnosLetivos(redeId);

  const unidadeId = escolhido(c.req.query(PARAMETROS.unidade), idsDe(unidades));
  const anoLetivoId = escolhido(c.req.query(PARAMETROS.ano), anosLetivos.map(({ id }) => id));
  const alvo = unidadeId === null ? unidades : unidades.filter(({ id }) => id === unidadeId);

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
    campoDaUnidade: PARAMETROS.unidade,
    campoDoAno: PARAMETROS.ano,
    unidades,
    anosLetivos,
    filtro: { unidadeId: unidadeId ?? '', anoLetivoId: anoLetivoId ?? '' },
    turmas: pagina.itens.map((turma) => turmaEmLista(turma, anoPorId, nomePorUnidade)),
    navegacao: navegacao(c, pagina),
  });
};

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

const turmaParaTela = async (c: Contexto, turma: Turma): Promise<TurmaEmLista> => {
  const anosLetivos = await academico.listarAnosLetivos(redeAtual(c));
  const anoPorId = new Map(anosLetivos.map((anoLetivo) => [anoLetivo.id, anoLetivo.ano]));
  const nomePorUnidade = new Map(unidadesDaSecretaria(c).map(({ id, nome }) => [id, nome]));
  return turmaEmLista(turma, anoPorId, nomePorUnidade);
};

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
