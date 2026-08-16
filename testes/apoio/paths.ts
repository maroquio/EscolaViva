/*
 * Enquanto o repositório é convertido para inglês, cada caminho existe sob dois nomes em
 * momentos diferentes. Um teste que fixa o nome antigo quebra no commit do renome; um que
 * fixa o novo quebra antes dele. Os dois casos obrigam a mudar pasta e teste no mesmo
 * instante, que é justamente o que o plano proíbe.
 *
 * `firstExistingPath` resolve entre as grafias e falha alto quando nenhuma existe — o que
 * um `Bun.file(...).text()` de caminho errado não faz: ele devolve string vazia, e a
 * asserção seguinte passa sem ter lido nada.
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
