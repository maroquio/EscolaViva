import { describe, expect, test } from 'bun:test';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..');

const CODE_DIRECTORIES = ['src', 'scripts'] as const;

const CODE_FILES = '**/*.{ts,eta,css,sh}';

const MAGIC_VALUES_DIRECTIVE = /magic-values:\s*allowed\s*[—-]\s*\S/;

const SCRIPT_OPENING = '<script>';
const SCRIPT_CLOSING = '</script>';
const ETA_OPENING = '<%';
const ETA_CLOSING = '%>';

type Comment = {
  readonly file: string;
  readonly row: number;
  readonly text: string;
};

type Finding = { readonly row: number; readonly text: string };

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
  eta: etaComments,
  css: cssComments,
  sh: shellComments,
};

const extensionOf = (path: string): string => path.slice(path.lastIndexOf('.') + 1);

async function codeComments(): Promise<Comment[]> {
  const glob = new Bun.Glob(CODE_FILES);
  const comments: Comment[] = [];
  for (const directory of CODE_DIRECTORIES) {
    const directoryRoot = join(ROOT, directory);
    for await (const found of glob.scan({ cwd: directoryRoot })) {
      const path = join(directoryRoot, found);
      const read = READER_BY_EXTENSION[extensionOf(found)];
      if (read === undefined) continue;
      const content = await Bun.file(path).text();
      for (const finding of read(content)) {
        comments.push({ file: relative(ROOT, path), row: finding.row, text: finding.text });
      }
    }
  }
  return comments;
}

const onOneLine = (comment: Comment): string =>
  `${comment.file}:${comment.row}: ${comment.text.split('\n')[0]}`;

describe('the code carries no comment', () => {
  test('no comment is left in src/ or scripts/ beyond the tool directives', async () => {
    const comments = await codeComments();

    const remainders = comments.filter(({ text }) => !MAGIC_VALUES_DIRECTIVE.test(text));

    expect(remainders.map(onOneLine)).toEqual([]);
  });

  test('the rule holds for the stylesheet and for the shell scripts too', async () => {
    const comments = await codeComments();

    const byExtension = new Set(comments.map(({ file }) => extensionOf(file)));

    expect(byExtension.has('css')).toBe(false);
    expect(byExtension.has('sh')).toBe(false);
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
      cssComments('.a { color: red; } /* sobrou */'),
      etaComments('<p>oi</p>\n<% /* sobrou */ %>'),
      shellComments('#!/usr/bin/env bash\n# sobrou'),
    ];

    expect(findings.map((finding) => finding.length)).toEqual([1, 1, 1, 1]);
  });

  test('the reader does not mistake quoted text for a comment', () => {
    const urlInJs = jsComments("const url = 'https://exemplo.test/a';");
    const urlInCss = cssComments(".a { background-image: url('/*nao*/.svg'); }");
    const regularExpression = jsComments('const r = /^\\s*\\/\\//;');
    const hashInCommand = shellComments("sed -E 's#://[^@/]+@#://***@#'");

    expect([urlInJs, urlInCss, regularExpression, hashInCommand].map((a) => a.length)).toEqual([
      0, 0, 0, 0,
    ]);
  });
});
