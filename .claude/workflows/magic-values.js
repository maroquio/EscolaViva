export const meta = {
  name: 'magic-values',
  description: 'Extrai magic values do código para constantes com fonte única da verdade, por módulo',
  whenToUse: 'Quando literais soltos (limites, rotas, nomes de template) espalhados pelo código precisam virar constantes com um único dono, sem alterar comportamento.',
  phases: [
    { title: 'Cobertura', detail: 'fecha as rotas GET sem teste e congela o HTML de todas as telas' },
    { title: 'Inventário', detail: 'varredura read-only, um agente por módulo' },
    { title: 'Nomear', detail: 'decide os nomes e escreve os constantes.ts, o mapa de rotas e o lint' },
    { title: 'Reescrever', detail: 'um agente por arquivo, partição disjunta' },
    { title: 'Verificar', detail: 'golden idêntico, suíte verde, nenhum literal residual' },
  ],
};

/* ------------------------------------------------------------------ *
 * Regras acordadas — repetidas em todo prompt porque cada agente
 * nasce sem o contexto da conversa que as decidiu.
 * ------------------------------------------------------------------ */

const REGRAS = `
REGRAS DO REFACTOR (decididas com o usuário — não reinterprete):

1. FONTE ÚNICA POR MÓDULO. Cada módulo ganha seu próprio arquivo de constantes:
   src/academico/constantes.ts, src/identidade/constantes.ts,
   src/avaliacao/constantes.ts, src/comunicacao/constantes.ts,
   src/web/constantes.ts, src/shared/constantes.ts.
   NÃO existe arquivo global único. Um módulo só enxerga o outro pelo index.ts
   (regra 'no-cross-module-shortcut' do .dependency-cruiser.js) — o que for
   consumido de fora precisa ser reexportado pelo index.ts do módulo dono.

2. MERGE POR CONCEITO, NUNCA POR VALOR. Dois literais só viram a mesma constante
   quando mudam juntos por definição. Exemplo que DEVE ser preservado:
   NOME_MAXIMO=120 existe hoje em cadastrarAluno.ts, cadastrarDisciplina.ts e
   cadastrarResponsavel.ts, e NOME_MAXIMO=60 em cadastrarTurma.ts. São quatro
   políticas independentes que por acaso concordam em três casos. Fundi-las
   acopla regras que nunca foram decididas juntas. Agrupe por dono:
     export const LIMITES = {
       aluno:       { nome: 120 },
       disciplina:  { nome: 120 },
       responsavel: { nome: 120, email: 254, telefone: 30 },
       turma:       { nome: 60, serie: 60 },
       parentesco:  { descricao: 40 },
     } as const;

3. ROTAS: UM MAPA, REGISTRO DERIVADO, PARAMS TIPADOS. Hoje o mesmo caminho
   aparece como TEMPLATE_*, como ROTA_*, no .get()/.post() e hardcoded nos .eta.
   Passa a existir uma vez só, em src/web/constantes.ts:

     export const ROTAS = {
       secretaria: grupo('/secretaria', {
         alunos:    '/alunos',
         alunoNovo: '/alunos/novo',
         aluno:     '/alunos/:id',
       }),
     };

     ROTAS.secretaria.prefixo        // '/secretaria'  → app.route() em app.ts
     ROTAS.secretaria.aluno.padrao   // '/alunos/:id'  → rotasSecretaria.get()
     ROTAS.secretaria.aluno({ id })  // '/secretaria/alunos/123' → href/redirect/it.rotas

   grupo() e o tipo Params<S> (extração dos :params via template literal type)
   ficam em src/web/rotas/mapa.ts. Params errado ou faltando NÃO pode compilar.

4. NOMES DE TEMPLATE também saem do mapa (TEMPLATES em src/web/constantes.ts),
   separados de ROTAS: template é caminho de arquivo, rota é caminho de URL,
   e hoje colidem por coincidência.

5. .ETA CONSOMEM VIA it.rotas. O objeto ROTAS é injetado em contextoDeTemplate()
   no src/web/render.ts — mesmo idioma que asset/formatarData/erroDe já usam.
   ATENÇÃO: renderizarErro() no mesmo arquivo renderiza _layout_publico por um
   caminho próprio e também precisa receber it.rotas, senão a página de erro quebra.

6. FORA DO ESCOPO — deixe exatamente como está:
   - Status HTTP (303, 404, 500, 403, 400, 401, 422, 503, 200...). São vocabulário
     do protocolo, não do produto. c.redirect(x, 303) permanece literal.
   - Strings de SQL, nomes de tabela e de coluna nos infra/*Repositorio.ts.
   - Quantificadores dentro de regex ({2}, {4}, \\d{8}).
   - 0 e 1.
   - Tabelas de dado dos seeds (nomes, quantidades de amostra) em scripts/seed*.ts.
   - testes/** INTEIRO. Os testes mantêm literal por design: uma asserção que
     importa a constante que ela verifica não verifica nada.

7. DENTRO DO ESCOPO: src/**, scripts/migrate.ts, scripts/build-assets.ts e a
   LÓGICA (não os dados) de scripts/seed.ts e scripts/seed-volume.ts.

8. DEDUP DE FUNÇÃO IDÊNTICA. Quando o corpo for byte a byte igual e existir casa
   legal pelo dependency-cruiser, mova e reimporte. Casos já conhecidos:
   hoje() em academico/aplicacao/cadastrarAluno.ts:27 e web/rotas/secretaria.ts:54;
   doisDigitos() em web/render.ts:72 e web/rotas/professor.ts:120.

9. COMPORTAMENTO NÃO MUDA. Este é um refactor puro. Nenhuma regra de negócio,
   nenhum texto de UI, nenhum status, nenhuma ordem de campo pode mudar.

10. NUNCA rode git add, git commit, git push ou git checkout. Só edite arquivos.
`;

const ARQUITETURA = `
RESTRIÇÕES DE ARQUITETURA (verificadas por 'bun run check'):
- 'no-cross-module-shortcut': um módulo só importa outro pelo index.ts dele.
- 'pure-domain': src/*/dominio/ não alcança shared/db, shared/http, shared/log,
  shared/jobs nem node_modules. Pode alcançar shared/ports, shared/resultado e
  shared/documento.
- 'shared-knows-no-domain': src/shared/ não importa identidade, academico,
  avaliacao nem comunicacao. Logo src/shared/constantes.ts só pode conter valores
  de infraestrutura (tempo, prazos, limites técnicos) — nunca regra de negócio.
`;

const INVENTARIO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['achados'],
  properties: {
    achados: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['arquivo', 'linha', 'literal', 'categoria', 'conceito', 'donoSugerido'],
        properties: {
          arquivo: { type: 'string' },
          linha: { type: 'integer' },
          literal: { type: 'string', description: 'o valor exato como aparece no código' },
          categoria: {
            type: 'string',
            enum: ['limite', 'rota', 'template', 'tempo', 'mensagem', 'formato', 'outro'],
          },
          conceito: {
            type: 'string',
            description:
              'o que o valor significa no domínio. Dois achados só podem virar a mesma ' +
              'constante se este campo for idêntico E eles mudarem juntos por definição.',
          },
          donoSugerido: {
            type: 'string',
            description: 'arquivo de constantes que deveria abrigá-lo',
          },
          ocorrenciasNoMesmoArquivo: { type: 'integer' },
        },
      },
    },
    funcoesDuplicadas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nome', 'arquivos'],
        properties: {
          nome: { type: 'string' },
          arquivos: { type: 'array', items: { type: 'string' } },
          corpoIdentico: { type: 'boolean' },
        },
      },
    },
  },
};

const MAPA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['arquivosCriados', 'arquivosParaReescrever', 'guia'],
  properties: {
    arquivosCriados: { type: 'array', items: { type: 'string' } },
    arquivosParaReescrever: {
      type: 'array',
      description:
        'Todo arquivo que ainda contém literal a substituir. Sem duplicatas. ' +
        'Caminhos relativos à raiz do repositório.',
      items: { type: 'string' },
    },
    guia: {
      type: 'string',
      description:
        'Documento completo, em markdown, que um agente sem nenhum contexto consegue seguir ' +
        'para reescrever um arquivo: nome de cada constante criada, valor, arquivo onde mora, ' +
        'como importá-la (respeitando os index.ts), a assinatura de grupo()/ROTAS/TEMPLATES, ' +
        'e como escrever it.rotas dentro de um .eta.',
    },
  },
};

const REESCRITA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['arquivo', 'substituicoes', 'observacoes'],
  properties: {
    arquivo: { type: 'string' },
    substituicoes: { type: 'integer' },
    observacoes: {
      type: 'string',
      description: 'literais deixados de propósito e por quê; vazio se não houver',
    },
  },
};

/* ------------------------------------------------------------------ *
 * FASE 0 + FASE 1 — a rede de proteção e o inventário.
 *
 * Barreira justificada: o golden precisa congelar o HTML ANTES de
 * qualquer mutação, e a fase 2 precisa de todos os inventários juntos
 * para decidir o que é conceito repetido e o que é valor coincidente.
 * ------------------------------------------------------------------ */

phase('Cobertura');

const GRUPOS_DE_ROTA = [
  { rotulo: 'secretaria', arquivo: 'src/web/rotas/secretaria.ts' },
  { rotulo: 'rede+conta+login', arquivo: 'src/web/rotas/rede.ts, src/web/rotas/conta.ts, src/web/rotas/login.ts' },
  { rotulo: 'professor+responsavel+comunicados', arquivo: 'src/web/rotas/professor.ts, src/web/rotas/responsavel.ts, src/web/rotas/comunicados.ts' },
];

const MODULOS = [
  { rotulo: 'academico', caminhos: 'src/academico/**' },
  { rotulo: 'identidade', caminhos: 'src/identidade/**' },
  { rotulo: 'avaliacao', caminhos: 'src/avaliacao/**' },
  { rotulo: 'comunicacao', caminhos: 'src/comunicacao/**' },
  { rotulo: 'shared', caminhos: 'src/shared/** e src/main.ts' },
  { rotulo: 'web', caminhos: 'src/web/**/*.ts (inclui rotas/, render.ts, app.ts, health.ts, paginacao.ts) e os 45 templates em src/web/templates/*.eta' },
  { rotulo: 'scripts', caminhos: 'scripts/migrate.ts, scripts/build-assets.ts e a lógica de scripts/seed.ts e scripts/seed-volume.ts' },
];

const preparacao = await parallel([
  // 0a — o golden: a única prova de que as telas não mudaram.
  () =>
    agent(
      `Você está criando a rede de proteção de um refactor puro no repositório EscolaViva (Bun + Hono + Eta + Postgres).

TAREFA: criar um teste golden que congela o HTML de TODAS as telas renderizadas hoje.

Contexto: os bancos Docker já estão de pé e a suíte está verde (637 testes, 0 falhas).
Rode sempre com \`env -u FORCE_COLOR bun test <arquivo>\` — FORCE_COLOR quebra testes deste repo.

Passos:
1. Leia testes/web/apoio.ts e testes/apoio/fabricas.ts. Eles já têm helpers de
   autenticação (entrar), requisição (abrir, enviar, postar) e um cenarioCompleto().
2. Levante TODAS as rotas GET registradas em src/web/rotas/*.ts, src/web/app.ts e
   src/web/health.ts. São 55 no total, várias com parâmetro (:id, :turmaId,
   :comunicadoId, :turmaDisciplinaId, :matriculaId).
3. Crie testes/web/golden.test.ts: monta um cenário determinístico, autentica com o
   papel correto para cada rota, faz GET em cada uma das 55 e compara o HTML com o
   arquivo correspondente em testes/web/golden/.
4. PROBLEMA CRÍTICO A RESOLVER: os IDs são UUID e as datas variam, então o HTML
   difere a cada execução. Normalize antes de comparar — troque UUIDs, datas,
   horários e nonces por marcadores estáveis (ex.: {{uuid}}, {{data}}). A
   normalização precisa ser agressiva o bastante para o teste ser determinístico e
   conservadora o bastante para ainda detectar um href trocado ou um rótulo perdido.
   Rode o teste DUAS vezes seguidas para provar que é determinístico.
5. Crie scripts/golden.ts com a flag --regravar, que regrava os arquivos golden
   quando a mudança for intencional. Adicione o script "golden" ao package.json.
6. Grave os 55 arquivos golden e confirme que o teste passa.

${REGRAS}

Entregue um relatório curto: quantas telas foram congeladas, quais rotas você não
conseguiu alcançar (e por quê), e qual normalização aplicou.`,
      { label: 'golden:congelar', phase: 'Cobertura' },
    ),

  // 0b..0d — fechar a cobertura das rotas GET sem teste.
  ...GRUPOS_DE_ROTA.map((g) => () =>
    agent(
      `Repositório EscolaViva (Bun + Hono + Eta + Postgres). A suíte está verde: 637 testes, 0 falhas.
Rode sempre com \`env -u FORCE_COLOR bun test <arquivo>\`.

TAREFA: fechar a cobertura de teste das rotas GET em ${g.arquivo}.

1. Liste todas as rotas GET registradas nesse(s) arquivo(s).
2. Levante quais já são exercitadas por algum teste em testes/web/.
3. Para cada rota GET SEM teste, escreva um teste que a alcança com o papel correto e
   afirma o essencial da tela: status esperado, e algum conteúdo que prove que a tela
   certa foi renderizada (um título, uma coluna da tabela, um campo do formulário).
4. Escreva num arquivo novo testes/web/cobertura_${g.rotulo.replace(/[^a-z]/g, '_')}.test.ts —
   NÃO edite testes/web/ já existentes, outros agentes estão trabalhando em paralelo.
5. Use os helpers de testes/web/apoio.ts e as fábricas de testes/apoio/fabricas.ts.
6. Confirme que seus testes passam antes de terminar.

IMPORTANTE: escreva as URLs como string literal ('/secretaria/alunos'). Não crie nem
importe constante de rota — o teste precisa ser uma afirmação independente do código
que ele verifica.

Nunca rode git add, git commit ou git push.`,
      { label: `cobertura:${g.rotulo}`, phase: 'Cobertura' },
    ),
  ),

  // FASE 1 — inventário, read-only, roda junto porque não escreve nada.
  ...MODULOS.map((m) => () =>
    agent(
      `Repositório EscolaViva (Bun + Hono + Eta + Postgres). Você é um INVENTARIANTE. NÃO edite nenhum arquivo.

TAREFA: catalogar todo magic value em ${m.caminhos}.

Para cada literal solto, registre arquivo, linha, o valor exato, a categoria, e —
o campo mais importante — o CONCEITO que ele representa no domínio. O conceito é o que
decide se dois literais iguais viram uma constante ou duas. Seja específico:
"tamanho máximo do nome do aluno" e não "tamanho máximo".

Inclua também constantes que JÁ existem mas estão no lugar errado (const local que
deveria ser do módulo, ou duplicada entre arquivos), e funções duplicadas com corpo
idêntico.

${REGRAS}

${ARQUITETURA}

Seja exaustivo dentro do seu escopo e não invada os outros. Retorne o inventário estruturado.`,
      { label: `inventario:${m.rotulo}`, phase: 'Inventário', schema: INVENTARIO_SCHEMA },
    ),
  ),
]);

const golden = preparacao[0];
const inventarios = preparacao.slice(1 + GRUPOS_DE_ROTA.length).filter(Boolean);

log(`Rede de proteção pronta. ${inventarios.length} inventários coletados.`);

const totalAchados = inventarios.reduce((soma, inv) => soma + (inv.achados?.length ?? 0), 0);
log(`${totalAchados} achados no inventário.`);

/* ------------------------------------------------------------------ *
 * FASE 2 — um único agente decide os nomes.
 *
 * Precisa da visão global: só quem vê os quatro módulos de uma vez
 * consegue distinguir conceito repetido de valor coincidente.
 * ------------------------------------------------------------------ */

phase('Nomear');

const mapa = await agent(
  `Repositório EscolaViva (Bun + Hono + Eta + Postgres). Você é o ARQUITETO deste refactor.

Sete agentes varreram o código em paralelo. Segue o inventário consolidado:

${JSON.stringify(inventarios, null, 1)}

TAREFA, nesta ordem:

1. Decida os nomes. Agrupe por dono, nunca por valor. Se dois achados têm o mesmo
   valor mas conceitos diferentes, eles VIRAM DUAS CONSTANTES — esse é o ponto mais
   importante da tarefa inteira.

2. Crie src/web/rotas/mapa.ts com grupo() e o tipo Params<S>. Params<S> extrai os
   :params do literal via template literal type, de modo que
   ROTAS.secretaria.aluno({}) e ROTAS.secretaria.aluno({ ind: x }) NÃO compilem.
   Comente o tipo no idioma do repositório: os comentários daqui explicam POR QUE a
   decisão existe e o que quebraria sem ela, não o que a linha faz. Leia
   src/shared/config/schema.ts e .dependency-cruiser.js para calibrar o tom.

3. Escreva os arquivos de constantes: src/academico/constantes.ts,
   src/identidade/constantes.ts, src/avaliacao/constantes.ts,
   src/comunicacao/constantes.ts, src/web/constantes.ts, src/shared/constantes.ts.
   Crie apenas os que tiverem conteúdo real. Reexporte pelo index.ts de cada módulo
   o que for consumido de fora.

4. Em src/web/constantes.ts, ROTAS e TEMPLATES são mapas SEPARADOS.

5. Escreva scripts/magic-values.ts: um verificador que varre src/ e scripts/ e falha
   com saída não-zero quando encontra literal solto fora das exceções da regra 6.
   Ele precisa passar limpo no código já refatorado. NÃO altere o script "verificar"
   do package.json ainda — quem faz isso é a fase final, depois da suíte verde.

6. NÃO reescreva nenhum call site. Você só CRIA arquivos novos e ajusta os index.ts.
   Quem reescreve são os agentes da próxima fase.

7. Produza o campo 'guia': um documento markdown autossuficiente. Cada agente da
   próxima fase recebe apenas ele e um arquivo, sem nenhum outro contexto. Precisa
   conter cada constante criada com nome, valor, arquivo e a linha de import exata;
   a assinatura de ROTAS/TEMPLATES com exemplos de uso em .ts e em .eta; e a lista
   de literais que devem ficar como estão.

8. Liste em 'arquivosParaReescrever' todo arquivo que ainda tem literal a substituir,
   sem duplicatas, caminho relativo à raiz. Inclua os .eta.

${REGRAS}

${ARQUITETURA}

Ao terminar, rode \`env -u FORCE_COLOR bunx tsc --noEmit\` e garanta que os arquivos
que você criou compilam. Nunca rode git add, git commit ou git push.`,
  { label: 'arquiteto', phase: 'Nomear', schema: MAPA_SCHEMA, effort: 'high' },
);

const alvos = [...new Set(mapa.arquivosParaReescrever ?? [])];
log(`${mapa.arquivosCriados?.length ?? 0} arquivos criados. ${alvos.length} arquivos a reescrever.`);

/* ------------------------------------------------------------------ *
 * FASE 3 — um agente por arquivo. Partição disjunta por construção:
 * dois agentes nunca abrem o mesmo arquivo para escrita.
 * ------------------------------------------------------------------ */

phase('Reescrever');

const reescritas = await parallel(
  alvos.map((arquivo) => () =>
    agent(
      `Repositório EscolaViva (Bun + Hono + Eta + Postgres).

As constantes já foram criadas por outro agente. Sua tarefa é reescrever UM arquivo
para consumi-las: ${arquivo}

NÃO abra nenhum outro arquivo para escrita — outros agentes estão editando os demais
neste exato momento. Ler outros arquivos é permitido e recomendado.

GUIA DAS CONSTANTES CRIADAS:

${mapa.guia}

${REGRAS}

Ao terminar:
- Confirme que ${arquivo} não tem mais literal solto fora das exceções.
- Se for .ts, confirme que os imports respeitam os index.ts dos módulos.
- Se for .eta, confirme que usa it.rotas e que nenhum href/action ficou hardcoded.
- Comportamento não pode mudar: mesmo texto, mesma ordem, mesmo status, mesma URL final.

Nunca rode git add, git commit ou git push.`,
      { label: `reescreve:${arquivo.split('/').pop()}`, phase: 'Reescrever', schema: REESCRITA_SCHEMA },
    ),
  ),
);

const aplicadas = reescritas.filter(Boolean);
const totalSubstituicoes = aplicadas.reduce((s, r) => s + (r.substituicoes ?? 0), 0);
log(`${aplicadas.length}/${alvos.length} arquivos reescritos, ${totalSubstituicoes} substituições.`);

if (aplicadas.length < alvos.length) {
  log(`ATENÇÃO: ${alvos.length - aplicadas.length} arquivos falharam e ficaram sem reescrita.`);
}

/* ------------------------------------------------------------------ *
 * FASE 4 — a prova.
 * ------------------------------------------------------------------ */

phase('Verificar');

const veredito = await agent(
  `Repositório EscolaViva. Um refactor de magic values acabou de ser aplicado por ${aplicadas.length} agentes em paralelo.
Sua tarefa é PROVAR que nada quebrou, e consertar o que quebrou.

Rode sempre com \`env -u FORCE_COLOR\`. Os bancos Docker já estão de pé.

Na ordem:
1. \`bunx tsc --noEmit\` — conserte todo erro de tipo.
2. \`bun run check\` (dependency-cruiser) — conserte toda violação de fronteira.
3. \`bun test\` — a suíte tinha 637 testes verdes ANTES do refactor, mais os testes de
   cobertura escritos nesta rodada. Toda falha é regressão introduzida agora: conserte
   o código, JAMAIS afrouxe o teste.
4. O teste golden compara o HTML de todas as telas com o que foi congelado antes de
   qualquer mudança. Diff nele significa que uma tela mudou — o que este refactor
   proibiu. Conserte o código até o diff zerar. NÃO regrave o golden.
5. \`bun scripts/magic-values.ts\` — deve sair limpo. Se acusar literal residual
   legítimo, extraia-o para o arquivo de constantes do dono. Se acusar falso positivo,
   corrija a regra no próprio script, não crie exceção pontual.
6. Só com tudo verde: adicione "magic": "bun scripts/magic-values.ts" ao package.json e
   inclua-o no script "verificar", entre "check" e "test".
7. Rode \`bun run verificar\` inteiro e confirme verde.

${REGRAS}

Nunca rode git add, git commit ou git push. Relate o que consertou e o resultado final
de cada comando, com os números exatos.`,
  { label: 'verificar', phase: 'Verificar', effort: 'high' },
);

const residuo = await agent(
  `Repositório EscolaViva. Um refactor de magic values acabou de ser concluído e verificado.
Você é o CRÍTICO DE COMPLETUDE. NÃO edite nenhum arquivo — apenas relate.

${REGRAS}

Responda, com arquivo:linha como evidência:
1. Que magic value dentro do escopo ESCAPOU do refactor?
2. Onde o merge por conceito foi violado — duas constantes distintas fundidas numa só,
   ou uma constante criada para valores que deveriam ter continuado separados?
3. Algum .eta ainda tem href ou action hardcoded?
4. Alguma constante ficou no módulo errado pelo critério do dependency-cruiser?
5. O scripts/magic-values.ts tem falso negativo — alguma categoria que ele deveria
   pegar e não pega?

Seja específico e cético. Nada de elogio. Se não achar nada numa pergunta, diga apenas
"nenhum" e passe para a próxima.`,
  { label: 'critico', phase: 'Verificar', effort: 'high' },
);

return {
  golden,
  achados: totalAchados,
  arquivosCriados: mapa.arquivosCriados,
  arquivosReescritos: aplicadas.length,
  arquivosPlanejados: alvos.length,
  substituicoes: totalSubstituicoes,
  veredito,
  residuo,
};
