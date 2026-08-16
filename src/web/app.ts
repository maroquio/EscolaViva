import { join } from 'node:path';
import { Hono } from 'hono';
import { identity } from '../identity';
import { ASSETS } from '../shared/constants';
import {
  cacheControlMiddleware,
  correlationMiddleware,
  createSessionMiddleware,
  currentUser,
  currentUserOrNull,
  errorsMiddleware,
  hasRole,
  requireLogin,
  type Variables,
} from '../shared/http';
import {
  DETALHES_DE_ERRO,
  ERROR_TITLES,
  ERRO_INESPERADO_EM_TEXTO,
  NOME_DE_ASSET,
  PAGINAS_DE_ERRO,
  PAINEL_POR_PAPEL,
  PREFIXO_PUBLICO,
  ROTAS,
  TIPOS_DE_ASSET,
  TIPO_DE_ASSET_PADRAO,
} from './constants';
import { rotasSaude } from './health';
import { renderizarErro } from './render';
import { montarRotas } from './routes';

const PASTA_PUBLICO = join(import.meta.dir, '..', '..', ASSETS.directory);

const SEPARADOR_DE_EXTENSAO = '.';

export const app = new Hono<{ Variables: Variables }>();

app.use(errorsMiddleware);
app.use(correlationMiddleware);
app.use(cacheControlMiddleware);
app.use(createSessionMiddleware(identity.validSession));

app.onError(async (erro, c) => {
  const resposta = await errorsMiddleware(c, () => Promise.reject(erro));
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
    currentUserOrNull(c) === null ? ROTAS.publicas.login() : ROTAS.publicas.painel(),
    303,
  ),
);

app.get(ROTAS.publicas.painel.padrao, requireLogin(), (c) => {
  const usuario = currentUser(c);
  const painel = PAINEL_POR_PAPEL.find(({ papel }) => hasRole(usuario, papel));
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

app.notFound((c) => renderizarErro(c, 404, ERROR_TITLES[404], DETALHES_DE_ERRO[404]));
