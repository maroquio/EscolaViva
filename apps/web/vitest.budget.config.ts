/**
 * A configuration of its own for the bundle budget, and the reason is mechanical rather than
 * stylistic.
 *
 * `budget.test.ts` reads `dist/`, which does not exist until `build:web` has run, so it may not sit
 * in the ordinary suite: a green run would depend on whether somebody built first. Keeping it out
 * of that suite through `exclude` is what the ordinary config does — and that only works because
 * this file exists: Vitest **appends** a command-line `--exclude` to the configured one, and
 * Vitest 4 has no `--include` flag at all, so an excluded file cannot be run back in from the
 * command line. A second config is the mechanism that actually exists.
 *
 * `node` rather than `jsdom`: this test reads files and gzips them. There is no DOM in it, and
 * booting one costs a second for nothing.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/budget.test.ts'],
    environment: 'node',
  },
});
