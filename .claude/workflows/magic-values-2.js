export const meta = {
  name: 'magic-values-2',
  description: 'Segunda passada: fecha as lacunas que a primeira deixou, com foco nos .eta e no lint',
  whenToUse: 'Depois de rodar magic-values, quando o crítico de completude apontar literais que escaparam.',
  phases: [
    { title: 'Lacunas', detail: 'templates, handlers e o lint — partição por diretório' },
    { title: 'Consolidar', detail: 'um dono por contrato: CAMPOS, CODIGOS e as constantes órfãs' },
    { title: 'Provar', detail: 'golden idêntico, suíte verde, lint estrito limpo' },
  ],
};

const CONTEXTO = `
REPOSITÓRIO: EscolaViva — Bun + Hono + Eta + Postgres. Material didático (TEES2).
Os bancos Docker estão de pé. Rode SEMPRE com \`env -u FORCE_COLOR\` — sem isso testes
deste repo falham por causa de cor no terminal.

SITUAÇÃO: um refactor de magic values já rodou e está aplicado no working tree (77
arquivos, nada commitado). Ele criou a infraestrutura de constantes:

  src/academico/constantes.ts     LIMITES, MENSAGENS, CODIGOS, CAMPOS
  src/identidade/constantes.ts    LIMITES, CAMPOS, VOCABULARIO_DE_IDENTIDADE
  src/avaliacao/constantes.ts     LIMITES, CAMPOS
  src/comunicacao/constantes.ts   CAMPOS
  src/shared/constantes.ts        BANCO, FORMATOS, ATIVOS, CAMINHOS_DE_ENTRADA
  src/web/constantes.ts           ROTAS, TEMPLATES, TITULOS, CAMPOS, AVISOS, APRESENTACAO...
  src/web/rotas/mapa.ts           grupo() + Params<S>
  scripts/magic-values.ts         o verificador

ESTADO ATUAL: \`bun run verify\` sai 0 — 714 testes verdes, depcruise limpo, golden
de 75 telas sem diff. NÃO PODE REGREDIR. Seu trabalho não pode mudar nenhuma tela:
o teste golden em testes/web/golden.test.ts compara o HTML de todas elas com o que foi
congelado. Diff no golden = você quebrou algo. JAMAIS rode \`bun run golden --regravar\`.
`;

const REGRAS = `
REGRAS (decididas com o usuário — não reinterprete):

1. FONTE ÚNICA POR MÓDULO. Um módulo só enxerga outro pelo index.ts dele
   (regra 'no-cross-module-shortcut'). O que for consumido de fora precisa estar
   reexportado pelo index.ts do módulo dono.

2. MERGE POR CONCEITO, NUNCA POR VALOR. Dois literais só viram a mesma constante
   quando mudam juntos por definição. LIMITES.aluno.nome e LIMITES.turma.nome são
   políticas separadas mesmo quando o número coincide.

3. FORA DO ESCOPO — deixe como está: status HTTP (303, 404, 500...), strings de SQL e
   nomes de coluna, quantificadores de regex, 0 e 1, tabelas de dado dos seeds,
   e testes/** INTEIRO (os testes mantêm literal por design — uma asserção que importa
   a constante que verifica não verifica nada).

4. COMPORTAMENTO NÃO MUDA. Refactor puro: nenhum texto, ordem, status ou URL final
   pode mudar. Um byte diferente no HTML é uma falha, não uma melhoria.

5. NUNCA rode git add, git commit, git push ou git checkout.

6. NÃO edite arquivo fora do seu escopo — outros agentes estão trabalhando em paralelo
   neste exato momento. Ler qualquer arquivo é permitido e recomendado.
`;

const PADRAO_DO_LIMITE = `
O PADRÃO CORRETO PARA LEVAR UM LIMITE ATÉ O TEMPLATE (já existe no repositório):

O Eta não importa TypeScript, então o template não pode ler LIMITES direto. A solução
NÃO é redeclarar o valor no .eta — isso cria a segunda fonte de verdade que este
refactor inteiro existe para eliminar. A solução é o handler passar o valor via \`it\`,
exatamente como src/web/rotas/professor.ts já faz:

  // no handler
  return renderizar(c, TEMPLATES.professor.notas, {
    ...dados,
    notaMinima: LIMITES.nota.minima,
    limiteDaJustificativa: LIMITES.justificativa,
  });

  // no template — src/web/templates/professor/notas.eta
  <input maxlength="<%= it.limiteDaJustificativa %>">

Replique esse padrão. O valor renderizado precisa ser IDÊNTICO ao que está hardcoded
hoje, senão o golden acusa.
`;

const RESULTADO = {
  type: 'object',
  additionalProperties: false,
  required: ['arquivosAlterados', 'resumo'],
  properties: {
    arquivosAlterados: { type: 'array', items: { type: 'string' } },
    resumo: { type: 'string' },
    pendencias: { type: 'string', description: 'o que você não conseguiu fechar e por quê; vazio se nada' },
  },
};

/* ------------------------------------------------------------------ *
 * FASE A — as lacunas, particionadas por diretório.
 *
 * Nenhum agente desta fase escreve em *constantes.ts — só lê. Assim a
 * consolidação semântica da fase B tem o arquivo inteiro para si.
 * ------------------------------------------------------------------ */

phase('Lacunas');

const LACUNAS = [
  {
    rotulo: 'secretaria',
    escopo: 'src/web/rotas/secretaria.ts e os 15 templates em src/web/templates/secretaria/',
    tarefa: `Seis templates de secretaria redeclaram limites que já existem em LIMITES:

  templates/secretaria/aluno_novo.eta:21              const NOME_MAXIMO = 120
  templates/secretaria/turma_nova.eta:22              const NOME_MAXIMO = 60
  templates/secretaria/responsavel_novo.eta:21,22,23  120, 254, 30
  templates/secretaria/aluno_responsavel_novo.eta:22  40
  templates/secretaria/disciplina_nova.eta:21         120
  templates/secretaria/alunos.eta:36                  120

Cada um desses valores tem dono em src/academico/constantes.ts (LIMITES.aluno.nome,
LIMITES.turma.nome/serie, LIMITES.responsavel.*, LIMITES.parentesco.descricao,
LIMITES.disciplina.nome). Elimine as declarações locais e faça o handler passar o valor.

Confira também, nos mesmos 15 templates: include("/parciais/_*") literal onde
TEMPLATES.parciais existe; \`value="sim"\` onde MARCADO existe; a opção vazia de <select>
redeclarada em turma_nova.eta:37, turma_disciplina_nova.eta:27,
matricula_transferencia.eta:27, aluno_matricula_nova.eta:23 e crua em
aluno_responsavel_novo.eta:73, onde APRESENTACAO.opcaoVazia existe; e os id= com sufixo
"-erro"/"-ajuda" onde SUFIXOS_DE_ID/PREFIXOS_DE_ID existem.

Em src/web/rotas/secretaria.ts:73, PARAMETRO_DE_ID = 'id' traz um comentário dizendo que
"precisa casar com o que ROTAS declara" e nada o obriga. src/web/rotas/professor.ts:87-92
resolve isso com \`satisfies Params<typeof ROTAS.professor.notas.padrao | ...>\`.
Aplique a mesma amarração aos 9 c.req.param() deste arquivo.`,
  },
  {
    rotulo: 'rede',
    escopo: 'src/web/rotas/rede.ts e os 7 templates em src/web/templates/rede/',
    tarefa: `Três templates de rede redeclaram limites que já existem em LIMITES:

  templates/rede/ano_novo.eta:20,21      const ANO_MINIMO = 2000; ANO_MAXIMO = 2100
  templates/rede/unidade_nova.eta:20,21  120, 20
  templates/rede/usuario_novo.eta:24     120
  templates/rede/usuario_novo.eta:31     14  (tamanho do CPF com máscara)

Donos: LIMITES.anoLetivo.* em src/academico/constantes.ts, LIMITES.unidade.* e
LIMITES.usuario.nome em src/identidade/constantes.ts, TAMANHO_DO_CPF_COM_MASCARA em
src/shared/constantes.ts. Elimine as declarações locais; o handler passa o valor.

Confira também nos mesmos 7 templates: include("/parciais/_*") literal, opção vazia de
<select> redeclarada, e id= com sufixo "-erro"/"-ajuda", que já têm constante criada
(TEMPLATES.parciais, APRESENTACAO.opcaoVazia, SUFIXOS_DE_ID, PREFIXOS_DE_ID).`,
  },
  {
    rotulo: 'layouts-e-comunicados',
    escopo:
      'src/web/templates/comunicados/*.eta, src/web/templates/_layout.eta, ' +
      'src/web/templates/_layout_publico.eta, src/web/templates/erro.eta, src/web/templates/login.eta',
    tarefa: `Dois problemas graves aqui.

(a) src/web/templates/comunicados/novo.eta é o ÚNICO template com rota de produto que
não usa it.rotas — o agente que devia reescrevê-lo morreu de erro de API. Cinco
ocorrências hardcoded:
  :37   href="/comunicados"        -> it.rotas.comunicados.lista()
  :54   action="/comunicados/novo" -> it.rotas.comunicados.novo()
  :87   href="/comunicados/novo"   -> idem
  :91   action="/comunicados/novo" -> idem
  :190  href="/comunicados"        -> it.rotas.comunicados.lista()
Confira o nome exato das chaves lendo ROTAS em src/web/constantes.ts.

(b) src/web/templates/_layout_publico.eta:17 monta o caminho da folha de estilo com
"/publico/" escrito à mão, enquanto src/web/templates/_layout.eta:21 já deriva de
it.rotas. Consequência: mudar o prefixo publicado em ROTAS faz a aplicação seguir e a
tela de login e TODAS as páginas de erro perderem o CSS em silêncio. Alinhe o layout
público ao mesmo padrão do layout da aplicação.

Confira também nestes arquivos: href="#conteudo" onde DOCUMENTO.idDoConteudo existe;
"noindex, nofollow", lang e esquema de cor onde DOCUMENTO.* existe; "· EscolaViva",
"Escola<em>Viva</em>", "Portal da rede escolar" e o rodapé onde APRESENTACAO.* existe;
include("/parciais/_*") onde TEMPLATES.parciais existe.

ATENÇÃO ESPECIAL: _layout.eta e _layout_publico.eta entram em TODAS as 75 telas do
golden. Um byte a mais aqui reprova o refactor inteiro. Note que
templates/parciais/_script_avisos.eta é conteúdo de <script> que viaja para o navegador:
literal ali é a forma correta, não mexa nele.`,
  },
  {
    rotulo: 'professor-responsavel-conta',
    escopo:
      'src/web/templates/professor/*.eta, src/web/templates/responsavel/*.eta, ' +
      'src/web/templates/conta/*.eta, src/web/templates/parciais/_paginacao.eta, ' +
      'src/web/templates/parciais/_vazio.eta, src/web/templates/parciais/_mensagens.eta, ' +
      'src/web/templates/parciais/_cabecalho.eta, src/web/templates/parciais/_navegacao.eta, ' +
      'src/web/templates/parciais/_icone.eta',
    tarefa: `Ligue as constantes que foram criadas e nunca consumidas nestes templates:
include("/parciais/_*") literal onde TEMPLATES.parciais existe; os id= com prefixo
"erro-" (notas.eta:107,109) e "pendencia-" (fechamento.eta:59,80) onde PREFIXOS_DE_ID
existe; a opção vazia de <select> e o separador de turno onde APRESENTACAO.* existe.

NÃO toque em src/web/templates/parciais/_script_avisos.eta: é conteúdo de <script> que
viaja para o navegador, e literal ali é a forma correta.

Verifique se algum destes templates ainda tem href ou action hardcoded que deveria vir
de it.rotas, e se algum redeclara limite que já tem dono em LIMITES (o padrão de
professor.ts é a referência a seguir).`,
  },
  {
    rotulo: 'shared',
    escopo: 'src/shared/db/conexao.ts, src/shared/http/identificador.ts, src/shared/paginacao/pagina.ts, src/shared/http/erros.ts',
    tarefa: `Quatro arquivos de shared ficaram com constante local enquanto o dono já existia
em src/shared/constantes.ts:

(a) src/shared/db/conexao.ts:7,9,10 — MAX_CONEXOES=10, TEMPO_OCIOSO_SEGUNDOS=30,
    TEMPO_DE_CONEXAO_SEGUNDOS=10. O agente que devia reescrever este arquivo morreu de
    erro de API e ele está intocado. BANCO em src/shared/constantes.ts foi criado com
    exatamente esses três valores. Ligue.

(b) src/shared/http/identificador.ts:8 — FORMATO_DE_ID é byte a byte igual a
    FORMATOS.identificador. Existem hoje três cópias do mesmo regex de UUID.

(c) src/shared/paginacao/pagina.ts:30 — TAMANHO_PADRAO=10 ficou fora de constantes.ts
    embora o docblock de shared/constantes.ts o discuta como se morasse lá.

(d) src/shared/http/erros.ts:25-31 — a tabela TITULOS é byte a byte igual a
    TITULOS_DE_ERRO em src/web/constantes.ts:454-461. O comentário alega que a
    duplicação é inevitável "pela direção da dependência", mas o precedente que ele
    mesmo cita prova o contrário: CAMINHOS_DE_ENTRADA foi declarado em
    src/shared/constantes.ts e ROTAS.publicas é montado A PARTIR dele. Aplique a mesma
    técnica: declare em shared, derive em web. EVENTOS_DE_LOG (:38) e ENTIDADES_HTML
    (:48) também ficaram inline.

Você PODE editar src/shared/constantes.ts para os itens (c) e (d) — é o único agente
desta fase autorizado a isso. Não toque em nenhum outro *constantes.ts.

Respeite as fronteiras: 'shared-knows-no-domain' proíbe src/shared/ de importar
identidade, academico, avaliacao ou comunicacao.`,
  },
  {
    rotulo: 'lint',
    escopo: 'scripts/magic-values.ts',
    tarefa: `O verificador tem três falsos negativos verificados empiricamente. Conserte os três.

(a) NÃO VARRE .eta. ALVOS (:43-49) é só 'src/**/*.ts' + quatro scripts. Os 44 templates
    estão fora do alcance — e é exatamente ali que mora o modo de falha que o docblock
    de src/web/rotas/mapa.ts descreve: link quebrado em .eta não quebra compilação,
    quebra a tela. Prova: o script imprime "✔ nenhum literal solto" hoje, com cinco
    rotas hardcoded em comunicados/novo.eta e limites redeclarados em nove templates.
    Faça-o varrer src/web/templates/**/*.eta e acusar: href/action com caminho de rota
    literal, e limite numérico redeclarado que já existe em LIMITES.
    EXCEÇÃO: src/web/templates/parciais/_script_avisos.eta é conteúdo de <script> que
    viaja para o navegador — literal ali é correto e deve ser isento, com comentário
    explicando por quê.

(b) declaracaoNomeada (:99-106) isenta qualquer \`const MAIÚSCULA\` em qualquer arquivo.
    Isso torna o verificador cego a DUPLICAÇÃO — ele só detecta anonimato. Basta batizar
    o literal localmente para escapar. Foi assim que conexao.ts e identificador.ts
    sobreviveram com BANCO e FORMATOS.identificador mortos em shared/constantes.ts.
    Prova: \`const LIMITE_ESCONDIDO = 777\` passa limpo em qualquer arquivo de src/web/.
    Faça-o acusar quando o valor de uma const local já existe em algum *constantes.ts.

(c) A lista STATUS_HTTP (:60-63) é aplicada em QUALQUER posição, não só em posição de
    status. Prova: \`s.slice(0, 500)\`, \`s.padEnd(404, 'x')\` e \`s.slice(0, 200)\` passam
    sem achado. Isso não é hipotético: LIMITES.justificativa vale 500 e escrito inline
    como \`.max(500)\` seria invisível. Restrinja a isenção à posição de status —
    argumento de c.redirect, de renderizarErro, de c.json/c.text, valor de c.status.

O script precisa passar limpo no fim de TODA esta rodada, mas outros agentes ainda estão
consertando os arquivos agora. Então: escreva o verificador correto, rode-o para ver o
que ele acusa, e RELATE os achados no seu resumo — não conserte os outros arquivos você
mesmo, eles têm dono. Se ele acusar algo que é legítimo, corrija a REGRA, não crie
exceção pontual.`,
  },
];

const lacunas = await parallel(
  LACUNAS.map((l) => () =>
    agent(
      `${CONTEXTO}

SEU ESCOPO, e nada além dele: ${l.escopo}

${l.tarefa}

${PADRAO_DO_LIMITE}

${REGRAS}

Ao terminar, rode \`env -u FORCE_COLOR bunx tsc --noEmit\` e confirme que compila.
Se o seu escopo inclui template, rode também
\`env -u FORCE_COLOR bun test testes/web/golden.test.ts\` e confirme diff zero.
Se o golden acusar, você mudou uma tela: conserte, NUNCA regrave o golden.`,
      { label: `lacuna:${l.rotulo}`, phase: 'Lacunas', schema: RESULTADO, effort: 'high' },
    ),
  ),
);

const feitas = lacunas.filter(Boolean);
log(`${feitas.length}/${LACUNAS.length} lacunas fechadas.`);
for (const f of feitas) {
  if (f.pendencias) log(`PENDÊNCIA: ${f.pendencias.slice(0, 200)}`);
}

/* ------------------------------------------------------------------ *
 * FASE B — a consolidação semântica.
 *
 * Sozinha e sequencial: toca todos os *constantes.ts de uma vez, e
 * precisa da visão global para decidir quem é o dono de cada contrato.
 * ------------------------------------------------------------------ */

phase('Consolidar');

const consolidacao = await agent(
  `${CONTEXTO}

A fase anterior fechou as lacunas dos templates e do shared. Resumo do que fizeram:

${feitas.map((f) => `- ${f.resumo}`).join('\n')}

SEU ESCOPO: os arquivos *constantes.ts, os index.ts dos módulos, e os call sites que
você precisar ajustar por consequência. Você é o único agente rodando agora.

TRÊS PROBLEMAS DE PROPRIEDADE, em ordem de gravidade:

(1) CAMPOS TEM DOIS DONOS. src/web/constantes.ts:240-283 é uma segunda declaração
completa do nome de campo de formulário de quatro módulos:
  CAMPOS.login/senha/unidade/usuario   duplica src/identidade/constantes.ts:70-81
  CAMPOS.aluno/turma/disciplina/...    duplica src/academico/constantes.ts:61-91
  CAMPOS.comunicado                    duplica src/comunicacao/constantes.ts:38-45
  CAMPOS.bimestre/data                 duplica src/avaliacao/constantes.ts:74-75

É UM contrato só — o name= do HTML, a leitura do corpo na rota, e o \`campo\` de
falhaDeCampo que erroDe() casa no template. Concretamente hoje: secretaria.ts:383 lê
CAMPOS.vinculo.responsavelId de web/constantes enquanto vincularResponsavel.ts:50 emite
CAMPOS.vinculo.responsavelId de academico/constantes, e nada liga os dois — se um mudar,
o erro de validação para de aparecer na tela e nenhum teste acusa.

Os quatro index.ts JÁ reexportam (CAMPOS_DO_ACADEMICO, CAMPOS_DE_IDENTIDADE,
CAMPOS_DA_COMUNICACAO, CAMPOS_DA_AVALIACAO) e NENHUM é importado por ninguém. O caminho
legal pelo dependency-cruiser existe e está aberto. Use-o: o módulo de domínio é o dono,
web consome pelo index.ts.

(2) CODIGOS FUNDIDOS ONDE MENSAGENS FORAM SEPARADAS, em src/academico/constantes.ts.
CODIGOS.turmaNaoEncontrada (:104) serve matricular.ts:48, alocarProfessor.ts:39 e
transferir.ts:102 — mas transferir.ts:103 usa MENSAGENS.transferencia.turmaDestinoNaoEncontrada,
deliberadamente distinta, com docblock explicando que uniformizar mudaria a tela.
Mesmo padrão em CODIGOS.turmaDeOutroAno (:109) e CODIGOS.transferencia.matriculaNaoAtiva
(:124), este último servindo dois eventos distintos: a checagem prévia
(transferir.ts:86) e a corrida perdida no UPDATE (transferir.ts:38).

Se a recusa é distinta o bastante para exigir prosa própria, o código de máquina — que é
justamente o que a camada web compara e o teste afirma — são dois contratos, não um. O
critério aplicado foi "os valores são iguais hoje", que é a regra 2 ao contrário. O
próprio arquivo acertou em CAMPOS.turma.nome × CAMPOS.disciplina.nome e em
MENSAGENS.aluno.nomeLongo × MENSAGENS.turma.nomeLongo — só não aplicou em CODIGOS.

CUIDADO: separar um código muda o valor que a camada web compara. Verifique cada
consumidor e cada teste. Se o valor da string mudar, a tela pode mudar — e aí o golden
acusa. Comportamento idêntico é inegociável.

(3) DONOS ERRADOS E CONSTANTES ÓRFÃS.
  - src/academico/constantes.ts:49 ANO_EM_QUATRO_DIGITOS é política da camada web
    (validar o campo antes de converter para número). O acadêmico não a usa em lugar
    nenhum, o único consumidor importa a cópia de web/constantes.ts:398, e o
    academico/index.ts:112 a exporta como API pública. Remova do acadêmico.
  - src/web/constantes.ts:47 \`publico: '/publico/*'\` escrito à mão ao lado de
    ATIVOS.prefixoDeUrl (shared/constantes.ts:215) e PREFIXO_PUBLICO
    (web/constantes.ts:595). Quatro lugares dizem "publico"; derive de um.
  - src/web/constantes.ts:449 cita PAGINAS_DE_ERRO.naoEncontrada, chave que não existe
    no objeto (:472-491). Doc mentindo sobre o próprio arquivo.
  - Toda constante que continuar com ZERO consumidor depois do seu trabalho: ou ligue,
    ou apague. Constante criada e nunca usada é pior que literal — mente sobre onde a
    verdade mora. Rode a busca você mesmo para achá-las.

${REGRAS}

Ao terminar, rode nesta ordem e confirme cada uma:
  env -u FORCE_COLOR bunx tsc --noEmit
  env -u FORCE_COLOR bun run check
  env -u FORCE_COLOR bun test
A suíte tem 714 testes verdes e o golden 75 telas sem diff. Toda falha é regressão sua.
JAMAIS regrave o golden e JAMAIS afrouxe um teste.`,
  { label: 'consolidar', phase: 'Consolidar', schema: RESULTADO, effort: 'high' },
);

log(`Consolidação: ${consolidacao?.arquivosAlterados?.length ?? 0} arquivos.`);

/* ------------------------------------------------------------------ *
 * FASE C — a prova.
 * ------------------------------------------------------------------ */

phase('Provar');

const veredito = await agent(
  `${CONTEXTO}

A segunda passada do refactor acabou de ser aplicada por 7 agentes. Sua tarefa é PROVAR
que nada quebrou e consertar o que quebrou.

Na ordem, consertando antes de seguir:
1. \`bunx tsc --noEmit\`
2. \`bun run check\` — dependency-cruiser, 0 violações
3. \`bun test\` — 714 testes eram verdes antes desta rodada. Toda falha é regressão
   introduzida agora: conserte o CÓDIGO, jamais afrouxe o teste.
4. O golden de 75 telas precisa dar diff zero. Diff = uma tela mudou, o que este
   refactor proibiu. JAMAIS rode \`bun run golden --regravar\`.
5. \`bun scripts/magic-values.ts\` — agora com as três correções da fase anterior
   (varre .eta, detecta duplicação, restringe a isenção de status HTTP). Precisa sair
   limpo. Se acusar literal legítimo, extraia-o para o dono. Se acusar falso positivo,
   corrija a REGRA no script, nunca crie exceção pontual.
6. \`bun run verify\` inteiro, exit 0.

${REGRAS}

Relate o resultado exato de cada comando, com números.`,
  { label: 'verify', phase: 'Provar', effort: 'high' },
);

const critico = await agent(
  `${CONTEXTO}

A segunda passada terminou. Você é o CRÍTICO DE COMPLETUDE. NÃO edite nenhum arquivo.

A primeira passada foi reprovada por estes defeitos. Confirme, um por um, se cada um
foi realmente corrigido — com arquivo:linha como evidência, não com a palavra de quem
disse ter consertado:

  a) nove .eta redeclaravam limites em vez de recebê-los do handler
  b) comunicados/novo.eta tinha 5 rotas hardcoded
  c) _layout_publico.eta montava o caminho do CSS à mão
  d) conexao.ts, identificador.ts, pagina.ts com const local e dono órfão
  e) CAMPOS declarado em dois lugares
  f) CODIGOS fundido onde MENSAGENS foi separado
  g) o lint não varria .eta, isentava const MAIÚSCULA, e aplicava STATUS_HTTP em
     qualquer posição

Depois responda:
  1. Que magic value dentro do escopo AINDA escapa? Rode buscas próprias, não confie
     no relato dos outros agentes nem no lint.
  2. Alguma constante continua com zero consumidor?
  3. Algum .eta ainda tem href/action hardcoded, ou limite redeclarado?
  4. O lint agora pega os três casos que provaram falso negativo? Teste empiricamente:
     insira temporariamente um literal de cada tipo, rode o script, confirme que acusa,
     e REVERTA o arquivo ao estado original.

${REGRAS}

Seja específico e cético. Nada de elogio. "Nenhum" é resposta válida e desejável.`,
  { label: 'critico', phase: 'Provar', effort: 'high' },
);

return {
  lacunas: feitas.map((f) => f.resumo),
  pendencias: feitas.map((f) => f.pendencias).filter(Boolean),
  consolidacao: consolidacao?.resumo,
  veredito,
  critico,
};
