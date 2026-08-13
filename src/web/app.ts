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
import {
  criarMiddlewareSessao,
  exigirLogin,
  middlewareCacheControl,
  middlewareCorrelacao,
  middlewareErros,
  temPapel,
  usuarioAtual,
  usuarioAtualOuNulo,
  type PapelDaSessao,
  type Variaveis,
} from '../shared/http';
import { rotasSaude } from './health';
import { renderizarErro } from './render';
import { montarRotas } from './rotas';

const PASTA_PUBLICO = join(import.meta.dir, '..', '..', 'publico');
const PREFIXO_PUBLICO = '/publico/';

/** O nome do asset é gerado pelo build (`app.<hash>.css`): nada além disso é servido daqui. */
const NOME_DE_ASSET = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,127})$/;

const TIPOS_DE_ASSET: Record<string, string> = {
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
};

/**
 * Ordem de precedência do painel: uma pessoa pode acumular papéis — a secretária que também é mãe
 * de aluno —, e a tela inicial é a do papel de maior alcance na rede.
 */
const PAINEL_POR_PAPEL: readonly { papel: PapelDaSessao; destino: string }[] = [
  { papel: 'admin_rede', destino: '/rede' },
  { papel: 'secretaria', destino: '/secretaria' },
  { papel: 'professor', destino: '/professor' },
  { papel: 'responsavel', destino: '/responsavel' },
];

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
  return resposta ?? c.text('Erro inesperado', 500);
});

/* --- Arquivos publicados (I10) --------------------------------------------- */

const tipoDoAsset = (nome: string): string => {
  const extensao = nome.slice(nome.lastIndexOf('.') + 1).toLowerCase();
  return TIPOS_DE_ASSET[extensao] ?? 'application/octet-stream';
};

// O `Cache-Control: public, max-age=31536000, immutable` vem do middleware de cache, que reconhece
// o prefixo `/publico/`: o nome carrega o hash do conteúdo, então guardar para sempre é seguro.
app.get('/publico/*', async (c) => {
  const nome = c.req.path.slice(PREFIXO_PUBLICO.length);
  if (!NOME_DE_ASSET.test(nome)) {
    return renderizarErro(c, 404, 'Arquivo não encontrado', 'Este endereço não corresponde a nenhum arquivo publicado.');
  }

  const arquivo = Bun.file(join(PASTA_PUBLICO, nome));
  if (!(await arquivo.exists())) {
    return renderizarErro(c, 404, 'Arquivo não encontrado', 'O arquivo pedido não faz parte desta versão do sistema.');
  }

  return new Response(arquivo, { headers: { 'Content-Type': tipoDoAsset(nome) } });
});

/* --- Entradas do sistema ---------------------------------------------------- */

app.route('/', rotasSaude);

app.get('/', (c) => c.redirect(usuarioAtualOuNulo(c) === null ? '/login' : '/painel', 303));

app.get('/painel', exigirLogin(), (c) => {
  const usuario = usuarioAtual(c);
  const painel = PAINEL_POR_PAPEL.find(({ papel }) => temPapel(usuario, papel));
  if (painel === undefined) {
    return renderizarErro(
      c,
      403,
      'Conta sem papel atribuído',
      'Seu acesso existe, mas ainda não foi ligado a nenhuma unidade. Peça ao administrador da rede para atribuir um papel.',
    );
  }
  return c.redirect(painel.destino, 303);
});

montarRotas(app);

app.notFound((c) =>
  renderizarErro(
    c,
    404,
    'Página não encontrada',
    'O endereço não existe, ou o registro pertence a outra rede. Use o menu para voltar a uma tela conhecida.',
  ),
);
