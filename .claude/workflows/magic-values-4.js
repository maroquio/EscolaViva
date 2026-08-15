export const meta = {
  name: 'magic-values-4',
  description: 'Quarta passada: rótulos de ação nos templates e a regra de lint que os guarda',
  whenToUse: 'Quando texto de nó em .eta repetir valor já declarado em constantes.ts.',
  phases: [
    { title: 'Ligar', detail: 'rótulos de botão e link lendo TITULOS, e a regra nova no lint' },
    { title: 'Provar', detail: 'golden idêntico, suíte verde, lint acusando a classe nova' },
  ],
};

const CONTEXTO = `
REPOSITÓRIO: EscolaViva — Bun + Hono + Eta + Postgres. Material didático (TEES2).
Bancos Docker de pé. Rode SEMPRE com \`env -u FORCE_COLOR\`.

SITUAÇÃO: três passadas de refactor de magic values já rodaram e estão COMMITADAS
(HEAD = f69f831), working tree limpo. \`bun run verificar\` sai 0: 714 testes verdes,
depcruise limpo (118 módulos), golden de 75 telas com diff zero, lint limpo.

A infraestrutura existe:
  src/web/constantes.ts     ROTAS, TEMPLATES, TITULOS, CAMPOS, AVISOS, APRESENTACAO, DOCUMENTO
  src/web/render.ts         injeta it.rotas, it.titulos, it.parciais, it.documento, it.apresentacao
  scripts/magic-values.ts   o verificador, dentro do \`bun run verificar\`

O GOLDEN É A LINHA VERMELHA. testes/web/golden.test.ts compara o HTML das 75 telas com o
congelado. Diff = você mudou uma tela, o que este trabalho proíbe. O texto renderizado
precisa sair BYTE A BYTE idêntico — você está trocando a origem do texto, não o texto.
JAMAIS rode \`bun run golden --regravar\`.
`;

const DEFEITO = `
O DEFEITO: 15 textos distintos, 32 ocorrências, repetem em \`.eta\` um valor que
\`src/web/constantes.ts\` já declara. As três passadas anteriores fecharam os \`<h1>\` e o
\`parciais/_navegacao.eta\`, mas ninguém buscou o mesmo texto em \`<button>\` e em
\`<a class="botao">\`.

  4x  'Turmas'                 4x  'Cadastrar turma'
  3x  'Cadastrar aluno'        3x  'Cadastrar responsável'
  3x  'Cadastrar disciplina'   3x  'Minhas turmas'
  2x  'Criar unidade'          2x  'Definir ano letivo'
  2x  'Disciplinas'            1x  'Entrar'
  1x  'Trocar senha'           1x  'Unidades'
  1x  'Convidar usuário'       1x  'Alunos'
  1x  'Meus alunos'

Exemplo concreto:
  src/web/templates/secretaria/responsavel_novo.eta:122
    <button class="botao botao--primario" type="submit">Cadastrar responsável</button>
  src/web/templates/secretaria/responsaveis.eta:36
    <a class="botao botao--primario" href="…responsavelNovo()">Cadastrar responsável</a>
  src/web/templates/secretaria/aluno_responsavel_novo.eta:56
    <a class="botao botao--primario" href="…responsavelNovo()">Cadastrar responsável</a>
  src/web/constantes.ts:363
    responsavelNovo: 'Cadastrar responsável',

A DECISÃO JÁ TOMADA: o rótulo do botão que leva à tela X passa a ler o título de X. É a
mesma decisão dita uma vez — renomear "Cadastrar responsável" para "Novo responsável" faz
a tela e todos os caminhos até ela andarem juntos, em vez de exigir varredura manual.
`;

const REGRAS = `
REGRAS:

1. FONTE ÚNICA POR MÓDULO. Um módulo só enxerga outro pelo index.ts dele.

2. MERGE POR CONCEITO, NUNCA POR VALOR. Só ligue quando o texto do rótulo E o título da
   tela de destino são a mesma decisão. Se um texto coincide por acaso com outro de
   sentido diferente, são duas coisas — deixe separado e explique no comentário.

3. FORA DO ESCOPO: status HTTP, nomes de tabela/coluna SQL, quantificadores de regex,
   0 e 1, dados de seed, testes/** inteiro, e o corpo do <script> de
   src/web/templates/parciais/_script_avisos.eta.

4. COMPORTAMENTO NÃO MUDA. Um byte diferente no HTML é falha, não melhoria.

5. NUNCA rode git add, git commit, git push, git checkout nem \`golden --regravar\`.

6. NÃO edite arquivo fora do seu escopo — outros agentes trabalham em paralelo agora.

7. CONSTANTE ÓRFÃ É PIOR QUE LITERAL. Ao terminar, toda chave do seu escopo tem
   consumidor ou foi apagada.
`;

const RESULTADO = {
  type: 'object',
  additionalProperties: false,
  required: ['arquivosAlterados', 'resumo'],
  properties: {
    arquivosAlterados: { type: 'array', items: { type: 'string' } },
    resumo: { type: 'string' },
    pendencias: { type: 'string' },
  },
};

phase('Ligar');

const FRENTES = [
  {
    rotulo: 'secretaria',
    escopo: 'src/web/templates/secretaria/*.eta e src/web/rotas/secretaria.ts',
    extra: `Concentra a maior parte: 'Cadastrar aluno' (3x), 'Cadastrar responsável' (3x),
'Cadastrar disciplina' (3x), 'Cadastrar turma' (4x), 'Turmas' (4x), 'Disciplinas' (2x),
'Alunos'. Confira também 'Vincular responsável', 'Matricular', 'Transferir de turma' e
'Alocar disciplina e professor', que podem aparecer como rótulo de ação além do <h1>.

Investigue primeiro COMO it.titulos já chega ao template — src/web/render.ts já o injeta
em todo render. Provavelmente não é preciso mexer na rota; confirme antes de mudar
qualquer handler.`,
  },
  {
    rotulo: 'rede-conta-professor-responsavel',
    escopo:
      'src/web/templates/{rede,professor,responsavel,conta,comunicados}/*.eta, ' +
      'src/web/templates/{login,erro}.eta, e as rotas correspondentes em src/web/rotas/ ' +
      '(EXCETO src/web/rotas/secretaria.ts, src/web/rotas/mapa.ts e src/web/rotas/index.ts)',
    extra: `Aqui estão: 'Criar unidade' (2x), 'Definir ano letivo' (2x), 'Convidar usuário',
'Unidades', 'Minhas turmas' (3x), 'Meus alunos', 'Trocar senha', 'Entrar'.

'Entrar' em login.eta merece atenção: confira se o TITULOS correspondente é mesmo o
título daquela tela e não outra coisa — ligar por coincidência de string é o erro que a
regra 2 proíbe.

Investigue primeiro COMO it.titulos já chega ao template (src/web/render.ts o injeta em
todo render). Provavelmente não é preciso mexer na rota.`,
  },
  {
    rotulo: 'lint',
    escopo: 'scripts/magic-values.ts',
    extra: `REGRA NOVA: texto de nó em .eta igual a um valor já declarado em qualquer
*constantes.ts passa a ser acusado. Sem isso a classe inteira volta no próximo estágio —
o verificador hoje só olha href/action e atributos de limite dentro dos templates, e foi
por isso que estas 32 ocorrências atravessaram três passadas.

Reuse o índice de valores declarados que o script já monta para a regra do dono
duplicado, e o mesmo portão \`ehFrase\` que evita acusar 'utf8' ou '.'.

CUIDADO com dois falsos positivos previsíveis:
  - texto que coincide por acaso com um valor de sentido diferente. Prefira acusar e
    deixar quem corrige decidir, mas relate quantos casos assim você encontrou.
  - texto dentro do <script> de _script_avisos.eta, que já tem isenção de conteúdo.

Outros agentes estão editando os templates AGORA. Escreva a regra, rode, e RELATE o que
ela acusa — não conserte os templates, eles têm dono. Se acusar algo legítimo, corrija a
REGRA, nunca crie exceção pontual.

Prove o conserto numa cópia em scratchpad (nunca no repositório, e apague ao terminar):
confirme que \`<button>Cadastrar aluno</button>\` num .eta é acusado, e que
\`<span>Ativa</span>\` só é acusado se 'Ativa' for de fato um valor declarado.`,
  },
];

const frentes = await parallel(
  FRENTES.map((f) => () =>
    agent(
      `${CONTEXTO}

${DEFEITO}

SEU ESCOPO, e nada além dele: ${f.escopo}

${f.extra}

${REGRAS}

Ao terminar, rode e confirme:
  env -u FORCE_COLOR bunx tsc --noEmit
  env -u FORCE_COLOR bun run check
  env -u FORCE_COLOR bun test testes/web/golden.test.ts   (se tocou template ou rota)

Se o golden acusar, o texto renderizado mudou: conserte. NUNCA regrave o golden.

NOTA SOBRE O BANCO: outros agentes usam o mesmo banco de teste e podem causar
'deadlock detected' no meio da sua corrida — é contenção de ambiente, não regressão sua.
Se acontecer, crie um banco isolado no mesmo container via DATABASE_URL_TESTE e o DROPE
ao terminar.`,
      { label: `frente:${f.rotulo}`, phase: 'Ligar', schema: RESULTADO, effort: 'high' },
    ),
  ),
);

const feitas = frentes.filter(Boolean);
log(`${feitas.length}/${FRENTES.length} frentes fechadas.`);
for (const f of feitas) if (f.pendencias) log(`PENDÊNCIA: ${f.pendencias.slice(0, 200)}`);

phase('Provar');

const veredito = await agent(
  `${CONTEXTO}

${DEFEITO}

A quarta passada acabou de ser aplicada por 3 agentes. PROVE que nada quebrou e conserte
o que quebrou. Resumo do que fizeram:

${feitas.map((f) => `- ${f.resumo}`).join('\n')}

Na ordem, consertando antes de seguir:
1. \`bunx tsc --noEmit\`
2. \`bun run check\` — 0 violações
3. \`bun test\` — 714 testes eram verdes. Toda falha é regressão desta rodada: conserte o
   CÓDIGO, jamais afrouxe o teste.
4. Golden das 75 telas com diff zero. JAMAIS regrave.
5. \`bun scripts/magic-values.ts\` — com a regra nova de texto de nó. Extraia cada achado
   legítimo para o dono. Se for falso positivo, corrija a REGRA, nunca crie exceção
   pontual.
6. \`bun run verificar\` inteiro, exit 0.

${REGRAS}

Relate o resultado exato de cada comando, com números.`,
  { label: 'verificar', phase: 'Provar', effort: 'high' },
);

const critico = await agent(
  `${CONTEXTO}

Quarta passada concluída. Você é o CRÍTICO DE COMPLETUDE. NÃO edite arquivo.

O defeito que ela veio fechar: 15 textos, 32 ocorrências em .eta repetindo valor já
declarado em src/web/constantes.ts, em <button> e <a class="botao">.

ESTA É A QUARTA PASSADA. As três anteriores foram aprovadas por relatórios que depois se
provaram incompletos, sempre pelo mesmo motivo: o crítico buscou o seletor que o defeito
anterior tinha usado, e o defeito estava em outro. NÃO repita isso.

1. Cruze TODOS os valores de texto declarados em QUALQUER *constantes.ts contra TODO o
   conteúdo dos 44 .eta — não só <h1>, <button> e <a>. Inclua <th>, <caption>, <legend>,
   <label>, <option>, <summary>, atributos title=, aria-label=, placeholder=, alt=, e
   texto solto entre tags. Monte a busca por programa, não por grep manual de seletor.

2. Faça o mesmo cruzamento no sentido inverso: algum texto aparece 2+ vezes nos .eta sem
   ter dono em constantes.ts nenhum? Esses são donos que faltam criar.

3. Repita os dois cruzamentos para src/**/*.ts fora dos constantes.ts.

4. Alguma constante ficou com zero consumidor depois desta passada?

5. O lint acusa a classe nova? Teste EMPIRICAMENTE numa cópia em scratchpad (nunca no
   repositório, e apague ao terminar): insira <button>Cadastrar aluno</button> num .eta,
   confirme que acusa; confirme que NÃO acusa texto que não tem dono declarado, nem o
   conteúdo do <script> de _script_avisos.eta.

6. Por fim, a pergunta que ninguém fez nas três passadas anteriores: que CLASSE de
   duplicação nenhuma das buscas acima alcança? Pense em onde um valor poderia estar
   escrito duas vezes sem que um cruzamento de strings encontre — número formatado de
   jeitos diferentes, texto quebrado em linhas, valor que vira parte de outro.

${REGRAS}

Seja específico e cético. Cite arquivo:linha. "Nenhum" é resposta válida e desejável.`,
  { label: 'critico', phase: 'Provar', effort: 'high' },
);

return { frentes: feitas.map((f) => f.resumo), veredito, critico };
