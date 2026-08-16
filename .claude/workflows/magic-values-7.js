export const meta = {
  name: 'magic-values-7',
  description: 'Composição: valor montado à mão a partir de constantes que já existem',
  whenToUse: 'Quando o verificador comparar só igualdade e o defeito for concatenação.',
  phases: [
    { title: 'Compor', detail: 'o verificador passa a reconhecer texto montado de constantes' },
    { title: 'Fechar', detail: 'um agente por arquivo da lista, mais a contradição do "ano letivo"' },
    { title: 'Provar', detail: 'verify exit 0 e crítico vazio — primeira das duas rodadas' },
  ],
};

const CONTEXTO = `
REPOSITÓRIO: EscolaViva — Bun + Hono + Eta + Postgres. Material didático (TEES2).
Bancos Docker de pé. Rode SEMPRE com \`env -u FORCE_COLOR\`.

ATENÇÃO — OUTRA SESSÃO TRABALHA NESTE REPOSITÓRIO AGORA. Ela commita e faz push; durante
a passada anterior o HEAD avançou e os commits foram rebaseados. Consequências para você:
  - NUNCA rode git add, git commit, git push, git checkout, git rebase ou git stash.
  - Se um arquivo fora do seu escopo aparecer modificado, NÃO é seu e NÃO é regressão sua.
  - Se \`bun test\` falhar com 'deadlock detected' ou violação de chave estrangeira, é a
    suíte da outra sessão no mesmo banco. Crie um banco isolado no mesmo container via
    TEST_DATABASE_URL, use-o, e o DROPE ao terminar.

SITUAÇÃO: seis passadas de refactor de magic values, todas commitadas (13 commits).
\`bun run verify\` sai 0: 714 testes verdes, depcruise limpo, golden de 75 telas com
diff zero, \`scripts/magic-values.ts\` limpo.

  src/{academico,identidade,avaliacao,comunicacao}/constantes.ts
  src/shared/constantes.ts · src/web/constantes.ts · src/web/rotas/mapa.ts
  src/web/render.ts   injeta it.rotas, it.titulos, it.acoes, it.rotulos, it.contagem,
                      it.areas, it.separador, it.parciais, it.sufixos, it.campos…
  scripts/magic-values.ts   o verificador, dentro do \`bun run verify\`

O GOLDEN É A LINHA VERMELHA. Diff nele = você mudou uma tela. O texto renderizado sai
BYTE A BYTE idêntico. JAMAIS rode \`bun run golden --rewrite\`.

ARMADILHAS DO ETA:
  - \`autoTrim: [false, 'nl']\` come a quebra de linha após \`%>\`; valor em linha própria
    dentro de tag multilinha precisa de linha em branco de compensação.
  - Eta 4.6 não suporta \`<%# … %>\`; comentário é \`<% // … %>\`.
  - \`<% // … %>\` indentado empurra a linha seguinte no HTML. Encoste na margem.
`;

const REGRAS = `
REGRAS:

1. FONTE ÚNICA POR MÓDULO. Um módulo só enxerga outro pelo index.ts dele.

2. MERGE POR CONCEITO, NUNCA POR VALOR. Ao decidir NÃO unir, escreva
   \`// magic-values: allowed — <reason>\` dizendo qual constante o valor NÃO é e por quê.

3. FORA DO ESCOPO: status HTTP, SQL, quantificador de regex, 0 e 1, dados de seed,
   testes/** inteiro, e o corpo do <script> de parciais/_script_avisos.eta.

4. COMPORTAMENTO NÃO MUDA. Um byte diferente no HTML é falha.

5. LEGIBILIDADE É REQUISITO. Repositório didático. Se consumir a constante deixar a linha
   pior de ler, NÃO force: relate em \`pendencias\`.

6. NUNCA rode comando de git, nem \`golden --rewrite\`.

7. NÃO edite arquivo fora do seu escopo.
`;

const ACHADOS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['porArquivo', 'resumo'],
  properties: {
    porArquivo: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['arquivo', 'achados'],
        properties: {
          arquivo: { type: 'string' },
          achados: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['linha', 'literal'],
              properties: {
                linha: { type: 'integer' },
                literal: { type: 'string' },
                composicao: { type: 'string', description: 'as constantes que o compõem' },
              },
            },
          },
        },
      },
    },
    resumo: { type: 'string' },
  },
};

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

/* ------------------------------------------------------------------ *
 * FASE 1 — a classe que nenhuma regra alcança: composição.
 * ------------------------------------------------------------------ */

phase('Compor');

const medicao = await agent(
  `${CONTEXTO}

SEU ESCOPO: scripts/magic-values.ts, e mais nada.

TODA regra do verificador compara o pedaço INTEIRO recortado com o índice. Medido:
  <button>ano letivo</button>        → acusa
  <button>· ano letivo</button>      → cala
  <button>ano letivo 2025</button>   → cala
  <button>Cancelar.</button>         → cala

O defeito real disso é COMPOSIÇÃO: o valor não é copiado, é MONTADO a partir de
constantes que já existem. Casos reais, e o repositório descreve o defeito por escrito em
src/web/templates/secretaria/aluno.eta:44-50 ("em vez de repetir 'Secretaria · Ficha do
aluno' à mão"), enquanto nove telas irmãs compõem certo:

  conta/senha.eta:29                       <p class="sobretitulo">Conta</p>
                                           é AREAS.conta byte a byte
  secretaria/responsavel_novo.eta:48       "Secretaria · Responsáveis"
                                           = AREAS.secretaria + APRESENTACAO.separador + TITULOS.secretaria.responsaveis
  rede/ano_novo.eta:45                     "Rede · Anos letivos"
  secretaria/turma.eta:70                  "Secretaria · Turma …"
  secretaria/turma_disciplina_nova.eta:60  idem

Renomear a área no menu deixa essas cinco telas com o nome antigo, e nada acusa.

SEGUNDO DEFEITO, do mesmo tipo: A MARCA TIPOGRÁFICA É ASSIMÉTRICA ENTRE AS DUAS METADES
DO TEMPLATE. \`ehMarcaTipografica\` só é consultada por \`donoNoCodigoDoTemplate\` — dentro de
\`<% %>\`. Na MARCAÇÃO quem julga é \`donoDoTexto\`, que exige UMA_PALAVRA e por isso nunca vê
\`·\`. A passada anterior trocou 3 separadores dentro de blocos e deixou ~18 na marcação:

  secretaria/matricula_transferencia.eta:129 · secretaria/aluno_matricula_nova.eta:117
  secretaria/turma.eta:77 · secretaria/turma_disciplina_nova.eta:69
  rede/usuarios.eta:118 · professor/chamada.eta:72 e :76 · responsavel/mural.eta:102
  mais os sobretítulos acima

O primeiro deles é LITERALMENTE o exemplo escrito no docblock de APRESENTACAO.separador
("Separador de atributos numa mesma linha: nome · série · turno").

TAREFA — duas regras:

(A) COMPOSIÇÃO. Um texto cujo conteúdo é a concatenação de dois ou mais valores com dono
    conhecido, possivelmente com separador entre eles, passa a ser acusado, nomeando as
    constantes que o compõem.

    ESTE É O TIPO DE REGRA QUE PRODUZ FALSO POSITIVO COM FACILIDADE, e o repositório já
    provou três vezes que exceção pontual mata verificador. Antes de escrever, decida e
    documente o portão: quantos pedaços no mínimo, tamanho mínimo de cada, e o que impede
    "Aluno" de casar dentro de "Alunos matriculados". Meça o número de falsos ANTES de
    aceitar a regra, como a passada anterior fez com o número em prosa — se der mais falso
    que verdadeiro, aperte o portão, não crie exceção.

(B) MARCA TIPOGRÁFICA NA MARCAÇÃO. \`ehMarcaTipografica\` passa a valer também em
    \`donoDoTexto\`, para o \`·\` da marcação ser visto como o de dentro do bloco. A
    pontuação puramente ASCII continua fora — \`/\`, \`-\`, \`:\`, \`.\` são alfabeto de
    composição de máquina e cada camada é dona legítima da sua.

DEPOIS: rode o verificador e devolva o inventário COMPLETO agrupado por arquivo, com
caminhos relativos à raiz. O \`verify\` fica VERMELHO ao fim da sua tarefa — está certo.
Não esconda achado para deixá-lo verde. Prove cada regra numa cópia em scratchpad, com
positivos E negativos, e apague ao terminar.

${REGRAS}`,
  { label: 'compor', phase: 'Compor', schema: ACHADOS_SCHEMA, effort: 'high' },
);

const arquivos = (medicao?.porArquivo ?? []).filter((a) => a.achados?.length);
const total = arquivos.reduce((s, a) => s + a.achados.length, 0);
log(`${total} achados em ${arquivos.length} arquivos.`);

/* ------------------------------------------------------------------ *
 * FASE 2 — a lista, mais a contradição que a sexta passada criou.
 * ------------------------------------------------------------------ */

phase('Fechar');

const CONTRADICAO = `src/web/templates/rede/painel.eta:51`;

const alvos = [...new Set(arquivos.map((a) => a.arquivo))];

const fechamentos = await parallel([
  () =>
    agent(
      `${CONTEXTO}

DEFEITO ESPECÍFICO: a passada anterior criou uma contradição. ${CONTRADICAO} passou a ler
\`it.contagem.anoLetivo.singular\` para o substantivo minúsculo em frase corrida — e cinco
outras telas escrevem o MESMO substantivo minúsculo em frase corrida e o SUPRIMEM com
\`// magic-values: allowed\` afirmando que ele NÃO tem dono. Uma delas
(responsavel/boletim.eta:53) justifica-se dizendo "é o substantivo lido em voz corrida,
minúsculo, com o número dentro de um span" — que é a definição exata de CONTAGEM.

SEU ESCOPO: as telas que suprimem esse caso e a que o consome. Encontre-as você mesmo
(procure as supressões que falam de substantivo, contagem ou voz corrida) e uniformize:
ou todas consomem CONTAGEM, ou todas suprimem com uma justificativa que se sustente e
${CONTRADICAO} volta a suprimir também. As duas saídas são aceitáveis; a mistura não é.

Decida por argumento, não por maioria, e escreva o argumento no lugar onde alguém que
mexer nisso vai lê-lo.

NÃO edite scripts/magic-values.ts nem nenhum *constantes.ts — outros agentes os têm.

${REGRAS}

Ao terminar: bunx tsc --noEmit e \`bun test testes/web/golden.test.ts\` com diff zero.`,
      { label: 'fecha:contradicao', phase: 'Fechar', schema: RESULTADO, effort: 'high' },
    ),
  ...alvos.map((arquivo) => () =>
    agent(
      `${CONTEXTO}

O verificador passou a enxergar COMPOSIÇÃO — texto montado a partir de constantes que já
existem — e a marca tipográfica na marcação.

SEU ESCOPO: exatamente UM arquivo — ${arquivo}
NÃO abra nenhum outro para escrita.

O que o verificador acusou aqui:

${JSON.stringify(arquivos.find((a) => a.arquivo === arquivo)?.achados ?? [], null, 1)}

Nove telas já compõem o sobretítulo do jeito certo — leia uma delas antes de escrever a
sua (aluno.eta:73, aluno_novo.eta:45, turma_nova.eta:54, disciplina_nova.eta:53,
unidade_nova.eta:51). O docblock de secretaria/aluno.eta:44-50 explica a decisão.

O texto renderizado precisa sair IDÊNTICO — inclusive os espaços em volta do separador,
que são metade da decisão de APRESENTACAO.separador.

${REGRAS}

Ao terminar:
  env -u FORCE_COLOR bunx tsc --noEmit
  env -u FORCE_COLOR bun scripts/magic-values.ts   → confirme que SEU arquivo saiu da lista
  env -u FORCE_COLOR bun test testes/web/golden.test.ts   → diff zero

O lint ainda acusará outros arquivos — não é problema seu.`,
      { label: `fecha:${arquivo.split('/').pop()}`, phase: 'Fechar', schema: RESULTADO, effort: 'high' },
    ),
  ),
]);

const fechados = fechamentos.filter(Boolean);
log(`${fechados.length}/${alvos.length + 1} frentes fechadas.`);
const pendencias = fechados.map((f) => f.pendencias).filter(Boolean);
for (const p of pendencias) log(`PENDÊNCIA: ${p.slice(0, 200)}`);

/* ------------------------------------------------------------------ *
 * FASE 3 — o critério do usuário: verify 0 + crítico vazio.
 * ------------------------------------------------------------------ */

phase('Provar');

const veredito = await agent(
  `${CONTEXTO}

A sétima passada foi aplicada por ${fechados.length} agentes. PROVE que nada quebrou.

Na ordem, consertando antes de seguir:
1. \`bunx tsc --noEmit\`
2. \`bun run check\` — 0 violações
3. \`bun test\` — 714 testes eram verdes. Falha por 'deadlock' ou chave estrangeira é a
   outra sessão no mesmo banco: use um banco isolado. Falha de asserção é regressão sua:
   conserte o CÓDIGO, jamais afrouxe o teste.
4. Golden das 75 telas com diff zero. JAMAIS regrave.
5. \`bun scripts/magic-values.ts\` limpo, com a regra de composição ativa.
6. \`bun run verify\` exit 0.

${pendencias.length ? `PENDÊNCIAS DE LEGIBILIDADE relatadas — avalie cada uma:\n${pendencias.join('\n---\n')}` : ''}

${REGRAS}

Relate o resultado exato de cada comando, com números.`,
  { label: 'verify', phase: 'Provar', effort: 'high' },
);

const critico = await agent(
  `${CONTEXTO}

Sétima passada concluída. Você é o CRÍTICO DE COMPLETUDE. NÃO edite arquivo.

O USUÁRIO FIXOU O CRITÉRIO: encerra quando \`bun run verify\` sair 0 E um crítico voltar
VAZIO, duas rodadas seguidas. Seis passadas se declararam completas e as seis estavam
erradas, sempre porque o defeito seguinte estava numa FORMA não medida: limites nos .eta,
<h1>, rótulo de botão, texto dentro de \`<% %>\`, repetição sem dono, número em prosa,
composição. NÃO CONFIRA LISTA. MEÇA.

Uma resposta "nenhum" VERDADEIRA é o resultado desejado e vale mais que achados
inventados. Uma "nenhum" falsa custa outra passada inteira. Uma lista de achados
irrelevantes custa o mesmo e ainda desgasta o critério.

1. Monte a matriz completa {texto, número, composição} × {texto de nó em elemento que
   nomeia, texto de nó fora deles, atributo varrido, atributo não varrido, dentro de
   bloco, template com interpolação, argumento de include, valor default} e sonde CADA
   célula numa cópia em scratchpad. Relate o MEDIDO. Apague a cópia.

2. Para cada célula que cala, há caso real hoje? Cite arquivo:linha ou diga que não há.

3. Que transformação ainda esconde cópia? Já se sabe: número em outra base é normalizado;
   emenda, entidade HTML, caixa e \`&nbsp;\` escapam sem caso real; composição foi o alvo
   desta passada. Procure classes NOVAS, e verifique se a regra de composição criou
   falsos positivos que alguém suprimiu em vez de consertar.

4. Audite TODAS as supressões \`// magic-values: allowed\` do repositório: alguma está na
   linha errada, morta, ou com justificativa que não se sustenta? Alguma contradiz outra —
   duas telas com o mesmo caso, uma consumindo e outra suprimindo? Foi assim que a passada
   anterior errou.

5. Alguma constante órfã? A legibilidade piorou em alguma linha?

6. Se você escrevesse a oitava passada, o que ela consertaria? "Nada" é a resposta que o
   critério espera, desde que verdadeira.

${REGRAS}

Seja específico e cético. Cite arquivo:linha sempre.`,
  { label: 'critico', phase: 'Provar', effort: 'high' },
);

return {
  medicao: medicao?.resumo,
  achados: total,
  arquivos: arquivos.length,
  fechados: fechados.length,
  pendenciasDeLegibilidade: pendencias,
  veredito,
  critico,
};
