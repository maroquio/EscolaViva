export const meta = {
  name: 'magic-values-6',
  description: 'Fecha a assimetria do eixo número e as posições que o verificador ainda não lê',
  whenToUse: 'Quando o verificador cobrir uma classe de valor em algumas posições e não em todas.',
  phases: [
    { title: 'Simetrizar', detail: 'número em texto de nó, atributos que faltam, template com interpolação' },
    { title: 'Encanar', detail: 'ALCANCE chega ao template e a supressão indevida cai' },
    { title: 'Fechar', detail: 'um agente por arquivo da lista que o verificador produzir' },
    { title: 'Provar', detail: 'verify exit 0 e crítico vazio — o critério fixado pelo usuário' },
  ],
};

const CONTEXTO = `
REPOSITÓRIO: EscolaViva — Bun + Hono + Eta + Postgres. Material didático (TEES2).
Bancos Docker de pé. Rode SEMPRE com \`env -u FORCE_COLOR\`.

SITUAÇÃO: cinco passadas de refactor de magic values, todas COMMITADAS (HEAD tem 11
commits, working tree limpo). \`bun run verify\` sai 0: 714 testes verdes, depcruise
limpo, golden de 75 telas com diff zero, \`scripts/magic-values.ts\` limpo.

  src/{academico,identidade,avaliacao,comunicacao}/constantes.ts
  src/shared/constantes.ts · src/web/constantes.ts · src/web/rotas/mapa.ts
  src/web/render.ts   injeta it.rotas, it.titulos, it.acoes, it.rotulos, it.contagem,
                      it.areas, it.parciais, it.sufixos, it.campos, it.separador…
  scripts/magic-values.ts   o verificador, dentro do \`bun run verify\`

O GOLDEN É A LINHA VERMELHA. Diff nele = você mudou uma tela. O texto renderizado sai
BYTE A BYTE idêntico: troca-se a ORIGEM do valor, nunca o valor.
JAMAIS rode \`bun run golden --regravar\`.

ARMADILHAS DO ETA, já pagas por outros agentes:
  - \`autoTrim: [false, 'nl']\` come a quebra de linha logo após \`%>\`. Valor em linha
    própria dentro de tag multilinha precisa de linha em branco de compensação.
  - Eta 4.6 NÃO suporta \`<%# … %>\`. Comentário é \`<% // … %>\`.
  - \`<% // … %>\` INDENTADO empurra a linha seguinte no HTML. Encoste na margem.
`;

const REGRAS = `
REGRAS:

1. FONTE ÚNICA POR MÓDULO. Um módulo só enxerga outro pelo index.ts dele. src/shared/ não
   importa módulo de domínio; src/*/dominio/ não alcança shared/db|http|log|jobs.

2. MERGE POR CONCEITO, NUNCA POR VALOR. Só una quando os dois usos mudam juntos por
   definição. Ao decidir NÃO unir, escreva
   \`// magic-values: permitido — <motivo>\` dizendo qual constante o valor NÃO é e por quê.
   Justificativa genérica não serve.

3. FORA DO ESCOPO: status HTTP, nomes de tabela/coluna SQL, quantificadores de regex,
   0 e 1, dados de seed, testes/** inteiro, e o corpo do <script> de
   src/web/templates/parciais/_script_avisos.eta.

4. COMPORTAMENTO NÃO MUDA. Um byte diferente no HTML é falha, não melhoria.

5. LEGIBILIDADE É REQUISITO. Repositório didático. Se consumir a constante deixar a linha
   pior de ler que o literal, NÃO force: relate em \`pendencias\`. A quinta passada já
   deixou \`id=\`/\`for=\` como literal por esse motivo, e foi a decisão certa.

6. NUNCA rode git add, git commit, git push, git checkout nem \`golden --regravar\`.

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
                dono: { type: 'string' },
                posicao: { type: 'string' },
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
 * FASE 1 — simetrizar. O verificador cobre o eixo TEXTO em três
 * posições e o eixo NÚMERO em duas. É a diferença que esconde defeito.
 * ------------------------------------------------------------------ */

phase('Simetrizar');

const medicao = await agent(
  `${CONTEXTO}

SEU ESCOPO: scripts/magic-values.ts, e mais nada. NÃO conserte template nem rota.

O verificador ficou simétrico no eixo TEXTO — marcação, atributo e dentro de \`<% %>\`,
provado por sonda. Faltam três posições, e cada uma tem caso real hoje:

(A) NÚMERO EM TEXTO DE NÓ. \`conferirLimite\` é chamado a partir de \`ATRIBUTO_DE_LIMITE\` e
    do bloco \`<% %>\`, e de lugar nenhum a partir de \`textosDoDocumento\`. Casos reais:

      src/web/templates/secretaria/alunos.eta:78
        "Encontra qualquer trecho do nome… Mostra os 50 primeiros em ordem alfabética."
        O 50 é LIMITES.aluno.busca (src/academico/constantes.ts), o mesmo que vira LIMIT
        em alunoRepositorio.ts. Mudar o teto faz o texto de ajuda MENTIR para o usuário.

      src/web/templates/professor/notas.eta:69
        "Lançamento de notas de 0 a 10, com uma casa decimal."
        O 10 é LIMITES.nota.maximo — e 68 linhas abaixo, notas.eta:137-138 consome
        corretamente max="<%= it.notaMaxima %>". Mesma tela, mesmo número, um tem dono e
        o outro é prosa.

(B) ATRIBUTOS FORA DOS OITO VARRIDOS. Hoje: href|action, name|value, maxlength|minlength|
    max|min. Escapam aria-label, title, alt, placeholder, entre outros. Caso real:

      src/web/templates/secretaria/alunos.eta:72
        <form … role="search" aria-label="Buscar aluno">
        É a QUARTA cópia de ACOES.buscarAluno, que os outros três consomem por
        it.acoes.buscarAluno.

    CUIDADO: a quinta passada restringiu deliberadamente a name/value porque id|for|class|
    type|aria-* produziam 222 achados, incluindo aria-invalid="true" casando com o 'true'
    de variável de ambiente. Não desfaça aquilo. Acrescente APENAS os atributos que
    carregam TEXTO LIDO PELO USUÁRIO — aria-label, title, alt, placeholder — e mantenha
    fora os que carregam identificador ou palavra da especificação.

(C) TEMPLATE COM INTERPOLAÇÃO DENTRO DE \`<% %>\`. \`analisarTemplate\` só trata
    isNumericLiteral e (isStringLiteral || isNoSubstitutionTemplateLiteral). Um
    TemplateExpression não é nenhum dos dois: nem é contado pela regra de repetição, nem
    consultado na do dono. Casos reais:

      src/web/templates/professor/notas.eta:62
        const legenda = \`Notas do \${…} · \${…} · \${…}\`;
      src/web/templates/professor/chamada.eta:49
        const legenda = \`Chamada de \${…} · \${…}\`;

      Três ' · ' escritos à mão, onde APRESENTACAO.separador é o dono e a QUINTA passada
      passou a consumi-lo em oito sobretítulos. O docblock de notas.eta:30 chega a afirmar
      que "os separadores chegam em it.separador" — verdade na linha 66, falsa na 62, no
      mesmo arquivo.

DEPOIS DE ESCREVER AS TRÊS: rode o verificador e devolva o inventário COMPLETO agrupado
por arquivo, com caminhos relativos à raiz. É ele que particiona as fases seguintes.

O \`verify\` vai ficar VERMELHO ao fim da sua tarefa, e está certo. Não esconda achado
para deixá-lo verde. Se uma regra produzir falso positivo, corrija a REGRA — nunca crie
exceção pontual. Prove cada regra numa cópia em scratchpad e apague ao terminar.

${REGRAS}`,
  { label: 'simetrizar', phase: 'Simetrizar', schema: ACHADOS_SCHEMA, effort: 'high' },
);

const arquivos = (medicao?.porArquivo ?? []).filter((a) => a.achados?.length);
const total = arquivos.reduce((s, a) => s + a.achados.length, 0);
log(`${total} achados em ${arquivos.length} arquivos.`);

/* ------------------------------------------------------------------ *
 * FASE 2 — o encanamento que faltou, e que virou supressão indevida.
 * ------------------------------------------------------------------ */

phase('Encanar');

const encanamento = await agent(
  `${CONTEXTO}

DEFEITO: a quinta passada suprimiu quatro achados em
src/web/templates/comunicados/novo.eta com \`// magic-values: permitido\`, e o agente que
os suprimiu registrou por escrito que NÃO SÃO FALSO POSITIVO. Ele não conseguiu fechá-los
porque \`ALCANCE\` (src/comunicacao/constantes.ts) simplesmente não chega ao template:
\`it.campos.comunicado\` leva os NOMES de campo, nunca os VALORES do enum.

Por que importa mais que uma constante comum: o comentário do próprio
src/comunicacao/constantes.ts avisa que escrever um dos dois valores errado no .eta faz o
envio cair silenciosamente no OUTRO alcance — um comunicado dirigido a três responsáveis
chega à unidade inteira, sem erro em lugar nenhum. É o caso que mais merece a constante,
e é justamente o que ficou suprimido.

SEU ESCOPO: src/web/constantes.ts, src/web/render.ts, src/web/rotas/comunicados.ts e
src/web/templates/comunicados/novo.eta.

TAREFA: leve os VALORES de ALCANCE até o template pelo caminho que o repositório já usa,
faça o .eta consumi-los nas quatro posições (value= e as duas comparações), e APAGUE as
supressões que deixarem de ser verdadeiras. Confira se há supressão semelhante em outro
template — supressão que afirma falsidade é pior que literal.

Uma supressão legítima existe nesse arquivo e deve FICAR: a que distingue o parâmetro de
query PARAMETROS.unidadeId do campo CAMPOS.comunicado.unidadeId. Leia antes de apagar.

${REGRAS}

Ao terminar: bunx tsc --noEmit, bun run check, e
\`bun test testes/web/golden.test.ts\` com diff zero.
O lint segue vermelho por causa da fase anterior — é esperado.`,
  { label: 'encanar:alcance', phase: 'Encanar', schema: RESULTADO, effort: 'high' },
);

/* ------------------------------------------------------------------ *
 * FASE 3 — um agente por arquivo da lista.
 * ------------------------------------------------------------------ */

phase('Fechar');

const alvos = arquivos
  .map((a) => a.arquivo)
  .filter((a) => !a.includes('constantes.ts') && !a.includes('comunicados/novo.eta'));

const fechamentos = await parallel(
  alvos.map((arquivo) => () =>
    agent(
      `${CONTEXTO}

O verificador ficou simétrico nos eixos texto E número, nas três posições, e acusou o que
segue. Outro agente já levou ALCANCE ao template de comunicados:

${encanamento?.resumo ?? '(sem resumo)'}

SEU ESCOPO: exatamente UM arquivo — ${arquivo}
NÃO abra nenhum outro para escrita; outros agentes editam os demais agora.

O que o verificador acusou neste arquivo:

${JSON.stringify(arquivos.find((a) => a.arquivo === arquivo)?.achados ?? [], null, 1)}

Feche cada achado consumindo o dono. Onde for conceito diferente que coincide por valor
(regra 2), deixe o literal com a justificativa específica na linha.

ATENÇÃO ao caso do número em prosa: "Mostra os 50 primeiros" e "de 0 a 10" precisam
renderizar EXATAMENTE o mesmo texto de antes. O handler já passa o valor em alguns casos
— confira o que \`it\` já traz antes de mexer na rota.

${REGRAS}

Ao terminar:
  env -u FORCE_COLOR bunx tsc --noEmit
  env -u FORCE_COLOR bun scripts/magic-values.ts   → confirme que SEU arquivo saiu da lista
  env -u FORCE_COLOR bun test testes/web/golden.test.ts   (se for template ou rota)

O lint ainda acusará OUTROS arquivos — não é problema seu. O golden precisa dar diff zero.

NOTA SOBRE O BANCO: outros agentes usam o mesmo banco de teste; 'deadlock detected' é
contenção de ambiente. Se acontecer, crie um banco isolado via TEST_DATABASE_URL e o
DROPE ao terminar.`,
      { label: `fecha:${arquivo.split('/').pop()}`, phase: 'Fechar', schema: RESULTADO, effort: 'high' },
    ),
  ),
);

const fechados = fechamentos.filter(Boolean);
log(`${fechados.length}/${alvos.length} arquivos fechados.`);
const pendencias = fechados.map((f) => f.pendencias).filter(Boolean);
for (const p of pendencias) log(`PENDÊNCIA: ${p.slice(0, 200)}`);

/* ------------------------------------------------------------------ *
 * FASE 4 — o critério que o usuário fixou.
 * ------------------------------------------------------------------ */

phase('Provar');

const veredito = await agent(
  `${CONTEXTO}

A sexta passada foi aplicada por ${fechados.length + 1} agentes. PROVE que nada quebrou e
conserte o que quebrou.

Na ordem, consertando antes de seguir:
1. \`bunx tsc --noEmit\`
2. \`bun run check\` — 0 violações
3. \`bun test\` — 714 testes eram verdes. Toda falha é regressão desta rodada: conserte o
   CÓDIGO, jamais afrouxe o teste.
4. Golden das 75 telas com diff zero. JAMAIS regrave.
5. \`bun scripts/magic-values.ts\` limpo. Todo achado restante: consome o dono, ou ganha
   justificativa específica. Falso positivo se corrige na REGRA.
6. \`bun run verify\` exit 0.

${pendencias.length ? `PENDÊNCIAS DE LEGIBILIDADE relatadas — avalie cada uma:\n${pendencias.join('\n---\n')}` : ''}

${REGRAS}

Relate o resultado exato de cada comando, com números.`,
  { label: 'verify', phase: 'Provar', effort: 'high' },
);

const critico = await agent(
  `${CONTEXTO}

Sexta passada concluída. Você é o CRÍTICO DE COMPLETUDE. NÃO edite arquivo.

O USUÁRIO FIXOU O CRITÉRIO DE CONCLUSÃO: o trabalho encerra quando \`bun run verify\`
sair 0 E um crítico voltar VAZIO, duas rodadas seguidas. Você é a primeira dessas duas.
Uma resposta "nenhum" que seja verdadeira vale mais do que achados inventados; uma que
seja falsa custa outra passada inteira.

HISTÓRICO: cinco passadas se declararam completas e as cinco estavam erradas. O padrão foi
sempre o mesmo — o crítico conferia a lista do defeito anterior, e o defeito seguinte
estava numa FORMA que ninguém tinha medido: limites nos .eta, depois <h1>, depois rótulo
de botão, depois texto dentro de \`<% %>\`, depois repetição sem dono, depois número em
prosa. NÃO CONFIRA LISTA. MEÇA.

1. O verificador é simétrico nos DOIS eixos e em TODAS as posições? Monte a matriz
   completa — {texto, número} × {texto de nó, atributo varrido, atributo não varrido,
   dentro de bloco, template com interpolação, argumento de include, valor default} — e
   sonde CADA célula numa cópia em scratchpad (nunca no repositório; apague ao terminar).
   Relate a matriz preenchida com medido, não com esperado.

2. Para cada célula que ainda cala, existe caso real no repositório hoje? Cite arquivo:linha
   ou diga explicitamente que não há.

3. Que TRANSFORMAÇÃO ainda esconde uma cópia? Já se sabe que número em outra base é
   normalizado, e que emenda de string, entidade HTML, caixa diferente e \`&nbsp;\` escapam
   sem caso real. Procure casos reais NOVOS, e procure transformações que ninguém listou.

4. Alguma constante órfã? Alguma supressão morta, na linha errada, ou com justificativa
   que não se sustenta? A quinta passada deixou 39 supressões — audite-as, não as aceite.

5. A legibilidade piorou em alguma linha? Aponte arquivo:linha. Trocar duplicação por
   ilegibilidade não é progresso, e num repositório didático é regressão.

6. Se você fosse escrever a sétima passada, o que ela consertaria? Se a resposta honesta
   for "nada", diga isso — é o resultado que o critério do usuário espera.

${REGRAS}

Seja específico e cético. Cite arquivo:linha sempre.`,
  { label: 'critico', phase: 'Provar', effort: 'high' },
);

return {
  medicao: medicao?.resumo,
  achados: total,
  arquivos: arquivos.length,
  encanamento: encanamento?.resumo,
  fechados: fechados.length,
  planejados: alvos.length,
  pendenciasDeLegibilidade: pendencias,
  veredito,
  critico,
};
