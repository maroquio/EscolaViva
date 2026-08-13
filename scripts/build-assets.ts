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
 */

import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dir, '..');
const ORIGEM = join(RAIZ, 'src', 'web', 'publico', 'app.css');
const DESTINO = join(RAIZ, 'publico');
const NOME_LOGICO = 'app.css';
const MANIFESTO = 'manifest.json';
const CARACTERES_DE_HASH = 8;

/** Só os arquivos que este script gera são candidatos a remoção. */
const ARQUIVO_COM_HASH = /^app\.[0-9a-f]{8}\.css$/;

const calcularHash = (conteudo: string): string =>
  new Bun.CryptoHasher('sha256').update(conteudo).digest('hex').slice(0, CARACTERES_DE_HASH);

const removerVersoesAntigas = (manter: string): void => {
  for (const nome of readdirSync(DESTINO)) {
    if (nome === manter || !ARQUIVO_COM_HASH.test(nome)) continue;
    rmSync(join(DESTINO, nome));
  }
};

async function publicar(): Promise<void> {
  const css = await Bun.file(ORIGEM).text();
  const nomeComHash = `app.${calcularHash(css)}.css`;

  mkdirSync(DESTINO, { recursive: true });
  await Bun.write(join(DESTINO, nomeComHash), css);
  await Bun.write(
    join(DESTINO, MANIFESTO),
    `${JSON.stringify({ [NOME_LOGICO]: nomeComHash }, null, 2)}\n`,
  );
  removerVersoesAntigas(nomeComHash);

  process.stdout.write(`publico/${nomeComHash}\npublico/${MANIFESTO}\n`);
}

await publicar();
