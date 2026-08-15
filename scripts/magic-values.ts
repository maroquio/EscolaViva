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
 * Ele cobra cinco coisas, e as cinco são modos de falha distintos:
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
 *      São três coisas que o template redeclara, e por muito tempo o script só via as duas que
 *      moram DENTRO de um atributo: o endereço (`href`, `action`) e o limite (`maxlength`, `max`).
 *      A terceira é o TEXTO DO CONTROLE — o que o `<a>`, o `<button>` e o `<h1>` escrevem entre as
 *      tags —, e era a porta mais larga: `TITULOS` declara "Cadastrar responsável" uma vez,
 *      `parciais/_navegacao.eta` já lê o mapa inteiro por `it.titulos`, e mesmo assim o `<button>`
 *      do formulário e os `<a class="botao">` que levam até ele repetiam a frase palavra por
 *      palavra. Três passadas de refactor fecharam os `<h1>` e o menu sem tocar nesses, porque o
 *      verificador não olhava para texto de nó nenhum. Ver `ELEMENTOS_QUE_NOMEIAM` para por que a
 *      regra para no controle e não vale para todo texto de tela.
 *
 *      E as três leituras param na MARCAÇÃO só enquanto o template deixa. O mesmo rótulo movido
 *      para dentro de um `<% %>` — `{ titulo: 'Cadastrar responsável' }`, na tabela de atalhos de
 *      `secretaria/painel.eta` — é o mesmo texto, na mesma tela, e ficava invisível só por ter
 *      mudado de posição; o mesmo valia para `include("/parciais/_vazio")` e para o `'unidade'`
 *      que o formulário de comunicado compara. Ver `donoNoCodigoDoTemplate`.
 *
 *      Cada uma das leituras acima nasceu olhando para UMA posição, e é assim que um verificador
 *      fica simétrico num eixo e cego nos outros. Fechar a cegueira é olhar para o mesmo valor onde
 *      ele não costuma estar, e foram quatro lugares:
 *
 *        - o NÚMERO na prosa da tela. "Mostra os 50 primeiros" e "notas de 0 a 10" são o mesmo teto
 *          que o handler já passa por `it`, escrito por extenso — e quando o dono muda, a frase
 *          continua igual e passa a mentir. Ver `conferirLimiteNaProsa`.
 *        - o TEXTO num atributo que não é conteúdo do documento. `aria-label` é o nome do controle
 *          para quem usa leitor de tela, e `<form aria-label="Buscar aluno">` era a quarta cópia de
 *          `ACOES.buscarAluno`, invisível porque o varredor pula o interior da tag inteira. Ver
 *          `ATRIBUTOS_DE_TEXTO`.
 *        - a MARCA TIPOGRÁFICA na marcação. `ehMarcaTipografica` já existia, e só
 *          `donoNoCodigoDoTemplate` a consultava — dentro de um `<% %>`. Na marcação quem julga é
 *          `donoDoTexto`, que exige uma palavra de três letras e por isso nunca via um `·`: a
 *          passada que trocou três separadores dentro de blocos deixou vinte na marcação, entre
 *          eles o `nome · série · turno` de dois `<option>` — que é literalmente o exemplo
 *          escrito no docblock de `APRESENTACAO.separador`. Ver `conferirMarcas`.
 *        - o PEDAÇO FIXO de um template com interpolação. `` `Notas do ${…} · ${…}` `` não é
 *          `isStringLiteral` nem `isNoSubstitutionTemplateLiteral`, então escapava das duas regras
 *          de uma vez — enquanto o `it.separador` correto estava quatro linhas abaixo, na mesma
 *          tela. Ver `conferirTexto`.
 *
 *   4. REPETIÇÃO SEM DONO — o texto que reaparece em `src/` e que nenhum `constantes.ts` declara.
 *
 *      As três regras acima têm um teto comum, e o teto não é a heurística: é o ÍNDICE. Todas
 *      perguntam "este literal coincide com uma constante que já existe?", e nenhuma consegue
 *      perguntar "este texto se repete sem que ninguém seja dono dele?". Dono faltando é invisível
 *      por construção, e é onde estava o que quatro passadas de refactor deixaram para trás: doze
 *      `<a class="botao botao--discreto">Cancelar</a>` em doze telas, com o verificador em
 *      silêncio, porque não havia nada com o que coincidir. Ver `OCORRENCIAS_PARA_ACUSAR`.
 *
 *   5. VALOR COMPOSTO — o texto que não é a CÓPIA de uma constante e sim a EMENDA de várias.
 *
 *      As quatro regras acima comparam o pedaço INTEIRO com o índice, e por isso um valor MONTADO
 *      passa por todas elas: `<button>ano letivo</button>` é acusado e `<button>· ano letivo</button>`
 *      cala. O defeito é o mesmo, e o repositório o descreve por escrito em `secretaria/aluno.eta`,
 *      onde o sobretítulo compõe `AREAS.secretaria` com `APRESENTACAO.separador` e
 *      `TITULOS.secretaria.aluno` "em vez de repetir 'Secretaria · Ficha do aluno' à mão". Nove
 *      telas irmãs compõem assim; quatro escreviam o resultado, e renomear a área no menu as
 *      deixava com o nome antigo sem que nada acusasse. Ver `composicaoDe` para o portão — e ele
 *      é estreito de propósito, porque esta é a regra deste arquivo com mais jeito de produzir
 *      falso positivo.
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
 *   bun scripts/magic-values.ts --resumo   só as contagens: por arquivo, e por texto repetido
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
/**
 * Como um texto entra e sai do índice. É uma função, e não um prefixo repetido nos dois lados,
 * porque quem consulta o índice não é só quem o alimenta: a regra do texto de nó, lá no `.eta`,
 * procura pela mesma chave que esta linha grava, e um prefixo escrito à mão nos dois lugares seria
 * a segunda fonte da verdade que este script existe para fechar — silenciosa, ainda por cima, já
 * que a busca simplesmente não acharia nada.
 */
const chaveDeTexto = (texto: string): string => `texto:${texto}`;

/** Todo mundo que declarou este texto, na ordem em que os `constantes.ts` foram lidos. */
const donosDe = (texto: string): readonly Dono[] => indicePorValor.get(chaveDeTexto(texto)) ?? [];

/** Quem declarou este texto primeiro, se alguém declarou. */
const primeiroDono = (texto: string): Dono | undefined => donosDe(texto)[0];

const chaveDeValor = (no: ts.Node): string | undefined => {
  if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) return chaveDeTexto(no.text);
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

/** Uma palavra de verdade: três letras ou mais. `'utf8'`, `'.'` e `'0'` não têm nenhuma. */
const PALAVRA_COM_CONTEUDO = '[A-Za-zÀ-ÿ]{3,}';

const UMA_PALAVRA = new RegExp(PALAVRA_COM_CONTEUDO);

const DUAS_PALAVRAS_SEGUIDAS = new RegExp(`${PALAVRA_COM_CONTEUDO}\\s+${PALAVRA_COM_CONTEUDO}`);

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

/**
 * O dono que se chama LIMITE. `LIMITES.aluno.busca`, `LIMITES.nota.maximo` e
 * `APRESENTACAO.limiteDaMensagem` dizem; `PAGINACAO.janela` e `DIAS_DA_SEMANA.sabadoJs` não.
 *
 * Lê o caminho com `palavrasDoCaminho`, e não com um `includes` no texto, pela mesma razão de
 * sempre: é ele que já sabe que `LIMITES` e `limiteDaMensagem` dizem a mesma palavra, e um segundo
 * jeito de quebrar um nome em palavras divergiria do primeiro na primeira mudança.
 */
const PALAVRA_DE_LIMITE = 'limite';

const ehNomeDeLimite = (caminho: string): boolean =>
  palavrasDoCaminho(caminho).includes(PALAVRA_DE_LIMITE);

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
  return escolherDono(donos, caminho, ehExpressaoRegular(no) || ehFrase(no));
};

/**
 * Qual dos donos responde por uma coincidência de valor — e se algum responde.
 *
 * É uma função, e não o corpo de `donoDuplicado`, porque o `.eta` faz a mesma pergunta com outra
 * matéria-prima: lá o literal chega como texto de atributo, sem nó de TypeScript para consultar.
 * As duas provas são as descritas acima, e ficam num lugar só para que continuem sendo as mesmas.
 */
const escolherDono = (
  donos: readonly Dono[],
  caminho: string,
  ehRedacao: boolean,
): Dono | undefined => {
  if (donos.length === 0) return undefined;
  if (caminho !== '') {
    const porNome = donos.find((dono) => mesmoNome(caminho, dono.caminho));
    if (porNome !== undefined) return porNome;
  }
  return ehRedacao ? donos[0] : undefined;
};

/* --- Regra 4: o valor que se repete e não tem dono nenhum ------------------- */

/**
 * Uma aparição de um texto no código varrido. É o que a regra 4 conta, e o registro guarda a
 * posição porque o relatório precisa apontar TODAS as cópias: quem for fechar o achado tem de
 * visitar as doze, e uma lista de arquivos sem linha manda a pessoa procurar de novo o que este
 * script já sabe.
 */
type Ocorrencia = {
  readonly texto: string;
  readonly arquivo: string;
  readonly linha: number;
  readonly coluna: number;
  readonly trecho: string;
};

const ocorrencias: Ocorrencia[] = [];

/**
 * A partir de quantas cópias um texto sem dono vira achado. TRÊS, e o número é a regra inteira.
 *
 * DOIS é a menor repetição que existe, e é exatamente a que a regra 2 do refactor manda não fundir:
 * duas telas escrevendo "Data" não são uma decisão dita duas vezes, são duas colunas que o
 * português nomeia igual. Medido neste repositório, o portão em dois acusa 86 textos, e a maioria
 * é par de vizinhos — "Taxa de leitura" duas vezes na MESMA tabela, "turma" e "turmas" na prosa de
 * uma tela só, "Filtrar" em dois formulários que não se conhecem. Um verificador que manda fundir
 * isso é um verificador que se aprende a ignorar.
 *
 * QUATRO deixa passar o que mais importa: "Ano letivo", "Ações", "Início", "Término", "Buscar
 * aluno", "Voltar aos alunos" e "Nenhum aluno matriculado" aparecem três vezes cada — em três
 * telas diferentes, que é o ponto. Um rótulo que atravessou três telas já é vocabulário do
 * produto, e o custo de renomeá-lo pela metade já é o mesmo de "Cancelar".
 *
 * TRÊS é a menor contagem que não se explica por coincidência de par: a terceira cópia é a prova
 * de que o texto está sendo REUSADO, e não redigido de novo por acaso. Não é o mesmo que dizer que
 * as três são um conceito só — a regra 2 continua valendo, e a resposta certa para um achado
 * destes tanto pode ser uma constante nova quanto um `// magic-values: permitido — <motivo>` em
 * cada cópia. O que a regra cobra não é o merge; é a DECISÃO escrita em algum lugar.
 *
 * A supressão, aqui, apaga a cópia da CONTAGEM e não só do relatório — e é o comportamento certo:
 * uma ocorrência justificada por escrito já foi decidida, e não é mais uma cópia à espera de dono.
 * Justificar duas das três faz a terceira deixar de ser repetição, que é literalmente verdade.
 */
const OCORRENCIAS_PARA_ACUSAR = 3;

/**
 * A regra 4 mede `src/`, e só. `scripts/seed*.ts` está fora pela regra 6 — a tabela de nomes de
 * amostra é dado, e um nome que se repete em três linhas de seed não é vocabulário de produto —, e
 * `scripts/migrate.ts` e `build-assets.ts` são ferramenta, não tela.
 */
const MODULO_DO_PRODUTO = 'src/';

/**
 * Os atributos booleanos do HTML, pelo mesmo motivo que `RESULTADOS_DE_TYPEOF`: são vocabulário
 * FECHADO de outra gramática, e ninguém os escolhe.
 *
 * `<%= marcado ? 'selected' : '' %>` escreve, do lado de dentro do bloco, exatamente o `selected`
 * que a marcação escreve solto quando não depende de condição. São onze cópias no repositório, e
 * dar um dono a elas seria criar uma constante para uma palavra-chave do HTML — enquanto a mesma
 * palavra, escrita direto na tag, continua (corretamente) não sendo cobrada de ninguém. Uma regra
 * que acusa a mesma palavra num lugar e não no outro está medindo a posição, não o valor.
 */
const VOCABULARIO_DO_HTML: ReadonlySet<string> = new Set([
  'selected',
  'checked',
  'disabled',
  'readonly',
  'required',
  'multiple',
  'hidden',
  'open',
]);

/** O que entra na contagem da regra 4: uma palavra de verdade, e nada de outra gramática. */
const ehTextoContavel = (texto: string): boolean =>
  UMA_PALAVRA.test(texto) && !VOCABULARIO_DO_HTML.has(texto);

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
   * A contagem da regra 4, e ela roda em TODO texto — batizado, enterrado em tabela ou já acusado
   * por outra regra. A contagem é uma medida do repositório, não um veredito: encolhê-la para o
   * que sobrou depois das outras regras faria o total mentir, e "3x" é o argumento inteiro deste
   * achado. Quem decide o que fazer com a posição é a emissão, lá no relatório, que não repete um
   * lugar que já tem achado.
   */
  const contar = (no: ts.Node, texto: string): void => {
    if (!arquivo.startsWith(MODULO_DO_PRODUTO) || !ehTextoContavel(texto)) return;
    const { line, character } = origem.getLineAndCharacterOfPosition(no.getStart(origem));
    if (suprimida(line + 1)) return;
    ocorrencias.push({
      texto,
      arquivo,
      linha: line + 1,
      coluna: character + 1,
      trecho: no.getText(origem).replaceAll('\n', '\\n').slice(0, 72),
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
    if (
      (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) &&
      !(ts.isPropertyAssignment(no.parent) && no.parent.name === no) &&
      !textoIsento(no)
    ) {
      contar(no, no.text);
    }
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

const FECHAMENTO_DE_BLOCO = '%>';

const ASPAS_DE_CODIGO: ReadonlySet<string> = new Set(['"', "'", '`']);

const ESCAPE_DA_STRING = '\\';

const COMENTARIO_DE_BLOCO = { abertura: '/*', fechamento: '*/' } as const;

const QUEBRA_DE_LINHA = '\n';

const CRASE = '`';

/**
 * Onde termina a string aberta em `inicio`, ou `inicio + 1` quando aquela aspa não abria string
 * nenhuma. A contrabarra escapa o próximo caractere, inclusive a própria aspa.
 *
 * A aspa simples e a dupla morrem na quebra de linha; a crase, não. É a regra do Eta, não uma
 * escolha daqui — as três expressões de `parse.ts` dizem exatamente isso —, e ela é o que segura o
 * apóstrofo escrito numa frase de comentário: sem o corte na linha, um `d'água` num `//` engoliria
 * o resto do arquivo à procura da aspa que fecha.
 *
 * Uma crase com `${…}` que interpole OUTRA crase sairia daqui no lugar errado. Não existe nenhuma
 * nos templates de hoje, e o preço de errar é uma fronteira de bloco deslocada, não um achado
 * inventado: o que cair do lado errado da fronteira é lido pela outra regra, e as duas cobram.
 */
const fimDaString = (fonte: string, inicio: number, aspa: string): number => {
  for (let i = inicio + 1; i < fonte.length; i += 1) {
    if (fonte[i] === ESCAPE_DA_STRING) {
      i += 1;
      continue;
    }
    if (fonte[i] === aspa) return i + 1;
    if (aspa !== CRASE && fonte[i] === QUEBRA_DE_LINHA) return inicio + 1;
  }
  return fonte.length;
};

/**
 * Onde o Eta começa e onde termina — a fronteira entre o que o template EXECUTA e o que ele
 * ESCREVE, e as três regras do `.eta` precisam dela pelas três razões:
 *
 *   - a do endereço apaga o bloco do valor de `href` para ver o que sobrou escrito à mão;
 *   - a do texto apaga o bloco de dentro do documento, porque código não é texto que alguém lê;
 *   - a do limite lê o que está DENTRO do bloco, que é o único pedaço de TypeScript do arquivo.
 *
 * É uma leitura só para as três, e não três iguais: um `<%_` que o Eta passasse a aceitar teria de
 * ser reconhecido nas três ao mesmo tempo, e três cópias divergiriam na primeira.
 *
 * Era um `<%([\s\S]*?)%>`, e a preguiça do `*?` custava caro: o bloco terminava no PRIMEIRO `%>`,
 * inclusive no que está dentro de um comentário do próprio código. Cinco templates deste
 * repositório documentam a armadilha do `autoTrim` escrevendo `` `%>` `` no docblock — e nos cinco
 * o bloco de abertura fechava ali, no meio da frase. O estrago era duplo e silencioso: TODO o
 * código real do arquivo (o `const legenda` de `professor/notas.eta`, entre outros) caía fora de
 * qualquer bloco e nenhuma regra o lia, enquanto a PROSA do docblock passava a ser lida como texto
 * do documento — foi de lá que saiu um "limite redeclarado" apontando para um comentário.
 *
 * Onde o `%>` conta e onde ele é texto quem decide NÃO é este arquivo: é o `parse.ts` do Eta, e
 * copiá-lo é a única forma de a fronteira daqui ser a mesma que a do motor. Ele varre à procura de
 * `'`, `"`, `` ` ``, `/*` ou da tag de fechamento — então string e comentário de BLOCO escondem o
 * `%>`, e comentário de LINHA não esconde. Parece assimetria e não é: `<% // … %>` é a forma que
 * este repositório usa para justificar uma supressão dentro do template, e ela só funciona porque o
 * Eta fecha a tag ali mesmo, no fim da linha do comentário. Ensinar `//` a esconder o `%>` — que
 * foi a primeira versão desta função — fazia o bloco seguir para dentro da MARCAÇÃO, e o `<label
 * class="campo__rotulo">` de dois formulários virava, para o verificador, um literal de TypeScript.
 */
const fimDoBloco = (fonte: string, desde: number): number => {
  let i = desde;
  while (i < fonte.length) {
    if (fonte.startsWith(FECHAMENTO_DE_BLOCO, i)) return i;
    if (fonte.startsWith(COMENTARIO_DE_BLOCO.abertura, i)) {
      const desdeOMiolo = i + COMENTARIO_DE_BLOCO.abertura.length;
      const fim = fonte.indexOf(COMENTARIO_DE_BLOCO.fechamento, desdeOMiolo);
      i = fim < 0 ? fonte.length : fim + COMENTARIO_DE_BLOCO.fechamento.length;
    } else if (ASPAS_DE_CODIGO.has(fonte[i] ?? '')) {
      i = fimDaString(fonte, i, fonte[i] ?? '');
    } else {
      i += 1;
    }
  }
  return fonte.length;
};

/** Um bloco do Eta: onde ele começa, o que ele ocupa no arquivo e o que há entre as tags. */
type BlocoDoEta = { readonly indice: number; readonly inteiro: string; readonly interno: string };

const blocosDoEta = (fonte: string): BlocoDoEta[] => {
  const blocos: BlocoDoEta[] = [];
  let posicao = 0;
  for (;;) {
    const abertura = fonte.indexOf(ABERTURA_DE_BLOCO, posicao);
    if (abertura < 0) return blocos;
    const fim = fimDoBloco(fonte, abertura + ABERTURA_DE_BLOCO.length);
    const depois = Math.min(fim + FECHAMENTO_DE_BLOCO.length, fonte.length);
    blocos.push({
      indice: abertura,
      inteiro: fonte.slice(abertura, depois),
      interno: fonte.slice(abertura + ABERTURA_DE_BLOCO.length, fim),
    });
    posicao = depois;
  }
};

const MARCADOR_DE_ABERTURA = /^[=~_-]/;
const MARCADOR_DE_FECHAMENTO = /[-_]$/;
const COMENTARIO_DO_ETA = '#';

/** `href` e `action` são os dois atributos que carregam endereço de rota numa tela deste sistema. */
const ATRIBUTO_DE_ENDERECO = /\b(href|action)\s*=\s*"([^"]*)"/g;

/**
 * Os atributos em que o navegador recebe um LIMITE. Escrever o número neles à mão é a mesma
 * segunda fonte da verdade que declará-lo num `const` do bloco — só que sem nem o nome para
 * denunciar, e é a forma que o refactor tenderia a produzir na próxima vez.
 */
const ATRIBUTO_DE_LIMITE = /\b(maxlength|minlength|max|min)\s*=\s*"([0-9_]+)"/g;

/**
 * O mesmo limite, escrito por extenso na PROSA da tela.
 *
 * `conferirLimite` já lia o atributo e o bloco `<% %>`, e não lia a única posição em que o número
 * erra sem quebrar nada: o texto que a pessoa lê. `professor/notas.eta` diz "Lançamento de notas de
 * 0 a 10, com uma casa decimal." sessenta e oito linhas acima de um `max="<%= it.notaMaxima %>"`
 * que consome `LIMITES.nota.maximo` corretamente — mesma tela, mesmo número, um com dono e o outro
 * em prosa. `secretaria/alunos.eta` promete "Mostra os 50 primeiros em ordem alfabética." sobre o
 * `LIMIT` que `LIMITES.aluno.busca` fixa no repositório. Mudar o teto no dono não muda a frase, e o
 * defeito que sobra é o pior tipo: a tela passa a MENTIR para quem a lê, e nada acusa — o número em
 * prosa não é lido por compilador, por teste nem pelo golden, que só sabe dizer que o byte mudou.
 *
 * O recorte é do número INTEIRO, e o que a vizinhança recusa é só o DÍGITO do outro lado da
 * vírgula: "R$ 10,50" é um valor formatado, e cortá-lo em `10` e `50` inventaria dois limites onde
 * há um preço. A vírgula sozinha não recusa nada, e não pode — "de 0 a 10, com uma casa decimal"
 * termina o número com vírgula, e é justamente o caso que esta regra existe para pegar.
 */
const NUMERO_NA_PROSA = /(?<!\d)(?<![\d][,.])\d+(?!\d)(?![,.]\d)/g;

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

/* --- Marcação: o texto que a pessoa lê -------------------------------------- */

/**
 * O terceiro jeito de o template redeclarar um valor: escrever o TEXTO à mão.
 *
 * As duas regras acima cobram o endereço e o limite, que são o que o template escreve DENTRO de um
 * atributo. Sobrava o que ele escreve entre as tags, e era a porta mais larga das três: `TITULOS`
 * declara "Cadastrar responsável" uma vez, `_navegacao.eta` já lê o mapa inteiro por `it.titulos`, e
 * mesmo assim o `<button>` do formulário e os dois `<a class="botao">` que levam até ele repetiam a
 * frase palavra por palavra. Três passadas de refactor fecharam os `<h1>` e o menu e não viram
 * estas — porque o verificador não olhava para texto de nó nenhum.
 *
 * O que torna isso caro não é o texto duplicado: é que o rótulo do botão e o título da tela para
 * onde ele leva são A MESMA DECISÃO. Renomear a tela sem varrer os botões deixa o sistema chamando
 * o mesmo lugar por dois nomes — o do link e o do `<h1>` que ele abre —, e nada acusa: o `.eta` não
 * passa pelo compilador, e o golden só percebe a diferença depois que ela já mudou a tela.
 *
 * DENTRO DE UM NÓ QUE NOMEIA, a coincidência de valor basta, e a assimetria contra o `.ts` é a
 * mesma que `conferirLimite` documenta: um `.ts` pode legitimamente ser o dono do próprio conceito,
 * um template não pode ser dono de nada — ele não tem `constantes.ts`, o Eta não importa
 * TypeScript, e todo texto que ele mostra ou chega pelo `it` que o handler monta ou é uma cópia.
 *
 * A ênfase em "nó que nomeia" é o conserto de uma versão anterior desta regra, que cobrava
 * coincidência de valor em QUALQUER texto de nó e por isso media o repositório inteiro contra a
 * regra 2 do refactor — merge por conceito, nunca por valor. Ela acusava dezenove lugares em que a
 * palavra bate e a decisão não: `<p class="sobretitulo">Secretaria</p>` contra
 * `VOCABULARIO.papel.secretaria`, que nomeia um papel de ACESSO e não a área do produto;
 * `<th scope="col">Responsável</th>` e o `<label>` do `select`, que nomeiam uma coluna e um campo;
 * `<p class="cartao__rotulo">Turmas</p>` contra `TITULOS.secretaria.turmas`, que nomeia uma
 * CONTAGEM; `<h2 id="lista">Turmas</h2>`, que nomeia a seção abaixo do filtro. Dezenove achados,
 * dezenove falsos — o sinal de que o portão estava no lugar errado, e não de que faltavam
 * dezenove exceções. Ver `ELEMENTOS_QUE_NOMEIAM` para onde ele passou a ficar.
 *
 * O portão de redação é UMA palavra de três letras, e não as DUAS que `ehFrase` exige de um literal
 * `.ts`. A diferença é o que cada um dos dois precisa provar. No `.ts` a posição não diz nada —
 * `'Turmas'` tanto pode ser um rótulo quanto uma chave, um token ou uma classe de CSS —, e o que
 * separa cópia de coincidência é a redação: ninguém redige "Cadastrar aluno" duas vezes por acaso.
 * No texto de um nó que nomeia, a posição já provou o que a redação provaria, e exigir duas
 * palavras deixaria passar justamente os rótulos de uma palavra só: "Turmas", "Alunos",
 * "Unidades", "Disciplinas", "Entrar". A palavra continua sendo exigida para que `0` e `%` não
 * virem achado.
 *
 * A MARCA TIPOGRÁFICA entra por fora desse portão — e é por isso que `ehMarcaTipografica`, que só
 * `donoNoCodigoDoTemplate` consultava, passa a valer também aqui. Um símbolo fora do ASCII não tem
 * português com que coincidir, então não há o que a posição precise provar: o `·` da marcação vale
 * o que vale o de dentro do bloco. Era exatamente essa a assimetria entre as duas metades do
 * template — a passada que trocou três separadores dentro de `<% %>` deixou vinte na marcação,
 * calados. Ver `conferirMarcas`, que é quem recorta a sequência antes de perguntar.
 */
const donoDoTexto = (texto: string): Dono | undefined =>
  UMA_PALAVRA.test(texto) || ehMarcaTipografica(texto) ? primeiroDono(texto) : undefined;

/**
 * A marca que substitui o código, caractere a caractere: preserva toda posição do arquivo — o
 * achado precisa apontar a linha e a coluna do arquivo de verdade, e não as de uma cópia encolhida
 * — e ao mesmo tempo PARTE o texto em volta, para que cada pedaço que a pessoa digitou seja julgado
 * por si. Em `<span><%= n %></span> turmas <%= quando %>` o que o template escreveu foi "turmas", e
 * apagar o bloco para espaço grudaria os vizinhos num borrão que nada declara.
 *
 * Precisa ser um caractere que nenhum texto de tela contém, e não um espaço: recortar em espaço
 * partiria "Cadastrar responsável" em duas palavras que nada declara.
 */
const MARCA_DE_CODIGO = '\u0000';

/**
 * `<script>` e `<style>` são outra gramática dentro do documento, como o SQL é dentro do `.ts`: o
 * que está lá dentro é JavaScript e CSS, não texto que alguém lê. A isenção de conteúdo de
 * `_script_avisos.eta` é sobre o mesmo lugar e continua valendo por si — esta linha é o que impede
 * a regra de confundir um seletor ou uma string de JS com um rótulo de tela.
 */
const ELEMENTOS_QUE_NAO_SAO_TEXTO: ReadonlySet<string> = new Set(['script', 'style']);

/**
 * Os três nós cujo texto NOMEIA alguma coisa que tem nome declarado em outro lugar. É aqui que a
 * regra cobra, e fora daqui ela não olha.
 *
 * O que os une não é serem visíveis — todo texto de tela é visível — e sim o que o texto deles
 * PROMETE:
 *
 *   - `<a>` e `<button>` são o controle. O texto de um controle é o nome do lugar aonde ele leva
 *     ou da ação que ele conclui, e esse lugar tem `<h1>`, e esse `<h1>` sai de `TITULOS`. São a
 *     mesma decisão dita duas vezes, que é exatamente o defeito: renomear a tela sem varrer os
 *     botões deixa o sistema chamando o mesmo lugar por dois nomes.
 *   - `<h1>` é o nome da própria tela, que é a mesma chave vista do outro lado. Hoje nenhum `<h1>`
 *     do repositório tem literal — as três primeiras passadas fecharam todos, e todo um deles é
 *     `<%= it.titulo %>` —, então incluí-lo não acusa nada agora; ele está aqui para que a
 *     regressão não passe calada, que é a única coisa que um verificador faz por quem vem depois.
 *
 * O que ficou de fora ficou por ser nome de outra coisa, e a lista é a razão de a regra existir
 * nesta forma: `<h2>` nomeia uma SEÇÃO da página, `<th>` uma COLUNA da tabela, `<label>` um CAMPO
 * do formulário, `<p class="cartao__rotulo">` uma CONTAGEM, `<p class="sobretitulo">` a ÁREA do
 * produto. Nenhum deles aponta para uma tela, e quando o texto de um deles bate com uma constante
 * é porque o domínio só tem uma palavra para a coisa — "Turmas" é a contagem, a coluna, a seção e
 * a tela, e renomear a TELA para "Minhas turmas" não pode renomear a coluna da tabela.
 *
 * A regra é de descendência, não de filho direto: o rótulo do cartão de `rede/painel.eta` mora num
 * `<span class="cartao__rotulo">` DENTRO do `<a class="cartao">`, e continua sendo o nome do
 * destino do clique. O que nomeia é o controle inteiro, não o nó folha em que o texto caiu.
 */
const ELEMENTOS_QUE_NOMEIAM: ReadonlySet<string> = new Set(['a', 'button', 'h1']);

const COMENTARIO_HTML = { abertura: '<!--', fechamento: '-->' } as const;

const NOME_DA_TAG = /^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9-]*)/;

const ASPAS: ReadonlySet<string> = new Set(['"', "'"]);

const ABRE_TAG = '<';
const FECHA_TAG = '>';
const FECHAMENTO_DE_TAG = '/';

/**
 * `<a/>` fecha a si mesmo e não abre nível nenhum. Nenhum dos três `ELEMENTOS_QUE_NOMEIAM` é vazio
 * no HTML, então isto nunca aparece nos templates de hoje; está aqui porque a alternativa é uma
 * contagem de aninhamento que erra para sempre a partir da primeira vez que aparecer.
 */
const TAG_QUE_SE_FECHA = '/>';

/**
 * Onde começa o `</nome>` que encerra um elemento de texto puro, a partir de `desde`.
 *
 * Existe porque dentro de `<script>` e `<style>` NADA é tag — é a regra do HTML para estes dois, e
 * é o que o varredor genérico não consegue respeitar: um `if (a < b)` em JavaScript é um `<` que
 * abre uma tag que ninguém fecha, e `fimDaTag` sairia procurando o `>` até engolir o `</script>`
 * de verdade. O elemento nunca fecharia, e o resto do arquivo passaria calado — que é o pior
 * defeito possível num verificador, porque ele sai com sucesso.
 */
const fechamentoDe = (fonte: string, nome: string, desde: number): number => {
  const marca = new RegExp(`${ABRE_TAG}\\s*${FECHAMENTO_DE_TAG}\\s*${nome}\\b`, 'gi');
  marca.lastIndex = desde;
  return marca.exec(fonte)?.index ?? -1;
};

/** Onde a tag aberta em `inicio` termina. Aspas de atributo escondem um `>` e não o encerram. */
const fimDaTag = (fonte: string, inicio: number): number => {
  let aspa: string | undefined;
  for (let i = inicio + 1; i < fonte.length; i += 1) {
    const caractere = fonte[i] ?? '';
    if (aspa !== undefined) {
      if (caractere === aspa) aspa = undefined;
    } else if (ASPAS.has(caractere)) {
      aspa = caractere;
    } else if (caractere === FECHA_TAG) {
      return i + 1;
    }
  }
  return fonte.length;
};

/** Um pedaço que a pessoa digitou, e onde ele começa no arquivo. */
type Recorte = {
  readonly indice: number;
  readonly texto: string;
  /**
   * O mesmo pedaço ANTES do recorte das pontas, e onde ele começa. O espaço em volta é conteúdo
   * para a regra da marca tipográfica e ruído para todas as outras: `APRESENTACAO.separador` vale
   * ` · ` COM os dois espaços — eles são metade da decisão —, e o pedaço entre dois `<%= %>` é
   * exatamente ` · `. Recortado, ele vira `·`, que nenhum `constantes.ts` declara, e o achado
   * sumia por causa de dois espaços.
   */
  readonly bruto: string;
  readonly indiceDoBruto: number;
};

/**
 * Um pedaço de texto do documento, e se ele está dentro de um nó que NOMEIA.
 *
 * As duas regras que leem texto de tela querem recortes diferentes do mesmo documento, e por isso
 * a marca viaja com o texto em vez de sumir num filtro: a do valor com dono só olha o que está
 * dentro de um `<a>`, `<button>` ou `<h1>` — fora dali, coincidir com uma constante é coincidir
 * com o português —, enquanto a da repetição sem dono conta TODO texto, porque um "Situação" que
 * atravessa seis telas é vocabulário do produto esteja ele num `<th>`, num `<label>` ou num botão.
 */
type Texto = Recorte & { readonly nomeia: boolean };

/**
 * Troca todo bloco `<% %>` pela marca, caractere a caractere.
 *
 * É a metade comum das duas leituras que precisam separar o que a PESSOA digitou do que o Eta
 * interpola — o texto do documento e o valor de um atributo que a pessoa lê. Mora numa função só
 * porque as duas dependem da mesma promessa, e é uma promessa fácil de quebrar escrevendo de novo:
 * o comprimento não muda, então toda posição do arquivo continua valendo depois da troca.
 */
const comCodigoMarcado = (trecho: string): string => {
  const pedacos: string[] = [];
  let posicao = 0;
  for (const bloco of blocosDoEta(trecho)) {
    pedacos.push(
      trecho.slice(posicao, bloco.indice),
      bloco.inteiro.replaceAll(/[^\n]/g, MARCA_DE_CODIGO),
    );
    posicao = bloco.indice + bloco.inteiro.length;
  }
  pedacos.push(trecho.slice(posicao));
  return pedacos.join('');
};

/**
 * Os pedaços que sobraram entre as marcas, recortados nas pontas e com a posição de cada um.
 *
 * É o que faz `<span><%= n %></span> turmas <%= quando %>` render "turmas" em vez de um borrão, e é
 * o mesmo recorte que `aria-label="Página <%= link.numero %>"` precisa para render "Página": os
 * dois são o mesmo problema — texto de gente costurado com valor de servidor —, e o segundo só
 * chegou depois. O recorte é das PONTAS e não do miolo: um texto com quebra de linha no meio
 * continua sendo um texto só, que é como a prosa das telas não vira achado.
 */
const recortesEscritosAMao = (marcado: string): Recorte[] => {
  const recortes: Recorte[] = [];
  let deslocamento = 0;
  for (const pedaco of marcado.split(MARCA_DE_CODIGO)) {
    const recortado = pedaco.trim();
    if (recortado !== '') {
      recortes.push({
        indice: deslocamento + pedaco.indexOf(recortado),
        texto: recortado,
        bruto: pedaco,
        indiceDoBruto: deslocamento,
      });
    }
    deslocamento += pedaco.length + MARCA_DE_CODIGO.length;
  }
  return recortes;
};

/**
 * Os textos que NOMEIAM no template: o que sobra dentro de um `ELEMENTOS_QUE_NOMEIAM` depois que o
 * código do Eta saiu.
 *
 * Cada trecho é recortado nas pontas, e é isso que faz o `<a>` de três linhas render o mesmo rótulo
 * que o `<button>` de uma. O que NÃO é recortado é o miolo: um parágrafo com quebra de linha no
 * meio continua sendo um texto diferente de qualquer frase declarada, e é assim que a prosa das
 * telas não vira achado.
 *
 * O varredor precisa continuar pulando `<script>`/`<style>` mesmo agora que só recolhe dentro de um
 * controle, e a razão ficou mais forte: não é mais só que um seletor de CSS não é rótulo de tela —
 * é que o corpo de um script é a única parte do arquivo onde um `<` não abre tag, e um `'</a>'` em
 * JavaScript desregularia a contagem de aninhamento de todo o resto do arquivo. Por isso o salto é
 * até o `</script>` literal (`fechamentoDe`) e não uma varredura de tags com um estado a mais.
 */
const textosDoDocumento = (fonte: string): Texto[] => {
  const marcado = comCodigoMarcado(fonte);
  const textos: Texto[] = [];

  const recolher = (inicio: number, fim: number, nomeia: boolean): void => {
    for (const recorte of recortesEscritosAMao(marcado.slice(inicio, fim))) {
      textos.push({
        ...recorte,
        indice: inicio + recorte.indice,
        indiceDoBruto: inicio + recorte.indiceDoBruto,
        nomeia,
      });
    }
  };

  let posicao = 0;
  let aninhamento = 0;
  while (posicao < marcado.length) {
    const abertura = marcado.indexOf(ABRE_TAG, posicao);
    recolher(posicao, abertura < 0 ? marcado.length : abertura, aninhamento > 0);
    if (abertura < 0) break;

    if (marcado.startsWith(COMENTARIO_HTML.abertura, abertura)) {
      const fim = marcado.indexOf(COMENTARIO_HTML.fechamento, abertura);
      posicao = fim < 0 ? marcado.length : fim + COMENTARIO_HTML.fechamento.length;
      continue;
    }

    const fim = fimDaTag(marcado, abertura);
    const textoDaTag = marcado.slice(abertura, fim);
    const tag = NOME_DA_TAG.exec(textoDaTag);
    const nome = (tag?.[2] ?? '').toLowerCase();
    const ehFechamento = tag?.[1] === FECHAMENTO_DE_TAG;
    const seFecha = ehFechamento || textoDaTag.endsWith(TAG_QUE_SE_FECHA);

    if (ELEMENTOS_QUE_NAO_SAO_TEXTO.has(nome) && !seFecha) {
      // Salta o corpo inteiro de uma vez: lá dentro nem `<` abre tag nem `>` fecha.
      const fechamento = fechamentoDe(marcado, nome, fim);
      if (fechamento < 0) break;
      posicao = fimDaTag(marcado, fechamento);
      continue;
    }

    if (ELEMENTOS_QUE_NOMEIAM.has(nome)) {
      if (ehFechamento) aninhamento = Math.max(0, aninhamento - 1);
      else if (!seFecha) aninhamento += 1;
    }
    posicao = fim;
  }

  return textos;
};

/* --- Código: o que o template escreve dentro de `<% %>` --------------------- */

/**
 * Um IDENTIFICADOR: nome de campo, alcance, caminho de parcial, sufixo de id. ASCII, começando em
 * minúscula, sem espaço e sem acento — e é a forma que separa o que o servidor também escreve do
 * que a pessoa lê na tela.
 *
 * `nome`, `turmaId`, `codigoInep`, `unidade`, `selecionados`, `/parciais/_vazio` e `-erro` estão
 * de um lado; "Responsável", "Ativa", "Cadastrar responsável" e "responsável" estão do outro. A
 * inicial minúscula é o que decide: rótulo de tela em português começa com maiúscula ou traz
 * acento, e nenhum nome de campo deste sistema tem espaço.
 */
const IDENTIFICADOR = /^[/-]?[a-z][A-Za-z0-9_/-]*$/;

/**
 * Uma MARCA TIPOGRÁFICA: nem letra, nem dígito, e ao menos um símbolo fora do ASCII — `·`, `—`,
 * `–`, `×`, `→`. É o terceiro portão de `donoNoCodigoDoTemplate`, e existe pelo mesmo motivo que os
 * outros dois: provar cópia sem cair na fusão por valor que a regra 2 proíbe.
 *
 * A pontuação ASCII é o alfabeto da COMPOSIÇÃO DE MÁQUINA — `/` junta caminho, `-` prefixa id, `:`
 * separa campo de cookie, `,` e `.` separam decimal —, e cada camada é dona legítima da sua: são
 * seis `SEPARADOR_*` valendo `'.'` neste repositório, e `ROTAS.publicas.raiz` vale `'/'` ao lado do
 * `href + '/'` de `_navegacao.eta`, que é o teste de ancestralidade e não a raiz. Casar por valor
 * ali mandaria fundir exatamente o que a regra 2 manda separar, e ainda apontaria o dono errado.
 *
 * Um símbolo fora do ASCII não compõe nada: não entra em caminho, em id nem em chave, e ninguém o
 * digita por acaso. Ele só existe para ser LIDO, e a única decisão que pode carregar é como a tela
 * apresenta dois valores lado a lado — que é `APRESENTACAO`, e é uma só. `' · '` escrito à mão na
 * legenda de `professor/notas.eta` não é uma segunda opinião sobre o separador: é a primeira,
 * copiada.
 */
const SEM_LETRA_NEM_DIGITO = /^[^A-Za-zÀ-ÿ0-9]+$/;

const ULTIMO_CODIGO_ASCII = 127;

const foraDoAscii = (texto: string): boolean =>
  [...texto].some((caractere) => (caractere.codePointAt(0) ?? 0) > ULTIMO_CODIGO_ASCII);

const ehMarcaTipografica = (texto: string): boolean =>
  SEM_LETRA_NEM_DIGITO.test(texto) && foraDoAscii(texto);

/** A maior sequência sem letra e sem dígito: é onde uma marca tipográfica pode estar. */
const SEQUENCIA_SEM_LETRA_NEM_DIGITO = /[^A-Za-zÀ-ÿ0-9]+/g;

const ESPACO_EM_BRANCO = /\s+/g;

const NAO_ESPACO = /\S/;

/**
 * O texto como o navegador o desenha: toda sequência de espaço em branco vira um espaço só. É
 * regra do HTML, e é o que faz ` ·\n      ` e ` · ` serem o mesmo separador na tela.
 */
const comoOHtmlDesenha = (texto: string): string => texto.replaceAll(ESPACO_EM_BRANCO, ' ');

/* --- Composição: o valor que não é copiado, é MONTADO ---------------------- */

/**
 * Quantos PEDAÇOS COM PALAVRA uma composição precisa ter para ser acusada. DOIS, e é o portão
 * inteiro junto com a cobertura total — ver `composicaoDe`.
 */
const PEDACOS_MINIMOS_DA_COMPOSICAO = 2;

/**
 * Até onde vale procurar composição. Uma frase de tela tem o tamanho de um sobretítulo; um
 * parágrafo de prosa não é montado a partir de constante nenhuma, e varrê-lo é só custo.
 */
const TAMANHO_MAXIMO_DA_COMPOSICAO = 80;

/** Um pedaço de uma composição: o texto e quem já é dono dele. */
type Pedaco = { readonly texto: string; readonly dono: Dono };

/**
 * Corta o texto em pedaços que TODOS têm dono, ou desiste.
 *
 * A COBERTURA É TOTAL, do primeiro ao último caractere, e é ela que impede
 * `TITULOS.secretaria.alunos` ("Alunos") de casar dentro de "Alunos matriculados": o resto seria
 * " matriculados", que nenhum `constantes.ts` declara, e a decomposição falha inteira. Uma regra
 * que aceitasse subsequência acusaria toda frase que contém um substantivo do domínio, que é
 * metade das telas.
 *
 * E cada pedaço precisa ser UMA PALAVRA DE VERDADE — três letras ou mais, o mesmo `UMA_PALAVRA`
 * das outras regras — ou uma MARCA TIPOGRÁFICA. Sem esse mínimo, `'0'`, `'.'` e `' '`, que têm
 * dono em algum `constantes.ts`, costurariam decomposições inventadas em cima de qualquer texto.
 * A pontuação ASCII fica de fora aqui pelo mesmo motivo que fica em `ehMarcaTipografica`: ela é o
 * alfabeto da composição de máquina, e cada camada é dona legítima da sua.
 *
 * A busca é gulosa pelo pedaço mais LONGO e volta atrás quando o resto não fecha, o que basta para
 * "Anos letivos" não ser lido como "Anos" mais um resto órfão.
 */
const pedacosDe = (texto: string): string[] | undefined => {
  if (texto.length > TAMANHO_MAXIMO_DA_COMPOSICAO) return undefined;
  const memoria = new Map<number, string[] | undefined>();

  const desde = (inicio: number): string[] | undefined => {
    if (inicio === texto.length) return [];
    if (memoria.has(inicio)) return memoria.get(inicio);
    // A desistência fica gravada, e não só o sucesso: se este começo não fecha, ele não fecha
    // tampouco quando outro galho voltar a ele, e sem a marca a busca refaria a subárvore inteira.
    memoria.set(inicio, undefined);
    for (let fim = texto.length; fim > inicio; fim -= 1) {
      const pedaco = texto.slice(inicio, fim);
      if (!UMA_PALAVRA.test(pedaco) && !ehMarcaTipografica(pedaco)) continue;
      if (donosDe(pedaco).length === 0) continue;
      const resto = desde(fim);
      if (resto === undefined) continue;
      const inteiro = [pedaco, ...resto];
      memoria.set(inicio, inteiro);
      return inteiro;
    }
    return undefined;
  };

  return desde(0);
};

/**
 * De qual camada a composição fala — e por que a pergunta precisa ser feita.
 *
 * "Secretaria" tem DOIS donos: `VOCABULARIO.papel.secretaria`, que nomeia um papel de acesso, e
 * `AREAS.secretaria`, que nomeia a área do produto. São conceitos diferentes com o mesmo texto, e
 * a regra 2 do refactor manda mantê-los separados — apontar o primeiro do índice mandaria o leitor
 * importar exatamente a constante errada, que é o falso positivo que `ELEMENTOS_QUE_NOMEIAM`
 * documenta.
 *
 * Numa composição, porém, os pedaços que NÃO são ambíguos dizem de que camada a frase fala:
 * "Rede · Anos letivos" tem `APRESENTACAO.separador` e `TITULOS.rede.anos`, os dois de
 * `web/constantes.ts`, e é de lá que sai o dono certo de "Rede". O desempate é o arquivo em que a
 * maioria dos pedaços sem ambiguidade mora.
 */
const arquivoDaComposicao = (pedacos: readonly string[]): string | undefined => {
  const contagem = new Map<string, number>();
  for (const pedaco of pedacos) {
    const donos = donosDe(pedaco);
    const unico = donos.length === 1 ? donos[0] : undefined;
    if (unico === undefined) continue;
    contagem.set(unico.arquivo, (contagem.get(unico.arquivo) ?? 0) + 1);
  }
  return [...contagem].sort(([, aqui], [, ali]) => ali - aqui)[0]?.[0];
};

/**
 * O texto que não é a CÓPIA de uma constante e sim a EMENDA de várias — e quem são elas.
 *
 * É o defeito que o próprio repositório descreve por escrito, em `secretaria/aluno.eta`: o
 * sobretítulo compõe `AREAS.secretaria` com `APRESENTACAO.separador` e `TITULOS.secretaria.aluno`
 * "em vez de repetir 'Secretaria · Ficha do aluno' à mão". Nove telas irmãs compõem assim, e
 * quatro escreviam o resultado. Nenhuma das regras anteriores as via, porque todas comparam o
 * pedaço INTEIRO recortado com o índice e "Secretaria · Responsáveis" não é igual a nada: medido,
 * `<button>ano letivo</button>` acusa e `<button>· ano letivo</button>` cala.
 *
 * ESTE É O TIPO DE REGRA QUE PRODUZ FALSO POSITIVO COM FACILIDADE — e a resposta a isso, quando um
 * caso escapa, é APERTAR O PORTÃO, nunca abrir exceção. São dois portões, e o segundo é este:
 *
 *   - a decomposição precisa cobrir o texto inteiro (ver `pedacosDe`);
 *   - e precisa sobrar DOIS PEDAÇOS COM PALAVRA, no mínimo. Um só é a coincidência de valor que a
 *     regra do texto de nó já mede — e cujo portão de posição (`ELEMENTOS_QUE_NOMEIAM`) levou três
 *     versões para acertar, depois de dezenove falsos. Dois é o que prova MONTAGEM: ninguém emenda
 *     duas frases declaradas por acaso, e é por isso que aqui a POSIÇÃO não entra no portão —
 *     `<p class="sobretitulo">` não nomeia tela nenhuma, e mesmo assim compõe.
 *
 * A marca tipográfica conta como pedaço e NÃO como palavra: em "Rede · Anos letivos" quem prova a
 * montagem são "Rede" e "Anos letivos", e o ` · ` é o `APRESENTACAO.separador` que os une.
 *
 * O que fica de fora fica de propósito: `<p class="sobretitulo">Conta</p>`, em `conta/senha.eta`, é
 * `AREAS.conta` byte a byte e continua passando calado — um pedaço só não é composição, e cobrar
 * coincidência de valor num `<p>` é exatamente o que produziu os dezenove falsos. Medido, o portão
 * acima acusa quatro composições no repositório e nenhum falso; afrouxá-lo para um pedaço acusaria
 * também `<p class="sobretitulo">Frequência</p>`, que é `ROTULOS.frequencia` — o nome de um DADO, e
 * não da área.
 */
const composicaoDe = (texto: string): Pedaco[] | undefined => {
  const pedacos = pedacosDe(texto);
  if (pedacos === undefined) return undefined;
  const comPalavra = pedacos.filter((pedaco) => UMA_PALAVRA.test(pedaco));
  if (comPalavra.length < PEDACOS_MINIMOS_DA_COMPOSICAO) return undefined;
  const camada = arquivoDaComposicao(pedacos);
  return pedacos.flatMap((pedaco) => {
    const donos = donosDe(pedaco);
    const dono = donos.find((candidato) => candidato.arquivo === camada) ?? donos[0];
    return dono === undefined ? [] : [{ texto: pedaco, dono }];
  });
};

/**
 * O dono de um valor escrito no CÓDIGO do template — dentro de um `<% %>` ou num atributo que o
 * navegador devolve ao servidor.
 *
 * A regra do texto de nó cobra coincidência simples, e pode: lá a POSIÇÃO já provou que aquilo
 * nomeia uma tela (ver `ELEMENTOS_QUE_NOMEIAM`). Dentro de um bloco não há posição que prove nada
 * — o mesmo `<%= %>` carrega o nome do campo, o rótulo do cartão e a prosa do parágrafo —, e
 * cobrar toda coincidência aqui traria de volta os dezenove falsos que a regra do texto de nó
 * levou três versões para eliminar: o `rotulo: 'Responsável'` do cartão de atalho é o nome de uma
 * ENTIDADE e `VOCABULARIO.papel.responsavel` é o nome de um PAPEL DE ACESSO, e
 * `quantos === 1 ? 'responsável' : 'responsáveis'` é a flexão de um substantivo, não a mensagem de
 * reserva de `MENSAGENS.usuario.rotuloDeResponsavel`.
 *
 * São então três portões, e juntos respondem pelo que um bloco escreve:
 *
 *   - IDENTIFICADOR. `'unidade'` comparado com `valores.alcance`, `'nome'` passado a `erroDe()`,
 *     `"/parciais/_vazio"` entregue ao `include()`: nenhum deles é texto que alguém lê, e todos os
 *     três o servidor também escreve — `ALCANCE`, `CAMPOS`, `TEMPLATES`. Escrever um deles errado
 *     não deixa a tela feia, faz o envio cair no alcance errado ou a página morrer em tempo de
 *     execução. Coincidiu, é cópia: o template não é dono de vocabulário nenhum.
 *
 *   - MARCA TIPOGRÁFICA, pelo mesmo raciocínio e com outra matéria-prima: o `' · '` que costura
 *     `` `Notas do ${…} · ${…}` `` não é texto que alguém redigiu nem nome de campo, é o separador
 *     de `APRESENTACAO` escrito à mão. Ver `ehMarcaTipografica` para por que o portão exige um
 *     símbolo fora do ASCII e deixa `/`, `-` e `:` de fora.
 *
 *   - REDAÇÃO E NOME, que é o critério do `.ts` — `donoDuplicado`, com a CHAVE que carrega o
 *     literal fazendo o papel do caminho. `{ titulo: 'Cadastrar responsável' }` é acusado duas
 *     vezes por motivos independentes: são duas palavras redigidas igual às de
 *     `TITULOS.secretaria.responsavelNovo`, e a chave `titulo` está dentro do nome do dono. Já
 *     `{ rotulo: 'Responsável' }`, ao lado, não é nenhum dos dois. A chave é o caminho porque a
 *     variável que a envolve (`atalhos`, `rotulos`) é andaime local: não nomeia nada fora do
 *     arquivo, e o Eta nem a exporta.
 */
const donoNoCodigoDoTemplate = (texto: string, chave: string): Dono | undefined => {
  // Texto vazio é elemento neutro, como o `0` e o `1`, e não valor: `it.valores.ano ?? ''` diz
  // "nada digitado ainda", e não repete a decisão que `VALORES_INICIAIS.anoLetivo.ano` tomou.
  // A regra do `.ts` já o isenta pelo mesmo motivo; aqui ele chegava pela porta da chave igual.
  if (texto === '' || VOCABULARIO_DO_HTML.has(texto)) return undefined;
  const donos = donosDe(texto);
  if (IDENTIFICADOR.test(texto) || ehMarcaTipografica(texto)) return donos[0];
  return escolherDono(donos, chave, DUAS_PALAVRAS_SEGUIDAS.test(texto));
};

/** A chave que carrega o literal dentro do bloco: `{ titulo: 'Cadastrar responsável' }` → `titulo`. */
const chaveQueCarrega = (no: ts.Node): string => {
  const pai = no.parent;
  return ts.isPropertyAssignment(pai) && pai.initializer === no
    ? (nomeDaPropriedade(pai.name) ?? '')
    : '';
};

/**
 * Os dois atributos cujo valor VOLTA ao servidor: `name` diz por qual chave o campo chega ao
 * handler, `value` diz qual palavra do domínio o rádio envia. O handler lê os dois por `CAMPOS` e
 * por `ALCANCE`, e `comunicados/novo.eta` escrevia `value="unidade"` e `=== 'unidade'` a duas
 * linhas de distância — a mesma decisão, duas cópias, nenhuma acusada.
 *
 * O resto do atributo fica de fora porque é interno ao documento, e a diferença é de conceito:
 * `id="cpf"` e `for="cpf"` nomeiam um elemento da página, `type="email"` é um tipo de campo do
 * HTML, `aria-invalid="true"` é o valor booleano do ARIA — e trocá-lo por `BOOLEANOS_DE_AMBIENTE`,
 * que é o `'true'` de variável de ambiente, seria fundir por valor exatamente o que a regra 2 manda
 * separar. Medido: os três atributos internos sozinhos produzem 222 achados, e a maioria pede a
 * linha ilegível que a regra 5 recusa (`id="<%= it.campos.turma.nome %><%= it.sufixos.erro %>"`).
 */
const ATRIBUTOS_QUE_VOLTAM = /\b(name|value)\s*=\s*"([^"]*)"/g;

/**
 * Os atributos que carregam TEXTO LIDO PELA PESSOA — e a regra que os lê é a do texto de nó, não a
 * do código.
 *
 * `aria-label`, `title`, `alt` e `placeholder` não são conteúdo do documento, mas são a mesma
 * promessa que `ELEMENTOS_QUE_NOMEIAM` faz: o `aria-label` de um controle é o NOME dele para quem
 * usa leitor de tela, exatamente como o texto entre as tags é o nome dele para quem enxerga. Quando
 * os dois nomes existem, são a mesma decisão dita duas vezes — e foi assim que
 * `<form role="search" aria-label="Buscar aluno">` ficou sendo a QUARTA cópia de `ACOES.buscarAluno`
 * enquanto as outras três já liam `it.acoes.buscarAluno`: o varredor de texto pula o interior de uma
 * tag inteira, então nenhuma das três regras de marcação chegava a olhar para lá.
 *
 * O que ficou de fora ficou pelo motivo oposto, e é o conserto que a passada anterior fez de
 * propósito: `id`, `for`, `class` e `type` carregam IDENTIFICADOR ou PALAVRA DA ESPECIFICAÇÃO, não
 * texto — medidos, produzem 222 achados, entre eles um `aria-invalid="true"` casando com o `'true'`
 * de variável de ambiente. A linha aqui é essa: entra o atributo que alguém LÊ, fica fora o que
 * nomeia um elemento ou repete uma palavra do HTML.
 */
const ATRIBUTOS_DE_TEXTO = /\b(aria-label|title|alt|placeholder)\s*=\s*"([^"]*)"/g;

/** Onde começa o valor de um atributo casado: logo depois da primeira aspa. */
const inicioDoValor = (atributo: RegExpExecArray): number =>
  atributo.index + atributo[0].indexOf('"') + 1;

function analisarTemplate(arquivo: string, fonte: string): Achado[] {
  const linhas = fonte.split('\n');
  const achados: Achado[] = [];

  const suprimida = (linha: number): boolean => {
    const atual = linhas[linha - 1] ?? '';
    const anterior = linhas[linha - 2] ?? '';
    return SUPRESSAO.test(atual) || SUPRESSAO.test(anterior);
  };

  /** A contagem da regra 4 no template. Vale o que vale no `.ts`: conta tudo, não julga nada. */
  const contar = (indice: number, texto: string, trecho: string): void => {
    if (!arquivo.startsWith(MODULO_DO_PRODUTO) || !ehTextoContavel(texto)) return;
    const { linha, coluna } = posicaoDe(fonte, indice);
    if (suprimida(linha)) return;
    ocorrencias.push({
      texto,
      arquivo,
      linha,
      coluna,
      trecho: trecho.replaceAll('\n', '\\n').slice(0, 72),
    });
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

  const acusarLimite = (indice: number, texto: string, dono: Dono): void => {
    registrar(
      indice,
      texto,
      `limite redeclarado — ${dono.caminho} (${dono.arquivo}) já é o dono; ` +
        'passe o valor pelo handler, via `it`',
    );
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
    if (dono !== undefined) acusarLimite(indice, texto, dono);
  };

  /**
   * O mesmo número, na PROSA da tela — e aqui a coincidência de valor não basta.
   *
   * Nas duas posições acima o lugar já prova o que o número é: `maxlength="120"` é um limite porque
   * o atributo se chama assim, e `const NOME_MAXIMO = 120` num bloco é um limite porque a `const`
   * se chama assim. Numa frase não há posição que prove nada — o número tanto pode ser um teto
   * quanto um passo, um ordinal ou uma contagem —, e cobrar toda coincidência mede o repositório
   * contra a regra 2. Medido: "Passo 2 · Mensagem" casava com `APRESENTACAO.colunaDeDoisDigitos`,
   * "6º ano, 1ª série" casava com `DIAS_DA_SEMANA.sabadoJs`, e nenhum dos dois é um limite — são
   * três falsos para dois verdadeiros.
   *
   * O que decide é a mesma coisa que decide o resto deste arquivo: **o nome é a documentação**, e é
   * a forma exata de `ehPosicaoDeStatus` — lá um número é status onde o código em volta o CHAMA de
   * status; aqui um número é limite onde o DONO se chama limite. `LIMITES.aluno.busca` e
   * `LIMITES.nota.maximo` dizem; `APRESENTACAO.colunaDeDoisDigitos` e `DIAS_DA_SEMANA.sabadoJs` não.
   *
   * O que fica de fora fica de fora de propósito: uma frase que redigisse `PAGINACAO.janela` por
   * extenso passa calada, e passar calado é o preço certo. Um verificador que acusa três coisas
   * erradas para pegar duas certas é um verificador que se aprende a ignorar — e aí ele não pega
   * nem as duas.
   */
  const conferirLimiteNaProsa = (indice: number, texto: string, valor: number): void => {
    if (NUMEROS_NEUTROS.has(valor)) return;
    const dono = valoresNumericosComDono.get(valor);
    if (dono !== undefined && ehNomeDeLimite(dono.caminho)) acusarLimite(indice, texto, dono);
  };

  /**
   * A MARCA TIPOGRÁFICA na MARCAÇÃO — a metade do template que a regra não olhava.
   *
   * `ehMarcaTipografica` só era consultada por `donoNoCodigoDoTemplate`, dentro de um `<% %>`. Na
   * marcação quem julga é `donoDoTexto`, que exige uma palavra de três letras e por isso nunca via
   * um `·`: a passada que trocou três separadores dentro de blocos deixou vinte na marcação, entre
   * eles o `<%= turma.nome %> · <%= turma.serie %> · <%= turma.turno %>` de dois `<option>` — que é
   * LITERALMENTE o exemplo escrito no docblock de `APRESENTACAO.separador` ("nome · série ·
   * turno"). O mesmo valor, na mesma tela, acusado de um lado da fronteira e calado do outro.
   *
   * O recorte é a MAIOR sequência sem letra e sem dígito, e ela sai do texto CRU, não do recortado:
   * `APRESENTACAO.separador` vale ` · ` COM os dois espaços — eles são metade da decisão —, e o
   * recorte das pontas os comia, deixando um `·` que nenhum `constantes.ts` declara. O espaço em
   * branco é colapsado porque é o que o HTML faz: `</strong> ·\n      <a` desenha ` · ` na tela, e
   * a quebra de linha é do arquivo, não do texto.
   *
   * A POSIÇÃO não entra no portão, e é a diferença para o texto de nó: um símbolo fora do ASCII não
   * compõe caminho, id nem chave, ninguém o digita por acaso, e a única decisão que ele pode
   * carregar é como a tela apresenta dois valores lado a lado. Não há coincidência de português a
   * temer, então não há `ELEMENTOS_QUE_NOMEIAM` a exigir — o `·` de um `<option>` é tão separador
   * quanto o de um `<a>`.
   */
  const conferirMarcas = (inicio: number, bruto: string): void => {
    for (const sequencia of bruto.matchAll(SEQUENCIA_SEM_LETRA_NEM_DIGITO)) {
      const desenhada = comoOHtmlDesenha(sequencia[0]);
      const dono = donoDoTexto(desenhada);
      if (dono === undefined) continue;
      // Aponta o SÍMBOLO, e não o espaço que o antecede: a sequência pode começar na quebra de
      // linha da linha anterior, e o achado tem de cair onde a pessoa vê a marca.
      registrar(
        inicio + sequencia.index + sequencia[0].search(NAO_ESPACO),
        desenhada,
        `separador redeclarado — ${dono.caminho} (${dono.arquivo}) já é o dono; ` +
          'passe o valor pelo handler, via `it`',
      );
    }
  };

  /**
   * A COMPOSIÇÃO: o sobretítulo que EMENDA a área, o separador e o título em vez de compô-los.
   *
   * Devolve se acusou, porque a metade do código precisa da resposta — lá a composição concorre com
   * a regra do endereço pela mesma posição, e um lugar tem direito a um achado só.
   */
  const acusarComposicao = (indice: number, trecho: string, texto: string): boolean => {
    const pedacos = composicaoDe(texto);
    if (pedacos === undefined) return false;
    const donos = pedacos.map((pedaco) => `${pedaco.dono.caminho} (${pedaco.dono.arquivo})`);
    registrar(
      indice,
      trecho,
      `texto composto — ${donos.join(' + ')}; ` + 'componha no handler e passe via `it`',
    );
    return true;
  };

  /**
   * O texto que o bloco `<% %>` escreve — venha ele de um literal inteiro ou de um PEDAÇO FIXO de
   * template, que é a mesma coisa vista de outro ângulo.
   *
   * `` `Notas do ${…} · ${…} · ${…}` `` não é um `TemplateExpression` por acaso: é a forma que uma
   * frase toma quando ela interpola um valor. E era exatamente por isso que ela passava calada —
   * `TemplateExpression` não é `isStringLiteral` nem `isNoSubstitutionTemplateLiteral`, então nem
   * entrava na contagem da repetição nem era consultada na regra do dono, enquanto o mesmo arquivo,
   * quatro linhas abaixo, consumia `it.separador` corretamente. O docblock de `notas.eta` chegava a
   * afirmar que "os separadores chegam em `it.separador`": verdade numa linha, falsa na outra.
   *
   * Cada pedaço é julgado por si; o que ele interpola não é problema dele, e já tem dono do outro
   * lado. A CONTAGEM da regra 4 recebe o texto cru, como qualquer literal — e a busca pelo dono
   * recebe as duas leituras que um pedaço encostado numa interpolação tem, pelo motivo explicado
   * três linhas abaixo dela.
   */
  const conferirTexto = (
    indice: number,
    texto: string,
    trecho: string,
    chave: string,
    dentroDeTemplate: boolean,
  ): void => {
    contar(indice, texto, trecho);
    // Quem tem dono é apontado pelo dono: o achado que diz de ONDE importar vale mais do que o
    // que diz apenas "escrito à mão". A regra do endereço fica com o que não tem dono nenhum,
    // que é justamente a rota inventada no template — o caso para o qual ela existe.
    // Duas leituras, porque um pedaço encostado numa interpolação tem duas: `' · '` É o valor, e os
    // espaços dele são metade da decisão de `APRESENTACAO.separador`; já em `` `Cadastrar aluno ${n}` ``
    // o espaço final é a costura, e a frase é o que sobra. Consultar só o texto cru deixaria a
    // segunda escapar por um espaço.
    const dono =
      donoNoCodigoDoTemplate(texto, chave) ?? donoNoCodigoDoTemplate(texto.trim(), chave);
    if (dono !== undefined) {
      registrar(
        indice,
        trecho,
        `texto redeclarado — ${dono.caminho} (${dono.arquivo}) já é o dono; ` +
          'passe o valor pelo handler, via `it`',
      );
      return;
    }
    // A composição vale nas DUAS metades do template pelo motivo de sempre: um rótulo montado à mão
    // não deixa de ser montado por ter mudado de posição. Hoje ela não acusa nada aqui — os quatro
    // sobretítulos compostos estão todos na marcação —, e é justamente por isso que a linha entra
    // agora: mover um deles para dentro de um `<% %>` não pode apagá-lo do relatório.
    if (acusarComposicao(indice, trecho, texto)) return;
    if (!dentroDeTemplate && ROTA_COM_SEGMENTO.test(texto)) {
      registrar(indice, trecho, MOTIVO_DE_ENDERECO_NO_TEMPLATE);
    }
  };

  /* --- Marcação: endereço escrito à mão em `href`/`action` ------------------ */

  for (const atributo of fonte.matchAll(ATRIBUTO_DE_ENDERECO)) {
    const valor = atributo[2] ?? '';
    // O que o Eta interpola tem dono do outro lado; o que sobra é o que o template escreveu.
    const escritoAMao = comCodigoMarcado(valor).replaceAll(MARCA_DE_CODIGO, '');
    if (!ehEnderecoNoAtributo(escritoAMao)) continue;
    registrar(
      atributo.index,
      atributo[0],
      MOTIVO_DE_ENDERECO_NO_TEMPLATE,
    );
  }

  /* --- Marcação: texto de nó que já tem dono -------------------------------- */

  for (const { indice, texto, bruto, indiceDoBruto, nomeia } of textosDoDocumento(fonte)) {
    contar(indice, texto, texto);
    for (const numero of texto.matchAll(NUMERO_NA_PROSA)) {
      conferirLimiteNaProsa(indice + numero.index, texto, Number(numero[0]));
    }
    conferirMarcas(indiceDoBruto, bruto);
    acusarComposicao(indice, texto, texto);
    const dono = nomeia ? donoDoTexto(texto) : undefined;
    if (dono === undefined) continue;
    registrar(
      indice,
      texto,
      `texto redeclarado — ${dono.caminho} (${dono.arquivo}) já é o dono; ` +
        'passe o valor pelo handler, via `it`',
    );
  }

  /* --- Marcação: o valor de `name`/`value`, que volta ao servidor ----------- */

  for (const atributo of fonte.matchAll(ATRIBUTOS_QUE_VOLTAM)) {
    const valor = atributo[2] ?? '';
    // O que o Eta interpola tem dono do outro lado; o que sobra é o que o template escreveu.
    if (valor.includes(ABERTURA_DE_BLOCO)) continue;
    contar(atributo.index, valor, atributo[0]);
    const dono = donoNoCodigoDoTemplate(valor, '');
    if (dono === undefined) continue;
    registrar(
      atributo.index,
      atributo[0],
      `valor redeclarado — ${dono.caminho} (${dono.arquivo}) já é o dono; ` +
        'passe o valor pelo handler, via `it`',
    );
  }

  /* --- Marcação: o texto de `aria-label`/`title`/`alt`/`placeholder` -------- */

  for (const atributo of fonte.matchAll(ATRIBUTOS_DE_TEXTO)) {
    const inicio = inicioDoValor(atributo);
    for (const recorte of recortesEscritosAMao(comCodigoMarcado(atributo[2] ?? ''))) {
      const indice = inicio + recorte.indice;
      contar(indice, recorte.texto, atributo[0]);
      // As mesmas duas leituras do texto de nó, pela razão de sempre: uma regra que vale numa
      // posição e não na outra mede a posição, não o valor. Hoje nenhum `aria-label` do
      // repositório traz marca ou composição — as duas linhas existem para que a próxima traga.
      conferirMarcas(inicio + recorte.indiceDoBruto, recorte.bruto);
      acusarComposicao(indice, recorte.texto, recorte.texto);
      // Vale a coincidência simples, como no texto de nó e pela mesma razão: o `aria-label` de um
      // controle é o NOME dele, e a posição já provou o que a redação provaria.
      const dono = donoDoTexto(recorte.texto);
      if (dono === undefined) continue;
      registrar(
        indice,
        atributo[0],
        `texto redeclarado — ${dono.caminho} (${dono.arquivo}) já é o dono; ` +
          'passe o valor pelo handler, via `it`',
      );
    }
  }

  /* --- Marcação: limite escrito à mão em `maxlength`/`max`/`min` ------------ */

  for (const atributo of fonte.matchAll(ATRIBUTO_DE_LIMITE)) {
    conferirLimite(atributo.index, atributo[0], Number((atributo[2] ?? '').replaceAll('_', '')));
  }

  /* --- Código: o que o bloco `<% %>` redeclara ------------------------------ */

  for (const bloco of blocosDoEta(fonte)) {
    const bruto = bloco.interno;
    if (bruto.startsWith(COMENTARIO_DO_ETA)) continue;

    const recuo = MARCADOR_DE_ABERTURA.test(bruto) ? 1 : 0;
    const codigo = bruto.slice(recuo).replace(MARCADOR_DE_FECHAMENTO, '');
    const deslocamento = bloco.indice + ABERTURA_DE_BLOCO.length + recuo;

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
        (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) &&
        !(ts.isPropertyAssignment(no.parent) && no.parent.name === no)
      ) {
        conferirTexto(
          deslocamento + no.getStart(origem),
          no.text,
          no.getText(origem),
          chaveQueCarrega(no),
          dentroDeTemplate,
        );
      } else if (ts.isTemplateExpression(no)) {
        // O `+ 1` pula o delimitador com que cada pedaço começa — a crase, no primeiro, e o `}`
        // que fecha a interpolação anterior, nos demais —, para que a coluna do achado seja a do
        // texto e não a da costura.
        for (const parte of [no.head, ...no.templateSpans.map((trecho) => trecho.literal)]) {
          conferirTexto(
            deslocamento + parte.getStart(origem) + 1,
            parte.text,
            parte.getText(origem),
            chaveQueCarrega(no),
            dentroDeTemplate,
          );
        }
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

/**
 * A regra 4 só pode ser decidida com o repositório inteiro lido: "três vezes" é uma medida do
 * conjunto, e nenhum arquivo sabe sozinho que é a terceira cópia. Por isso ela não roda dentro de
 * `analisarTypeScript`/`analisarTemplate` — lá se CONTA, aqui se ACUSA.
 */
const repeticoesSemDono = (() => {
  const porTexto = new Map<string, Ocorrencia[]>();
  for (const ocorrencia of ocorrencias) {
    porTexto.set(ocorrencia.texto, [...(porTexto.get(ocorrencia.texto) ?? []), ocorrencia]);
  }
  return [...porTexto]
    .filter(
      ([texto, lista]) =>
        lista.length >= OCORRENCIAS_PARA_ACUSAR && !indicePorValor.has(chaveDeTexto(texto)),
    )
    .sort(([, aqui], [, ali]) => ali.length - aqui.length);
})();

/**
 * Uma posição que já tem achado não ganha um segundo. A contagem continua valendo o que valia — um
 * `href` escrito à mão que também se repete três vezes conta como a terceira cópia —, mas o
 * relatório aponta cada lugar UMA vez, com o motivo mais específico que houver.
 */
const jaAcusado = new Set(achados.map((achado) => `${achado.arquivo}:${achado.linha}:${achado.coluna}`));

for (const [, lista] of repeticoesSemDono) {
  for (const ocorrencia of lista) {
    if (jaAcusado.has(`${ocorrencia.arquivo}:${ocorrencia.linha}:${ocorrencia.coluna}`)) continue;
    achados.push({
      arquivo: ocorrencia.arquivo,
      linha: ocorrencia.linha,
      coluna: ocorrencia.coluna,
      trecho: ocorrencia.trecho,
      motivo: `repetido ${lista.length}× e sem dono — nenhum \`constantes.ts\` declara este texto`,
    });
  }
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
  // Na ordem do arquivo: o relatório é uma lista de tarefas, e quem for fechá-la desce a tela uma
  // vez só. A regra 4 entra depois de todas as outras e chegaria fora de ordem.
  for (const achado of [...lista].sort((a, b) => a.linha - b.linha || a.coluna - b.coluna)) {
    const glosa = achado.motivo === '' ? '' : `  ← ${achado.motivo}`;
    linhasDoRelatorio.push(`         ${achado.linha}:${achado.coluna}  ${achado.trecho}${glosa}`);
  }
}

process.stdout.write(`${linhasDoRelatorio.join('\n')}\n`);

if (repeticoesSemDono.length > 0) {
  // A lista por VALOR, que o inventário por arquivo não consegue mostrar: é ela que responde
  // "quantas telas mudam se eu declarar este texto?", e é por ela que se escolhe o dono.
  const linhasDaRepeticao = repeticoesSemDono.flatMap(([texto, lista]) => {
    const arquivos = [...new Set(lista.map((ocorrencia) => ocorrencia.arquivo))];
    return [
      `${String(lista.length).padStart(5)}×  ${JSON.stringify(texto)}`,
      ...(somenteResumo ? [] : arquivos.map((arquivo) => `         ${arquivo}`)),
    ];
  });
  process.stdout.write(
    `\nRepetição sem dono — ${repeticoesSemDono.length} texto(s) com ` +
      `${OCORRENCIAS_PARA_ACUSAR}+ cópias e nenhuma constante:\n${linhasDaRepeticao.join('\n')}\n`,
  );
}

process.stdout.write(
  `\n✖ ${achados.length} literal(is) solto(s) em ${porArquivo.size} arquivo(s).\n` +
    'Mova cada um para o `constantes.ts` do módulo dono, ou justifique com\n' +
    '`// magic-values: permitido — <motivo>` na linha do literal.\n',
);
process.exit(1);
