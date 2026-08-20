import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { expect, test } from 'vitest';

const KILOBYTE = 1024;
const GUARDIAN_CEILING_IN_BYTES = 185 * KILOBYTE;

const DATES_PACKAGE = '@mantine/dates';
const DATES_ONLY_VARIABLE = '--day-size';
const TYPESCRIPT_SOURCE = /\.tsx?$/;

const FORM_STACK_MARKS = ['shouldUnregister', 'invalid_type'] as const;

const DIST = new URL('../dist/', import.meta.url);
const SRC = new URL('../src/', import.meta.url);

type Chunk = {
  readonly file: string;
  readonly isEntry?: boolean;
  readonly imports?: readonly string[];
  readonly css?: readonly string[];
};

const manifest = async (): Promise<Record<string, Chunk>> =>
  JSON.parse(await readFile(new URL('.vite/manifest.json', DIST), 'utf8')) as Record<string, Chunk>;

const compressedBytesSomebodyOn4GPaysFor = async (file: string): Promise<number> =>
  gzipSync(await readFile(new URL(file, DIST))).length;

const staticallyReachableFrom = (
  entries: Record<string, Chunk>,
  start: readonly string[],
): Set<string> => {
  const seen = new Set<string>();
  const queue = [...start];
  while (queue.length > 0) {
    const key = queue.shift() as string;
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push(...(entries[key]?.imports ?? []));
  }
  return seen;
};

const filesDownloadedBeforeTheFirstPaint = (chunk: Chunk): string[] => [
  chunk.file,
  ...(chunk.css ?? []),
];

const carriesTheFormStack = async (chunk: Chunk): Promise<boolean> => {
  const code = await readFile(new URL(chunk.file, DIST), 'utf8');
  return FORM_STACK_MARKS.every((mark) => code.includes(mark));
};

const keyOfGuardianChunk = (entries: Record<string, Chunk>): string => {
  const found = Object.keys(entries).find((key) => key.includes('features/guardian/routes'));
  if (found === undefined) throw new Error('a área do responsável não está no manifesto');
  return found;
};

const entryKey = (entries: Record<string, Chunk>): string => {
  const found = Object.entries(entries).find(([, chunk]) => chunk.isEntry === true)?.[0];
  if (found === undefined) throw new Error('o manifesto não tem chunk de entrada');
  return found;
};

test('the walk follows imports transitively, and stopping at one level would miss whatever the imports of the entry themselves pull in — which is where most of the weight lives', () => {
  const entry: Chunk = { file: 'entry.js', imports: ['middle'] };
  const middle: Chunk = { file: 'middle.js', imports: ['deepest'] };
  const deepest: Chunk = { file: 'deepest.js' };

  const reached = staticallyReachableFrom({ entry, middle, deepest }, ['entry']);

  expect([...reached].sort()).toEqual(['deepest', 'entry', 'middle']);
});

test("a guardian downloads no more than the ceiling before seeing their child's report card, and the ceiling is a measured floor plus a margin rather than a target: react-dom, react-router and @mantine/core are on the wire before the first number reaches the screen and no cut inside this code removes them, so what the number guards against is creeping — anything new arriving on that path has to be worth the bytes, and this is where that argument happens", async () => {
  const entries = await manifest();
  const needed = staticallyReachableFrom(entries, [entryKey(entries), keyOfGuardianChunk(entries)]);

  const files = [...needed].flatMap((key) => {
    const chunk = entries[key];
    if (chunk === undefined) return [];
    return filesDownloadedBeforeTheFirstPaint(chunk);
  });

  const bytes = (await Promise.all(files.map(compressedBytesSomebodyOn4GPaysFor))).reduce(
    (total, size) => total + size,
    0,
  );

  expect(bytes).toBeLessThanOrEqual(GUARDIAN_CEILING_IN_BYTES);
});

test('the button sheet comes after the one that strips it — UnstyledButton.css strips the border, the background and the padding and Button.css puts them back at the same specificity, so sorting the imports alphabetically renders every button in the application as bare text, and jsdom is given no node_modules stylesheet to notice it with', async () => {
  const entries = await manifest();
  const stylesheet = Object.values(entries)
    .flatMap((chunk) => chunk.css ?? [])
    .find((file) => file.endsWith('.css'));
  if (stylesheet === undefined) throw new Error('o bundle não tem folha de estilo');

  const css = await readFile(new URL(stylesheet, DIST), 'utf8');
  const unstyledButton = css.indexOf('.m_87cf2631');
  const button = css.indexOf('.m_77c9d27d');

  expect(unstyledButton).toBeGreaterThan(-1);
  expect(button).toBeGreaterThan(-1);
  expect(unstyledButton).toBeLessThan(button);
});

test('every role area is a chunk of its own, and what is asserted is that the chunk exists — turn one import static and the role is folded into the entry, which still works and makes every guardian pay for the registrar, and Rollup leaves no chunk behind at all, so a test looking for its name in the entry imports would find nothing and pass', async () => {
  const entries = await manifest();
  const initial = staticallyReachableFrom(entries, [entryKey(entries)]);

  for (const area of ['guardian', 'registrar', 'teacher', 'network', 'announcements']) {
    const key = Object.keys(entries).find((name) => name.includes(`features/${area}/routes`));
    expect(key, `a área ${area} não tem chunk próprio`).toBeDefined();
    expect(initial.has(key as string), `a área ${area} está no load inicial`).toBe(false);
  }
});

test('no module names `@mantine/dates` and no sheet of its is in the built CSS — every date on screen is an `input type="date"`, which hands the browser its own picker, so that stylesheet would be bytes every guardian downloads for something nobody shows', async () => {
  const sources = (await readdir(SRC, { recursive: true })).filter((name) =>
    TYPESCRIPT_SOURCE.test(name),
  );
  expect(sources.length, 'src/ não tem código para ler').toBeGreaterThan(0);

  for (const name of sources) {
    const source = await readFile(new URL(name, SRC), 'utf8');
    expect(source, `${name} traz @mantine/dates para o bundle`).not.toContain(DATES_PACKAGE);
  }

  const entries = await manifest();
  const stylesheets = [...new Set(Object.values(entries).flatMap((chunk) => chunk.css ?? []))];
  expect(stylesheets.length, 'o bundle não tem folha de estilo').toBeGreaterThan(0);

  for (const file of stylesheets) {
    const css = await readFile(new URL(file, DIST), 'utf8');
    expect(css, `${file} carrega a folha de @mantine/dates`).not.toContain(DATES_ONLY_VARIABLE);
  }
});

test("the form stack is on nobody's way to a report card: react-hook-form, Zod and the resolvers sit behind the `lazy()` on the sign-in and password screens, and the guardian portal has no form at all, so folding either screen back into the entry makes every guardian download a form library to read a number", async () => {
  const entries = await manifest();
  const downloaded = staticallyReachableFrom(entries, [
    entryKey(entries),
    keyOfGuardianChunk(entries),
  ]);

  const carrying: string[] = [];
  for (const [key, chunk] of Object.entries(entries)) {
    if (await carriesTheFormStack(chunk)) carrying.push(key);
  }

  expect(
    carrying,
    'nenhum chunk traz react-hook-form e zod: as marcas mudaram e o teste virou enfeite',
  ).not.toHaveLength(0);
  expect(carrying.filter((key) => downloaded.has(key))).toEqual([]);
});
