export const meta = {
  name: 'magic-values-5',
  description: 'Torna o verificador simétrico e fecha tudo que ele passar a acusar',
  whenToUse: 'Quando "pronto" precisar virar `verificar` exit 0 em vez de julgamento de rodada.',
  phases: [
    { title: 'Medir', detail: 'lint ganha repetição-sem-dono e enxerga dentro de <% %>, e lista tudo' },
    { title: 'Donos', detail: 'cria as constantes que faltam para o que o lint acusou' },
    { title: 'Fechar', detail: 'um agente por arquivo, partição disjunta' },
    { title: 'Provar', detail: 'verificar exit 0, golden idêntico' },
  ],
};

const CONTEXTO = `
REPOSITÓRIO: EscolaViva — Bun + Hono + Eta + Postgres. Material didático (TEES2).
Bancos Docker de pé. Rode SEMPRE com \`env -u FORCE_COLOR\`.

SITUAÇÃO: quatro passadas de refactor de magic values já rodaram, COMMITADAS até
f69f831 mais a quarta no working tree. \`bun run verificar\` sai 0 hoje: 714 testes
verdes, depcruise limpo, golden de 75 telas com diff zero, lint limpo.

  src/{academico,identidade,avaliacao,comunicacao}/constantes.ts   LIMITES, CAMPOS, CODIGOS, MENSAGENS
  src/shared/constantes.ts    BANCO, FORMATOS, CAMPO_CHAVE, LOCALE, TEMPO
  src/web/constantes.ts       ROTAS, TEMPLATES, TITULOS, CAMPOS, AVISOS, APRESENTACAO, DOCUMENTO
  src/web/render.ts           injeta it.rotas, it.titulos, it.parciais, it.sufixos, it.documento…
  scripts/magic-values.ts     o verificador, dentro do \`bun run verificar\`

O GOLDEN É A LINHA VERMELHA. testes/web/golden.test.ts compara o HTML das 75 telas com o
congelado. Diff = você mudou uma tela. O texto renderizado sai BYTE A BYTE idêntico: você
troca a ORIGEM do texto, nunca o texto. JAMAIS rode \`bun run golden --regravar\`.

ARMADILHAS DO ETA já pagas por outros agentes — leia antes de editar template:
  - \`autoTrim: [false, 'nl']\` come a quebra de linha logo após \`%>\`. Rótulo em linha
    própria dentro de tag multilinha precisa de uma linha em branco de compensação.
  - Eta 4.6 NÃO suporta \`<%# … %>\`. Comentário é \`<% // … %>\`.
  - \`<% // … %>\` INDENTADO empurra a linha seguinte no HTML: o Eta guarda como texto o
    que vier antes do \`<%\`. Encoste o bloco na margem ou cole no markup.
`;

const REGRAS = `
REGRAS:

1. FONTE ÚNICA POR MÓDULO. Um módulo só enxerga outro pelo index.ts dele. src/shared/ não
   importa módulo de domínio; src/*/dominio/ não alcança shared/db|http|log|jobs.

2. MERGE POR CONCEITO, NUNCA POR VALOR. Só una quando os dois usos mudam juntos por
   definição. Texto igual com sentido diferente são duas constantes. Quando decidir NÃO
   unir, deixe a justificativa na linha com \`// magic-values: permitido — <motivo>\`.

3. FORA DO ESCOPO: status HTTP, nomes de tabela/coluna SQL, quantificadores de regex,
   0 e 1, dados de seed, testes/** inteiro, e o corpo do <script> de
   src/web/templates/parciais/_script_avisos.eta.

4. COMPORTAMENTO NÃO MUDA. Um byte diferente no HTML é falha, não melhoria.

5. LEGIBILIDADE É REQUISITO, NÃO BÔNUS. Este é um repositório didático. Se substituir um
   literal deixar a linha ilegível — do tipo
   \`id="<%= it.campos.turma.nome %><%= it.sufixos.erro %>"\` —, NÃO force: relate em
   \`pendencias\` com o trecho, e siga. Trocar um problema de duplicação por um de leitura
   não é progresso, e um aluno precisa conseguir ler o template.

6. NUNCA rode git add, git commit, git push, git checkout nem \`golden --regravar\`.

7. NÃO edite arquivo fora do seu escopo — outros agentes trabalham em paralelo agora.
`;

const ACHADOS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['porArquivo', 'donosQueFaltam', 'resumo'],
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
              required: ['linha', 'literal', 'classe'],
              properties: {
                linha: { type: 'integer' },
                literal: { type: 'string' },
                classe: {
                  type: 'string',
                  enum: ['copia-de-constante', 'repeticao-sem-dono', 'dentro-de-bloco', 'outro'],
                },
                dono: { type: 'string', description: 'caminho da constante dona, se já existir' },
              },
            },
          },
        },
      },
    },
    donosQueFaltam: {
      type: 'array',
      description: 'valores repetidos que ainda não têm constante nenhuma',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['literal', 'ocorrencias'],
        properties: {
          literal: { type: 'string' },
          ocorrencias: { type: 'integer' },
          arquivos: { type: 'array', items: { type: 'string' } },
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
 * FASE 1 — a medição que faltou nas quatro passadas anteriores.
 * ------------------------------------------------------------------ */

phase('Medir');

const medicao = await agent(
  `${CONTEXTO}

Quatro passadas se declararam completas e as quatro estavam erradas, sempre pelo mesmo
motivo estrutural: o verificador só dispara por COINCIDÊNCIA COM UMA CONSTANTE QUE JÁ
EXISTE. Ele responde "este literal copia uma constante?" e nunca "este texto se repete
sem dono?". Dono faltando é invisível por construção — e é onde está o que sobrou.

SEU ESCOPO: scripts/magic-values.ts, e mais nada. NÃO conserte nenhum template ou rota.

DUAS REGRAS NOVAS:

(A) REPETIÇÃO SEM DONO. Um valor que aparece N ou mais vezes em src/ (templates
    incluídos) e não tem constante em nenhum *constantes.ts passa a ser acusado, com a
    contagem e a lista de arquivos. Escolha o N e defenda a escolha no docblock — 2 é
    agressivo demais para vocabulário de uma palavra, e alto demais deixa passar o que
    importa. Reuse o portão que já evita acusar 'utf8', '.' e afins.

    Casos reais que ela PRECISA pegar (medidos por mim agora):
      12x  'Cancelar'        em <a class="botao botao--discreto">, zero donos
       6x  'Voltar à ficha'  6x 'Unidade'  6x 'Situação'  6x 'Ano'
       5x  'Aluno'           4x 'Turma'    4x 'Disciplina'    4x 'Rede'
      17 textos distintos com 3+ ocorrências e nenhuma constante

(B) ENXERGAR DENTRO DE \`<% %>\`. Hoje a regra de texto de nó vigia o que está ENTRE tags;
    a de endereço vigia href/action. Um rótulo movido para dentro de um bloco \`<% %>\`
    fica invisível — mesmo texto, mesma tela, uma posição acusa e a outra não. Casos
    reais que ela precisa pegar:
      src/web/templates/secretaria/painel.eta:49
        { …, titulo: 'Cadastrar responsável', … }   ← cópia de TITULOS.secretaria.responsavelNovo
      src/web/templates/comunicados/{lista,novo}.eta
        include("/parciais/_vazio", …)              ← cópia de TEMPLATES.parciais.vazio (6 ocorrências)
      src/web/templates/comunicados/novo.eta:133,134,142,143
        value="unidade" / === 'unidade' / 'selecionados'  ← ALCANCE, de src/comunicacao/constantes.ts

    Use o parser do TypeScript no conteúdo do bloco, para não confundir comentário com
    código — o script já faz isso em outra regra.

DEPOIS DE ESCREVER AS REGRAS: rode o verificador e me devolva o inventário COMPLETO,
agrupado por arquivo, mais a lista dos valores repetidos que ainda não têm dono nenhum.
É esse inventário que particiona as próximas fases, então ele precisa ser exaustivo e os
caminhos precisam ser relativos à raiz do repositório.

O \`verificar\` vai ficar VERMELHO ao fim da sua tarefa, e está certo assim: as fases
seguintes é que fecham os achados. Não esconda achado para deixá-lo verde.

Se uma regra sua produzir falso positivo, corrija a REGRA — nunca crie exceção pontual.
Prove cada regra nova numa cópia em scratchpad e apague ao terminar.

${REGRAS}`,
  { label: 'lint-simetrico', phase: 'Medir', schema: ACHADOS_SCHEMA, effort: 'high' },
);

const arquivos = (medicao?.porArquivo ?? []).filter((a) => a.achados?.length);
const totalAchados = arquivos.reduce((s, a) => s + a.achados.length, 0);
log(`${totalAchados} achados em ${arquivos.length} arquivos.`);
log(`${medicao?.donosQueFaltam?.length ?? 0} valores repetidos sem dono nenhum.`);

/* ------------------------------------------------------------------ *
 * FASE 2 — os donos que faltam, decididos por quem vê tudo de uma vez.
 * ------------------------------------------------------------------ */

phase('Donos');

const donos = await agent(
  `${CONTEXTO}

O verificador ficou simétrico e acusou ${totalAchados} literais em ${arquivos.length} arquivos.
Destes, ${medicao?.donosQueFaltam?.length ?? 0} valores se repetem e NÃO TÊM CONSTANTE NENHUMA:

${JSON.stringify(medicao?.donosQueFaltam ?? [], null, 1)}

Inventário completo, por arquivo:

${JSON.stringify(arquivos, null, 1)}

SEU ESCOPO: os arquivos *constantes.ts, os index.ts dos módulos, e src/web/render.ts.
Você é o único agente rodando agora. NÃO reescreva call site nenhum — quem faz isso é a
próxima fase.

TAREFA:

1. Crie o dono de cada valor repetido que não tem um, no módulo certo. Agrupe por
   CONCEITO: 'Cancelar', 'Voltar à ficha' e 'Voltar à turma' são rótulos de ação de
   navegação — decida se são uma família e qual. 'Unidade', 'Turma', 'Aluno', 'Situação',
   'CPF' aparecem como cabeçalho de coluna e como rótulo de campo: se as duas posições
   são a mesma decisão, é um dono; se não, são dois, e a justificativa vai no comentário.

   PENSE ANTES DE AGRUPAR. O erro que este refactor inteiro combate é unir por valor o
   que não muda junto. Um mapa chamado TEXTOS com 40 chaves soltas seria uma lista de
   strings, não uma fonte de verdade.

2. Garanta que a camada web recebe o que precisa: src/web/render.ts já injeta it.rotas,
   it.titulos, it.parciais, it.sufixos e outros em todo render. Adicione o que faltar
   para a próxima fase conseguir consumir os novos donos nos .eta.

3. NÃO crie constante sem consumidor previsto. Se um valor da lista não deve ter dono —
   porque as ocorrências são conceitos diferentes que coincidem —, diga isso no resumo,
   e a próxima fase deixa o literal com a justificativa \`// magic-values: permitido\`.

4. Sobre os ~204 nomes de campo escritos à mão nos .eta (id=, name=, for=, erroDe('x')):
   CAMPOS já é o dono nos 4 módulos. Avalie se dá para consumi-lo no template SEM
   destruir a legibilidade — \`id="<%= it.campos.turma.nome %><%= it.sufixos.erro %>"\` é
   pior de ler que \`id="nome-erro"\`, e este é um repositório didático (regra 5). Se a
   troca direta piorar a leitura, proponha no resumo a forma que preserva as duas coisas,
   ou recomende explicitamente deixar como está e por quê. Sua recomendação decide o que
   a próxima fase faz.

${REGRAS}

Ao terminar rode \`env -u FORCE_COLOR bunx tsc --noEmit\` e \`bun run check\`.
O lint segue vermelho — é esperado.`,
  { label: 'donos', phase: 'Donos', schema: RESULTADO, effort: 'high' },
);

log(`Donos: ${donos?.arquivosAlterados?.length ?? 0} arquivos.`);
if (donos?.pendencias) log(`RECOMENDAÇÃO: ${donos.pendencias.slice(0, 300)}`);

/* ------------------------------------------------------------------ *
 * FASE 3 — um agente por arquivo, partição disjunta por construção.
 * ------------------------------------------------------------------ */

phase('Fechar');

const alvos = arquivos.map((a) => a.arquivo).filter((a) => !a.includes('constantes.ts'));

const fechamentos = await parallel(
  alvos.map((arquivo) => () =>
    agent(
      `${CONTEXTO}

O verificador ficou simétrico e os donos que faltavam já foram criados por outro agente:

${donos?.resumo ?? '(sem resumo)'}
${donos?.pendencias ? `\nRECOMENDAÇÃO SOBRE LEGIBILIDADE, siga-a:\n${donos.pendencias}` : ''}

SEU ESCOPO: exatamente UM arquivo — ${arquivo}
NÃO abra nenhum outro para escrita; outros agentes editam os demais neste momento.

O que o verificador acusou neste arquivo:

${JSON.stringify(arquivos.find((a) => a.arquivo === arquivo)?.achados ?? [], null, 1)}

Feche cada achado consumindo o dono. Onde o achado for conceito diferente que coincide
por valor (regra 2), deixe o literal e escreva a justificativa na linha com
\`// magic-values: permitido — <motivo>\`. Justificativa genérica não serve: diga qual
constante o valor NÃO é, e por quê.

${REGRAS}

Ao terminar:
  env -u FORCE_COLOR bunx tsc --noEmit
  env -u FORCE_COLOR bun scripts/magic-values.ts   → confirme que SEU arquivo saiu da lista
  env -u FORCE_COLOR bun test testes/web/golden.test.ts   (se for template ou rota)

O lint ainda vai acusar OUTROS arquivos — não é problema seu e não conserte. O golden
precisa dar diff zero: se acusar, o texto renderizado mudou por sua causa.

NOTA SOBRE O BANCO: outros agentes usam o mesmo banco de teste e podem causar
'deadlock detected' no meio da sua corrida — é contenção de ambiente. Se acontecer, crie
um banco isolado no mesmo container via DATABASE_URL_TESTE e o DROPE ao terminar.`,
      {
        label: `fecha:${arquivo.split('/').pop()}`,
        phase: 'Fechar',
        schema: RESULTADO,
        effort: 'high',
      },
    ),
  ),
);

const fechados = fechamentos.filter(Boolean);
log(`${fechados.length}/${alvos.length} arquivos fechados.`);
const pendencias = fechados.map((f) => f.pendencias).filter(Boolean);
for (const p of pendencias) log(`PENDÊNCIA: ${p.slice(0, 200)}`);

/* ------------------------------------------------------------------ *
 * FASE 4 — a prova.
 * ------------------------------------------------------------------ */

phase('Provar');

const veredito = await agent(
  `${CONTEXTO}

A quinta passada foi aplicada por ${fechados.length} agentes, depois que o verificador
ficou simétrico. PROVE que nada quebrou e conserte o que quebrou.

Na ordem, consertando antes de seguir:
1. \`bunx tsc --noEmit\`
2. \`bun run check\` — 0 violações
3. \`bun test\` — 714 testes eram verdes. Toda falha é regressão desta rodada: conserte o
   CÓDIGO, jamais afrouxe o teste.
4. Golden das 75 telas com diff zero. JAMAIS regrave.
5. \`bun scripts/magic-values.ts\` — precisa sair limpo. Todo achado que sobrou: ou consome
   o dono, ou ganha \`// magic-values: permitido — <motivo>\` com justificativa específica.
   Se for falso positivo, corrija a REGRA, nunca crie exceção pontual.
6. \`bun run verificar\` inteiro, exit 0.

${pendencias.length ? `PENDÊNCIAS DE LEGIBILIDADE relatadas pelos agentes — avalie cada uma e decida:\n${pendencias.join('\n---\n')}` : ''}

${REGRAS}

Relate o resultado exato de cada comando, com números.`,
  { label: 'verificar', phase: 'Provar', effort: 'high' },
);

const critico = await agent(
  `${CONTEXTO}

Quinta passada concluída. Você é o CRÍTICO DE COMPLETUDE. NÃO edite arquivo.

HISTÓRICO QUE VOCÊ PRECISA CONHECER: quatro passadas anteriores se declararam completas e
as quatro estavam erradas. O padrão sempre foi o mesmo — o crítico conferiu a lista do
defeito anterior, e o defeito seguinte estava numa FORMA que ninguém tinha medido:
primeiro os limites nos .eta, depois os <h1>, depois os rótulos de botão, depois o texto
dentro de \`<% %>\` e a repetição sem dono. NÃO CONFIRA UMA LISTA. Meça.

1. O verificador é REALMENTE simétrico agora? Prove empiricamente numa cópia em
   scratchpad (nunca no repositório; apague ao terminar):
   - texto novo repetido N vezes sem dono → deve acusar
   - o mesmo texto dentro de \`<% %>\` → deve acusar
   - cópia de constante em atributo, em texto de nó e dentro de bloco → deve acusar nos três
   - \`c.redirect(x, 303)\`, quantificador de regex, corpo do <script> → NÃO deve acusar

2. Que POSIÇÃO ainda escapa? Enumere onde um valor pode aparecer num .eta ou .ts e
   verifique cada uma: atributo, texto de nó, dentro de bloco, dentro de string de
   template, argumento de include, comentário que vira HTML, chave de objeto, valor
   default de parâmetro, tipo literal. Para cada posição que o verificador não cobre,
   diga se existe caso real hoje.

3. Que TRANSFORMAÇÃO esconde uma cópia de qualquer busca por igualdade de string? Valor
   partido em pedaços e emendado, número formatado de outro jeito, texto com entidade
   HTML no lugar do caractere, maiúscula/minúscula diferente, espaço não-quebrável.
   Procure casos reais, não hipóteses.

4. Alguma constante ficou órfã? Alguma supressão \`// magic-values: permitido\` está morta
   (na linha errada) ou com justificativa que não se sustenta?

5. A LEGIBILIDADE piorou? Este é um repositório didático. Aponte cada linha em que a
   substituição deixou o template mais difícil de ler que o literal que ela removeu —
   trocar duplicação por ilegibilidade não é progresso, e é uma resposta útil.

${REGRAS}

Seja específico e cético. Cite arquivo:linha. "Nenhum" é resposta válida e desejável.`,
  { label: 'critico', phase: 'Provar', effort: 'high' },
);

return {
  medicao: medicao?.resumo,
  achados: totalAchados,
  arquivos: arquivos.length,
  donos: donos?.resumo,
  fechados: fechados.length,
  planejados: alvos.length,
  pendenciasDeLegibilidade: pendencias,
  veredito,
  critico,
};
