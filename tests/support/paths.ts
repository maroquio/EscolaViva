/*
 * A test that reads a file by path has one silent failure mode: `Bun.file(...).text()` on a path
 * that does not exist hands back an empty string instead of raising. The assertion that follows
 * then passes without having read anything, and the file keeps reporting success after the thing
 * it guards was renamed or deleted.
 *
 * `existingPath` closes that hole: it returns the path only if it is there, and fails loudly
 * naming the path when it is not.
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));

export const existingPath = async (path: string): Promise<string> => {
  if (await Bun.file(join(PROJECT_ROOT, path)).exists()) return path;
  throw new Error(
    `este caminho não existe: ${path}.\n` +
      'Um renome aconteceu sem que o caminho fosse atualizado — corrija-o antes de confiar ' +
      'em qualquer resultado deste arquivo.',
  );
};
