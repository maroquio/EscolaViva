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

const EXTENSAO = '.eta';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const DIRETORIO_DE_TEMPLATES = join(RAIZ, 'src', 'web', TEMPLATES.directory);

const caminhosDeclarados = (no: unknown): readonly string[] => {
  if (typeof no === 'string') return no.startsWith('/') ? [no] : [];
  if (typeof no !== 'object' || no === null) return [];
  return Object.values(no).flatMap(caminhosDeclarados);
};

const DECLARADOS = caminhosDeclarados(TEMPLATES);

const arquivosNoDisco = async (): Promise<readonly string[]> => {
  const encontrados: string[] = [];
  for await (const arquivo of new Bun.Glob(`**/*${EXTENSAO}`).scan({ cwd: DIRETORIO_DE_TEMPLATES })) {
    encontrados.push(`/${arquivo.replaceAll('\\', '/').slice(0, -EXTENSAO.length)}`);
  }
  return encontrados.sort();
};

describe('TEMPLATES aponta para arquivos que existem', () => {
  test('a varredura enxerga a pasta — cobertura vazia é falha, não sucesso', async () => {
    const noDisco = await arquivosNoDisco();

    expect(DECLARADOS.length).toBeGreaterThan(0);
    expect(noDisco.length).toBeGreaterThan(0);
  });

  test('todo caminho declarado tem o arquivo correspondente', async () => {
    const semArquivo: string[] = [];
    for (const caminho of DECLARADOS) {
      const arquivo = join(DIRETORIO_DE_TEMPLATES, `${caminho}${EXTENSAO}`);
      if (!(await Bun.file(arquivo).exists())) semArquivo.push(caminho);
    }

    expect(semArquivo).toEqual([]);
  });

  test('todo arquivo tem quem o declare', async () => {
    const noDisco = await arquivosNoDisco();
    const declarados = new Set(DECLARADOS);

    const orfaos = noDisco.filter((caminho) => !declarados.has(caminho));

    expect(orfaos).toEqual([]);
  });
});
