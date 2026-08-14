# CPF como identificador de acesso — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** trocar o identificador de acesso do EscolaViva de e-mail para CPF, em duas fases que abrem e fecham uma janela de compatibilidade de migração.

**Architecture:** um módulo puro em `src/shared/documento/cpf.ts` concentra normalização, validação, formatação e geração de CPF; `identidade` passa a autenticar por CPF e `academico` a guardar CPF do responsável. A fase A adiciona coluna anulável e faz o login aceitar CPF **ou** e-mail; a fase B torna a coluna obrigatória e remove o ramo do e-mail. Nenhuma URL de POST muda.

**Tech Stack:** Bun · TypeScript · Hono · Eta · PostgreSQL 16 via `Bun.sql` · Zod · `bun:test`

**Spec:** `docs/superpowers/specs/2026-08-14-cpf-como-login-design.md` — leia antes de começar; este plano argumenta a partir dela.

## Global Constraints

Valem para **toda** tarefa. Não repetidas nas tarefas individuais.

- **Idioma:** todo identificador, comentário, mensagem de erro e texto de tela em **português do Brasil**, com acentuação correta. É a língua do repositório inteiro.
- **Comentários explicam o porquê, nunca o quê.** Olhe qualquer arquivo vizinho antes de escrever: o repositório documenta decisão e trade-off, não mecânica.
- **`bun run verificar` verde antes de qualquer commit.** Roda `tsc --noEmit`, `depcruise` e a suíte inteira com portão de cobertura de 80% do projeto.
- **Commit:** `git add` **explícito, arquivo por arquivo**. Nunca `git add -A`, `git add .`, `git add -u`, `git commit -a` nem `-am`. Rode `git status --short` antes e confirme que só os arquivos daquela tarefa estão staged.
- **Peça autorização ao usuário antes de cada commit e antes de qualquer push.** Autorização é escopada: "pode commitar" não autoriza push, e um commit autorizado não autoriza o seguinte.
- **Não crie branch.** Trabalhe na branch atual.
- **Sem atribuição a IA** em mensagem de commit.
- **Estágio 01.** Nada deste plano pode antecipar componente de estágio posterior — sem fila, sem cache, sem envio de e-mail, sem serviço externo.
- **CPF sempre normalizado no banco:** onze dígitos, sem pontuação. Nunca em query string.
- **`ErroDeAplicacao`** é `{ campo?: string; codigo: string; mensagem: string }`. Use `falhaDeCampo(campo, codigo, mensagem)` de `src/shared/resultado.ts` para erro ancorado em campo.

## File Structure

**Criados**

| Arquivo | Responsabilidade |
|---|---|
| `src/shared/documento/cpf.ts` | normalizar, validar, formatar e gerar CPF; puro, sem dependência |
| `src/shared/documento/index.ts` | reexporta o público de `cpf.ts` |
| `testes/shared/cpf.test.ts` | aritmética dos verificadores e propriedade do gerador |
| `migrations/0007_cpf.sql` | abre a janela: coluna anulável, CHECK de forma, índice único parcial |
| `migrations/0008_cpf_obrigatorio.sql` | fecha a janela: NOT NULL, unicidade trocada, unicidade do e-mail derrubada |
| `docs/ADR/0004-cpf-como-identificador-de-acesso.md` | registro da decisão, no formato dos ADRs existentes |

**Modificados**

| Arquivo | O que muda |
|---|---|
| `.dependency-cruiser.js` | comentário da regra `dominio-puro` passa a citar `shared/documento/` |
| `src/identidade/dominio/usuario.ts` | tipo `Usuario` ganha `cpf: string \| null` |
| `src/identidade/infra/usuarioRepositorio.ts` | lê e grava `cpf`; consulta de credenciais por CPF |
| `src/identidade/aplicacao/autenticar.ts` | aceita CPF ou e-mail (fase A); só CPF (fase B) |
| `src/identidade/aplicacao/convidarUsuario.ts` | exige CPF válido; confere contra o cadastro do responsável |
| `src/academico/dominio/responsavel.ts` | tipo `Responsavel` ganha `cpf: string \| null` |
| `src/academico/infra/responsavelRepositorio.ts` | lê e grava `cpf`; ganha `porId` |
| `src/academico/aplicacao/consultas.ts` | expõe `responsavelPorId` |
| `src/academico/index.ts` | publica `responsavelPorId` na porta do módulo |
| `src/academico/aplicacao/cadastrarResponsavel.ts` | aceita CPF opcional |
| `src/web/render.ts` | injeta `formatarCpf` no contexto de template |
| `src/web/templates/login.eta` | campo de identificador |
| `src/web/rotas/login.ts` | lê o campo novo |
| `src/web/templates/rede/usuario_novo.eta` | campo CPF obrigatório |
| `src/web/templates/rede/usuarios.eta` | coluna CPF |
| `src/web/rotas/rede.ts` | passa CPF ao caso de uso e busca o cadastro do responsável |
| `src/web/templates/secretaria/responsavel_novo.eta` | campo CPF opcional |
| `src/web/templates/secretaria/responsaveis.eta` | coluna CPF |
| `src/web/rotas/secretaria.ts` | passa CPF ao caso de uso |
| `scripts/seed.ts` | grava e imprime CPF |
| `testes/apoio/fabricas.ts` | fábricas geram CPF |
| `testes/web/checklist.test.ts` | teste de log passa a valer de verdade |
| `testes/identidade/autenticacao.test.ts` | login por CPF |

---

# FASE A — abre a janela de compatibilidade

Ao fim da fase A: quem tem CPF entra por CPF, quem não tem continua entrando por e-mail. O código anterior ignora a coluna nova, então o rollback é seguro em qualquer ponto.

---

### Task 1: Módulo de CPF

**Files:**
- Create: `src/shared/documento/cpf.ts`
- Create: `src/shared/documento/index.ts`
- Test: `testes/shared/cpf.test.ts`
- Modify: `.dependency-cruiser.js` (comentário da regra `dominio-puro`)

**Interfaces:**
- Consumes: nada.
- Produces: `normalizarCpf(bruto: string): string` · `cpfValido(digitos: string): boolean` · `formatarCpf(digitos: string): string` · `gerarCpf(semente: number): string`. Todas as tarefas seguintes importam de `'../../shared/documento'`.

- [ ] **Step 1: Escreva o teste que falha**

Crie `testes/shared/cpf.test.ts`:

```ts
/*
 * O CPF é o identificador de acesso (ADR 0004), e a aritmética dos dígitos verificadores é a
 * única coisa que separa um número digitado de um documento.
 *
 * O gerador é testado junto do validador de propósito: são os dois lados do mesmo algoritmo, e
 * `cpfValido(gerarCpf(n))` sobre uma faixa de sementes derruba a suíte se qualquer um dos dois
 * estiver errado — coisa que um teste de tabela fixa não pegaria.
 */

import { describe, expect, test } from 'bun:test';
import { cpfValido, formatarCpf, gerarCpf, normalizarCpf } from '../../src/shared/documento';

/** CPF de teste consagrado: os dois verificadores fecham. Não pertence a ninguém. */
const VALIDO = '52998224725';
const SEMENTES = 500;

describe('normalizarCpf', () => {
  test('tira pontuação, traço e espaço', () => {
    expect(normalizarCpf(' 529.982.247-25 ')).toBe(VALIDO);
  });

  test('texto sem dígito nenhum vira string vazia', () => {
    expect(normalizarCpf('sem número')).toBe('');
  });
});

describe('cpfValido', () => {
  test('aceita CPF com os dois verificadores corretos', () => {
    expect(cpfValido(VALIDO)).toBe(true);
  });

  test('recusa quando o último dígito está errado', () => {
    expect(cpfValido('52998224724')).toBe(false);
  });

  test('recusa comprimento diferente de onze', () => {
    expect(cpfValido('5299822472')).toBe(false);
    expect(cpfValido('529982247250')).toBe(false);
  });

  test('recusa o que não é só dígito — a normalização vem antes', () => {
    expect(cpfValido('529.982.247-25')).toBe(false);
  });

  /* Sequência repetida fecha a conta dos verificadores e mesmo assim não é CPF de ninguém. */
  test('recusa sequência de dígitos repetidos', () => {
    expect(cpfValido('11111111111')).toBe(false);
    expect(cpfValido('00000000000')).toBe(false);
  });
});

describe('formatarCpf', () => {
  test('aplica a máscara', () => {
    expect(formatarCpf(VALIDO)).toBe('529.982.247-25');
  });

  test('entrada que não é CPF devolve o travessão das outras telas', () => {
    expect(formatarCpf('')).toBe('—');
  });
});

describe('gerarCpf', () => {
  test('a mesma semente devolve sempre o mesmo CPF', () => {
    expect(gerarCpf(0)).toBe('10000000019');
    expect(gerarCpf(0)).toBe(gerarCpf(0));
  });

  test('tudo o que sai do gerador passa no validador', () => {
    const invalidos = Array.from({ length: SEMENTES }, (_, i) => gerarCpf(i)).filter(
      (cpf) => !cpfValido(cpf),
    );

    expect(invalidos).toEqual([]);
  });

  test('sementes distintas nunca colidem', () => {
    const gerados = Array.from({ length: SEMENTES }, (_, i) => gerarCpf(i));

    expect(new Set(gerados).size).toBe(SEMENTES);
  });
});
```

- [ ] **Step 2: Rode o teste e confirme que falha**

```bash
bun test testes/shared/cpf.test.ts
```

Esperado: falha na importação — `Cannot find module '../../src/shared/documento'`.

- [ ] **Step 3: Implemente o módulo**

Crie `src/shared/documento/cpf.ts`:

```ts
/**
 * CPF: normalizar, validar, formatar e gerar.
 *
 * Módulo puro — não conhece banco, HTTP, log nem domínio. É o que permite `identidade` e
 * `academico` usarem a mesma aritmética sem que um passe a depender do outro, e o que mantém o
 * grafo do Estágio 14 extraível.
 *
 * `gerarCpf` existe para o seed e para as fixtures de teste. Não tem uso em produção: nada no
 * sistema inventa o CPF de uma pessoa.
 */

const SOMENTE_DIGITOS = /^[0-9]{11}$/;
const TODOS_IGUAIS = /^(\d)\1{10}$/;
const NAO_DIGITO = /\D/g;

/** O mesmo travessão que `formatarData` e `formatarNota` usam para valor ausente. */
const AUSENTE = '—';

/** Quem digitou com ponto e traço e quem digitou cru precisam chegar ao mesmo lugar. */
export const normalizarCpf = (bruto: string): string => bruto.replace(NAO_DIGITO, '');

/**
 * Cada verificador é a soma dos dígitos por pesos decrescentes, vezes dez, módulo onze — e resto
 * dez vira zero. O primeiro pesa a partir de 10 sobre nove dígitos; o segundo, a partir de 11
 * sobre dez.
 */
const verificador = (digitos: string, pesoInicial: number): number => {
  let soma = 0;
  for (let indice = 0; indice < digitos.length; indice += 1) {
    soma += Number(digitos[indice]) * (pesoInicial - indice);
  }
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
};

const comVerificadores = (base: string): string => {
  const primeiro = verificador(base, 10);
  const segundo = verificador(`${base}${primeiro}`, 11);
  return `${base}${primeiro}${segundo}`;
};

/**
 * Sequência repetida é recusada à parte porque **passa** na aritmética: `111.111.111-11` fecha os
 * dois verificadores. É o preenchimento mais comum de formulário respondido de qualquer jeito.
 */
export function cpfValido(digitos: string): boolean {
  if (!SOMENTE_DIGITOS.test(digitos)) return false;
  if (TODOS_IGUAIS.test(digitos)) return false;
  return digitos === comVerificadores(digitos.slice(0, 9));
}

/** `52998224725` vira `529.982.247-25`; o que não for CPF devolve travessão. */
export function formatarCpf(digitos: string): string {
  if (!SOMENTE_DIGITOS.test(digitos)) return AUSENTE;
  const [a, b, c, d] = [
    digitos.slice(0, 3),
    digitos.slice(3, 6),
    digitos.slice(6, 9),
    digitos.slice(9),
  ];
  return `${a}.${b}.${c}-${d}`;
}

/**
 * Prefixo fixo de dois dígitos diferentes entre si: a base nunca sai uniforme, então não há caso
 * a pular — e pular casos é justamente o que faria duas sementes caírem no mesmo CPF.
 */
const PREFIXO_DA_BASE = '10';
const DIGITOS_DA_SEMENTE = 7;
const FAIXA = 10 ** DIGITOS_DA_SEMENTE;

/** CPF válido e determinístico a partir de uma semente. Injetivo para semente em [0, 10.000.000). */
export function gerarCpf(semente: number): string {
  const resto = String(Math.abs(Math.trunc(semente)) % FAIXA).padStart(DIGITOS_DA_SEMENTE, '0');
  return comVerificadores(`${PREFIXO_DA_BASE}${resto}`);
}
```

Crie `src/shared/documento/index.ts`:

```ts
export { cpfValido, formatarCpf, gerarCpf, normalizarCpf } from './cpf';
```

- [ ] **Step 4: Rode o teste e confirme que passa**

```bash
bun test testes/shared/cpf.test.ts
```

Esperado: todos passam. Se `gerarCpf(0)` não der `10000000019`, a aritmética do verificador está errada — confira os pesos antes de mexer no teste.

- [ ] **Step 5: Atualize o comentário da regra de dependência**

Em `.dependency-cruiser.js`, na regra `dominio-puro`, o comentário diz hoje *"Só pode alcançar `src/shared/ports/` e `src/shared/resultado.ts`"*. Troque essa frase por:

```
'Só pode alcançar `src/shared/ports/`, `src/shared/resultado.ts` e `src/shared/documento/` — ' +
'este último por ser valor puro, sem I/O e sem regra de negócio de nenhum módulo: a aritmética ' +
'do CPF é a mesma para identidade e para academico, e duplicá-la seria pior que compartilhá-la. '
```

Não mexa em `from`, `to` nem `severity`. A regra já permitia; o que estava errado era o texto prometer mais rigor do que a ferramenta aplica.

- [ ] **Step 6: Verifique e commite**

```bash
bun run verificar
git status --short
git add src/shared/documento/cpf.ts src/shared/documento/index.ts testes/shared/cpf.test.ts .dependency-cruiser.js
```

Peça autorização ao usuário e então:

```bash
git commit -m "feat(shared): módulo de CPF com validação, formatação e geração"
```

---

### Task 2: Migração 0007 e a coluna nos dois módulos

**Files:**
- Create: `migrations/0007_cpf.sql`
- Modify: `src/identidade/dominio/usuario.ts`, `src/identidade/infra/usuarioRepositorio.ts`
- Modify: `src/academico/dominio/responsavel.ts`, `src/academico/infra/responsavelRepositorio.ts`
- Modify: `testes/apoio/fabricas.ts`

**Interfaces:**
- Consumes: `gerarCpf` da Task 1 (só nas fábricas).
- Produces: `Usuario.cpf: string | null` · `Responsavel.cpf: string | null` · `usuarioRepositorio.credenciaisPorCpf(sql, redeId, cpf)` com o mesmo retorno de `credenciaisPorEmail` · `usuarioRepositorio.existeCpf(sql, redeId, cpf)` · `academico.responsavelPorId(redeId, responsavelId): Promise<Responsavel | null>`, porta pública nova que a Task 6 consome.

- [ ] **Step 1: Escreva a migração**

Crie `migrations/0007_cpf.sql`:

```sql
-- CPF como identificador de acesso (ADR 0004).
-- Primeira das duas etapas da janela de compatibilidade (I6, ADR 0003): a coluna nasce anulável
-- para que a versão anterior do código continue subindo e para que o rollback não perca linha.
-- A segunda etapa, 0008, só pode rodar depois que todo usuário tiver CPF.

ALTER TABLE usuario     ADD COLUMN cpf text;
ALTER TABLE responsavel ADD COLUMN cpf text;

-- O banco garante a forma; os dígitos verificadores são regra de domínio e ficam em
-- `shared/documento/cpf.ts`. Mesma divisão que já vale para unicidade e formato em toda tabela.
ALTER TABLE usuario     ADD CONSTRAINT usuario_cpf_formato
  CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');
ALTER TABLE responsavel ADD CONSTRAINT responsavel_cpf_formato
  CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');

-- Índice PARCIAL: durante a janela existem linhas sem CPF, e sem o WHERE a primeira delas
-- impediria a segunda. Vários NULL não colidem entre si.
CREATE UNIQUE INDEX usuario_cpf_unico_na_rede
  ON usuario (rede_id, cpf) WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX responsavel_cpf_unico_na_rede
  ON responsavel (rede_id, cpf) WHERE cpf IS NOT NULL;
```

- [ ] **Step 2: Aplique e confirme**

```bash
bun run migrate && bun run migrate:status
```

Esperado: `0007_cpf` aplicada.

- [ ] **Step 3: Escreva o teste que falha**

Acrescente a `testes/identidade/usuarios.test.ts`, seguindo o estilo do arquivo (`beforeEach(limparBanco)` e fábricas):

```ts
test('o CPF gravado no convite volta na leitura do usuário', async () => {
  const rede = await criarRede({});
  const unidade = await criarUnidade({ redeId: rede.id });

  const convite = await identidade.convidarUsuario({
    redeId: rede.id,
    nome: 'Marina Alves Correia',
    email: 'marina@escolaviva.test',
    cpf: '52998224725',
    atribuicoes: [{ unidadeId: unidade.id, papel: 'secretaria' }],
  });
  if (!convite.ok) throw new Error('convite recusado no cenário');
  // `identidade` não expõe consulta de usuário por id, e criar uma porta pública só para
  // satisfazer um teste seria escopo que ninguém pediu. `checklist.test.ts` já afirma "a linha
  // caiu no banco" exatamente assim.
  const linhas = await sqlDeTeste()<{ cpf: string }[]>`
    SELECT cpf FROM usuario WHERE id = ${convite.valor.usuarioId}`;

  expect(linhas[0]?.cpf).toBe('52998224725');
});
```

Importe `sqlDeTeste` de `../apoio/banco`.

- [ ] **Step 4: Rode e confirme a falha**

```bash
bun test testes/identidade/usuarios.test.ts
```

Esperado: erro de tipo em `cpf` — `convidarUsuario` ainda não aceita o campo, o que a Task 4 resolve. Marque este teste com `test.skip` e o comentário `// habilitado na Task 4` para não bloquear o resto desta tarefa.

- [ ] **Step 5: Leve `cpf` ao domínio e aos repositórios**

Em `src/identidade/dominio/usuario.ts`, acrescente `cpf: string | null` ao tipo `Usuario`, logo depois de `email` — a mesma posição que a coluna ocupa na tabela.

Em `src/identidade/infra/usuarioRepositorio.ts`:
- some `cpf` a toda lista de colunas de `SELECT` e ao mapeamento de linha (`cpf: linha.cpf`);
- some `cpf` ao `INSERT INTO usuario (...)` e à lista de valores;
- acrescente a consulta de credenciais por CPF, gêmea da que já existe por e-mail:

```ts
/** Gêmea de `credenciaisPorEmail`: na janela o login pode chegar por qualquer um dos dois. */
export async function credenciaisPorCpf(
  sql: Sql,
  redeId: string,
  cpf: string,
): Promise<Credenciais | null> {
  const linhas = await sql<LinhaDeUsuario[]>`
    SELECT id, rede_id, nome, email, cpf, ativo, responsavel_id, senha_hash
      FROM usuario
     WHERE rede_id = ${redeId} AND cpf = ${cpf} AND ativo
  `;
  const linha = linhas[0];
  return linha === undefined ? null : credenciaisDaLinha(linha);
}

/** Gêmea de `existeEmail`. O índice parcial de 0007 recusaria de qualquer forma; esta consulta
    existe para que a recusa chegue à tela como erro de campo, e não como falha de constraint. */
export async function existeCpf(sql: Sql, redeId: string, cpf: string): Promise<boolean> {
  const linhas = await sql<{ existe: boolean }[]>`
    SELECT true AS existe FROM usuario WHERE rede_id = ${redeId} AND cpf = ${cpf} LIMIT 1
  `;
  return linhas.length > 0;
}
```

Use os nomes de tipo e a função de mapeamento que já existirem no arquivo — não invente nomes novos.

Faça o equivalente em `src/academico/dominio/responsavel.ts` (`cpf: string | null` depois de `email`) e em `src/academico/infra/responsavelRepositorio.ts`.

**O módulo `academico` ainda não tem consulta de responsável por id** — hoje só existem `listarResponsaveis`, `paginaDeResponsaveis` e `paginaDeResponsaveisDoAluno`. A Task 6 precisa dela para conferir o CPF do convite, então ela nasce aqui. No repositório:

```ts
/** Um responsável pela chave. A camada web usa no convite, para comparar o CPF digitado. */
export async function porId(
  sql: Sql,
  redeId: string,
  responsavelId: string,
): Promise<Responsavel | null> {
  const linhas = await sql<LinhaDeResponsavel[]>`
    SELECT id, rede_id, nome, email, telefone, cpf
      FROM responsavel
     WHERE rede_id = ${redeId} AND id = ${responsavelId}
  `;
  const linha = linhas[0];
  return linha === undefined ? null : responsavelDaLinha(linha);
}
```

Em `src/academico/aplicacao/consultas.ts`, exponha-a com o mesmo formato das consultas vizinhas:

```ts
export const responsavelPorId = (redeId: string, responsavelId: string): Promise<Responsavel | null> =>
  responsaveis.porId(leitura(), redeId, responsavelId);
```

e acrescente `responsavelPorId` ao objeto exportado em `src/academico/index.ts`, ao lado de `listarResponsaveis`.

- [ ] **Step 6: Gere CPF nas fábricas de teste**

Em `testes/apoio/fabricas.ts`, `criarUsuario` e `criarResponsavel` passam a gravar `cpf: gerarCpf(proximo())` quando quem chama não informar — `proximo()` é o contador que o arquivo já usa para dar unicidade a nome e e-mail. Importe `gerarCpf` de `../../src/shared/documento`. Aceite `cpf` como opção, incluindo `null`, para os testes que precisarem de valor específico ou de ausência.

Acrescente `cpf` ao tipo `UsuarioDeTeste` e ao `ResponsavelDeTeste` para que os testes de autenticação possam ler `cenario.secretaria.cpf`.

- [ ] **Step 7: Verifique e commite**

```bash
bun run verificar
git status --short
git add migrations/0007_cpf.sql src/identidade/dominio/usuario.ts src/identidade/infra/usuarioRepositorio.ts src/academico/dominio/responsavel.ts src/academico/infra/responsavelRepositorio.ts src/academico/aplicacao/consultas.ts src/academico/index.ts testes/apoio/fabricas.ts
```

Peça autorização e então:

```bash
git commit -m "feat(db): coluna cpf em usuario e responsavel, anulável durante a janela"
```

---

### Task 3: Cadastro de responsável com CPF opcional

**Files:**
- Modify: `src/academico/aplicacao/cadastrarResponsavel.ts`
- Test: `testes/academico/cadastros.test.ts` (é onde `cadastrarResponsavel` já é exercitado)

**Interfaces:**
- Consumes: `cpfValido`, `normalizarCpf` (Task 1); `Responsavel.cpf` (Task 2).
- Produces: `cadastrarResponsavel` aceita `cpf?: string | null` e devolve `Responsavel` com `cpf` normalizado ou `null`.

- [ ] **Step 1: Escreva os testes que falham**

```ts
test('cadastra responsável sem CPF — o estrangeiro existe como contato', async () => {
  const rede = await criarRede({});

  const criado = await academico.cadastrarResponsavel({
    redeId: rede.id,
    nome: 'Aiko Tanaka',
    email: 'aiko@escolaviva.test',
    cpf: '',
  });

  expect(criado.ok).toBe(true);
  if (criado.ok) expect(criado.valor.cpf).toBeNull();
});

test('recusa CPF com verificador errado', async () => {
  const rede = await criarRede({});

  const criado = await academico.cadastrarResponsavel({
    redeId: rede.id,
    nome: 'Marcos Vinícius Pires',
    email: 'marcos@escolaviva.test',
    cpf: '52998224724',
  });

  expect(criado.ok).toBe(false);
  if (!criado.ok) expect(criado.erros[0]?.campo).toBe('cpf');
});

test('guarda o CPF só com dígitos, mesmo digitado com pontuação', async () => {
  const rede = await criarRede({});

  const criado = await academico.cadastrarResponsavel({
    redeId: rede.id,
    nome: 'Heloísa Braga Sampaio',
    email: 'heloisa@escolaviva.test',
    cpf: '529.982.247-25',
  });

  expect(criado.ok).toBe(true);
  if (criado.ok) expect(criado.valor.cpf).toBe('52998224725');
});
```

- [ ] **Step 2: Rode e confirme a falha**

```bash
bun test testes/academico
```

Esperado: erro de tipo em `cpf`.

- [ ] **Step 3: Implemente**

Em `src/academico/aplicacao/cadastrarResponsavel.ts`, acrescente ao schema Zod, depois de `telefone`:

```ts
  // Campo em branco é ausência de CPF, não CPF vazio: o responsável estrangeiro existe como
  // contato e simplesmente não pode receber acesso ao portal enquanto não informar o documento.
  cpf: z
    .string()
    .trim()
    .nullish()
    .transform((valor) => (valor === undefined || valor === '' ? null : normalizarCpf(valor)))
    .refine((valor) => valor === null || cpfValido(valor), 'Informe um CPF válido.'),
```

Importe `cpfValido` e `normalizarCpf` de `'../../shared/documento'` e acrescente `cpf?: string | null` à assinatura de `cadastrarResponsavel`.

- [ ] **Step 4: Rode e confirme que passa**

```bash
bun test testes/academico
```

- [ ] **Step 5: Verifique e commite**

```bash
bun run verificar
git status --short
git add src/academico/aplicacao/cadastrarResponsavel.ts testes/academico/cadastros.test.ts
```

Peça autorização e então:

```bash
git commit -m "feat(academico): CPF opcional no cadastro de responsável"
```

---

### Task 4: Convite exigindo CPF

**Files:**
- Modify: `src/identidade/aplicacao/convidarUsuario.ts`
- Test: `testes/identidade/usuarios.test.ts`

**Interfaces:**
- Consumes: `cpfValido`, `normalizarCpf` (Task 1); `existeCpf`, `Usuario.cpf` (Task 2).
- Produces: `convidarUsuario` passa a exigir `cpf: string` e a aceitar `cpfDoCadastro?: string | null`.

**Contexto que o implementador precisa.** Duas coisas governam este arquivo:

1. `convidarUsuario` grava usuário e papéis na **mesma** unidade de trabalho (`convidarUsuario.ts:61-83`) — um convite que criasse a pessoa e falhasse ao dar o papel deixaria alguém logando sem enxergar tela nenhuma. Checagem nova entra **dentro** dessa transação, junto das que já estão lá.
2. `identidade` **não pode** importar `academico`. A regra `sem-atalho-entre-modulos` proíbe, e o grafo permitido é `academico → identidade`, nunca o contrário. Por isso o CPF do cadastro do responsável **chega como parâmetro**: quem o busca é a camada web, na Task 6, que já orquestra os dois módulos.

- [ ] **Step 1: Escreva os testes que falham**

```ts
test('recusa convite com CPF inválido', async () => {
  const rede = await criarRede({});
  const unidade = await criarUnidade({ redeId: rede.id });

  const convite = await identidade.convidarUsuario({
    redeId: rede.id, nome: 'Rui Barbosa Neto', email: 'rui@escolaviva.test',
    cpf: '11111111111',
    atribuicoes: [{ unidadeId: unidade.id, papel: 'secretaria' }],
  });

  expect(convite.ok).toBe(false);
  if (!convite.ok) expect(convite.erros[0]?.campo).toBe('cpf');
});

test('recusa CPF já usado por outro usuário da mesma rede', async () => {
  const rede = await criarRede({});
  const unidade = await criarUnidade({ redeId: rede.id });
  await criarUsuario({ redeId: rede.id, cpf: '52998224725', papeis: [] });

  const convite = await identidade.convidarUsuario({
    redeId: rede.id, nome: 'Outra Pessoa', email: 'outra@escolaviva.test',
    cpf: '52998224725',
    atribuicoes: [{ unidadeId: unidade.id, papel: 'secretaria' }],
  });

  expect(convite.ok).toBe(false);
  if (!convite.ok) expect(convite.erros[0]?.campo).toBe('cpf');
});

test('o mesmo CPF em outra rede é aceito — a unicidade é por tenant', async () => {
  const a = await criarRede({});
  const b = await criarRede({});
  const unidadeB = await criarUnidade({ redeId: b.id });
  await criarUsuario({ redeId: a.id, cpf: '52998224725', papeis: [] });

  const convite = await identidade.convidarUsuario({
    redeId: b.id, nome: 'Homônimo de Outra Rede', email: 'homonimo@escolaviva.test',
    cpf: '52998224725',
    atribuicoes: [{ unidadeId: unidadeB.id, papel: 'secretaria' }],
  });

  expect(convite.ok).toBe(true);
});

test('recusa quando o CPF digitado diverge do cadastro do responsável', async () => {
  const rede = await criarRede({});
  const unidade = await criarUnidade({ redeId: rede.id });
  const responsavel = await criarResponsavel({ redeId: rede.id, cpf: '52998224725' });

  const convite = await identidade.convidarUsuario({
    redeId: rede.id, nome: 'Mãe do Aluno', email: 'mae@escolaviva.test',
    cpf: gerarCpf(1),
    responsavelId: responsavel.id,
    cpfDoCadastro: responsavel.cpf,
    nomeDoCadastro: responsavel.nome,
    atribuicoes: [{ unidadeId: unidade.id, papel: 'responsavel' }],
  });

  expect(convite.ok).toBe(false);
  if (!convite.ok) {
    expect(convite.erros[0]?.campo).toBe('cpf');
    expect(convite.erros[0]?.mensagem).toContain(responsavel.nome);
    expect(convite.erros[0]?.mensagem).not.toContain(responsavel.cpf);
  }
});

/* Durante a janela os cadastros antigos ainda não têm CPF; exigi-lo bloquearia um fluxo que
   funcionava, que é o oposto do que a compatibilidade promete. */
test('aceita quando o cadastro do responsável ainda não tem CPF', async () => {
  const rede = await criarRede({});
  const unidade = await criarUnidade({ redeId: rede.id });
  const responsavel = await criarResponsavel({ redeId: rede.id, cpf: null });

  const convite = await identidade.convidarUsuario({
    redeId: rede.id, nome: 'Pai do Aluno', email: 'pai@escolaviva.test',
    cpf: gerarCpf(2),
    responsavelId: responsavel.id,
    cpfDoCadastro: null,
    nomeDoCadastro: responsavel.nome,
    atribuicoes: [{ unidadeId: unidade.id, papel: 'responsavel' }],
  });

  expect(convite.ok).toBe(true);
});
```

- [ ] **Step 2: Rode e confirme a falha**

```bash
bun test testes/identidade/usuarios.test.ts
```

- [ ] **Step 3: Implemente**

No schema de `convidarUsuario.ts`, depois de `email`:

```ts
  cpf: z
    .string()
    .trim()
    .transform(normalizarCpf)
    .refine(cpfValido, 'Informe um CPF válido.'),
  // O cadastro do responsável vive em `academico`, e `identidade` não pode alcançá-lo: quem o
  // busca é a camada web, que já orquestra os dois módulos. Aqui chega só o que a regra compara.
  cpfDoCadastro: z.string().nullable().optional(),
  nomeDoCadastro: z.string().optional(),
```

Acrescente `cpf: string`, `cpfDoCadastro?: string | null` e `nomeDoCadastro?: string` à assinatura, e `cpf: dados.cpf` ao objeto `Usuario` montado no fim da função.

Antes de montar o usuário, a conferência:

```ts
  // Só confere quando o cadastro já tem CPF. Sem CPF não há divergência a impedir — é o que
  // mantém o convite funcionando para os responsáveis cadastrados antes da migração 0007.
  const cpfDoCadastro = dados.cpfDoCadastro ?? null;
  if (cpfDoCadastro !== null && cpfDoCadastro !== dados.cpf) {
    return falhaDeCampo(
      'cpf',
      'cpf_diverge_do_cadastro',
      `O CPF não confere com o do cadastro de ${dados.nomeDoCadastro ?? 'responsável'}.`,
    );
  }
```

Dentro de `gravar`, logo depois da checagem `existeEmail` (`convidarUsuario.ts:73-75`):

```ts
    if (await usuarioRepositorio.existeCpf(sql, usuario.redeId, usuario.cpf)) {
      return falhaDeCampo('cpf', 'cpf_em_uso', 'já existe usuário com este CPF na rede');
    }
```

A mensagem cita o **nome** e nunca o número: quem cria o acesso tem o documento em mãos, e a tela não é lugar de publicar CPF alheio.

- [ ] **Step 4: Rode e confirme que passa**

```bash
bun test testes/identidade/usuarios.test.ts
```

Reabilite o teste que a Task 2 marcou com `test.skip`.

- [ ] **Step 5: Verifique e commite**

```bash
bun run verificar
git status --short
git add src/identidade/aplicacao/convidarUsuario.ts src/identidade/infra/usuarioRepositorio.ts testes/identidade/usuarios.test.ts
```

Peça autorização e então:

```bash
git commit -m "feat(identidade): convite exige CPF válido e confere contra o cadastro"
```

---

### Task 5: Autenticação por CPF ou e-mail

**Files:**
- Modify: `src/identidade/aplicacao/autenticar.ts`
- Test: `testes/identidade/autenticacao.test.ts`

**Interfaces:**
- Consumes: `normalizarCpf` (Task 1); `credenciaisPorCpf` (Task 2).
- Produces: `autenticar({ redeSlug, identificador, senha, ip })` — o campo `email` passa a chamar-se `identificador`.

**Contexto:** `autenticar.ts:32` guarda um `HASH_DE_USUARIO_INEXISTENTE` conferido quando ninguém é encontrado, para que a resposta demore o mesmo tanto nos dois casos. **Esse comportamento não pode se perder** — sem ele o relógio passa a responder quem trabalha na rede.

- [ ] **Step 1: Escreva os testes que falham**

```ts
test('entra com CPF cru', async () => {
  const cenario = await cenarioCompleto();

  const entrada = await identidade.autenticar({
    redeSlug: cenario.rede.slug,
    identificador: cenario.secretaria.cpf,
    senha: cenario.senha,
    ip: '',
  });

  expect(entrada.ok).toBe(true);
});

test('entra com CPF pontuado', async () => {
  const cenario = await cenarioCompleto();
  const cpf = cenario.secretaria.cpf;
  const pontuado = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;

  const entrada = await identidade.autenticar({
    redeSlug: cenario.rede.slug, identificador: pontuado, senha: cenario.senha, ip: '',
  });

  expect(entrada.ok).toBe(true);
});

/* Removido na FASE B, junto com o ramo do e-mail. A remoção faz parte da demonstração. */
test('durante a janela, ainda entra com e-mail', async () => {
  const cenario = await cenarioCompleto();

  const entrada = await identidade.autenticar({
    redeSlug: cenario.rede.slug, identificador: cenario.secretaria.email,
    senha: cenario.senha, ip: '',
  });

  expect(entrada.ok).toBe(true);
});

test('CPF inexistente e senha errada dão a mesma recusa', async () => {
  const cenario = await cenarioCompleto();

  const [inexistente, senhaErrada] = await Promise.all([
    identidade.autenticar({
      redeSlug: cenario.rede.slug, identificador: gerarCpf(999_999), senha: cenario.senha, ip: '',
    }),
    identidade.autenticar({
      redeSlug: cenario.rede.slug, identificador: cenario.secretaria.cpf, senha: 'errada', ip: '',
    }),
  ]);

  expect(inexistente.ok).toBe(false);
  expect(senhaErrada.ok).toBe(false);
  if (!inexistente.ok && !senhaErrada.ok) {
    expect(inexistente.erros).toEqual(senhaErrada.erros);
  }
});
```

- [ ] **Step 2: Rode e confirme a falha**

```bash
bun test testes/identidade/autenticacao.test.ts
```

- [ ] **Step 3: Implemente**

Em `autenticar.ts`, renomeie `email` para `identificador` no schema (mensagem `'informe o CPF'`) e na assinatura. Troque a busca de credenciais por:

```ts
/**
 * Na janela de compatibilidade o mesmo campo aceita as duas formas, e a arroba decide: e-mail
 * tem, CPF não. Some na FASE B, quando todo usuário já tem CPF.
 */
const credenciaisDe = async (
  sql: Sql,
  redeId: string,
  identificador: string,
): Promise<Credenciais | null> =>
  identificador.includes('@')
    ? await usuarioRepositorio.credenciaisPorEmail(sql, redeId, emailNormalizado(identificador))
    : await usuarioRepositorio.credenciaisPorCpf(sql, redeId, normalizarCpf(identificador));
```

e, no corpo de `autenticar`, `const credenciais = await credenciaisDe(sql, rede.id, dados.identificador);`.

Troque `CREDENCIAIS_INVALIDAS.mensagem` para `'CPF ou senha inválidos'`. O `HASH_DE_USUARIO_INEXISTENTE` e a comparação em tempo constante ficam **exatamente como estão**.

- [ ] **Step 4: Rode e confirme que passa**

```bash
bun test testes/identidade/autenticacao.test.ts
```

- [ ] **Step 5: Verifique e commite**

```bash
bun run verificar
git status --short
git add src/identidade/aplicacao/autenticar.ts testes/identidade/autenticacao.test.ts
```

Peça autorização e então:

```bash
git commit -m "feat(identidade): autenticação por CPF, com e-mail aceito na janela"
```

---

### Task 6: Camada web

**Files:**
- Modify: `src/web/render.ts`, `src/web/rotas/login.ts`, `src/web/templates/login.eta`
- Modify: `src/web/rotas/rede.ts`, `src/web/templates/rede/usuario_novo.eta`, `src/web/templates/rede/usuarios.eta`
- Modify: `src/web/rotas/secretaria.ts`, `src/web/templates/secretaria/responsavel_novo.eta`, `src/web/templates/secretaria/responsaveis.eta`
- Test: `testes/web/paginas_de_formulario.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 1 a 5.
- Produces: `it.formatarCpf` disponível em todo template.

- [ ] **Step 1: Injete `formatarCpf` no contexto de template**

Em `src/web/render.ts`, importe `formatarCpf` de `'../shared/documento'` e acrescente ao objeto `auxiliares` (`render.ts:142`), junto de `formatarData`. Uma linha; nenhuma outra mudança no arquivo.

- [ ] **Step 2: Troque o campo do login**

Em `src/web/templates/login.eta`, o campo `email` vira `identificador`, com rótulo **"CPF ou e-mail"**, `inputmode="numeric"`, `autocomplete="username"` e ajuda dizendo que o CPF pode ser digitado com ou sem pontos. Em `src/web/rotas/login.ts:85`, `texto(corpo, 'email')` vira `texto(corpo, 'identificador')`; a variável local e o objeto `valores` de `telaDeEntrada` acompanham.

O rótulo diz as duas coisas porque a tela **aceita** as duas coisas nesta fase. Ele estreita na FASE B.

- [ ] **Step 3: Ponha CPF no convite e na lista de usuários**

Em `usuario_novo.eta`, campo CPF obrigatório antes do e-mail, com ajuda *"É por ele que a pessoa entra. Com ou sem pontos."* O e-mail ganha ajuda nova: *"Contato. Não é usado para entrar."*

Em `rede.ts`, o `POST /usuarios` lê `cpf` do corpo e o repassa. Quando `responsavelId` não for vazio, busque o cadastro com `academico.responsavelPorId(redeId, responsavelId)` — a porta criada na Task 2 — e passe `cpfDoCadastro: cadastro?.cpf ?? null` e `nomeDoCadastro: cadastro?.nome`. É aqui que a orquestração entre módulos acontece, e é o único lugar onde ela pode acontecer: `formDeUsuario` já faz o mesmo tipo de combinação ao juntar `identidade.listarUnidades` com `academico.listarResponsaveis`.

Em `usuarios.eta`, coluna "CPF" depois do nome: `<td class="numero"><%= it.formatarCpf(usuario.cpf ?? '') %></td>`.

- [ ] **Step 4: Ponha CPF no cadastro e na lista de responsáveis**

Em `responsavel_novo.eta`, campo CPF **opcional** depois do e-mail, com ajuda *"Opcional. Sem CPF a pessoa fica como contato e não recebe acesso ao portal."* Em `secretaria.ts`, o `POST /responsaveis` lê `cpf` e repassa. Em `responsaveis.eta`, coluna "CPF" com o mesmo tratamento da lista de usuários.

- [ ] **Step 5: Escreva os testes de tela**

Acrescente a `testes/web/paginas_de_formulario.test.ts`:

```ts
test('a tela de entrada pede CPF', async () => {
  const html = await (await abrir('/login')).text();

  expect(html).toContain('name="identificador"');
});

test('o convite recusa CPF que diverge do cadastro, sem publicar o número', async () => {
  const cenario = await cenarioCompleto();
  const cookie = await entrarComo(cenario, 'admin');
  const responsavel = cenario.responsaveis[0];

  const resposta = await enviar('/rede/usuarios', {
    nome: 'Mãe do Aluno', email: 'mae@escolaviva.test', cpf: gerarCpf(987_654),
    responsavelId: responsavel.id, 'unidade[]': cenario.unidades[0].id, 'papel[]': 'responsavel',
  }, cookie);
  const html = await resposta.text();

  expect(resposta.status).toBe(200);
  expect(html).toContain('id="cpf-erro"');
  expect(html).toContain(responsavel.nome);
  expect(html).not.toContain(responsavel.cpf);
});
```

O último `expect` é a regra escrita como teste: a mensagem cita o nome, nunca o número.

- [ ] **Step 6: Verifique e commite**

```bash
bun run verificar
git status --short
git add src/web/render.ts src/web/rotas/login.ts src/web/templates/login.eta src/web/rotas/rede.ts src/web/templates/rede/usuario_novo.eta src/web/templates/rede/usuarios.eta src/web/rotas/secretaria.ts src/web/templates/secretaria/responsavel_novo.eta src/web/templates/secretaria/responsaveis.eta testes/web/paginas_de_formulario.test.ts
```

Peça autorização e então:

```bash
git commit -m "feat(web): CPF no login, no convite e no cadastro de responsável"
```

---

### Task 7: Seed e prova de privacidade

**Files:**
- Modify: `scripts/seed.ts`
- Modify: `testes/web/checklist.test.ts`

**Interfaces:**
- Consumes: `gerarCpf` (Task 1).
- Produces: nada consumido adiante.

- [ ] **Step 1: Grave e imprima CPF no seed**

Em `scripts/seed.ts`, todo `usuario` e todo `responsavel` recebem `cpf: gerarCpf(indice)`, com o mesmo índice que já dá unicidade aos e-mails. O bloco de credenciais impresso no fim (`seed.ts:398-404`) ganha a coluna CPF, formatada — a base é de aula e já publica a senha.

- [ ] **Step 2: Faça o teste de log valer de verdade**

`testes/web/checklist.test.ts:478` já tem `const CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/` e afirma que nenhum log contém CPF, mas hoje passa por vacuidade: não existe CPF no sistema. Em `cenarioComNomesProprios`, dê ao professor um CPF inconfundível, devolva-o no objeto do cenário e acrescente-o à lista `proibidos` do teste `'nenhum valor pessoal do cenário aparece em linha de log'`, junto de nome, e-mail e nota. Acrescente também:

```ts
expect(capturado.bruto).not.toContain(CPF_DO_PROFESSOR);
```

Cru, não formatado: o log grava dígitos, e é a forma crua que vazaria.

- [ ] **Step 3: Rode o seed de ponta a ponta**

```bash
bun run seed && bun run verificar
```

Esperado: o seed conclui, imprime CPFs, e a suíte fica verde.

- [ ] **Step 4: Commite**

```bash
git status --short
git add scripts/seed.ts testes/web/checklist.test.ts
```

Peça autorização e então:

```bash
git commit -m "feat(seed): CPF gerado para todo usuário e responsável"
```

**FASE A concluída.** Confirme com o usuário antes de seguir: quem tem CPF entra por CPF, quem não tem entra por e-mail, e o rollback é seguro em qualquer ponto.

---

# FASE B — fecha a janela

---

### Task 8: CPF obrigatório e fim do login por e-mail

**Files:**
- Create: `migrations/0008_cpf_obrigatorio.sql`
- Create: `docs/ADR/0004-cpf-como-identificador-de-acesso.md`
- Modify: `src/identidade/aplicacao/autenticar.ts`, `src/identidade/dominio/usuario.ts`
- Modify: `src/web/templates/login.eta`, `src/web/rotas/login.ts`
- Modify: `testes/identidade/autenticacao.test.ts`

**Interfaces:**
- Consumes: tudo da FASE A.
- Produces: `Usuario.cpf: string` (deixa de ser anulável).

- [ ] **Step 1: Escreva a migração**

Crie `migrations/0008_cpf_obrigatorio.sql`:

```sql
-- Fecha a janela aberta por 0007 (ADR 0003). Só pode rodar depois que todo usuário tem CPF —
-- em base de aula, depois de `bun run seed`.
-- O e-mail continua NOT NULL porque é o contato do Estágio 04; o que ele deixa de ser é único,
-- restrição que só fazia sentido enquanto identificava. Mãe e pai passam a poder compartilhar
-- um e-mail de família.

ALTER TABLE usuario ALTER COLUMN cpf SET NOT NULL;

DROP INDEX usuario_cpf_unico_na_rede;
ALTER TABLE usuario ADD CONSTRAINT usuario_cpf_unico_na_rede UNIQUE (rede_id, cpf);

ALTER TABLE usuario DROP CONSTRAINT usuario_email_unico_na_rede;
```

`responsavel.cpf` **não** é tocada: fica anulável para sempre, com o índice parcial de 0007. É a decisão sobre o responsável sem CPF.

- [ ] **Step 2: Aplique**

```bash
bun run seed && bun run migrate && bun run migrate:status
```

O `seed` vem antes de propósito: `SET NOT NULL` falha se houver linha sem CPF, e é exatamente essa falha que a janela existe para evitar em produção.

- [ ] **Step 3: Troque o teste da janela**

Em `testes/identidade/autenticacao.test.ts`, **apague** o teste `'durante a janela, ainda entra com e-mail'` — a remoção é parte da demonstração — e ponha no lugar:

```ts
test('e-mail não entra mais — o identificador é o CPF', async () => {
  const cenario = await cenarioCompleto();

  const entrada = await identidade.autenticar({
    redeSlug: cenario.rede.slug, identificador: cenario.secretaria.email,
    senha: cenario.senha, ip: '',
  });

  expect(entrada.ok).toBe(false);
});
```

- [ ] **Step 4: Rode e confirme a falha**

```bash
bun test testes/identidade/autenticacao.test.ts
```

Esperado: o teste novo falha — o ramo do e-mail ainda existe.

- [ ] **Step 5: Remova o ramo do e-mail**

Em `autenticar.ts`, `credenciaisDe` some e a busca volta a ser uma chamada só:

```ts
  const credenciais = await usuarioRepositorio.credenciaisPorCpf(
    sql,
    rede.id,
    normalizarCpf(dados.identificador),
  );
```

Apague o import de `emailNormalizado` se ele ficar sem uso. Em `src/identidade/dominio/usuario.ts`, `cpf` deixa de ser `string | null` e passa a `string`; corrija tudo o que o `tsc` apontar.

Em `login.eta`, o campo passa a chamar-se `cpf`, com rótulo **"CPF"** e sem menção a e-mail; em `login.ts`, `texto(corpo, 'identificador')` vira `texto(corpo, 'cpf')`.

- [ ] **Step 6: Rode e confirme que passa**

```bash
bun run verificar
```

- [ ] **Step 7: Escreva o ADR**

Crie `docs/ADR/0004-cpf-como-identificador-de-acesso.md` **no formato dos três ADRs existentes** — leia `docs/ADR/0003-janela-de-compatibilidade-de-migracao.md` antes de escrever e siga a estrutura dele. O conteúdo sai da spec: contexto (o e-mail acumulava identificar e contatar, e o produto prometia uma igualdade que o modelo não garantia), decisão (CPF, imutável), consequências (e-mail deixa de ser único; responsável sem CPF não recebe portal; CPF é dado pessoal e entra na redação de log) e a alternativa descartada (manter o e-mail e apenas tornar a divergência visível na tela).

- [ ] **Step 8: Commite**

```bash
git status --short
git add migrations/0008_cpf_obrigatorio.sql src/identidade/aplicacao/autenticar.ts src/identidade/dominio/usuario.ts src/web/templates/login.eta src/web/rotas/login.ts testes/identidade/autenticacao.test.ts docs/ADR/0004-cpf-como-identificador-de-acesso.md
```

Peça autorização e então:

```bash
git commit -m "feat(identidade): CPF obrigatório, fim do login por e-mail"
```

---

## Checagem final

- [ ] `bun run verificar` verde
- [ ] `bun run seed` conclui e imprime CPF junto das credenciais
- [ ] entrar pela tela com CPF pontuado e com CPF cru
- [ ] entrar com e-mail é recusado
- [ ] `migrations/` tem 0007 e 0008, e `bun run migrate:status` mostra as duas aplicadas
- [ ] `docs/ADR/0004-...` existe e segue o formato dos anteriores
