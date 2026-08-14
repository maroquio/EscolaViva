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
import { comunicacao, type EstatisticaDeLeitura } from '../../comunicacao';
import { paginaVazia } from '../../shared/paginacao';
import { identidade, type Unidade } from '../../identidade';
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
import { navegacao, paginaDaQuery } from '../paginacao';
import { renderizar } from '../render';

const LISTA = '/comunicados';
const TITULO_NOVO = 'Novo comunicado';

/**
 * O sufixo `[]` não é decoração: é assim que o leitor de formulário do Hono monta uma lista. Sem
 * ele, a segunda caixa marcada sobrescreveria a primeira e o comunicado sairia com um destinatário.
 */
const CAMPO_RESPONSAVEIS = 'responsaveis[]';

type Alcance = 'unidade' | 'selecionados';

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

rotasComunicados.use(exigirPapel('secretaria', 'admin_rede'));

/* --- Alcance do usuário ----------------------------------------------------- */

const unidadesDoUsuario = async (
  usuario: UsuarioDaSessao,
  veTodaARede: boolean,
): Promise<Unidade[]> => {
  const unidades = await identidade.listarUnidades(usuario.redeId);
  if (veTodaARede) return unidades;
  const permitidas = new Set(unidadesDoPapel(usuario, 'secretaria'));
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
      throw new NaoEncontrado('unidade fora do alcance do usuário');
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
rotasComunicados.get('/', async (c) => {
  const usuario = usuarioAtual(c);
  const veTodaARede = temPapel(usuario, 'admin_rede');
  const unidades = await unidadesDoUsuario(usuario, veTodaARede);
  const recorte = recorteDaLista(unidades, c.req.query('unidadeId') ?? '', veTodaARede);

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

  return renderizar(c, '/comunicados/lista', {
    titulo: 'Comunicados',
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
  unidadeId: textoDoCampo(formulario, 'unidadeId'),
  titulo: textoDoCampo(formulario, 'titulo'),
  corpo: textoDoCampo(formulario, 'corpo'),
  alcance: textoDoCampo(formulario, 'alcance') === 'selecionados' ? 'selecionados' : 'unidade',
  selecionados: listaDoCampo(formulario, CAMPO_RESPONSAVEIS),
});

/**
 * Sem JavaScript, a lista de destinatários só pode ser montada depois que a unidade é conhecida —
 * por isso o envio tem dois passos, e o primeiro é um GET que apenas escolhe a unidade.
 */
const contextoDeEnvio = async (
  usuario: UsuarioDaSessao,
  unidadeIdPedida: string,
): Promise<ContextoDeEnvio> => {
  const todas = await unidadesDoUsuario(usuario, temPapel(usuario, 'admin_rede'));
  const unidades = todas.filter((unidade) => unidade.ativa);
  const unidade = unidades.find((item) => item.id === unidadeIdPedida) ?? null;
  if (unidadeIdPedida !== '' && unidade === null) {
    throw new NaoEncontrado('unidade fora do alcance do usuário');
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
  renderizar(c, '/comunicados/novo', { titulo: TITULO_NOVO, ...contexto, valores, erros });

const valoresIniciais = (unidadeId: string): ValoresDoComunicado => ({
  unidadeId,
  titulo: '',
  corpo: '',
  alcance: 'unidade',
  selecionados: [],
});

/**
 * Destinatário marcado é entrada externa: a lista que volta do navegador é conferida contra a
 * lista que saiu, e um id de outra unidade recusa o envio inteiro em vez de ser silenciosamente
 * descartado — o remetente precisa saber para quem o comunicado foi.
 */
const conferirDestinatarios = (
  valores: ValoresDoComunicado,
  responsaveis: readonly { id: string }[],
): ErroDeAplicacao | null => {
  if (valores.alcance === 'unidade') return null;
  if (valores.selecionados.length === 0) {
    return {
      campo: 'destinatarios',
      codigo: 'sem_selecao',
      mensagem: 'Marque ao menos um responsável ou escolha enviar para toda a unidade.',
    };
  }
  const daUnidade = new Set(responsaveis.map((responsavel) => responsavel.id));
  if (valores.selecionados.every((id) => daUnidade.has(id))) return null;
  return {
    campo: 'destinatarios',
    codigo: 'destinatario_fora_da_unidade',
    mensagem: 'Um dos responsáveis marcados não pertence à unidade escolhida.',
  };
};

rotasComunicados.get('/novo', async (c) => {
  const usuario = usuarioAtual(c);
  const contexto = await contextoDeEnvio(usuario, c.req.query('unidadeId') ?? '');
  return paginaDeEnvio(c, contexto, valoresIniciais(contexto.unidade?.id ?? ''), []);
});

rotasComunicados.post('/novo', async (c) => {
  const usuario = usuarioAtual(c);
  const valores = valoresDoFormulario(c.get('corpo'));
  const contexto = await contextoDeEnvio(usuario, valores.unidadeId);

  if (contexto.unidade === null) {
    const erro = {
      campo: 'unidadeId',
      codigo: 'unidade_ausente',
      mensagem: 'Escolha a unidade que vai enviar o comunicado.',
    };
    return paginaDeEnvio(c, contexto, valores, [erro]);
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
      valores.alcance === 'unidade'
        ? []
        : valores.selecionados.map((responsavelId) => ({ responsavelId })),
  });
  if (!resultado.ok) return paginaDeEnvio(c, contexto, valores, resultado.erros);

  const destino = new URLSearchParams({
    unidadeId: contexto.unidade.id,
    ok: 'Comunicado publicado. A taxa de leitura começa a contar agora.',
  });
  return c.redirect(`${LISTA}?${destino.toString()}`, 303);
});
