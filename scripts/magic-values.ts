import { join, resolve } from 'node:path';
import ts from 'typescript/lib/typescript.js';

const RAIZ = resolve(import.meta.dir, '..');

const ALVOS: readonly string[] = [
  'src/**/*.ts',
  'src/web/templates/**/*.eta',
  'scripts/migrate.ts',
  'scripts/build-assets.ts',
  'scripts/seed.ts',
  'scripts/seed-volume.ts',
];

const ARQUIVOS_DE_CONSTANTES = /(?:^|\/)(?:constantes|constants)\.ts$/;

const ARQUIVOS_INDEXADOS =
  /(?:^|\/)(?:constantes|constants)\.ts$|(?:^|\/)web\/(?:rotas|routes)\/(?:mapa|routeMap)\.ts$/;

const ESTE_ARQUIVO = 'scripts/magic-values.ts';

const EXTENSAO_DE_TEMPLATE = '.eta';

const TEMPLATES_CUJO_SCRIPT_VIRA_HTML: ReadonlySet<string> = new Set([
  'src/web/templates/parciais/_script_avisos.eta',
  'src/web/templates/partials/_notices_script.eta',
]);

const BLOCO_DE_SCRIPT = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi;

const semCorpoDeScript = (fonte: string): string =>
  fonte.replaceAll(
    BLOCO_DE_SCRIPT,
    (_inteiro, abertura: string, corpo: string, fechamento: string) =>
      `${abertura}${corpo.replaceAll(/[^\n]/g, ' ')}${fechamento}`,
  );

const STATUS_HTTP = new Set([
  200, 201, 202, 204, 300, 301, 302, 303, 304, 400, 401, 403, 404, 405, 409, 410, 422, 429, 500,
  502, 503, 504,
]);

const NUMEROS_NEUTROS = new Set([0, 1]);

const SUPRESSAO = /\/\/\s*magic-values:\s*permitido\s*[—-]\s*(\S.*)$/;

const MARCADOR_DE_SUPRESSAO = /magic-values:\s*permitido\s*[—-]\s*\S/;

const LINHA_DE_COMENTARIO = /^\s*\/\//;

const justificativaDa = (linhas: readonly string[], linha: number): string | undefined => {
  for (const numero of [linha, linha - 1]) {
    const motivo = SUPRESSAO.exec(linhas[numero - 1] ?? '')?.[1];
    if (motivo === undefined) continue;
    const prosa: string[] = [];
    for (let i = numero - 1; i > 0 && LINHA_DE_COMENTARIO.test(linhas[i - 1] ?? ''); i -= 1) {
      prosa.unshift(linhas[i - 1] ?? '');
    }
    return [...prosa, motivo].join('\n');
  }
  return undefined;
};

const MAIUSCULA_COM_UNDERLINE = /^[A-Z][A-Z0-9_]*$/;

type Achado = {
  readonly arquivo: string;
  readonly linha: number;
  readonly coluna: number;
  readonly trecho: string;
  readonly motivo: string;
};

async function arquivosAlvo(): Promise<string[]> {
  const encontrados = new Set<string>();
  for (const padrao of ALVOS) {
    for await (const achado of new Bun.Glob(padrao).scan({ cwd: RAIZ })) {
      encontrados.add(achado.replaceAll('\\', '/'));
    }
  }
  return [...encontrados].sort();
}

type Dono = { readonly caminho: string; readonly arquivo: string };

const chaveDeTexto = (texto: string): string => `texto:${texto}`;

const donosDe = (texto: string): readonly Dono[] => indicePorValor.get(chaveDeTexto(texto)) ?? [];

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

type Declarado = Dono & { readonly valor: string };

const declarados: Declarado[] = [];

const textoDoLiteral = (no: ts.Node): string | undefined => {
  if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) return no.text;
  if (ts.isNumericLiteral(no)) return String(Number(no.text.replaceAll('_', '')));
  return undefined;
};

function indexarDeclaracoes(arquivo: string, fonte: string): void {
  const origem = ts.createSourceFile(arquivo, fonte, ts.ScriptTarget.ESNext, true);

  const registrar = (no: ts.Node, caminho: string): void => {
    const chave = chaveDeValor(no);
    if (chave === undefined) return;
    const dono: Dono = { caminho, arquivo };
    indicePorValor.set(chave, [...(indicePorValor.get(chave) ?? []), dono]);
    const valor = textoDoLiteral(no);
    if (valor !== undefined) declarados.push({ ...dono, valor });
    if (ts.isNumericLiteral(no)) {
      const numero = Number(no.text.replaceAll('_', ''));
      if (!valoresNumericosComDono.has(numero)) valoresNumericosComDono.set(numero, dono);
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

const declaracaoNomeada = (no: ts.Node): boolean => {
  if (!ts.isVariableDeclaration(no)) return false;
  if (!ts.isIdentifier(no.name)) return false;
  const lista = no.parent;
  const ehConst =
    ts.isVariableDeclarationList(lista) && (lista.flags & ts.NodeFlags.Const) !== 0;
  return ehConst && MAIUSCULA_COM_UNDERLINE.test(no.name.text);
};

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

const abreConteudoNovo = (no: ts.Node): boolean =>
  ts.isObjectLiteralExpression(no) || ts.isArrayLiteralExpression(no) || ts.isFunctionLike(no);

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

const nomesQueGeramTipo = (origem: ts.SourceFile): ReadonlySet<string> => {
  const nomes = new Set<string>();
  const visitar = (no: ts.Node): void => {
    if (ts.isTypeQueryNode(no) && ts.isIdentifier(no.exprName)) nomes.add(no.exprName.text);
    ts.forEachChild(no, visitar);
  };
  ts.forEachChild(origem, visitar);
  return nomes;
};

const ehTabelaDeDados = (no: ts.Node, arquivo: string, caminho: string): boolean =>
  arquivo.startsWith('scripts/seed') &&
  (ts.isArrayLiteralExpression(no) || (caminho !== '' && ts.isObjectLiteralExpression(no)));

const ehLiteralSimples = (no: ts.Node): boolean =>
  ts.isStringLiteral(no) ||
  ts.isNoSubstitutionTemplateLiteral(no) ||
  ts.isNumericLiteral(no) ||
  (ts.isPrefixUnaryExpression(no) && ts.isNumericLiteral(no.operand));

const ehEnumeracao = (no: ts.Node, caminho: string): boolean =>
  caminho !== '' && ts.isArrayLiteralExpression(no) && no.elements.every(ehLiteralSimples);

const nomeChamado = (alvo: ts.Expression): string | undefined => {
  if (ts.isIdentifier(alvo)) return alvo.text;
  if (ts.isPropertyAccessExpression(alvo)) return alvo.name.text;
  return undefined;
};

const CONSTRUTORES_DE_RESPOSTA: ReadonlySet<string> = new Set([
  'redirect',
  'json',
  'text',
  'html',
  'body',
  'newResponse',
]);

const RENDERIZADORES_DE_ERRO: ReadonlySet<string> = new Set([
  'renderizarErro',
  'paginaDeErro',
  'renderError',
  'errorPage',
]);

const POSICAO_DO_STATUS_NA_RESPOSTA = 1;

const FALA_EM_STATUS = /status/i;

const COMPARACOES = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

const COMPARACOES_DE_ORDEM = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
]);

const ehComparacao = (operador: ts.SyntaxKind): boolean =>
  COMPARACOES.has(operador) || COMPARACOES_DE_ORDEM.has(operador);

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

const TEXTO_COM_CONTEUDO = /[A-Za-zÀ-ÿ]{3,}|\d/;

const templateComProsa = (no: ts.TemplateExpression): boolean =>
  TEXTO_COM_CONTEUDO.test(no.head.text) ||
  no.templateSpans.some((trecho) => TEXTO_COM_CONTEUDO.test(trecho.literal.text));

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

const ehOperandoDeTypeof = (no: ts.StringLiteralLike): boolean => {
  if (!RESULTADOS_DE_TYPEOF.has(no.text)) return false;
  const pai = no.parent;
  if (!ts.isBinaryExpression(pai) || !COMPARACOES.has(pai.operatorToken.kind)) return false;
  const outro = pai.left === no ? pai.right : pai.left;
  return ts.isTypeOfExpression(outro);
};

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

const ehEspelhoDaChave = (no: ts.StringLiteralLike): boolean => {
  const pai = no.parent;
  return (
    ts.isPropertyAssignment(pai) &&
    pai.initializer === no &&
    nomeDaPropriedade(pai.name) === no.text
  );
};

const ehExpressaoRegular = (no: ts.Node): boolean => ts.isRegularExpressionLiteral(no);

const PALAVRA_COM_CONTEUDO = '[A-Za-zÀ-ÿ]{3,}';

const UMA_PALAVRA = new RegExp(PALAVRA_COM_CONTEUDO);

const DUAS_PALAVRAS_SEGUIDAS = new RegExp(`${PALAVRA_COM_CONTEUDO}\\s+${PALAVRA_COM_CONTEUDO}`);

const ehFrase = (no: ts.Node): boolean =>
  (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) &&
  DUAS_PALAVRAS_SEGUIDAS.test(no.text);

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
  'of',
  'the',
  'in',
  'on',
  'to',
  'for',
  'and',
  'an',
  'by',
  'with',
  'from',
]);

const SEPARADOR_DE_CAIXA = /([a-z0-9])([A-Z])/g;
const NAO_ALFANUMERICO = /[^A-Za-z0-9]+/;
const TAMANHO_MINIMO_PARA_SINGULAR = 4;

const singular = (palavra: string): string =>
  palavra.length >= TAMANHO_MINIMO_PARA_SINGULAR && palavra.endsWith('s')
    ? palavra.slice(0, -1)
    : palavra;

const palavrasDoCaminho = (caminho: string): string[] =>
  caminho
    .split('.')
    .flatMap((parte) => parte.replaceAll(SEPARADOR_DE_CAIXA, '$1 $2').split(NAO_ALFANUMERICO))
    .map((palavra) => palavra.toLowerCase())
    .filter((palavra) => palavra !== '' && !PALAVRAS_VAZIAS.has(palavra))
    .map(singular);

const PALAVRAS_DE_LIMITE: ReadonlySet<string> = new Set(['limite', 'limit']);

const ehNomeDeLimite = (caminho: string): boolean =>
  palavrasDoCaminho(caminho).some((palavra) => PALAVRAS_DE_LIMITE.has(palavra));

const contemTodas = (conjunto: ReadonlySet<string>, palavras: readonly string[]): boolean =>
  palavras.length > 0 && palavras.every((palavra) => conjunto.has(palavra));

const mesmoNome = (aqui: string, dono: string): boolean => {
  const daqui = palavrasDoCaminho(aqui);
  const doDono = palavrasDoCaminho(dono);
  return contemTodas(new Set(daqui), doDono) || contemTodas(new Set(doDono), daqui);
};

const PREFIXO_DO_TEMPLATE = /^it\./;

const CAMINHO_PONTILHADO = /[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+/g;

const PALAVRAS_MINIMAS_DO_CAMINHO = 2;

const terminaEm = (palavras: readonly string[], fim: readonly string[]): boolean =>
  fim.length <= palavras.length &&
  fim.every((palavra, i) => palavras[palavras.length - fim.length + i] === palavra);

const SO_ALFANUMERICO = /[^A-Za-z0-9]+/g;

const folhaDe = (caminho: string): string =>
  (caminho.split('.').at(-1) ?? '').replaceAll(SO_ALFANUMERICO, '').toLowerCase();

const declaracoesNomeadas = (caminho: string): readonly Declarado[] => {
  const escrito = palavrasDoCaminho(caminho.replace(PREFIXO_DO_TEMPLATE, ''));
  if (escrito.length < PALAVRAS_MINIMAS_DO_CAMINHO) return [];
  const folha = folhaDe(caminho);
  return declarados.filter(
    (declarado) =>
      folhaDe(declarado.caminho) === folha &&
      terminaEm(palavrasDoCaminho(declarado.caminho), escrito),
  );
};

const NEGACOES: ReadonlySet<string> = new Set([
  'não',
  'nao',
  'nem',
  'sem',
  'nenhum',
  'nenhuma',
  'jamais',
  'tampouco',
  'not',
  'never',
  'without',
  'none',
  'neither',
  'nor',
]);

const FIM_DE_ORACAO = /[,;:()\n—]/;

const PALAVRAS = /[\wÀ-ÿ]+/g;

const negada = (texto: string, ateA: number): boolean => {
  const oracao = texto.slice(0, ateA).split(FIM_DE_ORACAO).at(-1) ?? '';
  return [...oracao.matchAll(PALAVRAS)].some((palavra) =>
    NEGACOES.has(palavra[0].toLowerCase()),
  );
};

const constantesCitadas = (
  texto: string,
): readonly { citacao: string; alvo: Declarado; negada: boolean }[] =>
  [...texto.matchAll(CAMINHO_PONTILHADO)].flatMap((citacao) =>
    declaracoesNomeadas(citacao[0]).map((alvo) => ({
      citacao: citacao[0],
      alvo,
      negada: negada(texto, citacao.index),
    })),
  );

const donoDuplicado = (no: ts.Node, caminho: string, arquivo: string): Dono | undefined => {
  const chave = chaveDeValor(no);
  if (chave === undefined) return undefined;
  const donos = (indicePorValor.get(chave) ?? []).filter((dono) => dono.arquivo !== arquivo);
  return escolherDono(donos, caminho, ehExpressaoRegular(no) || ehFrase(no));
};

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

type Ocorrencia = {
  readonly texto: string;
  readonly arquivo: string;
  readonly linha: number;
  readonly coluna: number;
  readonly trecho: string;
};

const ocorrencias: Ocorrencia[] = [];

type Silenciado = {
  readonly arquivo: string;
  readonly linha: number;
  readonly coluna: number;
  readonly valor: string;
  readonly justificativa: string;
  readonly fechou: 'achado' | 'contagem';
};

const silenciados: Silenciado[] = [];

type Marcador = {
  readonly arquivo: string;
  readonly linha: number;
  readonly coluna: number;
  readonly trecho: string;
};

const marcadores: Marcador[] = [];

const marcadoresDe = (arquivo: string, fonte: string): Marcador[] =>
  fonte.split('\n').flatMap((linha, indice) => {
    const encontro = MARCADOR_DE_SUPRESSAO.exec(linha);
    if (encontro === null) return [];
    return [
      {
        arquivo,
        linha: indice + 1,
        coluna: encontro.index + 1,
        trecho: linha.trim().slice(0, 72),
      },
    ];
  });

type Consumo = {
  readonly arquivo: string;
  readonly linha: number;
  readonly caminho: string;
  readonly valor: string;
};

const consumos: Consumo[] = [];

const RAIZ_DO_CAMINHO = /^([A-Za-z_][A-Za-z0-9_]*)\./;

const ehCaminhoDeConstante = (caminho: string): boolean => {
  const raiz = RAIZ_DO_CAMINHO.exec(caminho)?.[1];
  return raiz !== undefined && (raiz === 'it' || MAIUSCULA_COM_UNDERLINE.test(raiz));
};

const colherConsumos = (
  arquivo: string,
  origem: ts.SourceFile,
  linhaDe: (no: ts.Node) => number,
): void => {
  const visitar = (no: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(no) &&
      no.parent !== undefined &&
      !ts.isPropertyAccessExpression(no.parent)
    ) {
      const caminho = no.getText(origem);
      if (!ehCaminhoDeConstante(caminho)) return;
      for (const alvo of declaracoesNomeadas(caminho)) {
        consumos.push({ arquivo, linha: linhaDe(no), caminho, valor: alvo.valor });
      }
    }
    ts.forEachChild(no, visitar);
  };
  ts.forEachChild(origem, visitar);
};

const OCORRENCIAS_PARA_ACUSAR = 3;

const MODULO_DO_PRODUTO = 'src/';

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

const ehTextoContavel = (texto: string): boolean =>
  UMA_PALAVRA.test(texto) && !VOCABULARIO_DO_HTML.has(texto);

type Contexto = { readonly declaracao: boolean; readonly caminho: string };

const RAIZ_DA_ARVORE: Contexto = { declaracao: false, caminho: '' };

const MOTIVO_DE_ENDERECO = 'endereço escrito à mão — use `ROTAS` (web/constantes.ts)';

function analisarTypeScript(arquivo: string, fonte: string): Achado[] {
  const origem = ts.createSourceFile(arquivo, fonte, ts.ScriptTarget.ESNext, true);
  const linhas = fonte.split('\n');
  const achados: Achado[] = [];
  const geramTipo = nomesQueGeramTipo(origem);

  const suprimida = (
    linha: number,
    coluna: number,
    valor: string,
    fechou: Silenciado['fechou'],
  ): boolean => {
    const justificativa = justificativaDa(linhas, linha);
    if (justificativa === undefined) return false;
    silenciados.push({ arquivo, linha, coluna, valor, justificativa, fechou });
    return true;
  };

  const registrar = (no: ts.Node, motivo: string): void => {
    const { line, character } = origem.getLineAndCharacterOfPosition(no.getStart(origem));
    if (suprimida(line + 1, character + 1, textoDoLiteral(no) ?? no.getText(origem), 'achado'))
      return;
    achados.push({
      arquivo,
      linha: line + 1,
      coluna: character + 1,
      trecho: no.getText(origem).replaceAll('\n', '\\n').slice(0, 72),
      motivo,
    });
  };

  const contar = (no: ts.Node, texto: string): void => {
    if (!arquivo.startsWith(MODULO_DO_PRODUTO) || !ehTextoContavel(texto)) return;
    const { line, character } = origem.getLineAndCharacterOfPosition(no.getStart(origem));
    if (suprimida(line + 1, character + 1, texto, 'contagem')) return;
    ocorrencias.push({
      texto,
      arquivo,
      linha: line + 1,
      coluna: character + 1,
      trecho: no.getText(origem).replaceAll('\n', '\\n').slice(0, 72),
    });
  };

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
      const ehChave = ts.isPropertyAssignment(no.parent) && no.parent.name === no;
      const solto = !ehChave && no.text !== '' && !textoIsento(no) && !ehEspelhoDaChave(no);
      if (solto) registrar(no, '');
    } else if (ts.isTemplateExpression(no)) {
      if (templateComProsa(no)) registrar(no, '');
    } else if (ts.isNumericLiteral(no) && !numeroIsento(no)) {
      registrar(no, '');
    }
  };

  const visitar = (no: ts.Node, contexto: Contexto): void => {
    if (ts.isTypeNode(no)) return;
    if (ts.isImportDeclaration(no) || ts.isExportDeclaration(no)) return;
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
  colherConsumos(
    arquivo,
    origem,
    (no) => origem.getLineAndCharacterOfPosition(no.getStart(origem)).line + 1,
  );
  return achados;
}

const ABERTURA_DE_BLOCO = '<%';

const FECHAMENTO_DE_BLOCO = '%>';

const ASPAS_DE_CODIGO: ReadonlySet<string> = new Set(['"', "'", '`']);

const ESCAPE_DA_STRING = '\\';

const COMENTARIO_DE_BLOCO = { abertura: '/*', fechamento: '*/' } as const;

const QUEBRA_DE_LINHA = '\n';

const CRASE = '`';

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

const ATRIBUTO_DE_ENDERECO = /\b(href|action)\s*=\s*"([^"]*)"/g;

const ATRIBUTO_DE_LIMITE = /\b(maxlength|minlength|max|min)\s*=\s*"([0-9_]+)"/g;

const NUMERO_NA_PROSA = /(?<!\d)(?<![\d][,.])\d+(?!\d)(?![,.]\d)/g;

const CHAMADAS_DE_TEMPLATE: ReadonlySet<string> = new Set(['include', 'includeFile', 'layout']);

const BARRA = '/';

const ROTA_COM_SEGMENTO = /^\/[A-Za-z0-9_:-]/;

const ehEnderecoNoAtributo = (texto: string): boolean =>
  texto === BARRA || ROTA_COM_SEGMENTO.test(texto);

const MOTIVO_DE_ENDERECO_NO_TEMPLATE =
  'endereço escrito à mão — use `it.rotas` (ROTAS, em web/constantes.ts)';

type Posicao = { readonly linha: number; readonly coluna: number };

const posicaoDe = (fonte: string, indice: number): Posicao => {
  const antes = fonte.slice(0, indice);
  const inicioDaLinha = antes.lastIndexOf('\n') + 1;
  return { linha: antes.split('\n').length, coluna: indice - inicioDaLinha + 1 };
};

const donoDoTexto = (texto: string): Dono | undefined =>
  UMA_PALAVRA.test(texto) || ehMarcaTipografica(texto) ? primeiroDono(texto) : undefined;

const MARCA_DE_CODIGO = '\u0000';

const ELEMENTOS_QUE_NAO_SAO_TEXTO: ReadonlySet<string> = new Set(['script', 'style']);

const ELEMENTOS_QUE_NOMEIAM: ReadonlySet<string> = new Set(['a', 'button', 'h1']);

const COMENTARIO_HTML = { abertura: '<!--', fechamento: '-->' } as const;

const NOME_DA_TAG = /^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9-]*)/;

const ASPAS: ReadonlySet<string> = new Set(['"', "'"]);

const ABRE_TAG = '<';
const FECHA_TAG = '>';
const FECHAMENTO_DE_TAG = '/';

const TAG_QUE_SE_FECHA = '/>';

const fechamentoDe = (fonte: string, nome: string, desde: number): number => {
  const marca = new RegExp(`${ABRE_TAG}\\s*${FECHAMENTO_DE_TAG}\\s*${nome}\\b`, 'gi');
  marca.lastIndex = desde;
  return marca.exec(fonte)?.index ?? -1;
};

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

type Recorte = {
  readonly indice: number;
  readonly texto: string;
  readonly bruto: string;
  readonly indiceDoBruto: number;
};

type Texto = Recorte & { readonly nomeia: boolean };

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

const IDENTIFICADOR = /^[/-]?[a-z][A-Za-z0-9_/-]*$/;

const SEM_LETRA_NEM_DIGITO = /^[^A-Za-zÀ-ÿ0-9]+$/;

const ULTIMO_CODIGO_ASCII = 127;

const foraDoAscii = (texto: string): boolean =>
  [...texto].some((caractere) => (caractere.codePointAt(0) ?? 0) > ULTIMO_CODIGO_ASCII);

const ehMarcaTipografica = (texto: string): boolean =>
  SEM_LETRA_NEM_DIGITO.test(texto) && foraDoAscii(texto);

const SEQUENCIA_SEM_LETRA_NEM_DIGITO = /[^A-Za-zÀ-ÿ0-9]+/g;

const ESPACO_EM_BRANCO = /\s+/g;

const NAO_ESPACO = /\S/;

const comoOHtmlDesenha = (texto: string): string => texto.replaceAll(ESPACO_EM_BRANCO, ' ');

const PEDACOS_MINIMOS_DA_COMPOSICAO = 2;

const TAMANHO_MAXIMO_DA_COMPOSICAO = 80;

type Pedaco = { readonly texto: string; readonly dono: Dono };

const pedacosDe = (texto: string): string[] | undefined => {
  if (texto.length > TAMANHO_MAXIMO_DA_COMPOSICAO) return undefined;
  const memoria = new Map<number, string[] | undefined>();

  const desde = (inicio: number): string[] | undefined => {
    if (inicio === texto.length) return [];
    if (memoria.has(inicio)) return memoria.get(inicio);
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

const donoNoCodigoDoTemplate = (texto: string, chave: string): Dono | undefined => {
  if (texto === '' || VOCABULARIO_DO_HTML.has(texto)) return undefined;
  const donos = donosDe(texto);
  if (IDENTIFICADOR.test(texto) || ehMarcaTipografica(texto)) return donos[0];
  return escolherDono(donos, chave, UMA_PALAVRA.test(texto));
};

const chaveQueCarrega = (no: ts.Node): string => {
  const pai = no.parent;
  return ts.isPropertyAssignment(pai) && pai.initializer === no
    ? (nomeDaPropriedade(pai.name) ?? '')
    : '';
};

const ATRIBUTOS_QUE_VOLTAM = /\b(name|value)\s*=\s*"([^"]*)"/g;

const ATRIBUTOS_DE_TEXTO = /\b(aria-label|title|alt|placeholder)\s*=\s*"([^"]*)"/g;

const inicioDoValor = (atributo: RegExpExecArray): number =>
  atributo.index + atributo[0].indexOf('"') + 1;

function analisarTemplate(arquivo: string, fonte: string): Achado[] {
  const linhas = fonte.split('\n');
  const achados: Achado[] = [];

  const suprimida = (
    linha: number,
    coluna: number,
    valor: string,
    fechou: Silenciado['fechou'],
  ): boolean => {
    const justificativa = justificativaDa(linhas, linha);
    if (justificativa === undefined) return false;
    silenciados.push({ arquivo, linha, coluna, valor, justificativa, fechou });
    return true;
  };

  const contar = (indice: number, texto: string, trecho: string): void => {
    if (!arquivo.startsWith(MODULO_DO_PRODUTO) || !ehTextoContavel(texto)) return;
    const { linha, coluna } = posicaoDe(fonte, indice);
    if (suprimida(linha, coluna, texto, 'contagem')) return;
    ocorrencias.push({
      texto,
      arquivo,
      linha,
      coluna,
      trecho: trecho.replaceAll('\n', '\\n').slice(0, 72),
    });
  };

  const registrar = (indice: number, trecho: string, motivo: string, valor = trecho): void => {
    const { linha, coluna } = posicaoDe(fonte, indice);
    if (suprimida(linha, coluna, valor, 'achado')) return;
    achados.push({
      arquivo,
      linha,
      coluna,
      trecho: trecho.replaceAll('\n', '\\n').slice(0, 72),
      motivo,
    });
  };

  const acusarLimite = (indice: number, texto: string, valor: number, dono: Dono): void => {
    registrar(
      indice,
      texto,
      `limite redeclarado — ${dono.caminho} (${dono.arquivo}) já é o dono; ` +
        'passe o valor pelo handler, via `it`',
      String(valor),
    );
  };

  const conferirLimite = (indice: number, texto: string, valor: number): void => {
    if (NUMEROS_NEUTROS.has(valor)) return;
    const dono = valoresNumericosComDono.get(valor);
    if (dono !== undefined) acusarLimite(indice, texto, valor, dono);
  };

  const conferirLimiteNaProsa = (indice: number, texto: string, valor: number): void => {
    if (NUMEROS_NEUTROS.has(valor)) return;
    const dono = valoresNumericosComDono.get(valor);
    if (dono !== undefined && ehNomeDeLimite(dono.caminho)) acusarLimite(indice, texto, valor, dono);
  };

  const conferirMarcas = (inicio: number, bruto: string): void => {
    for (const sequencia of bruto.matchAll(SEQUENCIA_SEM_LETRA_NEM_DIGITO)) {
      const desenhada = comoOHtmlDesenha(sequencia[0]);
      const dono = donoDoTexto(desenhada);
      if (dono === undefined) continue;
      registrar(
        inicio + sequencia.index + sequencia[0].search(NAO_ESPACO),
        desenhada,
        `separador redeclarado — ${dono.caminho} (${dono.arquivo}) já é o dono; ` +
          'passe o valor pelo handler, via `it`',
      );
    }
  };

  const acusarComposicao = (indice: number, trecho: string, texto: string): boolean => {
    const pedacos = composicaoDe(texto);
    if (pedacos === undefined) return false;
    const donos = pedacos.map((pedaco) => `${pedaco.dono.caminho} (${pedaco.dono.arquivo})`);
    registrar(
      indice,
      trecho,
      `texto composto — ${donos.join(' + ')}; ` + 'componha no handler e passe via `it`',
      texto,
    );
    return true;
  };

  const conferirTexto = (
    indice: number,
    texto: string,
    trecho: string,
    chave: string,
    dentroDeTemplate: boolean,
  ): void => {
    contar(indice, texto, trecho);
    const dono =
      donoNoCodigoDoTemplate(texto, chave) ?? donoNoCodigoDoTemplate(texto.trim(), chave);
    if (dono !== undefined) {
      registrar(
        indice,
        trecho,
        `texto redeclarado — ${dono.caminho} (${dono.arquivo}) já é o dono; ` +
          'passe o valor pelo handler, via `it`',
        texto,
      );
      return;
    }
    if (acusarComposicao(indice, trecho, texto)) return;
    if (!dentroDeTemplate && ROTA_COM_SEGMENTO.test(texto)) {
      registrar(indice, trecho, MOTIVO_DE_ENDERECO_NO_TEMPLATE, texto);
    }
  };

  for (const atributo of fonte.matchAll(ATRIBUTO_DE_ENDERECO)) {
    const valor = atributo[2] ?? '';
    const escritoAMao = comCodigoMarcado(valor).replaceAll(MARCA_DE_CODIGO, '');
    if (!ehEnderecoNoAtributo(escritoAMao)) continue;
    registrar(atributo.index, atributo[0], MOTIVO_DE_ENDERECO_NO_TEMPLATE, escritoAMao);
  }

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

  for (const atributo of fonte.matchAll(ATRIBUTOS_QUE_VOLTAM)) {
    const valor = atributo[2] ?? '';
    if (valor.includes(ABERTURA_DE_BLOCO)) continue;
    contar(atributo.index, valor, atributo[0]);
    const dono = donoNoCodigoDoTemplate(valor, '');
    if (dono === undefined) continue;
    registrar(
      atributo.index,
      atributo[0],
      `valor redeclarado — ${dono.caminho} (${dono.arquivo}) já é o dono; ` +
        'passe o valor pelo handler, via `it`',
      valor,
    );
  }

  for (const atributo of fonte.matchAll(ATRIBUTOS_DE_TEXTO)) {
    const inicio = inicioDoValor(atributo);
    for (const recorte of recortesEscritosAMao(comCodigoMarcado(atributo[2] ?? ''))) {
      const indice = inicio + recorte.indice;
      contar(indice, recorte.texto, atributo[0]);
      conferirMarcas(inicio + recorte.indiceDoBruto, recorte.bruto);
      acusarComposicao(indice, recorte.texto, recorte.texto);
      const dono = donoDoTexto(recorte.texto);
      if (dono === undefined) continue;
      registrar(
        indice,
        atributo[0],
        `texto redeclarado — ${dono.caminho} (${dono.arquivo}) já é o dono; ` +
          'passe o valor pelo handler, via `it`',
        recorte.texto,
      );
    }
  }

  for (const atributo of fonte.matchAll(ATRIBUTO_DE_LIMITE)) {
    conferirLimite(atributo.index, atributo[0], Number((atributo[2] ?? '').replaceAll('_', '')));
  }

  for (const bloco of blocosDoEta(fonte)) {
    const bruto = bloco.interno;
    if (bruto.startsWith(COMENTARIO_DO_ETA)) continue;

    const recuo = MARCADOR_DE_ABERTURA.test(bruto) ? 1 : 0;
    const codigo = bruto.slice(recuo).replace(MARCADOR_DE_FECHAMENTO, '');
    const deslocamento = bloco.indice + ABERTURA_DE_BLOCO.length + recuo;

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
    colherConsumos(
      arquivo,
      origem,
      (no) => posicaoDe(fonte, deslocamento + no.getStart(origem)).linha,
    );
  }

  return achados;
}

const somenteResumo = Bun.argv.includes('--resumo');

const alvos = await arquivosAlvo();

const indexados = alvos.filter((arquivo) => ARQUIVOS_INDEXADOS.test(arquivo));

for (const arquivo of indexados) {
  indexarDeclaracoes(arquivo, await Bun.file(join(RAIZ, arquivo)).text());
}

const cobertura = `${alvos.length} arquivo(s) varrido(s), ${indexados.length} indexado(s)`;

if (alvos.length === 0) {
  process.stdout.write(
    `✖ ${cobertura} — nenhum glob casou nada.\n` +
      'Um repositório sem literais e um verificador que não varreu arquivo nenhum imprimem\n' +
      'a mesma coisa; por isso a varredura vazia é falha, não sucesso. Confira ALVOS contra\n' +
      'os caminhos reais.\n',
  );
  process.exit(1);
}

const achados: Achado[] = [];
for (const arquivo of alvos) {
  if (arquivo === ESTE_ARQUIVO || ARQUIVOS_DE_CONSTANTES.test(arquivo)) continue;
  const bruto = await Bun.file(join(RAIZ, arquivo)).text();
  const fonte = TEMPLATES_CUJO_SCRIPT_VIRA_HTML.has(arquivo) ? semCorpoDeScript(bruto) : bruto;
  marcadores.push(...marcadoresDe(arquivo, fonte));
  achados.push(
    ...(arquivo.endsWith(EXTENSAO_DE_TEMPLATE)
      ? analisarTemplate(arquivo, fonte)
      : analisarTypeScript(arquivo, fonte)),
  );
}

const ocorrenciasPorTexto = new Map<string, number>();
for (const ocorrencia of ocorrencias) {
  ocorrenciasPorTexto.set(ocorrencia.texto, (ocorrenciasPorTexto.get(ocorrencia.texto) ?? 0) + 1);
}

const caladasPorTexto = new Map<string, number>();
for (const { fechou, valor } of silenciados) {
  if (fechou !== 'contagem') continue;
  caladasPorTexto.set(valor, (caladasPorTexto.get(valor) ?? 0) + 1);
}

const contagemQueSegura = (texto: string): boolean =>
  !indicePorValor.has(chaveDeTexto(texto)) &&
  (ocorrenciasPorTexto.get(texto) ?? 0) + (caladasPorTexto.get(texto) ?? 0) >=
    OCORRENCIAS_PARA_ACUSAR;

const silenciadasVivas = silenciados.filter(
  (silenciado) => silenciado.fechou === 'achado' || contagemQueSegura(silenciado.valor),
);

const silenciadasPorLinha = (() => {
  const porLinha = new Map<string, Silenciado[]>();
  for (const silenciado of silenciadasVivas) {
    const chave = `${silenciado.arquivo}:${silenciado.linha}`;
    porLinha.set(chave, [...(porLinha.get(chave) ?? []), silenciado]);
  }
  return porLinha;
})();

for (const [, lista] of [...silenciadasPorLinha].sort()) {
  const primeiro = lista[0];
  if (primeiro === undefined) continue;
  for (const { citacao, alvo, negada } of constantesCitadas(primeiro.justificativa)) {
    if (negada) continue;
    const calado = lista.find((silenciado) => silenciado.valor === alvo.valor);
    if (calado === undefined) continue;
    achados.push({
      arquivo: calado.arquivo,
      linha: calado.linha,
      coluna: calado.coluna,
      trecho: JSON.stringify(calado.valor).slice(0, 72),
      motivo:
        `supressão que confessa — a justificativa cita \`${citacao}\` ` +
        `(${alvo.caminho}, em ${alvo.arquivo}), que vale exatamente este literal; ` +
        'a regra 2 pede qual constante o valor NÃO é',
    });
    break;
  }
}

const prefixoComum = (aqui: string, ali: string): number => {
  const daqui = aqui.split('/');
  const dali = ali.split('/');
  let comuns = 0;
  while (comuns < daqui.length && comuns < dali.length && daqui[comuns] === dali[comuns]) {
    comuns += 1;
  }
  return comuns;
};

const contradicoes = new Set<string>();
for (const silenciado of silenciadasVivas) {
  const { arquivo, linha, coluna, valor } = silenciado;
  if (!ehMarcaTipografica(valor) && !IDENTIFICADOR.test(valor)) continue;
  const par = consumos
    .filter((consumo) => consumo.arquivo !== arquivo && consumo.valor === valor)
    .sort((aqui, ali) => prefixoComum(ali.arquivo, arquivo) - prefixoComum(aqui.arquivo, arquivo))
    .at(0);
  if (par === undefined) continue;
  const posicao = `${arquivo}:${linha}:${coluna}`;
  if (contradicoes.has(posicao)) continue;
  contradicoes.add(posicao);
  achados.push({
    arquivo,
    linha,
    coluna,
    trecho: JSON.stringify(valor).slice(0, 72),
    motivo:
      'supressão que contradiz — este mesmo literal é CONSUMIDO da constante em ' +
      `${par.arquivo}:${par.linha} (\`${par.caminho}\`); ` +
      'a mesma forma não pode ser cópia lá e decisão própria aqui',
  });
}

const linhasComTrabalho = new Set(
  silenciadasVivas.map((silenciado) => `${silenciado.arquivo}:${silenciado.linha}`),
);

for (const { arquivo, linha, coluna, trecho } of marcadores) {
  if (linhasComTrabalho.has(`${arquivo}:${linha}`)) continue;
  if (linhasComTrabalho.has(`${arquivo}:${linha + 1}`)) continue;
  achados.push({
    arquivo,
    linha,
    coluna,
    trecho,
    motivo:
      'supressão morta — não cala nada, aqui nem na linha de baixo; apague o marcador, ' +
      'que promete uma exceção de máquina que nenhuma regra pede (a prosa pode ficar)',
  });
}

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
  process.stdout.write(`✔ nenhum literal solto fora das exceções da regra 6 — ${cobertura}\n`);
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
  for (const achado of [...lista].sort((a, b) => a.linha - b.linha || a.coluna - b.coluna)) {
    const glosa = achado.motivo === '' ? '' : `  ← ${achado.motivo}`;
    linhasDoRelatorio.push(`         ${achado.linha}:${achado.coluna}  ${achado.trecho}${glosa}`);
  }
}

process.stdout.write(`${linhasDoRelatorio.join('\n')}\n`);

if (repeticoesSemDono.length > 0) {
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
  `\n✖ ${achados.length} literal(is) solto(s) em ${porArquivo.size} arquivo(s) — ${cobertura}.\n` +
    'Mova cada um para o `constantes.ts` do módulo dono, ou justifique com\n' +
    '`// magic-values: permitido — <motivo>` na linha do literal.\n',
);
process.exit(1);
