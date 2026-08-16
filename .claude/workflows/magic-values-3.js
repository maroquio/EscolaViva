export const meta = {
  name: 'magic-values-3',
  description: 'Terceira passada: código de erro fundido, buraco do lint e o vocabulário de apresentação',
  whenToUse: 'Depois de magic-values-2, para fechar a cauda que o crítico apontou.',
  phases: [
    { title: 'Fechar', detail: 'defeitos e vocabulário — partição por arquivo' },
    { title: 'Provar', detail: 'golden idêntico, suíte verde, lint estrito sem furo' },
  ],
};

const CONTEXTO = `
REPOSITÓRIO: EscolaViva — Bun + Hono + Eta + Postgres. Material didático (TEES2).
Os bancos Docker estão de pé. Rode SEMPRE com \`env -u FORCE_COLOR\`.

SITUAÇÃO: duas passadas de refactor de magic values já rodaram e estão COMMITADAS
(HEAD = 0286aa6). O working tree está limpo. A infraestrutura existe e funciona:

  src/academico|identidade|avaliacao|comunicacao/constantes.ts   LIMITES, CAMPOS, CODIGOS, MENSAGENS
  src/shared/constantes.ts       BANCO, FORMATOS, ATIVOS, CAMPO_CHAVE, CAMINHOS_DE_ENTRADA
  src/web/constantes.ts          ROTAS, TEMPLATES, TITULOS, CAMPOS, AVISOS, APRESENTACAO, DOCUMENTO
  src/web/rotas/mapa.ts          grupo() + Params<S>
  scripts/magic-values.ts        o verificador, no \`bun run verify\`

ESTADO: \`bun run verify\` sai 0 — 714 testes verdes, depcruise limpo (118 módulos),
golden de 75 telas com diff zero. NÃO PODE REGREDIR.

O GOLDEN É A LINHA VERMELHA. testes/web/golden.test.ts compara o HTML de todas as 75
telas com o que foi congelado antes do refactor. Diff = você mudou uma tela, o que este
trabalho proíbe. JAMAIS rode \`bun run golden --rewrite\`.
`;

const REGRAS = `
REGRAS:

1. FONTE ÚNICA POR MÓDULO. Um módulo só enxerga outro pelo index.ts dele
   (regra 'no-cross-module-shortcut' do dependency-cruiser). O que atravessa a
   fronteira precisa estar reexportado pelo index.ts do dono.

2. MERGE POR CONCEITO, NUNCA POR VALOR. Dois literais só viram a mesma constante quando
   mudam juntos por definição. Valor igual hoje não é motivo para fundir.

3. FORA DO ESCOPO: status HTTP, nomes de tabela/coluna SQL, quantificadores de regex,
   0 e 1, dados de seed, testes/** inteiro, e o corpo de
   src/web/templates/parciais/_script_avisos.eta (viaja para o navegador; literal ali é
   a forma correta).

4. COMPORTAMENTO NÃO MUDA. Refactor puro. Um byte diferente no HTML é falha, não melhoria.

5. NUNCA rode git add, git commit, git push, git checkout nem \`golden --rewrite\`.

6. NÃO edite arquivo fora do seu escopo — outros agentes trabalham em paralelo agora.
   Ler qualquer arquivo é permitido e recomendado.

7. CONSTANTE ÓRFÃ É PIOR QUE LITERAL. Uma constante criada e nunca consumida mente sobre
   onde a verdade mora: quem lê acredita nela. Ao terminar, toda chave do seu escopo ou
   tem consumidor, ou foi apagada.
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

phase('Fechar');

const FRENTES = [
  {
    rotulo: 'codigos-avaliacao',
    escopo:
      'src/avaliacao/constantes.ts, src/avaliacao/aplicacao/lancarNotas.ts, ' +
      'src/avaliacao/aplicacao/registrarChamada.ts, src/avaliacao/index.ts',
    tarefa: `DEFEITO: um código de erro servindo duas recusas diferentes.

src/avaliacao/constantes.ts:86,87 mantém CODIGOS.matriculaForaDaTurma e
CODIGOS.matriculaRepetida planos e únicos, enquanto MENSAGENS já foi separado em
notas.* e chamada.* (linhas 111-113 e 120-125). O uso prova a fusão:

  lancarNotas.ts:109,116       emite CODIGOS.matriculaForaDaTurma
                               com MENSAGENS.notas.matriculaForaDaTurma ("…no lançamento.")
  registrarChamada.ts:102,109  emite O MESMO CÓDIGO
                               com MENSAGENS.chamada.matriculaForaDaTurma ("…na chamada.")

Se a recusa é distinta o bastante para exigir prosa própria, o código de máquina — que é
justamente o que a camada web compara e o que o teste afirma — são dois contratos, não um.
O critério aplicado foi "os valores são iguais hoje", que é a regra 2 ao contrário.

O acadêmico já resolveu esse mesmo caso e é o seu modelo: veja
src/academico/constantes.ts:127-135, onde transferencia.turmaDestinoNaoEncontrada é uma
chave separada de CODIGOS.turmaNaoEncontrada, e somenteAtivaTransfere/perdeuACorrida são
duas chaves com o MESMO VALOR de string.

ATENÇÃO — é isto que torna a mudança segura: separe em duas CHAVES mantendo o MESMO
VALOR de string. O valor emitido não pode mudar, senão a camada web compara outra coisa,
a tela muda e o golden acusa. Você está separando o contrato, não renomeando o código.

Faça a mesma análise para as demais chaves de CODIGOS deste módulo: qualquer uma que
sirva dois casos de uso com mensagens distintas está no mesmo erro.`,
  },
  {
    rotulo: 'lint',
    escopo: 'scripts/magic-values.ts',
    tarefa: `DEFEITO: o verificador tem um buraco grande o bastante para uma rota passar.

\`declaracaoNomeada\` protege a SUBÁRVORE INTEIRA (scripts/magic-values.ts:551-563), e
dentro dela só roda \`donoDuplicado\`, que exige coincidência de NOME (\`mesmoNome\`,
:488-494). Consequência: qualquer literal enterrado sob uma \`const\` MAIÚSCULA num .ts
fora de constantes.ts é invisível. Comprovado empiricamente — este bloco passa hoje com
ZERO achados:

  export const TABELA_DE_APOIO = {
    rotulo: 'Cadastrar aluno',                     // cópia exata de TITULOS.secretaria.alunoNovo
    recorte: (t: string): string => t.slice(0, 37),// literal numérico anônimo
    prazo: 987654,                                 // literal numérico anônimo
    endereco: '/secretaria/alunos/novo',           // rota escrita à mão
  };

E também passam: \`const LIMITE_DE_NOME_DO_ALUNO = 120\` e
\`const ROTULO_DA_TELA = 'Cadastrar aluno'\` — basta renomear a cópia para escapar.

O docblock do próprio arquivo (:17-21) promete o contrário. Ele fechou o caso que já
tinha acontecido (MAX_CONEXOES), não a classe.

CONSERTE: a isenção deve valer para a DECLARAÇÃO em si (o nome batiza aquele valor), não
para tudo que estiver aninhado sob ela. Literal dentro do corpo de função, dentro de
objeto aninhado, ou que seja rota/título/limite com dono conhecido, precisa ser acusado
mesmo sob uma const MAIÚSCULA.

Mais dois itens, ambos de documentação divergindo da implementação:

(b) :87-99 afirma que a isenção de _script_avisos.eta "é do CONTEÚDO, não do arquivo",
    mas :786 faz \`if (TEMPLATES_ISENTOS.has(arquivo)) continue;\` e pula o arquivo
    inteiro. Um href acrescentado FORA do <script> não seria visto. Implemente o que o
    comentário promete: isente o conteúdo do bloco <script>, varra o resto do arquivo.

(c) ARQUIVOS_DE_DECLARACAO (:80) isenta src/web/rotas/mapa.ts da varredura, e esse
    arquivo tem lógica de verdade (\`juntar\`, \`preencher\`), não só declarações. Restrinja
    a isenção ao que é declaração.

Outros agentes estão consertando arquivos agora. Escreva o verificador correto, rode-o,
e RELATE o que ele acusa — não conserte os arquivos dos outros. Se ele acusar algo
legítimo, corrija a REGRA, nunca crie exceção pontual.

Prove o conserto: rode o bloco TABELA_DE_APOIO acima numa cópia em scratchpad, confirme
que agora acusa os quatro, e reverta.`,
  },
  {
    rotulo: 'layouts-e-navegacao',
    escopo:
      'src/web/constantes.ts, src/web/templates/_layout.eta, ' +
      'src/web/templates/_layout_publico.eta, src/web/templates/parciais/*.eta, ' +
      'src/web/app.ts, src/web/render.ts, src/shared/http/erros.ts',
    tarefa: `Você é o ÚNICO agente autorizado a escrever em src/web/constantes.ts nesta rodada.

(1) DOZE CHAVES COM ZERO CONSUMIDOR. Ou ligue, ou apague — constante órfã mente sobre
onde a verdade mora (regra 7). Todas em src/web/constantes.ts:

  DOCUMENTO.idioma / .esquemaDeCor / .robots / .idDoConteudo   (:617-621)
    cópias vivas: 'pt-BR' em _layout.eta:24, _layout_publico.eta:19 e shared/http/erros.ts:45
                  'light' em _layout.eta:28, _layout_publico.eta:23
                  'noindex, nofollow' em _layout.eta:29, _layout_publico.eta:24
                  'conteudo' em _layout.eta:35,41 e _layout_publico.eta:30,33

  APRESENTACAO.sufixoDoTitulo / .marca / .subtituloPublico / .rodapePublico   (:538-541)
    cópias vivas: ' · EscolaViva' em _layout.eta:30, _layout_publico.eta:25
                  'Escola<em>Viva</em>' em _layout_publico.eta:35, parciais/_cabecalho.eta:17
                  subtítulo e rodapé em _layout_publico.eta:36,43

  TEMPLATES.parciais.icone / .cabecalho / .navegacao / .mensagens / .scriptAvisos  (:164-168)
    Morrem porque os dois layouts incluem por caminho literal — _layout.eta:32,38,39,42,47
    e _layout_publico.eta:27,39,48 — e não recebem it.parciais. As outras duas chaves do
    mesmo objeto (vazio, paginacao) têm 23 e 16 usos: a constante foi ligada pela metade.

(2) PAINEL_POR_PAPEL REDIGITA OS QUATRO PAPÉIS. src/web/constantes.ts:148-151 escreve
'admin_rede', 'secretaria', 'professor', 'responsavel' à mão, enquanto PAPEL é o dono
(src/identidade/constantes.ts:29-34, reexportado em src/identidade/index.ts:61) e o
próprio web/constantes.ts:17-21 JÁ importa de ../identidade. É a mesma falha que o
docblock de CAMPOS (:258-268) declara ter corrigido, deixada intacta na tabela vizinha.

(3) parciais/_navegacao.eta:19-45 REESCREVE 13 RÓTULOS que são cópia byte a byte de
TITULOS: 'Painel da rede', 'Unidades', 'Usuários', 'Anos letivos', 'Painel da
secretaria', 'Alunos', 'Responsáveis', 'Turmas', 'Disciplinas', 'Minhas turmas', 'Meus
alunos', 'Comunicados', 'Trocar senha'. E :19,25,32,35,39,42 escreve os quatro papéis
mais dez vezes.

O parcial é incluído pelo layout, então o caminho para levar valor até ele passa pelo
que o layout recebe. Decida a forma e documente a decisão no comentário.

ATENÇÃO MÁXIMA: _layout.eta e _layout_publico.eta entram nas 75 telas do golden. Um byte
a mais aqui reprova tudo. NÃO toque no corpo do <script> de parciais/_script_avisos.eta.`,
  },
  {
    rotulo: 'telas-e-sobras',
    escopo:
      'src/web/templates/{secretaria,rede,professor,responsavel,conta,comunicados}/*.eta, ' +
      'src/web/templates/{login,erro}.eta, e as rotas em src/web/rotas/*.ts ' +
      '(EXCETO src/web/rotas/mapa.ts e src/web/rotas/index.ts)',
    tarefa: `(1) ~22 <h1> DE TELA REPETEM UM VALOR DE TITULOS: 'Cadastrar aluno', 'Vincular
responsável', 'Alocar disciplina e professor', 'Transferir de turma', 'Criar unidade',
'Definir ano letivo', e outros. O docblock de TITULOS (src/web/constantes.ts:326-330)
reconhece a duplicação em presente — "Cadastrar aluno está escrito seis vezes hoje" — e
ela continua assim.

Investigue primeiro COMO o título já chega ao layout para virar <title>: é provável que
a rota já passe o valor e o template só precise lê-lo, sem nenhuma mudança de handler.
Descubra antes de inventar caminho novo.

(2) name="_chave" ESCRITO À MÃO EM 19 .eta, enquanto CAMPO_CHAVE existe
(src/shared/constantes.ts:203) e é lido por src/shared/http/idempotencia.ts:54 — os dois
lados do mesmo contrato, um deles copiado. Os mesmos 19 templates já recebem it.chave (o
valor) e não recebem o nome do campo. O docblock da constante ainda diz "casado com 13
.eta": está desatualizado em 6, corrija-o também.

(3) TRÊS SOBRAS:
  - src/web/rotas/professor.ts:165 \`const MEIO_DIA_UTC = 'T12:00:00Z'\` mora numa rota,
    enquanto a irmã MEIA_NOITE_UTC = 'T00:00:00Z' mora em src/avaliacao/constantes.ts:68.
    Duas decisões do mesmo tipo, uma no dono e a outra solta.
  - comunicados/novo.eta:115 \`rows="10"\` — o 10 tem dono; encontre-o.
  - responsavel/frequencia.eta:75 "São necessários 75 % de presença", enquanto
    APROVACAO.frequenciaMinimaEmCentesimos = 7500 (src/avaliacao/constantes.ts:57). A
    rota irmã src/web/rotas/responsavel.ts:89 JÁ sabe derivar esse texto do dono — use o
    mesmo caminho.

NÃO escreva em src/web/constantes.ts — outro agente é o dono dele nesta rodada. Ler é
permitido e necessário.`,
  },
];

const frentes = await parallel(
  FRENTES.map((f) => () =>
    agent(
      `${CONTEXTO}

SEU ESCOPO, e nada além dele: ${f.escopo}

${f.tarefa}

${REGRAS}

Ao terminar, rode e confirme:
  env -u FORCE_COLOR bunx tsc --noEmit
  env -u FORCE_COLOR bun run check
  env -u FORCE_COLOR bun test testes/web/golden.test.ts   (se tocou template ou rota)

Se o golden acusar, você mudou uma tela: conserte o código. NUNCA regrave o golden.

NOTA SOBRE O BANCO: outros agentes usam o mesmo banco de teste e podem causar
'deadlock detected' ou violação de chave estrangeira no meio da sua corrida — isso é
contenção de ambiente, não regressão do seu código. Se acontecer, crie um banco isolado
no mesmo container via TEST_DATABASE_URL, use-o, e o DROPE ao terminar.`,
      { label: `frente:${f.rotulo}`, phase: 'Fechar', schema: RESULTADO, effort: 'high' },
    ),
  ),
);

const feitas = frentes.filter(Boolean);
log(`${feitas.length}/${FRENTES.length} frentes fechadas.`);
for (const f of feitas) if (f.pendencias) log(`PENDÊNCIA: ${f.pendencias.slice(0, 200)}`);

phase('Provar');

const veredito = await agent(
  `${CONTEXTO}

A terceira passada acabou de ser aplicada por 4 agentes. PROVE que nada quebrou e
conserte o que quebrou. Resumo do que fizeram:

${feitas.map((f) => `- ${f.resumo}`).join('\n')}

Na ordem, consertando antes de seguir:
1. \`bunx tsc --noEmit\`
2. \`bun run check\` — 0 violações
3. \`bun test\` — 714 testes eram verdes. Toda falha é regressão desta rodada: conserte o
   CÓDIGO, jamais afrouxe o teste.
4. Golden das 75 telas com diff zero. JAMAIS regrave.
5. \`bun scripts/magic-values.ts\` — agora sem a proteção de subárvore. Ele vai acusar
   coisa que antes escondia. Extraia cada achado legítimo para o dono. Se for falso
   positivo, corrija a REGRA no script, nunca crie exceção pontual.
6. \`bun run verify\` inteiro, exit 0.

${REGRAS}

Relate o resultado exato de cada comando, com números.`,
  { label: 'verify', phase: 'Provar', effort: 'high' },
);

const critico = await agent(
  `${CONTEXTO}

Terceira e última passada concluída. Você é o CRÍTICO DE COMPLETUDE. NÃO edite arquivo.

Confirme, com arquivo:linha como evidência e buscas suas — nunca a palavra de quem disse
ter consertado — se cada item foi realmente fechado:

  a) CODIGOS de avaliacao separado por conceito, mantendo o mesmo valor de string
  b) o lint deixou de proteger a subárvore inteira sob const MAIÚSCULA
  c) o lint isenta o CONTEÚDO do <script> de _script_avisos.eta, não o arquivo
  d) as 12 chaves órfãs (DOCUMENTO.*, APRESENTACAO.*, TEMPLATES.parciais.*) ligadas ou apagadas
  e) PAINEL_POR_PAPEL derivando de PAPEL
  f) os 13 rótulos de _navegacao.eta e os ~22 <h1> lendo TITULOS
  g) name="_chave" vindo de CAMPO_CHAVE nos 19 templates
  h) MEIO_DIA_UTC, rows="10" e o texto dos 75 % com dono

Depois, teste o lint EMPIRICAMENTE numa cópia da árvore em scratchpad (nunca no
repositório) e reverta ao terminar. Confirme que ele ACUSA cada um destes:

  export const TABELA_DE_APOIO = {
    rotulo: 'Cadastrar aluno',
    recorte: (t: string): string => t.slice(0, 37),
    prazo: 987654,
    endereco: '/secretaria/alunos/novo',
  };
  const LIMITE_DE_NOME_DO_ALUNO = 120;
  const ROTULO_DA_TELA = 'Cadastrar aluno';

E confirme que ele NÃO acusa: c.redirect(x, 303), .max(0), quantificador {4} em regex,
e o corpo do <script> de _script_avisos.eta.

Por fim: sobrou alguma constante com zero consumidor em qualquer *constantes.ts? Rode a
busca você mesmo.

${REGRAS}

Seja específico e cético. "Nenhum" é resposta válida e desejável.`,
  { label: 'critico', phase: 'Provar', effort: 'high' },
);

return { frentes: feitas.map((f) => f.resumo), veredito, critico };
