/*
 * One import statement per module path, per file — on both sides of the repository.
 *
 * On 2026-08-19 fourteen files in the API imported twice from the same module — `import
 * { FORM_ERRORS } from '../constants'` on one line and `import { API_ROUTES } from '../constants'`
 * a few lines below — and seventeen files in the front did the same with `shared/api`, one of them
 * with two plain value imports. Nothing was broken by it, and that is the problem: the second
 * statement is where a name gets added without anyone reading what the first one already brought,
 * and the import block stops answering "what does this file depend on?" at a glance.
 *
 * The test suites are swept too. `apps/web/src` holds its own tests, so leaving `apps/api/tests`
 * out would have made the rule mean one thing on one side of the repository and another on the
 * other — and the sweep found a repetition there as well.
 *
 * A linter would be the usual answer. Biome was measured against this repository on the same day
 * and does not carry a rule for it — `noDuplicateImports` does not exist there — so adopting a
 * dependency would have cost a package and still left this uncovered. This file costs nothing and
 * covers exactly it, in the same shape as `no_comments.test.ts`.
 *
 * Type and value imports from the same module count as duplicates on purpose: TypeScript writes
 * both in one statement — `import { unitOfWork, type Connection }` — and that is the form this
 * codebase already uses.
 *
 * A namespace import does not count, because the language offers no way to merge it with a named
 * one: `import * as ns, { type X } from 'm'` is a syntax error. Refusing what cannot be fixed turns
 * a guard into an obstacle, so `import * as classGroups` next to `import type { ClassGroupFilter }`
 * from the same repository is accepted, as is a side-effect import.
 */

import { describe, expect, test } from 'bun:test';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dir, '..');

const CODE_DIRECTORIES = [
  'apps/api/src',
  'apps/api/tests',
  'tests',
  'packages/contracts/src',
  'scripts',
  'apps/web/src',
  'apps/web/tests',
  'e2e',
] as const;

const CODE_FILES = '**/*.{ts,tsx}';

const SWEPT_AT_LEAST = 300;

const IMPORT_STATEMENT = /^import\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"];?$/gm;

const SIDE_EFFECT_IMPORT = /^import\s+['"]/;

const NAMESPACE_IMPORT = /^import\s+(?:type\s+)?\*\s+as\s/;

type Repetition = {
  readonly file: string;
  readonly module: string;
  readonly times: number;
};

const statementsOf = (content: string): { module: string; text: string }[] => {
  const flattened = content.replace(/\{[^}]*\}/gs, (block) => block.replaceAll('\n', ' '));
  return [...flattened.matchAll(IMPORT_STATEMENT)].map((match) => ({
    module: match[1] ?? '',
    text: match[0],
  }));
};

const repetitionsIn = (file: string, content: string): Repetition[] => {
  const perModule = new Map<string, number>();
  for (const statement of statementsOf(content)) {
    if (SIDE_EFFECT_IMPORT.test(statement.text)) continue;
    if (NAMESPACE_IMPORT.test(statement.text)) continue;
    perModule.set(statement.module, (perModule.get(statement.module) ?? 0) + 1);
  }
  return [...perModule]
    .filter(([, times]) => times > 1)
    .map(([module, times]) => ({ file, module, times }));
};

async function repetitions(): Promise<Repetition[]> {
  const found: Repetition[] = [];
  for (const directory of CODE_DIRECTORIES) {
    const base = join(ROOT, directory);
    for await (const match of new Bun.Glob(CODE_FILES).scan({ cwd: base })) {
      const path = join(base, match);
      found.push(...repetitionsIn(relative(ROOT, path), await Bun.file(path).text()));
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file));
}

describe('a file imports from a module exactly once', () => {
  test('no file in the swept directories repeats a module path', async () => {
    const repeated = await repetitions();

    expect(repeated).toEqual([]);
  });

  test('the sweep actually reads files on both sides, so an empty result means something', async () => {
    let swept = 0;
    for (const directory of CODE_DIRECTORIES) {
      const base = join(ROOT, directory);
      for await (const _ of new Bun.Glob(CODE_FILES).scan({ cwd: base })) swept += 1;
    }

    expect(swept).toBeGreaterThan(SWEPT_AT_LEAST);
  });

  test('a default import and a named one from the same module are a repetition', () => {
    const split = "import React from 'react';\nimport { useState } from 'react';\n";

    expect(repetitionsIn('sample.tsx', split)).toEqual([
      { file: 'sample.tsx', module: 'react', times: 2 },
    ]);
  });

  test('a stylesheet brought in for its side effect is not a repetition', () => {
    const styled = "import './theme.css';\nimport { Button } from './theme';\n";

    expect(repetitionsIn('sample.tsx', styled)).toEqual([]);
  });

  test('two statements from the same module are what this refuses', () => {
    const twice = "import { a } from './x';\nimport { b } from './x';\n";

    expect(repetitionsIn('sample.ts', twice)).toEqual([
      { file: 'sample.ts', module: './x', times: 2 },
    ]);
  });

  test('one statement bringing a value and a type together is accepted', () => {
    const together = "import { unitOfWork, type Connection } from './db';\n";

    expect(repetitionsIn('sample.ts', together)).toEqual([]);
  });

  test('a side-effect import alongside a named one is not a repetition', () => {
    const mixed = "import './setup';\nimport { a } from './setup';\n";

    expect(repetitionsIn('sample.ts', mixed)).toEqual([]);
  });

  test('a namespace import alongside a named one is accepted, because it cannot be merged', () => {
    const unmergeable = "import * as repo from './repo';\nimport type { Filter } from './repo';\n";

    expect(repetitionsIn('sample.ts', unmergeable)).toEqual([]);
  });
});
