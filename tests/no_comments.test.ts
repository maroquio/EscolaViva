import { describe, expect, test } from 'bun:test';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dir, '..');

const FRONT_DIRECTORY = 'apps/web/src';

const CODE_DIRECTORIES = [
  'apps/api/src',
  FRONT_DIRECTORY,
  'packages/contracts/src',
  'scripts',
] as const;

const CODE_FILES = '**/*.{ts,tsx,eta,css,sh}';

const FRONT_EXTENSIONS = ['tsx', 'css'] as const;

const MAGIC_VALUES_DIRECTIVE = /magic-values:\s*allowed\s*[—-]\s*\S/;
const REFERENCE_DIRECTIVE = /^\/\/\/\s*<reference\s/;

const SCRIPT_OPENING = '<script>';
const SCRIPT_CLOSING = '</script>';
const ETA_OPENING = '<%';
const ETA_CLOSING = '%>';

const QUOTE_THAT_CROSSES_LINES = '`';
const URL_SCHEME_END = ':';

type Comment = {
  readonly file: string;
  readonly row: number;
  readonly text: string;
};

type Finding = { readonly row: number; readonly text: string };

type Swept = { readonly file: string; readonly comments: readonly Finding[] };

const rowAt = (content: string, position: number): number =>
  content.slice(0, position).split('\n').length;

function skipLiteral(content: string, start: number, quotes: string): number {
  let i = start + 1;
  while (i < content.length) {
    if (content[i] === '\\') {
      i += 2;
      continue;
    }
    if (content[i] === quotes) return i + 1;
    if (content[i] === '\n' && quotes !== QUOTE_THAT_CROSSES_LINES) return i;
    i += 1;
  }
  return i;
}

function jsComments(content: string, firstRow = 1): Finding[] {
  const findings: Finding[] = [];
  let i = 0;
  while (i < content.length) {
    const character = content[i];
    if (character === '"' || character === "'" || character === '`') {
      i = skipLiteral(content, i, character);
      continue;
    }
    if (character === '\\') {
      i += 2;
      continue;
    }
    if (character === '/' && content[i + 1] === '/') {
      if (content[i - 1] === URL_SCHEME_END) {
        i += 2;
        continue;
      }
      const breaks = content.indexOf('\n', i);
      const end = breaks === -1 ? content.length : breaks;
      findings.push({
        row: rowAt(content, i) + firstRow - 1,
        text: content.slice(i, end),
      });
      i = end;
      continue;
    }
    if (character === '/' && content[i + 1] === '*') {
      const shutdown = content.indexOf('*/', i + 2);
      const end = shutdown === -1 ? content.length : shutdown + 2;
      findings.push({
        row: rowAt(content, i) + firstRow - 1,
        text: content.slice(i, end),
      });
      i = end;
      continue;
    }
    i += 1;
  }
  return findings;
}

function cssComments(content: string): Finding[] {
  const findings: Finding[] = [];
  let i = 0;
  while (i < content.length) {
    const character = content[i];
    if (character === '"' || character === "'") {
      i = skipLiteral(content, i, character);
      continue;
    }
    if (character === '/' && content[i + 1] === '*') {
      const shutdown = content.indexOf('*/', i + 2);
      const end = shutdown === -1 ? content.length : shutdown + 2;
      findings.push({ row: rowAt(content, i), text: content.slice(i, end) });
      i = end;
      continue;
    }
    i += 1;
  }
  return findings;
}

function delimitedSnippets(
  content: string,
  opening: string,
  closing: string,
): { readonly text: string; readonly firstRow: number }[] {
  const snippets: { text: string; firstRow: number }[] = [];
  let i = 0;
  while (i < content.length) {
    const opens = content.indexOf(opening, i);
    if (opens === -1) break;
    const start = opens + opening.length;
    const closes = content.indexOf(closing, start);
    const end = closes === -1 ? content.length : closes;
    snippets.push({ text: content.slice(start, end), firstRow: rowAt(content, start) });
    i = end + closing.length;
  }
  return snippets;
}

function etaComments(content: string): Finding[] {
  const blocks = [
    ...delimitedSnippets(content, ETA_OPENING, ETA_CLOSING),
    ...delimitedSnippets(content, SCRIPT_OPENING, SCRIPT_CLOSING),
  ];
  return blocks.flatMap((block) => jsComments(block.text, block.firstRow));
}

function shellComments(content: string): Finding[] {
  return content.split('\n').flatMap((line, index) => {
    const isShebang = index === 0 && line.startsWith('#!');
    if (isShebang || !line.trimStart().startsWith('#')) return [];
    return [{ row: index + 1, text: line.trim() }];
  });
}

const READER_BY_EXTENSION: Record<string, (content: string) => Finding[]> = {
  ts: jsComments,
  tsx: jsComments,
  eta: etaComments,
  css: cssComments,
  sh: shellComments,
};

const extensionOf = (path: string): string => path.slice(path.lastIndexOf('.') + 1);

const isToolDirective = (text: string): boolean =>
  MAGIC_VALUES_DIRECTIVE.test(text) || REFERENCE_DIRECTIVE.test(text);

async function sweep(): Promise<Swept[]> {
  const glob = new Bun.Glob(CODE_FILES);
  const swept: Swept[] = [];
  for (const directory of CODE_DIRECTORIES) {
    const directoryRoot = join(ROOT, directory);
    for await (const found of glob.scan({ cwd: directoryRoot })) {
      const read = READER_BY_EXTENSION[extensionOf(found)];
      if (read === undefined) continue;
      const path = join(directoryRoot, found);
      const content = await Bun.file(path).text();
      swept.push({ file: relative(ROOT, path), comments: read(content) });
    }
  }
  return swept;
}

const commentsIn = (swept: readonly Swept[]): Comment[] =>
  swept.flatMap(({ file, comments }) => comments.map(({ row, text }) => ({ file, row, text })));

const onOneLine = (comment: Comment): string =>
  `${comment.file}:${comment.row}: ${comment.text.split('\n')[0]}`;

describe('the code carries no comment', () => {
  test('no comment is left in src/ or scripts/ beyond the tool directives', async () => {
    const comments = commentsIn(await sweep());

    const remainders = comments.filter(({ text }) => !isToolDirective(text));

    expect(remainders.map(onOneLine)).toEqual([]);
  });

  test('the rule holds for the stylesheet and for the shell scripts too', async () => {
    const comments = commentsIn(await sweep());

    const byExtension = new Set(comments.map(({ file }) => extensionOf(file)));

    expect(byExtension.has('css')).toBe(false);
    expect(byExtension.has('sh')).toBe(false);
  });

  test('the sweep reaches the front, .tsx and stylesheet module included', async () => {
    const swept = await sweep();

    const read = new Set(
      swept
        .filter(({ file }) => file.startsWith(FRONT_DIRECTORY))
        .map(({ file }) => extensionOf(file)),
    );

    const unread = FRONT_EXTENSIONS.filter((extension) => !read.has(extension)).map(
      (extension) => `${FRONT_DIRECTORY}/**/*.${extension}`,
    );

    expect(unread).toEqual([]);
  });

  test('the shebang of the shell scripts is still on the first line', async () => {
    const scripts = ['scripts/backup.sh', 'scripts/restore-test.sh'];

    const firstOnes = await Promise.all(
      scripts.map(async (script) => (await Bun.file(join(ROOT, script)).text()).split('\n')[0]),
    );

    expect(firstOnes).toEqual(['#!/usr/bin/env bash', '#!/usr/bin/env bash']);
  });

  test('the reader does see the comment the rule forbids, in each language', () => {
    const findings = [
      jsComments('const a = 1; // sobrou'),
      jsComments('<div>{/* sobrou */}</div>'),
      cssComments('.a { color: red; } /* sobrou */'),
      etaComments('<p>oi</p>\n<% /* sobrou */ %>'),
      shellComments('#!/usr/bin/env bash\n# sobrou'),
    ];

    expect(findings.map((finding) => finding.length)).toEqual([1, 1, 1, 1, 1]);
  });

  test('the reader does not mistake quoted text for a comment', () => {
    const urlInJs = jsComments("const url = 'https://exemplo.test/a';");
    const urlInJsxText = jsComments('<Text>https://exemplo.test/a</Text>');
    const urlInCss = cssComments(".a { background-image: url('/*nao*/.svg'); }");
    const regularExpression = jsComments('const r = /^\\s*\\/\\//;');
    const hashInCommand = shellComments("sed -E 's#://[^@/]+@#://***@#'");

    expect(
      [urlInJs, urlInJsxText, urlInCss, regularExpression, hashInCommand].map((a) => a.length),
    ).toEqual([0, 0, 0, 0, 0]);
  });

  test('the route wildcard and the quoted word do not swallow the lines below them', () => {
    const route = jsComments("const area = '/network/*';\nconst a = 1; // sobrou");
    const quoted = jsComments("<Text>pingo d'agua</Text>\nconst a = 1; // sobrou");

    expect([route, quoted].map((finding) => finding.map(({ row }) => row))).toEqual([[2], [2]]);
  });

  test('the tool directive is read as directive, and prose is not', () => {
    const reference = '/// <reference types="vite/client" />';
    const suppression = '// magic-values: allowed — 2^32, o divisor do mulberry32';
    const prose = '// esta linha diz o que a de baixo já diz';

    expect([reference, suppression, prose].map(isToolDirective)).toEqual([true, true, false]);
  });
});
