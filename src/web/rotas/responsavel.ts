/**
 * As telas do responsável: quem ele acompanha, o boletim em tela, a frequência dia a dia e o mural
 * de comunicados.
 *
 * `exigirPapel(PAPEL.responsavel)` diz que a pessoa é responsável por alguém — não diz por quem.
 * Qual matrícula e qual comunicado pertencem a ela é decidido a cada requisição, perguntando aos
 * módulos com o `responsavelId` que veio da sessão. Id de outra família responde **404**, nunca
 * 403: para quem pergunta não pode haver diferença entre "não é seu" e "não existe", porque a
 * diferença já seria a resposta.
 *
 * Nenhuma conta destas telas é feita aqui. Média, percentual de frequência e situação vêm de
 * `avaliacao`, que é dona da regra; a camada web formata o que recebe e não recalcula nada. O
 * `CRITERIO_DE_APROVACAO` logo abaixo não é exceção: ele não decide nada, só põe os dois pisos do
 * módulo na escala em que a tela os escreve, com a constante do próprio módulo que os pôs em
 * centésimos. Redigitá-los como "6,0" e "75 %" dentro do `.eta` era o que fazia a tela prometer uma
 * regra e o domínio aplicar outra.
 */

import { Hono, type Context } from 'hono';
import { academico, type Matricula } from '../../academico';
import {
  APROVACAO,
  ARITMETICA,
  VOCABULARIO_DA_AVALIACAO,
  avaliacao,
  type Boletim,
} from '../../avaliacao';
import { comunicacao, type ItemDoMural } from '../../comunicacao';
import { PAPEL } from '../../identidade';
import {
  NaoEncontrado,
  exigirPapel,
  redeAtual,
  usuarioAtual,
  type Variaveis,
} from '../../shared/http';
import { paginaVazia } from '../../shared/paginacao';
import {
  APRESENTACAO,
  AUSENTE,
  AVISOS,
  DIAGNOSTICOS,
  PARAMETROS,
  ROTAS,
  TEMPLATES,
  TITULOS,
} from '../constantes';
import { navegacao, paginaDaQuery } from '../paginacao';
import { formatarNota, renderizar } from '../render';

export const rotasResponsavel = new Hono<{ Variables: Variaveis }>();

rotasResponsavel.use(exigirPapel(PAPEL.responsavel));

/**
 * O que o `.eta` não tem como importar chega por `it`, e é este o único caminho: o Eta não lê
 * TypeScript, então redigitar `/parciais/_vazio` dentro do template abriria a segunda fonte de
 * verdade que `TEMPLATES.parciais` existe para fechar. Quem sabe ler `constantes.ts` é o handler.
 *
 * Vai para as quatro telas que incluem `_vazio` ou `_paginacao` — painel, boletim, frequência e
 * mural. A do comunicado não inclui parcial nenhuma: ela é uma página só, sem lista.
 */
const PARCIAIS = { parciais: TEMPLATES.parciais };

/**
 * O rótulo de cada valor fechado do domínio — "Aprovado", "Falta justificada" — pela mesma porta.
 * O dono é `avaliacao`, que é quem acrescenta uma situação ou um estado de presença; enquanto as
 * palavras estavam redigitadas dentro do `.eta`, acrescentar um valor lá deixava a tabela mostrando
 * o código cru aqui, e nada acusava. A classe de CSS continua no template: aquela é vocabulário da
 * folha de estilo, e não tem dono em `constantes.ts`.
 */
const ROTULOS_DA_AVALIACAO = {
  rotuloDaSituacao: VOCABULARIO_DA_AVALIACAO.situacaoFinal,
  rotuloDaPresenca: VOCABULARIO_DA_AVALIACAO.presenca,
};

/**
 * O critério escrito na tela do boletim, derivado dos dois pisos de `avaliacao`.
 *
 * A página existe para que quem lê um "reprovado" veja ali mesmo a regra que o produziu — e uma
 * regra escrita à mão no `.eta` é exatamente o que passa a mentir no dia em que o piso muda. Aqui
 * não há conta de boletim nenhuma: os pisos moram em centésimos porque é assim que o domínio
 * compara, e `ARITMETICA.centesimos` é a mesma constante que os pôs nessa escala.
 */
const naEscalaDaTela = (emCentesimos: number): number => emCentesimos / ARITMETICA.centesimos;

const CRITERIO_DE_APROVACAO = {
  media: formatarNota(naEscalaDaTela(APROVACAO.mediaMinimaEmCentesimos)),
  frequencia: `${naEscalaDaTela(APROVACAO.frequenciaMinimaEmCentesimos)}${APRESENTACAO.sufixoDePercentual}`,
};

/**
 * O papel `responsavel` mora em `identidade`; a pessoa que assina pelo aluno mora em `academico`.
 * `responsavelId` é a costura entre os dois, e uma conta com o papel mas sem a costura não
 * enxerga aluno nenhum — não é erro, é uma conta que a secretaria ainda não vinculou.
 */
const responsavelDaSessao = (c: Context): string | null => usuarioAtual(c).responsavelId;

/**
 * A única porta para uma matrícula: ela precisa estar na lista de quem está logado. Qualquer outro
 * id — de outro aluno, de outra rede, inventado — sai daqui como 404.
 */
const matriculaSobResponsabilidade = async (c: Context, matriculaId: string): Promise<Matricula> => {
  const responsavelId = responsavelDaSessao(c);
  if (responsavelId === null) throw new NaoEncontrado(DIAGNOSTICOS.contaSemResponsavel);

  const matriculas = await academico.matriculasDoResponsavel(redeAtual(c), responsavelId);
  const matricula = matriculas.find((linha) => linha.id === matriculaId);
  if (matricula === undefined) {
    throw new NaoEncontrado(DIAGNOSTICOS.matriculaForaDaResponsabilidade);
  }
  return matricula;
};

/** Cada linha do boletim traz uma posição por bimestre, inclusive as vazias: a forma é a régua. */
const bimestresDe = (boletim: Boletim): number[] =>
  Array.from({ length: boletim.linhas[0]?.notas.length ?? 0 }, (_, indice) => indice + 1);

/** A mensagem do POST-Redirect-GET viaja na query e volta escapada pelo template. */
const comMensagem = (destino: string, aviso: Record<string, string>): string =>
  `${destino}?${new URLSearchParams(aviso).toString()}`;

/* --- Painel ---------------------------------------------------------------- */

/**
 * Os cartões do topo contam no banco; a tabela e a lista trazem só a página aberta. Antes o mural
 * inteiro vinha para cá para que dois `length` fossem lidos — quatro anos de comunicados
 * carregados para escrever dois números na tela.
 */
rotasResponsavel.get(ROTAS.responsavel.painel.padrao, async (c) => {
  const redeId = redeAtual(c);
  const responsavelId = responsavelDaSessao(c);

  if (responsavelId === null) {
    return renderizar(c, TEMPLATES.responsavel.painel, {
      ...PARCIAIS,
      titulo: TITULOS.responsavel.painel,
      matriculas: [],
      navegacao: navegacao(c, paginaVazia<Matricula>()),
      naoLidos: [],
      totalNaoLidos: 0,
      totalNoMural: 0,
    });
  }

  const [pagina, naoLidos, contagem] = await Promise.all([
    academico.paginaDeMatriculasDoResponsavel(redeId, responsavelId, paginaDaQuery(c)),
    comunicacao.paginaDoMural(redeId, responsavelId, false, 1),
    comunicacao.contagemDoMural(redeId, responsavelId),
  ]);

  return renderizar(c, TEMPLATES.responsavel.painel, {
    ...PARCIAIS,
    titulo: TITULOS.responsavel.painel,
    matriculas: pagina.itens,
    navegacao: navegacao(c, pagina),
    naoLidos: naoLidos.itens,
    totalNaoLidos: contagem.naoLidos,
    totalNoMural: contagem.total,
  });
});

/* --- Boletim e frequência --------------------------------------------------- */

/**
 * O nome do `:param` não é redigitado: `c.req.param()` devolve o objeto que o Hono deriva do
 * próprio `.padrao`, e desestruturá-lo faz o compilador conferir a leitura contra o mapa de rotas.
 * `const { ind } = c.req.param()` não compila — antes disto, o mesmo engano só apareceria como 404
 * na tela de quem estivesse usando o sistema.
 */
rotasResponsavel.get(ROTAS.responsavel.boletim.padrao, async (c) => {
  const { id: matriculaId } = c.req.param();
  await matriculaSobResponsabilidade(c, matriculaId);

  const boletim = await avaliacao.boletim(redeAtual(c), matriculaId);
  if (boletim === null) throw new NaoEncontrado(DIAGNOSTICOS.matriculaSemBoletim);

  return renderizar(c, TEMPLATES.responsavel.boletim, {
    ...PARCIAIS,
    rotuloDaSituacao: ROTULOS_DA_AVALIACAO.rotuloDaSituacao,
    criterio: CRITERIO_DE_APROVACAO,
    titulo: TITULOS.responsavel.boletim(boletim.alunoNome),
    matriculaId,
    boletim,
    bimestres: bimestresDe(boletim),
  });
});

rotasResponsavel.get(ROTAS.responsavel.frequencia.padrao, async (c) => {
  const { id: matriculaId } = c.req.param();
  const redeId = redeAtual(c);
  const matricula = await matriculaSobResponsabilidade(c, matriculaId);

  // O percentual vem do mesmo lugar que decide a aprovação. Recontar presenças aqui produziria um
  // segundo número, e é a divergência entre os dois que o boletim existe para não ter.
  const [dias, boletim] = await Promise.all([
    avaliacao.paginaDeFrequencia(redeId, matriculaId, paginaDaQuery(c)),
    avaliacao.boletim(redeId, matriculaId),
  ]);
  if (boletim === null) throw new NaoEncontrado(DIAGNOSTICOS.matriculaSemFrequencia);

  return renderizar(c, TEMPLATES.responsavel.frequencia, {
    ...PARCIAIS,
    rotuloDaPresenca: ROTULOS_DA_AVALIACAO.rotuloDaPresenca,
    semValor: AUSENTE,
    // O mesmo objeto que o boletim recebe: as duas telas escrevem o piso de frequência, e escrevê-lo
    // duas vezes era como uma delas passava a mentir sozinha.
    criterio: CRITERIO_DE_APROVACAO,
    titulo: TITULOS.responsavel.frequencia(matricula.alunoNome),
    matricula,
    boletim,
    dias: dias.itens,
    navegacao: navegacao(c, dias),
  });
});

/* --- Mural ------------------------------------------------------------------ */

/**
 * As duas metades do mural são duas consultas com filtro próprio, cada uma com seu parâmetro de
 * página: marcar um comunicado como lido move uma linha de uma lista para a outra, e as duas
 * precisam poder andar sem arrastar a vizinha.
 */
rotasResponsavel.get(ROTAS.responsavel.mural.padrao, async (c) => {
  const responsavelId = responsavelDaSessao(c);
  const redeId = redeAtual(c);
  const [naoLidos, lidos] =
    responsavelId === null
      ? [paginaVazia<ItemDoMural>(), paginaVazia<ItemDoMural>()]
      : await Promise.all([
          comunicacao.paginaDoMural(
            redeId,
            responsavelId,
            false,
            paginaDaQuery(c, PARAMETROS.paginaDeNaoLidos),
          ),
          comunicacao.paginaDoMural(
            redeId,
            responsavelId,
            true,
            paginaDaQuery(c, PARAMETROS.paginaDeLidos),
          ),
        ]);

  return renderizar(c, TEMPLATES.responsavel.mural, {
    ...PARCIAIS,
    titulo: TITULOS.responsavel.mural,
    naoLidos: naoLidos.itens,
    navegacaoNaoLidos: navegacao(c, naoLidos, PARAMETROS.paginaDeNaoLidos),
    totalNaoLidos: naoLidos.total,
    lidos: lidos.itens,
    navegacaoLidos: navegacao(c, lidos, PARAMETROS.paginaDeLidos),
    totalLidos: lidos.total,
  });
});

rotasResponsavel.get(ROTAS.responsavel.comunicado.padrao, async (c) => {
  const { comunicadoId } = c.req.param();
  const redeId = redeAtual(c);
  const responsavelId = responsavelDaSessao(c);
  if (responsavelId === null) throw new NaoEncontrado(DIAGNOSTICOS.contaSemResponsavel);

  // Abrir a página não marca leitura: ler é escrita, e escrita não pode ser efeito colateral de
  // navegação — um GET repetido pelo botão "voltar" ou por um pré-carregamento do navegador
  // inventaria leitura que ninguém fez, e a taxa de leitura deixaria de medir alguma coisa.
  const [comunicado, mural] = await Promise.all([
    comunicacao.comunicadoParaResponsavel(redeId, responsavelId, comunicadoId),
    comunicacao.muralDoResponsavel(redeId, responsavelId),
  ]);
  if (comunicado === null) throw new NaoEncontrado(DIAGNOSTICOS.comunicadoForaDoMural);

  return renderizar(c, TEMPLATES.responsavel.comunicado, {
    titulo: comunicado.titulo,
    comunicado,
    lidoEm: mural.find((item) => item.comunicadoId === comunicadoId)?.lidoEm ?? null,
  });
});

/**
 * O botão "Marcar como lido" é a única coisa que grava `lido_em` — a instrumentação que prova a dor
 * do Estágio 04. Enquanto o comunicado só existe no mural do portal, essa data é a medição que
 * separa "a escola avisou" de "o responsável leu".
 */
rotasResponsavel.post(ROTAS.responsavel.comunicadoLido.padrao, async (c) => {
  const { comunicadoId } = c.req.param();
  const redeId = redeAtual(c);
  const responsavelId = responsavelDaSessao(c);
  if (responsavelId === null) throw new NaoEncontrado(DIAGNOSTICOS.contaSemResponsavel);

  const comunicado = await comunicacao.comunicadoParaResponsavel(redeId, responsavelId, comunicadoId);
  if (comunicado === null) throw new NaoEncontrado(DIAGNOSTICOS.comunicadoForaDoMural);

  const resultado = await comunicacao.marcarComoLido({ redeId, comunicadoId, responsavelId });
  if (!resultado.ok) {
    const mensagem = resultado.erros[0]?.mensagem ?? AVISOS.leituraNaoRegistrada;
    return c.redirect(
      comMensagem(ROTAS.responsavel.comunicado({ comunicadoId }), { [PARAMETROS.erro]: mensagem }),
      303,
    );
  }

  return c.redirect(
    comMensagem(ROTAS.responsavel.mural(), { [PARAMETROS.ok]: AVISOS.comunicadoLido }),
    303,
  );
});
