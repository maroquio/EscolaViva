import { Hono, type Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { LIMITES_DO_ACADEMICO, academico, type Turma } from '../../academico';
import {
  IDENTITY_LIMITS,
  IDENTITY_VOCABULARY,
  ROLE,
  ROLES,
  identity,
  type Role,
} from '../../identity';
import { config } from '../../shared/config';
import { CONTEXT_VARIABLES, MASKED_CPF_LENGTH } from '../../shared/constants';
import {
  currentNetwork,
  isUuid,
  requireRole,
  type FormBody,
  type Variables,
} from '../../shared/http';
import { logger } from '../../shared/log';
import {
  ANO_EM_QUATRO_DIGITOS,
  AVISOS,
  CAMPOS,
  CODIGOS_DE_AVISO,
  COOKIE_DO_CONVITE,
  ERROS_DE_FORMULARIO,
  EVENTOS_DE_LOG,
  LINHAS_DE_ATRIBUICAO,
  MISSING_VALUE,
  PARAMETROS,
  ROTAS,
  SUFIXOS_DE_ID,
  TEMPLATES,
  TITULOS,
  VALORES_INICIAIS,
} from '../constantes';
import { navegacao, paginaDaQuery } from '../paginacao';
import { renderizar, type DadosDeTemplate } from '../render';

const MENSAGENS: Record<string, string> = {
  [CODIGOS_DE_AVISO.unidadeCriada]: AVISOS.unidadeCriada,
  [CODIGOS_DE_AVISO.usuarioConvidado]: AVISOS.usuarioConvidado,
  [CODIGOS_DE_AVISO.anoDefinido]: AVISOS.anoDefinido,
};

const PAPEIS_DA_TELA: readonly { valor: Role; rotulo: string }[] = ROLES.map((valor) => ({
  valor,
  rotulo: IDENTITY_VOCABULARY.role[valor],
}));

const PARCIAIS = { parciais: TEMPLATES.parciais };
const SUFIXOS = { sufixos: SUFIXOS_DE_ID };

export const rotasRede = new Hono<{ Variables: Variables }>();

rotasRede.use(requireRole(ROLE.networkAdmin));

const texto = (corpo: FormBody, campo: string): string => {
  const valor = corpo[campo];
  return typeof valor === 'string' ? valor.trim() : '';
};

const lista = (corpo: FormBody, campo: string): string[] => {
  const valor = corpo[campo];
  if (Array.isArray(valor)) return valor.map((item) => (typeof item === 'string' ? item.trim() : ''));
  return typeof valor === 'string' ? [valor.trim()] : [];
};

const mensagemDaQuery = (c: Context): string | undefined =>
  MENSAGENS[c.req.query(PARAMETROS.ok) ?? ''];

type ContagensDaRede = { unidades: number; usuarios: number; turmas: number; matriculados: number };

const contarRede = async (redeId: string, anoLetivoId: string | null): Promise<ContagensDaRede> => {
  const [{ schools, users }, turmas] = await Promise.all([
    identity.countSchoolsAndUsers(redeId),
    anoLetivoId === null
      ? Promise.resolve<Turma[]>([])
      : academico.listarTurmas(redeId, { anoLetivoId }),
  ]);
  const matriculas = await Promise.all(
    turmas.map((turma) => academico.matriculasAtivasDaTurma(redeId, turma.id)),
  );
  return {
    unidades: schools,
    usuarios: users,
    turmas: turmas.length,
    matriculados: matriculas.reduce((total, daTurma) => total + daTurma.length, 0),
  };
};

rotasRede.get(ROTAS.rede.painel.padrao, async (c) => {
  const redeId = currentNetwork(c);
  const anos = await academico.listarAnosLetivos(redeId);
  const anoLetivo = anos[0] ?? null;
  const contagens = await contarRede(redeId, anoLetivo === null ? null : anoLetivo.id);
  return renderizar(c, TEMPLATES.rede.painel, {
    ...PARCIAIS,
    titulo: TITULOS.rede.painel,
    contagens,
    anoLetivo,
    anosDefinidos: anos.length,
  });
});

const telaDeUnidades = async (c: Context, dados: DadosDeTemplate = {}): Promise<Response> => {
  const pagina = await identity.schoolsPage(currentNetwork(c), paginaDaQuery(c));
  return renderizar(c, TEMPLATES.rede.unidades, {
    ...PARCIAIS,
    titulo: TITULOS.rede.unidades,
    rotuloDaSituacao: IDENTITY_VOCABULARY.schoolActive,
    ausente: MISSING_VALUE,
    unidades: pagina.items,
    navegacao: navegacao(c, pagina),
    ...dados,
  });
};

const formDeUnidade = (c: Context, dados: DadosDeTemplate = {}): Response =>
  renderizar(c, TEMPLATES.rede.unidadeNova, {
    ...SUFIXOS,
    titulo: TITULOS.rede.unidadeNova,
    valores: VALORES_INICIAIS.unidade,
    limiteDoNome: IDENTITY_LIMITS.school.name,
    limiteDoCodigoInep: IDENTITY_LIMITS.school.inepCode,
    erros: [],
    ...dados,
  });

rotasRede.get(ROTAS.rede.unidades.padrao, (c) =>
  telaDeUnidades(c, { mensagem: mensagemDaQuery(c) }),
);

rotasRede.get(ROTAS.rede.unidadeNova.padrao, (c) => formDeUnidade(c));

rotasRede.post(ROTAS.rede.unidades.padrao, async (c) => {
  const redeId = currentNetwork(c);
  const corpo = c.get(CONTEXT_VARIABLES.body);
  const valores = {
    nome: texto(corpo, CAMPOS.unidade.nome),
    codigoInep: texto(corpo, CAMPOS.unidade.codigoInep),
  };

  const resultado = await identity.createSchool({
    networkId: redeId,
    name: valores.nome,
    inepCode: valores.codigoInep,
  });
  if (!resultado.ok) return formDeUnidade(c, { valores, erros: resultado.erros });

  logger.info({ rede_id: redeId, unidade_id: resultado.valor.id }, EVENTOS_DE_LOG.unidadeCriada);
  return c.redirect(
    `${ROTAS.rede.unidades()}?${PARAMETROS.ok}=${CODIGOS_DE_AVISO.unidadeCriada}`,
    303,
  );
});

const guardarConvite = (c: Context, usuarioId: string, senha: string): Promise<void> =>
  setSignedCookie(
    c,
    COOKIE_DO_CONVITE.nome,
    `${usuarioId}${COOKIE_DO_CONVITE.separador}${senha}`,
    config.sessionSecret,
    {
      path: ROTAS.rede.usuarios(),
      httpOnly: true,
      secure: config.secureCookie,
      sameSite: COOKIE_DO_CONVITE.sameSite,
      maxAge: COOKIE_DO_CONVITE.validadeEmSegundos,
    },
  );

const retirarConvite = async (
  c: Context,
): Promise<{ usuarioId: string; senha: string } | null> => {
  const valor = await getSignedCookie(c, config.sessionSecret, COOKIE_DO_CONVITE.nome);
  if (typeof valor !== 'string') return null;
  deleteCookie(c, COOKIE_DO_CONVITE.nome, {
    path: ROTAS.rede.usuarios(),
    secure: config.secureCookie,
  });
  const corte = valor.indexOf(COOKIE_DO_CONVITE.separador);
  if (corte <= 0) return null;
  return { usuarioId: valor.slice(0, corte), senha: valor.slice(corte + 1) };
};

type LinhaDeAtribuicao = { unidadeId: string; papel: string };

const ehPapel = (valor: string): valor is Role =>
  PAPEIS_DA_TELA.some((opcao) => opcao.valor === valor);

const linhasDoFormulario = (corpo: FormBody): LinhaDeAtribuicao[] => {
  const unidades = lista(corpo, CAMPOS.usuario.unidades);
  const papeis = lista(corpo, CAMPOS.usuario.papeis);
  const total = Math.max(unidades.length, papeis.length, LINHAS_DE_ATRIBUICAO);
  return Array.from({ length: total }, (_, indice) => ({
    unidadeId: unidades[indice] ?? '',
    papel: papeis[indice] ?? '',
  }));
};

const linhasVazias = (): LinhaDeAtribuicao[] =>
  Array.from({ length: LINHAS_DE_ATRIBUICAO }, () => ({ unidadeId: '', papel: '' }));

const telaDeUsuarios = async (c: Context, dados: DadosDeTemplate = {}): Promise<Response> => {
  const pagina = await identity.usersPage(currentNetwork(c), paginaDaQuery(c));
  return renderizar(c, TEMPLATES.rede.usuarios, {
    ...PARCIAIS,
    titulo: TITULOS.rede.usuarios,
    rotuloDaSituacao: IDENTITY_VOCABULARY.active,
    semPapel: IDENTITY_VOCABULARY.noRole,
    usuarios: pagina.items,
    navegacao: navegacao(c, pagina),
    papeis: PAPEIS_DA_TELA,
    convite: null,
    ...dados,
  });
};

const formDeUsuario = async (c: Context, dados: DadosDeTemplate = {}): Promise<Response> => {
  const redeId = currentNetwork(c);
  const [unidades, responsaveis] = await Promise.all([
    identity.listSchools(redeId),
    academico.listarResponsaveis(redeId),
  ]);
  return renderizar(c, TEMPLATES.rede.usuarioNovo, {
    ...SUFIXOS,
    titulo: TITULOS.rede.usuarioNovo,
    unidades,
    responsaveis,
    papeis: PAPEIS_DA_TELA,
    valores: VALORES_INICIAIS.usuario,
    limiteDoNome: IDENTITY_LIMITS.user.name,
    tamanhoDoCpf: MASKED_CPF_LENGTH,
    linhas: linhasVazias(),
    erros: [],
    ...dados,
  });
};

rotasRede.get(ROTAS.rede.usuarios.padrao, async (c) => {
  const convite = await retirarConvite(c);
  return await telaDeUsuarios(c, { convite, mensagem: mensagemDaQuery(c) });
});

rotasRede.get(ROTAS.rede.usuarioNovo.padrao, (c) => formDeUsuario(c));

rotasRede.post(ROTAS.rede.usuarios.padrao, async (c) => {
  const redeId = currentNetwork(c);
  const corpo = c.get(CONTEXT_VARIABLES.body);
  const valores = {
    nome: texto(corpo, CAMPOS.usuario.nome),
    email: texto(corpo, CAMPOS.usuario.email),
    cpf: texto(corpo, CAMPOS.usuario.cpf),
    responsavelId: texto(corpo, CAMPOS.usuario.responsavelId),
  };
  const linhas = linhasDoFormulario(corpo);

  const preenchidas = linhas.filter((linha) => linha.unidadeId !== '' || linha.papel !== '');
  const atribuicoes = preenchidas.flatMap((linha) =>
    linha.unidadeId !== '' && ehPapel(linha.papel)
      ? [{ schoolId: linha.unidadeId, role: linha.papel }]
      : [],
  );
  if (atribuicoes.length !== preenchidas.length) {
    return await formDeUsuario(c, {
      valores,
      linhas,
      erros: [ERROS_DE_FORMULARIO.atribuicaoIncompleta],
    });
  }

  const cadastro =
    valores.responsavelId === '' || !isUuid(valores.responsavelId)
      ? null
      : await academico.responsavelPorId(redeId, valores.responsavelId);

  const resultado = await identity.inviteUser({
    networkId: redeId,
    name: valores.nome,
    email: valores.email,
    cpf: valores.cpf,
    registeredCpf: cadastro?.cpf ?? null,
    ...(cadastro === null ? {} : { registeredName: cadastro.nome }),
    roleAssignments: atribuicoes,
    guardianId: valores.responsavelId === '' ? null : valores.responsavelId,
  });
  if (!resultado.ok) return await formDeUsuario(c, { valores, linhas, erros: resultado.erros });

  logger.info(
    { rede_id: redeId, usuario_id: resultado.valor.userId, atribuicoes: atribuicoes.length },
    EVENTOS_DE_LOG.usuarioConvidado,
  );
  await guardarConvite(c, resultado.valor.userId, resultado.valor.temporaryPassword);
  return c.redirect(
    `${ROTAS.rede.usuarios()}?${PARAMETROS.ok}=${CODIGOS_DE_AVISO.usuarioConvidado}`,
    303,
  );
});

const telaDeAnos = async (c: Context, dados: DadosDeTemplate = {}): Promise<Response> => {
  const pagina = await academico.paginaDeAnosLetivos(currentNetwork(c), paginaDaQuery(c));
  return renderizar(c, TEMPLATES.rede.anos, {
    ...PARCIAIS,
    titulo: TITULOS.rede.anos,
    anos: pagina.items,
    navegacao: navegacao(c, pagina),
    ...dados,
  });
};

const formDeAno = (c: Context, dados: DadosDeTemplate = {}): Response =>
  renderizar(c, TEMPLATES.rede.anoNovo, {
    ...SUFIXOS,
    titulo: TITULOS.rede.anoNovo,
    valores: VALORES_INICIAIS.anoLetivo,
    anoMinimo: LIMITES_DO_ACADEMICO.anoLetivo.anoMinimo,
    anoMaximo: LIMITES_DO_ACADEMICO.anoLetivo.anoMaximo,
    erros: [],
    ...dados,
  });

rotasRede.get(ROTAS.rede.anosLetivos.padrao, (c) =>
  telaDeAnos(c, { mensagem: mensagemDaQuery(c) }),
);

rotasRede.get(ROTAS.rede.anoLetivoNovo.padrao, (c) => formDeAno(c));

rotasRede.post(ROTAS.rede.anosLetivos.padrao, async (c) => {
  const redeId = currentNetwork(c);
  const corpo = c.get(CONTEXT_VARIABLES.body);
  const valores = {
    ano: texto(corpo, CAMPOS.anoLetivo.ano),
    dataInicio: texto(corpo, CAMPOS.anoLetivo.dataInicio),
    dataFim: texto(corpo, CAMPOS.anoLetivo.dataFim),
  };

  if (!ANO_EM_QUATRO_DIGITOS.test(valores.ano)) {
    return formDeAno(c, { valores, erros: [ERROS_DE_FORMULARIO.anoInvalido] });
  }

  const resultado = await academico.definirAnoLetivo({
    redeId,
    ano: Number(valores.ano),
    dataInicio: valores.dataInicio,
    dataFim: valores.dataFim,
  });
  if (!resultado.ok) return formDeAno(c, { valores, erros: resultado.erros });

  logger.info(
    { rede_id: redeId, ano_letivo_id: resultado.valor.id },
    EVENTOS_DE_LOG.anoLetivoDefinido,
  );
  return c.redirect(
    `${ROTAS.rede.anosLetivos()}?${PARAMETROS.ok}=${CODIGOS_DE_AVISO.anoDefinido}`,
    303,
  );
});
