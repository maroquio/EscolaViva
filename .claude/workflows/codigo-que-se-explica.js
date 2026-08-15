export const meta = {
  name: 'codigo-que-se-explica',
  description: 'O que o comentário avisava passa a ser nome, tipo ou teste — e sai o comentário de CSS e shell',
  whenToUse: 'Depois de remover comentário, para o aviso não depender de alguém ler prosa.',
  phases: [
    { title: 'Dizer', detail: 'nome e teste carregam o que a prosa carregava' },
    { title: 'Provar', detail: 'a armadilha quebra o build, e o golden não se move' },
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
  - NÃO toque em docs/.

ESTADO: \`bun run verificar\` sai 0 — 714 testes, depcruise limpo, golden de 75 telas com
diff zero, verificador de magic values limpo.

DECISÃO JÁ TOMADA E EM VIGOR: o código deste repositório NÃO carrega comentário. 6.233
linhas foram removidas; restam 15, todas diretiva. NÃO escreva comentário novo em lugar
nenhum — nem docblock, nem linha, nem bloco. As duas exceções que permanecem são
\`// magic-values: permitido — <motivo>\`, que \`scripts/magic-values.ts\` parseia, e o campo
\`comment:\` do dependency-cruiser, que é valor de configuração.
`;

const PRINCIPIO = `
O PRINCÍPIO DESTA PASSADA: o que o comentário avisava passa a ser dito pelo NOME, pelo
TIPO ou por um TESTE. Teste não é comentário — não pode divergir do código, porque quebra.
Nome não é comentário — não pode mentir sem que a leitura estranhe.

Onde a escolha for entre "escrever um teste" e "não avisar", escreva o teste. Onde for
entre "renomear" e "comentar", renomeie. Comentar não é opção.
`;

const REGRAS = `
REGRAS:

1. NENHUM COMENTÁRIO NOVO. Em nenhum arquivo, em nenhuma linguagem, em nenhuma forma.
2. COMPORTAMENTO NÃO MUDA. As 75 telas do golden saem byte a byte idênticas. JAMAIS
   \`golden --regravar\`.
3. Teste novo vai em \`testes/\`, no idioma dos que já existem. Teste que não falharia se o
   defeito acontecesse é decoração: prove que ele falha antes de entregar.
4. NUNCA rode comando de git.
5. NÃO edite arquivo fora do seu escopo — outros agentes trabalham em paralelo.
6. Se o conserto exigir mudar comportamento, PARE e relate em \`pendencias\`.
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

phase('Dizer');

const FRENTES = [
  {
    rotulo: 'unidade-no-nome',
    escopo:
      'src/academico/constantes.ts, src/academico/index.ts, e os arquivos que consomem ' +
      'o valor renomeado (encontre-os por grep antes de mexer)',
    tarefa: `RISCO MEDIDO: em \`LIMITES\`, \`busca: 50\` está encostado em \`nome: 120\` e as duas
unidades são diferentes — \`nome\` é tamanho de texto em caracteres, \`busca\` é QUANTIDADE DE
LINHAS que a consulta devolve quando o chamador não pede página. Vira \`LIMIT\` em
\`src/academico/infra/alunoRepositorio.ts\`. Sem o comentário que os separava, nada no código
distingue as duas unidades, e trocar um pelo outro é o engano que a vizinhança convida.

CONSERTO: dê ao valor um nome que carregue a unidade. \`linhasDaBusca\`, \`teto\`,
\`maximoDeLinhas\` — escolha e justifique a escolha no RESUMO, não no código. Ajuste todos os
consumidores.

Varra o resto de \`LIMITES\` e dos outros \`constantes.ts\` do seu escopo procurando o mesmo
defeito: valor cuja unidade não está no nome e cuja vizinhança sugere outra unidade.
Relate o que achou mesmo que não conserte.`,
  },
  {
    rotulo: 'isencao-do-script',
    escopo: 'scripts/magic-values.ts e testes/web/ (arquivo novo)',
    tarefa: `RISCO MEDIDO: \`TEMPLATES_COM_SCRIPT_ISENTO\` é hoje um \`Set\` de um elemento sem
nada que diga por que existe — lê como configuração morta. Ele isenta o corpo do \`<script>\`
de \`src/web/templates/parciais/_script_avisos.eta\`, que viaja para o navegador: extrair
aqueles literais para constantes acrescenta linhas ao HTML de TODA tela do sistema.

Quem limpar "config não usada" apaga a entrada, o verificador passa a acusar o corpo do
script, alguém extrai os literais, e as 75 telas mudam de uma vez.

DOIS CONSERTOS, e quero os dois:
  1. NOME. Faça o identificador dizer por que a isenção existe — algo na linha de
     \`TEMPLATES_CUJO_SCRIPT_VIRA_HTML\`. Sem comentário.
  2. TESTE. Escreva em \`testes/web/\` um teste que falhe se a isenção sumir. Ele deve
     provar a consequência, não a configuração: renderize a tela, ou rode o verificador
     contra o template, de modo que remover a entrada faça o teste vermelho com uma
     mensagem que explique o estrago. PROVE que ele falha — remova a entrada, rode, veja
     vermelho, reponha.`,
  },
  {
    rotulo: 'limites-nao-se-fundem',
    escopo: 'testes/academico/ ou testes/shared/ (arquivo novo), somente teste',
    tarefa: `RISCO MEDIDO, e é a decisão que sustentou nove passadas de refactor:

    aluno:       { nome: 120 }
    disciplina:  { nome: 120 }
    responsavel: { nome: 120, ... }
    turma:       { nome: 60, serie: 60 }

Os três \`120\` são TRÊS POLÍTICAS INDEPENDENTES que só concordam hoje. \`turma.nome: 60\` era
a prova disso, e o comentário removido dizia: se as quatro virassem uma constante só, "essa
quarta teria sido corrigida para 120 em nome da consistência, e o formulário de turma
passaria a aceitar um nome que o banco recusa".

Sem o comentário, consolidar é a leitura óbvia de quem chega agora.

CONSERTO: um teste que falhe se alguém fundir. Ele NÃO pode ser um teste de valor —
\`expect(LIMITES.aluno.nome).toBe(120)\` congela o número e impede mudança legítima, que é o
oposto do que se quer. O que precisa falhar é a FUSÃO: que os quatro limites de nome
continuem sendo quatro entradas distintas, e que mudar um não mova os outros.

Pense em como provar isso em TypeScript e escolha a forma; algumas direções, não uma
receita: comparar identidade de referência, verificar que o objeto tem as chaves separadas,
ou um teste de tipo. A mensagem de falha precisa ENSINAR — quem a ler tem que entender por
que a fusão é o defeito, já que não há comentário para explicar.

PROVE que o teste falha: funda os limites numa cópia, rode, veja vermelho, desfaça.

Escreva SÓ o teste. NÃO mexa em \`constantes.ts\` — outro agente está nele.`,
  },
  {
    rotulo: 'css-e-shell',
    escopo: 'src/web/publico/app.css, scripts/backup.sh, scripts/restore-test.sh',
    tarefa: `A remoção de comentário parou nas fronteiras de linguagem. A decisão é sobre
código, não sobre extensão de arquivo: hoje o repositório tem duas normas conforme o
arquivo, o que é pior que qualquer uma das duas sozinha.

REMOVA:
  src/web/publico/app.css        63 blocos \`/* */\`
  scripts/backup.sh              29 linhas \`#\`
  scripts/restore-test.sh        25 linhas \`#\`

FICA: a primeira linha \`#!\` dos dois shell — é o interpretador, não comentário. Remover
quebra a execução.

CUIDADO NO CSS: \`app.css\` é construído por \`scripts/build-assets.ts\` e servido com hash no
nome. O conteúdo entregue muda de tamanho, e o hash muda — confira se algum teste ou o
golden dependem do nome do arquivo publicado. Se o golden acusar, entenda por quê antes de
mexer: se for só o hash, o teste que o normaliza precisa continuar normalizando; se for
outra coisa, você mudou a tela.

CUIDADO NO SHELL: comentário dentro de \`heredoc\` (\`<<EOF\`) é CONTEÚDO, não comentário —
sai no arquivo gerado. Verifique antes de remover.`,
  },
];

const frentes = await parallel(
  FRENTES.map((f) => () =>
    agent(
      `${CONTEXTO}

${PRINCIPIO}

SEU ESCOPO, e nada além dele: ${f.escopo}

${f.tarefa}

${REGRAS}

Ao terminar:
  env -u FORCE_COLOR bunx tsc --noEmit
  env -u FORCE_COLOR bun run check
  env -u FORCE_COLOR bun test   (em banco isolado)  → 714 verdes + os seus
  env -u FORCE_COLOR bun test testes/web/golden.test.ts → diff ZERO
  env -u FORCE_COLOR bun scripts/magic-values.ts → não pode piorar`,
      { label: `diz:${f.rotulo}`, phase: 'Dizer', schema: RESULTADO, effort: 'high' },
    ),
  ),
);

const feitas = frentes.filter(Boolean);
log(`${feitas.length}/${FRENTES.length} frentes.`);
const pendencias = feitas.map((f) => f.pendencias).filter(Boolean);
for (const p of pendencias) log(`PENDÊNCIA: ${p.slice(0, 200)}`);

phase('Provar');

const veredito = await agent(
  `${CONTEXTO}

${PRINCIPIO}

Quatro agentes acabaram de trabalhar. PROVE que nada quebrou e conserte o que quebrou.

1. \`bunx tsc --noEmit\`
2. \`bun run check\` — 0 violações
3. \`bun test\` num banco isolado — eram 714 verdes, mais os testes novos desta passada.
4. Golden das 75 telas com diff ZERO. JAMAIS regrave.
5. \`bun scripts/magic-values.ts\` limpo.
6. \`bun run verificar\` exit 0.
7. CONFIRA QUE NENHUM COMENTÁRIO NOVO ENTROU: varra src/ e scripts/ e confirme que só
   restam as diretivas. Um agente pode ter "explicado" a renomeação com um docblock.

${pendencias.length ? `PENDÊNCIAS relatadas:\n${pendencias.join('\n---\n')}` : ''}

${REGRAS}

Relate o resultado exato de cada comando, com números.`,
  { label: 'verificar', phase: 'Provar', effort: 'high' },
);

const critico = await agent(
  `${CONTEXTO}

${PRINCIPIO}

Você é o CRÍTICO. NÃO edite arquivo. Meça, não confira lista.

1. Os testes novos FALHAM de verdade quando o defeito acontece? Numa cópia em scratchpad
   (apague ao fim): funda os quatro limites de nome numa constante só — o teste precisa
   ficar vermelho. Remova a entrada da isenção do script — o outro teste precisa ficar
   vermelho. Se algum passar verde com o defeito presente, ele é decoração e você deve
   dizer isso sem rodeio.

2. A mensagem de falha ENSINA? Sem comentário no código, ela é a única coisa que resta
   para explicar por que a fusão é defeito. Cite o texto e diga se alguém que nunca viu
   este repositório entenderia.

3. Entrou comentário novo em algum lugar? Varra por AST no .ts e por parser da Eta.
   Classifique cada sobrevivente: diretiva, ou comentário que escapou.

4. A renomeação alcançou todos os consumidores, ou sobrou algum lugar lendo o nome antigo
   por string? Procure por grep além do que o compilador pega.

5. CSS e shell: o comentário saiu inteiro? Algum \`#\` removido era conteúdo de heredoc?
   O hash do CSS publicado mudou, e alguma coisa dependia dele?

6. Que OUTRO lugar do repositório tem o mesmo defeito dos três consertados — valor cuja
   unidade não está no nome, configuração que lê como morta, ou decisão que só o
   comentário removido sustentava? Meça, não suponha. Cite arquivo:linha.

7. Se você escrevesse a próxima passada, o que ela consertaria? "Nada" é resposta válida e
   desejável, desde que verdadeira. Declare qual risco você correu: "nenhum" falso, ou
   lista inflada.

${REGRAS}

Seja específico e cético. Cite arquivo:linha sempre.`,
  { label: 'critico', phase: 'Provar', effort: 'high' },
);

return { frentes: feitas.map((f) => f.resumo), pendencias, veredito, critico };
