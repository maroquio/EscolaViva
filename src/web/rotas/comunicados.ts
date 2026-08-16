import { Hono, type Context } from 'hono';
import { academics } from '../../academics';
import { AUDIENCE, communication, type Audience, type ReadStatistic } from '../../communication';
import { ROLE, identity, type School } from '../../identity';
import { CONTEXT_VARIABLES } from '../../shared/constants';
import { emptyPage } from '../../shared/pagination';
import {
  NotFound,
  currentUser,
  hasRole,
  requireRole,
  schoolsForRole,
  type FormBody,
  type SessionUser,
  type Variables,
} from '../../shared/http';
import type { ApplicationError } from '../../shared/result';
import {
  AVISOS,
  CAMPOS,
  DIAGNOSTICOS,
  ERROS_DE_FORMULARIO,
  PARAMETROS,
  ROTAS,
  SEM_SELECAO_NO_ENVIO,
  TEMPLATES,
  TITULOS,
} from '../constantes';
import { navegacao, paginaDaQuery } from '../paginacao';
import { renderizar } from '../render';

type ValoresDoComunicado = {
  unidadeId: string;
  titulo: string;
  corpo: string;
  alcance: Audience;
  selecionados: string[];
};

type ContextoDeEnvio = {
  unidades: School[];
  unidade: School | null;
  responsaveis: { id: string; nome: string }[];
};

export const rotasComunicados = new Hono<{ Variables: Variables }>();

rotasComunicados.use(requireRole(ROLE.registrar, ROLE.networkAdmin));

const unidadesDoUsuario = async (
  usuario: SessionUser,
  veTodaARede: boolean,
): Promise<School[]> => {
  const unidades = await identity.listSchools(usuario.networkId);
  if (veTodaARede) return unidades;
  const permitidas = new Set(schoolsForRole(usuario, ROLE.registrar));
  return unidades.filter((unidade) => permitidas.has(unidade.id));
};

const recorteDaLista = (
  unidades: readonly School[],
  pedida: string,
  veTodaARede: boolean,
): string | null => {
  if (pedida !== '') {
    if (!unidades.some((unidade) => unidade.id === pedida)) {
      throw new NotFound(DIAGNOSTICOS.unidadeForaDoAlcance);
    }
    return pedida;
  }
  if (veTodaARede) return null;
  return unidades[0]?.id ?? null;
};

const SEM_RESUMO = { recipients: 0, reads: 0, rate: 0 };

const estatisticaParaTela = (estatistica: ReadStatistic) => ({
  titulo: estatistica.title,
  publicadoEm: estatistica.publishedAt,
  destinatarios: estatistica.recipients,
  leituras: estatistica.reads,
  taxa: estatistica.rate,
});

rotasComunicados.get(ROTAS.comunicados.lista.padrao, async (c) => {
  const usuario = currentUser(c);
  const veTodaARede = hasRole(usuario, ROLE.networkAdmin);
  const unidades = await unidadesDoUsuario(usuario, veTodaARede);
  const recorte = recorteDaLista(
    unidades,
    c.req.query(PARAMETROS.unidadeId) ?? '',
    veTodaARede,
  );

  const semAlcance = recorte === null && !veTodaARede;
  const [pagina, resumo] = await Promise.all([
    semAlcance
      ? Promise.resolve(emptyPage<ReadStatistic>())
      : communication.announcementsPage(usuario.networkId, recorte ?? undefined, paginaDaQuery(c)),
    semAlcance
      ? Promise.resolve(SEM_RESUMO)
      : communication.announcementsSummary(usuario.networkId, recorte ?? undefined),
  ]);

  return renderizar(c, TEMPLATES.comunicados.lista, {
    titulo: TITULOS.comunicados.lista,
    campoDaUnidade: PARAMETROS.unidadeId,
    comunicados: pagina.items.map(estatisticaParaTela),
    navegacao: navegacao(c, pagina),
    resumo: {
      destinatarios: resumo.recipients,
      leituras: resumo.reads,
      taxa: resumo.rate,
    },
    unidades,
    unidadeAtual: recorte ?? '',
    veTodaARede,
  });
});

const textoDoCampo = (formulario: FormBody, campo: string): string => {
  const valor = formulario[campo];
  return typeof valor === 'string' ? valor.trim() : '';
};

const listaDoCampo = (formulario: FormBody, campo: string): string[] => {
  const valor = formulario[campo];
  if (typeof valor === 'string') return [valor];
  if (!Array.isArray(valor)) return [];
  return valor.filter((item): item is string => typeof item === 'string');
};

const valoresDoFormulario = (formulario: FormBody): ValoresDoComunicado => ({
  unidadeId: textoDoCampo(formulario, CAMPOS.comunicado.unidadeId),
  titulo: textoDoCampo(formulario, CAMPOS.comunicado.titulo),
  corpo: textoDoCampo(formulario, CAMPOS.comunicado.corpo),
  alcance:
    textoDoCampo(formulario, CAMPOS.comunicado.alcance) === AUDIENCE.selected
      ? AUDIENCE.selected
      : AUDIENCE.school,
  selecionados: listaDoCampo(formulario, CAMPOS.comunicado.responsaveis),
});

const contextoDeEnvio = async (
  usuario: SessionUser,
  unidadeIdPedida: string,
): Promise<ContextoDeEnvio> => {
  const todas = await unidadesDoUsuario(usuario, hasRole(usuario, ROLE.networkAdmin));
  const unidades = todas.filter((unidade) => unidade.active);
  const unidade = unidades.find((item) => item.id === unidadeIdPedida) ?? null;
  if (unidadeIdPedida !== '' && unidade === null) {
    throw new NotFound(DIAGNOSTICOS.unidadeForaDoAlcance);
  }
  const daUnidade =
    unidade === null ? [] : await academics.schoolGuardians(usuario.networkId, unidade.id);
  const responsaveis = daUnidade.map((responsavel) => ({
    id: responsavel.id,
    nome: responsavel.name,
  }));
  return { unidades, unidade, responsaveis };
};

const LINHAS_DA_MENSAGEM = 10;

const paginaDeEnvio = (
  c: Context,
  contexto: ContextoDeEnvio,
  valores: ValoresDoComunicado,
  erros: ApplicationError[],
): Response =>
  renderizar(c, TEMPLATES.comunicados.novo, {
    titulo: TITULOS.comunicados.novo,
    campoDaUnidade: PARAMETROS.unidadeId,
    linhasDaMensagem: LINHAS_DA_MENSAGEM,
    ...contexto,
    valores,
    erros,
  });

const valoresIniciais = (unidadeId: string): ValoresDoComunicado => ({
  unidadeId,
  titulo: '',
  corpo: '',
  alcance: AUDIENCE.school,
  selecionados: [],
});

const SEM_SELECAO: ApplicationError = {
  ...ERROS_DE_FORMULARIO.semSelecao,
  mensagem: SEM_SELECAO_NO_ENVIO,
};

const conferirDestinatarios = (
  valores: ValoresDoComunicado,
  responsaveis: readonly { id: string }[],
): ApplicationError | null => {
  if (valores.alcance === AUDIENCE.school) return null;
  if (valores.selecionados.length === 0) return SEM_SELECAO;
  const daUnidade = new Set(responsaveis.map((responsavel) => responsavel.id));
  if (valores.selecionados.every((id) => daUnidade.has(id))) return null;
  return ERROS_DE_FORMULARIO.destinatarioForaDaUnidade;
};

rotasComunicados.get(ROTAS.comunicados.novo.padrao, async (c) => {
  const usuario = currentUser(c);
  const contexto = await contextoDeEnvio(usuario, c.req.query(PARAMETROS.unidadeId) ?? '');
  return paginaDeEnvio(c, contexto, valoresIniciais(contexto.unidade?.id ?? ''), []);
});

rotasComunicados.post(ROTAS.comunicados.novo.padrao, async (c) => {
  const usuario = currentUser(c);
  const valores = valoresDoFormulario(c.get(CONTEXT_VARIABLES.body));
  const contexto = await contextoDeEnvio(usuario, valores.unidadeId);

  if (contexto.unidade === null) {
    return paginaDeEnvio(c, contexto, valores, [ERROS_DE_FORMULARIO.unidadeAusente]);
  }

  const recusa = conferirDestinatarios(valores, contexto.responsaveis);
  if (recusa !== null) return paginaDeEnvio(c, contexto, valores, [recusa]);

  const resultado = await communication.publishAnnouncement({
    networkId: usuario.networkId,
    schoolId: contexto.unidade.id,
    title: valores.titulo,
    body: valores.corpo,
    authorUserId: usuario.id,
    recipients:
      valores.alcance === AUDIENCE.school
        ? []
        : valores.selecionados.map((guardianId) => ({ guardianId })),
  });
  if (!resultado.ok) return paginaDeEnvio(c, contexto, valores, resultado.erros);

  const destino = new URLSearchParams({
    [PARAMETROS.unidadeId]: contexto.unidade.id,
    [PARAMETROS.ok]: AVISOS.comunicadoPublicado,
  });
  return c.redirect(`${ROTAS.comunicados.lista()}?${destino.toString()}`, 303);
});
