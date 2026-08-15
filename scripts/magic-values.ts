/**
 * O verificador de valores mágicos: falha quando um literal solto reaparece no código.
 *
 * Este script existe porque o refactor de constantes não se sustenta sozinho. Extrair 400 literais
 * é trabalho de uma tarde; o 401º entra na semana seguinte, numa revisão apressada, e a partir daí
 * a resposta para "quantos caracteres cabem no nome da turma?" volta a ser "depende de qual dos
 * quatro lugares você abriu". Uma regra que só existe no combinado verbal já foi quebrada — é
 * exatamente por isso que `.dependency-cruiser.js` existe, e este arquivo é o mesmo raciocínio
 * aplicado ao valor em vez da seta.
 *
 * Ele cobra três coisas, e as três são modos de falha distintos:
 *
 *   1. LITERAL SOLTO — um literal em posição de expressão que ninguém nomeou: `slice(0, 10)`,
 *      `'Cadastrar aluno'`, `` `${prefixo}/*` ``. Um literal que é o VALOR de uma `const MAIUSCULA`
 *      não é solto: ele tem nome, e o nome é a documentação.
 *
 *      A isenção é da DECLARAÇÃO, e termina onde a declaração termina. `const NOME_MAXIMO = 120` é
 *      um nome para um valor; `const TABELA = { rotulo: '…', recorte: (t) => t.slice(0, 37) }` é
 *      uma TABELA DE CONSTANTES, e tabela de constantes mora num `constantes.ts` — fora dele ela é
 *      a segunda fonte da verdade que este script existe para fechar. Por isso a isenção atravessa
 *      operador e chamada (`const FAIXA = 10 ** DIGITOS`, `const METADE = Math.floor(x / 2)` — o
 *      nome batiza a conta inteira) e PARA em três lugares: no `{` de um objeto, no `[` de um
 *      arranjo e no corpo de uma função. Ali dentro já não é um valor batizado, é conteúdo, e
 *      conteúdo é cobrado como em qualquer outro lugar.
 *
 *      Isto já foi ao contrário: a isenção valia para a subárvore inteira, e bastava enterrar o
 *      literal sob uma `const` MAIÚSCULA — num objeto, num arranjo, dentro de uma arrow — para
 *      ficar invisível. Um `endereco: '/secretaria/alunos/novo'` escrito à mão passava calado.
 *
 *   2. VALOR DUPLICADO — o literal batizado localmente que repete um valor que já tem dono num
 *      `constantes.ts`. Cobrar só anonimato deixaria a porta escancarada: bastava batizar a cópia
 *      para escapar, e foi assim que `MAX_CONEXOES = 10` conviveu com `BANCO.maxConexoes` e
 *      `FORMATO_DE_ID` conviveu com `FORMATOS.identificador` — as duas constantes de
 *      `shared/constantes.ts` mortas, sem ninguém as importando, e o verificador em silêncio.
 *
 *      Esta regra roda em TODO literal, batizado ou não, e é ela que fecha o outro escape: renomear
 *      a cópia. `const LIMITE_DE_NOME_DO_ALUNO = 120` diz exatamente o que `LIMITES.aluno.nome` já
 *      dizia, e `const ROTULO_DA_TELA = 'Cadastrar aluno'` é a frase de `TITULOS.secretaria.alunoNovo`
 *      copiada palavra por palavra. Nenhum dos dois é anônimo, e os dois são segunda fonte.
 *
 *   3. LITERAL EM `.eta` — os 44 templates estão dentro da varredura, e não fora. É neles que mora
 *      o modo de falha que o docblock de `web/rotas/mapa.ts` descreve: link quebrado em `.eta` não
 *      quebra compilação, quebra a tela de quem está usando o sistema. O template não passa pelo
 *      compilador, então o compilador não pode ser a rede — este script é.
 *
 * As exceções abaixo são a regra 6 do refactor, e cada uma tem um motivo que não é preguiça:
 *
 *   - Status HTTP são vocabulário do protocolo, não do produto. `c.redirect(destino, 303)` diz
 *     mais com o número do que diria com `REDIRECIONAMENTO` — quem lê HTTP lê 303. A isenção vale
 *     EM POSIÇÃO DE STATUS, e só nela: ver `ehPosicaoDeStatus`.
 *   - SQL fica inteiro de fora: o template marcado (`` sql`...` ``) e o tipo de coluna que
 *     `sql.array(ids, 'TEXT')` recebe. Nome de tabela, de coluna e de tipo já têm uma fonte única,
 *     que é a migração; espelhá-los em TypeScript criaria a segunda.
 *   - O operando de `typeof` (`typeof valor === 'string'`). São oito palavras fixadas pela
 *     especificação da linguagem, e `typeof` é um operador de duas partes — a segunda não é um
 *     valor que alguém escolheu, é metade da sintaxe.
 *   - Quantificadores de regex (`{2}`, `{4}`) fazem parte da gramática da expressão. Extrair o `4`
 *     de `\d{4}` produz uma regex montada por concatenação, que é ilegível e mais fácil de errar.
 *   - `0` e `1` são índice, base e elemento neutro antes de serem valores.
 *   - `testes/` inteiro. Uma asserção que importa a constante que ela verifica não verifica nada:
 *     `expect(limite).toBe(LIMITES.turma.nome)` passa com os dois lados errados.
 *
 * Uso:
 *   bun scripts/magic-values.ts            relatório completo, sai 1 se houver achado
 *   bun scripts/magic-values.ts --resumo   só a contagem por arquivo
 *
 * Escape hatch, para o caso legítimo que a heurística não prevê: um comentário
 * `// magic-values: permitido — <motivo>` na linha do literal ou na linha acima dela. O motivo é
 * obrigatório, e é ele que faz a exceção ser revisável em vez de invisível.
 */

import { join, resolve } from 'node:path';
import ts from 'typescript/lib/typescript.js';

const RAIZ = resolve(import.meta.dir, '..');

/**
 * O que entra na varredura. `testes/` fica de fora por decisão, não por esquecimento.
 *
 * Os `.eta` entram porque são o único lugar do sistema em que um endereço errado não é acusado por
 * ninguém: `tsc` não os lê, o `dependency-cruiser` não os lê, e o golden só percebe a diferença
 * depois que ela já mudou a tela. São 44 arquivos que geram HTML e ninguém confere.
 */
const ALVOS: readonly string[] = [
  'src/**/*.ts',
  'src/web/templates/**/*.eta',
  'scripts/migrate.ts',
  'scripts/build-assets.ts',
  'scripts/seed.ts',
  'scripts/seed-volume.ts',
];

/**
 * Os arquivos onde os literais MORAM. Não é indulgência: é a definição do lugar certo, e o
 * verificador precisa saber qual é para poder cobrar todos os outros. Um `constantes.ts` é
 * declaração de ponta a ponta — não há lógica dentro dele para cobrar.
 */
const ARQUIVOS_DE_CONSTANTES = /(?:^|\/)constantes\.ts$/;

/**
 * `web/rotas/mapa.ts` declara o vocabulário de rota E tem lógica de verdade — `juntar` decide o que
 * fazer com a barra final, `preencher` monta a URL e derruba a página quando falta parâmetro. Ele
 * entra no índice de valores com dono, como um `constantes.ts`, e NÃO sai da varredura: isentá-lo
 * inteiro era isentar duas funções em nome das três linhas de declaração que moram ao lado delas.
 */
const ARQUIVOS_INDEXADOS = /(?:^|\/)constantes\.ts$|(?:^|\/)web\/rotas\/mapa\.ts$/;

const ESTE_ARQUIVO = 'scripts/magic-values.ts';

const EXTENSAO_DE_TEMPLATE = '.eta';

/**
 * O único `.eta` com isenção, e a isenção é do CONTEÚDO, não do arquivo.
 *
 * Tudo o que está entre `<script>` e `</script>` em `parciais/_script_avisos.eta` é copiado byte a
 * byte para dentro de toda página que os layouts montam: não é código do servidor, é conteúdo do
 * documento, e ele viaja para o navegador. Nomear aqueles literais não os move para um dono — move
 * a declaração para dentro do HTML de cada uma das 75 telas, o que engorda a resposta e faz o
 * golden acusar todas de uma vez. O parcial ainda por cima é incluído sem `it` pelos dois layouts,
 * e o Eta compila com `useWith: false`: não há de onde interpolar um valor do servidor, mesmo que
 * se quisesse. Enquanto isso for verdade, o literal é a forma correta, e não a forma tolerada.
 *
 * O que o arquivo tem FORA do `<script>` continua sendo cobrado, e é a diferença que importa: um
 * `href` acrescentado à marcação deste parcial é uma rota escrita à mão como qualquer outra, e
 * pular o arquivo inteiro — que era o que este script fazia — deixava exatamente essa porta aberta
 * enquanto o comentário aqui prometia o contrário.
 */
const TEMPLATES_COM_SCRIPT_ISENTO: ReadonlySet<string> = new Set([
  'src/web/templates/parciais/_script_avisos.eta',
]);

const BLOCO_DE_SCRIPT = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi;

/**
 * Apaga o corpo do `<script>` sem mexer em uma única posição do arquivo: cada caractere que não é
 * quebra de linha vira espaço. Linha, coluna e índice de tudo o que vem depois continuam valendo,
 * e o que sobra para a varredura é a marcação — que é justamente o que a isenção não cobre.
 */
const semCorpoDeScript = (fonte: string): string =>
  fonte.replaceAll(
    BLOCO_DE_SCRIPT,
    (_inteiro, abertura: string, corpo: string, fechamento: string) =>
      `${abertura}${corpo.replaceAll(/[^\n]/g, ' ')}${fechamento}`,
  );

/**
 * Vocabulário do protocolo HTTP.
 *
 * Os múltiplos de cem entram como as classes que são: `status >= 300 && status < 400` é o jeito de
 * escrever "é redirecionamento" em HTTP, e ali `300` é a fronteira da família 3xx, não um número
 * escolhido pelo produto. Deixar `300` de fora da lista faria a fronteira ser cobrada enquanto os
 * quatro códigos que ela delimita — 301, 302, 303, 304 — passam.
 */
const STATUS_HTTP = new Set([
  200, 201, 202, 204, 300, 301, 302, 303, 304, 400, 401, 403, 404, 405, 409, 410, 422, 429, 500,
  502, 503, 504,
]);

/** Índice, base e elemento neutro. */
const NUMEROS_NEUTROS = new Set([0, 1]);

const SUPRESSAO = /\/\/\s*magic-values:\s*permitido\s*[—-]\s*\S/;

const MAIUSCULA_COM_UNDERLINE = /^[A-Z][A-Z0-9_]*$/;

type Achado = {
  readonly arquivo: string;
  readonly linha: number;
  readonly coluna: number;
  readonly trecho: string;
  /** O que está errado. Vazio para o literal solto, que é o caso base e não precisa de glosa. */
  readonly motivo: string;
};

/* --- Coleta dos arquivos ---------------------------------------------------- */

async function arquivosAlvo(): Promise<string[]> {
  const encontrados = new Set<string>();
  for (const padrao of ALVOS) {
    for await (const achado of new Bun.Glob(padrao).scan({ cwd: RAIZ })) {
      encontrados.add(achado.replaceAll('\\', '/'));
    }
  }
  return [...encontrados].sort();
}

/* --- O índice dos valores que já têm dono ----------------------------------- */

/**
 * Um valor declarado, com o caminho pelo qual se chega a ele. `LIMITES.aluno.nome`,
 * `BANCO.maxConexoes`, `TAMANHO_DA_DATA_ISO` — o caminho é o que o achado imprime, porque é ele
 * que responde "então de onde eu importo isto?".
 */
type Dono = { readonly caminho: string; readonly arquivo: string };

/**
 * A identidade de um literal, para comparação. O tipo entra na chave de propósito: `'10'` e `10`
 * não são o mesmo valor, e fundir os dois faria um nome de campo colidir com um limite.
 */
const chaveDeValor = (no: ts.Node): string | undefined => {
  if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) return `texto:${no.text}`;
  if (ts.isNumericLiteral(no)) return `numero:${Number(no.text.replaceAll('_', ''))}`;
  if (ts.isRegularExpressionLiteral(no)) return `expressao:${no.text}`;
  return undefined;
};

const nomeDaPropriedade = (nome: ts.PropertyName): string | undefined => {
  if (ts.isIdentifier(nome) || ts.isStringLiteral(nome) || ts.isNumericLiteral(nome)) {
    return nome.text;
  }
  return undefined;
};

const indicePorValor = new Map<string, Dono[]>();
const valoresNumericosComDono = new Map<number, Dono>();

function indexarDeclaracoes(arquivo: string, fonte: string): void {
  const origem = ts.createSourceFile(arquivo, fonte, ts.ScriptTarget.ESNext, true);

  const registrar = (no: ts.Node, caminho: string): void => {
    const chave = chaveDeValor(no);
    if (chave === undefined) return;
    const dono: Dono = { caminho, arquivo };
    indicePorValor.set(chave, [...(indicePorValor.get(chave) ?? []), dono]);
    if (ts.isNumericLiteral(no)) {
      const valor = Number(no.text.replaceAll('_', ''));
      if (!valoresNumericosComDono.has(valor)) valoresNumericosComDono.set(valor, dono);
    }
  };

  const visitar = (no: ts.Node, caminho: string): void => {
    if (ts.isTypeNode(no)) return;
    if (ts.isImportDeclaration(no) || ts.isExportDeclaration(no)) return;

    if (ts.isVariableDeclaration(no) && ts.isIdentifier(no.name)) {
      if (no.initializer !== undefined) visitar(no.initializer, no.name.text);
      return;
    }

    if (ts.isPropertyAssignment(no)) {
      const chave = nomeDaPropriedade(no.name);
      const adiante = chave === undefined ? caminho : `${caminho}.${chave}`;
      visitar(no.initializer, adiante);
      return;
    }

    if (caminho !== '') registrar(no, caminho);
    ts.forEachChild(no, (filho) => {
      visitar(filho, caminho);
    });
  };

  ts.forEachChild(origem, (no) => {
    visitar(no, '');
  });
}

/* --- Regras de isenção ------------------------------------------------------ */

/**
 * Um literal nomeado não é ANÔNIMO. `const NOME_MAXIMO = 120` diz o que 120 significa; é o `120`
 * escrito no meio da chamada que não diz nada.
 *
 * Nomear resolve o anonimato e NÃO resolve a duplicação: sobre o valor batizado ainda roda a regra
 * 2, que é o que impede batizar a cópia para escapar do relatório.
 */
const declaracaoNomeada = (no: ts.Node): boolean => {
  if (!ts.isVariableDeclaration(no)) return false;
  if (!ts.isIdentifier(no.name)) return false;
  const lista = no.parent;
  const ehConst =
    ts.isVariableDeclarationList(lista) && (lista.flags & ts.NodeFlags.Const) !== 0;
  return ehConst && MAIUSCULA_COM_UNDERLINE.test(no.name.text);
};

/** `as const`, `satisfies` e parênteses não mudam o valor; envolvem quem o declara. */
const semEnvelope = (no: ts.Node): ts.Node => {
  let atual = no;
  while (
    atual.parent !== undefined &&
    (ts.isAsExpression(atual.parent) ||
      ts.isSatisfiesExpression(atual.parent) ||
      ts.isParenthesizedExpression(atual.parent))
  ) {
    atual = atual.parent;
  }
  return atual;
};

/**
 * Onde a isenção da declaração PARA.
 *
 * O nome de uma `const` batiza uma expressão, não um catálogo. `const FAIXA = 10 ** DIGITOS` e
 * `const METADE = Math.floor(JANELA / 2)` continuam sendo um valor com nome — a conta inteira é o
 * que o nome descreve. Já o `{` de um objeto, o `[` de um arranjo e o corpo de uma função abrem
 * conteúdo NOVO embaixo do nome: `TABELA.prazo` e `TABELA.recorte` são decisões que o identificador
 * `TABELA` não documenta, e o lugar de uma tabela de constantes é um `constantes.ts`.
 */
const abreConteudoNovo = (no: ts.Node): boolean =>
  ts.isObjectLiteralExpression(no) || ts.isArrayLiteralExpression(no) || ts.isFunctionLike(no);

/**
 * Texto, e nada além de texto: um literal, um template, ou a emenda de vários com `+`.
 *
 * É o que distingue uma FRASE COM PARÂMETROS de uma função com lógica dentro. `(versao) =>
 * `  pendente  ${versao}`` não calcula nada: é uma mensagem cujo nome está na chave que a carrega,
 * e o corpo é a redação inteira. Já `(t) => t.slice(0, 37)` decide alguma coisa, e o `37` é a
 * decisão — o nome da função não diz que ela corta em 37.
 */
const ehSoTexto = (no: ts.Node): boolean => {
  if (ts.isParenthesizedExpression(no)) return ehSoTexto(no.expression);
  if (ts.isBinaryExpression(no)) {
    return (
      no.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      ehSoTexto(no.left) &&
      ehSoTexto(no.right)
    );
  }
  return (
    ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no) || ts.isTemplateExpression(no)
  );
};

const corpoDeExpressao = (no: ts.Node): ts.Node | undefined =>
  ts.isArrowFunction(no) || ts.isFunctionExpression(no) || ts.isFunctionDeclaration(no)
    ? no.body
    : undefined;

/**
 * O literal é o VALOR que a declaração nomeia? Sobe pela árvore enquanto o que está acima ainda é
 * a mesma expressão batizada, e desiste no primeiro objeto, arranjo ou função pelo caminho.
 *
 * A única função que a subida atravessa é a que devolve só texto, e só quando o caminho inteiro
 * até ela também foi texto: aí o que está embaixo do nome é a frase, e não o que a frase interpola.
 */
const ehValorBatizado = (no: ts.Node): boolean => {
  let soTexto = ehSoTexto(no);
  for (let atual = semEnvelope(no); atual.parent !== undefined; atual = semEnvelope(atual.parent)) {
    const pai = atual.parent;
    if (ts.isVariableDeclaration(pai)) return pai.initializer === atual && declaracaoNomeada(pai);
    if (ts.isFunctionLike(pai)) {
      const corpo = corpoDeExpressao(pai);
      if (!soTexto || corpo === undefined || !ehSoTexto(corpo)) return false;
    } else if (abreConteudoNovo(pai)) {
      return false;
    }
    soTexto = soTexto && ehSoTexto(pai);
  }
  return false;
};

/**
 * Os nomes de que o próprio arquivo deriva um TIPO: `type Papel = (typeof PAPEIS)[number]`.
 *
 * Uma lista assim não é uma cópia de nada — ela É a fonte, e a fonte de um tipo ainda por cima.
 * `TURNOS`, `PAPEIS`, `STATUS_DE_REDE`, `SITUACOES_DE_MATRICULA` e `SITUACOES_FINAIS` moram no
 * `dominio/` justamente porque é de lá que saem o tipo e o `type guard`; cobrá-las como literal
 * solto seria mandar mover para `constantes.ts` exatamente o que o `constantes.ts` de cada módulo
 * documenta por escrito que fica onde está. Este script já isenta o nó de tipo (`ts.isTypeNode`) —
 * a união escrita como valor é a mesma declaração dita na outra sintaxe.
 */
const nomesQueGeramTipo = (origem: ts.SourceFile): ReadonlySet<string> => {
  const nomes = new Set<string>();
  const visitar = (no: ts.Node): void => {
    if (ts.isTypeQueryNode(no) && ts.isIdentifier(no.exprName)) nomes.add(no.exprName.text);
    ts.forEachChild(no, visitar);
  };
  ts.forEachChild(origem, visitar);
  return nomes;
};

/**
 * Dado de amostra dos seeds: a tabela de nomes, a lista de disciplinas, e também o punhado de
 * parâmetros que descreve a amostra (`ALUNOS_POR_TURMA`, `NASCIMENTO.ultimoDia`). São dados, não
 * política — a regra 6 os deixa de fora, e o que continua sendo cobrado nos seeds é a LÓGICA em
 * volta deles: a isenção exige estar sob uma `const` MAIÚSCULA, e não vale dentro de função.
 *
 * O que NÃO cai nesta isenção é a regra 2: uma rota ou um limite com dono escrito dentro de uma
 * tabela de seed continua sendo segunda fonte da verdade, e continua sendo acusado.
 */
const ehTabelaDeDados = (no: ts.Node, arquivo: string, caminho: string): boolean =>
  arquivo.startsWith('scripts/seed') &&
  (ts.isArrayLiteralExpression(no) || (caminho !== '' && ts.isObjectLiteralExpression(no)));

const ehLiteralSimples = (no: ts.Node): boolean =>
  ts.isStringLiteral(no) ||
  ts.isNoSubstitutionTemplateLiteral(no) ||
  ts.isNumericLiteral(no) ||
  (ts.isPrefixUnaryExpression(no) && ts.isNumericLiteral(no.operand));

/**
 * `const BIMESTRES = [1, 2, 3, 4]`, `const TURNOS = ['matutino', …]`: a LISTA é a declaração.
 *
 * Enumerar é declarar. Uma lista em que todo elemento é um literal não tem valor escondido dentro
 * dela — ela é a definição inteira, e o nome que a carrega diz do que é a lista. Não confundir com
 * a tabela do caso 1: lá o objeto emparelha nomes que ninguém declarou com valores que ninguém
 * declarou; aqui não há par nenhum, há o conjunto.
 *
 * A isenção é do ANONIMATO e só dele: a regra 2 continua rodando elemento a elemento, e uma rota ou
 * uma frase com dono escrita dentro da lista continua sendo acusada.
 */
const ehEnumeracao = (no: ts.Node, caminho: string): boolean =>
  caminho !== '' && ts.isArrayLiteralExpression(no) && no.elements.every(ehLiteralSimples);

/** O nome final de quem está sendo chamado: `c.redirect(...)` → `redirect`, `f(...)` → `f`. */
const nomeChamado = (alvo: ts.Expression): string | undefined => {
  if (ts.isIdentifier(alvo)) return alvo.text;
  if (ts.isPropertyAccessExpression(alvo)) return alvo.name.text;
  return undefined;
};

/** Quem constrói a resposta recebe o status no SEGUNDO argumento. */
const CONSTRUTORES_DE_RESPOSTA: ReadonlySet<string> = new Set([
  'redirect',
  'json',
  'text',
  'html',
  'body',
  'newResponse',
]);

/** Quem renderiza a página de erro recebe o status como argumento próprio. */
const RENDERIZADORES_DE_ERRO: ReadonlySet<string> = new Set(['renderizarErro', 'paginaDeErro']);

const POSICAO_DO_STATUS_NA_RESPOSTA = 1;

/** O que o próprio código chama de status: `status`, `statusDoErro`, `StatusDeErro`. */
const FALA_EM_STATUS = /status/i;

const COMPARACOES = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

/**
 * Perguntar de que CLASSE o status é continua sendo falar de status.
 *
 * `status === 404` e `status >= 300 && status < 400` são a mesma pergunta feita com granularidade
 * diferente: a primeira sobre um código, a segunda sobre a família dele. Cobrar só a igualdade
 * deixava `ehRedirecionamento` — a função que decide se a resposta gravada pela idempotência é um
 * redirecionamento — como o único lugar do sistema obrigado a justificar por escrito um número que
 * o protocolo define. A exigência que segura o portão não é o operador: é a mesma de sempre, o
 * outro lado da comparação precisar se chamar status.
 */
const COMPARACOES_DE_ORDEM = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
]);

const ehComparacao = (operador: ts.SyntaxKind): boolean =>
  COMPARACOES.has(operador) || COMPARACOES_DE_ORDEM.has(operador);

/** A função que envolve um `return`, com o nome e o tipo de retorno que ela declara. */
const funcaoQueEnvolve = (no: ts.Node): ts.SignatureDeclaration | undefined => {
  for (let atual = no.parent; atual !== undefined; atual = atual.parent) {
    if (ts.isFunctionLike(atual)) return atual;
  }
  return undefined;
};

const assinaturaFalaEmStatus = (funcao: ts.SignatureDeclaration): boolean => {
  const tipo = funcao.type;
  if (tipo !== undefined && FALA_EM_STATUS.test(tipo.getText())) return true;
  const declaracao = funcao.parent;
  if (ts.isVariableDeclaration(declaracao) && ts.isIdentifier(declaracao.name)) {
    return FALA_EM_STATUS.test(declaracao.name.text);
  }
  return funcao.name !== undefined && FALA_EM_STATUS.test(funcao.name.getText());
};

/**
 * Onde um número de três dígitos de fato SIGNIFICA um status HTTP.
 *
 * A lista `STATUS_HTTP` aplicada em qualquer posição é pior do que não ter lista nenhuma: ela
 * apaga do relatório todo `slice(0, 500)`, `padEnd(404, 'x')` e `slice(0, 200)` do sistema. E não
 * é hipótese — `LIMITES.justificativa` vale 500, e um `.max(500)` escrito à mão no schema seria
 * exatamente o defeito que este script existe para pegar, invisível porque 500 também é
 * "Internal Server Error".
 *
 * O critério é o mesmo que o resto deste arquivo usa para tudo: **o nome é a documentação**. Um
 * número é status onde o código em volta o CHAMA de status —
 *
 *   - entregue ao protocolo: argumento de `c.redirect`, `c.json`, `c.text`, `c.status`, e de
 *     `renderizarErro`/`paginaDeErro`, que renderizam a página do status;
 *   - devolvido como status: `return 401` de uma função cujo nome ou cujo tipo de retorno fala em
 *     status (`statusDoErro(): StatusDeErro`) — é a tradução de exceção para protocolo, e escrever
 *     `NAO_AUTORIZADO` ali afastaria o leitor do vocabulário que ele já conhece;
 *   - comparado com um status: `status === 500`, onde o outro lado da comparação se chama status;
 *   - lido de uma tabela indexada por status: `TITULOS_DE_ERRO[404]`, onde o número é CHAVE e não
 *     valor — o espelho exato das chaves `400:`/`404:` que a tabela declara, e chave de
 *     propriedade este script já não cobra, em nenhum arquivo.
 *
 * Fora dessas quatro, 500 é só um número — e número solto é o que o script cobra.
 */
const ehPosicaoDeStatus = (no: ts.NumericLiteral): boolean => {
  const pai = no.parent;

  if (ts.isElementAccessExpression(pai) && pai.argumentExpression === no) return true;

  if (ts.isReturnStatement(pai)) {
    const funcao = funcaoQueEnvolve(pai);
    return funcao !== undefined && assinaturaFalaEmStatus(funcao);
  }

  if (ts.isBinaryExpression(pai) && ehComparacao(pai.operatorToken.kind)) {
    const outro = pai.left === no ? pai.right : pai.left;
    return FALA_EM_STATUS.test(outro.getText());
  }

  if (!ts.isCallExpression(pai)) return false;
  const posicao = pai.arguments.indexOf(no);
  if (posicao < 0) return false;

  const chamado = nomeChamado(pai.expression);
  if (chamado === undefined) return false;
  if (RENDERIZADORES_DE_ERRO.has(chamado)) return true;
  if (chamado === 'status') return posicao === 0;
  return CONSTRUTORES_DE_RESPOSTA.has(chamado) && posicao === POSICAO_DO_STATUS_NA_RESPOSTA;
};

const numeroIsento = (no: ts.NumericLiteral): boolean => {
  const valor = Number(no.text.replaceAll('_', ''));
  if (NUMEROS_NEUTROS.has(valor)) return true;
  return STATUS_HTTP.has(valor) && ehPosicaoDeStatus(no);
};

/**
 * Um template só é mágico pelo que ele próprio ESCREVE, e não pelo que interpola.
 *
 * `` `${TITULOS.aluno}: ${erro}` `` não guarda decisão nenhuma — os dois pedaços que importam já
 * têm nome, e o `: ` entre eles é pontuação. Já `` `O nome precisa ter até ${limite} caracteres.` ``
 * é uma frase de produto costurada à mão. A diferença mensurável entre as duas é o texto fixo:
 * prosa tem palavras, e formato tem dígitos. Pontuação e separador não têm nem uma coisa nem outra,
 * e é por isso que passam.
 */
const TEXTO_COM_CONTEUDO = /[A-Za-zÀ-ÿ]{3,}|\d/;

const templateComProsa = (no: ts.TemplateExpression): boolean =>
  TEXTO_COM_CONTEUDO.test(no.head.text) ||
  no.templateSpans.some((trecho) => TEXTO_COM_CONTEUDO.test(trecho.literal.text));

/* --- Texto que é vocabulário de outra gramática ----------------------------- */

/**
 * Os oito valores que `typeof` pode devolver. A lista é fechada pela especificação da linguagem:
 * ninguém acrescenta um nono, e nenhum produto escolhe qual deles usar.
 */
const RESULTADOS_DE_TYPEOF: ReadonlySet<string> = new Set([
  'undefined',
  'object',
  'boolean',
  'number',
  'bigint',
  'string',
  'symbol',
  'function',
]);

/**
 * `typeof valor === 'string'` não tem literal solto nenhum: tem um OPERADOR de duas partes.
 *
 * Este era, disparado, o falso positivo mais caro do script — dezoito ocorrências, todas em
 * funções de três linhas que leem um campo de formulário (`typeof valor === 'string' ? valor : ''`),
 * e todas "resolvidas" com um comentário de supressão idêntico colado por cima. Dezoito exceções
 * pontuais dizendo a mesma frase não são dezoito decisões: são uma regra faltando, escrita à mão
 * dezoito vezes. E o custo não é o ruído — é que a supressão vale para a LINHA, então cada uma
 * delas cegava o verificador para qualquer outro literal que passasse a dividir aquela linha.
 *
 * O portão é estreito de propósito, e são duas exigências ao mesmo tempo: o texto precisa ser um
 * dos oito resultados possíveis de `typeof` E precisa estar comparado com um `typeof` de verdade.
 * `campos.tipo === 'number'` continua sendo cobrado, porque do outro lado não há `typeof`; e
 * `MENSAGENS.tipo = 'string'`, se existisse, também, porque não há comparação.
 */
const ehOperandoDeTypeof = (no: ts.StringLiteralLike): boolean => {
  if (!RESULTADOS_DE_TYPEOF.has(no.text)) return false;
  const pai = no.parent;
  if (!ts.isBinaryExpression(pai) || !COMPARACOES.has(pai.operatorToken.kind)) return false;
  const outro = pai.left === no ? pai.right : pai.left;
  return ts.isTypeOfExpression(outro);
};

/**
 * `sql.array([...ids], 'TEXT')`: `'TEXT'` é o tipo da coluna no Postgres, e a regra 6 mantém nome
 * de tabela, de coluna e de tipo fora do escopo — a fonte única deles é a migração.
 *
 * A isenção existe porque a do SQL estava amarrada à FORMA e não ao assunto: valia para o que
 * estivesse dentro de `` sql`…` ``, e onze das doze chamadas de `sql.array` deste repositório estão.
 * A décima segunda é idêntica às outras e só está fora do template porque a condição é montada uma
 * linha antes da consulta — e era a única obrigada a se justificar por escrito. Uma regra que
 * depende de o SQL ter sido escrito numa linha ou na anterior não é uma regra sobre SQL.
 */
const ehTipoDeArrayNoPostgres = (no: ts.Node): boolean => {
  const pai = no.parent;
  if (!ts.isCallExpression(pai)) return false;
  const alvo = pai.expression;
  if (!ts.isPropertyAccessExpression(alvo) || alvo.name.text !== 'array') return false;
  if (!ts.isIdentifier(alvo.expression) || alvo.expression.text !== 'sql') return false;
  return pai.arguments.indexOf(no as ts.Expression) === 1;
};

const textoIsento = (no: ts.StringLiteralLike): boolean =>
  ehOperandoDeTypeof(no) || ehTipoDeArrayNoPostgres(no);

/**
 * `{ id: 'id' }`, `{ drenou: 'drenou' }`: o texto que repete a própria chave.
 *
 * Não é um valor escondido atrás de um nome — é o nome escrito duas vezes. A chave já está ali, à
 * esquerda, e não há uma segunda leitura possível para o que está à direita: são o mesmo token, e
 * quem lê a linha lê a decisão inteira. É a forma que `DESFECHO_DA_DRENAGEM` e `PARAMETROS_DE_ROTA`
 * usam para dar nome a um membro de um conjunto fechado.
 *
 * A isenção não abre porta nenhuma, porque as regras de cópia rodam ANTES dela: uma rota começa com
 * `/` e uma frase tem espaço, e nenhuma das duas jamais é igual a um identificador de propriedade.
 */
const ehEspelhoDaChave = (no: ts.StringLiteralLike): boolean => {
  const pai = no.parent;
  return (
    ts.isPropertyAssignment(pai) &&
    pai.initializer === no &&
    nomeDaPropriedade(pai.name) === no.text
  );
};

/* --- Regra 2: o valor que já tem dono --------------------------------------- */

/**
 * Quando uma coincidência de valor é DUPLICAÇÃO, e quando é só coincidência.
 *
 * A regra 2 do refactor — merge por conceito, nunca por valor — vale para o verificador tanto
 * quanto para quem escreve o código. `10` é `BANCO.maxConexoes`, é `BANCO.tempoDeConexaoSegundos`,
 * é `TAMANHO_PADRAO` da paginação, é `LIMITES.nota.maximo` e é `PESO_INICIAL_DO_PRIMEIRO` do
 * dígito verificador do CPF; "Unidade não encontrada nesta rede." é do acadêmico e da comunicação
 * ao mesmo tempo, com códigos e donos diferentes. Um verificador que acusasse toda coincidência de
 * valor estaria mandando fundir exatamente o que a regra 2 manda separar — e a saída correta para
 * o programador seria ignorá-lo, que é como um verificador morre.
 *
 * Duas coisas, e só elas, provam cópia em vez de coincidência:
 *
 *   - O NOME INTEIRO BATE. `MAX_CONEXOES = 10` ao lado de `BANCO.maxConexoes = 10` não é duas
 *     políticas que por acaso valem dez: é a mesma frase dita duas vezes, uma com o grupo no
 *     objeto e a outra com o grupo no nome da const. Mesmo nome e mesmo valor em dois arquivos é a
 *     definição de segunda fonte da verdade.
 *
 *     É o nome INTEIRO, e não a última palavra dele. `TABELA.unidade` do seed é o nome de uma
 *     tabela do banco e `ALCANCE.unidade` é o alcance de um comunicado; `CAIXA.secretaria` é o
 *     que vem antes do `@` num e-mail e `PAPEL.secretaria` é um papel de acesso; `TABELA.usuario`
 *     e `VARIAVEIS_DE_CONTEXTO.usuario` não se parecem em nada. Nos três a última palavra é a
 *     mesma e o grupo é que diz de qual conceito se está falando — casar pela folha faria o
 *     verificador mandar fundir exatamente o que a regra 2 manda separar.
 *
 *   - É UMA EXPRESSÃO REGULAR IDÊNTICA. Uma regex não é um valor, é uma gramática escrita à mão:
 *     `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` não é reescrita caractere
 *     a caractere por acaso em dois arquivos. Quem a tem de novo, copiou.
 *
 *   - É UMA FRASE IDÊNTICA. Pelo mesmo motivo da regex, e com a mesma força: "Cadastrar aluno" e
 *     "Unidade não encontrada nesta rede." são redação, e duas pessoas não redigem a mesma frase
 *     palavra por palavra sem uma delas ter copiado da outra. O portão é ter DUAS palavras de três
 *     letras ou mais: `'utf8'`, `'sha256'`, `'.'` e `'no-store'` não passam por ele, e é por isso
 *     que os seis `SEPARADOR_*` que valem `'.'` neste repositório continuam sendo seis decisões.
 */
const ehExpressaoRegular = (no: ts.Node): boolean => ts.isRegularExpressionLiteral(no);

const DUAS_PALAVRAS_SEGUIDAS = /[A-Za-zÀ-ÿ]{3,}\s+[A-Za-zÀ-ÿ]{3,}/;

const ehFrase = (no: ts.Node): boolean =>
  (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) &&
  DUAS_PALAVRAS_SEGUIDAS.test(no.text);

/** Ligações que não nomeiam nada: sobram em `LIMITE_DE_NOME_DO_ALUNO` e não distinguem conceito. */
const PALAVRAS_VAZIAS: ReadonlySet<string> = new Set([
  'de',
  'do',
  'da',
  'dos',
  'das',
  'em',
  'no',
  'na',
  'ao',
  'aos',
  'com',
  'por',
  'para',
  'e',
  'o',
  'a',
]);

const SEPARADOR_DE_CAIXA = /([a-z0-9])([A-Z])/g;
const NAO_ALFANUMERICO = /[^A-Za-z0-9]+/;
const TAMANHO_MINIMO_PARA_SINGULAR = 4;

/** `LIMITES` e `limite` são a mesma palavra; o plural do grupo não muda o conceito. */
const singular = (palavra: string): string =>
  palavra.length >= TAMANHO_MINIMO_PARA_SINGULAR && palavra.endsWith('s')
    ? palavra.slice(0, -1)
    : palavra;

/** `LIMITES.aluno.nome` e `LIMITE_DE_NOME_DO_ALUNO` → as mesmas três palavras. */
const palavrasDoCaminho = (caminho: string): string[] =>
  caminho
    .split('.')
    .flatMap((parte) => parte.replaceAll(SEPARADOR_DE_CAIXA, '$1 $2').split(NAO_ALFANUMERICO))
    .map((palavra) => palavra.toLowerCase())
    .filter((palavra) => palavra !== '' && !PALAVRAS_VAZIAS.has(palavra))
    .map(singular);

const contemTodas = (conjunto: ReadonlySet<string>, palavras: readonly string[]): boolean =>
  palavras.length > 0 && palavras.every((palavra) => conjunto.has(palavra));

/**
 * Dois caminhos nomeiam a mesma coisa quando um deles diz TUDO o que o outro diz.
 *
 * A comparação é por palavra, e não por texto, porque a mesma leitura se escreve de várias formas:
 * `MAX_CONEXOES` é `BANCO.maxConexoes` sem o grupo, e `LIMITE_DE_NOME_DO_ALUNO` é `LIMITES.aluno.nome`
 * com as palavras em outra ordem e uma preposição no meio. Comparar o texto concatenado só pegava a
 * primeira das duas — bastava reordenar as palavras da cópia para escapar do relatório.
 *
 * Continua sendo o nome INTEIRO: a inclusão precisa valer em algum sentido, e por isso os pares que
 * a regra 2 manda separar seguem separados. `TABELA.unidade` não contém `alcance` e `ALCANCE.unidade`
 * não contém `tabela`; `CAIXA.secretaria` e `PAPEL.secretaria` idem; `PESO_INICIAL_DO_PRIMEIRO` não
 * diz `banco` nem `conexões`, e continua podendo valer 10 ao lado de `BANCO.maxConexoes`.
 */
const mesmoNome = (aqui: string, dono: string): boolean => {
  const daqui = palavrasDoCaminho(aqui);
  const doDono = palavrasDoCaminho(dono);
  return contemTodas(new Set(daqui), doDono) || contemTodas(new Set(doDono), daqui);
};

/**
 * Ninguém é cópia de si mesmo. `web/rotas/mapa.ts` é indexado E varrido — é a única fonte de um
 * punhado de valores e ao mesmo tempo tem lógica —, e sem este corte cada declaração dele se
 * acusaria de repetir a própria declaração.
 */
const donoDuplicado = (no: ts.Node, caminho: string, arquivo: string): Dono | undefined => {
  const chave = chaveDeValor(no);
  if (chave === undefined) return undefined;
  const donos = (indicePorValor.get(chave) ?? []).filter((dono) => dono.arquivo !== arquivo);
  if (donos.length === 0) return undefined;

  if (caminho !== '') {
    const porNome = donos.find((dono) => mesmoNome(caminho, dono.caminho));
    if (porNome !== undefined) return porNome;
  }

  return ehExpressaoRegular(no) || ehFrase(no) ? donos[0] : undefined;
};

/* --- Análise de um arquivo `.ts` -------------------------------------------- */

/**
 * O que o visitante carrega árvore abaixo: se está dentro de uma DECLARAÇÃO — a tabela de dados de
 * um seed, a lista de que sai um tipo — e por qual caminho se chegou até aqui. O caminho é o que
 * permite comparar `MENSAGENS.turma.nomeLongo` local com `MENSAGENS.turma.nomeLongo` do dono; sem
 * ele, a regra 2 só teria o valor para olhar.
 *
 * O caminho para na porta de uma função: corpo de função é lógica, e lógica não herda o nome da
 * tabela em que está escrita. A isenção de declaração continua valendo lá dentro, porque uma
 * mensagem de seed com um `padEnd` no meio continua sendo dado de amostra.
 */
type Contexto = { readonly declaracao: boolean; readonly caminho: string };

const RAIZ_DA_ARVORE: Contexto = { declaracao: false, caminho: '' };

const MOTIVO_DE_ENDERECO = 'endereço escrito à mão — use `ROTAS` (web/constantes.ts)';

function analisarTypeScript(arquivo: string, fonte: string): Achado[] {
  const origem = ts.createSourceFile(arquivo, fonte, ts.ScriptTarget.ESNext, true);
  const linhas = fonte.split('\n');
  const achados: Achado[] = [];
  const geramTipo = nomesQueGeramTipo(origem);

  const suprimida = (linha: number): boolean => {
    const atual = linhas[linha - 1] ?? '';
    const anterior = linhas[linha - 2] ?? '';
    return SUPRESSAO.test(atual) || SUPRESSAO.test(anterior);
  };

  const registrar = (no: ts.Node, motivo: string): void => {
    const { line, character } = origem.getLineAndCharacterOfPosition(no.getStart(origem));
    if (suprimida(line + 1)) return;
    achados.push({
      arquivo,
      linha: line + 1,
      coluna: character + 1,
      trecho: no.getText(origem).replaceAll('\n', '\\n').slice(0, 72),
      motivo,
    });
  };

  /**
   * O que vale para TODO literal, batizado ou não, dentro de tabela de seed ou fora dela: a forma
   * que se reconhece sozinha (um endereço) e o valor que já tem dono. É esta metade que impede
   * escapar do relatório batizando ou enterrando a cópia.
   */
  const motivoDeCopia = (no: ts.Node, caminho: string): string | undefined => {
    if (
      (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) &&
      ROTA_COM_SEGMENTO.test(no.text)
    ) {
      return MOTIVO_DE_ENDERECO;
    }
    const dono = donoDuplicado(no, caminho, arquivo);
    return dono === undefined ? undefined : `mesmo valor de ${dono.caminho} (${dono.arquivo})`;
  };

  const conferir = (no: ts.Node, contexto: Contexto): void => {
    const copia = motivoDeCopia(no, contexto.caminho);
    if (copia !== undefined) {
      registrar(no, copia);
      return;
    }
    if (contexto.declaracao || ehValorBatizado(no)) return;

    if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) {
      // Chave de objeto e string vazia não são valores mágicos.
      const ehChave = ts.isPropertyAssignment(no.parent) && no.parent.name === no;
      const solto = !ehChave && no.text !== '' && !textoIsento(no) && !ehEspelhoDaChave(no);
      if (solto) registrar(no, '');
    } else if (ts.isTemplateExpression(no)) {
      // Registra o template inteiro, mas segue descendo: o que ele interpola pode ser mágico
      // por conta própria, e um achado não deve esconder o outro.
      if (templateComProsa(no)) registrar(no, '');
    } else if (ts.isNumericLiteral(no) && !numeroIsento(no)) {
      registrar(no, '');
    }
  };

  const visitar = (no: ts.Node, contexto: Contexto): void => {
    // Tipo é declaração, não expressão: uma união de literais É a fonte única, não uma cópia.
    if (ts.isTypeNode(no)) return;
    // O caminho de um import não é um valor do produto.
    if (ts.isImportDeclaration(no) || ts.isExportDeclaration(no)) return;
    // `sql`...`` e afins: o texto do SQL fica inteiro de fora (regra 6).
    if (ts.isTaggedTemplateExpression(no)) return;

    let atual = ts.isFunctionLike(no) ? { declaracao: contexto.declaracao, caminho: '' } : contexto;
    if (declaracaoNomeada(no)) {
      const nome = (no as ts.VariableDeclaration).name.getText(origem);
      atual = { declaracao: geramTipo.has(nome), caminho: nome };
    }
    if (ehTabelaDeDados(no, arquivo, atual.caminho) || ehEnumeracao(no, atual.caminho)) {
      atual = { declaracao: true, caminho: atual.caminho };
    }

    conferir(no, atual);

    ts.forEachChild(no, (filho) => {
      // A chave de uma propriedade nunca é um literal solto, mesmo fora de qualquer declaração.
      if (ts.isPropertyAssignment(no) && no.name === filho) return;
      const adiante =
        atual.caminho !== '' && ts.isPropertyAssignment(no)
          ? {
              declaracao: atual.declaracao,
              caminho: `${atual.caminho}.${nomeDaPropriedade(no.name) ?? ''}`,
            }
          : atual;
      visitar(filho, adiante);
    });
  };

  ts.forEachChild(origem, (no) => {
    visitar(no, RAIZ_DA_ARVORE);
  });
  return achados;
}

/* --- Análise de um `.eta` --------------------------------------------------- */

/**
 * O template tem duas metades, e cada uma erra de um jeito.
 *
 * A metade de MARCAÇÃO erra no endereço: um `href="/comunicados"` escrito à mão é a quinta cópia
 * de uma rota que `ROTAS` já declara, e é a cópia que ninguém acompanha quando o endereço muda.
 * O compilador não a lê, o `dependency-cruiser` não a lê; ela só aparece como 404 na tela.
 *
 * A metade de CÓDIGO — o que está entre `<%` e `%>` — erra no limite: `const NOME_MAXIMO = 120`
 * declarado no `.eta` é a segunda fonte da verdade de `LIMITES.aluno.nome`, e ela diverge do
 * servidor no dia em que só um dos dois for atualizado. O caminho certo não é redeclarar: o Eta
 * não importa TypeScript, então quem leva o valor até o template é o handler, via `it` — é o que
 * `web/rotas/professor.ts` já faz com `limiteDaJustificativa`, e é o padrão a replicar.
 */
const ABERTURA_DE_BLOCO = '<%';
const BLOCO_DE_ETA = /<%([\s\S]*?)%>/g;
const MARCADOR_DE_ABERTURA = /^[=~_-]/;
const MARCADOR_DE_FECHAMENTO = /[-_]$/;
const COMENTARIO_DO_ETA = '#';

/** `href` e `action` são os dois atributos que carregam endereço de rota numa tela deste sistema. */
const ATRIBUTO_DE_ENDERECO = /\b(href|action)\s*=\s*"([^"]*)"/g;
const INTERPOLACAO = /<%[\s\S]*?%>/g;

/**
 * Os atributos em que o navegador recebe um LIMITE. Escrever o número neles à mão é a mesma
 * segunda fonte da verdade que declará-lo num `const` do bloco — só que sem nem o nome para
 * denunciar, e é a forma que o refactor tenderia a produzir na próxima vez.
 */
const ATRIBUTO_DE_LIMITE = /\b(maxlength|minlength|max|min)\s*=\s*"([0-9_]+)"/g;

/**
 * `include()` e `layout()` recebem CAMINHO DE TEMPLATE, que é arquivo e não endereço — a mesma
 * distinção que mantém `ROTAS` e `TEMPLATES` separados em `web/constantes.ts`. `/parciais/_icone`
 * nunca foi uma URL e nunca chegou ao navegador; cobrá-lo como rota seria cobrar a coisa errada.
 */
const CHAMADAS_DE_TEMPLATE: ReadonlySet<string> = new Set(['include', 'includeFile', 'layout']);

const BARRA = '/';

/**
 * Um endereço tem barra E segmento. A barra sozinha, dentro do código do template, é o separador
 * de caminho — `caminho.startsWith(href + '/')`, em `_navegacao.eta`, é o teste que decide se o
 * link atual é ancestral da página aberta, e ali `'/'` não é rota nenhuma.
 *
 * Em `href`/`action` a leitura é outra: o valor do atributo É um endereço por definição, e um
 * `href="/"` escrito à mão é a raiz — `ROTAS.publicas.raiz`, que tem dono.
 */
const ROTA_COM_SEGMENTO = /^\/[A-Za-z0-9_:-]/;

const ehEnderecoNoAtributo = (texto: string): boolean =>
  texto === BARRA || ROTA_COM_SEGMENTO.test(texto);

/** No `.ts` o endereço vem de `ROTAS`; no `.eta`, do `it.rotas` que o handler injeta. */
const MOTIVO_DE_ENDERECO_NO_TEMPLATE =
  'endereço escrito à mão — use `it.rotas` (ROTAS, em web/constantes.ts)';

type Posicao = { readonly linha: number; readonly coluna: number };

const posicaoDe = (fonte: string, indice: number): Posicao => {
  const antes = fonte.slice(0, indice);
  const inicioDaLinha = antes.lastIndexOf('\n') + 1;
  return { linha: antes.split('\n').length, coluna: indice - inicioDaLinha + 1 };
};

function analisarTemplate(arquivo: string, fonte: string): Achado[] {
  const linhas = fonte.split('\n');
  const achados: Achado[] = [];

  const suprimida = (linha: number): boolean => {
    const atual = linhas[linha - 1] ?? '';
    const anterior = linhas[linha - 2] ?? '';
    return SUPRESSAO.test(atual) || SUPRESSAO.test(anterior);
  };

  const registrar = (indice: number, trecho: string, motivo: string): void => {
    const { linha, coluna } = posicaoDe(fonte, indice);
    if (suprimida(linha)) return;
    achados.push({
      arquivo,
      linha,
      coluna,
      trecho: trecho.replaceAll('\n', '\\n').slice(0, 72),
      motivo,
    });
  };

  /**
   * Um número escrito no `.eta` que já tem dono num `constantes.ts` é sempre redeclaração, e aqui
   * a coincidência de valor BASTA — ao contrário do que vale para um `.ts`.
   *
   * A assimetria não é descuido. Um `.ts` pode legitimamente ser o dono do próprio conceito: o
   * `10` de `PESO_INICIAL_DO_PRIMEIRO` em `documento/cpf.ts` é a especificação do dígito
   * verificador e não tem nada com o `10` de `BANCO.maxConexoes`. Um template não pode ser dono de
   * nada: ele não tem `constantes.ts`, o Eta não importa TypeScript, e todo valor que ele mostra
   * chega pelo `it` que o handler monta. Se o número já tem dono, o template está com uma cópia.
   */
  const conferirLimite = (indice: number, texto: string, valor: number): void => {
    if (NUMEROS_NEUTROS.has(valor)) return;
    const dono = valoresNumericosComDono.get(valor);
    if (dono === undefined) return;
    registrar(
      indice,
      texto,
      `limite redeclarado — ${dono.caminho} (${dono.arquivo}) já é o dono; ` +
        'passe o valor pelo handler, via `it`',
    );
  };

  /* --- Marcação: endereço escrito à mão em `href`/`action` ------------------ */

  for (const atributo of fonte.matchAll(ATRIBUTO_DE_ENDERECO)) {
    const valor = atributo[2] ?? '';
    // O que o Eta interpola tem dono do outro lado; o que sobra é o que o template escreveu.
    const escritoAMao = valor.replaceAll(INTERPOLACAO, '');
    if (!ehEnderecoNoAtributo(escritoAMao)) continue;
    registrar(
      atributo.index,
      atributo[0],
      MOTIVO_DE_ENDERECO_NO_TEMPLATE,
    );
  }

  /* --- Marcação: limite escrito à mão em `maxlength`/`max`/`min` ------------ */

  for (const atributo of fonte.matchAll(ATRIBUTO_DE_LIMITE)) {
    conferirLimite(atributo.index, atributo[0], Number((atributo[2] ?? '').replaceAll('_', '')));
  }

  /* --- Código: limite redeclarado dentro de `<% %>` ------------------------- */

  for (const bloco of fonte.matchAll(BLOCO_DE_ETA)) {
    const bruto = bloco[1] ?? '';
    if (bruto.startsWith(COMENTARIO_DO_ETA)) continue;

    const recuo = MARCADOR_DE_ABERTURA.test(bruto) ? 1 : 0;
    const codigo = bruto.slice(recuo).replace(MARCADOR_DE_FECHAMENTO, '');
    const deslocamento = bloco.index + ABERTURA_DE_BLOCO.length + recuo;

    // O parser é tolerante a `<% if (x) { %>`: o bloco não fecha, e a árvore parcial que ele
    // devolve ainda contém todos os literais, que é o que interessa aqui.
    const origem = ts.createSourceFile(arquivo, codigo, ts.ScriptTarget.ESNext, true);

    const visitar = (no: ts.Node, dentroDeTemplate: boolean): void => {
      if (ts.isTypeNode(no)) return;

      if (ts.isNumericLiteral(no)) {
        conferirLimite(
          deslocamento + no.getStart(origem),
          no.getText(origem),
          Number(no.text.replaceAll('_', '')),
        );
      } else if (
        !dentroDeTemplate &&
        (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) &&
        ROTA_COM_SEGMENTO.test(no.text)
      ) {
        registrar(
          deslocamento + no.getStart(origem),
          no.getText(origem),
          MOTIVO_DE_ENDERECO_NO_TEMPLATE,
        );
      }

      const chamada =
        ts.isCallExpression(no) && CHAMADAS_DE_TEMPLATE.has(nomeChamado(no.expression) ?? '');
      ts.forEachChild(no, (filho) => {
        visitar(filho, dentroDeTemplate || chamada);
      });
    };

    ts.forEachChild(origem, (no) => {
      visitar(no, false);
    });
  }

  return achados;
}

/* --- Relatório -------------------------------------------------------------- */

const somenteResumo = Bun.argv.includes('--resumo');

const alvos = await arquivosAlvo();

for (const arquivo of alvos) {
  if (!ARQUIVOS_INDEXADOS.test(arquivo)) continue;
  indexarDeclaracoes(arquivo, await Bun.file(join(RAIZ, arquivo)).text());
}

const achados: Achado[] = [];
for (const arquivo of alvos) {
  if (arquivo === ESTE_ARQUIVO || ARQUIVOS_DE_CONSTANTES.test(arquivo)) continue;
  const bruto = await Bun.file(join(RAIZ, arquivo)).text();
  const fonte = TEMPLATES_COM_SCRIPT_ISENTO.has(arquivo) ? semCorpoDeScript(bruto) : bruto;
  achados.push(
    ...(arquivo.endsWith(EXTENSAO_DE_TEMPLATE)
      ? analisarTemplate(arquivo, fonte)
      : analisarTypeScript(arquivo, fonte)),
  );
}

if (achados.length === 0) {
  process.stdout.write('✔ nenhum literal solto fora das exceções da regra 6\n');
  process.exit(0);
}

const porArquivo = new Map<string, Achado[]>();
for (const achado of achados) {
  const lista = porArquivo.get(achado.arquivo) ?? [];
  lista.push(achado);
  porArquivo.set(achado.arquivo, lista);
}

const linhasDoRelatorio: string[] = [];
for (const [arquivo, lista] of [...porArquivo].sort((a, b) => b[1].length - a[1].length)) {
  linhasDoRelatorio.push(`${String(lista.length).padStart(5)}  ${arquivo}`);
  if (somenteResumo) continue;
  for (const achado of lista) {
    const glosa = achado.motivo === '' ? '' : `  ← ${achado.motivo}`;
    linhasDoRelatorio.push(`         ${achado.linha}:${achado.coluna}  ${achado.trecho}${glosa}`);
  }
}

process.stdout.write(`${linhasDoRelatorio.join('\n')}\n`);
process.stdout.write(
  `\n✖ ${achados.length} literal(is) solto(s) em ${porArquivo.size} arquivo(s).\n` +
    'Mova cada um para o `constantes.ts` do módulo dono, ou justifique com\n' +
    '`// magic-values: permitido — <motivo>` na linha do literal.\n',
);
process.exit(1);
