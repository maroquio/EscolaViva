import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ASSETS } from '../src/shared/constants';

const RAIZ = join(import.meta.dir, '..');

const ORIGEM = join(RAIZ, 'src', 'web', 'publico', 'app.css');

const DESTINO = join(RAIZ, ASSETS.directory);

const SEPARADOR_DE_NOME = '.';

const [BASE_DA_FOLHA, EXTENSAO_DA_FOLHA] = ASSETS.stylesheetLogicalName.split(SEPARADOR_DE_NOME);

const INDENTACAO_DO_MANIFESTO = 2;

const ARQUIVO_COM_HASH = /^app\.[0-9a-f]{8}\.css$/;

const calcularHash = (conteudo: string): string =>
  new Bun.CryptoHasher(ASSETS.hashAlgorithm)
    .update(conteudo)
    .digest(ASSETS.hashEncoding)
    .slice(0, ASSETS.hashCharacters);

const nomePublicado = (hash: string): string =>
  [BASE_DA_FOLHA, hash, EXTENSAO_DA_FOLHA].join(SEPARADOR_DE_NOME);

const linhaDeSaida = (nome: string): string => `${ASSETS.directory}/${nome}`;

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
    join(DESTINO, ASSETS.manifest),
    `${JSON.stringify(
      { [ASSETS.stylesheetLogicalName]: nomeComHash },
      null,
      INDENTACAO_DO_MANIFESTO,
    )}\n`,
  );
  removerVersoesAntigas(nomeComHash);

  process.stdout.write(`${linhaDeSaida(nomeComHash)}\n${linhaDeSaida(ASSETS.manifest)}\n`);
}

await publicar();
