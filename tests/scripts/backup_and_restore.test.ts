import { beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..');

const BACKUP_SCRIPT_PATH = join(ROOT, 'scripts', 'backup.sh');
const RESTORE_SCRIPT_PATH = join(ROOT, 'scripts', 'restore-test.sh');

const URL_WITH_SECRET = 'postgres://escolaviva:senha_secreta@localhost:5432/escolaviva';

const ENV_READING_BLOCK = /if \[\[ -z "\$\{DATABASE_URL:-\}" && -f[\s\S]*?\nfi\n/;

const DB_SERVICE = /^DB_SERVICE=(\S+)$/m;

const FILE_TEMPLATE = /FILE="\$DEST\/([^"]+)"/;

const PARTIAL_SUFFIX = /PARTIAL="\$FILE([^"]*)"/;

const RETENTION_PATTERN = /"\$DEST"\/(\S+\.dump)/;

const SAMPLE_TIMESTAMP = '20260815-101112';

const TIMESTAMP_VARIABLE = '$TIMESTAMP';

let backup = '';
let restore = '';

function functionDefinition(script: string, name: string): string {
  const rows = script.split('\n');
  const start = rows.findIndex((row) => row.startsWith(`${name}() {`));
  if (start === -1) throw new Error(`o script não define ${name}()`);
  const first = rows[start] ?? '';
  if (first.trimEnd().endsWith('}')) return first;
  const end = rows.findIndex((row, index) => index > start && row === '}');
  return rows.slice(start, end + 1).join('\n');
}

function capture(script: string, expression: RegExp, name: string): string {
  const captured = expression.exec(script)?.[1];
  if (captured === undefined) throw new Error(`o script não declara ${name}`);
  return captured;
}

async function call(preamble: string, name: string, argument: string): Promise<string> {
  const process = Bun.spawn(['bash', '-c', `${preamble}\n${name} "$1"`, 'bash', argument], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = await new Response(process.stdout).text();
  await process.exited;
  return stdout.trim();
}

describe('scripts de backup e restauração', () => {
  beforeAll(async () => {
    backup = await Bun.file(BACKUP_SCRIPT_PATH).text();
    restore = await Bun.file(RESTORE_SCRIPT_PATH).text();
  });

  test('a URL impressa no console não leva usuário nem senha', async () => {
    const definition = functionDefinition(backup, 'without_credentials');

    const printed = await call(definition, 'without_credentials', URL_WITH_SECRET);

    expect(printed).toBe('postgres://***@localhost:5432/escolaviva');
    expect(printed).not.toContain('senha_secreta');
  });

  test('a URL de dentro do compose troca o host publicado pelo nome do serviço', async () => {
    const service = capture(backup, DB_SERVICE, 'DB_SERVICE');
    const preamble = `DB_SERVICE=${service}\n${functionDefinition(backup, 'internal_url')}`;

    const withPort = await call(preamble, 'internal_url', URL_WITH_SECRET);
    const withoutPort = await call(
      preamble,
      'internal_url',
      'postgres://escolaviva:senha_secreta@localhost/escolaviva',
    );

    expect(withPort).toBe(`postgres://escolaviva:senha_secreta@${service}:5432/escolaviva`);
    expect(withoutPort).toBe(`postgres://escolaviva:senha_secreta@${service}:5432/escolaviva`);
  });

  test('a versão maior sai tanto da saída do cliente quanto da do servidor', async () => {
    const definition = functionDefinition(backup, 'major_version');

    const ofTheClient = await call(definition, 'major_version', 'pg_dump (PostgreSQL) 14.9');
    const ofTheServer = await call(definition, 'major_version', '16.4 (Debian 16.4-1.pgdg120+1)');

    expect(ofTheClient).toBe('14');
    expect(ofTheServer).toBe('16');
    expect(Number(ofTheClient) < Number(ofTheServer)).toBe(true);
  });

  test('o dump interrompido no meio não entra na contagem de retenção', () => {
    const template = capture(backup, FILE_TEMPLATE, 'o nome do arquivo de dump');
    const suffix = capture(backup, PARTIAL_SUFFIX, 'o sufixo do arquivo parcial');
    const pattern = new Bun.Glob(capture(backup, RETENTION_PATTERN, 'o padrão da retenção'));

    const ready = template.replace(TIMESTAMP_VARIABLE, SAMPLE_TIMESTAMP);

    expect(pattern.match(ready)).toBe(true);
    expect(pattern.match(`${ready}${suffix}`)).toBe(false);
  });

  test('a retenção guarda um número declarado de dumps, e não um literal solto', () => {
    const retention = capture(backup, /^RETENTION=(\d+)$/m, 'RETENTION');

    expect(backup).toContain('tail -n "+$((RETENTION + 1))"');
    expect(Number(retention)).toBeGreaterThan(0);
  });

  test('os dois scripts leem DATABASE_URL do .env pelo mesmo bloco', () => {
    const ofTheBackup = ENV_READING_BLOCK.exec(backup)?.[0];

    const ofTheRestore = ENV_READING_BLOCK.exec(restore)?.[0];

    expect(ofTheBackup).toBeDefined();
    expect(ofTheRestore).toBe(ofTheBackup);
  });

  test('os dois scripts escolhem o cliente compatível pelas mesmas funções', () => {
    const shared = ['major_version', 'server_version', 'internal_url'];

    const ofTheBackup = shared.map((name) => functionDefinition(backup, name));
    const ofTheRestore = shared.map((name) => functionDefinition(restore, name));

    expect(ofTheRestore).toEqual(ofTheBackup);
    expect(capture(restore, DB_SERVICE, 'DB_SERVICE')).toBe(
      capture(backup, DB_SERVICE, 'DB_SERVICE'),
    );
  });

  test('a restauração sai com código próprio para cada falha que um agendador precisa ver', () => {
    const codes = [...restore.matchAll(/^\s*exit (\d+)$/gm)].map((finding) => finding[1]);

    expect(new Set(codes)).toEqual(new Set(['1', '2', '3']));
  });

  test('os dois scripts param no primeiro erro e não expandem variável não definida', () => {
    const mode = [backup, restore].map((script) => script.includes('\nset -euo pipefail\n'));

    expect(mode).toEqual([true, true]);
  });
});
