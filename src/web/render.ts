/**
 * Motor de template da camada web.
 *
 * Uma única função monta toda página: `renderizar` injeta em `it` o que nenhuma rota deveria
 * precisar lembrar de passar — o usuário da sessão, a chave de idempotência do formulário (I4), o
 * nome versionado do CSS (I10), o mapa de rotas, os formatadores de número e data, e as mensagens
 * que voltam na query depois de um POST-Redirect-GET. Rota que esquece um desses não existe.
 *
 * O escape é automático (`autoEscape`): interpolação de dado do usuário é segura por padrão, e
 * escrever `<%~ %>` passa a ser uma decisão visível na revisão.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Eta } from 'eta';
import type { Context } from 'hono';
import { ROTULO_DE_BIMESTRE } from '../avaliacao';
import { ALCANCE } from '../comunicacao';
import { PAPEL } from '../identidade';
import { config } from '../shared/config';
import { AMBIENTE_DESENVOLVIMENTO, ATIVOS, AUSENTE, CAMPO_CHAVE } from '../shared/constantes';
import { formatarCpf } from '../shared/documento';
import {
  contextoAtual,
  registrarRenderizadorDeErro,
  usuarioAtualOuNulo,
  type StatusDeErro,
} from '../shared/http';
import {
  ACOES,
  APRESENTACAO,
  AREAS,
  CAMPOS,
  CONTAGEM,
  CURINGA_DE_ASSET,
  DETALHES_DE_ERRO,
  DOCUMENTO,
  PARAMETROS,
  ROTAS,
  ROTULOS,
  SEM_ALUNO_MATRICULADO,
  SUFIXOS_DE_ID,
  TEMPLATES,
  TITULOS,
  TITULOS_DE_ERRO,
  type SubstantivoContavel,
} from './constantes';

const RAIZ = join(import.meta.dir, '..', '..');
const CAMINHO_DO_MANIFESTO = join(RAIZ, ATIVOS.diretorio, ATIVOS.manifesto);

/** Codificação do manifesto lido do disco — arquivo de texto gerado pelo build (I10). */
const CODIFICACAO_DO_MANIFESTO = 'utf8';

const emDesenvolvimento = config.ambiente === AMBIENTE_DESENVOLVIMENTO;

// Cache ligado fora de desenvolvimento: em produção o template não muda sem novo processo.
const eta = new Eta({
  views: join(import.meta.dir, TEMPLATES.diretorio),
  autoEscape: true,
  cache: !emDesenvolvimento,
  cacheFilepaths: !emDesenvolvimento,
});

/* --- Assets versionados (I10) --------------------------------------------- */

let manifesto: Record<string, string> | null = null;

const lerManifesto = (): Record<string, string> => {
  try {
    const bruto: unknown = JSON.parse(readFileSync(CAMINHO_DO_MANIFESTO, CODIFICACAO_DO_MANIFESTO));
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

/**
 * Extrai ano, mês e dia de um carimbo que COMEÇA com uma data ISO. Parente, e não igual, do
 * `FORMATOS.dataIso` de `shared`: aquele valida `AAAA-MM-DD` inteiro e sem grupos, este recorta o
 * dia de um `2026-03-15T14:30:00Z` que chega do banco.
 */
const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})/;

/** O separador decimal que `toFixed` produz — ponto, fixo pela linguagem e alheio ao locale. */
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

/**
 * Truncado, nunca arredondado — a mesma regra do cálculo da média. Arredondar 5,99 para 6,0 na
 * tela mostraria "aprovado" ao lado de uma situação "reprovado", e a divergência entre o número
 * impresso e o número que decidiu é justamente o que o domínio proíbe.
 */
const umaCasaTruncada = (valor: number): string => {
  const decimos = Math.trunc(valor * APRESENTACAO.fatorDeUmaCasa);
  return (decimos / APRESENTACAO.fatorDeUmaCasa)
    .toFixed(1)
    .replace(SEPARADOR_DECIMAL_DO_TO_FIXED, APRESENTACAO.separadorDecimal);
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
  return numero === null ? AUSENTE : `${umaCasaTruncada(numero)}${APRESENTACAO.sufixoDePercentual}`;
}

/**
 * Taxa sai do domínio como fração de 0 a 1, e é aqui — num lugar só — que ela vira percentual.
 * Deixar a multiplicação por 100 espalhada pelo template já custou uma tela mostrando "0,1 %" onde
 * eram 12,3 %: dois pontos escreviam a mesma taxa e só um deles lembrava de converter.
 */
export function formatarTaxa(fracao: ValorNumerico): string {
  const numero = comoNumero(fracao);
  return numero === null ? AUSENTE : formatarPercentual(numero * APRESENTACAO.fatorPercentual);
}

/**
 * Escolhe entre as duas metades de um substantivo de `CONTAGEM` — "1 disciplina", "3 disciplinas".
 *
 * Existe pela legibilidade do template, e não pela regra: a regra é um `=== 1`, que qualquer `.eta`
 * sabe escrever. O que o `.eta` não escreve sem ficar ilegível é o ternário INTEIRO depois que as
 * duas pontas viram constante — `it.totalNaoLidos === 1 ? it.contagem.comunicado.singular :
 * it.contagem.comunicado.plural` é pior de ler que a linha que ele substitui, e trocar duplicação
 * por linha ilegível não é progresso. Com o auxiliar sobra
 * `it.pluralizar(it.totalNaoLidos, it.contagem.comunicado)`, que diz a mesma coisa em uma leitura.
 */
export function pluralizar(quantidade: number, substantivo: SubstantivoContavel): string {
  return quantidade === 1 ? substantivo.singular : substantivo.plural;
}

/* --- Ids que descrevem um campo -------------------------------------------- */

/**
 * O OUTRO lado de `descricao()`, aqui embaixo: ela monta o `aria-describedby` do `<input>`, e estas
 * duas montam os `id` para onde aquela lista aponta.
 *
 * A regra — id do erro é `<campo>-erro`, id da ajuda é `<campo>-ajuda` — já estava escrita uma vez,
 * dentro de `descricao()`. A outra ponta estava escrita à mão em cada `.eta`, ora inteira
 * (`id="unidadeId-ajuda"`), ora pela metade (`id="dataInicio<%= sufixos.erro %>"`). Divergindo, o
 * `aria-describedby` aponta para um id que não existe: a caixa recusa, o texto do erro aparece na
 * tela, e o leitor de tela não lê nenhum dos dois. Nada falha, e ninguém que enxerga percebe.
 *
 * São funções, e não a concatenação escrita no template, por causa da legibilidade — que aqui é
 * requisito. Com o nome do campo vindo de `CAMPOS`, a forma direta seria
 * `id="<%= campos.dataInicio %><%= sufixos.erro %>"`: dois blocos colados, um contrato partido ao
 * meio e uma linha que um aluno lê duas vezes. `id="<%= it.idDoErro(campos.dataInicio) %>"` diz a
 * mesma coisa uma vez só, e é a mesma forma que o `.eta` já usa para `erroDe()` e `descricao()`.
 */
export const idDoErro = (campo: string): string => `${campo}${SUFIXOS_DE_ID.erro}`;

export const idDaAjuda = (campo: string): string => `${campo}${SUFIXOS_DE_ID.ajuda}`;

/* --- Montagem do contexto de template -------------------------------------- */

export type DadosDeTemplate = Record<string, unknown>;

/**
 * As chaves do próprio contexto que este arquivo lê de volta depois de montá-lo. São nomes de
 * campo do `it` que o `.eta` recebe, e não parâmetros de query: `CHAVES_DO_CONTEXTO.erro` e
 * `PARAMETROS.erro` se escrevem igual hoje e respondem a decisões diferentes — renomear o campo do
 * template não pode mudar a URL que volta do redirecionamento.
 */
const CHAVES_DO_CONTEXTO = {
  erros: 'erros',
  mensagem: 'mensagem',
  erro: 'erro',
  usuario: 'usuario',
} as const;

/** A mensagem volta na URL depois do redirecionamento; entra na página curta e escapada. */
const textoDaQuery = (c: Context, nome: string): string | null => {
  const bruto = c.req.query(nome);
  if (bruto === undefined) return null;
  const texto = bruto.trim().slice(0, APRESENTACAO.limiteDaMensagem);
  return texto === '' ? null : texto;
};

/**
 * Os dois layouts montam o `href` da folha trocando o curinga de `ROTAS.publicas.publico` pelo nome
 * versionado. As duas pontas dessa troca são decisões de `constantes.ts` — o `*` do padrão e o nome
 * lógico que o build publica —, e chegam ao `.eta` por aqui: o Eta não importa TypeScript, e
 * redigitá-las no template servia uma folha inexistente sem erro em lugar nenhum.
 *
 * `campoChave` viaja pela mesma razão. O `it.chave` que toda tela de escrita já recebia é o VALOR
 * da chave de idempotência (I4); o NOME do campo oculto que a carrega é a outra ponta do contrato
 * que `shared/http/idempotencia.ts` lê, e estava redigitado em cada `.eta`. Um `name` divergente
 * não falha em lugar nenhum: o middleware responde 400 e a tela some para quem estava usando.
 *
 * Os cinco logo abaixo de `rotas` são o que a MOLDURA precisa, e por isso não podiam ficar a cargo
 * do handler.
 * `_layout` e `_layout_publico` não são escolhidos por rota nenhuma — `layoutPadrao`, aqui embaixo,
 * decide entre os dois olhando a sessão, e a página de erro registrada no fim deste arquivo nem
 * passa por handler. Os parciais que os layouts incluem (`it.parciais`), as declarações do `<head>`
 * (`it.documento`), a marca e o rodapé (`it.apresentacao`) e o que `_navegacao` usa para rotular e
 * filtrar os links (`it.titulos`, `it.papel`) chegam então de onde a moldura é montada. A
 * alternativa era pedir a cada uma das rotas que se lembrasse de passá-los; a primeira que
 * esquecesse serviria a tela sem cabeçalho, sem menu e sem `<title>`.
 *
 * `it.titulo` continua sendo o título DESTA página, que a rota passa; `it.titulos` é o mapa inteiro,
 * de onde o menu tira o rótulo da tela para onde cada link leva.
 *
 * `alcances` entra ao lado de `papel` e pelo mesmo motivo: é vocabulário FECHADO de domínio que o
 * `.eta` compara. O formulário de comunicado escreve o alcance no `value` do rádio e o relê no
 * `checked`; do outro lado, `comunicacao` decide por ele qual consulta de destinatários roda.
 * Escrever "selecionados" errado aqui não falha em lugar nenhum — o envio cai no outro alcance, e um
 * comunicado dirigido a três pessoas chega à unidade inteira. Nenhuma rota deveria precisar lembrar
 * de passar isso, como nenhuma precisa lembrar de passar `papel`.
 *
 * `areas`, `rotulos`, `contagem`, `acoes`, `semAlunoMatriculado`, `rotuloDeBimestre` e `pluralizar`
 * chegam pela mesma porta, e pelo mesmo motivo. É o vocabulário de tela: o nome da área no
 * sobretítulo, o nome do dado no cabeçalho da coluna, o substantivo contado, o texto do botão que
 * sai da tela. Nenhum deles pertence a UMA rota — "Cancelar" está em doze telas de cinco arquivos de
 * rota diferentes, "Voltar à ficha" em três, "Aluno" em seis —, e pedir a cada rota que passe o que
 * a tela escreve daria certo até a primeira que esquecesse. O sintoma seria discreto e pior que uma
 * moldura sumindo: o `.eta` imprimiria a string vazia, e a coluna ficaria sem cabeçalho.
 *
 * `pluralizar` viaja junto com `contagem` porque é o par dela: o mapa guarda as duas metades do
 * substantivo, o auxiliar escolhe qual sai. Separá-los deixaria o template escrevendo o `=== 1` na
 * mão em nove lugares.
 *
 * `campos` é o `CAMPOS` da camada web — o mapa que aponta para o `CAMPOS` de cada um dos quatro
 * módulos. Cada `.eta` de formulário tira dele um apelido curto no bloco do topo
 * (`const campos = it.campos.anoLetivo;`) e escreve `name="<%= campos.dataInicio %>"` e
 * `erroDe(campos.dataInicio)`: o nome que ATRAVESSA o arquivo — a rota lê o corpo por ele, e o
 * `falhaDeCampo` do caso de uso o devolve — passa a ter uma origem só. O `id` e o `for` da própria
 * caixa continuam literais: eles casam um com o outro dentro das mesmas seis linhas, e `for="ano"`
 * ao lado de `id="ano"` é o HTML mais legível que um aluno pode encontrar.
 *
 * `idDoErro` e `idDaAjuda` fecham o terceiro lado desse triângulo, e é por causa deles que o `id` da
 * caixa pode continuar literal sem risco: o `id` do parágrafo de erro é o que `descricao()` promete
 * no `aria-describedby`, e essa promessa atravessa daqui até o `.eta`.
 */
const auxiliares = {
  asset,
  curingaDeAsset: CURINGA_DE_ASSET,
  nomeLogicoDaFolha: ATIVOS.nomeLogicoDaFolha,
  campoChave: CAMPO_CHAVE,
  rotas: ROTAS,
  parciais: TEMPLATES.parciais,
  documento: DOCUMENTO,
  apresentacao: APRESENTACAO,
  titulos: TITULOS,
  papel: PAPEL,
  alcances: ALCANCE,
  campos: CAMPOS,
  idDoErro,
  idDaAjuda,
  areas: AREAS,
  rotulos: ROTULOS,
  contagem: CONTAGEM,
  acoes: ACOES,
  semAlunoMatriculado: SEM_ALUNO_MATRICULADO,
  rotuloDeBimestre: ROTULO_DE_BIMESTRE,
  formatarCpf,
  formatarData,
  formatarDataHora,
  formatarNota,
  formatarPercentual,
  formatarTaxa,
  pluralizar,
} as const;

/* --- Erros de campo -------------------------------------------------------- */

type Problema = { readonly campo: string; readonly mensagem: string };

const problemasDe = (dados: DadosDeTemplate): readonly Problema[] => {
  const erros = dados[CHAVES_DO_CONTEXTO.erros];
  return Array.isArray(erros) ? (erros as readonly Problema[]) : [];
};

/** `aria-describedby` é lista de ids separada por espaço — gramática do HTML, não do produto. */
const SEPARADOR_DE_IDS = ' ';

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
  usuario: usuarioAtualOuNulo(c),
  // I4: chave nova a cada render — dois carregamentos da mesma tela são dois envios distintos,
  // mas dois cliques no mesmo botão carregam a mesma chave e produzem um registro só.
  chave: crypto.randomUUID(),
  caminhoAtual: c.req.path,
  correlacaoId: contextoAtual()?.correlacaoId ?? '',
  mensagem: dados[CHAVES_DO_CONTEXTO.mensagem] ?? textoDaQuery(c, PARAMETROS.ok),
  erro: dados[CHAVES_DO_CONTEXTO.erro] ?? textoDaQuery(c, PARAMETROS.erro),
});

const DOCUMENTO_COMPLETO = /^\s*<!doctype/i;

/**
 * A página pode declarar seu próprio layout com `layout("/_layout")`. Quando não declara, o
 * documento é montado aqui: aplicação para quem tem sessão, folha centrada para quem não tem.
 */
const envolver = (html: string, contexto: DadosDeTemplate, layout: string): string =>
  DOCUMENTO_COMPLETO.test(html) ? html : eta.render(layout, { ...contexto, body: html });

const layoutPadrao = (contexto: DadosDeTemplate): string =>
  contexto[CHAVES_DO_CONTEXTO.usuario] === null ? TEMPLATES.layoutPublico : TEMPLATES.layout;

/** Renderiza um template de `src/web/templates` como resposta HTML completa. */
export function renderizar(c: Context, template: string, dados: DadosDeTemplate = {}): Response {
  const contexto = contextoDeTemplate(c, dados);
  const corpo = eta.render(template, contexto);
  return c.html(envolver(corpo, contexto, layoutPadrao(contexto)));
}

/* --- Páginas de erro ------------------------------------------------------- */

/** Página de erro dentro do layout, com o código que o suporte usa para achar o rastro no log. */
export function renderizarErro(
  c: Context,
  status: StatusDeErro,
  titulo: string,
  detalhe: string,
): Response {
  const contexto = contextoDeTemplate(c, { titulo, detalhe, status });
  const corpo = eta.render(TEMPLATES.erro, contexto);
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
    titulo: TITULOS_DE_ERRO[status],
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
