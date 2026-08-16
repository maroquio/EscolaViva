import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Eta } from 'eta';
import type { Context } from 'hono';
import { ROTULO_DE_BIMESTRE } from '../assessment';
import { ALCANCE } from '../communication';
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
  ACOES,
  APRESENTACAO,
  AREAS,
  CAMPOS,
  CLASSE_DA_ETIQUETA,
  CONTAGEM,
  CURINGA_DE_ASSET,
  DETALHES_DE_ERRO,
  DOCUMENTO,
  ERROR_TITLES,
  PARAMETROS,
  ROTAS,
  ROTULOS,
  SEM_ALUNO_MATRICULADO,
  SUFIXOS_DE_ID,
  TEMPLATES,
  TITULOS,
  type SubstantivoContavel,
} from './constantes';

const RAIZ = join(import.meta.dir, '..', '..');
const CAMINHO_DO_MANIFESTO = join(RAIZ, ASSETS.directory, ASSETS.manifest);

const CODIFICACAO_DO_MANIFESTO = 'utf8';

const emDesenvolvimento = config.environment === DEVELOPMENT_ENV;

const eta = new Eta({
  views: join(import.meta.dir, TEMPLATES.diretorio),
  autoEscape: true,
  cache: !emDesenvolvimento,
  cacheFilepaths: !emDesenvolvimento,
});

let manifesto: Record<string, string> | null = null;

const lerManifesto = (): Record<string, string> => {
  try {
    const bruto: unknown = JSON.parse(readFileSync(CAMINHO_DO_MANIFESTO, CODIFICACAO_DO_MANIFESTO));
    if (typeof bruto !== 'object' || bruto === null) return {};
    return bruto as Record<string, string>;
  } catch {
    return {};
  }
};

export function asset(nome: string): string {
  if (manifesto === null || emDesenvolvimento) manifesto = lerManifesto();
  return manifesto[nome] ?? nome;
}

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})/;

const SEPARADOR_DECIMAL_DO_TO_FIXED = '.';

type ValorDeData = string | Date | null | undefined;
type ValorNumerico = number | string | null | undefined;

const doisDigitos = (valor: number): string =>
  String(valor).padStart(APRESENTACAO.colunaDeDoisDigitos, APRESENTACAO.preenchimentoDeDigito);

const comoData = (valor: ValorDeData): Date | null => {
  if (valor === null || valor === undefined || valor === '') return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
};

const comoNumero = (valor: ValorNumerico): number | null => {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(numero) ? numero : null;
};

const umaCasaTruncada = (valor: number): string => {
  const decimos = Math.trunc(valor * APRESENTACAO.fatorDeUmaCasa);
  return (decimos / APRESENTACAO.fatorDeUmaCasa)
    .toFixed(1)
    .replace(SEPARADOR_DECIMAL_DO_TO_FIXED, APRESENTACAO.separadorDecimal);
};

export function formatarData(valor: ValorDeData): string {
  if (typeof valor === 'string') {
    const partes = DATA_ISO.exec(valor);
    const [, ano, mes, dia] = partes ?? [];
    if (ano !== undefined && mes !== undefined && dia !== undefined) return `${dia}/${mes}/${ano}`;
  }
  const data = comoData(valor);
  if (data === null) return MISSING_VALUE;
  return `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)}/${data.getFullYear()}`;
}

export function formatarDataHora(valor: ValorDeData): string {
  const data = comoData(valor);
  if (data === null) return MISSING_VALUE;
  const hora = `${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`;
  return `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)}/${data.getFullYear()} ${hora}`;
}

export function formatarNota(valor: ValorNumerico): string {
  const numero = comoNumero(valor);
  return numero === null ? MISSING_VALUE : umaCasaTruncada(numero);
}

export function formatarPercentual(valor: ValorNumerico): string {
  const numero = comoNumero(valor);
  return numero === null ? MISSING_VALUE : `${umaCasaTruncada(numero)}${APRESENTACAO.sufixoDePercentual}`;
}

export function formatarTaxa(fracao: ValorNumerico): string {
  const numero = comoNumero(fracao);
  return numero === null ? MISSING_VALUE : formatarPercentual(numero * APRESENTACAO.fatorPercentual);
}

export function pluralizar(quantidade: number, substantivo: SubstantivoContavel): string {
  return quantidade === 1 ? substantivo.singular : substantivo.plural;
}

export const idDoErro = (campo: string): string => `${campo}${SUFIXOS_DE_ID.erro}`;

export const idDaAjuda = (campo: string): string => `${campo}${SUFIXOS_DE_ID.ajuda}`;

export type DadosDeTemplate = Record<string, unknown>;

const CHAVES_DO_CONTEXTO = {
  erros: 'erros',
  mensagem: 'mensagem',
  erro: 'erro',
  usuario: 'usuario',
} as const;

const textoDaQuery = (c: Context, nome: string): string | null => {
  const bruto = c.req.query(nome);
  if (bruto === undefined) return null;
  const texto = bruto.trim().slice(0, APRESENTACAO.limiteDaMensagem);
  return texto === '' ? null : texto;
};

const auxiliares = {
  asset,
  curingaDeAsset: CURINGA_DE_ASSET,
  nomeLogicoDaFolha: ASSETS.stylesheetLogicalName,
  campoChave: KEY_FIELD,
  rotas: ROTAS,
  parciais: TEMPLATES.parciais,
  documento: DOCUMENTO,
  apresentacao: APRESENTACAO,
  titulos: TITULOS,
  papel: ROLE,
  alcances: ALCANCE,
  campos: CAMPOS,
  idDoErro,
  idDaAjuda,
  areas: AREAS,
  rotulos: ROTULOS,
  classeDaEtiqueta: CLASSE_DA_ETIQUETA,
  contagem: CONTAGEM,
  acoes: ACOES,
  semAlunoMatriculado: SEM_ALUNO_MATRICULADO,
  rotuloDeBimestre: ROTULO_DE_BIMESTRE,
  formatarCpf: formatCpf,
  formatarData,
  formatarDataHora,
  formatarNota,
  formatarPercentual,
  formatarTaxa,
  pluralizar,
} as const;

type Problema = { readonly campo: string; readonly mensagem: string };

const problemasDe = (dados: DadosDeTemplate): readonly Problema[] => {
  const erros = dados[CHAVES_DO_CONTEXTO.erros];
  return Array.isArray(erros) ? (erros as readonly Problema[]) : [];
};

const SEPARADOR_DE_IDS = ' ';

const auxiliaresDeErro = (dados: DadosDeTemplate) => {
  const problemas = problemasDe(dados);

  const erroDe = (campo: string): string =>
    problemas.find((problema) => problema.campo === campo)?.mensagem ?? '';

  const descricao = (campo: string, temAjuda = false): string =>
    [temAjuda ? idDaAjuda(campo) : '', erroDe(campo) === '' ? '' : idDoErro(campo)]
      .filter((id) => id !== '')
      .join(SEPARADOR_DE_IDS);

  return { erroDe, descricao };
};

const contextoDeTemplate = (c: Context, dados: DadosDeTemplate): DadosDeTemplate => ({
  titulo: TITULOS.produto,
  ...dados,
  ...auxiliares,
  ...auxiliaresDeErro(dados),
  usuario: currentUserOrNull(c),
  chave: crypto.randomUUID(),
  caminhoAtual: c.req.path,
  correlacaoId: currentContext()?.correlationId ?? '',
  mensagem: dados[CHAVES_DO_CONTEXTO.mensagem] ?? textoDaQuery(c, PARAMETROS.ok),
  erro: dados[CHAVES_DO_CONTEXTO.erro] ?? textoDaQuery(c, PARAMETROS.erro),
});

const DOCUMENTO_COMPLETO = /^\s*<!doctype/i;

const envolver = (html: string, contexto: DadosDeTemplate, layout: string): string =>
  DOCUMENTO_COMPLETO.test(html) ? html : eta.render(layout, { ...contexto, body: html });

const layoutPadrao = (contexto: DadosDeTemplate): string =>
  contexto[CHAVES_DO_CONTEXTO.usuario] === null ? TEMPLATES.layoutPublico : TEMPLATES.layout;

export function renderizar(c: Context, template: string, dados: DadosDeTemplate = {}): Response {
  const contexto = contextoDeTemplate(c, dados);
  const corpo = eta.render(template, contexto);
  return c.html(envolver(corpo, contexto, layoutPadrao(contexto)));
}

export function renderizarErro(
  c: Context,
  status: ErrorStatus,
  titulo: string,
  detalhe: string,
): Response {
  const contexto = contextoDeTemplate(c, { titulo, detalhe, status });
  const corpo = eta.render(TEMPLATES.erro, contexto);
  return c.html(envolver(corpo, contexto, layoutPadrao(contexto)), status);
}

registerErrorRenderer((status, correlacaoId) => {
  const dados: DadosDeTemplate = {
    ...auxiliares,
    titulo: ERROR_TITLES[status],
    detalhe: DETALHES_DE_ERRO[status],
    status,
    correlacaoId,
    usuario: null,
    chave: crypto.randomUUID(),
    caminhoAtual: '',
    mensagem: null,
    erro: null,
  };
  return eta.render(TEMPLATES.layoutPublico, { ...dados, body: eta.render(TEMPLATES.erro, dados) });
});
