export const meta = {
  name: 'magic-values-8',
  description: 'O verificador passa a auditar a própria supressão, em vez de honrá-la sem ler',
  whenToUse: 'Quando a justificativa de supressão puder fechar um achado sem ninguém validá-la.',
  phases: [
    { title: 'Auditar', detail: 'supressão que confessa e supressão que contradiz viram erro' },
    { title: 'Fechar', detail: 'um agente por arquivo da lista que o verificador produzir' },
    { title: 'Provar', detail: 'verificar exit 0 e crítico vazio — primeira das duas rodadas' },
  ],
};

const CONTEXTO = `
REPOSITÓRIO: EscolaViva — Bun + Hono + Eta + Postgres. Material didático (TEES2).
Bancos Docker de pé. Rode SEMPRE com \`env -u FORCE_COLOR\`.

ATENÇÃO — OUTRA SESSÃO TRABALHA NESTE REPOSITÓRIO AGORA, commitando e fazendo push.
  - NUNCA rode git add, commit, push, checkout, rebase ou stash.
  - Arquivo fora do seu escopo aparecer modificado NÃO é regressão sua.
  - \`bun test\` falhando com 'deadlock detected' ou violação de chave estrangeira é a
    suíte dela no mesmo banco. Crie um banco isolado via DATABASE_URL_TESTE, use, e DROPE.
  - NÃO toque em docs/diagrams/ — é trabalho dela.

SITUAÇÃO: sete passadas de refactor de magic values, 15 commits. \`bun run verificar\` sai
0: 714 testes, depcruise limpo, golden de 75 telas com diff zero, verificador limpo.

  src/{academico,identidade,avaliacao,comunicacao}/constantes.ts
  src/shared/constantes.ts · src/web/constantes.ts · src/web/rotas/mapa.ts
  src/web/render.ts   injeta it.rotas, it.titulos, it.acoes, it.rotulos, it.contagem,
                      it.areas, it.apresentacao, it.parciais, it.sufixos, it.campos…
  scripts/magic-values.ts   o verificador, dentro do \`bun run verificar\`

O GOLDEN É A LINHA VERMELHA. Diff = você mudou uma tela. JAMAIS \`golden --regravar\`.

ARMADILHAS DO ETA:
  - \`autoTrim: [false, 'nl']\` come a quebra de linha após \`%>\`.
  - Eta 4.6 não suporta \`<%# … %>\`; comentário é \`<% // … %>\`.
  - \`<% // … %>\` indentado empurra a linha seguinte no HTML. Encoste na margem.
  - Aspas dentro de comentário de linha em bloco \`<% %>\` quebram o render com 500.
`;

const REGRAS = `
REGRAS:

1. FONTE ÚNICA POR MÓDULO. Um módulo só enxerga outro pelo index.ts dele.

2. MERGE POR CONCEITO, NUNCA POR VALOR. Ao decidir NÃO unir, a justificativa
   \`// magic-values: permitido — <motivo>\` precisa dizer QUAL CONSTANTE O VALOR NÃO É e
   por quê. Dizer qual constante ele É não é justificativa: é confissão.

3. FORA DO ESCOPO: status HTTP, SQL, quantificador de regex, 0 e 1, dados de seed,
   testes/** inteiro, e o corpo do <script> de parciais/_script_avisos.eta.

4. COMPORTAMENTO NÃO MUDA. Um byte diferente no HTML é falha.

5. LEGIBILIDADE É REQUISITO. Repositório didático. Se consumir a constante deixar a linha
   pior de ler, NÃO force: relate em \`pendencias\`.

6. NUNCA rode comando de git, nem \`golden --regravar\`.

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
                motivo: { type: 'string' },
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
 * FASE 1 — a causa das duas últimas falhas.
 * ------------------------------------------------------------------ */

phase('Auditar');

const medicao = await agent(
  `${CONTEXTO}

SEU ESCOPO: scripts/magic-values.ts, e mais nada.

DIAGNÓSTICO: duas passadas seguidas fecharam PARTE dos casos e SUPRIMIRAM o resto com
justificativa que se contradiz. Não é azar. A supressão é uma saída que fecha o achado sem
ninguém validar o texto: o verificador HONRA o comentário, não o LÊ. Enquanto isso valer,
toda passada futura pode repetir o padrão.

Provas, medidas pelo crítico anterior:

  responsavel/boletim.eta:58 justifica com
    "o único pedaço repetido é o separador, QUE JÁ TEM DONO EM APRESENTACAO.separador"
  responsavel/frequencia.eta:71 justifica com
    "SÓ O SEPARADOR TEM DONO (it.apresentacao.separador)"
  comunicados/lista.eta:43 e novo.eta:117 justificam name="unidadeId" com
    "é o parâmetro de query PARAMETROS.unidadeId"

A regra 2 manda a supressão dizer qual constante o valor NÃO é. As três dizem qual ele É.

E a contradição entre telas: a sétima passada CONVERTEU o \`·\` de secretaria/turma.eta:96
e turma_disciplina_nova.eta:89, e SUPRIMIU o \`·\` idêntico de secretaria/aluno.eta:111,
responsavel/boletim.eta:59 e responsavel/frequencia.eta:85 — mesma forma, decisão oposta.

TRÊS REGRAS NOVAS:

(A) SUPRESSÃO QUE CONFESSA. Uma justificativa cujo texto nomeia uma constante cujo VALOR
    bate com o literal suprimido vira ERRO. O padrão a detectar é o caminho pontilhado ou
    o \`it.x.y\` dentro do texto do comentário: resolva-o contra o índice e compare com o
    literal daquela linha. Se bater, a justificativa está confessando.
    CUIDADO: uma justificativa legítima também nomeia constante — para NEGÁ-la
    ("é PARAMETROS.unidadeId, e não CAMPOS.comunicado.unidadeId"). O erro só existe quando
    a constante nomeada TEM O MESMO VALOR do literal suprimido. Mede antes de aceitar.

(B) SUPRESSÃO QUE CONTRADIZ. O mesmo literal consumido de constante num arquivo e
    suprimido em outro vira ERRO nos dois lados, nomeando o par. É o defeito que apareceu
    duas passadas seguidas e que nenhuma regra via.

(C) ASSIMETRIA DE UMA PALAVRA. \`donoNoCodigoDoTemplate\` exige DUAS_PALAVRAS_SEGUIDAS onde
    \`donoDoTexto\` exige UMA_PALAVRA — a mesma assimetria de posição que a passada anterior
    corrigiu para a marca tipográfica, deixada de pé para a palavra. O crítico mediu:
    trocando por UMA_PALAVRA saem 3 achados, todos verdadeiros, nenhum falso. Dois deles:
      professor/fechamento.eta:68  'Fechado' : 'Aberto'
        VOCABULARIO.fechamento (src/avaliacao/constantes.ts:185) declara os dois e NÃO TEM
        UM LEITOR no repositório — nasceu na primeira passada como dono deste literal e
        nunca foi ligado. Órfã e cópia são o mesmo defeito visto dos dois lados.
      responsavel/painel.eta:139  include(it.parciais.paginacao, { rotulo: 'matrículas' })
        secretaria/aluno.eta:225 passa it.contagem.matricula.plural no MESMO include, com o
        MESMO parâmetro, para a MESMA palavra — e o próprio painel.eta:76 já lê
        it.contagem.comunicado.

Cada regra: MEÇA os falsos ANTES de aceitar, como as passadas anteriores fizeram com o
número em prosa e com a composição. Se der mais falso que verdadeiro, aperte o portão —
nunca crie exceção pontual. Prove numa cópia em scratchpad, com positivos E negativos, e
apague ao terminar.

DEPOIS: rode e devolva o inventário COMPLETO agrupado por arquivo, caminhos relativos à
raiz. Inclua as supressões que passarem a ser erro. O \`verificar\` fica VERMELHO — está
certo. Não esconda achado para deixá-lo verde.

${REGRAS}`,
  { label: 'auditar', phase: 'Auditar', schema: ACHADOS_SCHEMA, effort: 'high' },
);

const arquivos = (medicao?.porArquivo ?? []).filter((a) => a.achados?.length);
const total = arquivos.reduce((s, a) => s + a.achados.length, 0);
log(`${total} achados em ${arquivos.length} arquivos.`);

/* ------------------------------------------------------------------ *
 * FASE 2 — um agente por arquivo.
 * ------------------------------------------------------------------ */

phase('Fechar');

const alvos = [...new Set(arquivos.map((a) => a.arquivo))].filter(
  (a) => !a.includes('magic-values.ts'),
);

const fechamentos = await parallel(
  alvos.map((arquivo) => () =>
    agent(
      `${CONTEXTO}

O verificador passou a AUDITAR a própria supressão: justificativa que nomeia a constante
cujo valor ela suprime virou erro, e o mesmo literal consumido num arquivo e suprimido em
outro virou erro nos dois lados.

SEU ESCOPO: exatamente UM arquivo — ${arquivo}
NÃO abra nenhum outro para escrita.

O que o verificador acusou aqui:

${JSON.stringify(arquivos.find((a) => a.arquivo === arquivo)?.achados ?? [], null, 1)}

DUAS SAÍDAS, e só duas:
  - consumir a constante, como as telas irmãs já fazem; ou
  - reescrever a justificativa dizendo QUAL CONSTANTE O VALOR NÃO É e por quê, de modo que
    ela sobreviva à auditoria.

A saída que NÃO existe é manter a justificativa atual. Se o mesmo literal é consumido em
outra tela, você não pode suprimir aqui sem que a outra também suprima — leia a tela irmã
que o achado cita antes de decidir, e decida por argumento, não por conveniência.

${REGRAS}

Ao terminar:
  env -u FORCE_COLOR bunx tsc --noEmit
  env -u FORCE_COLOR bun scripts/magic-values.ts   → confirme que SEU arquivo saiu da lista
  env -u FORCE_COLOR bun test testes/web/golden.test.ts   → diff zero, em banco isolado

O lint ainda acusará outros arquivos — não é problema seu.`,
      { label: `fecha:${arquivo.split('/').pop()}`, phase: 'Fechar', schema: RESULTADO, effort: 'high' },
    ),
  ),
);

const fechados = fechamentos.filter(Boolean);
log(`${fechados.length}/${alvos.length} arquivos fechados.`);
const pendencias = fechados.map((f) => f.pendencias).filter(Boolean);
for (const p of pendencias) log(`PENDÊNCIA: ${p.slice(0, 200)}`);

/* ------------------------------------------------------------------ *
 * FASE 3 — o critério do usuário.
 * ------------------------------------------------------------------ */

phase('Provar');

const veredito = await agent(
  `${CONTEXTO}

A oitava passada foi aplicada por ${fechados.length} agentes. PROVE que nada quebrou.

Na ordem, consertando antes de seguir:
1. \`bunx tsc --noEmit\`
2. \`bun run check\` — 0 violações
3. \`bun test\` num banco isolado — 714 testes eram verdes. Falha de asserção é regressão
   sua: conserte o CÓDIGO, jamais afrouxe o teste.
4. Golden das 75 telas com diff zero. JAMAIS regrave.
5. \`bun scripts/magic-values.ts\` limpo, com a auditoria de supressão ativa. Toda supressão
   restante precisa sobreviver à auditoria — dizer o que o valor NÃO é.
6. \`bun run verificar\` exit 0.

${pendencias.length ? `PENDÊNCIAS DE LEGIBILIDADE relatadas — avalie cada uma:\n${pendencias.join('\n---\n')}` : ''}

${REGRAS}

Relate o resultado exato de cada comando, com números.`,
  { label: 'verificar', phase: 'Provar', effort: 'high' },
);

const critico = await agent(
  `${CONTEXTO}

Oitava passada concluída. Você é o CRÍTICO DE COMPLETUDE. NÃO edite arquivo.

O USUÁRIO FIXOU O CRITÉRIO: encerra quando \`bun run verificar\` sair 0 E um crítico voltar
VAZIO, duas rodadas seguidas. Sete passadas se declararam completas e as sete estavam
erradas — sempre porque o defeito seguinte estava numa FORMA não medida: limites nos .eta,
<h1>, rótulo de botão, texto em \`<% %>\`, repetição sem dono, número em prosa, composição,
supressão auto-contraditória. NÃO CONFIRA LISTA. MEÇA.

"Nenhum" VERDADEIRO é o resultado desejado. "Nenhum" falso custa outra passada. Lista de
achado irrelevante custa o mesmo e ainda desgasta o critério. Diga qual dos dois riscos
você correu.

1. Matriz completa {texto, número, composição, marca} × {nó que nomeia, nó fora,
   atributo varrido, atributo não varrido, aspas simples, bloco, template com
   interpolação, include, valor default}, sondada CÉLULA A CÉLULA numa cópia em
   scratchpad. Relate o MEDIDO, não o esperado. Apague a cópia.

2. Para cada célula que cala, há caso real hoje? arquivo:linha, ou "não há".

3. AUDITE TODAS as supressões do repositório, uma a uma, desligando e religando: alguma
   está morta, na linha errada, confessa em vez de negar, ou contradiz outra tela? Esta
   passada criou uma regra para isso — ela pega tudo, ou passou algo?

4. A regra de auditoria produziu falso positivo que alguém contornou reescrevendo a
   justificativa de forma vazia, só para passar? Leia as justificativas alteradas.

5. Alguma constante órfã? A legibilidade piorou em alguma linha?

6. Se você escrevesse a nona passada, o que ela consertaria? "Nada" é a resposta que o
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
