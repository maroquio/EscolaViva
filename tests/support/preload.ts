/*
 * Runs before any test file (the `preload` entry in bunfig.toml).
 *
 * The application reads the database from `DATABASE_URL` exactly once, when
 * `src/shared/config` is imported. That is why the swap has to happen here and before any
 * import of `src/`: it is what makes the whole suite talk to the throwaway database instead
 * of the development one.
 */

// 42 characters: `SESSION_SECRET` demands at least 32, and this one is the same on every
// machine that runs the suite.
const TEST_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';
const MINIMUM_SECRET_LENGTH = 32;

const testUrl = Bun.env.TEST_DATABASE_URL?.trim() ?? '';

if (testUrl === '') {
  throw new Error(
    'TEST_DATABASE_URL não está definida — a suíte não roda sem o banco descartável.\n\n' +
      'Suba o banco de teste e configure a variável:\n' +
      '  docker compose up -d test_database\n  cp .env.example .env   (se ainda não existir)\n\n' +
      'A linha esperada no .env, com a porta publicada em TEST_DB_PORT:\n' +
      '  TEST_DATABASE_URL=postgres://escolaviva:escolaviva_dev@localhost:5433/escolaviva_teste',
  );
}

if (testUrl === Bun.env.DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL aponta para o mesmo banco de DATABASE_URL.\n\n' +
      'A suíte trunca todas as tabelas entre os casos: rodar assim apagaria o banco de\n' +
      'desenvolvimento. Aponte TEST_DATABASE_URL para o banco descartável:\n' +
      '  docker compose up -d test_database',
  );
}

Bun.env.APP_ENV = 'test';
Bun.env.DATABASE_URL = testUrl;

// A secret of its own keeps the suite from depending on the .env of whoever runs it.
if ((Bun.env.SESSION_SECRET ?? '').length < MINIMUM_SECRET_LENGTH) {
  Bun.env.SESSION_SECRET = TEST_SECRET;
}

// Dynamic import on purpose: a static `import` would pull `src/shared/config` up ahead of the
// lines above, because imports are evaluated before the body of the module.
const { clearDatabase, prepareDatabase } = await import('./database');

// The migrations run once per process, and the database starts clean even after an earlier
// run was interrupted halfway through.
await prepareDatabase();
await clearDatabase();
