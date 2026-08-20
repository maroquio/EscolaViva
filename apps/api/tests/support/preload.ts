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

/*
 * The migrations run once per process, and the database starts clean even after an earlier run was
 * interrupted halfway through.
 *
 * The two guards above cover a variable that is missing and a variable that points at the wrong
 * database. They do not cover the most common case of all: the variable is right and the container
 * is simply not running — Docker Desktop not started, or `docker compose up -d test_database`
 * forgotten. Without this catch the first thing anyone sees is the Postgres driver's own source
 * code in the middle of a stack trace, which says nothing about what to do.
 */
const CONNECTION_HINT =
  'Não foi possível falar com o banco de teste.\n\n' +
  'Quase sempre é o container que não está de pé. Suba-o e rode de novo:\n' +
  '  docker compose --env-file .env -f infra/docker-compose.yml up -d test_database\n\n' +
  `URL configurada: ${testUrl}\n` +
  'Se a porta aí não for a mesma de TEST_DB_PORT no .env, é essa a divergência.\n\n' +
  'Erro original: ';

try {
  await prepareDatabase();
  await clearDatabase();
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  throw new Error(`${CONNECTION_HINT}${detail}`);
}
