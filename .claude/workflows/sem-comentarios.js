export const meta = {
  name: 'sem-comentarios',
  description: 'Remove todo comentário de src/ e scripts/, preservando as diretivas que a ferramenta lê',
  whenToUse: 'Quando a decisão for que o código não carrega comentário.',
  phases: [
    { title: 'Remover', detail: 'um agente por área, partição disjunta' },
    { title: 'Provar', detail: 'golden byte a byte, suíte verde, verify exit 0' },
  ],
};

const CONTEXTO = `
REPOSITÓRIO: EscolaViva — Bun + Hono + Eta + Postgres. Bancos Docker de pé.
Rode SEMPRE com \`env -u FORCE_COLOR\`.

ATENÇÃO — OUTRA SESSÃO TRABALHA NESTE REPOSITÓRIO, commitando e fazendo push.
  - NUNCA rode git add, commit, push, checkout, rebase ou stash.
  - Arquivo fora do seu escopo modificado NÃO é regressão sua.
  - \`bun test\` com 'deadlock detected' é a suíte dela: crie um banco isolado via
    TEST_DATABASE_URL, use, e DROPE ao terminar.
  - NÃO toque em docs/ — é dela.

ESTADO: \`bun run verify\` sai 0 — 714 testes, depcruise limpo (118 módulos), golden de
75 telas com diff zero, verificador de magic values limpo.
`;

const DECISAO = `
A DECISÃO DO DONO DO REPOSITÓRIO: o código não carrega comentário. Remova TODOS,
incluindo os que já existiam antes deste trabalho e os que são bons. Não é uma poda de
excesso; é a retirada de uma categoria inteira.

SAI:
  - docblock \`/** */\` de módulo, de função, de tipo, de constante e de propriedade
  - comentário de bloco \`/* */\`
  - comentário de linha \`//\`
  - comentário dentro de bloco Eta \`<% // … %>\` e \`<% /* … */ %>\`
  - comentário HTML \`<!-- -->\` nos templates, se houver

FICA — e isto NÃO é negociação da decisão, é constatação de que estes não são comentário
na função que exercem, e removê-los quebra o build:

  1. \`// magic-values: allowed — <reason>\` é DIRETIVA. \`scripts/magic-values.ts\` a lê e a
     parseia; removê-la reabre o achado que ela suprime e deixa \`bun run verify\`
     vermelho. Preserve o marcador E o texto do motivo na mesma linha, porque a regra de
     auditoria confere esse texto. Se a prosa explicativa em volta dele for comentário
     comum, essa sai.
  2. O campo \`comment:\` do \`.dependency-cruiser.js\` é VALOR de configuração, impresso
     quando a regra é violada. Não é comentário de código. Aquele arquivo está fora do seu
     escopo de qualquer modo.
  3. Diretiva de ferramenta, se houver: \`@ts-expect-error\`, \`eslint-disable\`, \`#!\`,
     \`/// <reference>\`, \`@vite-ignore\`. Nenhuma foi vista, mas se aparecer, fica.

CUIDADO QUE CUSTA A TELA — a armadilha do Eta:
  \`autoTrim: [false, 'nl']\` come a quebra de linha logo após \`%>\`. Vários templates têm
  comentário posicionado justamente para compensar isso. REMOVER UM BLOCO DE COMENTÁRIO
  PODE MUDAR O HTML. O golden de 75 telas é a prova: se ele acusar, você mexeu na tela.
  Ajuste o espaçamento até o diff zerar; NUNCA rode \`golden --rewrite\`.

CUIDADO COM TIPO: em TypeScript, remover um docblock não muda tipo, mas se houver
\`@type\` ou \`@satisfies\` em JSDoc dentro de \`.js\`, ele É tipo. \`.claude/workflows/*.js\` está
fora do seu escopo; \`scripts/*.ts\` é TypeScript e não depende de JSDoc.
`;

const REGRAS = `
REGRAS:

1. COMPORTAMENTO NÃO MUDA. Nenhum byte de HTML, nenhuma asserção de teste, nenhum tipo.
2. NÃO reescreva código para "compensar" a saída do comentário. Nada de renomear variável,
   extrair função ou mudar estrutura. Esta passada só REMOVE.
3. NUNCA rode comando de git, nem \`golden --rewrite\`.
4. NÃO edite arquivo fora do seu escopo — outros agentes trabalham em paralelo.
5. Se remover um comentário exigir mudar código para o arquivo continuar compilando ou
   renderizando igual, PARE e relate em \`pendencias\` em vez de improvisar.
`;

const RESULTADO = {
  type: 'object',
  additionalProperties: false,
  required: ['arquivosAlterados', 'linhasRemovidas', 'resumo'],
  properties: {
    arquivosAlterados: { type: 'array', items: { type: 'string' } },
    linhasRemovidas: { type: 'integer' },
    resumo: { type: 'string' },
    pendencias: { type: 'string' },
  },
};

phase('Remover');

const AREAS = [
  { rotulo: 'templates-secretaria', escopo: 'src/web/templates/secretaria/*.eta' },
  {
    rotulo: 'templates-rede-conta-login',
    escopo:
      'src/web/templates/rede/*.eta, src/web/templates/conta/*.eta, ' +
      'src/web/templates/login.eta, src/web/templates/erro.eta',
  },
  {
    rotulo: 'templates-professor-responsavel-comunicados',
    escopo:
      'src/web/templates/professor/*.eta, src/web/templates/responsavel/*.eta, ' +
      'src/web/templates/comunicados/*.eta',
  },
  {
    rotulo: 'templates-layout-parciais',
    escopo:
      'src/web/templates/_layout.eta, src/web/templates/_layout_publico.eta, ' +
      'src/web/templates/parciais/*.eta',
    nota:
      'ATENÇÃO MÁXIMA: os dois layouts e as parciais entram nas 75 telas do golden. Um byte ' +
      'a mais aqui reprova tudo. O corpo do <script> de _script_avisos.eta viaja para o ' +
      'navegador: comentário DENTRO dele é conteúdo entregue, e removê-lo muda o HTML — ' +
      'confira no golden antes de decidir.',
  },
  { rotulo: 'web-rotas', escopo: 'src/web/rotas/*.ts' },
  { rotulo: 'web-nucleo', escopo: 'src/web/*.ts (app.ts, render.ts, health.ts, paginacao.ts, constantes.ts)' },
  { rotulo: 'shared', escopo: 'src/shared/**/*.ts' },
  { rotulo: 'academico', escopo: 'src/academico/**/*.ts' },
  { rotulo: 'identidade', escopo: 'src/identidade/**/*.ts' },
  { rotulo: 'avaliacao-comunicacao', escopo: 'src/avaliacao/**/*.ts e src/comunicacao/**/*.ts' },
  { rotulo: 'raiz-e-scripts', escopo: 'src/main.ts e scripts/*.ts (inclusive magic-values.ts, golden.ts, migrate.ts, seed*.ts, build-assets.ts, constantes.ts)' },
];

const remocoes = await parallel(
  AREAS.map((a) => () =>
    agent(
      `${CONTEXTO}

${DECISAO}

SEU ESCOPO, e nada além dele: ${a.escopo}
${a.nota ? `\n${a.nota}\n` : ''}
${REGRAS}

Ao terminar:
  env -u FORCE_COLOR bunx tsc --noEmit
  env -u FORCE_COLOR bun run check
  env -u FORCE_COLOR bun test testes/web/golden.test.ts   → diff ZERO, em banco isolado
  env -u FORCE_COLOR bun scripts/magic-values.ts          → não pode piorar

Relate quantas linhas removeu e qualquer lugar em que o golden acusou e você precisou
ajustar espaçamento.`,
      { label: `remove:${a.rotulo}`, phase: 'Remover', schema: RESULTADO, effort: 'high' },
    ),
  ),
);

const feitas = remocoes.filter(Boolean);
const totalLinhas = feitas.reduce((s, r) => s + (r.linhasRemovidas ?? 0), 0);
log(`${feitas.length}/${AREAS.length} áreas. ${totalLinhas} linhas removidas.`);
const pendencias = feitas.map((f) => f.pendencias).filter(Boolean);
for (const p of pendencias) log(`PENDÊNCIA: ${p.slice(0, 200)}`);

phase('Provar');

const veredito = await agent(
  `${CONTEXTO}

${DECISAO}

Onze agentes acabaram de remover comentário de todo o \`src/\` e \`scripts/\`. PROVE que nada
quebrou e conserte o que quebrou.

Na ordem:
1. \`bunx tsc --noEmit\`
2. \`bun run check\` — 0 violações
3. \`bun test\` num banco isolado — 714 testes eram verdes.
4. Golden das 75 telas com diff ZERO. É aqui que a armadilha do \`autoTrim\` aparece: se
   acusar, um comentário removido estava compensando espaçamento. Ajuste o espaçamento —
   JAMAIS regrave o golden.
5. \`bun scripts/magic-values.ts\` — as diretivas \`// magic-values: allowed\` precisam ter
   sobrevivido. Se algum agente removeu uma, o achado reabriu: reponha a diretiva com o
   motivo, não o comentário em volta.
6. \`bun run verify\` exit 0.

${pendencias.length ? `PENDÊNCIAS relatadas:\n${pendencias.join('\n---\n')}` : ''}

${REGRAS}

Relate o resultado exato de cada comando, com números.`,
  { label: 'verify', phase: 'Provar', effort: 'high' },
);

const critico = await agent(
  `${CONTEXTO}

${DECISAO}

A remoção terminou. Você é o CRÍTICO. NÃO edite arquivo. Meça, não confira lista.

1. Sobrou comentário em \`src/\` ou \`scripts/\`? Varra por AST no \`.ts\` (não por regex, que
   confunde \`//\` dentro de string e de regex) e por parser do Eta nos templates. Liste
   arquivo:linha de tudo que sobrou e classifique: diretiva legítima, ou comentário que
   escapou.

2. Alguma diretiva \`// magic-values: allowed\` foi removida por engano? Compare com o
   estado anterior: eram 16 vivas. Se alguma sumiu, o verificador estaria vermelho — mas
   confira também se alguma foi mantida com o motivo truncado.

3. O comportamento mudou em algum lugar? O golden cobre as 75 telas; e o que ele NÃO
   cobre? Procure comentário removido que era conteúdo entregue — dentro de \`<script>\`,
   dentro de string, dentro de template literal — e diga se algum caso real existia.

4. Alguma remoção arrastou código junto? Compare a contagem de linhas NÃO comentário antes
   e depois, por arquivo. Um arquivo que perdeu linha de código perdeu comportamento.

5. Algum agente reescreveu código em vez de só remover — renomeou, extraiu função, mudou
   estrutura? A regra era só remover. Cite arquivo:linha.

6. O que ficou pior de entender sem o comentário, a ponto de a próxima pessoa errar? Não é
   para reverter — é para o dono saber o que custou. Cite os três piores casos.

${REGRAS}

Seja específico e cético. Cite arquivo:linha sempre.`,
  { label: 'critico', phase: 'Provar', effort: 'high' },
);

return {
  areas: feitas.length,
  linhasRemovidas: totalLinhas,
  pendencias,
  veredito,
  critico,
};
