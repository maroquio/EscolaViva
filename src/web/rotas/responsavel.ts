import { Hono, type Context } from 'hono';
import { VOCABULARIO_DO_ACADEMICO, academico, type Matricula } from '../../academics';
import {
  APROVACAO,
  ARITMETICA,
  VOCABULARIO_DA_AVALIACAO,
  avaliacao,
  type Boletim,
} from '../../assessment';
import { comunicacao, type ItemDoMural } from '../../communication';
import { ROLE } from '../../identity';
import {
  NotFound,
  currentNetwork,
  currentUser,
  requireRole,
  type Variables,
} from '../../shared/http';
import { emptyPage } from '../../shared/pagination';
import {
  APRESENTACAO,
  AVISOS,
  DIAGNOSTICOS,
  MISSING_VALUE,
  PARAMETROS,
  ROTAS,
  TEMPLATES,
  TITULOS,
} from '../constantes';
import { navegacao, paginaDaQuery } from '../paginacao';
import { formatarNota, renderizar } from '../render';

export const rotasResponsavel = new Hono<{ Variables: Variables }>();

rotasResponsavel.use(requireRole(ROLE.guardian));

const PARCIAIS = { parciais: TEMPLATES.parciais };

const ROTULOS_DA_AVALIACAO = {
  rotuloDaSituacao: VOCABULARIO_DA_AVALIACAO.situacaoFinal,
  rotuloDaPresenca: VOCABULARIO_DA_AVALIACAO.presenca,
};

const ROTULOS_DO_ACADEMICO = {
  rotuloDaSituacao: VOCABULARIO_DO_ACADEMICO.situacaoDeMatricula,
};

const naEscalaDaTela = (emCentesimos: number): number => emCentesimos / ARITMETICA.centesimos;

const CRITERIO_DE_APROVACAO = {
  media: formatarNota(naEscalaDaTela(APROVACAO.mediaMinimaEmCentesimos)),
  frequencia: `${naEscalaDaTela(APROVACAO.frequenciaMinimaEmCentesimos)}${APRESENTACAO.sufixoDePercentual}`,
};

const responsavelDaSessao = (c: Context): string | null => currentUser(c).guardianId;

const matriculaSobResponsabilidade = async (c: Context, matriculaId: string): Promise<Matricula> => {
  const responsavelId = responsavelDaSessao(c);
  if (responsavelId === null) throw new NotFound(DIAGNOSTICOS.contaSemResponsavel);

  const matriculas = await academico.matriculasDoResponsavel(currentNetwork(c), responsavelId);
  const matricula = matriculas.find((linha) => linha.id === matriculaId);
  if (matricula === undefined) {
    throw new NotFound(DIAGNOSTICOS.matriculaForaDaResponsabilidade);
  }
  return matricula;
};

const bimestresDe = (boletim: Boletim): number[] =>
  Array.from({ length: boletim.linhas[0]?.notas.length ?? 0 }, (_, indice) => indice + 1);

const comMensagem = (destino: string, aviso: Record<string, string>): string =>
  `${destino}?${new URLSearchParams(aviso).toString()}`;

rotasResponsavel.get(ROTAS.responsavel.painel.padrao, async (c) => {
  const redeId = currentNetwork(c);
  const responsavelId = responsavelDaSessao(c);

  if (responsavelId === null) {
    return renderizar(c, TEMPLATES.responsavel.painel, {
      ...PARCIAIS,
      ...ROTULOS_DO_ACADEMICO,
      titulo: TITULOS.responsavel.painel,
      matriculas: [],
      navegacao: navegacao(c, emptyPage<Matricula>()),
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
    ...ROTULOS_DO_ACADEMICO,
    titulo: TITULOS.responsavel.painel,
    matriculas: pagina.items,
    navegacao: navegacao(c, pagina),
    naoLidos: naoLidos.items,
    totalNaoLidos: contagem.naoLidos,
    totalNoMural: contagem.total,
  });
});

rotasResponsavel.get(ROTAS.responsavel.boletim.padrao, async (c) => {
  const { id: matriculaId } = c.req.param();
  await matriculaSobResponsabilidade(c, matriculaId);

  const boletim = await avaliacao.boletim(currentNetwork(c), matriculaId);
  if (boletim === null) throw new NotFound(DIAGNOSTICOS.matriculaSemBoletim);

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
  const redeId = currentNetwork(c);
  const matricula = await matriculaSobResponsabilidade(c, matriculaId);

  const [dias, boletim] = await Promise.all([
    avaliacao.paginaDeFrequencia(redeId, matriculaId, paginaDaQuery(c)),
    avaliacao.boletim(redeId, matriculaId),
  ]);
  if (boletim === null) throw new NotFound(DIAGNOSTICOS.matriculaSemFrequencia);

  return renderizar(c, TEMPLATES.responsavel.frequencia, {
    ...PARCIAIS,
    rotuloDaPresenca: ROTULOS_DA_AVALIACAO.rotuloDaPresenca,
    semValor: MISSING_VALUE,
    criterio: CRITERIO_DE_APROVACAO,
    titulo: TITULOS.responsavel.frequencia(matricula.alunoNome),
    matricula,
    boletim,
    dias: dias.items,
    navegacao: navegacao(c, dias),
  });
});

rotasResponsavel.get(ROTAS.responsavel.mural.padrao, async (c) => {
  const responsavelId = responsavelDaSessao(c);
  const redeId = currentNetwork(c);
  const [naoLidos, lidos] =
    responsavelId === null
      ? [emptyPage<ItemDoMural>(), emptyPage<ItemDoMural>()]
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
    naoLidos: naoLidos.items,
    navegacaoNaoLidos: navegacao(c, naoLidos, PARAMETROS.paginaDeNaoLidos),
    totalNaoLidos: naoLidos.total,
    lidos: lidos.items,
    navegacaoLidos: navegacao(c, lidos, PARAMETROS.paginaDeLidos),
    totalLidos: lidos.total,
  });
});

rotasResponsavel.get(ROTAS.responsavel.comunicado.padrao, async (c) => {
  const { comunicadoId } = c.req.param();
  const redeId = currentNetwork(c);
  const responsavelId = responsavelDaSessao(c);
  if (responsavelId === null) throw new NotFound(DIAGNOSTICOS.contaSemResponsavel);

  const [comunicado, mural] = await Promise.all([
    comunicacao.comunicadoParaResponsavel(redeId, responsavelId, comunicadoId),
    comunicacao.muralDoResponsavel(redeId, responsavelId),
  ]);
  if (comunicado === null) throw new NotFound(DIAGNOSTICOS.comunicadoForaDoMural);

  return renderizar(c, TEMPLATES.responsavel.comunicado, {
    titulo: comunicado.titulo,
    comunicado,
    lidoEm: mural.find((item) => item.comunicadoId === comunicadoId)?.lidoEm ?? null,
  });
});

rotasResponsavel.post(ROTAS.responsavel.comunicadoLido.padrao, async (c) => {
  const { comunicadoId } = c.req.param();
  const redeId = currentNetwork(c);
  const responsavelId = responsavelDaSessao(c);
  if (responsavelId === null) throw new NotFound(DIAGNOSTICOS.contaSemResponsavel);

  const comunicado = await comunicacao.comunicadoParaResponsavel(redeId, responsavelId, comunicadoId);
  if (comunicado === null) throw new NotFound(DIAGNOSTICOS.comunicadoForaDoMural);

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
