const REWRITE_FLAG = '--rewrite';
const TEST_FILE = 'tests/web/golden.test.ts';

const args = Bun.argv.slice(2);
const rewrite = args.includes(REWRITE_FLAG);

const unknown = args.filter((argument) => argument !== REWRITE_FLAG);
if (unknown.length > 0) {
  console.error(`unrecognized argument: ${unknown.join(', ')}`);
  console.error(`usage: bun run golden [${REWRITE_FLAG}]`);
  process.exit(2);
}

console.log(
  rewrite
    ? 'golden: rewriting the baseline of the screens…'
    : 'golden: checking the screens against the baseline…',
);

const child = Bun.spawn([process.execPath, 'test', TEST_FILE], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...Bun.env, ...(rewrite ? { GOLDEN_REWRITE: '1' } : {}) },
  stdout: 'inherit',
  stderr: 'inherit',
});

const exitCode = await child.exited;

if (exitCode === 0 && rewrite) {
  console.log('\ngolden: read `git diff tests/web/golden/` — every changed line is a screen that changed.');
}

process.exit(exitCode);
