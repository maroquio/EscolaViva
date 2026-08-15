/**
 * I10 — o nome do arquivo carrega o hash do conteúdo.
 *
 * `src/web/publico/app.css` é a fonte; aqui nasce `publico/app.<hash>.css` mais um
 * `manifest.json` que o helper `asset('app.css')` consulta no render. Trocar o CSS troca o nome,
 * e por isso a resposta pode dizer `immutable` sem risco de servir folha velha. Não existe CDN no
 * Estágio 01 — mas quando existir, não haverá purga manual, que é exatamente o ponto.
 *
 * Executar duas vezes seguidas produz o mesmo resultado: os arquivos com hash antigo são
 * removidos, e o do hash atual é reescrito com o mesmo conteúdo.
 *
 * As duas pontas deste script — a chave do manifesto e a pasta de saída — são as MESMAS que
 * `src/web/render.ts` lê em tempo de requisição, e por isso vêm de `ATIVOS`, em
 * `src/shared/constantes.ts`. Um build que escreve `app.css` e um render que procura `estilo.css`
 * sobem os dois sem erro e servem a página sem estilo nenhum.
 */

import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ATIVOS } from '../src/shared/constantes';

const RAIZ = join(import.meta.dir, '..');

/**
 * A folha AUTORAL. O `publico` deste caminho é a pasta onde o CSS é escrito à mão dentro da camada
 * web, e não o `ATIVOS.diretorio` de saída na raiz do repositório: coincidem em texto e são duas
 * decisões independentes — mover a pasta de saída não obriga a mover o arquivo-fonte.
 */
const ORIGEM = join(RAIZ, 'src', 'web', 'publico', 'app.css');

/** A pasta publicada — a mesma de onde `render.ts` lê o manifesto. */
const DESTINO = join(RAIZ, ATIVOS.diretorio);

/** O ponto que separa nome, hash e extensão: o nome lógico `app.css` publica como `app.<hash>.css`. */
const SEPARADOR_DE_NOME = '.';

const [BASE_DA_FOLHA, EXTENSAO_DA_FOLHA] = ATIVOS.nomeLogicoDaFolha.split(SEPARADOR_DE_NOME);

/** Recuo do `manifest.json`: arquivo gerado, mas lido por humano quando o CSS não atualiza. */
const INDENTACAO_DO_MANIFESTO = 2;

/**
 * Só os arquivos que este script gera são candidatos a remoção.
 *
 * A expressão espelha o que `nomePublicado` monta e o `ATIVOS.caracteresDeHash` que `calcularHash`
 * corta. Fica literal de propósito: montar regex por concatenação para reaproveitar as constantes
 * trocaria uma duplicação legível por uma string que ninguém consegue ler de uma vez.
 */
const ARQUIVO_COM_HASH = /^app\.[0-9a-f]{8}\.css$/;

const calcularHash = (conteudo: string): string =>
  new Bun.CryptoHasher(ATIVOS.algoritmoDeHash)
    .update(conteudo)
    .digest(ATIVOS.codificacaoDeHash)
    .slice(0, ATIVOS.caracteresDeHash);

/** O nome lógico com o hash enfiado antes da extensão. */
const nomePublicado = (hash: string): string =>
  [BASE_DA_FOLHA, hash, EXTENSAO_DA_FOLHA].join(SEPARADOR_DE_NOME);

/** Como o arquivo aparece no terminal: separador de URL, não caminho do sistema de arquivos. */
const linhaDeSaida = (nome: string): string => `${ATIVOS.diretorio}/${nome}`;

const removerVersoesAntigas = (manter: string): void => {
  for (const nome of readdirSync(DESTINO)) {
    if (nome === manter || !ARQUIVO_COM_HASH.test(nome)) continue;
    rmSync(join(DESTINO, nome));
  }
};

async function publicar(): Promise<void> {
  const css = await Bun.file(ORIGEM).text();
  const nomeComHash = nomePublicado(calcularHash(css));

  mkdirSync(DESTINO, { recursive: true });
  await Bun.write(join(DESTINO, nomeComHash), css);
  await Bun.write(
    join(DESTINO, ATIVOS.manifesto),
    `${JSON.stringify(
      { [ATIVOS.nomeLogicoDaFolha]: nomeComHash },
      null,
      INDENTACAO_DO_MANIFESTO,
    )}\n`,
  );
  removerVersoesAntigas(nomeComHash);

  process.stdout.write(`${linhaDeSaida(nomeComHash)}\n${linhaDeSaida(ATIVOS.manifesto)}\n`);
}

await publicar();
