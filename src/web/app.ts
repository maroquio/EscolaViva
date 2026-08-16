import { join } from 'node:path';
import { Hono } from 'hono';
import { identidade } from '../identidade';
import { ATIVOS } from '../shared/constants';
import {
  criarMiddlewareSessao,
  exigirLogin,
  middlewareCacheControl,
  middlewareCorrelacao,
  middlewareErros,
  temPapel,
  usuarioAtual,
  usuarioAtualOuNulo,
  type Variaveis,
} from '../shared/http';
import {
  DETALHES_DE_ERRO,
  ERRO_INESPERADO_EM_TEXTO,
  NOME_DE_ASSET,
  PAGINAS_DE_ERRO,
  PAINEL_POR_PAPEL,
  PREFIXO_PUBLICO,
  ROTAS,
  TIPOS_DE_ASSET,
  TIPO_DE_ASSET_PADRAO,
  TITULOS_DE_ERRO,
} from './constantes';
import { rotasSaude } from './health';
import { renderizarErro } from './render';
import { montarRotas } from './rotas';

const PASTA_PUBLICO = join(import.meta.dir, '..', '..', ATIVOS.diretorio);

const SEPARADOR_DE_EXTENSAO = '.';

export const app = new Hono<{ Variables: Variaveis }>();

app.use(middlewareErros);
app.use(middlewareCorrelacao);
app.use(middlewareCacheControl);
app.use(criarMiddlewareSessao(identidade.sessaoValida));

app.onError(async (erro, c) => {
  const resposta = await middlewareErros(c, () => Promise.reject(erro));
  return resposta ?? c.text(ERRO_INESPERADO_EM_TEXTO, 500);
});

const tipoDoAsset = (nome: string): string => {
  const extensao = nome.slice(nome.lastIndexOf(SEPARADOR_DE_EXTENSAO) + 1).toLowerCase();
  return TIPOS_DE_ASSET[extensao] ?? TIPO_DE_ASSET_PADRAO;
};

app.get(ROTAS.publicas.publico.padrao, async (c) => {
  const nome = c.req.path.slice(PREFIXO_PUBLICO.length);
  if (!NOME_DE_ASSET.test(nome)) {
    return renderizarErro(
      c,
      404,
      PAGINAS_DE_ERRO.assetNomeInvalido.titulo,
      PAGINAS_DE_ERRO.assetNomeInvalido.detalhe,
    );
  }

  const arquivo = Bun.file(join(PASTA_PUBLICO, nome));
  if (!(await arquivo.exists())) {
    return renderizarErro(
      c,
      404,
      PAGINAS_DE_ERRO.assetInexistente.titulo,
      PAGINAS_DE_ERRO.assetInexistente.detalhe,
    );
  }

  return new Response(arquivo, { headers: { 'Content-Type': tipoDoAsset(nome) } });
});

app.route(ROTAS.publicas.prefixo, rotasSaude);

app.get(ROTAS.publicas.raiz.padrao, (c) =>
  c.redirect(
    usuarioAtualOuNulo(c) === null ? ROTAS.publicas.login() : ROTAS.publicas.painel(),
    303,
  ),
);

app.get(ROTAS.publicas.painel.padrao, exigirLogin(), (c) => {
  const usuario = usuarioAtual(c);
  const painel = PAINEL_POR_PAPEL.find(({ papel }) => temPapel(usuario, papel));
  if (painel === undefined) {
    return renderizarErro(
      c,
      403,
      PAGINAS_DE_ERRO.contaSemPapel.titulo,
      PAGINAS_DE_ERRO.contaSemPapel.detalhe,
    );
  }
  return c.redirect(painel.destino, 303);
});

montarRotas(app);

app.notFound((c) => renderizarErro(c, 404, TITULOS_DE_ERRO[404], DETALHES_DE_ERRO[404]));
