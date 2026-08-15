import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { RAIZ_DO_PROJETO } from './apoio';
import { PASTA_GOLDEN } from './golden';

const CAMINHO_DO_PARCIAL = 'src/web/templates/parciais/_script_avisos.eta';

const CAMINHO_DO_VERIFICADOR = 'scripts/magic-values.ts';

const DIRETORIO_DE_PACOTES = 'node_modules';

const PREFIXO_DA_AREA_DE_SONDA = 'escolaviva-script-que-vira-html-';

const CORPO_DO_SCRIPT = /<script\b[^>]*>([\s\S]*?)<\/script>/;

const FECHAMENTO_DO_SCRIPT = '</script>';

const FIM_DO_DOCUMENTO = '</html>';

const PADRAO_DO_GOLDEN = '*.txt';

const ENDERECO_A_MAO_QUE_O_VERIFICADOR_ACUSA =
  '    fechar.dataset.destino = \'<a href="/painel"></a>\';\n';

const ISENCAO_DE_PE = 'o corpo do <script> fica fora do alcance do verificador';

const ISENCAO_CAIU =
  `a entrada de TEMPLATES_CUJO_SCRIPT_VIRA_HTML para ${CAMINHO_DO_PARCIAL} sumiu de ` +
  `${CAMINHO_DO_VERIFICADOR}. O verificador voltou a ler o corpo de um <script> que viaja ` +
  'verbatim para o navegador em toda tela com documento: extrair esses literais para constantes ' +
  'acrescenta interpolação ao HTML de todas elas, e o golden muda de uma vez. Reponha a entrada.';

const SONDA_VIVA = 'sem a isenção o verificador acusa o corpo do <script>';

const SONDA_MORTA =
  'a sonda não acusou nada nem com a isenção removida — este caso deixou de provar qualquer ' +
  'coisa sobre a isenção; conserte a sonda antes de confiar no resultado acima.';

const fonteDoParcial = (): Promise<string> =>
  Bun.file(join(RAIZ_DO_PROJETO, CAMINHO_DO_PARCIAL)).text();

const fonteDoVerificador = (): Promise<string> =>
  Bun.file(join(RAIZ_DO_PROJETO, CAMINHO_DO_VERIFICADOR)).text();

const corpoDoScript = (fonte: string): string => CORPO_DO_SCRIPT.exec(fonte)?.[1] ?? '';

const semAEntradaDaIsencao = (fonte: string): string =>
  fonte
    .split('\n')
    .filter((linha) => !linha.includes(CAMINHO_DO_PARCIAL))
    .join('\n');

const acusouOParcial = (saida: string): boolean => saida.includes(CAMINHO_DO_PARCIAL);

const vereditoComAIsencao = (saida: string): string =>
  acusouOParcial(saida) ? `${ISENCAO_CAIU}\n${saida.trim()}` : ISENCAO_DE_PE;

const vereditoSemAIsencao = (saida: string): string =>
  acusouOParcial(saida) ? SONDA_VIVA : `${SONDA_MORTA}\n${saida.trim()}`;

type Tela = { readonly nome: string; readonly conteudo: string };

async function telasCongeladas(): Promise<Tela[]> {
  const telas: Tela[] = [];
  for await (const nome of new Bun.Glob(PADRAO_DO_GOLDEN).scan({ cwd: PASTA_GOLDEN })) {
    telas.push({ nome, conteudo: await Bun.file(join(PASTA_GOLDEN, nome)).text() });
  }
  return telas.sort((aqui, ali) => aqui.nome.localeCompare(ali.nome));
}

async function montarAreaDeSonda(): Promise<string> {
  const raiz = await mkdtemp(join(tmpdir(), PREFIXO_DA_AREA_DE_SONDA));
  await mkdir(join(raiz, dirname(CAMINHO_DO_PARCIAL)), { recursive: true });
  await mkdir(join(raiz, dirname(CAMINHO_DO_VERIFICADOR)), { recursive: true });
  await symlink(join(RAIZ_DO_PROJETO, DIRETORIO_DE_PACOTES), join(raiz, DIRETORIO_DE_PACOTES));
  const parcial = await fonteDoParcial();
  await writeFile(
    join(raiz, CAMINHO_DO_PARCIAL),
    parcial.replace(
      FECHAMENTO_DO_SCRIPT,
      `${ENDERECO_A_MAO_QUE_O_VERIFICADOR_ACUSA}${FECHAMENTO_DO_SCRIPT}`,
    ),
  );
  return raiz;
}

async function rodarVerificador(raiz: string, fonte: string): Promise<string> {
  await writeFile(join(raiz, CAMINHO_DO_VERIFICADOR), fonte);
  const processo = Bun.spawn([process.execPath, CAMINHO_DO_VERIFICADOR], {
    cwd: raiz,
    env: { PATH: Bun.env.PATH ?? '' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [saida, erro] = await Promise.all([
    new Response(processo.stdout).text(),
    new Response(processo.stderr).text(),
  ]);
  await processo.exited;
  return `${saida}${erro}`;
}

describe('o <script> de avisos é HTML que viaja para o navegador', () => {
  let areaDeSonda = '';

  beforeAll(async () => {
    areaDeSonda = await montarAreaDeSonda();
  });

  afterAll(async () => {
    if (areaDeSonda === '') return;
    await rm(join(areaDeSonda, DIRETORIO_DE_PACOTES), { force: true });
    await rm(areaDeSonda, { recursive: true, force: true });
  });

  test('o corpo do script chega verbatim a toda tela congelada que tem documento', async () => {
    const corpo = corpoDoScript(await fonteDoParcial());
    const telas = await telasCongeladas();

    const comDocumento = telas.filter((tela) => tela.conteudo.includes(FIM_DO_DOCUMENTO));
    const semOCorpo = comDocumento
      .filter((tela) => !tela.conteudo.includes(corpo))
      .map((tela) => tela.nome);

    expect(corpo).not.toBe('');
    expect(comDocumento.length).toBeGreaterThan(0);
    expect(semOCorpo).toEqual([]);
  });

  test('o verificador não lê esse corpo, e é a isenção que o segura', async () => {
    const verificador = await fonteDoVerificador();

    const comAIsencao = await rodarVerificador(areaDeSonda, verificador);
    const semAIsencao = await rodarVerificador(areaDeSonda, semAEntradaDaIsencao(verificador));

    expect(vereditoSemAIsencao(semAIsencao)).toBe(SONDA_VIVA);
    expect(vereditoComAIsencao(comAIsencao)).toBe(ISENCAO_DE_PE);
  });
});
