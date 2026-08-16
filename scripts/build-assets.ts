import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ASSETS } from '../src/shared/constants';

const ROOT = join(import.meta.dir, '..');

const SOURCE = join(ROOT, 'src', 'web', 'public', 'app.css');

const DEST = join(ROOT, ASSETS.directory);

const NAME_SEPARATOR = '.';

const [STYLESHEET_BASE, STYLESHEET_EXTENSION] =
  ASSETS.stylesheetLogicalName.split(NAME_SEPARATOR);

const MANIFEST_INDENT = 2;

const HASHED_FILE = /^app\.[0-9a-f]{8}\.css$/;

const computeHash = (content: string): string =>
  new Bun.CryptoHasher(ASSETS.hashAlgorithm)
    .update(content)
    .digest(ASSETS.hashEncoding)
    .slice(0, ASSETS.hashCharacters);

const publishedName = (hash: string): string =>
  [STYLESHEET_BASE, hash, STYLESHEET_EXTENSION].join(NAME_SEPARATOR);

const outputLine = (name: string): string => `${ASSETS.directory}/${name}`;

const removeOldVersions = (keep: string): void => {
  for (const name of readdirSync(DEST)) {
    if (name === keep || !HASHED_FILE.test(name)) continue;
    rmSync(join(DEST, name));
  }
};

async function publish(): Promise<void> {
  const css = await Bun.file(SOURCE).text();
  const hashedName = publishedName(computeHash(css));

  mkdirSync(DEST, { recursive: true });
  await Bun.write(join(DEST, hashedName), css);
  await Bun.write(
    join(DEST, ASSETS.manifest),
    `${JSON.stringify(
      { [ASSETS.stylesheetLogicalName]: hashedName },
      null,
      MANIFEST_INDENT,
    )}\n`,
  );
  removeOldVersions(hashedName);

  process.stdout.write(`${outputLine(hashedName)}\n${outputLine(ASSETS.manifest)}\n`);
}

await publish();
