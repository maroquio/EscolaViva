import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PROJECT_ROOT } from './support';
import { firstExistingPath } from '../support/paths';
import { GOLDEN_DIR } from './golden';

const PARTIAL_PATH = await firstExistingPath(
  'src/web/templates/parciais/_script_avisos.eta',
  'src/web/templates/partials/_notices_script.eta',
);

const CHECKER_PATH = 'scripts/magic-values.ts';

const PACKAGES_DIR = 'node_modules';

const PROBE_AREA_PREFIX = 'escolaviva-script-que-vira-html-';

const SCRIPT_BODY = /<script\b[^>]*>([\s\S]*?)<\/script>/;

const SCRIPT_END = '</script>';

const DOCUMENT_END = '</html>';

const GOLDEN_PATTERN = '*.txt';

const HANDWRITTEN_URL_THE_CHECKER_FLAGS =
  '    fechar.dataset.destino = \'<a href="/dashboard"></a>\';\n';

const EXEMPTION_STANDS = 'o corpo do <script> fica fora do alcance do verificador';

const EXEMPTION_FELL =
  `a entrada de TEMPLATES_CUJO_SCRIPT_VIRA_HTML para ${PARTIAL_PATH} sumiu de ` +
  `${CHECKER_PATH}. O verificador voltou a ler o corpo de um <script> que viaja ` +
  'verbatim para o navegador em toda tela com documento: extrair esses literais para constantes ' +
  'acrescenta interpolação ao HTML de todas elas, e o golden muda de uma vez. Reponha a entrada.';

const LIVE_PROBE = 'sem a isenção o verificador acusa o corpo do <script>';

const DEAD_PROBE =
  'a sonda não acusou nada nem com a isenção removida — este caso deixou de provar qualquer ' +
  'coisa sobre a isenção; conserte a sonda antes de confiar no resultado acima.';

const partialSource = (): Promise<string> =>
  Bun.file(join(PROJECT_ROOT, PARTIAL_PATH)).text();

const checkerSource = (): Promise<string> =>
  Bun.file(join(PROJECT_ROOT, CHECKER_PATH)).text();

const scriptBody = (source: string): string => SCRIPT_BODY.exec(source)?.[1] ?? '';

const withoutTheExemptionEntry = (source: string): string =>
  source
    .split('\n')
    .filter((row) => !row.includes(PARTIAL_PATH))
    .join('\n');

const flaggedThePartial = (stdout: string): boolean => stdout.includes(PARTIAL_PATH);

const verdictWithExemption = (stdout: string): string =>
  flaggedThePartial(stdout) ? `${EXEMPTION_FELL}\n${stdout.trim()}` : EXEMPTION_STANDS;

const verdictWithoutExemption = (stdout: string): string =>
  flaggedThePartial(stdout) ? LIVE_PROBE : `${DEAD_PROBE}\n${stdout.trim()}`;

type GoldenScreen = { readonly name: string; readonly content: string };

async function frozenScreens(): Promise<GoldenScreen[]> {
  const screens: GoldenScreen[] = [];
  for await (const name of new Bun.Glob(GOLDEN_PATTERN).scan({ cwd: GOLDEN_DIR })) {
    screens.push({ name, content: await Bun.file(join(GOLDEN_DIR, name)).text() });
  }
  return screens.sort((here, there) => here.name.localeCompare(there.name));
}

async function buildProbeArea(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), PROBE_AREA_PREFIX));
  await mkdir(join(root, dirname(PARTIAL_PATH)), { recursive: true });
  await mkdir(join(root, dirname(CHECKER_PATH)), { recursive: true });
  await symlink(join(PROJECT_ROOT, PACKAGES_DIR), join(root, PACKAGES_DIR));
  const partial = await partialSource();
  await writeFile(
    join(root, PARTIAL_PATH),
    partial.replace(
      SCRIPT_END,
      `${HANDWRITTEN_URL_THE_CHECKER_FLAGS}${SCRIPT_END}`,
    ),
  );
  return root;
}

async function runChecker(root: string, source: string): Promise<string> {
  await writeFile(join(root, CHECKER_PATH), source);
  const child = Bun.spawn([process.execPath, CHECKER_PATH], {
    cwd: root,
    env: { PATH: Bun.env.PATH ?? '' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  await child.exited;
  return `${stdout}${stderr}`;
}

describe('the notices <script> is HTML that travels to the browser', () => {
  let probeArea = '';

  beforeAll(async () => {
    probeArea = await buildProbeArea();
  });

  afterAll(async () => {
    if (probeArea === '') return;
    await rm(join(probeArea, PACKAGES_DIR), { force: true });
    await rm(probeArea, { recursive: true, force: true });
  });

  test('the script body arrives verbatim in every frozen screen that carries a document', async () => {
    const body = scriptBody(await partialSource());
    const screens = await frozenScreens();

    const withDocument = screens.filter((screen) => screen.content.includes(DOCUMENT_END));
    const withoutTheBody = withDocument
      .filter((screen) => !screen.content.includes(body))
      .map((screen) => screen.name);

    expect(body).not.toBe('');
    expect(withDocument.length).toBeGreaterThan(0);
    expect(withoutTheBody).toEqual([]);
  });

  test('the checker does not read that body, and it is the exemption that holds it back', async () => {
    const checker = await checkerSource();

    const withTheExemption = await runChecker(probeArea, checker);
    const withoutTheExemption = await runChecker(probeArea, withoutTheExemptionEntry(checker));

    expect(verdictWithoutExemption(withoutTheExemption)).toBe(LIVE_PROBE);
    expect(verdictWithExemption(withTheExemption)).toBe(EXEMPTION_STANDS);
  });
});
