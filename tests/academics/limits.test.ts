import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { LIMITS } from '../../src/academics/constants';

const ENTITIES_WITH_NAME_LIMIT = ['student', 'subject', 'guardian', 'classGroup'] as const;

type EntityWithNameLimit = (typeof ENTITIES_WITH_NAME_LIMIT)[number];

type NamePolicy = { readonly name: number };

const NAME_POLICIES: Readonly<Record<EntityWithNameLimit, NamePolicy>> = LIMITS;

const WHY_MERGING_IS_THE_DEFECT =
  'cada uma destas entidades tem sua própria política de tamanho de nome, e elas apenas coincidem hoje: ' +
  'trocá-las por uma constante compartilhada faz uma decisão sobre uma entidade arrastar as outras três. ' +
  'classGroup.name é a que diverge, e é a prova de que a regra não é uma só; fundido, ele subiria junto com os ' +
  'demais em nome da consistência e o formulário de turma passaria a aceitar um nome que a política da ' +
  'turma recusa. Para mudar um limite, mude o número daquela entidade e deixe os outros três onde estão.';

const CONSTANTS_RELATIVE_PATH = 'src/academics/constants.ts';

const PROJECT_ROOT = join(import.meta.dir, '..', '..');

const HANDWRITTEN_NUMBER = /^\d[\d_]*$/;

const NAME_DECLARATION = /(?:^|[{,])\s*name\s*:\s*([^,}\n]+)/;

const MISSING = '(nenhuma entrada `name` própria)';

const constantsSource = (): Promise<string> =>
  Bun.file(join(PROJECT_ROOT, CONSTANTS_RELATIVE_PATH)).text();

const braceBlock = (source: string, startingAt: number): string => {
  const opening = source.indexOf('{', startingAt);
  if (opening < 0) {
    throw new Error(
      `nenhum bloco depois da posição ${startingAt} em ${CONSTANTS_RELATIVE_PATH}`,
    );
  }
  let depth = 0;
  for (let position = opening; position < source.length; position += 1) {
    if (source[position] === '{') {
      depth += 1;
    } else if (source[position] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(opening, position + 1);
      }
    }
  }
  throw new Error(`bloco aberto em ${opening} não fecha em ${CONSTANTS_RELATIVE_PATH}`);
};

const limitsBlock = (source: string): string => {
  const declaration = source.indexOf('export const LIMITS');
  if (declaration < 0) {
    throw new Error(`${CONSTANTS_RELATIVE_PATH} não declara mais LIMITS`);
  }
  return braceBlock(source, declaration);
};

const howTheNameLimitIsWritten = (source: string, entity: EntityWithNameLimit): string => {
  const limits = limitsBlock(source);
  const key = new RegExp(`(?:^|[{,])\\s*${entity}\\s*:`).exec(limits);
  if (key === null) {
    return MISSING;
  }
  return NAME_DECLARATION.exec(braceBlock(limits, key.index))?.[1]?.trim() ?? MISSING;
};

const entitiesWithoutTheirOwnNumber = (source: string): string[] =>
  ENTITIES_WITH_NAME_LIMIT.map((entity) => ({
    entity,
    written: howTheNameLimitIsWritten(source, entity),
  }))
    .filter(({ written }) => !HANDWRITTEN_NUMBER.test(written))
    .map(
      ({ entity, written }) =>
        `LIMITS.${entity}.name está escrito como \`${written}\` em vez de um número só dele — ${WHY_MERGING_IS_THE_DEFECT}`,
    );

const SOURCE_WITH_THE_FOUR_MERGED = `
const LIMITE_DE_NOME = 120;
export const LIMITS = {
  student: { name: LIMITE_DE_NOME, searchRows: 50 },
  subject: { name: LIMITE_DE_NOME },
  guardian: { name: LIMITE_DE_NOME, email: 254, phone: 30 },
  classGroup: { name: LIMITE_DE_NOME, gradeLevel: 60 },
} as const;
`;

const SOURCE_WITH_THE_DRAGGED_CLASS_GROUP = `
export const LIMITS = {
  student: { name: 120, searchRows: 50 },
  subject: { name: 120 },
  guardian: { name: 120, email: 254, phone: 30 },
  classGroup: { name: LIMITS.student.name, gradeLevel: 60 },
} as const;
`;

const SOURCE_WITH_THE_NAME_SPREAD_FROM_A_PATTERN = `
const PADRAO = { name: 120 };
export const LIMITS = {
  student: { ...PADRAO, searchRows: 50 },
  subject: { ...PADRAO },
  guardian: { ...PADRAO, email: 254, phone: 30 },
  classGroup: { ...PADRAO, gradeLevel: 60 },
} as const;
`;

describe('os quatro limites de nome do acadêmico são quatro políticas, e não uma', () => {
  test('cada entidade escreve o próprio número, e nenhuma aponta para constante compartilhada', async () => {
    const merged = entitiesWithoutTheirOwnNumber(await constantsSource());

    expect(merged).toEqual([]);
  });

  test('a leitura do arquivo é a mesma coisa que o módulo exporta, e não uma varredura em branco', async () => {
    const source = await constantsSource();

    const read = ENTITIES_WITH_NAME_LIMIT.map((entity) =>
      Number(howTheNameLimitIsWritten(source, entity).replaceAll('_', '')),
    );

    expect(read).toEqual(ENTITIES_WITH_NAME_LIMIT.map((e) => NAME_POLICIES[e].name));
  });

  test('o objeto exportado guarda quatro entradas `nome` próprias, uma por entidade', () => {
    const withoutOwnEntry = ENTITIES_WITH_NAME_LIMIT.filter(
      (entity) =>
        typeof Object.getOwnPropertyDescriptor(NAME_POLICIES[entity], 'name')?.value !==
        'number',
    ).map(
      (entity) =>
        `LIMITS.${entity} não tem entrada \`name\` própria — ${WHY_MERGING_IS_THE_DEFECT}`,
    );

    expect(withoutOwnEntry).toEqual([]);
  });

  test('nenhuma entidade empresta o objeto de outra: quatro donos distintos', () => {
    const borrowed = ENTITIES_WITH_NAME_LIMIT.flatMap((entity, index) =>
      ENTITIES_WITH_NAME_LIMIT.slice(index + 1)
        .filter((other) => NAME_POLICIES[entity] === NAME_POLICIES[other])
        .map(
          (other) =>
            `LIMITS.${entity} e LIMITS.${other} são o mesmo objeto — ${WHY_MERGING_IS_THE_DEFECT}`,
        ),
    );

    expect(borrowed).toEqual([]);
  });
});

describe('a verificação de fusão reprova de fato o arquivo fundido', () => {
  test('uma constante única para os quatro é acusada nas quatro entidades', () => {
    const merged = entitiesWithoutTheirOwnNumber(SOURCE_WITH_THE_FOUR_MERGED);

    expect(merged.length).toBe(ENTITIES_WITH_NAME_LIMIT.length);
    expect(merged.join('\n')).toContain('LIMITE_DE_NOME');
  });

  test('arrastar só a turma para o limite do aluno já é acusado', () => {
    const merged = entitiesWithoutTheirOwnNumber(SOURCE_WITH_THE_DRAGGED_CLASS_GROUP);

    expect(merged.length).toBe(1);
    expect(merged.join('\n')).toContain('LIMITS.classGroup.name');
  });

  test('espalhar um padrão comum apaga as entradas próprias e é acusado nas quatro', () => {
    const merged = entitiesWithoutTheirOwnNumber(SOURCE_WITH_THE_NAME_SPREAD_FROM_A_PATTERN);

    expect(merged.length).toBe(ENTITIES_WITH_NAME_LIMIT.length);
    expect(merged.join('\n')).toContain(MISSING);
  });

  test('a acusação diz por que fundir é o defeito, e não só que algo mudou', () => {
    const merged = entitiesWithoutTheirOwnNumber(SOURCE_WITH_THE_FOUR_MERGED);

    expect(merged.every((accusation) => accusation.includes(WHY_MERGING_IS_THE_DEFECT))).toBe(true);
  });
});
