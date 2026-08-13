/**
 * As telas do responsável: quem ele acompanha, o boletim em tela, a frequência dia a dia e o mural
 * de comunicados.
 *
 * `exigirPapel('responsavel')` diz que a pessoa é responsável por alguém — não diz por quem. Qual
 * matrícula e qual comunicado pertencem a ela é decidido a cada requisição, perguntando aos módulos
 * com o `responsavelId` que veio da sessão. Id de outra família responde **404**, nunca 403: para
 * quem pergunta não pode haver diferença entre "não é seu" e "não existe", porque a diferença já
 * seria a resposta.
 *
 * Nenhuma conta destas telas é feita aqui. Média, percentual de frequência e situação vêm de
 * `avaliacao`, que é dona da regra; a camada web formata o que recebe e não recalcula nada.
 */

import { Hono, type Context } from 'hono';
import { academico, type Matricula } from '../../academico';
import { avaliacao, type Boletim } from '../../avaliacao';
import { comunicacao, type ItemDoMural } from '../../comunicacao';
import {
  NaoEncontrado,
  exigirPapel,
  redeAtual,
  usuarioAtual,
  type Variaveis,
} from '../../shared/http';
import { renderizar } from '../render';

const MURAL = '/responsavel/mural';

export const rotasResponsavel = new Hono<{ Variables: Variaveis }>();

rotasResponsavel.use(exigirPapel('responsavel'));

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
  if (responsavelId === null) throw new NaoEncontrado('conta sem responsável vinculado');

  const matriculas = await academico.matriculasDoResponsavel(redeAtual(c), responsavelId);
  const matricula = matriculas.find((linha) => linha.id === matriculaId);
  if (matricula === undefined) throw new NaoEncontrado('matrícula fora da responsabilidade');
  return matricula;
};

/** Cada linha do boletim traz uma posição por bimestre, inclusive as vazias: a forma é a régua. */
const bimestresDe = (boletim: Boletim): number[] =>
  Array.from({ length: boletim.linhas[0]?.notas.length ?? 0 }, (_, indice) => indice + 1);

/** A mensagem do POST-Redirect-GET viaja na query e volta escapada pelo template. */
const comMensagem = (destino: string, aviso: Record<string, string>): string =>
  `${destino}?${new URLSearchParams(aviso).toString()}`;

/* --- Painel ---------------------------------------------------------------- */

rotasResponsavel.get('/', async (c) => {
  const redeId = redeAtual(c);
  const responsavelId = responsavelDaSessao(c);

  const [matriculas, mural]: [Matricula[], ItemDoMural[]] =
    responsavelId === null
      ? [[], []]
      : await Promise.all([
          academico.matriculasDoResponsavel(redeId, responsavelId),
          comunicacao.muralDoResponsavel(redeId, responsavelId),
        ]);

  return renderizar(c, '/responsavel/painel', {
    titulo: 'Meus alunos',
    matriculas,
    naoLidos: mural.filter((item) => item.lidoEm === null),
    totalNoMural: mural.length,
  });
});

/* --- Boletim e frequência --------------------------------------------------- */

rotasResponsavel.get('/matriculas/:id/boletim', async (c) => {
  const matriculaId = c.req.param('id');
  await matriculaSobResponsabilidade(c, matriculaId);

  const boletim = await avaliacao.boletim(redeAtual(c), matriculaId);
  if (boletim === null) throw new NaoEncontrado('matrícula sem boletim');

  return renderizar(c, '/responsavel/boletim', {
    titulo: `Boletim de ${boletim.alunoNome}`,
    matriculaId,
    boletim,
    bimestres: bimestresDe(boletim),
  });
});

rotasResponsavel.get('/matriculas/:id/frequencia', async (c) => {
  const matriculaId = c.req.param('id');
  const redeId = redeAtual(c);
  const matricula = await matriculaSobResponsabilidade(c, matriculaId);

  // O percentual vem do mesmo lugar que decide a aprovação. Recontar presenças aqui produziria um
  // segundo número, e é a divergência entre os dois que o boletim existe para não ter.
  const [dias, boletim] = await Promise.all([
    avaliacao.frequenciaDaMatricula(redeId, matriculaId),
    avaliacao.boletim(redeId, matriculaId),
  ]);
  if (boletim === null) throw new NaoEncontrado('matrícula sem apuração de frequência');

  return renderizar(c, '/responsavel/frequencia', {
    titulo: `Frequência de ${matricula.alunoNome}`,
    matricula,
    boletim,
    dias,
  });
});

/* --- Mural ------------------------------------------------------------------ */

rotasResponsavel.get('/mural', async (c) => {
  const responsavelId = responsavelDaSessao(c);
  const mural =
    responsavelId === null ? [] : await comunicacao.muralDoResponsavel(redeAtual(c), responsavelId);

  return renderizar(c, '/responsavel/mural', {
    titulo: 'Mural de comunicados',
    naoLidos: mural.filter((item) => item.lidoEm === null),
    lidos: mural.filter((item) => item.lidoEm !== null),
  });
});

rotasResponsavel.get('/mural/:comunicadoId', async (c) => {
  const comunicadoId = c.req.param('comunicadoId');
  const redeId = redeAtual(c);
  const responsavelId = responsavelDaSessao(c);
  if (responsavelId === null) throw new NaoEncontrado('conta sem responsável vinculado');

  // Abrir a página não marca leitura: ler é escrita, e escrita não pode ser efeito colateral de
  // navegação — um GET repetido pelo botão "voltar" ou por um pré-carregamento do navegador
  // inventaria leitura que ninguém fez, e a taxa de leitura deixaria de medir alguma coisa.
  const [comunicado, mural] = await Promise.all([
    comunicacao.comunicadoParaResponsavel(redeId, responsavelId, comunicadoId),
    comunicacao.muralDoResponsavel(redeId, responsavelId),
  ]);
  if (comunicado === null) throw new NaoEncontrado('comunicado fora do mural do responsável');

  return renderizar(c, '/responsavel/comunicado', {
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
rotasResponsavel.post('/mural/:comunicadoId/lido', async (c) => {
  const comunicadoId = c.req.param('comunicadoId');
  const redeId = redeAtual(c);
  const responsavelId = responsavelDaSessao(c);
  if (responsavelId === null) throw new NaoEncontrado('conta sem responsável vinculado');

  const comunicado = await comunicacao.comunicadoParaResponsavel(redeId, responsavelId, comunicadoId);
  if (comunicado === null) throw new NaoEncontrado('comunicado fora do mural do responsável');

  const resultado = await comunicacao.marcarComoLido({ redeId, comunicadoId, responsavelId });
  if (!resultado.ok) {
    const mensagem = resultado.erros[0]?.mensagem ?? 'Não foi possível registrar a leitura.';
    return c.redirect(comMensagem(`${MURAL}/${comunicadoId}`, { erro: mensagem }), 303);
  }

  return c.redirect(comMensagem(MURAL, { ok: 'Comunicado marcado como lido.' }), 303);
});
