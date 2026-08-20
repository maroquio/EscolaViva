/**
 * Capturas de tela do EscolaViva para os slides do Estágio 01.
 *
 * Sobe nada: espera a API já estar de pé em `http://localhost:3333`, servindo o front construído
 * por `bun run build:web`. Cada papel entra pelo formulário — nunca por `POST` na API — porque é o
 * cookie de sessão de primeira parte que faz o painel aparecer.
 *
 * Roda com:  bun docs/slides/estagio-01/capturar.ts
 */
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from '@playwright/test';

const BASE = 'http://localhost:3333';
const OUT = '/Volumes/Externo/Ifes/2026.2/TEES2/exemplo_saas/docs/slides/estagio-01/assets/telas';

const NETWORK = 'demo';
const PASSWORD = 'escolaviva';

const CPF = {
  networkAdmin: '10000000108',
  registrar: '10000000280',
  teacher: '10000000442',
  guardian: '10000001171',
} as const;

/** O aluno que a jornada de matrícula usa. A marca o torna encontrável — e removível — depois. */
const SLIDES_STUDENT = 'Isabela Martins Rocha [slides]';
const SLIDES_BIRTH_DATE = '2013-04-22';
const SEARCH_TERM = 'Isabela';
const ENROLLMENT_DATE = '2026-02-02';

const VIEWPORT = { width: 1280, height: 800 } as const;
const SETTLE = 400;
const DISMISS_NOTICE_LABEL = 'Fechar aviso';

const taken: string[] = [];

/**
 * O aviso de sucesso se fecha sozinho em quatro segundos, e a captura chega antes disso — três deles
 * empilhados cobriam a tabela no canto inferior. Fechar à mão é o que faz a tela ser fotografada em
 * repouso, e não no meio da confirmação do passo anterior.
 */
async function dismissNotices(page: Page): Promise<void> {
  const closeButtons = page.getByRole('button', { name: DISMISS_NOTICE_LABEL });
  for (let remaining = await closeButtons.count(); remaining > 0; remaining -= 1) {
    await closeButtons.first().click();
  }
  await closeButtons.first().waitFor({ state: 'detached' }).catch(() => undefined);
}

async function shot(page: Page, name: string): Promise<void> {
  await dismissNotices(page);
  await page.waitForTimeout(SETTLE);
  await page.screenshot({ path: `${OUT}/${name}` });
  taken.push(name);
  console.log(`  capturado  ${name}`);
}

async function signInAs(page: Page, cpf: string): Promise<void> {
  await page.goto(`${BASE}/login`);
  await page.context().clearCookies();
  await page.goto(`${BASE}/login`);

  await page.getByRole('textbox', { name: 'Rede' }).fill(NETWORK);
  await page.getByRole('textbox', { name: 'CPF' }).fill(cpf);
  await page.getByRole('textbox', { name: 'Senha' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.getByRole('navigation', { name: 'Navegação principal' }).waitFor({ timeout: 20_000 });
}

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole('heading', { level: 1, name });

/** O nome da rede é o título do painel — descobrir qual é evita adivinhar o texto do `h1`. */
async function anyLevelOneHeading(page: Page): Promise<string> {
  const first = page.locator('h1').first();
  await first.waitFor({ timeout: 20_000 });
  return (await first.textContent())?.trim() ?? '';
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    reducedMotion: 'reduce',
  });
  context.setDefaultTimeout(20_000);
  const page = await context.newPage();

  try {
    /* 01 — a tela de entrada, com o formulário em branco. */
    await page.goto(`${BASE}/login`);
    await context.clearCookies();
    await page.goto(`${BASE}/login`);
    await heading(page, 'Entrar').waitFor();
    await shot(page, '01-login.png');

    /* 02 — o painel da rede, de quem administra a rede inteira. */
    await signInAs(page, CPF.networkAdmin);
    console.log(`  painel da rede: h1 = ${await anyLevelOneHeading(page)}`);
    await shot(page, '02-painel-rede.png');

    /* 03 — o painel da secretaria. */
    await signInAs(page, CPF.registrar);
    await heading(page, 'Painel da secretaria').waitFor();
    await shot(page, '03-painel-secretaria.png');

    /* 04 — o painel do professor. */
    await signInAs(page, CPF.teacher);
    await heading(page, 'Minhas turmas').waitFor();
    await shot(page, '04-painel-professor.png');

    /* 05 — o painel de quem responde pelo aluno. */
    await signInAs(page, CPF.guardian);
    await heading(page, 'Meus alunos').waitFor();
    await shot(page, '05-painel-responsavel.png');

    /* Daqui em diante, a jornada de matricular um aluno — sempre como secretaria. */
    await signInAs(page, CPF.registrar);

    /*
     * As 120 matrículas da semente já ocupam todos os alunos, e a matrícula ativa é única por ano.
     * Um aluno novo é o que torna o passo 08 possível sem desfazer nada do que já existe.
     */
    await page.getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('link', { name: 'Alunos', exact: true })
      .click();
    await heading(page, 'Alunos').waitFor();

    await page.getByRole('link', { name: 'Cadastrar aluno' }).first().click();
    await heading(page, 'Cadastrar aluno').waitFor();
    await page.getByRole('textbox', { name: /^Nome/ }).fill(SLIDES_STUDENT);
    await page.locator('input[type="date"]').fill(SLIDES_BIRTH_DATE);
    await page.getByRole('button', { name: 'Cadastrar aluno' }).click();
    await heading(page, SLIDES_STUDENT).waitFor();

    const studentRecordUrl = page.url();
    console.log(`  aluno dos slides criado em ${studentRecordUrl}`);

    /* Um responsável vinculado é o que faz a ficha contar a história inteira. */
    try {
      await page.getByRole('link', { name: 'Vincular responsável' }).first().click();
      await heading(page, 'Vincular responsável').waitFor();
      const guardianSelect = page.getByRole('combobox', { name: /Responsável/ });
      await guardianSelect.selectOption({ index: 1 });
      await page.getByRole('textbox', { name: /Parentesco/ }).fill('Mãe');
      await page.getByRole('checkbox', { name: 'Responsável financeiro' }).check();
      await page.getByRole('button', { name: 'Vincular responsável' }).click();
      await heading(page, SLIDES_STUDENT).waitFor();
      console.log('  responsável vinculado');
    } catch (failure) {
      console.log(`  responsável NÃO vinculado: ${(failure as Error).message.split('\n')[0]}`);
      await page.goto(studentRecordUrl);
      await heading(page, SLIDES_STUDENT).waitFor();
    }

    /* 06 — a busca de alunos, com o aluno novo ainda sem matrícula no meio dos que já têm. */
    await page.getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('link', { name: 'Alunos', exact: true })
      .click();
    await heading(page, 'Alunos').waitFor();
    await page.getByRole('textbox', { name: 'Buscar por nome' }).fill(SEARCH_TERM);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.getByRole('heading', { name: 'Resultados' }).waitFor();
    await shot(page, '06-alunos-busca.png');

    /* 07 — a ficha do aluno, antes da matrícula existir. */
    await page.getByRole('link', { name: SLIDES_STUDENT }).click();
    await heading(page, SLIDES_STUDENT).waitFor();
    await shot(page, '07-aluno-ficha.png');

    /* 08 — o formulário de matrícula preenchido, e parado antes do envio. */
    await page.getByRole('link', { name: 'Matricular', exact: true }).first().click();
    await heading(page, 'Matricular aluno').waitFor();

    const classGroupSelect = page.getByRole('combobox', { name: /Turma/ });
    const labels = await classGroupSelect.locator('option').allTextContents();
    console.log(`  turmas no alcance da secretaria: ${labels.slice(1).join(' | ')}`);
    const preferred = labels.findIndex((label) => label.startsWith('7º A'));
    await classGroupSelect.selectOption({ index: preferred > 0 ? preferred : 1 });

    await page.getByRole('combobox', { name: /Ano letivo/ }).selectOption({ index: 1 });
    const enrollmentDate = page.locator('input[type="date"]');
    await enrollmentDate.fill(ENROLLMENT_DATE);
    /* Sem o blur a captura pega o segmento do dia ainda selecionado em azul, que lê como defeito. */
    await enrollmentDate.evaluate((field: HTMLInputElement) => field.blur());
    await shot(page, '08-matricula-form.png');

    /* 09 — a mesma ficha, agora com a matrícula ativa. */
    await page.getByRole('button', { name: 'Matricular' }).click();
    await heading(page, SLIDES_STUDENT).waitFor();
    await page.waitForTimeout(SETTLE);
    await shot(page, '09-aluno-ficha-com-matricula.png');

    /* 10 — as turmas da secretaria. */
    await page.getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('link', { name: 'Turmas', exact: true })
      .click();
    await heading(page, 'Turmas').waitFor();
    await shot(page, '10-turmas.png');
  } finally {
    await context.close();
    await browser.close();
    console.log(`\n${taken.length} captura(s): ${taken.join(', ')}`);
  }
}

await main();
