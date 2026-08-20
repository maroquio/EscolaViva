# Atividade — Aniversariantes do mês

> **O que você vai construir:** um card no painel da secretaria listando os alunos que fazem
> aniversário no mês corrente, alimentado por um endpoint novo — `GET /api/v1/registrar/birthdays`.
>
> **Tempo estimado:** 90 minutos.
> **Pré-requisito:** o Estágio 1 rodando na sua máquina (`bun run dev` abrindo em `:5173`).

O objetivo desta atividade **não é a feature**. É atravessar a fatia vertical inteira — do `SELECT`
até o pixel — passando por cada fronteira que o Estágio 1 desenhou, e sentir o que cada uma cobra de
você. No fim, `bun run verify` tem que ficar verde. Ele é o professor mais rigoroso deste
repositório.

Você vai tocar **dez arquivos**, nenhum deles com mais de vinte linhas novas. Não há migração: a
coluna `student.birth_date` já existe desde o `0001_initial_schema.sql`. Isso é de propósito — quem
mexe no schema também tem que mexer no `docs/ESCOLAVIVA_STAGE_01.md` e respeitar a janela de
compatibilidade (I6), e isso é assunto de outra atividade.

---

## O mapa da fatia

Leia de cima para baixo antes de escrever a primeira linha. Cada seta é uma fronteira, e cada
fronteira tem um guarda que reprova quem passa por cima dela.

```
  PostgreSQL   student.birth_date  (já existe)
       │
   ①   ▼   apps/api/src/academics/infra/studentRepository.ts     ← o SQL vive aqui e só aqui
   ②   ▼   apps/api/src/academics/constants.ts                   ← o limite ganha nome
   ③   ▼   apps/api/src/academics/application/studentQueries.ts  ← a regra: que mês é hoje?
   ④   ▼   apps/api/src/academics/application/queries.ts
           apps/api/src/academics/index.ts                       ← A ÚNICA PORTA DO MÓDULO
   ⑤   ▼   packages/contracts/src/students.ts                    ← o combinado entre as metades
   ⑥   ▼   apps/api/src/http/constants.ts
           apps/api/src/http/routes/registrar/dashboard.ts       ← a borda HTTP
   ⑦   ▼   apps/api/tests/academics/birthdays.test.ts            ← banco de verdade
       │
       ╎  ─── fronteira do processo: daqui para baixo é o navegador ───
       │
   ⑧   ▼   apps/web/src/features/registrar/constants.ts
           apps/web/src/features/registrar/queries.ts            ← React Query
   ⑨   ▼   apps/web/src/features/registrar/BirthdaysOfMonth.tsx
           apps/web/src/features/registrar/Dashboard.tsx         ← o card na tela
   ⑩   ▼   apps/web/tests/features/registrar/BirthdaysOfMonth.test.tsx
           bun run verify                                        ← tudo verde
```

---

## As três regras da casa

Estas três reprovam **em qualquer passo**, e são onde a turma costuma travar. Leia agora, não depois
do erro.

> ### 🚫 Regra 1 — não existe comentário em `src/`
>
> `tests/no_comments.test.ts` varre `apps/api/src`, `apps/web/src`, `packages/contracts/src` e
> `scripts/`, e reprova **qualquer** `//` ou `/* */`. A explicação vai no nome da função, no nome da
> constante ou no teste — nunca numa linha que o compilador ignora.
>
> **Onde é permitido comentar:** nos arquivos de teste (`apps/api/tests/`, `apps/web/tests/`,
> `tests/`). Lá o comentário é bem-vindo: é onde o *porquê* mora.

> ### 🚫 Regra 2 — literal solto vira constante
>
> `bun run magic` indexa todo `constants.ts` do repositório e reprova o literal que **já tem dono**
> em algum deles. A convenção da casa é mais estrita que o gate: limite, rótulo e caminho vão para
> `constants.ts` mesmo quando o gate deixaria passar. `0` e `1` são neutros e nunca são cobrados.
>
> Valor usado por **um arquivo só** pode ficar como `const` no topo dele — é o que
> `ScopeTotals.tsx` faz com `TOTALS_HEADING_ID`. Valor que atravessa arquivos vai para o
> `constants.ts` do módulo.

> ### 🚫 Regra 3 — o módulo só se enxerga pelo `index.ts`
>
> `bun run check` (dependency-cruiser) reprova quem importa `academics/application/qualquer-coisa`
> de fora do módulo `academics`. A rota HTTP importa `academics` e ponto. Se a função nova não
> estiver no `index.ts`, ela **não existe** para o resto do sistema.

E mais duas que mordem menos, mas mordem:

- **180 linhas por arquivo** (`tests/file_length.test.ts`). Atenção: `academics/constants.ts` já
  está em **171**. Você vai somar uma linha nele. Ainda cabe — mas repare no aperto.
- **Um `import` por módulo, por arquivo** (`tests/single_import_per_module.test.ts`). Ao precisar de
  um nome novo de um módulo que o arquivo **já importa**, adicione ao `import` existente. Não
  escreva um segundo.

---

## Passo ① — O SQL, no repositório

**Arquivo:** `apps/api/src/academics/infra/studentRepository.ts`

Toda linha de SQL do módulo `academics` vive em `infra/`. Nem o caso de uso nem a rota sabem que
existe um banco — é isso que a regra `pure-domain` do dependency-cruiser protege, e é isso que faz o
domínio ser testável sem `docker compose`.

Adicione a função **no fim do arquivo**:

```ts
export async function birthdaysInMonth(
  sql: Connection,
  networkId: string,
  month: number,
): Promise<Student[]> {
  const rows: StudentRow[] = await sql`
    SELECT id, network_id, name, to_char(birth_date, 'YYYY-MM-DD') AS birth_date
      FROM student
     WHERE network_id = ${networkId}
       AND extract(month FROM birth_date)::int = ${month}
     ORDER BY extract(day FROM birth_date), name
     LIMIT ${LIMITS.student.birthdayRows}`;
  return rows.map(toStudent);
}
```

Quatro decisões aqui, e nenhuma é decoração:

1. **`network_id = ${networkId}` é a primeira condição do `WHERE`.** Este é o invariante I2 do
   estágio: nenhuma consulta de tabela de negócio existe sem o filtro do tenant. Esquecer essa linha
   é vazar aluno de uma rede pagante para outra — o pior defeito que este sistema pode ter, e o mais
   silencioso, porque em desenvolvimento só existe uma rede e tudo parece funcionar.
2. **`${networkId}` e `${month}` são parâmetros, não concatenação.** A template tag do Bun manda o
   valor separado do texto do comando. Montar a string com `+` é como se abre um SQL injection.
3. **`::int`** força o Postgres a comparar inteiro com inteiro. Sem o cast, `extract` devolve
   `numeric` e o tipo do parâmetro fica ambíguo.
4. **`to_char(birth_date, 'YYYY-MM-DD')`** é o mesmo que as outras consultas do arquivo fazem: a
   data sai como texto ISO, sem passar por `Date` e sem chance de o fuso horário comer um dia.

Sobre desempenho: esta consulta **não usa índice**. O índice `student_by_name` é
`(network_id, name)`, e `extract(month FROM birth_date)` não é algo que um btree consiga procurar.
Com 450 alunos por rede isso é invisível, e ficar assim é deliberado — é exatamente a medição que
tem que justificar o Estágio 13. Se o número um dia incomodar, a resposta é um índice sobre a
expressão, não um cache.

> `Connection`, `StudentRow`, `toStudent`, `Student` e `LIMITS` **já estão importados** no topo do
> arquivo. Não escreva nenhum `import` novo aqui (Regra 5).

---

## Passo ② — O limite ganha nome

**Arquivo:** `apps/api/src/academics/constants.ts`

O `LIMITS.student.birthdayRows` que você acabou de usar ainda não existe. Adicione:

```ts
export const LIMITS = {
  student: {
    name: 120,
    searchRows: 50,
    birthdayRows: 20,
  },
  // ... o resto do objeto continua igual
```

> ⚠️ A linha `// ... o resto do objeto continua igual` acima é para **você ler**, não para colar. Se
> ela entrar no arquivo, a Regra 1 reprova.

Por que 20 vira constante e não fica como `LIMIT 20` no SQL? Por dois motivos. O primeiro é o teste:
daqui a pouco você vai escrever `ACADEMIC_LIMITS.student.birthdayRows` num arquivo de teste, e um
teste que repete o número em vez de ler o número não testa o limite — ele testa a sua memória. O
segundo é que um limite sem nome é um limite que ninguém encontra: `searchRows: 50` está a duas
linhas dali pelo mesmo motivo.

**Confira o tamanho do arquivo agora:**

```bash
wc -l apps/api/src/academics/constants.ts
```

Deve dizer **172**. O teto é 180. Esse arquivo é um dos dois maiores do repositório e está a oito
linhas do gate — não por descuido, mas porque `MESSAGES` guarda o texto que o usuário lê. Quando ele
bater no teto, a resposta certa não é subir o teto: é `MESSAGES` sair para um arquivo próprio.

---

## Passo ③ — Que mês é hoje?

**Arquivo:** `apps/api/src/academics/application/studentQueries.ts`

A camada `application/` é onde a decisão mora. O repositório sabe buscar por mês; **quem decide que
mês é** é aqui.

Substitua a primeira linha de `import` e acrescente o bloco no fim do arquivo:

```ts
import { reader } from '../../shared/db';
import { systemClock } from '../../shared/ports';
import { DEFAULT_PAGE_SIZE, queryPage, type Page } from '../../shared/pagination';
import type { Student } from '../domain/student';
import * as students from '../infra/studentRepository';

const MONTH_POSITION = 1;

export type MonthBirthdays = {
  readonly month: number;
  readonly students: readonly Student[];
};

const monthNow = (): number => Number(systemClock.today().split('-')[MONTH_POSITION]);

export async function birthdaysOfMonth(
  networkId: string,
  month: number = monthNow(),
): Promise<MonthBirthdays> {
  const found = await students.birthdaysInMonth(reader(), networkId, month);
  return { month, students: found };
}
```

(As funções `searchStudents`, `studentsPage` e `studentById` que já estão no arquivo continuam onde
estão.)

Três coisas para reparar:

**`systemClock.today()`, e não `new Date().getMonth()`.** O `shared/ports/clock.ts` formata a data no
fuso configurado da aplicação. Chamar `new Date()` direto significa perguntar as horas para o
servidor, e o servidor pode estar em UTC: no dia 1º de março às 00h30 de Brasília, o servidor ainda
acha que é fevereiro. É o tipo de defeito que aparece uma vez por mês, sempre à meia-noite, e
ninguém consegue reproduzir de dia.

**`month: number = monthNow()`.** O parâmetro opcional não é generosidade de API — ele existe para o
teste. Sem ele, o único jeito de testar seria cadastrar alunos que nascem no mês em que o teste roda,
e a suíte passaria a depender do calendário. Um teste que passa em março e falha em abril é pior do
que teste nenhum, porque ninguém acredita nele.

**`MONTH_POSITION = 1` fica local.** Só este arquivo usa. Pela Regra 2, valor de um arquivo só pode
morar no topo dele.

**Por que devolver `{ month, students }` e não só a lista?** Porque quem vai escrever o título
"Aniversariantes de março" é o navegador, e o navegador tem o relógio *do aluno*, não o do servidor.
Se o front calculasse o mês sozinho, uma máquina com o fuso errado mostraria o título de um mês e a
lista de outro. O mês viaja junto com a resposta para que os dois não possam discordar.

---

## Passo ④ — Abrir a porta do módulo

**Arquivo 1:** `apps/api/src/academics/application/queries.ts`

Este arquivo é só um índice interno. Encontre a linha de `studentQueries` e acrescente a função nova
e o tipo novo:

```ts
export { birthdaysOfMonth, searchStudents, studentById, studentsPage } from './studentQueries';
export type { MonthBirthdays } from './studentQueries';
```

**Arquivo 2:** `apps/api/src/academics/index.ts`

Este é o portão. Três edições:

```ts
import {
  academicYearById,
  academicYearsPage,
  activeEnrollmentsOfClassGroup,
  activeEnrollmentsOfClassGroupPage,
  activeEnrollmentsOfStudents,
  birthdaysOfMonth,
  classGroupById,
  // ... o resto da lista continua igual
} from './application/queries';
```

```ts
export type { SchoolCounts, ClassGroupFilter, MonthBirthdays } from './application/queries';
```

```ts
export const academics = {
  // ... perto de searchStudents e studentsPage:
  registerStudent,
  searchStudents,
  birthdaysOfMonth,
  studentsPage,
  // ...
};
```

Este passo é o coração da atividade, então vale parar nele.

Nada fora de `academics/` pode escrever
`import { birthdaysOfMonth } from '../academics/application/studentQueries'`. O
`.dependency-cruiser.js` tem uma regra chamada `no-cross-module-shortcut` em severidade `error`
justamente para isso, e `bun run check` a executa.

A razão está escrita no README e é o Estágio 14: quando um módulo precisar virar serviço próprio, a
pergunta "quem mais depende disto?" já tem resposta — é exatamente quem importa o `index.ts`. Sem a
regra, a resposta é "não sei", e a extração vira reescrita. O `index.ts` é a **superfície pública** do
módulo, e adicionar um nome a ele é uma decisão, não um detalhe.

Verifique agora:

```bash
bun run check
```

Três varreduras verdes: as regras do servidor, a fronteira de importação do front e o pacote de
contratos.

---

## Passo ⑤ — O contrato

**Arquivo:** `packages/contracts/src/students.ts`

Adicione logo depois de `StudentAsJson`:

```ts
export type MonthBirthdays = {
  readonly month: number;
  readonly students: readonly StudentAsJson[];
};
```

`packages/contracts` é o **único** ponto de acoplamento entre a API e o front. O
`apps/web/.dependency-cruiser.js` tem uma regra só, e é essa: o front não importa nada de
`apps/api`, apenas `@escolaviva/contracts`. Por isso o tipo é declarado aqui e não em qualquer um dos
dois lados.

Repare que o tipo do contrato usa `StudentAsJson`, e **não** o `Student` do domínio. São coisas
diferentes de propósito: `Student` carrega `networkId`, que é assunto interno do servidor e não tem
por que trafegar até o navegador. O que sai pela porta é sempre menos do que existe dentro.

Repare também que existem agora **dois** `MonthBirthdays`: o do `academics` (com `Student`) e o do
contrato (com `StudentAsJson`). Isso não é duplicação por descuido — é a mesma ideia dita nas duas
línguas, e o tradutor entre elas é o presenter do próximo passo. `SchoolCounts` já vivia assim.

---

## Passo ⑥ — A borda HTTP

**Arquivo 1:** `apps/api/src/http/constants.ts`

Em `REGISTRAR_ROUTES`, acrescente:

```ts
export const REGISTRAR_ROUTES = {
  dashboard: '/dashboard',
  birthdays: '/birthdays',
  students: '/students',
  // ... o resto continua igual
} as const;
```

**Arquivo 2:** `apps/api/src/http/routes/registrar/dashboard.ts`

Primeiro os dois `import` que precisam **crescer** — cuidado com a Regra 5, não crie linhas novas:

```ts
import type { MonthBirthdays, RegistrarDashboard } from '@escolaviva/contracts/students';
import {
  academicYearAsJson,
  schoolInDashboardAsJson,
  studentAsJson,
} from '../../presenters/students';
```

Depois, no fim do arquivo, a rota:

```ts
dashboardRoutes.get(REGISTRAR_ROUTES.birthdays, async (c) => {
  const networkId = currentNetwork(c);
  const { month, students } = await academics.birthdaysOfMonth(networkId);
  const birthdays: MonthBirthdays = { month, students: students.map(studentAsJson) };
  return c.json(birthdays);
});
```

Quatro coisas que você **não** escreveu, e que estão funcionando mesmo assim:

- **A autorização.** O `students.ts` que monta este arquivo já aplica `requireRole(ROLE.registrar)`
  em tudo que pendura ali. Um professor que chamar esta URL leva 403 sem você ter escrito uma linha.
- **O `network_id`.** `currentNetwork(c)` vem da sessão, nunca da URL. Se o tenant viesse do cliente,
  qualquer pessoa trocaria um `uuid` na barra de endereço e leria a rede do vizinho.
- **O cabeçalho `Cache-Control: private, no-store`.** É o item 6 do checklist do estágio, aplicado
  por middleware em toda rota autenticada.
- **O prefixo `/api/v1`.** Vem do `mountApi`. Sua rota é `/birthdays`, e ela nasce em
  `/api/v1/registrar/birthdays`.

E o `studentAsJson` você reaproveitou em vez de escrever `{ id: ..., name: ... }` na mão. É o que
garante que o aluno tenha a mesma forma nesta resposta e em todas as outras.

**Teste na unha antes de seguir.** Com `bun run dev` no ar, entre em `http://localhost:5173`, faça
login como `secretaria1@escolaviva.test` (senha `escolaviva`, rede `demo` — o CPF sai no
`bun run seed`) e então abra em outra aba:

```
http://localhost:5173/api/v1/registrar/birthdays
```

Você deve ver um JSON com `month` e `students`. Se vier `[]` em `students`, provavelmente ninguém do
seed nasceu neste mês — siga assim mesmo, o teste do próximo passo controla as datas.

---

## Passo ⑦ — O teste da API

**Arquivo novo:** `apps/api/tests/academics/birthdays.test.ts`

```ts
import { beforeEach, describe, expect, test } from 'bun:test';
import { academics } from '../../src/academics';
import { clearDatabase } from '../support/database';
import { createNetwork, createStudent } from '../support/factories';

beforeEach(clearDatabase);

const MARCH = 3;

describe('aniversariantes do mês', () => {
  test('traz só quem nasceu no mês pedido, em ordem de dia', async () => {
    const network = await createNetwork();
    await createStudent({ networkId: network.id, name: 'Bruno', birthDate: '2015-03-20' });
    await createStudent({ networkId: network.id, name: 'Ana', birthDate: '2014-03-04' });
    await createStudent({ networkId: network.id, name: 'Carla', birthDate: '2016-04-01' });

    const { month, students } = await academics.birthdaysOfMonth(network.id, MARCH);

    expect(month).toBe(MARCH);
    expect(students.map((student) => student.name)).toEqual(['Ana', 'Bruno']);
  });

  test('a ordem é por dia do mês, não por ano de nascimento', async () => {
    const network = await createNetwork();
    await createStudent({ networkId: network.id, name: 'Mais velho', birthDate: '2010-03-28' });
    await createStudent({ networkId: network.id, name: 'Mais novo', birthDate: '2019-03-02' });

    const { students } = await academics.birthdaysOfMonth(network.id, MARCH);

    expect(students.map((student) => student.name)).toEqual(['Mais novo', 'Mais velho']);
  });

  test('o aluno da rede vizinha não aparece', async () => {
    const [minha, vizinha] = await Promise.all([createNetwork(), createNetwork()]);
    await createStudent({ networkId: minha.id, name: 'Meu aluno', birthDate: '2015-03-10' });
    await createStudent({ networkId: vizinha.id, name: 'Aluno alheio', birthDate: '2015-03-11' });

    const { students } = await academics.birthdaysOfMonth(minha.id, MARCH);

    expect(students.map((student) => student.name)).toEqual(['Meu aluno']);
  });
});
```

Rode:

```bash
docker compose up -d test_database
bun test apps/api/tests/academics/birthdays.test.ts
```

O terceiro caso é o mais importante dos três, e é o que quase ninguém escreve. Ele não testa a
feature — testa o **isolamento entre redes**. Um `WHERE network_id` esquecido não quebra nenhum dos
outros dois testes, não quebra a tela, não aparece no log e não dá erro: ele só entrega aluno errado
para o cliente errado. Todo teste de consulta neste repositório carrega um caso assim.

Repare também que o teste chama `academics.birthdaysOfMonth`, e não `studentRepository`. Ele entra
pela mesma porta pela qual a rota entra. Se você tivesse esquecido o Passo ④, este teste nem
compilaria — o que é exatamente o alarme que se quer.

> **Aqui comentário é permitido.** O `no_comments.test.ts` não varre as pastas de teste. É onde o
> *porquê* de um caso estranho deve ser escrito.

---

## Passo ⑧ — O front pede os dados

**Arquivo 1:** `apps/web/src/features/registrar/constants.ts`

Três acréscimos. Em `REGISTRAR_API`:

```ts
export const REGISTRAR_API = {
  dashboard: '/registrar/dashboard',
  birthdays: '/registrar/birthdays',
  students: STUDENTS,
  // ... o resto continua igual
} as const;
```

Em `REGISTRAR_QUERY_KEYS`:

```ts
export const REGISTRAR_QUERY_KEYS = {
  dashboard: (page: number) => [REGISTRAR_KEY, 'dashboard', page] as const,
  birthdays: [REGISTRAR_KEY, 'birthdays'] as const,
  // ... o resto continua igual
};
```

E, no fim do arquivo, os rótulos:

```ts
export const NO_BIRTHDAYS_SENTENCE = 'Nenhum aluno faz aniversário neste mês.';

const FIRST_MONTH = 1;

const MONTH_NAMES: readonly string[] = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export const birthdaysTitle = (month: number): string =>
  `Aniversariantes de ${MONTH_NAMES[month - FIRST_MONTH] ?? ''}`;
```

O `?? ''` não é paranoia: o `tsconfig.base.json` liga `noUncheckedIndexedAccess`, então o TypeScript
trata `MONTH_NAMES[x]` como `string | undefined` e **obriga** você a dizer o que acontece quando o
índice não existe. É a flag que transforma um `undefined` em tempo de execução em um erro de
compilação.

**Arquivo 2:** `apps/web/src/features/registrar/queries.ts`

Acrescente `MonthBirthdays` ao `import type` que já existe (Regra 5!) e o hook no fim do arquivo:

```ts
import type {
  GuardianInList,
  MonthBirthdays,
  RegistrarDashboard,
  StudentInList,
  StudentRecord,
  TransferView,
} from '@escolaviva/contracts/students';
```

```ts
export function useBirthdays() {
  return useQuery<MonthBirthdays, ApiError>({
    queryKey: registrarKeys.birthdays,
    queryFn: () =>
      client.get<MonthBirthdays>(REGISTRAR_API.birthdays).then((response) => response.data),
  });
}
```

A chave `registrarKeys.birthdays` não tem parâmetro nenhum porque a resposta não depende de nada além
de quem está logado — não há página, não há filtro. Chave de cache é a identidade da pergunta: se
duas perguntas diferentes compartilham a mesma chave, uma responde pela outra.

---

## Passo ⑨ — O card na tela

**Arquivo novo:** `apps/web/src/features/registrar/BirthdaysOfMonth.tsx`

```tsx
import { Card, Group, Stack, Text, Title } from '@mantine/core';
import { formatDate } from '../../shared/format';
import { LoadFailed } from '../../shared/ui/LoadFailed';
import { Loading } from '../../shared/ui/Loading';
import { MUTED_TEXT, SPREAD_APART } from '../../shared/ui/constants';
import { NO_BIRTHDAYS_SENTENCE, birthdaysTitle } from './constants';
import { useBirthdays } from './queries';

const BIRTHDAYS_HEADING_ID = 'aniversariantes';

export function BirthdaysOfMonth(): React.ReactElement {
  const birthdays = useBirthdays();

  if (birthdays.isPending) return <Loading />;
  if (birthdays.isError) {
    return <LoadFailed error={birthdays.error} onRetry={() => void birthdays.refetch()} />;
  }

  const { month, students } = birthdays.data;

  return (
    <section aria-labelledby={BIRTHDAYS_HEADING_ID}>
      <Title order={2} id={BIRTHDAYS_HEADING_ID} mb="md">
        {birthdaysTitle(month)}
      </Title>

      {students.length === 0 ? (
        <Text c={MUTED_TEXT}>{NO_BIRTHDAYS_SENTENCE}</Text>
      ) : (
        <Card withBorder>
          <Stack gap="xs">
            {students.map((student) => (
              <Group key={student.id} justify={SPREAD_APART}>
                <Text>{student.name}</Text>
                <Text size="sm" c={MUTED_TEXT}>
                  {formatDate(student.birthDate)}
                </Text>
              </Group>
            ))}
          </Stack>
        </Card>
      )}
    </section>
  );
}
```

**Arquivo 2:** `apps/web/src/features/registrar/Dashboard.tsx`

Duas linhas. O `import` (mantendo a ordem alfabética dos vizinhos):

```tsx
import { BirthdaysOfMonth } from './BirthdaysOfMonth';
```

E o componente dentro do `<Stack>`:

```tsx
      <Stack gap="xl">
        <ScopeTotals currentYear={currentYear} totals={totals} />
        <BirthdaysOfMonth />
        <SchoolsInScope schools={schools} page={page} />
      </Stack>
```

Repare no desenho: **o card busca os próprios dados**. Ele não recebe `students` por prop do
`Dashboard`, como o `ScopeTotals` recebe `totals`. A diferença tem consequência: se o endpoint de
aniversariantes cair, o card mostra o próprio erro com um botão de tentar de novo e o resto do painel
continua de pé. Se os dados viessem no mesmo `fetch` do painel, uma consulta secundária derrubaria a
tela inteira. Painel é composição de coisas independentes; é assim que cada pedaço pode falhar
sozinho.

Duas coisas que não são enfeite:

- **`<section aria-labelledby>` com o `<Title>` de `id` correspondente.** É o que dá ao leitor de
  tela uma região navegável com nome. O `e2e/accessibility.spec.ts` existe porque isso é requisito, e
  não gentileza.
- **`SPREAD_APART` e `MUTED_TEXT` em vez de `'space-between'` e `'dimmed'`.** Regra 2. Esses dois
  já têm dono em `shared/ui/constants.ts`, então aqui o `bun run magic` reprovaria de verdade.

Agora abra `http://localhost:5173/registrar` logado como secretaria. O card está lá.

---

## Passo ⑩ — O teste do front, e o fecho

**Arquivo novo:** `apps/web/tests/features/registrar/BirthdaysOfMonth.test.tsx`

```tsx
import { screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, test } from 'vitest';
import { server } from '../../testSetup';
import { renderWithProviders } from '../../testSupport';
import { BirthdaysOfMonth } from '../../../src/features/registrar/BirthdaysOfMonth';

const BIRTHDAYS = '*/api/v1/registrar/birthdays';
const MARCH = 3;

describe('card de aniversariantes', () => {
  test('escreve o mês por extenso e lista quem faz aniversário', async () => {
    server.use(
      http.get(BIRTHDAYS, () =>
        HttpResponse.json({
          month: MARCH,
          students: [
            { id: 'student-1', name: 'Ana Souza', birthDate: '2014-03-04' },
            { id: 'student-2', name: 'Bruno Lima', birthDate: '2015-03-20' },
          ],
        }),
      ),
    );

    renderWithProviders(<BirthdaysOfMonth />, '/registrar');

    expect(await screen.findByText('Aniversariantes de março')).toBeVisible();
    expect(screen.getByText('Ana Souza')).toBeVisible();
    expect(screen.getByText('04/03/2014')).toBeVisible();
  });

  test('mês sem ninguém não vira card vazio', async () => {
    server.use(http.get(BIRTHDAYS, () => HttpResponse.json({ month: MARCH, students: [] })));

    renderWithProviders(<BirthdaysOfMonth />, '/registrar');

    expect(await screen.findByText('Nenhum aluno faz aniversário neste mês.')).toBeVisible();
  });
});
```

O segundo caso é o que separa uma tela pronta de uma tela quase pronta. Lista vazia é o estado mais
comum de qualquer tela nova e o menos testado de todos — e um card com moldura e nada dentro parece
defeito para quem está usando.

Repare que o teste passa por `msw`: ele não conhece a API, só o **contrato**. É o mesmo JSON que o
Passo ⑤ declarou. Se alguém renomear `month` no servidor sem renomear no contrato, o `typecheck`
acusa antes de qualquer teste rodar.

### O fecho

```bash
bun run verify
```

Isso é `typecheck` + `check` + `magic` + `test` + `budget`. **Só está pronto quando isso está verde.**

---

## Checklist

- [ ] `bun run check` — nenhum atalho entre módulos
- [ ] `bun run magic` — nenhum literal com dono solto no código
- [ ] `bun run typecheck` — cinco projetos, zero erro
- [ ] `bun test apps/api/tests/academics/birthdays.test.ts` — três casos verdes
- [ ] `bun run --cwd apps/web test` — dois casos novos verdes
- [ ] `bun run test:project` — sem comentário em `src/`, sem arquivo acima de 180 linhas, sem
      `import` duplicado
- [ ] `bun run verify` — tudo, de ponta a ponta
- [ ] O card aparece em `http://localhost:5173/registrar`
- [ ] Um professor que abre `/api/v1/registrar/birthdays` leva 403

---

## Se algo der errado

| O que apareceu | O que é | Onde consertar |
|---|---|---|
| `error no-cross-module-shortcut` | alguém importou `academics/application/...` de fora do módulo | Passo ④ — a função tem que sair pelo `index.ts` |
| `bun run magic` apontando uma linha sua | literal que já tem dono em algum `constants.ts` | importe a constante em vez de repetir o valor |
| `no comment is left in src/` | sobrou um `//` ou `/* */` | apague; se a explicação é necessária, ela vira nome ou vai para o teste |
| `file over 180 lines` | um arquivo passou do teto | não suba o teto: separe o que virou um segundo assunto |
| `imports twice from the same module` | dois `import` do mesmo caminho no mesmo arquivo | junte tudo num `import` só |
| A tela dá 404 e a API responde | você abriu `:3000` sem ter rodado `build:web` | use `:5173`, que é onde o Vite serve as telas |
| `no configuration file provided: not found` | falta `COMPOSE_FILE=infra/docker-compose.yml` no `.env` | `echo 'COMPOSE_FILE=infra/docker-compose.yml' >> .env` |
| O teste da API trava ou não acha o banco | o banco descartável não está no ar | `docker compose up -d test_database` |

---

## Agora é com você

Sem gabarito. Em ordem crescente de dificuldade:

1. **Mostre a idade que o aluno vai fazer.** "Ana Souza — 04/03, faz 12 anos". Existe uma função
   `ageOn` em `academics/domain/student.ts`; decida se ela serve, e principalmente decida **onde** o
   cálculo mora: no domínio, no presenter ou no navegador. Justifique a escolha.

2. **Restrinja às unidades do escopo do secretário.** Hoje a consulta é da rede inteira — o mesmo
   que a busca de alunos já faz, porque `student` é uma entidade de rede e não tem `school_id`. Para
   filtrar por unidade é preciso passar pela matrícula ativa (`enrollment` → `class_group` →
   `school`) e usar o `registrarSchools(c)` que a rota já tem à disposição. Repare que isso muda o
   significado da tela: um aluno sem matrícula ativa some do card. Isso é o certo?

3. **Pagine o card.** Há vinte por vez hoje, por causa do `LIMITS.student.birthdayRows`. Use o
   `queryPage` de `shared/pagination` e o `pageAsJson` do presenter, como
   `activeEnrollmentsOfClassGroupPage` faz. Pergunta antes de codar: **um card de painel deve ser
   paginado, ou o limite é a resposta certa?**

4. **Cubra com um teste E2E.** Em `e2e/registrar-journey.spec.ts`, com Playwright e banco real. Todo
   dado criado ali precisa levar a marca `[e2e]` e ser limpo depois — leia o `e2e/support.ts` antes.
   E note o problema difícil: o E2E roda em qualquer mês do ano, e o card mostra o mês corrente.
   Como se escreve um teste desses sem que ele passe a depender do calendário?

5. **Desafio de verdade — um índice honesto.** Rode `bun run seed:volume --sim`, depois
   `EXPLAIN ANALYZE` na consulta do Passo ①. Anote o tempo. Crie um índice sobre a expressão
   (`CREATE INDEX ... ON student (network_id, (extract(month FROM birth_date))))`) numa migração
   nova, meça de novo e escreva as duas medições. Depois responda: **esse índice deveria entrar no
   Estágio 1?** O README tem uma opinião formada sobre isso na seção "O que fica deliberadamente de
   fora" — leia antes de responder, e discorde se achar que deve.
