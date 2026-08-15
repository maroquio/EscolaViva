/**
 * Montagem do servidor HTTP: middlewares globais, arquivos publicados, as duas rotas de entrada
 * e os routers de cada papel.
 *
 * A ordem dos middlewares é a própria semântica do sistema:
 *   1. erros       — envolve tudo, para que nenhuma exceção escape sem virar página e linha de log;
 *   2. correlação  — nasce antes de qualquer log (I16);
 *   3. cache       — decide o cabeçalho olhando a sessão depois da resposta pronta (I11);
 *   4. sessão      — resolve o cookie assinado no banco a cada requisição (I2);
 *   5. rotas.
 *
 * `middlewareIdempotencia` (I4) NÃO entra aqui: ele exige `_chave` no formulário e responde 400 sem
 * ela, o que quebraria qualquer POST fora do padrão de escrita. Ele é aplicado por grupo de rota
 * em `rotas/index.ts`, sobre os prefixos que de fato escrevem.
 */

import { join } from 'node:path';
import { Hono } from 'hono';
import { identidade } from '../identidade';
import { ATIVOS } from '../shared/constantes';
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

/** O ponto que separa nome de extensão: gramática do nome de arquivo, não política do produto. */
const SEPARADOR_DE_EXTENSAO = '.';

export const app = new Hono<{ Variables: Variaveis }>();

app.use(middlewareErros);
app.use(middlewareCorrelacao);
app.use(middlewareCacheControl);
app.use(criarMiddlewareSessao(identidade.sessaoValida));

/**
 * O Hono não deixa a exceção de um handler subir até o `await next()` do middleware que o envolve:
 * o `compose` a intercepta no próprio quadro e entrega ao `onError` da aplicação. Por isso o
 * middleware de erros é ligado também como tratador — mesma função, mesmo log redigido, mesma
 * página, no ponto em que o framework de fato entrega a falha.
 *
 * O `app.use` acima continua valendo: o que não é `Error` o `compose` relança em vez de tratar, e
 * aí quem responde é o middleware.
 */
app.onError(async (erro, c) => {
  const resposta = await middlewareErros(c, () => Promise.reject(erro));
  return resposta ?? c.text(ERRO_INESPERADO_EM_TEXTO, 500);
});

/* --- Arquivos publicados (I10) --------------------------------------------- */

const tipoDoAsset = (nome: string): string => {
  const extensao = nome.slice(nome.lastIndexOf(SEPARADOR_DE_EXTENSAO) + 1).toLowerCase();
  return TIPOS_DE_ASSET[extensao] ?? TIPO_DE_ASSET_PADRAO;
};

// O `Cache-Control: public, max-age=31536000, immutable` vem do middleware de cache, que reconhece
// o prefixo `/publico/`: o nome carrega o hash do conteúdo, então guardar para sempre é seguro.
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

/* --- Entradas do sistema ---------------------------------------------------- */

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
