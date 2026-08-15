export const meta = {
  name: 'magic-values-9',
  description: 'Marcador que não silencia nada, constante sem leitor, e a regra que enxerga os dois',
  whenToUse: 'Quando houver comentário prometendo exceção onde não há regra, ou constante órfã.',
  phases: [
    { title: 'Enxergar', detail: 'marcador sem achado correspondente vira erro' },
    { title: 'Limpar', detail: 'a órfã, os 16 marcadores inertes, o erro factual e as linhas longas' },
    { title: 'Provar', detail: 'verificar exit 0 e crítico vazio — primeira das duas rodadas' },
  ],
};

const CONTEXTO = `
REPOSITÓRIO: EscolaViva — Bun + Hono + Eta + Postgres. Material didático (TEES2).
Bancos Docker de pé. Rode SEMPRE com \`env -u FORCE_COLOR\`.

ATENÇÃO — OUTRA SESSÃO TRABALHA NESTE REPOSITÓRIO, commitando e fazendo push.
  - NUNCA rode git add, commit, push, checkout, rebase ou stash.
  - Arquivo fora do seu escopo modificado NÃO é regressão sua.
  - \`bun test\` com 'deadlock detected' é a suíte dela no mesmo banco: crie um banco
    isolado via DATABASE_URL_TESTE, use, e DROPE.
  - NÃO toque em docs/diagrams/ — é dela.

SITUAÇÃO: oito passadas, 17 commits. \`bun run verificar\` sai 0: 714 testes, depcruise
limpo, golden de 75 telas com diff zero, verificador limpo.

O VERIFICADOR ESTÁ CALIBRADO E NÃO DEVE SER ALARGADO. O crítico da passada anterior
sondou 47 células da matriz {texto, número, composição, marca} × posição e mediu: toda
célula que cala NÃO tem caso real no repositório, e ligar as quatro cegas juntas produz
UM falso positivo e ZERO verdadeiros. Não mexa nelas.

O GOLDEN É A LINHA VERMELHA. JAMAIS \`golden --regravar\`.

ARMADILHAS DO ETA:
  - \`autoTrim: [false, 'nl']\` come a quebra de linha após \`%>\`.
  - Eta 4.6 não suporta \`<%# … %>\`; comentário é \`<% // … %>\`.
  - \`<% // … %>\` indentado empurra a linha seguinte no HTML.
  - Aspas dentro de comentário de linha em bloco quebram o render com 500.
`;

const REGRAS = `
REGRAS:

1. FONTE ÚNICA POR MÓDULO. Um módulo só enxerga outro pelo index.ts dele.

2. A justificativa \`// magic-values: permitido — <motivo>\` diz QUAL CONSTANTE O VALOR NÃO
   É e por quê. Dizer qual ele É é confissão. Dizer que a constante está morta é um TODO,
   não uma justificativa.

3. FORA DO ESCOPO: status HTTP, SQL, quantificador de regex, 0 e 1, dados de seed,
   testes/** inteiro, e o corpo do <script> de parciais/_script_avisos.eta.

4. COMPORTAMENTO NÃO MUDA. Um byte diferente no HTML é falha.

5. LEGIBILIDADE É REQUISITO, e nesta passada ela é ALVO, não só limite. Material
   didático: comentário maior que a tela que explica não ensina, atrapalha.

6. NUNCA rode comando de git, nem \`golden --regravar\`.

7. NÃO edite arquivo fora do seu escopo.
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

/* ------------------------------------------------------------------ *
 * FASE 1 — a regra que faltou: o defeito é a AUSÊNCIA de achado.
 * ------------------------------------------------------------------ */

phase('Enxergar');

const regra = await agent(
  `${CONTEXTO}

SEU ESCOPO: scripts/magic-values.ts, e mais nada. NÃO alargue a matriz.

DIAGNÓSTICO: a passada anterior escreveu duas regras que auditam a supressão — confissão e
contradição — e as duas iteram sobre \`silenciados\`, que só é populado quando um portão
dispara. Supressão que não silencia NADA nunca entra no array: é invisível por construção,
exatamente como "repetição sem dono" era antes da regra 4. O mesmo erro, um nível acima.

Medido pelo crítico: das 32 supressões em forma \`//\`, DEZESSEIS SÃO INERTES.
  - 7 justificam uma regra deliberadamente REMOVIDA (\`id\`/\`for\`, ver o comentário de
    scripts/magic-values.ts que registra os 222 achados). Estão no docblock de cabeçalho,
    de 2 a 30 linhas do \`for=\`/\`id=\` que citam — fora da janela [linha, linha-1] de
    \`justificativaDa\`. Mesmo que a regra voltasse, não suprimiriam.
    aluno_novo.eta:58 e :80 · disciplina_nova.eta:66 · aluno_responsavel_novo.eta:40
    rede/unidade_nova.eta:41 · rede/usuario_novo.eta:45 · conta/senha.eta:20
  - 9 justificam texto que TEM dono e que por isso a regra nunca poderia acusar:
    aluno.eta:127 e :203 · turma.eta:93 · turma_disciplina_nova.eta:88
    frequencia.eta:77 e :92 · boletim.eta:68 · responsavel/painel.eta:93 · rede/painel.eta:110
  - Mais 3 em forma de PROSA, sem \`//\`, que o reconhecedor de supressão nem vê:
    login.eta:38 · rede/ano_novo.eta:45 · professor/painel.eta:23
  - E uma na LINHA ERRADA: secretaria/turma.eta:93, três linhas acima do que cobre.

REGRA NOVA — SUPRESSÃO MORTA. Varra os arquivos procurando o marcador e acuse todo
marcador que NÃO tenha entrada correspondente em \`silenciados\`. É a mesma forma da regra
de repetição sem dono: o defeito é a AUSÊNCIA, não a coincidência. Um comentário que
promete exceção de máquina onde não há regra mente sobre o código, e num repositório
didático ensina o oposto do pretendido.

NO MESMO MOVIMENTO, separe "calou um achado" de "calou uma contagem": hoje \`contar\` chama
\`suprimida\` antes de qualquer veredito, então \`silenciados\` mistura as duas e as regras de
confissão e contradição rodam sobre 32 supressões enquanto só 16 fazem trabalho.

CONSIDERE TAMBÉM reconhecer o marcador em prosa (sem \`//\`) — os 3 casos acima se leem como
supressão e não são. Decida se a regra deve exigir a forma canônica e acusar as outras, ou
aceitar as duas formas. Meça antes: qual das duas produz menos ruído no repositório real.

Meça os falsos ANTES de aceitar cada regra. Se der mais falso que verdadeiro, aperte o
portão — nunca crie exceção pontual. Prove numa cópia em scratchpad, com positivos E
negativos, e apague ao terminar.

DEPOIS: rode e RELATE a lista completa, agrupada por arquivo. O \`verificar\` fica VERMELHO —
está certo. Não esconda achado para deixá-lo verde.

${REGRAS}`,
  { label: 'regra:supressao-morta', phase: 'Enxergar', schema: RESULTADO, effort: 'high' },
);

log(`Regra escrita. ${regra?.resumo?.slice(0, 200) ?? ''}`);

/* ------------------------------------------------------------------ *
 * FASE 2 — a limpeza, particionada para não colidir.
 * ------------------------------------------------------------------ */

phase('Limpar');

const FRENTES = [
  {
    rotulo: 'orfa-e-confissao',
    escopo: 'src/web/constantes.ts e src/web/templates/parciais/_paginacao.eta',
    tarefa: `Duas linhas, um defeito, e o crítico já verificou o conserto em cópia.

\`PAGINACAO.rotuloPadrao\` (src/web/constantes.ts:796) é a ÚNICA constante órfã entre as 749
folhas dos cinco arquivos de constantes — varridas contra src/, testes/ e scripts/,
ignorando comentários. E a supressão que a protege é a única justificativa que não se
sustenta (parciais/_paginacao.eta:40):

  // magic-values: permitido — este 'itens' não é PAGINACAO.rotuloPadrao: aquela
  // declaração não tem consumidor nenhum, e a fonte do que a barra imprime é esta linha.

Ela passa pelo portão da regra só pela palavra "não", mas não distingue conceito nenhum: o
valor é 'itens' byte a byte, o conceito é o mesmo, e o argumento diz que a constante está
MORTA. Isso é um TODO com aparência de justificativa — e a prosa logo acima confessa,
dizendo "quem tem de sair é a declaração sem consumidor".

CONSERTO VERIFICADO PELO CRÍTICO: apagar a constante E a supressão. Com as duas fora,
\`bun scripts/magic-values.ts\` sai 0 e nenhum byte de HTML muda — a constante não tem
leitor, e o comentário está dentro de \`<% %>\`. Ajuste também a prosa do bloco que a
explicava, para não sobrar texto falando de uma constante que não existe mais.

ERRO FACTUAL no mesmo arquivo: src/web/constantes.ts:470 afirma "As cinco ocorrências ficam
escritas onde estão". São SEIS — o próprio verificador imprime "repetido 6×" quando as
supressões saem: rede/unidades.eta:83, rede/usuarios.eta:111, boletim.eta:107,
frequencia.eta:159, secretaria/aluno.eta:225, secretaria/turma.eta:194. Cinco vocabulários,
seis colunas: a matrícula aparece em duas telas. Corrija o número e, se o argumento do
docblock depender da contagem, confira se ele continua de pé com seis.`,
  },
  {
    rotulo: 'marcadores-secretaria-rede',
    escopo:
      'src/web/templates/secretaria/*.eta e src/web/templates/rede/*.eta e ' +
      'src/web/templates/conta/senha.eta e src/web/templates/login.eta',
    tarefa: `Marcadores \`magic-values:\` que não silenciam nada. Some o MARCADOR; a PROSA que o
acompanha continua válida e FICA — ela explica uma decisão real, só não precisa prometer
uma exceção de máquina que não existe.

Inertes por justificarem uma regra removida (id/for), todos no docblock de cabeçalho:
  secretaria/aluno_novo.eta:58 e :80 · secretaria/disciplina_nova.eta:66
  secretaria/aluno_responsavel_novo.eta:40 · rede/unidade_nova.eta:41
  rede/usuario_novo.eta:45 · conta/senha.eta:20

Inertes por justificarem texto que tem dono:
  secretaria/aluno.eta:127 e :203 · secretaria/turma.eta:93
  secretaria/turma_disciplina_nova.eta:88 · rede/painel.eta:110

Em forma de PROSA, sem \`//\` — leem-se como supressão e não são:
  login.eta:38 · rede/ano_novo.eta:45

E uma na LINHA ERRADA: secretaria/turma.eta:93 está três linhas acima do "ano letivo" da
linha 96 que pretende cobrir. Decida se ela deve ser realinhada ou removida — se o valor
tem dono e é consumido, ela é inerte e sai.

LEGIBILIDADE É ALVO NESTA PASSADA. Quatro justificativas passaram de 200 caracteres numa
linha só: rede/unidades.eta:82 tem 491 e rede/usuarios.eta:110 tem 443. Comentário maior
que a tela que explica não ensina. Reescreva-as: o argumento cabe em duas ou três linhas de
prosa acima do código, e o marcador fica curto.

Confira, antes de apagar cada marcador, se ele realmente não silencia nada: desligue-o e
rode \`bun scripts/magic-values.ts\`. Se o achado aparecer, o marcador estava vivo e FICA.`,
  },
  {
    rotulo: 'marcadores-responsavel-professor',
    escopo:
      'src/web/templates/responsavel/*.eta e src/web/templates/professor/*.eta e ' +
      'src/web/templates/comunicados/*.eta',
    tarefa: `Marcadores \`magic-values:\` que não silenciam nada. Some o MARCADOR; a PROSA fica.

  responsavel/frequencia.eta:77 e :92 · responsavel/boletim.eta:68
  responsavel/painel.eta:93 · professor/painel.eta:23 (este em prosa, sem \`//\`)

Confira cada um desligando e rodando \`bun scripts/magic-values.ts\`: se o achado aparecer,
o marcador estava vivo e FICA.

LEGIBILIDADE É ALVO. Se alguma justificativa do seu escopo passar de duas linhas ou de 200
caracteres, reescreva-a — o argumento cabe em prosa curta acima do código, e o marcador
fica curto. Material didático: comentário maior que a tela que explica atrapalha.`,
  },
];

const limpezas = await parallel(
  FRENTES.map((f) => () =>
    agent(
      `${CONTEXTO}

SEU ESCOPO, e nada além dele: ${f.escopo}

${f.tarefa}

${REGRAS}

Ao terminar:
  env -u FORCE_COLOR bunx tsc --noEmit
  env -u FORCE_COLOR bun scripts/magic-values.ts
  env -u FORCE_COLOR bun test testes/web/golden.test.ts   → diff zero, em banco isolado

O verificador pode acusar outros arquivos — não é problema seu.`,
      { label: `limpa:${f.rotulo}`, phase: 'Limpar', schema: RESULTADO, effort: 'high' },
    ),
  ),
);

const feitas = limpezas.filter(Boolean);
log(`${feitas.length}/${FRENTES.length} frentes limpas.`);
const pendencias = feitas.map((f) => f.pendencias).filter(Boolean);
for (const p of pendencias) log(`PENDÊNCIA: ${p.slice(0, 200)}`);

/* ------------------------------------------------------------------ *
 * FASE 3 — o critério do usuário.
 * ------------------------------------------------------------------ */

phase('Provar');

const veredito = await agent(
  `${CONTEXTO}

A nona passada foi aplicada por 4 agentes. PROVE que nada quebrou.

Na ordem, consertando antes de seguir:
1. \`bunx tsc --noEmit\`
2. \`bun run check\` — 0 violações
3. \`bun test\` num banco isolado — 714 testes eram verdes.
4. Golden das 75 telas com diff zero. JAMAIS regrave.
5. \`bun scripts/magic-values.ts\` limpo, com a regra de supressão morta ativa. Toda
   supressão restante precisa estar VIVA e sobreviver à auditoria.
6. \`bun run verificar\` exit 0.

${pendencias.length ? `PENDÊNCIAS relatadas — avalie cada uma:\n${pendencias.join('\n---\n')}` : ''}

${REGRAS}

Relate o resultado exato de cada comando, com números.`,
  { label: 'verificar', phase: 'Provar', effort: 'high' },
);

const critico = await agent(
  `${CONTEXTO}

Nona passada concluída. Você é o CRÍTICO DE COMPLETUDE. NÃO edite arquivo.

O USUÁRIO FIXOU O CRITÉRIO: encerra quando \`bun run verificar\` sair 0 E um crítico voltar
VAZIO, duas rodadas seguidas. Oito passadas se declararam completas e as oito estavam
erradas, sempre porque o defeito seguinte estava numa FORMA não medida — a última foi a
supressão que não suprime nada, invisível porque a regra só via supressão que suprimiu.

O crítico anterior mediu a matriz {texto, número, composição, marca} × posição em 47
células e concluiu que ela está CALIBRADA: toda célula cega não tem caso real, e fechá-las
custa um falso positivo para zero verdadeiros. NÃO refaça esse trabalho do zero — confirme
por amostragem que a conclusão se mantém e gaste seu esforço no que ele NÃO mediu.

"Nenhum" VERDADEIRO é o resultado desejado. Declare qual risco você correu: "nenhum" falso,
ou lista inflada.

1. A regra de supressão morta pega TODA forma de marcador inerte? Sonde: marcador em
   docblock longe da linha, marcador em prosa sem \`//\`, marcador na linha errada, marcador
   sobre valor que tem dono, marcador duplicado. Numa cópia em scratchpad; apague ao fim.

2. Sobrou alguma supressão inerte, confessa, contraditória ou desalinhada? Audite TODAS,
   desligando-as JUNTAS e não uma a uma — o crítico anterior mostrou que desligar uma de
   cada vez subestima, porque supressões da mesma família só são load-bearing em conjunto.

3. Alguma constante órfã? Varra as folhas de todos os \`constantes.ts\` contra src/, scripts/
   e testes/, ignorando comentários, e distinga folha morta de tabela lida por chave.

4. Algum comentário do repositório afirma um FATO ERRADO sobre o código — contagem,
   nome de constante, linha, ou promessa que o código não cumpre? A passada anterior achou
   um "cinco ocorrências" que eram seis. Procure outros por medição, não por leitura.

5. A legibilidade melhorou ou piorou? Aponte arquivo:linha. Alguma justificativa continua
   maior que a tela que explica? Alguma linha de template passou de 150 caracteres?

6. Que CLASSE de defeito nenhuma regra deste verificador alcança, e que não seja célula da
   matriz? As últimas três passadas acharam classes de segunda ordem — texto composto,
   supressão que confessa, supressão que não suprime. Existe uma terceira ordem?

7. Se você escrevesse a décima passada, o que ela consertaria? "Nada" é a resposta que o
   critério espera, desde que verdadeira.

${REGRAS}

Seja específico e cético. Cite arquivo:linha sempre.`,
  { label: 'critico', phase: 'Provar', effort: 'high' },
);

return {
  regra: regra?.resumo,
  limpezas: feitas.map((f) => f.resumo),
  pendencias,
  veredito,
  critico,
};
