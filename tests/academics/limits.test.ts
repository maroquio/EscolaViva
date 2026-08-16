import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { LIMITS } from '../../src/academics/constants';

const ENTIDADES_COM_LIMITE_DE_NOME = ['student', 'subject', 'guardian', 'classGroup'] as const;

type EntidadeComLimiteDeNome = (typeof ENTIDADES_COM_LIMITE_DE_NOME)[number];

type PoliticaDeNome = { readonly name: number };

const POLITICAS_DE_NOME: Readonly<Record<EntidadeComLimiteDeNome, PoliticaDeNome>> = LIMITS;

const POR_QUE_FUNDIR_E_O_DEFEITO =
  'cada uma destas entidades tem sua própria política de tamanho de nome, e elas apenas coincidem hoje: ' +
  'trocá-las por uma constante compartilhada faz uma decisão sobre uma entidade arrastar as outras três. ' +
  'classGroup.name é a que diverge, e é a prova de que a regra não é uma só; fundido, ele subiria junto com os ' +
  'demais em nome da consistência e o formulário de turma passaria a aceitar um nome que a política da ' +
  'turma recusa. Para mudar um limite, mude o número daquela entidade e deixe os outros três onde estão.';

const CAMINHO_RELATIVO_DAS_CONSTANTES = 'src/academics/constants.ts';

const RAIZ_DO_PROJETO = join(import.meta.dir, '..', '..');

const NUMERO_ESCRITO_NA_MAO = /^\d[\d_]*$/;

const DECLARACAO_DO_NOME = /(?:^|[{,])\s*name\s*:\s*([^,}\n]+)/;

const AUSENTE = '(nenhuma entrada `name` própria)';

const fonteDasConstantes = (): Promise<string> =>
  Bun.file(join(RAIZ_DO_PROJETO, CAMINHO_RELATIVO_DAS_CONSTANTES)).text();

const blocoDeChaves = (fonte: string, apartirDe: number): string => {
  const abertura = fonte.indexOf('{', apartirDe);
  if (abertura < 0) {
    throw new Error(
      `nenhum bloco depois da posição ${apartirDe} em ${CAMINHO_RELATIVO_DAS_CONSTANTES}`,
    );
  }
  let profundidade = 0;
  for (let posicao = abertura; posicao < fonte.length; posicao += 1) {
    if (fonte[posicao] === '{') {
      profundidade += 1;
    } else if (fonte[posicao] === '}') {
      profundidade -= 1;
      if (profundidade === 0) {
        return fonte.slice(abertura, posicao + 1);
      }
    }
  }
  throw new Error(`bloco aberto em ${abertura} não fecha em ${CAMINHO_RELATIVO_DAS_CONSTANTES}`);
};

const blocoDosLimites = (fonte: string): string => {
  const declaracao = fonte.indexOf('export const LIMITS');
  if (declaracao < 0) {
    throw new Error(`${CAMINHO_RELATIVO_DAS_CONSTANTES} não declara mais LIMITS`);
  }
  return blocoDeChaves(fonte, declaracao);
};

const comoOLimiteDoNomeEstaEscrito = (fonte: string, entidade: EntidadeComLimiteDeNome): string => {
  const limites = blocoDosLimites(fonte);
  const chave = new RegExp(`(?:^|[{,])\\s*${entidade}\\s*:`).exec(limites);
  if (chave === null) {
    return AUSENTE;
  }
  return DECLARACAO_DO_NOME.exec(blocoDeChaves(limites, chave.index))?.[1]?.trim() ?? AUSENTE;
};

const entidadesSemNumeroProprio = (fonte: string): string[] =>
  ENTIDADES_COM_LIMITE_DE_NOME.map((entidade) => ({
    entidade,
    escrito: comoOLimiteDoNomeEstaEscrito(fonte, entidade),
  }))
    .filter(({ escrito }) => !NUMERO_ESCRITO_NA_MAO.test(escrito))
    .map(
      ({ entidade, escrito }) =>
        `LIMITS.${entidade}.name está escrito como \`${escrito}\` em vez de um número só dele — ${POR_QUE_FUNDIR_E_O_DEFEITO}`,
    );

const FONTE_COM_OS_QUATRO_FUNDIDOS = `
const LIMITE_DE_NOME = 120;
export const LIMITS = {
  student: { name: LIMITE_DE_NOME, searchRows: 50 },
  subject: { name: LIMITE_DE_NOME },
  guardian: { name: LIMITE_DE_NOME, email: 254, phone: 30 },
  classGroup: { name: LIMITE_DE_NOME, gradeLevel: 60 },
} as const;
`;

const FONTE_COM_A_TURMA_ARRASTADA = `
export const LIMITS = {
  student: { name: 120, searchRows: 50 },
  subject: { name: 120 },
  guardian: { name: 120, email: 254, phone: 30 },
  classGroup: { name: LIMITS.student.name, gradeLevel: 60 },
} as const;
`;

const FONTE_COM_O_NOME_ESPALHADO_DE_UM_PADRAO = `
const PADRAO = { name: 120 };
export const LIMITS = {
  student: { ...PADRAO, searchRows: 50 },
  subject: { ...PADRAO },
  guardian: { ...PADRAO, email: 254, phone: 30 },
  classGroup: { ...PADRAO, gradeLevel: 60 },
} as const;
`;

describe('os quatro limites de nome do acadêmico são quatro políticas, e não uma', () => {
  test('cada entidade escreve o próprio número, e nenhuma aponta para constante compartilhada', async () => {
    const fundidas = entidadesSemNumeroProprio(await fonteDasConstantes());

    expect(fundidas).toEqual([]);
  });

  test('a leitura do arquivo é a mesma coisa que o módulo exporta, e não uma varredura em branco', async () => {
    const fonte = await fonteDasConstantes();

    const lidos = ENTIDADES_COM_LIMITE_DE_NOME.map((entidade) =>
      Number(comoOLimiteDoNomeEstaEscrito(fonte, entidade).replaceAll('_', '')),
    );

    expect(lidos).toEqual(ENTIDADES_COM_LIMITE_DE_NOME.map((e) => POLITICAS_DE_NOME[e].name));
  });

  test('o objeto exportado guarda quatro entradas `nome` próprias, uma por entidade', () => {
    const semEntradaPropria = ENTIDADES_COM_LIMITE_DE_NOME.filter(
      (entidade) =>
        typeof Object.getOwnPropertyDescriptor(POLITICAS_DE_NOME[entidade], 'name')?.value !==
        'number',
    ).map(
      (entidade) =>
        `LIMITS.${entidade} não tem entrada \`name\` própria — ${POR_QUE_FUNDIR_E_O_DEFEITO}`,
    );

    expect(semEntradaPropria).toEqual([]);
  });

  test('nenhuma entidade empresta o objeto de outra: quatro donos distintos', () => {
    const emprestados = ENTIDADES_COM_LIMITE_DE_NOME.flatMap((entidade, indice) =>
      ENTIDADES_COM_LIMITE_DE_NOME.slice(indice + 1)
        .filter((outra) => POLITICAS_DE_NOME[entidade] === POLITICAS_DE_NOME[outra])
        .map(
          (outra) =>
            `LIMITS.${entidade} e LIMITS.${outra} são o mesmo objeto — ${POR_QUE_FUNDIR_E_O_DEFEITO}`,
        ),
    );

    expect(emprestados).toEqual([]);
  });
});

describe('a verificação de fusão reprova de fato o arquivo fundido', () => {
  test('uma constante única para os quatro é acusada nas quatro entidades', () => {
    const fundidas = entidadesSemNumeroProprio(FONTE_COM_OS_QUATRO_FUNDIDOS);

    expect(fundidas.length).toBe(ENTIDADES_COM_LIMITE_DE_NOME.length);
    expect(fundidas.join('\n')).toContain('LIMITE_DE_NOME');
  });

  test('arrastar só a turma para o limite do aluno já é acusado', () => {
    const fundidas = entidadesSemNumeroProprio(FONTE_COM_A_TURMA_ARRASTADA);

    expect(fundidas.length).toBe(1);
    expect(fundidas.join('\n')).toContain('LIMITS.classGroup.name');
  });

  test('espalhar um padrão comum apaga as entradas próprias e é acusado nas quatro', () => {
    const fundidas = entidadesSemNumeroProprio(FONTE_COM_O_NOME_ESPALHADO_DE_UM_PADRAO);

    expect(fundidas.length).toBe(ENTIDADES_COM_LIMITE_DE_NOME.length);
    expect(fundidas.join('\n')).toContain(AUSENTE);
  });

  test('a acusação diz por que fundir é o defeito, e não só que algo mudou', () => {
    const fundidas = entidadesSemNumeroProprio(FONTE_COM_OS_QUATRO_FUNDIDOS);

    expect(fundidas.every((acusacao) => acusacao.includes(POR_QUE_FUNDIR_E_O_DEFEITO))).toBe(true);
  });
});
