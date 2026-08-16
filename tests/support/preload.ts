/*
 * Roda antes de qualquer arquivo de teste (`preload` do bunfig.toml).
 *
 * A aplicação lê o banco de `DATABASE_URL` uma única vez, no import de `src/shared/config`.
 * Por isso a troca precisa acontecer aqui e antes de qualquer import de `src/`: é o que faz
 * a suíte inteira falar com o banco descartável em vez do banco de desenvolvimento.
 */

// 42 caracteres: `SESSION_SECRET` exige no mínimo 32 e é o mesmo em toda máquina que roda a suíte.
const TEST_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';
const MINIMUM_SECRET_LENGTH = 32;

const testUrl = Bun.env.DATABASE_URL_TESTE?.trim() ?? '';

if (testUrl === '') {
  throw new Error(
    'DATABASE_URL_TESTE não está definida — a suíte não roda sem o banco descartável.\n\n' +
      'Suba o banco de teste e configure a variável:\n' +
      '  docker compose up -d banco_teste\n  cp .env.example .env   (se ainda não existir)\n\n' +
      'A linha esperada no .env, com a porta publicada em PORTA_BANCO_TESTE:\n' +
      '  DATABASE_URL_TESTE=postgres://escolaviva:escolaviva_dev@localhost:5433/escolaviva_teste',
  );
}

if (testUrl === Bun.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL_TESTE aponta para o mesmo banco de DATABASE_URL.\n\n' +
      'A suíte trunca todas as tabelas entre os casos: rodar assim apagaria o banco de\n' +
      'desenvolvimento. Aponte DATABASE_URL_TESTE para o banco descartável:\n' +
      '  docker compose up -d banco_teste',
  );
}

Bun.env.APP_ENV = 'test';
Bun.env.DATABASE_URL = testUrl;

// Um segredo próprio de teste evita que a suíte dependa do .env de quem a executa.
if ((Bun.env.SESSION_SECRET ?? '').length < MINIMUM_SECRET_LENGTH) {
  Bun.env.SESSION_SECRET = TEST_SECRET;
}

// Import dinâmico de propósito: um `import` estático subiria `src/shared/config` antes das
// linhas acima, porque imports são avaliados antes do corpo do módulo.
const { clearDatabase, prepareDatabase } = await import('./database');

// As migrações sobem uma vez por processo, e o banco começa limpo mesmo depois de uma
// execução anterior interrompida no meio.
await prepareDatabase();
await clearDatabase();
