export const meta = {
  name: 'duas-rodadas-limpas',
  description: 'O critério de conclusão: verde mais crítico vazio, duas rodadas seguidas',
  whenToUse: 'Para fechar um trabalho por medição em vez de por julgamento.',
  phases: [
    { title: 'Rodada 1', detail: 'crítico mede; se achar, conserta e repete' },
    { title: 'Rodada 2', detail: 'crítico independente, sem o relatório do primeiro' },
  ],
};

const CONTEXTO = `
REPOSITÓRIO: EscolaViva — Bun + Hono + Eta + Postgres. Bancos Docker de pé.
Rode SEMPRE com \`env -u FORCE_COLOR\`.

ATENÇÃO — OUTRA SESSÃO TRABALHA AQUI, commitando e fazendo push.
  - NUNCA rode git add, commit, push, checkout, rebase ou stash.
  - Arquivo fora do seu escopo modificado NÃO é regressão sua.
  - \`bun test\` com 'deadlock detected' é a suíte dela: crie banco isolado via
    DATABASE_URL_TESTE, use, e DROPE.
  - NÃO toque em docs/ nem em .claude/skills/.

ESTADO: \`bun run verificar\` sai 0 — 751 testes, depcruise limpo (118 módulos), golden de
75 telas com diff zero, \`scripts/magic-values.ts\` limpo.

O QUE FOI FEITO, em dez passadas e 23 commits:
  - Fonte única por módulo: 7 \`constantes.ts\`, cada valor com um dono. Merge por conceito,
    nunca por valor — os três limites de nome que valem 120 continuam sendo três.
  - \`ROTAS\` com \`grupo()\`: o caminho existe uma vez e produz o padrão do router e o
    endereço absoluto; \`Params<S>\` faz parâmetro errado não compilar.
  - Zero literal solto nos 44 templates: rota, título, rótulo, limite e campo vêm por \`it\`.
  - \`scripts/magic-values.ts\` no \`verificar\`, cobrindo {texto, número, composição, marca}
    × {nó que nomeia, nó fora, atributo varrido, atributo não varrido, bloco, template com
    interpolação, include, valor default}, mais auditoria da própria supressão: justificativa
    que confessa, que contradiz outra tela, ou que não silencia nada.
  - Golden de 75 telas congelado ANTES do refactor: nenhuma passada mudou um byte de HTML.
  - Todo comentário removido de \`src/\` e \`scripts/\` — 6.233 linhas, incluindo CSS e shell.
    Restam 17, todas diretiva. O que a prosa avisava virou nome ou teste.
`;

const CRITERIO = `
O DONO DO REPOSITÓRIO FIXOU O CRITÉRIO DE CONCLUSÃO: o trabalho encerra quando
\`bun run verificar\` sair 0 E um crítico voltar VAZIO, em DUAS RODADAS SEGUIDAS.

Você é uma dessas rodadas. Isto não é uma revisão de cortesia.

HISTÓRICO QUE VOCÊ PRECISA CONHECER: oito passadas se declararam completas e as oito
estavam erradas. O padrão foi sempre o mesmo — o crítico conferia a lista do defeito
anterior, e o defeito seguinte estava numa FORMA que ninguém tinha medido:

  limites redeclarados nos .eta → <h1> → rótulo de botão → texto dentro de <% %> →
  repetição sem dono → número em prosa → composição de constantes →
  supressão que confessa → supressão que não suprime nada

NÃO CONFIRA LISTA. MEÇA.

"Nenhum" VERDADEIRO é o resultado desejado e vale mais que qualquer achado. "Nenhum" falso
custa outra passada inteira. Lista de achado irrelevante custa o mesmo e ainda desgasta o
critério que o dono fixou. DECLARE, no início do seu relatório, qual dos dois riscos você
correu.
`;

const REGRAS = `
REGRAS:

1. NÃO EDITE ARQUIVO NENHUM. Você mede e relata.
2. Trabalhe em cópia no scratchpad para qualquer sonda ou mutação, e APAGUE ao terminar.
   O working tree do repositório precisa ficar exatamente como você o encontrou.
3. NUNCA rode comando de git que escreva, nem \`golden --regravar\`.
4. Cite arquivo:linha em todo achado. Achado sem localização não é achado.
5. Distinga o que você MEDIU do que você SUPÕE. Suposição vai marcada como tal.
`;

const VEREDITO = {
  type: 'object',
  additionalProperties: false,
  required: ['vazio', 'riscoQueCorri', 'achados', 'resumo'],
  properties: {
    vazio: { type: 'boolean', description: 'true se nenhum achado real sobreviveu à medição' },
    riscoQueCorri: {
      type: 'string',
      enum: ['nenhum-falso', 'lista-inflada'],
      description: 'qual erro você teria cometido, se cometeu algum',
    },
    achados: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['arquivo', 'linha', 'defeito', 'comoMedi'],
        properties: {
          arquivo: { type: 'string' },
          linha: { type: 'integer' },
          defeito: { type: 'string' },
          comoMedi: { type: 'string' },
          classe: { type: 'string' },
        },
      },
    },
    resumo: { type: 'string' },
  },
};

const PERGUNTAS = `
1. MAGIC VALUE. Existe valor duplicado que o verificador não acusa? Monte a matriz
   {texto, número, composição, marca} × {nó que nomeia, nó fora, atributo varrido, atributo
   não varrido, aspas simples, bloco, template com interpolação, include, valor default,
   .ts literal solto, .ts sob const} e sonde CADA célula. Para cada uma que cala, diga se há
   caso real hoje — arquivo:linha, ou "não há". Um crítico anterior mediu que as células
   cegas não tinham caso real; confirme por amostragem em vez de refazer do zero.

2. A CLASSE QUE A REMOÇÃO DE COMENTÁRIO PODE TER CRIADO, e que ninguém varreu inteira:
   valor cuja UNIDADE não está no nome, e configuração que LÊ COMO MORTA. Três casos foram
   consertados (\`linhasDaBusca\`, \`TEMPLATES_CUJO_SCRIPT_VIRA_HTML\`, os quatro limites de
   nome). Varra o repositório procurando os outros — número encostado em número de outra
   unidade, \`Set\`/\`Map\`/tabela sem consumidor evidente, constante cujo nome descreve o
   mecanismo em vez do motivo.

3. FATO FALSO. Algum identificador, teste ou mensagem afirma algo errado sobre o código?
   Uma passada anterior achou um "cinco ocorrências" que eram seis, dentro de um comentário
   que hoje não existe mais — mas mensagens de teste e nomes de constante fazem afirmações
   do mesmo tipo e ninguém as auditou.

4. TESTE QUE É DECORAÇÃO. Os testes novos desta sessão falham DE VERDADE quando o defeito
   acontece? Sonde numa cópia: funda os quatro limites de nome; remova a entrada de
   \`TEMPLATES_CUJO_SCRIPT_VIRA_HTML\`; escreva um comentário em \`src/\`; troque
   \`linhasDaBusca\` por \`nome\` no LIMIT. Cada um tem de ficar vermelho. Se algum passar
   verde com o defeito presente, ele é decoração e você deve dizer isso sem rodeio.

5. SUPRESSÃO. As 17 diretivas restantes: alguma está morta, na linha errada, confessa em vez
   de negar, ou contradiz outra tela? Audite desligando-as JUNTAS, não uma a uma — família
   de supressões só é load-bearing em conjunto.

6. CONSTANTE ÓRFÃ. Varra as folhas de todos os \`constantes.ts\` contra \`src/\`, \`scripts/\` e
   \`testes/\`, distinguindo folha morta de tabela lida por chave dinâmica.

7. A PERGUNTA DE ORDEM SUPERIOR. As últimas passadas acharam defeitos de segunda ordem
   (texto composto) e de terceira (supressão que confessa, supressão que não suprime).
   Existe uma quarta? Pense no que nenhuma regra deste verificador pode alcançar por
   construção, e diga se há caso real.

8. Se você escrevesse a próxima passada, o que ela consertaria? "Nada" é a resposta que o
   critério espera, desde que verdadeira.
`;

/* ------------------------------------------------------------------ *
 * RODADA 1 — mede; se achar, conserta e repete.
 * ------------------------------------------------------------------ */

phase('Rodada 1');

let rodada1 = await agent(
  `${CONTEXTO}

${CRITERIO}

Você é a RODADA 1.

${PERGUNTAS}

${REGRAS}`,
  { label: 'critico:1', phase: 'Rodada 1', schema: VEREDITO, effort: 'high' },
);

let consertos = null;

if (rodada1 && !rodada1.vazio && (rodada1.achados?.length ?? 0) > 0) {
  log(`Rodada 1: ${rodada1.achados.length} achados. Consertando.`);

  const porArquivo = {};
  for (const a of rodada1.achados) (porArquivo[a.arquivo] ??= []).push(a);
  const alvos = Object.keys(porArquivo);

  consertos = await parallel(
    alvos.map((arquivo) => () =>
      agent(
        `${CONTEXTO}

Um crítico adversarial mediu o repositório e achou defeito em ${arquivo}.

SEU ESCOPO: exatamente esse arquivo, mais o mínimo indispensável em outro arquivo se a
correção não couber num só — e nesse caso diga quais no resumo.

O que ele mediu:

${JSON.stringify(porArquivo[arquivo], null, 1)}

NENHUM COMENTÁRIO NOVO, em nenhuma forma: a decisão do dono é que o código não carrega
comentário. Se o defeito exigir um aviso, ele vira NOME ou TESTE. Teste não é comentário —
não pode divergir do código, porque quebra.

COMPORTAMENTO NÃO MUDA: as 75 telas do golden saem byte a byte idênticas. JAMAIS
\`golden --regravar\`.

Ao terminar:
  env -u FORCE_COLOR bunx tsc --noEmit
  env -u FORCE_COLOR bun run check
  env -u FORCE_COLOR bun test   (banco isolado)
  env -u FORCE_COLOR bun test testes/web/golden.test.ts  → diff ZERO
  env -u FORCE_COLOR bun scripts/magic-values.ts

NUNCA rode comando de git.`,
        {
          label: `conserta:${arquivo.split('/').pop()}`,
          phase: 'Rodada 1',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['resumo'],
            properties: { resumo: { type: 'string' }, pendencias: { type: 'string' } },
          },
          effort: 'high',
        },
      ),
    ),
  );

  log(`${consertos.filter(Boolean).length}/${alvos.length} consertos.`);

  rodada1 = await agent(
    `${CONTEXTO}

${CRITERIO}

Você é a RODADA 1, SEGUNDA TENTATIVA. Um crítico anterior achou defeitos e eles foram
consertados por ${consertos.filter(Boolean).length} agentes:

${consertos.filter(Boolean).map((c) => `- ${c.resumo}`).join('\n')}

Meça de novo, do zero. Confirme que cada defeito fechou de fato — e que o conserto não
criou outro, que é como duas passadas anteriores erraram.

${PERGUNTAS}

${REGRAS}`,
    { label: 'critico:1b', phase: 'Rodada 1', schema: VEREDITO, effort: 'high' },
  );
}

log(rodada1?.vazio ? 'Rodada 1 VAZIA.' : `Rodada 1 ainda com ${rodada1?.achados?.length ?? '?'} achados.`);

/* ------------------------------------------------------------------ *
 * RODADA 2 — independente. Não recebe o relatório do primeiro, de
 * propósito: um crítico que sabe onde o outro olhou olha nos mesmos
 * lugares.
 * ------------------------------------------------------------------ */

phase('Rodada 2');

const rodada2 = await agent(
  `${CONTEXTO}

${CRITERIO}

Você é a RODADA 2. Outro crítico já mediu este repositório e você NÃO vai ver o relatório
dele — de propósito. Um crítico que sabe onde o outro olhou olha nos mesmos lugares, e o
histórico desta sessão mostra que o defeito estava sempre onde ninguém tinha olhado.

Meça do zero, e escolha suas próprias sondas.

${PERGUNTAS}

${REGRAS}`,
  { label: 'critico:2', phase: 'Rodada 2', schema: VEREDITO, effort: 'high' },
);

const fechou = Boolean(rodada1?.vazio && rodada2?.vazio);
log(fechou ? 'DUAS RODADAS VAZIAS — critério atingido.' : 'Critério NÃO atingido.');

return {
  criterioAtingido: fechou,
  rodada1: {
    vazio: rodada1?.vazio,
    risco: rodada1?.riscoQueCorri,
    achados: rodada1?.achados ?? [],
    resumo: rodada1?.resumo,
  },
  consertos: consertos?.filter(Boolean).map((c) => c.resumo) ?? [],
  rodada2: {
    vazio: rodada2?.vazio,
    risco: rodada2?.riscoQueCorri,
    achados: rodada2?.achados ?? [],
    resumo: rodada2?.resumo,
  },
};
