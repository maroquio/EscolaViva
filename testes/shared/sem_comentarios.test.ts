import { describe, expect, test } from 'bun:test';
import { join, relative } from 'node:path';

const RAIZ = join(import.meta.dir, '..', '..');

const DIRETORIOS_DE_CODIGO = ['src', 'scripts'] as const;

const ARQUIVOS_DE_CODIGO = '**/*.{ts,eta,css,sh}';

const DIRETIVA_DE_MAGIC_VALUES = /magic-values:\s*permitido\s*[—-]\s*\S/;

const ABERTURA_DE_SCRIPT = '<script>';
const FECHAMENTO_DE_SCRIPT = '</script>';
const ABERTURA_DE_ETA = '<%';
const FECHAMENTO_DE_ETA = '%>';

type Comentario = {
  readonly arquivo: string;
  readonly linha: number;
  readonly texto: string;
};

type Achado = { readonly linha: number; readonly texto: string };

const linhaEm = (conteudo: string, posicao: number): number =>
  conteudo.slice(0, posicao).split('\n').length;

function pularLiteral(conteudo: string, inicio: number, aspas: string): number {
  let i = inicio + 1;
  while (i < conteudo.length) {
    if (conteudo[i] === '\\') {
      i += 2;
      continue;
    }
    if (conteudo[i] === aspas) return i + 1;
    i += 1;
  }
  return i;
}

function comentariosDeJs(conteudo: string, primeiraLinha = 1): Achado[] {
  const achados: Achado[] = [];
  let i = 0;
  while (i < conteudo.length) {
    const caractere = conteudo[i];
    if (caractere === '"' || caractere === "'" || caractere === '`') {
      i = pularLiteral(conteudo, i, caractere);
      continue;
    }
    if (caractere === '\\') {
      i += 2;
      continue;
    }
    if (caractere === '/' && conteudo[i + 1] === '/') {
      const quebra = conteudo.indexOf('\n', i);
      const fim = quebra === -1 ? conteudo.length : quebra;
      achados.push({
        linha: linhaEm(conteudo, i) + primeiraLinha - 1,
        texto: conteudo.slice(i, fim),
      });
      i = fim;
      continue;
    }
    if (caractere === '/' && conteudo[i + 1] === '*') {
      const encerramento = conteudo.indexOf('*/', i + 2);
      const fim = encerramento === -1 ? conteudo.length : encerramento + 2;
      achados.push({
        linha: linhaEm(conteudo, i) + primeiraLinha - 1,
        texto: conteudo.slice(i, fim),
      });
      i = fim;
      continue;
    }
    i += 1;
  }
  return achados;
}

function comentariosDeCss(conteudo: string): Achado[] {
  const achados: Achado[] = [];
  let i = 0;
  while (i < conteudo.length) {
    const caractere = conteudo[i];
    if (caractere === '"' || caractere === "'") {
      i = pularLiteral(conteudo, i, caractere);
      continue;
    }
    if (caractere === '/' && conteudo[i + 1] === '*') {
      const encerramento = conteudo.indexOf('*/', i + 2);
      const fim = encerramento === -1 ? conteudo.length : encerramento + 2;
      achados.push({ linha: linhaEm(conteudo, i), texto: conteudo.slice(i, fim) });
      i = fim;
      continue;
    }
    i += 1;
  }
  return achados;
}

function trechosDelimitados(
  conteudo: string,
  abertura: string,
  fechamento: string,
): { readonly texto: string; readonly primeiraLinha: number }[] {
  const trechos: { texto: string; primeiraLinha: number }[] = [];
  let i = 0;
  while (i < conteudo.length) {
    const abre = conteudo.indexOf(abertura, i);
    if (abre === -1) break;
    const inicio = abre + abertura.length;
    const fecha = conteudo.indexOf(fechamento, inicio);
    const fim = fecha === -1 ? conteudo.length : fecha;
    trechos.push({ texto: conteudo.slice(inicio, fim), primeiraLinha: linhaEm(conteudo, inicio) });
    i = fim + fechamento.length;
  }
  return trechos;
}

function comentariosDeEta(conteudo: string): Achado[] {
  const blocos = [
    ...trechosDelimitados(conteudo, ABERTURA_DE_ETA, FECHAMENTO_DE_ETA),
    ...trechosDelimitados(conteudo, ABERTURA_DE_SCRIPT, FECHAMENTO_DE_SCRIPT),
  ];
  return blocos.flatMap((bloco) => comentariosDeJs(bloco.texto, bloco.primeiraLinha));
}

function comentariosDeShell(conteudo: string): Achado[] {
  return conteudo.split('\n').flatMap((linha, indice) => {
    const eInterpretador = indice === 0 && linha.startsWith('#!');
    if (eInterpretador || !linha.trimStart().startsWith('#')) return [];
    return [{ linha: indice + 1, texto: linha.trim() }];
  });
}

const LEITOR_POR_EXTENSAO: Record<string, (conteudo: string) => Achado[]> = {
  ts: comentariosDeJs,
  eta: comentariosDeEta,
  css: comentariosDeCss,
  sh: comentariosDeShell,
};

const extensaoDe = (caminho: string): string => caminho.slice(caminho.lastIndexOf('.') + 1);

async function comentariosDoCodigo(): Promise<Comentario[]> {
  const glob = new Bun.Glob(ARQUIVOS_DE_CODIGO);
  const comentarios: Comentario[] = [];
  for (const diretorio of DIRETORIOS_DE_CODIGO) {
    const raizDoDiretorio = join(RAIZ, diretorio);
    for await (const encontrado of glob.scan({ cwd: raizDoDiretorio })) {
      const caminho = join(raizDoDiretorio, encontrado);
      const ler = LEITOR_POR_EXTENSAO[extensaoDe(encontrado)];
      if (ler === undefined) continue;
      const conteudo = await Bun.file(caminho).text();
      for (const achado of ler(conteudo)) {
        comentarios.push({ arquivo: relative(RAIZ, caminho), linha: achado.linha, texto: achado.texto });
      }
    }
  }
  return comentarios;
}

const emUmaLinha = (comentario: Comentario): string =>
  `${comentario.arquivo}:${comentario.linha}: ${comentario.texto.split('\n')[0]}`;

describe('o código não carrega comentário', () => {
  test('nenhum comentário sobra em src/ e scripts/ além das diretivas de ferramenta', async () => {
    const comentarios = await comentariosDoCodigo();

    const sobras = comentarios.filter(({ texto }) => !DIRETIVA_DE_MAGIC_VALUES.test(texto));

    expect(sobras.map(emUmaLinha)).toEqual([]);
  });

  test('a norma vale para a folha de estilo e para os scripts de shell', async () => {
    const comentarios = await comentariosDoCodigo();

    const porExtensao = new Set(comentarios.map(({ arquivo }) => extensaoDe(arquivo)));

    expect(porExtensao.has('css')).toBe(false);
    expect(porExtensao.has('sh')).toBe(false);
  });

  test('o interpretador dos scripts de shell continua na primeira linha', async () => {
    const scripts = ['scripts/backup.sh', 'scripts/restore-test.sh'];

    const primeiras = await Promise.all(
      scripts.map(async (script) => (await Bun.file(join(RAIZ, script)).text()).split('\n')[0]),
    );

    expect(primeiras).toEqual(['#!/usr/bin/env bash', '#!/usr/bin/env bash']);
  });

  test('o leitor enxerga o comentário que a norma proíbe, em cada linguagem', () => {
    const achados = [
      comentariosDeJs('const a = 1; // sobrou'),
      comentariosDeCss('.a { color: red; } /* sobrou */'),
      comentariosDeEta('<p>oi</p>\n<% /* sobrou */ %>'),
      comentariosDeShell('#!/usr/bin/env bash\n# sobrou'),
    ];

    expect(achados.map((achado) => achado.length)).toEqual([1, 1, 1, 1]);
  });

  test('o leitor não confunde texto entre aspas com comentário', () => {
    const urlEmJs = comentariosDeJs("const url = 'https://exemplo.test/a';");
    const urlEmCss = comentariosDeCss(".a { background-image: url('/*nao*/.svg'); }");
    const expressaoRegular = comentariosDeJs('const r = /^\\s*\\/\\//;');
    const cerquilhaEmComando = comentariosDeShell("sed -E 's#://[^@/]+@#://***@#'");

    expect([urlEmJs, urlEmCss, expressaoRegular, cerquilhaEmComando].map((a) => a.length)).toEqual([
      0, 0, 0, 0,
    ]);
  });
});
