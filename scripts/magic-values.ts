import { join, resolve } from 'node:path';
import ts from 'typescript/lib/typescript.js';

const ROOT = resolve(import.meta.dir, '..');

const TARGETS: readonly string[] = [
  'src/**/*.ts',
  'src/web/templates/**/*.eta',
  'scripts/migrate.ts',
  'scripts/build-assets.ts',
  'scripts/seed.ts',
  'scripts/seed-volume.ts',
];

const CONSTANTS_FILES = /(?:^|\/)constants\.ts$/;

const INDEXED_FILES = /(?:^|\/)constants\.ts$|(?:^|\/)web\/routes\/routeMap\.ts$/;

const THIS_FILE = 'scripts/magic-values.ts';

const TEMPLATE_EXTENSION = '.eta';

const TEMPLATES_WHOSE_SCRIPT_BECOMES_HTML: ReadonlySet<string> = new Set([
  'src/web/templates/partials/_notices_script.eta',
]);

const SCRIPT_BLOCK = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi;

const withoutScriptBody = (source: string): string =>
  source.replaceAll(
    SCRIPT_BLOCK,
    (_whole, opening: string, body: string, closing: string) =>
      `${opening}${body.replaceAll(/[^\n]/g, ' ')}${closing}`,
  );

const HTTP_STATUSES = new Set([
  200, 201, 202, 204, 300, 301, 302, 303, 304, 400, 401, 403, 404, 405, 409, 410, 422, 429, 500,
  502, 503, 504,
]);

const NEUTRAL_NUMBERS = new Set([0, 1]);

const SUPPRESSION = /\/\/\s*magic-values:\s*permitido\s*[—-]\s*(\S.*)$/;

const SUPPRESSION_MARKER = /magic-values:\s*permitido\s*[—-]\s*\S/;

const COMMENT_LINE = /^\s*\/\//;

const justificationFor = (lines: readonly string[], line: number): string | undefined => {
  for (const candidate of [line, line - 1]) {
    const reason = SUPPRESSION.exec(lines[candidate - 1] ?? '')?.[1];
    if (reason === undefined) continue;
    const prose: string[] = [];
    for (let i = candidate - 1; i > 0 && COMMENT_LINE.test(lines[i - 1] ?? ''); i -= 1) {
      prose.unshift(lines[i - 1] ?? '');
    }
    return [...prose, reason].join('\n');
  }
  return undefined;
};

const UPPER_SNAKE_CASE = /^[A-Z][A-Z0-9_]*$/;

type Finding = {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly snippet: string;
  readonly reason: string;
};

async function targetFiles(): Promise<string[]> {
  const found = new Set<string>();
  for (const pattern of TARGETS) {
    for await (const match of new Bun.Glob(pattern).scan({ cwd: ROOT })) {
      found.add(match.replaceAll('\\', '/'));
    }
  }
  return [...found].sort();
}

type Owner = { readonly path: string; readonly file: string };

const textKey = (text: string): string => `text:${text}`;

const ownersOf = (text: string): readonly Owner[] => indexByValue.get(textKey(text)) ?? [];

const firstOwner = (text: string): Owner | undefined => ownersOf(text)[0];

const valueKey = (node: ts.Node): string | undefined => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return textKey(node.text);
  }
  if (ts.isNumericLiteral(node)) return `number:${Number(node.text.replaceAll('_', ''))}`;
  if (ts.isRegularExpressionLiteral(node)) return `expression:${node.text}`;
  return undefined;
};

const propertyName = (name: ts.PropertyName): string | undefined => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
};

const indexByValue = new Map<string, Owner[]>();
const ownedNumericValues = new Map<number, Owner>();

type DeclaredValue = Owner & { readonly value: string };

const declaredValues: DeclaredValue[] = [];

const literalText = (node: ts.Node): string | undefined => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return String(Number(node.text.replaceAll('_', '')));
  return undefined;
};

function indexDeclarations(file: string, source: string): void {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true);

  const record = (node: ts.Node, path: string): void => {
    const key = valueKey(node);
    if (key === undefined) return;
    const owner: Owner = { path, file };
    indexByValue.set(key, [...(indexByValue.get(key) ?? []), owner]);
    const value = literalText(node);
    if (value !== undefined) declaredValues.push({ ...owner, value });
    if (ts.isNumericLiteral(node)) {
      const num = Number(node.text.replaceAll('_', ''));
      if (!ownedNumericValues.has(num)) ownedNumericValues.set(num, owner);
    }
  };

  const visit = (node: ts.Node, path: string): void => {
    if (ts.isTypeNode(node)) return;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.initializer !== undefined) visit(node.initializer, node.name.text);
      return;
    }

    if (ts.isPropertyAssignment(node)) {
      const key = propertyName(node.name);
      const ahead = key === undefined ? path : `${path}.${key}`;
      visit(node.initializer, ahead);
      return;
    }

    if (path !== '') record(node, path);
    ts.forEachChild(node, (child) => {
      visit(child, path);
    });
  };

  ts.forEachChild(sourceFile, (node) => {
    visit(node, '');
  });
}

const isNamedDeclaration = (node: ts.Node): boolean => {
  if (!ts.isVariableDeclaration(node)) return false;
  if (!ts.isIdentifier(node.name)) return false;
  const list = node.parent;
  const isConst = ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0;
  return isConst && UPPER_SNAKE_CASE.test(node.name.text);
};

const withoutWrapper = (node: ts.Node): ts.Node => {
  let current = node;
  while (
    current.parent !== undefined &&
    (ts.isAsExpression(current.parent) ||
      ts.isSatisfiesExpression(current.parent) ||
      ts.isParenthesizedExpression(current.parent))
  ) {
    current = current.parent;
  }
  return current;
};

const opensNewContent = (node: ts.Node): boolean =>
  ts.isObjectLiteralExpression(node) ||
  ts.isArrayLiteralExpression(node) ||
  ts.isFunctionLike(node);

const isTextOnly = (node: ts.Node): boolean => {
  if (ts.isParenthesizedExpression(node)) return isTextOnly(node.expression);
  if (ts.isBinaryExpression(node)) {
    return (
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      isTextOnly(node.left) &&
      isTextOnly(node.right)
    );
  }
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node)
  );
};

const expressionBody = (node: ts.Node): ts.Node | undefined =>
  ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)
    ? node.body
    : undefined;

const isNamedValue = (node: ts.Node): boolean => {
  let textOnly = isTextOnly(node);
  for (
    let current = withoutWrapper(node);
    current.parent !== undefined;
    current = withoutWrapper(current.parent)
  ) {
    const parent = current.parent;
    if (ts.isVariableDeclaration(parent)) {
      return parent.initializer === current && isNamedDeclaration(parent);
    }
    if (ts.isFunctionLike(parent)) {
      const body = expressionBody(parent);
      if (!textOnly || body === undefined || !isTextOnly(body)) return false;
    } else if (opensNewContent(parent)) {
      return false;
    }
    textOnly = textOnly && isTextOnly(parent);
  }
  return false;
};

const namesThatBecomeTypes = (sourceFile: ts.SourceFile): ReadonlySet<string> => {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isTypeQueryNode(node) && ts.isIdentifier(node.exprName)) names.add(node.exprName.text);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return names;
};

const isDataTable = (node: ts.Node, file: string, path: string): boolean =>
  file.startsWith('scripts/seed') &&
  (ts.isArrayLiteralExpression(node) || (path !== '' && ts.isObjectLiteralExpression(node)));

const isSimpleLiteral = (node: ts.Node): boolean =>
  ts.isStringLiteral(node) ||
  ts.isNoSubstitutionTemplateLiteral(node) ||
  ts.isNumericLiteral(node) ||
  (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand));

const isEnumeration = (node: ts.Node, path: string): boolean =>
  path !== '' && ts.isArrayLiteralExpression(node) && node.elements.every(isSimpleLiteral);

const calleeName = (target: ts.Expression): string | undefined => {
  if (ts.isIdentifier(target)) return target.text;
  if (ts.isPropertyAccessExpression(target)) return target.name.text;
  return undefined;
};

const RESPONSE_BUILDERS: ReadonlySet<string> = new Set([
  'redirect',
  'json',
  'text',
  'html',
  'body',
  'newResponse',
]);

const ERROR_RENDERERS: ReadonlySet<string> = new Set(['renderError', 'errorPage']);

const STATUS_POSITION_IN_RESPONSE = 1;

const MENTIONS_STATUS = /status/i;

const COMPARISONS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

const ORDER_COMPARISONS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
]);

const isComparison = (operator: ts.SyntaxKind): boolean =>
  COMPARISONS.has(operator) || ORDER_COMPARISONS.has(operator);

const enclosingFunction = (node: ts.Node): ts.SignatureDeclaration | undefined => {
  for (let current = node.parent; current !== undefined; current = current.parent) {
    if (ts.isFunctionLike(current)) return current;
  }
  return undefined;
};

const signatureMentionsStatus = (fn: ts.SignatureDeclaration): boolean => {
  const returnType = fn.type;
  if (returnType !== undefined && MENTIONS_STATUS.test(returnType.getText())) return true;
  const declaration = fn.parent;
  if (ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name)) {
    return MENTIONS_STATUS.test(declaration.name.text);
  }
  return fn.name !== undefined && MENTIONS_STATUS.test(fn.name.getText());
};

const isStatusPosition = (node: ts.NumericLiteral): boolean => {
  const parent = node.parent;

  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return true;

  if (ts.isReturnStatement(parent)) {
    const fn = enclosingFunction(parent);
    return fn !== undefined && signatureMentionsStatus(fn);
  }

  if (ts.isBinaryExpression(parent) && isComparison(parent.operatorToken.kind)) {
    const other = parent.left === node ? parent.right : parent.left;
    return MENTIONS_STATUS.test(other.getText());
  }

  if (!ts.isCallExpression(parent)) return false;
  const position = parent.arguments.indexOf(node);
  if (position < 0) return false;

  const callee = calleeName(parent.expression);
  if (callee === undefined) return false;
  if (ERROR_RENDERERS.has(callee)) return true;
  if (callee === 'status') return position === 0;
  return RESPONSE_BUILDERS.has(callee) && position === STATUS_POSITION_IN_RESPONSE;
};

const isExemptNumber = (node: ts.NumericLiteral): boolean => {
  const value = Number(node.text.replaceAll('_', ''));
  if (NEUTRAL_NUMBERS.has(value)) return true;
  return HTTP_STATUSES.has(value) && isStatusPosition(node);
};

const TEXT_WITH_CONTENT = /[A-Za-zÀ-ÿ]{3,}|\d/;

const templateWithProse = (node: ts.TemplateExpression): boolean =>
  TEXT_WITH_CONTENT.test(node.head.text) ||
  node.templateSpans.some((snippet) => TEXT_WITH_CONTENT.test(snippet.literal.text));

const TYPEOF_RESULTS: ReadonlySet<string> = new Set([
  'undefined',
  'object',
  'boolean',
  'number',
  'bigint',
  'string',
  'symbol',
  'function',
]);

const isTypeofOperand = (node: ts.StringLiteralLike): boolean => {
  if (!TYPEOF_RESULTS.has(node.text)) return false;
  const parent = node.parent;
  if (!ts.isBinaryExpression(parent) || !COMPARISONS.has(parent.operatorToken.kind)) return false;
  const other = parent.left === node ? parent.right : parent.left;
  return ts.isTypeOfExpression(other);
};

const isPostgresArrayType = (node: ts.Node): boolean => {
  const parent = node.parent;
  if (!ts.isCallExpression(parent)) return false;
  const target = parent.expression;
  if (!ts.isPropertyAccessExpression(target) || target.name.text !== 'array') return false;
  if (!ts.isIdentifier(target.expression) || target.expression.text !== 'sql') return false;
  return parent.arguments.indexOf(node as ts.Expression) === 1;
};

const isExemptText = (node: ts.StringLiteralLike): boolean =>
  isTypeofOperand(node) || isPostgresArrayType(node);

const mirrorsItsKey = (node: ts.StringLiteralLike): boolean => {
  const parent = node.parent;
  return (
    ts.isPropertyAssignment(parent) &&
    parent.initializer === node &&
    propertyName(parent.name) === node.text
  );
};

const isRegularExpression = (node: ts.Node): boolean => ts.isRegularExpressionLiteral(node);

const WORD_WITH_CONTENT = '[A-Za-zÀ-ÿ]{3,}';

const ONE_WORD = new RegExp(WORD_WITH_CONTENT);

const TWO_WORDS_IN_A_ROW = new RegExp(`${WORD_WITH_CONTENT}\\s+${WORD_WITH_CONTENT}`);

const isSentence = (node: ts.Node): boolean =>
  (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
  TWO_WORDS_IN_A_ROW.test(node.text);

const STOP_WORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'and',
  'by',
  'for',
  'from',
  'in',
  'no',
  'of',
  'on',
  'the',
  'to',
  'with',
]);

const CASE_BOUNDARY = /([a-z0-9])([A-Z])/g;
const NON_ALPHANUMERIC = /[^A-Za-z0-9]+/;
const MINIMUM_LENGTH_FOR_SINGULAR = 4;

const singular = (word: string): string =>
  word.length >= MINIMUM_LENGTH_FOR_SINGULAR && word.endsWith('s')
    ? word.slice(0, -1)
    : word;

const pathWords = (path: string): string[] =>
  path
    .split('.')
    .flatMap((part) => part.replaceAll(CASE_BOUNDARY, '$1 $2').split(NON_ALPHANUMERIC))
    .map((word) => word.toLowerCase())
    .filter((word) => word !== '' && !STOP_WORDS.has(word))
    .map(singular);

const LIMIT_WORDS: ReadonlySet<string> = new Set(['limit']);

const isLimitName = (path: string): boolean =>
  pathWords(path).some((word) => LIMIT_WORDS.has(word));

const containsAll = (set: ReadonlySet<string>, words: readonly string[]): boolean =>
  words.length > 0 && words.every((word) => set.has(word));

const sameName = (here: string, owner: string): boolean => {
  const fromHere = pathWords(here);
  const fromOwner = pathWords(owner);
  return containsAll(new Set(fromHere), fromOwner) || containsAll(new Set(fromOwner), fromHere);
};

const TEMPLATE_PREFIX = /^it\./;

const DOTTED_PATH = /[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+/g;

const MINIMUM_PATH_WORDS = 2;

const endsWithWords = (words: readonly string[], end: readonly string[]): boolean =>
  end.length <= words.length &&
  end.every((word, i) => words[words.length - end.length + i] === word);

const ONLY_ALPHANUMERIC = /[^A-Za-z0-9]+/g;

const leafOf = (path: string): string =>
  (path.split('.').at(-1) ?? '').replaceAll(ONLY_ALPHANUMERIC, '').toLowerCase();

const namedDeclarations = (path: string): readonly DeclaredValue[] => {
  const written = pathWords(path.replace(TEMPLATE_PREFIX, ''));
  if (written.length < MINIMUM_PATH_WORDS) return [];
  const leaf = leafOf(path);
  return declaredValues.filter(
    (declaredValue) =>
      leafOf(declaredValue.path) === leaf &&
      endsWithWords(pathWords(declaredValue.path), written),
  );
};

const NEGATIONS: ReadonlySet<string> = new Set([
  'not',
  'no',
  'never',
  'without',
  'none',
  'neither',
  'nor',
]);

const CLAUSE_END = /[,;:()\n—]/;

const WORDS = /[\wÀ-ÿ]+/g;

const isNegated = (text: string, upTo: number): boolean => {
  const clause = text.slice(0, upTo).split(CLAUSE_END).at(-1) ?? '';
  return [...clause.matchAll(WORDS)].some((word) =>
    NEGATIONS.has(word[0].toLowerCase()),
  );
};

const citedConstants = (
  text: string,
): readonly { citation: string; target: DeclaredValue; isNegated: boolean }[] =>
  [...text.matchAll(DOTTED_PATH)].flatMap((citation) =>
    namedDeclarations(citation[0]).map((target) => ({
      citation: citation[0],
      target,
      isNegated: isNegated(text, citation.index),
    })),
  );

const duplicateOwner = (node: ts.Node, path: string, file: string): Owner | undefined => {
  const key = valueKey(node);
  if (key === undefined) return undefined;
  const owners = (indexByValue.get(key) ?? []).filter((owner) => owner.file !== file);
  return pickOwner(owners, path, isRegularExpression(node) || isSentence(node));
};

const pickOwner = (
  owners: readonly Owner[],
  path: string,
  isProse: boolean,
): Owner | undefined => {
  if (owners.length === 0) return undefined;
  if (path !== '') {
    const byName = owners.find((owner) => sameName(path, owner.path));
    if (byName !== undefined) return byName;
  }
  return isProse ? owners[0] : undefined;
};

type Occurrence = {
  readonly text: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly snippet: string;
};

const occurrences: Occurrence[] = [];

type Silenced = {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly value: string;
  readonly justification: string;
  readonly closed: 'finding' | 'count';
};

const silenced: Silenced[] = [];

type Marker = {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly snippet: string;
};

const markers: Marker[] = [];

const markersOf = (file: string, source: string): Marker[] =>
  source.split('\n').flatMap((line, index) => {
    const match = SUPPRESSION_MARKER.exec(line);
    if (match === null) return [];
    return [
      {
        file,
        line: index + 1,
        column: match.index + 1,
        snippet: line.trim().slice(0, 72),
      },
    ];
  });

type Consumption = {
  readonly file: string;
  readonly line: number;
  readonly path: string;
  readonly value: string;
};

const consumptions: Consumption[] = [];

const PATH_ROOT = /^([A-Za-z_][A-Za-z0-9_]*)\./;

const isConstantPath = (path: string): boolean => {
  const root = PATH_ROOT.exec(path)?.[1];
  return root !== undefined && (root === 'it' || UPPER_SNAKE_CASE.test(root));
};

const collectConsumptions = (
  file: string,
  sourceFile: ts.SourceFile,
  lineOf: (node: ts.Node) => number,
): void => {
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      node.parent !== undefined &&
      !ts.isPropertyAccessExpression(node.parent)
    ) {
      const path = node.getText(sourceFile);
      if (!isConstantPath(path)) return;
      for (const target of namedDeclarations(path)) {
        consumptions.push({ file, line: lineOf(node), path, value: target.value });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
};

const OCCURRENCES_TO_REPORT = 3;

const PRODUCT_MODULE = 'src/';

const HTML_VOCABULARY: ReadonlySet<string> = new Set([
  'selected',
  'checked',
  'disabled',
  'readonly',
  'required',
  'multiple',
  'hidden',
  'open',
]);

const isCountableText = (text: string): boolean =>
  ONE_WORD.test(text) && !HTML_VOCABULARY.has(text);

type Context = { readonly declaration: boolean; readonly path: string };

const TREE_ROOT: Context = { declaration: false, path: '' };

const URL_REASON = 'endereço escrito à mão — use `ROUTES` (web/constants.ts)';

function analyzeTypeScript(file: string, source: string): Finding[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true);
  const lines = source.split('\n');
  const findings: Finding[] = [];
  const becomeTypes = namesThatBecomeTypes(sourceFile);

  const isSuppressed = (
    line: number,
    column: number,
    value: string,
    closed: Silenced['closed'],
  ): boolean => {
    const justification = justificationFor(lines, line);
    if (justification === undefined) return false;
    silenced.push({ file, line, column, value, justification, closed });
    return true;
  };

  const record = (node: ts.Node, reason: string): void => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const literal = literalText(node) ?? node.getText(sourceFile);
    if (isSuppressed(line + 1, character + 1, literal, 'finding')) return;
    findings.push({
      file,
      line: line + 1,
      column: character + 1,
      snippet: node.getText(sourceFile).replaceAll('\n', '\\n').slice(0, 72),
      reason,
    });
  };

  const count = (node: ts.Node, text: string): void => {
    if (!file.startsWith(PRODUCT_MODULE) || !isCountableText(text)) return;
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    if (isSuppressed(line + 1, character + 1, text, 'count')) return;
    occurrences.push({
      text,
      file,
      line: line + 1,
      column: character + 1,
      snippet: node.getText(sourceFile).replaceAll('\n', '\\n').slice(0, 72),
    });
  };

  const copyReason = (node: ts.Node, path: string): string | undefined => {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      ROUTE_WITH_SEGMENT.test(node.text)
    ) {
      return URL_REASON;
    }
    const owner = duplicateOwner(node, path, file);
    return owner === undefined ? undefined : `mesmo valor de ${owner.path} (${owner.file})`;
  };

  const check = (node: ts.Node, context: Context): void => {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      !(ts.isPropertyAssignment(node.parent) && node.parent.name === node) &&
      !isExemptText(node)
    ) {
      count(node, node.text);
    }
    const copy = copyReason(node, context.path);
    if (copy !== undefined) {
      record(node, copy);
      return;
    }
    if (context.declaration || isNamedValue(node)) return;

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const isKey = ts.isPropertyAssignment(node.parent) && node.parent.name === node;
      const loose = !isKey && node.text !== '' && !isExemptText(node) && !mirrorsItsKey(node);
      if (loose) record(node, '');
    } else if (ts.isTemplateExpression(node)) {
      if (templateWithProse(node)) record(node, '');
    } else if (ts.isNumericLiteral(node) && !isExemptNumber(node)) {
      record(node, '');
    }
  };

  const visit = (node: ts.Node, context: Context): void => {
    if (ts.isTypeNode(node)) return;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isTaggedTemplateExpression(node)) return;

    let current = ts.isFunctionLike(node)
      ? { declaration: context.declaration, path: '' }
      : context;
    if (isNamedDeclaration(node)) {
      const name = (node as ts.VariableDeclaration).name.getText(sourceFile);
      current = { declaration: becomeTypes.has(name), path: name };
    }
    if (isDataTable(node, file, current.path) || isEnumeration(node, current.path)) {
      current = { declaration: true, path: current.path };
    }

    check(node, current);

    ts.forEachChild(node, (child) => {
      if (ts.isPropertyAssignment(node) && node.name === child) return;
      const ahead =
        current.path !== '' && ts.isPropertyAssignment(node)
          ? {
              declaration: current.declaration,
              path: `${current.path}.${propertyName(node.name) ?? ''}`,
            }
          : current;
      visit(child, ahead);
    });
  };

  ts.forEachChild(sourceFile, (node) => {
    visit(node, TREE_ROOT);
  });
  collectConsumptions(
    file,
    sourceFile,
    (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
  );
  return findings;
}

const BLOCK_OPENING = '<%';

const BLOCK_CLOSING = '%>';

const CODE_QUOTES: ReadonlySet<string> = new Set(['"', "'", '`']);

const STRING_ESCAPE = '\\';

const BLOCK_COMMENT = { opening: '/*', closing: '*/' } as const;

const LINE_BREAK = '\n';

const BACKTICK = '`';

const endOfString = (source: string, start: number, quote: string): number => {
  for (let i = start + 1; i < source.length; i += 1) {
    if (source[i] === STRING_ESCAPE) {
      i += 1;
      continue;
    }
    if (source[i] === quote) return i + 1;
    if (quote !== BACKTICK && source[i] === LINE_BREAK) return start + 1;
  }
  return source.length;
};

const endOfBlock = (source: string, from: number): number => {
  let i = from;
  while (i < source.length) {
    if (source.startsWith(BLOCK_CLOSING, i)) return i;
    if (source.startsWith(BLOCK_COMMENT.opening, i)) {
      const fromInside = i + BLOCK_COMMENT.opening.length;
      const end = source.indexOf(BLOCK_COMMENT.closing, fromInside);
      i = end < 0 ? source.length : end + BLOCK_COMMENT.closing.length;
    } else if (CODE_QUOTES.has(source[i] ?? '')) {
      i = endOfString(source, i, source[i] ?? '');
    } else {
      i += 1;
    }
  }
  return source.length;
};

type EtaBlock = { readonly index: number; readonly whole: string; readonly inner: string };

const etaBlocks = (source: string): EtaBlock[] => {
  const blocks: EtaBlock[] = [];
  let position = 0;
  for (;;) {
    const opening = source.indexOf(BLOCK_OPENING, position);
    if (opening < 0) return blocks;
    const end = endOfBlock(source, opening + BLOCK_OPENING.length);
    const after = Math.min(end + BLOCK_CLOSING.length, source.length);
    blocks.push({
      index: opening,
      whole: source.slice(opening, after),
      inner: source.slice(opening + BLOCK_OPENING.length, end),
    });
    position = after;
  }
};

const OPENING_MARKER = /^[=~_-]/;
const CLOSING_MARKER = /[-_]$/;
const ETA_COMMENT = '#';

const URL_ATTRIBUTE = /\b(href|action)\s*=\s*"([^"]*)"/g;

const LIMIT_ATTRIBUTE = /\b(maxlength|minlength|max|min)\s*=\s*"([0-9_]+)"/g;

const NUMBER_IN_PROSE = /(?<!\d)(?<![\d][,.])\d+(?!\d)(?![,.]\d)/g;

const TEMPLATE_CALLS: ReadonlySet<string> = new Set(['include', 'includeFile', 'layout']);

const SLASH = '/';

const ROUTE_WITH_SEGMENT = /^\/[A-Za-z0-9_:-]/;

const isUrlInAttribute = (text: string): boolean =>
  text === SLASH || ROUTE_WITH_SEGMENT.test(text);

const TEMPLATE_URL_REASON =
  'endereço escrito à mão — use `it.routes` (ROUTES, em web/constants.ts)';

type Position = { readonly line: number; readonly column: number };

const positionOf = (source: string, index: number): Position => {
  const before = source.slice(0, index);
  const lineStart = before.lastIndexOf('\n') + 1;
  return { line: before.split('\n').length, column: index - lineStart + 1 };
};

const textOwner = (text: string): Owner | undefined =>
  ONE_WORD.test(text) || isTypographicMark(text) ? firstOwner(text) : undefined;

const CODE_MARK = '\u0000';

const NON_TEXT_ELEMENTS: ReadonlySet<string> = new Set(['script', 'style']);

const NAMING_ELEMENTS: ReadonlySet<string> = new Set(['a', 'button', 'h1']);

const HTML_COMMENT = { opening: '<!--', closing: '-->' } as const;

const TAG_NAME = /^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9-]*)/;

const QUOTES: ReadonlySet<string> = new Set(['"', "'"]);

const TAG_OPEN = '<';
const TAG_CLOSE = '>';
const TAG_CLOSING_SLASH = '/';

const SELF_CLOSING_TAG = '/>';

const closingTagOf = (source: string, name: string, from: number): number => {
  const mark = new RegExp(`${TAG_OPEN}\\s*${TAG_CLOSING_SLASH}\\s*${name}\\b`, 'gi');
  mark.lastIndex = from;
  return mark.exec(source)?.index ?? -1;
};

const endOfTag = (source: string, start: number): number => {
  let quote: string | undefined;
  for (let i = start + 1; i < source.length; i += 1) {
    const character = source[i] ?? '';
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
    } else if (QUOTES.has(character)) {
      quote = character;
    } else if (character === TAG_CLOSE) {
      return i + 1;
    }
  }
  return source.length;
};

type Slice = {
  readonly index: number;
  readonly text: string;
  readonly raw: string;
  readonly rawIndex: number;
};

type DocumentText = Slice & { readonly naming: boolean };

const withCodeMasked = (snippet: string): string => {
  const pieces: string[] = [];
  let position = 0;
  for (const block of etaBlocks(snippet)) {
    pieces.push(
      snippet.slice(position, block.index),
      block.whole.replaceAll(/[^\n]/g, CODE_MARK),
    );
    position = block.index + block.whole.length;
  }
  pieces.push(snippet.slice(position));
  return pieces.join('');
};

const handwrittenSlices = (masked: string): Slice[] => {
  const slices: Slice[] = [];
  let offset = 0;
  for (const piece of masked.split(CODE_MARK)) {
    const trimmed = piece.trim();
    if (trimmed !== '') {
      slices.push({
        index: offset + piece.indexOf(trimmed),
        text: trimmed,
        raw: piece,
        rawIndex: offset,
      });
    }
    offset += piece.length + CODE_MARK.length;
  }
  return slices;
};

const documentTexts = (source: string): DocumentText[] => {
  const masked = withCodeMasked(source);
  const texts: DocumentText[] = [];

  const collect = (start: number, end: number, naming: boolean): void => {
    for (const slice of handwrittenSlices(masked.slice(start, end))) {
      texts.push({
        ...slice,
        index: start + slice.index,
        rawIndex: start + slice.rawIndex,
        naming,
      });
    }
  };

  let position = 0;
  let nesting = 0;
  while (position < masked.length) {
    const opening = masked.indexOf(TAG_OPEN, position);
    collect(position, opening < 0 ? masked.length : opening, nesting > 0);
    if (opening < 0) break;

    if (masked.startsWith(HTML_COMMENT.opening, opening)) {
      const end = masked.indexOf(HTML_COMMENT.closing, opening);
      position = end < 0 ? masked.length : end + HTML_COMMENT.closing.length;
      continue;
    }

    const end = endOfTag(masked, opening);
    const tagText = masked.slice(opening, end);
    const tag = TAG_NAME.exec(tagText);
    const name = (tag?.[2] ?? '').toLowerCase();
    const isClosing = tag?.[1] === TAG_CLOSING_SLASH;
    const selfCloses = isClosing || tagText.endsWith(SELF_CLOSING_TAG);

    if (NON_TEXT_ELEMENTS.has(name) && !selfCloses) {
      const closing = closingTagOf(masked, name, end);
      if (closing < 0) break;
      position = endOfTag(masked, closing);
      continue;
    }

    if (NAMING_ELEMENTS.has(name)) {
      if (isClosing) nesting = Math.max(0, nesting - 1);
      else if (!selfCloses) nesting += 1;
    }
    position = end;
  }

  return texts;
};

const IDENTIFIER = /^[/-]?[a-z][A-Za-z0-9_/-]*$/;

const NO_LETTER_NOR_DIGIT = /^[^A-Za-zÀ-ÿ0-9]+$/;

const LAST_ASCII_CODE = 127;

const outsideAscii = (text: string): boolean =>
  [...text].some((character) => (character.codePointAt(0) ?? 0) > LAST_ASCII_CODE);

const isTypographicMark = (text: string): boolean =>
  NO_LETTER_NOR_DIGIT.test(text) && outsideAscii(text);

const RUN_WITHOUT_LETTER_NOR_DIGIT = /[^A-Za-zÀ-ÿ0-9]+/g;

const WHITESPACE = /\s+/g;

const NON_SPACE = /\S/;

const asHtmlDraws = (text: string): string => text.replaceAll(WHITESPACE, ' ');

const MINIMUM_COMPOSITION_PIECES = 2;

const MAXIMUM_COMPOSITION_LENGTH = 80;

type Piece = { readonly text: string; readonly owner: Owner };

const piecesOf = (text: string): string[] | undefined => {
  if (text.length > MAXIMUM_COMPOSITION_LENGTH) return undefined;
  const memo = new Map<number, string[] | undefined>();

  const from = (start: number): string[] | undefined => {
    if (start === text.length) return [];
    if (memo.has(start)) return memo.get(start);
    memo.set(start, undefined);
    for (let end = text.length; end > start; end -= 1) {
      const piece = text.slice(start, end);
      if (!ONE_WORD.test(piece) && !isTypographicMark(piece)) continue;
      if (ownersOf(piece).length === 0) continue;
      const rest = from(end);
      if (rest === undefined) continue;
      const whole = [piece, ...rest];
      memo.set(start, whole);
      return whole;
    }
    return undefined;
  };

  return from(0);
};

const compositionFile = (pieces: readonly string[]): string | undefined => {
  const tally = new Map<string, number>();
  for (const piece of pieces) {
    const owners = ownersOf(piece);
    const onlyOwner = owners.length === 1 ? owners[0] : undefined;
    if (onlyOwner === undefined) continue;
    tally.set(onlyOwner.file, (tally.get(onlyOwner.file) ?? 0) + 1);
  }
  return [...tally].sort(([, here], [, there]) => there - here)[0]?.[0];
};

const compositionOf = (text: string): Piece[] | undefined => {
  const pieces = piecesOf(text);
  if (pieces === undefined) return undefined;
  const withWord = pieces.filter((piece) => ONE_WORD.test(piece));
  if (withWord.length < MINIMUM_COMPOSITION_PIECES) return undefined;
  const layer = compositionFile(pieces);
  return pieces.flatMap((piece) => {
    const owners = ownersOf(piece);
    const owner = owners.find((candidate) => candidate.file === layer) ?? owners[0];
    return owner === undefined ? [] : [{ text: piece, owner }];
  });
};

const ownerInTemplateCode = (text: string, key: string): Owner | undefined => {
  if (text === '' || HTML_VOCABULARY.has(text)) return undefined;
  const owners = ownersOf(text);
  if (IDENTIFIER.test(text) || isTypographicMark(text)) return owners[0];
  return pickOwner(owners, key, ONE_WORD.test(text));
};

const carryingKey = (node: ts.Node): string => {
  const parent = node.parent;
  return ts.isPropertyAssignment(parent) && parent.initializer === node
    ? (propertyName(parent.name) ?? '')
    : '';
};

const ROUND_TRIP_ATTRIBUTES = /\b(name|value)\s*=\s*"([^"]*)"/g;

const TEXT_ATTRIBUTES = /\b(aria-label|title|alt|placeholder)\s*=\s*"([^"]*)"/g;

const valueStart = (attribute: RegExpExecArray): number =>
  attribute.index + attribute[0].indexOf('"') + 1;

function analyzeTemplate(file: string, source: string): Finding[] {
  const lines = source.split('\n');
  const findings: Finding[] = [];

  const isSuppressed = (
    line: number,
    column: number,
    value: string,
    closed: Silenced['closed'],
  ): boolean => {
    const justification = justificationFor(lines, line);
    if (justification === undefined) return false;
    silenced.push({ file, line, column, value, justification, closed });
    return true;
  };

  const count = (index: number, text: string, snippet: string): void => {
    if (!file.startsWith(PRODUCT_MODULE) || !isCountableText(text)) return;
    const { line, column } = positionOf(source, index);
    if (isSuppressed(line, column, text, 'count')) return;
    occurrences.push({
      text,
      file,
      line,
      column,
      snippet: snippet.replaceAll('\n', '\\n').slice(0, 72),
    });
  };

  const record = (index: number, snippet: string, reason: string, value = snippet): void => {
    const { line, column } = positionOf(source, index);
    if (isSuppressed(line, column, value, 'finding')) return;
    findings.push({
      file,
      line,
      column,
      snippet: snippet.replaceAll('\n', '\\n').slice(0, 72),
      reason,
    });
  };

  const reportLimit = (index: number, text: string, value: number, owner: Owner): void => {
    record(
      index,
      text,
      `limite redeclarado — ${owner.path} (${owner.file}) já é o dono; ` +
        'passe o valor pelo handler, via `it`',
      String(value),
    );
  };

  const checkLimit = (index: number, text: string, value: number): void => {
    if (NEUTRAL_NUMBERS.has(value)) return;
    const owner = ownedNumericValues.get(value);
    if (owner !== undefined) reportLimit(index, text, value, owner);
  };

  const checkLimitInProse = (index: number, text: string, value: number): void => {
    if (NEUTRAL_NUMBERS.has(value)) return;
    const owner = ownedNumericValues.get(value);
    if (owner !== undefined && isLimitName(owner.path)) reportLimit(index, text, value, owner);
  };

  const checkMarks = (start: number, raw: string): void => {
    for (const run of raw.matchAll(RUN_WITHOUT_LETTER_NOR_DIGIT)) {
      const drawn = asHtmlDraws(run[0]);
      const owner = textOwner(drawn);
      if (owner === undefined) continue;
      record(
        start + run.index + run[0].search(NON_SPACE),
        drawn,
        `separador redeclarado — ${owner.path} (${owner.file}) já é o dono; ` +
          'passe o valor pelo handler, via `it`',
      );
    }
  };

  const reportComposition = (index: number, snippet: string, text: string): boolean => {
    const pieces = compositionOf(text);
    if (pieces === undefined) return false;
    const owners = pieces.map((piece) => `${piece.owner.path} (${piece.owner.file})`);
    record(
      index,
      snippet,
      `texto composto — ${owners.join(' + ')}; ` + 'componha no handler e passe via `it`',
      text,
    );
    return true;
  };

  const checkText = (
    index: number,
    text: string,
    snippet: string,
    key: string,
    insideTemplate: boolean,
  ): void => {
    count(index, text, snippet);
    const owner =
      ownerInTemplateCode(text, key) ?? ownerInTemplateCode(text.trim(), key);
    if (owner !== undefined) {
      record(
        index,
        snippet,
        `texto redeclarado — ${owner.path} (${owner.file}) já é o dono; ` +
          'passe o valor pelo handler, via `it`',
        text,
      );
      return;
    }
    if (reportComposition(index, snippet, text)) return;
    if (!insideTemplate && ROUTE_WITH_SEGMENT.test(text)) {
      record(index, snippet, TEMPLATE_URL_REASON, text);
    }
  };

  for (const attribute of source.matchAll(URL_ATTRIBUTE)) {
    const value = attribute[2] ?? '';
    const handwritten = withCodeMasked(value).replaceAll(CODE_MARK, '');
    if (!isUrlInAttribute(handwritten)) continue;
    record(attribute.index, attribute[0], TEMPLATE_URL_REASON, handwritten);
  }

  for (const { index, text, raw, rawIndex, naming } of documentTexts(source)) {
    count(index, text, text);
    for (const num of text.matchAll(NUMBER_IN_PROSE)) {
      checkLimitInProse(index + num.index, text, Number(num[0]));
    }
    checkMarks(rawIndex, raw);
    reportComposition(index, text, text);
    const owner = naming ? textOwner(text) : undefined;
    if (owner === undefined) continue;
    record(
      index,
      text,
      `texto redeclarado — ${owner.path} (${owner.file}) já é o dono; ` +
        'passe o valor pelo handler, via `it`',
    );
  }

  for (const attribute of source.matchAll(ROUND_TRIP_ATTRIBUTES)) {
    const value = attribute[2] ?? '';
    if (value.includes(BLOCK_OPENING)) continue;
    count(attribute.index, value, attribute[0]);
    const owner = ownerInTemplateCode(value, '');
    if (owner === undefined) continue;
    record(
      attribute.index,
      attribute[0],
      `valor redeclarado — ${owner.path} (${owner.file}) já é o dono; ` +
        'passe o valor pelo handler, via `it`',
      value,
    );
  }

  for (const attribute of source.matchAll(TEXT_ATTRIBUTES)) {
    const start = valueStart(attribute);
    for (const slice of handwrittenSlices(withCodeMasked(attribute[2] ?? ''))) {
      const index = start + slice.index;
      count(index, slice.text, attribute[0]);
      checkMarks(start + slice.rawIndex, slice.raw);
      reportComposition(index, slice.text, slice.text);
      const owner = textOwner(slice.text);
      if (owner === undefined) continue;
      record(
        index,
        attribute[0],
        `texto redeclarado — ${owner.path} (${owner.file}) já é o dono; ` +
          'passe o valor pelo handler, via `it`',
        slice.text,
      );
    }
  }

  for (const attribute of source.matchAll(LIMIT_ATTRIBUTE)) {
    checkLimit(attribute.index, attribute[0], Number((attribute[2] ?? '').replaceAll('_', '')));
  }

  for (const block of etaBlocks(source)) {
    const raw = block.inner;
    if (raw.startsWith(ETA_COMMENT)) continue;

    const indent = OPENING_MARKER.test(raw) ? 1 : 0;
    const code = raw.slice(indent).replace(CLOSING_MARKER, '');
    const offset = block.index + BLOCK_OPENING.length + indent;

    const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.ESNext, true);

    const visit = (node: ts.Node, insideTemplate: boolean): void => {
      if (ts.isTypeNode(node)) return;

      if (ts.isNumericLiteral(node)) {
        checkLimit(
          offset + node.getStart(sourceFile),
          node.getText(sourceFile),
          Number(node.text.replaceAll('_', '')),
        );
      } else if (
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
        !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)
      ) {
        checkText(
          offset + node.getStart(sourceFile),
          node.text,
          node.getText(sourceFile),
          carryingKey(node),
          insideTemplate,
        );
      } else if (ts.isTemplateExpression(node)) {
        for (const part of [node.head, ...node.templateSpans.map((snippet) => snippet.literal)]) {
          checkText(
            offset + part.getStart(sourceFile) + 1,
            part.text,
            part.getText(sourceFile),
            carryingKey(node),
            insideTemplate,
          );
        }
      }

      const call =
        ts.isCallExpression(node) && TEMPLATE_CALLS.has(calleeName(node.expression) ?? '');
      ts.forEachChild(node, (child) => {
        visit(child, insideTemplate || call);
      });
    };

    ts.forEachChild(sourceFile, (node) => {
      visit(node, false);
    });
    collectConsumptions(
      file,
      sourceFile,
      (node) => positionOf(source, offset + node.getStart(sourceFile)).line,
    );
  }

  return findings;
}

const summaryOnly = Bun.argv.includes('--resumo');

const targets = await targetFiles();

const indexed = targets.filter((file) => INDEXED_FILES.test(file));

for (const file of indexed) {
  indexDeclarations(file, await Bun.file(join(ROOT, file)).text());
}

const coverage = `${targets.length} arquivo(s) varrido(s), ${indexed.length} indexado(s)`;

if (targets.length === 0) {
  process.stdout.write(
    `✖ ${coverage} — nenhum glob casou nada.\n` +
      'Um repositório sem literais e um verificador que não varreu arquivo nenhum imprimem\n' +
      'a mesma coisa; por isso a varredura vazia é falha, não sucesso. Confira ALVOS contra\n' +
      'os caminhos reais.\n',
  );
  process.exit(1);
}

const findings: Finding[] = [];
for (const file of targets) {
  if (file === THIS_FILE || CONSTANTS_FILES.test(file)) continue;
  const raw = await Bun.file(join(ROOT, file)).text();
  const source = TEMPLATES_WHOSE_SCRIPT_BECOMES_HTML.has(file) ? withoutScriptBody(raw) : raw;
  markers.push(...markersOf(file, source));
  findings.push(
    ...(file.endsWith(TEMPLATE_EXTENSION)
      ? analyzeTemplate(file, source)
      : analyzeTypeScript(file, source)),
  );
}

const occurrencesByText = new Map<string, number>();
for (const occurrence of occurrences) {
  occurrencesByText.set(occurrence.text, (occurrencesByText.get(occurrence.text) ?? 0) + 1);
}

const silencedByText = new Map<string, number>();
for (const { closed, value } of silenced) {
  if (closed !== 'count') continue;
  silencedByText.set(value, (silencedByText.get(value) ?? 0) + 1);
}

const countThatHolds = (text: string): boolean =>
  !indexByValue.has(textKey(text)) &&
  (occurrencesByText.get(text) ?? 0) + (silencedByText.get(text) ?? 0) >=
    OCCURRENCES_TO_REPORT;

const liveSilenced = silenced.filter(
  (entry) => entry.closed === 'finding' || countThatHolds(entry.value),
);

const silencedByLine = (() => {
  const byLine = new Map<string, Silenced[]>();
  for (const entry of liveSilenced) {
    const key = `${entry.file}:${entry.line}`;
    byLine.set(key, [...(byLine.get(key) ?? []), entry]);
  }
  return byLine;
})();

for (const [, list] of [...silencedByLine].sort()) {
  const first = list[0];
  if (first === undefined) continue;
  for (const { citation, target, isNegated } of citedConstants(first.justification)) {
    if (isNegated) continue;
    const muted = list.find((entry) => entry.value === target.value);
    if (muted === undefined) continue;
    findings.push({
      file: muted.file,
      line: muted.line,
      column: muted.column,
      snippet: JSON.stringify(muted.value).slice(0, 72),
      reason:
        `supressão que confessa — a justificativa cita \`${citation}\` ` +
        `(${target.path}, em ${target.file}), que vale exatamente este literal; ` +
        'a regra 2 pede qual constante o valor NÃO é',
    });
    break;
  }
}

const commonPrefix = (here: string, there: string): number => {
  const fromHere = here.split('/');
  const fromThere = there.split('/');
  let common = 0;
  while (
    common < fromHere.length &&
    common < fromThere.length &&
    fromHere[common] === fromThere[common]
  ) {
    common += 1;
  }
  return common;
};

const contradictions = new Set<string>();
for (const entry of liveSilenced) {
  const { file, line, column, value } = entry;
  if (!isTypographicMark(value) && !IDENTIFIER.test(value)) continue;
  const pair = consumptions
    .filter((consumption) => consumption.file !== file && consumption.value === value)
    .sort((here, there) => commonPrefix(there.file, file) - commonPrefix(here.file, file))
    .at(0);
  if (pair === undefined) continue;
  const position = `${file}:${line}:${column}`;
  if (contradictions.has(position)) continue;
  contradictions.add(position);
  findings.push({
    file,
    line,
    column,
    snippet: JSON.stringify(value).slice(0, 72),
    reason:
      'supressão que contradiz — este mesmo literal é CONSUMIDO da constante em ' +
      `${pair.file}:${pair.line} (\`${pair.path}\`); ` +
      'a mesma forma não pode ser cópia lá e decisão própria aqui',
  });
}

const linesWithWork = new Set(
  liveSilenced.map((entry) => `${entry.file}:${entry.line}`),
);

for (const { file, line, column, snippet } of markers) {
  if (linesWithWork.has(`${file}:${line}`)) continue;
  if (linesWithWork.has(`${file}:${line + 1}`)) continue;
  findings.push({
    file,
    line,
    column,
    snippet,
    reason:
      'supressão morta — não cala nada, aqui nem na linha de baixo; apague o marcador, ' +
      'que promete uma exceção de máquina que nenhuma regra pede (a prosa pode ficar)',
  });
}

const ownerlessRepeats = (() => {
  const byText = new Map<string, Occurrence[]>();
  for (const occurrence of occurrences) {
    byText.set(occurrence.text, [...(byText.get(occurrence.text) ?? []), occurrence]);
  }
  return [...byText]
    .filter(
      ([text, list]) =>
        list.length >= OCCURRENCES_TO_REPORT && !indexByValue.has(textKey(text)),
    )
    .sort(([, here], [, there]) => there.length - here.length);
})();

const alreadyReported = new Set(
  findings.map((finding) => `${finding.file}:${finding.line}:${finding.column}`),
);

for (const [, list] of ownerlessRepeats) {
  for (const occurrence of list) {
    if (alreadyReported.has(`${occurrence.file}:${occurrence.line}:${occurrence.column}`)) continue;
    findings.push({
      file: occurrence.file,
      line: occurrence.line,
      column: occurrence.column,
      snippet: occurrence.snippet,
      reason: `repetido ${list.length}× e sem dono — nenhum \`constants.ts\` declara este texto`,
    });
  }
}

if (findings.length === 0) {
  process.stdout.write(`✔ nenhum literal solto fora das exceções da regra 6 — ${coverage}\n`);
  process.exit(0);
}

const byFile = new Map<string, Finding[]>();
for (const finding of findings) {
  const list = byFile.get(finding.file) ?? [];
  list.push(finding);
  byFile.set(finding.file, list);
}

const reportLines: string[] = [];
for (const [file, list] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
  reportLines.push(`${String(list.length).padStart(5)}  ${file}`);
  if (summaryOnly) continue;
  for (const finding of [...list].sort((a, b) => a.line - b.line || a.column - b.column)) {
    const gloss = finding.reason === '' ? '' : `  ← ${finding.reason}`;
    reportLines.push(`         ${finding.line}:${finding.column}  ${finding.snippet}${gloss}`);
  }
}

process.stdout.write(`${reportLines.join('\n')}\n`);

if (ownerlessRepeats.length > 0) {
  const repeatLines = ownerlessRepeats.flatMap(([text, list]) => {
    const files = [...new Set(list.map((occurrence) => occurrence.file))];
    return [
      `${String(list.length).padStart(5)}×  ${JSON.stringify(text)}`,
      ...(summaryOnly ? [] : files.map((file) => `         ${file}`)),
    ];
  });
  process.stdout.write(
    `\nRepetição sem dono — ${ownerlessRepeats.length} texto(s) com ` +
      `${OCCURRENCES_TO_REPORT}+ cópias e nenhuma constante:\n${repeatLines.join('\n')}\n`,
  );
}

process.stdout.write(
  `\n✖ ${findings.length} literal(is) solto(s) em ${byFile.size} arquivo(s) — ${coverage}.\n` +
    'Mova cada um para o `constants.ts` do módulo dono, ou justifique com\n' +
    '`// magic-values: permitido — <motivo>` na linha do literal.\n',
);
process.exit(1);
