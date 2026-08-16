/*
 * `TEMPLATES` holds 49 paths that Eta resolves at run time: a wrong value only surfaces when
 * someone opens that screen. Neither the compiler nor depcruise ties the value to the file — and
 * the migration to English renames both sides, in different files.
 *
 * This pair of cases is the tie that was missing: every declared path has a file, and every file
 * has someone declaring it. The second one catches the half-finished rename, where the `.eta`
 * changed name and the constant kept pointing at the old one — or the other way around.
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

describe('TEMPLATES points at files that exist', () => {
  test('the sweep does see the folder — an empty sweep is a failure, not a success', async () => {
    const onDisk = await filesOnDisk();

    expect(DECLARED.length).toBeGreaterThan(0);
    expect(onDisk.length).toBeGreaterThan(0);
  });

  test('every declared path has the file that goes with it', async () => {
    const withoutFile: string[] = [];
    for (const path of DECLARED) {
      const file = join(TEMPLATES_DIR, `${path}${EXTENSION}`);
      if (!(await Bun.file(file).exists())) withoutFile.push(path);
    }

    expect(withoutFile).toEqual([]);
  });

  test('every file has someone declaring it', async () => {
    const onDisk = await filesOnDisk();
    const declared = new Set(DECLARED);

    const orphans = onDisk.filter((path) => !declared.has(path));

    expect(orphans).toEqual([]);
  });
});
