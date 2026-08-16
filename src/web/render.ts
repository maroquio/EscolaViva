import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Eta } from 'eta';
import type { Context } from 'hono';
import { TERM_LABEL } from '../assessment';
import { AUDIENCE } from '../communication';
import { ROLE } from '../identity';
import { config } from '../shared/config';
import { ASSETS, DEVELOPMENT_ENV, KEY_FIELD, MISSING_VALUE } from '../shared/constants';
import { formatCpf } from '../shared/document';
import {
  currentContext,
  currentUserOrNull,
  registerErrorRenderer,
  type ErrorStatus,
} from '../shared/http';
import {
  ACTIONS,
  AREAS,
  ASSET_WILDCARD,
  DOCUMENT,
  ERROR_DETAILS,
  ERROR_TITLES,
  FIELDS,
  ID_SUFFIXES,
  LABELS,
  NOUNS,
  NO_ENROLLED_STUDENT,
  PARAMS,
  PRESENTATION,
  ROUTES,
  TAG_CLASS,
  TEMPLATES,
  TITLES,
  type CountableNoun,
} from './constants';

const ROOT = join(import.meta.dir, '..', '..');
const MANIFEST_PATH = join(ROOT, ASSETS.directory, ASSETS.manifest);

const MANIFEST_ENCODING = 'utf8';

const inDevelopment = config.environment === DEVELOPMENT_ENV;

const eta = new Eta({
  views: join(import.meta.dir, TEMPLATES.directory),
  autoEscape: true,
  cache: !inDevelopment,
  cacheFilepaths: !inDevelopment,
});

let manifest: Record<string, string> | null = null;

const readManifest = (): Record<string, string> => {
  try {
    const raw: unknown = JSON.parse(readFileSync(MANIFEST_PATH, MANIFEST_ENCODING));
    if (typeof raw !== 'object' || raw === null) return {};
    return raw as Record<string, string>;
  } catch {
    return {};
  }
};

export function asset(name: string): string {
  if (manifest === null || inDevelopment) manifest = readManifest();
  return manifest[name] ?? name;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

const TO_FIXED_DECIMAL_SEPARATOR = '.';

type DateValue = string | Date | null | undefined;
type NumericValue = number | string | null | undefined;

const twoDigits = (value: number): string =>
  String(value).padStart(PRESENTATION.twoDigitWidth, PRESENTATION.digitPad);

const asDate = (value: DateValue): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const asNumber = (value: NumericValue): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

const oneDecimalTruncated = (value: number): string => {
  const tenths = Math.trunc(value * PRESENTATION.oneDecimalFactor);
  return (tenths / PRESENTATION.oneDecimalFactor)
    .toFixed(1)
    .replace(TO_FIXED_DECIMAL_SEPARATOR, PRESENTATION.decimalSeparator);
};

export function formatDate(value: DateValue): string {
  if (typeof value === 'string') {
    const parts = ISO_DATE.exec(value);
    const [, year, month, day] = parts ?? [];
    if (year !== undefined && month !== undefined && day !== undefined) return `${day}/${month}/${year}`;
  }
  const date = asDate(value);
  if (date === null) return MISSING_VALUE;
  return `${twoDigits(date.getDate())}/${twoDigits(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatDateTime(value: DateValue): string {
  const date = asDate(value);
  if (date === null) return MISSING_VALUE;
  const time = `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
  return `${twoDigits(date.getDate())}/${twoDigits(date.getMonth() + 1)}/${date.getFullYear()} ${time}`;
}

export function formatGrade(value: NumericValue): string {
  const number = asNumber(value);
  return number === null ? MISSING_VALUE : oneDecimalTruncated(number);
}

export function formatPercent(value: NumericValue): string {
  const number = asNumber(value);
  return number === null ? MISSING_VALUE : `${oneDecimalTruncated(number)}${PRESENTATION.percentSuffix}`;
}

export function formatRate(fraction: NumericValue): string {
  const number = asNumber(fraction);
  return number === null ? MISSING_VALUE : formatPercent(number * PRESENTATION.percentFactor);
}

export function pluralize(quantity: number, noun: CountableNoun): string {
  return quantity === 1 ? noun.singular : noun.plural;
}

export const errorId = (field: string): string => `${field}${ID_SUFFIXES.error}`;

export const helpId = (field: string): string => `${field}${ID_SUFFIXES.help}`;

const AUDIENCES = { school: AUDIENCE.school, selected: AUDIENCE.selected } as const;

export type TemplateData = Record<string, unknown>;

const CONTEXT_KEYS = {
  errors: 'errors',
  message: 'message',
  error: 'error',
  user: 'user',
} as const;

const queryText = (c: Context, name: string): string | null => {
  const raw = c.req.query(name);
  if (raw === undefined) return null;
  const text = raw.trim().slice(0, PRESENTATION.messageLimit);
  return text === '' ? null : text;
};

const helpers = {
  asset,
  assetWildcard: ASSET_WILDCARD,
  stylesheetLogicalName: ASSETS.stylesheetLogicalName,
  keyField: KEY_FIELD,
  routes: ROUTES,
  partials: TEMPLATES.partials,
  document: DOCUMENT,
  presentation: PRESENTATION,
  titles: TITLES,
  role: ROLE,
  audiences: AUDIENCES,
  fields: FIELDS,
  errorId,
  helpId,
  areas: AREAS,
  labels: LABELS,
  tagClass: TAG_CLASS,
  nouns: NOUNS,
  actions: ACTIONS,
  noEnrolledStudent: NO_ENROLLED_STUDENT,
  termLabel: TERM_LABEL,
  formatCpf,
  formatDate,
  formatDateTime,
  formatGrade,
  formatPercent,
  formatRate,
  pluralize,
} as const;

type Problem = { readonly campo: string; readonly mensagem: string };

const problemsOf = (data: TemplateData): readonly Problem[] => {
  const errors = data[CONTEXT_KEYS.errors];
  return Array.isArray(errors) ? (errors as readonly Problem[]) : [];
};

const ID_SEPARATOR = ' ';

const errorHelpers = (data: TemplateData) => {
  const problems = problemsOf(data);

  const errorFor = (field: string): string =>
    problems.find((problem) => problem.campo === field)?.mensagem ?? '';

  const describedBy = (field: string, hasHelp = false): string =>
    [hasHelp ? helpId(field) : '', errorFor(field) === '' ? '' : errorId(field)]
      .filter((id) => id !== '')
      .join(ID_SEPARATOR);

  return { errorFor, describedBy };
};

const templateContext = (c: Context, data: TemplateData): TemplateData => ({
  title: TITLES.product,
  ...data,
  ...helpers,
  ...errorHelpers(data),
  user: currentUserOrNull(c),
  key: crypto.randomUUID(),
  currentPath: c.req.path,
  correlationId: currentContext()?.correlationId ?? '',
  message: data[CONTEXT_KEYS.message] ?? queryText(c, PARAMS.ok),
  error: data[CONTEXT_KEYS.error] ?? queryText(c, PARAMS.error),
});

const FULL_DOCUMENT = /^\s*<!doctype/i;

const wrap = (html: string, context: TemplateData, layout: string): string =>
  FULL_DOCUMENT.test(html) ? html : eta.render(layout, { ...context, body: html });

const defaultLayout = (context: TemplateData): string =>
  context[CONTEXT_KEYS.user] === null ? TEMPLATES.publicLayout : TEMPLATES.layout;

export function render(c: Context, template: string, data: TemplateData = {}): Response {
  const context = templateContext(c, data);
  const body = eta.render(template, context);
  return c.html(wrap(body, context, defaultLayout(context)));
}

export function renderError(
  c: Context,
  status: ErrorStatus,
  title: string,
  detail: string,
): Response {
  const context = templateContext(c, { title, detail, status });
  const body = eta.render(TEMPLATES.error, context);
  return c.html(wrap(body, context, defaultLayout(context)), status);
}

registerErrorRenderer((status, correlationId) => {
  const data: TemplateData = {
    ...helpers,
    title: ERROR_TITLES[status],
    detail: ERROR_DETAILS[status],
    status,
    correlationId,
    user: null,
    key: crypto.randomUUID(),
    currentPath: '',
    message: null,
    error: null,
  };
  return eta.render(TEMPLATES.publicLayout, { ...data, body: eta.render(TEMPLATES.error, data) });
});
