/**
 * As telas de quem publica no mural: a lista com a taxa de leitura e o formulário de envio.
 *
 * A taxa é o motivo desta tela existir. Um comunicado publicado não é um comunicado lido, e
 * enquanto o mural for o único canal essa diferença é invisível — a menos que alguém a meça. É por
 * isso que a lista mostra destinatários, leituras e a razão entre os dois em vez de apenas dizer
 * "publicado".
 *
 * O alcance de quem publica vem do papel: `admin_rede` enxerga a rede inteira; `secretaria` só as
 * unidades onde tem o papel. Unidade fora desse alcance responde 404, venha ela da query ou de um
 * campo oculto adulterado.
 */

import { Hono, type Context } from 'hono';
import { academico } from '../../academico';
import { ALCANCE, comunicacao, type Alcance, type EstatisticaDeLeitura } from '../../comunicacao';
import { PAPEL, identidade, type Unidade } from '../../identidade';
import { VARIAVEIS_DE_CONTEXTO } from '../../shared/constantes';
import { paginaVazia } from '../../shared/paginacao';
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
import type { ErroDeAplicacao } from '../../shared/resultado';
import {
  AVISOS,
  CAMPOS,
  DIAGNOSTICOS,
  ERROS_DE_FORMULARIO,
  PARAMETROS,
  ROTAS,
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

/* --- Alcance do usuário ----------------------------------------------------- */

const unidadesDoUsuario = async (
  usuario: UsuarioDaSessao,
  veTodaARede: boolean,
): Promise<Unidade[]> => {
  const unidades = await identidade.listarUnidades(usuario.redeId);
  if (veTodaARede) return unidades;
  const permitidas = new Set(unidadesDoPapel(usuario, PAPEL.secretaria));
  return unidades.filter((unidade) => permitidas.has(unidade.id));
};

/**
 * Devolve a unidade que recorta a lista, ou `null` para "toda a rede". A secretaria vê uma unidade
 * por vez — a omissão a leva à primeira das suas, nunca à rede inteira.
 */
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

/* --- Lista ------------------------------------------------------------------ */

/**
 * O resumo do topo mede o recorte inteiro, e não as linhas da página.
 *
 * A taxa de leitura é o motivo desta tela existir: ela responde "o que a escola disse chegou a
 * quem?". Uma taxa que se recalculasse a cada clique em "próxima" responderia outra pergunta, bem
 * menos útil — a de quanto foi lido entre estes vinte comunicados aqui.
 */
rotasComunicados.get(ROTAS.comunicados.lista.padrao, async (c) => {
  const usuario = usuarioAtual(c);
  const veTodaARede = temPapel(usuario, PAPEL.adminRede);
  const unidades = await unidadesDoUsuario(usuario, veTodaARede);
  const recorte = recorteDaLista(
    unidades,
    c.req.query(PARAMETROS.unidadeId) ?? '',
    veTodaARede,
  );

  // Secretaria sem unidade atribuída não cai na rede inteira por omissão: sem recorte, sem lista.
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

/* --- Publicação -------------------------------------------------------------- */

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

/**
 * Sem JavaScript, a lista de destinatários só pode ser montada depois que a unidade é conhecida —
 * por isso o envio tem dois passos, e o primeiro é um GET que apenas escolhe a unidade.
 */
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

const paginaDeEnvio = (
  c: Context,
  contexto: ContextoDeEnvio,
  valores: ValoresDoComunicado,
  erros: ErroDeAplicacao[],
): Response =>
  renderizar(c, TEMPLATES.comunicados.novo, {
    titulo: TITULOS.comunicados.novo,
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

/**
 * A recusa por lista vazia, com o campo e o código de `ERROS_DE_FORMULARIO.semSelecao`.
 *
 * A frase fica aqui porque a constante da camada web reescreveu o texto ("Marque ao menos um
 * responsável, ou envie para a unidade inteira.") e este refactor não muda um byte do que a tela
 * diz. Reconciliar as duas redações é decisão de produto, não de extração de constante: no dia em
 * que ela for tomada, esta `const` some e o objeto de `ERROS_DE_FORMULARIO` é usado inteiro.
 */
const SEM_SELECAO: ErroDeAplicacao = {
  ...ERROS_DE_FORMULARIO.semSelecao,
  mensagem: 'Marque ao menos um responsável ou escolha enviar para toda a unidade.',
};

/**
 * Destinatário marcado é entrada externa: a lista que volta do navegador é conferida contra a
 * lista que saiu, e um id de outra unidade recusa o envio inteiro em vez de ser silenciosamente
 * descartado — o remetente precisa saber para quem o comunicado foi.
 */
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

  // Lista vazia é o contrato de `publicarComunicado` para "toda a unidade": quem decide quem são
  // os responsáveis alcançados é o módulo, com os dados do dia do envio.
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
