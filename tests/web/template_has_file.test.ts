/*
 * `TEMPLATES` guarda 49 caminhos que o Eta resolve em tempo de execução: um valor errado só
 * aparece quando alguém abre aquela tela. Nem o compilador nem o depcruiser ligam o valor ao
 * arquivo — e a migração para inglês renomeia os dois lados, em arquivos diferentes.
 *
 * Este par de casos é a amarra que faltava: todo caminho declarado tem arquivo, e todo
 * arquivo tem quem o declare. O segundo é o que pega o renome pela metade, em que o `.eta`
 * mudou de nome e a constante ficou apontando para o nome antigo — ou o contrário.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATES } from '../../src/web/constants';

const EXTENSION = '.eta';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TEMPLATES_DIR = join(ROOT, 'src', 'web', TEMPLATES.directory);

const declaredPaths = (no: unknown): readonly string[] => {
  if (typeof no === 'string') return no.startsWith('/') ? [no] : [];
  if (typeof no !== 'object' || no === null) return [];
  return Object.values(no).flatMap(declaredPaths);
};

const DECLARED = declaredPaths(TEMPLATES);

const filesOnDisk = async (): Promise<readonly string[]> => {
  const found: string[] = [];
  for await (const file of new Bun.Glob(`**/*${EXTENSION}`).scan({ cwd: TEMPLATES_DIR })) {
    found.push(`/${file.replaceAll('\\', '/').slice(0, -EXTENSION.length)}`);
  }
  return found.sort();
};

describe('TEMPLATES aponta para arquivos que existem', () => {
  test('a varredura enxerga a pasta — cobertura vazia é falha, não sucesso', async () => {
    const onDisk = await filesOnDisk();

    expect(DECLARED.length).toBeGreaterThan(0);
    expect(onDisk.length).toBeGreaterThan(0);
  });

  test('todo caminho declarado tem o arquivo correspondente', async () => {
    const withoutFile: string[] = [];
    for (const path of DECLARED) {
      const file = join(TEMPLATES_DIR, `${path}${EXTENSION}`);
      if (!(await Bun.file(file).exists())) withoutFile.push(path);
    }

    expect(withoutFile).toEqual([]);
  });

  test('todo arquivo tem quem o declare', async () => {
    const onDisk = await filesOnDisk();
    const declared = new Set(DECLARED);

    const orphans = onDisk.filter((path) => !declared.has(path));

    expect(orphans).toEqual([]);
  });
});
