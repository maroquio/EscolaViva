/*
 * While the repository is converted to English, every path exists under two names at
 * different moments. A test that pins the old name breaks at the rename commit; one that
 * pins the new name breaks before it. Either case forces folder and test to move in the same
 * instant, which is precisely what the plan forbids.
 *
 * `firstExistingPath` resolves between the spellings and fails loudly when none of them
 * exists — which a `Bun.file(...).text()` on a wrong path does not do: it hands back an empty
 * string, and the assertion that follows passes without having read anything.
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));

export const firstExistingPath = async (...candidates: readonly string[]): Promise<string> => {
  for (const candidate of candidates) {
    if (await Bun.file(join(PROJECT_ROOT, candidate)).exists()) return candidate;
  }
  throw new Error(
    `nenhum destes caminhos existe: ${candidates.join(', ')}.\n` +
      'Um renome aconteceu sem que a lista de grafias fosse atualizada — corrija a lista ' +
      'antes de confiar em qualquer resultado deste arquivo.',
  );
};

export const firstExistingDir = async (...candidates: readonly string[]): Promise<string> => {
  for (const candidate of candidates) {
    const glob = new Bun.Glob('**/*');
    for await (const _ of glob.scan({ cwd: join(PROJECT_ROOT, candidate), onlyFiles: true })) {
      return candidate;
    }
  }
  throw new Error(
    `nenhuma destas pastas existe ou todas estão vazias: ${candidates.join(', ')}.\n` +
      'Uma varredura sobre pasta inexistente não acusa nada e passa como se estivesse limpa.',
  );
};
