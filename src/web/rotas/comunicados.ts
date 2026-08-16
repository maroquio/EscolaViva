import { Hono, type Context } from 'hono';
import { academico } from '../../academico';
import { ALCANCE, comunicacao, type Alcance, type EstatisticaDeLeitura } from '../../comunicacao';
import { PAPEL, identidade, type Unidade } from '../../identidade';
import { VARIAVEIS_DE_CONTEXTO } from '../../shared/constants';
import { paginaVazia } from '../../shared/pagination';
import {
  NaoEncontrado,
  exigirPapel,
  temPapel,
  unidadesDoPapel,
  usuarioAtual,
  type CorpoDeFormulario,
  type UsuarioDaSessao,
  type Variaveis,
} from '../../shared/http';
import type { ErroDeAplicacao } from '../../shared/result';
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
  alcance: Alcance;
  selecionados: string[];
};

type ContextoDeEnvio = {
  unidades: Unidade[];
  unidade: Unidade | null;
  responsaveis: { id: string; nome: string }[];
};

export const rotasComunicados = new Hono<{ Variables: Variaveis }>();

rotasComunicados.use(exigirPapel(PAPEL.secretaria, PAPEL.adminRede));

const unidadesDoUsuario = async (
  usuario: UsuarioDaSessao,
  veTodaARede: boolean,
): Promise<Unidade[]> => {
  const unidades = await identidade.listarUnidades(usuario.redeId);
  if (veTodaARede) return unidades;
  const permitidas = new Set(unidadesDoPapel(usuario, PAPEL.secretaria));
  return unidades.filter((unidade) => permitidas.has(unidade.id));
};

const recorteDaLista = (
  unidades: readonly Unidade[],
  pedida: string,
  veTodaARede: boolean,
): string | null => {
  if (pedida !== '') {
    if (!unidades.some((unidade) => unidade.id === pedida)) {
      throw new NaoEncontrado(DIAGNOSTICOS.unidadeForaDoAlcance);
    }
    return pedida;
  }
  if (veTodaARede) return null;
  return unidades[0]?.id ?? null;
};

const SEM_RESUMO = { destinatarios: 0, leituras: 0, taxa: 0 };

rotasComunicados.get(ROTAS.comunicados.lista.padrao, async (c) => {
  const usuario = usuarioAtual(c);
  const veTodaARede = temPapel(usuario, PAPEL.adminRede);
  const unidades = await unidadesDoUsuario(usuario, veTodaARede);
  const recorte = recorteDaLista(
    unidades,
    c.req.query(PARAMETROS.unidadeId) ?? '',
    veTodaARede,
  );

  const semAlcance = recorte === null && !veTodaARede;
  const [pagina, resumo] = await Promise.all([
    semAlcance
      ? Promise.resolve(paginaVazia<EstatisticaDeLeitura>())
      : comunicacao.paginaDeComunicados(usuario.redeId, recorte ?? undefined, paginaDaQuery(c)),
    semAlcance
      ? Promise.resolve(SEM_RESUMO)
      : comunicacao.resumoDeComunicados(usuario.redeId, recorte ?? undefined),
  ]);

  return renderizar(c, TEMPLATES.comunicados.lista, {
    titulo: TITULOS.comunicados.lista,
    campoDaUnidade: PARAMETROS.unidadeId,
    comunicados: pagina.itens,
    navegacao: navegacao(c, pagina),
    resumo: {
      destinatarios: resumo.destinatarios,
      leituras: resumo.leituras,
      taxa: resumo.taxa,
    },
    unidades,
    unidadeAtual: recorte ?? '',
    veTodaARede,
  });
});

const textoDoCampo = (formulario: CorpoDeFormulario, campo: string): string => {
  const valor = formulario[campo];
  return typeof valor === 'string' ? valor.trim() : '';
};

const listaDoCampo = (formulario: CorpoDeFormulario, campo: string): string[] => {
  const valor = formulario[campo];
  if (typeof valor === 'string') return [valor];
  if (!Array.isArray(valor)) return [];
  return valor.filter((item): item is string => typeof item === 'string');
};

const valoresDoFormulario = (formulario: CorpoDeFormulario): ValoresDoComunicado => ({
  unidadeId: textoDoCampo(formulario, CAMPOS.comunicado.unidadeId),
  titulo: textoDoCampo(formulario, CAMPOS.comunicado.titulo),
  corpo: textoDoCampo(formulario, CAMPOS.comunicado.corpo),
  alcance:
    textoDoCampo(formulario, CAMPOS.comunicado.alcance) === ALCANCE.selecionados
      ? ALCANCE.selecionados
      : ALCANCE.unidade,
  selecionados: listaDoCampo(formulario, CAMPOS.comunicado.responsaveis),
});

const contextoDeEnvio = async (
  usuario: UsuarioDaSessao,
  unidadeIdPedida: string,
): Promise<ContextoDeEnvio> => {
  const todas = await unidadesDoUsuario(usuario, temPapel(usuario, PAPEL.adminRede));
  const unidades = todas.filter((unidade) => unidade.ativa);
  const unidade = unidades.find((item) => item.id === unidadeIdPedida) ?? null;
  if (unidadeIdPedida !== '' && unidade === null) {
    throw new NaoEncontrado(DIAGNOSTICOS.unidadeForaDoAlcance);
  }
  const responsaveis =
    unidade === null ? [] : await academico.responsaveisDaUnidade(usuario.redeId, unidade.id);
  return { unidades, unidade, responsaveis };
};

const LINHAS_DA_MENSAGEM = 10;

const paginaDeEnvio = (
  c: Context,
  contexto: ContextoDeEnvio,
  valores: ValoresDoComunicado,
  erros: ErroDeAplicacao[],
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
  alcance: ALCANCE.unidade,
  selecionados: [],
});

const SEM_SELECAO: ErroDeAplicacao = {
  ...ERROS_DE_FORMULARIO.semSelecao,
  mensagem: SEM_SELECAO_NO_ENVIO,
};

const conferirDestinatarios = (
  valores: ValoresDoComunicado,
  responsaveis: readonly { id: string }[],
): ErroDeAplicacao | null => {
  if (valores.alcance === ALCANCE.unidade) return null;
  if (valores.selecionados.length === 0) return SEM_SELECAO;
  const daUnidade = new Set(responsaveis.map((responsavel) => responsavel.id));
  if (valores.selecionados.every((id) => daUnidade.has(id))) return null;
  return ERROS_DE_FORMULARIO.destinatarioForaDaUnidade;
};

rotasComunicados.get(ROTAS.comunicados.novo.padrao, async (c) => {
  const usuario = usuarioAtual(c);
  const contexto = await contextoDeEnvio(usuario, c.req.query(PARAMETROS.unidadeId) ?? '');
  return paginaDeEnvio(c, contexto, valoresIniciais(contexto.unidade?.id ?? ''), []);
});

rotasComunicados.post(ROTAS.comunicados.novo.padrao, async (c) => {
  const usuario = usuarioAtual(c);
  const valores = valoresDoFormulario(c.get(VARIAVEIS_DE_CONTEXTO.corpo));
  const contexto = await contextoDeEnvio(usuario, valores.unidadeId);

  if (contexto.unidade === null) {
    return paginaDeEnvio(c, contexto, valores, [ERROS_DE_FORMULARIO.unidadeAusente]);
  }

  const recusa = conferirDestinatarios(valores, contexto.responsaveis);
  if (recusa !== null) return paginaDeEnvio(c, contexto, valores, [recusa]);

  const resultado = await comunicacao.publicarComunicado({
    redeId: usuario.redeId,
    unidadeId: contexto.unidade.id,
    titulo: valores.titulo,
    corpo: valores.corpo,
    autorUsuarioId: usuario.id,
    destinatarios:
      valores.alcance === ALCANCE.unidade
        ? []
        : valores.selecionados.map((responsavelId) => ({ responsavelId })),
  });
  if (!resultado.ok) return paginaDeEnvio(c, contexto, valores, resultado.erros);

  const destino = new URLSearchParams({
    [PARAMETROS.unidadeId]: contexto.unidade.id,
    [PARAMETROS.ok]: AVISOS.comunicadoPublicado,
  });
  return c.redirect(`${ROTAS.comunicados.lista()}?${destino.toString()}`, 303);
});
