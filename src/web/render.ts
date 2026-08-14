/**
 * Motor de template da camada web.
 *
 * Uma única função monta toda página: `renderizar` injeta em `it` o que nenhuma rota deveria
 * precisar lembrar de passar — o usuário da sessão, a chave de idempotência do formulário (I4), o
 * nome versionado do CSS (I10), os formatadores de número e data, e as mensagens que voltam na
 * query depois de um POST-Redirect-GET. Rota que esquece um desses não existe.
 *
 * O escape é automático (`autoEscape`): interpolação de dado do usuário é segura por padrão, e
 * escrever `<%~ %>` passa a ser uma decisão visível na revisão.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Eta } from 'eta';
import type { Context } from 'hono';
import { config } from '../shared/config';
import {
  contextoAtual,
  registrarRenderizadorDeErro,
  usuarioAtualOuNulo,
  type StatusDeErro,
} from '../shared/http';

const RAIZ = join(import.meta.dir, '..', '..');
const CAMINHO_DO_MANIFESTO = join(RAIZ, 'publico', 'manifest.json');

const LAYOUT_APLICACAO = '/_layout';
const LAYOUT_PUBLICO = '/_layout_publico';
const TEMPLATE_DE_ERRO = '/erro';

const emDesenvolvimento = config.ambiente === 'development';

// Cache ligado fora de desenvolvimento: em produção o template não muda sem novo processo.
const eta = new Eta({
  views: join(import.meta.dir, 'templates'),
  autoEscape: true,
  cache: !emDesenvolvimento,
  cacheFilepaths: !emDesenvolvimento,
});

/* --- Assets versionados (I10) --------------------------------------------- */

let manifesto: Record<string, string> | null = null;

const lerManifesto = (): Record<string, string> => {
  try {
    const bruto: unknown = JSON.parse(readFileSync(CAMINHO_DO_MANIFESTO, 'utf8'));
    if (typeof bruto !== 'object' || bruto === null) return {};
    return bruto as Record<string, string>;
  } catch {
    // Antes do primeiro `bun run build:assets` não há manifesto: o nome lógico é servido como
    // está, e a página continua de pé em desenvolvimento em vez de morrer por um arquivo de build.
    return {};
  }
};

/** Resolve `app.css` no nome publicado com hash; sem manifesto, devolve o nome cru. */
export function asset(nome: string): string {
  if (manifesto === null || emDesenvolvimento) manifesto = lerManifesto();
  return manifesto[nome] ?? nome;
}

/* --- Formatadores ---------------------------------------------------------- */

const AUSENTE = '—';
const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})/;

type ValorDeData = string | Date | null | undefined;
type ValorNumerico = number | string | null | undefined;

const doisDigitos = (valor: number): string => String(valor).padStart(2, '0');

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

/**
 * Truncado, nunca arredondado — a mesma regra do cálculo da média. Arredondar 5,99 para 6,0 na
 * tela mostraria "aprovado" ao lado de uma situação "reprovado", e a divergência entre o número
 * impresso e o número que decidiu é justamente o que o domínio proíbe.
 */
const umaCasaTruncada = (valor: number): string => {
  const decimos = Math.trunc(valor * 10);
  return (decimos / 10).toFixed(1).replace('.', ',');
};

/** `2026-03-15` ou um `Date` viram `15/03/2026`. */
export function formatarData(valor: ValorDeData): string {
  if (typeof valor === 'string') {
    const partes = DATA_ISO.exec(valor);
    const [, ano, mes, dia] = partes ?? [];
    if (ano !== undefined && mes !== undefined && dia !== undefined) return `${dia}/${mes}/${ano}`;
  }
  const data = comoData(valor);
  if (data === null) return AUSENTE;
  return `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)}/${data.getFullYear()}`;
}

/** Carimbo de tempo do banco vira `15/03/2026 14:30`. */
export function formatarDataHora(valor: ValorDeData): string {
  const data = comoData(valor);
  if (data === null) return AUSENTE;
  const hora = `${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`;
  return `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)}/${data.getFullYear()} ${hora}`;
}

/** Nota e média com uma casa decimal e vírgula; sem valor lançado, um travessão. */
export function formatarNota(valor: ValorNumerico): string {
  const numero = comoNumero(valor);
  return numero === null ? AUSENTE : umaCasaTruncada(numero);
}

/** Frequência já vem na escala de 0 a 100. */
export function formatarPercentual(valor: ValorNumerico): string {
  const numero = comoNumero(valor);
  return numero === null ? AUSENTE : `${umaCasaTruncada(numero)} %`;
}

/* --- Montagem do contexto de template -------------------------------------- */

export type DadosDeTemplate = Record<string, unknown>;

const LIMITE_DA_MENSAGEM = 160;

/** A mensagem volta na URL depois do redirecionamento; entra na página curta e escapada. */
const textoDaQuery = (c: Context, nome: string): string | null => {
  const bruto = c.req.query(nome);
  if (bruto === undefined) return null;
  const texto = bruto.trim().slice(0, LIMITE_DA_MENSAGEM);
  return texto === '' ? null : texto;
};

const auxiliares = {
  asset,
  formatarData,
  formatarDataHora,
  formatarNota,
  formatarPercentual,
} as const;

/* --- Erros de campo -------------------------------------------------------- */

type Problema = { readonly campo: string; readonly mensagem: string };

const problemasDe = (dados: DadosDeTemplate): readonly Problema[] => {
  const erros = dados['erros'];
  return Array.isArray(erros) ? (erros as readonly Problema[]) : [];
};

/**
 * Todo formulário mostra o erro embaixo do campo e aponta o `aria-describedby` para ele. Escrever
 * isso no template custava as mesmas quinze linhas em cada um — dez cópias de uma regra só. As duas
 * funções nascem aqui, já fechadas sobre os `erros` daquele render: o template recebe `it.erroDe` e
 * `it.descricao` prontos, do mesmo jeito que já recebia `it.formatarData`.
 */
const auxiliaresDeErro = (dados: DadosDeTemplate) => {
  const problemas = problemasDe(dados);

  /** Mensagem do campo, ou string vazia quando ele passou. */
  const erroDe = (campo: string): string =>
    problemas.find((problema) => problema.campo === campo)?.mensagem ?? '';

  /** Ids que o campo descreve: a ajuda fixa, quando existe, e o erro, quando há. */
  const descricao = (campo: string, temAjuda = false): string =>
    [temAjuda ? `${campo}-ajuda` : '', erroDe(campo) === '' ? '' : `${campo}-erro`]
      .filter((id) => id !== '')
      .join(' ');

  return { erroDe, descricao };
};

const contextoDeTemplate = (c: Context, dados: DadosDeTemplate): DadosDeTemplate => ({
  titulo: 'EscolaViva',
  ...dados,
  ...auxiliares,
  ...auxiliaresDeErro(dados),
  usuario: usuarioAtualOuNulo(c),
  // I4: chave nova a cada render — dois carregamentos da mesma tela são dois envios distintos,
  // mas dois cliques no mesmo botão carregam a mesma chave e produzem um registro só.
  chave: crypto.randomUUID(),
  caminhoAtual: c.req.path,
  correlacaoId: contextoAtual()?.correlacaoId ?? '',
  mensagem: dados['mensagem'] ?? textoDaQuery(c, 'ok'),
  erro: dados['erro'] ?? textoDaQuery(c, 'erro'),
});

const DOCUMENTO_COMPLETO = /^\s*<!doctype/i;

/**
 * A página pode declarar seu próprio layout com `layout("/_layout")`. Quando não declara, o
 * documento é montado aqui: aplicação para quem tem sessão, folha centrada para quem não tem.
 */
const envolver = (html: string, contexto: DadosDeTemplate, layout: string): string =>
  DOCUMENTO_COMPLETO.test(html) ? html : eta.render(layout, { ...contexto, body: html });

const layoutPadrao = (contexto: DadosDeTemplate): string =>
  contexto['usuario'] === null ? LAYOUT_PUBLICO : LAYOUT_APLICACAO;

/** Renderiza um template de `src/web/templates` como resposta HTML completa. */
export function renderizar(c: Context, template: string, dados: DadosDeTemplate = {}): Response {
  const contexto = contextoDeTemplate(c, dados);
  const corpo = eta.render(template, contexto);
  return c.html(envolver(corpo, contexto, layoutPadrao(contexto)));
}

/* --- Páginas de erro ------------------------------------------------------- */

const TITULOS: Record<StatusDeErro, string> = {
  400: 'Requisição inválida',
  401: 'Entre para continuar',
  403: 'Acesso não permitido',
  404: 'Página não encontrada',
  422: 'Não foi possível concluir',
  500: 'Erro inesperado',
};

const DETALHES: Record<StatusDeErro, string> = {
  400: 'O formulário chegou incompleto ou com um campo que o sistema não reconhece. Volte, confira os dados e envie de novo.',
  401: 'A sessão terminou ou ainda não foi aberta. Entre novamente para continuar de onde parou.',
  403: 'Sua conta não tem permissão para esta tela. Se você deveria ter, peça ao administrador da rede.',
  404: 'O endereço não existe, ou o registro pertence a outra rede. Use o menu para voltar a uma tela conhecida.',
  422: 'Os dados estão consistentes, mas a situação atual não permite concluir esta operação.',
  500: 'Algo falhou do nosso lado. A ocorrência foi registrada com o código abaixo.',
};

/** Página de erro dentro do layout, com o código que o suporte usa para achar o rastro no log. */
export function renderizarErro(
  c: Context,
  status: StatusDeErro,
  titulo: string,
  detalhe: string,
): Response {
  const contexto = contextoDeTemplate(c, { titulo, detalhe, status });
  const corpo = eta.render(TEMPLATE_DE_ERRO, contexto);
  return c.html(envolver(corpo, contexto, layoutPadrao(contexto)), status);
}

/**
 * Erro levantado dentro de um middleware não tem contexto de rota — `shared/http/erros.ts` só sabe
 * pedir HTML por status. Registrar aqui, no carregamento do módulo, troca a página mínima embutida
 * pela página do produto sem que `shared/` precise conhecer o motor de template.
 */
registrarRenderizadorDeErro((status, correlacaoId) => {
  const dados: DadosDeTemplate = {
    ...auxiliares,
    titulo: TITULOS[status],
    detalhe: DETALHES[status],
    status,
    correlacaoId,
    usuario: null,
    chave: crypto.randomUUID(),
    caminhoAtual: '',
    mensagem: null,
    erro: null,
  };
  return eta.render(LAYOUT_PUBLICO, { ...dados, body: eta.render(TEMPLATE_DE_ERRO, dados) });
});
