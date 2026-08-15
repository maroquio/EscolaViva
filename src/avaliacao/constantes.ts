/**
 * As constantes do módulo de avaliação: nota, frequência, boletim e fechamento de bimestre.
 *
 * Este é o módulo onde o merge por valor seria mais tentador e mais destrutivo. Três exemplos que
 * o arquivo mantém deliberadamente separados:
 *
 *   - `LIMITES.nota.maximo` (10) e `TAMANHO_DA_DATA_ISO` (10, em `shared`). Um é o teto da escala
 *     pedagógica, o outro é o comprimento de `AAAA-MM-DD`. Nada os liga além do algarismo.
 *   - `ARITMETICA.centesimos` (100) e `ARITMETICA.percentual` (100). O primeiro converte nota em
 *     centésimos inteiros; o segundo converte fração de presença em porcentagem. Se a escala de
 *     nota passasse a milésimos, o primeiro viraria 1000 e o segundo continuaria 100.
 *   - `MENSAGENS.notaForaDaEscala` ("A nota precisa ficar entre 0 e 10.") e a mensagem da tela do
 *     professor ("Use um número de 0 a 10."). Dois textos, duas camadas; uniformizá-los mudaria a
 *     tela, e este refactor não muda comportamento.
 *
 * `BIMESTRES`, `QUANTIDADE_DE_BIMESTRES` e os limites que o próprio domínio aplica continuam em
 * `dominio/nota.ts` e `dominio/boletim.ts`; o `index.ts` os reexporta junto com este arquivo.
 * Este arquivo não importa nada em tempo de execução.
 */

/* --- Limites ---------------------------------------------------------------- */

export const LIMITES = {
  /** A escala do lançamento. O banco repete a regra em `valor_valido` (I8). */
  nota: { minimo: 0, maximo: 10 },
  /**
   * Tamanho do texto de justificativa de falta. É UMA política escrita hoje em dois lugares — o
   * `maxlength` do `textarea` e o `max()` do schema. Divergindo, o navegador corta num tamanho e
   * o servidor recusa noutro, e o professor perde o que escreveu sem entender por quê.
   */
  justificativa: 500,
} as const;

/* --- Aritmética do boletim -------------------------------------------------- */

export const ARITMETICA = {
  /** Nota decimal → centésimos inteiros. */
  centesimos: 100,
  /** Fração de presença → porcentagem. Mesmo valor de `centesimos`, outra decisão. */
  percentual: 100,
  /**
   * Folga de erro de representação em double aceita ao converter para centésimos. Separa
   * 744,9999999999 (que vale 745) de 599,5000000001 (que vale 599, e reprova). Um centésimo é dez
   * mil vezes maior que isto: a tolerância cabe no ruído do ponto flutuante e em nada mais.
   */
  toleranciaDeRepresentacao: 1e-6,
} as const;

/**
 * As duas condições da aprovação, em centésimos. São INDEPENDENTES: média e frequência podem
 * mudar separadamente, e é por isso que não formam um único "critério de aprovação".
 */
export const APROVACAO = {
  mediaMinimaEmCentesimos: 600,
  frequenciaMinimaEmCentesimos: 7500,
} as const;

/* --- Formatos --------------------------------------------------------------- */

/**
 * Meia-noite UTC anexada à data ISO para provar que o dia existe (rejeita `2026-02-30`).
 *
 * NÃO é o `T12:00:00Z` da camada web: lá o meio-dia é deliberado, para que somar um dia não
 * tropece em fuso ao navegar entre datas de chamada. Aqui basta a meia-noite porque só se compara
 * a volta ao texto. Valores diferentes, decisões independentes.
 */
export const MEIA_NOITE_UTC = 'T00:00:00Z';

/* --- Nomes de campo --------------------------------------------------------- */

export const CAMPOS = {
  turmaId: 'turmaId',
  turmaDisciplinaId: 'turmaDisciplinaId',
  bimestre: 'bimestre',
  data: 'data',
  /** A coleção inteira, quando o erro é do lote e não de uma linha. */
  notas: 'notas',
  linhas: 'linhas',
} as const;

/* --- Códigos de erro -------------------------------------------------------- */

export const CODIGOS = {
  /** "A entidade referida não existe nesta rede" — turma na chamada e no fechamento. */
  naoEncontrada: 'nao_encontrada',
  anoLetivoAusente: 'ano_letivo_ausente',
  dataForaDoAnoLetivo: 'data_fora_do_ano_letivo',
  matriculaForaDaTurma: 'matricula_fora_da_turma',
  matriculaRepetida: 'matricula_repetida',
  /** Recusa de ALTERAR nota em bimestre fechado. */
  bimestreFechado: 'bimestre_fechado',
  /** Recusa de FECHAR de novo o que já está fechado. Outro evento, outro código. */
  jaFechado: 'ja_fechado',
  semDisciplina: 'sem_disciplina',
  semMatriculaAtiva: 'sem_matricula_ativa',
  fechamentoIncompleto: 'fechamento_incompleto',
} as const;

/* --- Mensagens -------------------------------------------------------------- */

export const MENSAGENS = {
  /** O conjunto de bimestres é um só no módulo: lançamento e fechamento mudam juntos. */
  bimestreInvalido: 'O bimestre precisa ser 1, 2, 3 ou 4.',
  notaForaDaEscala: 'A nota precisa ficar entre 0 e 10.',
  loteDeNotasVazio: 'Nenhuma nota foi enviada.',
  turmaNaoEncontrada: 'Turma não encontrada nesta rede.',
  turmaDisciplinaNaoEncontrada: 'Disciplina da turma não encontrada nesta rede.',
  bimestreFechadoParaLancamento:
    'O bimestre já foi fechado para esta turma; as notas não podem mais ser alteradas.',

  notas: {
    /** Termina em "no lançamento"; a irmã da chamada termina em "na chamada". São duas. */
    matriculaForaDaTurma: 'Há aluno sem matrícula ativa nesta turma no lançamento.',
    matriculaRepetida: 'O mesmo aluno aparece duas vezes.',
  },
  chamada: {
    dataInvalida: 'Informe uma data válida no formato AAAA-MM-DD.',
    justificativaLonga: 'A justificativa é longa demais.',
    loteVazio: 'Nenhuma linha de chamada foi enviada.',
    anoLetivoAusente: 'A turma não tem ano letivo definido.',
    dataForaDoAnoLetivo: (inicio: string, fim: string): string =>
      `A chamada precisa cair entre ${inicio} e ${fim}.`,
    matriculaForaDaTurma: 'Há aluno sem matrícula ativa nesta turma na chamada.',
    /** Byte a byte igual ao aviso do lote de notas, e de outro caso de uso. Não fundir. */
    matriculaRepetida: 'O mesmo aluno aparece duas vezes.',
  },
  fechamento: {
    semDisciplina: 'A turma não tem disciplina alocada; não há bimestre a fechar.',
    semMatriculaAtiva: 'A turma não tem matrícula ativa; não há bimestre a fechar.',
    jaFechado: 'Este bimestre já está fechado para a turma.',
    /**
     * A recusa precisa dizer para onde ir. "Faltam 7 notas" manda a secretaria procurar;
     * "Matemática (5), História (2)" manda ela abrir duas telas e resolver.
     */
    pendencia: (disciplina: string, faltando: number): string => `${disciplina} (${faltando})`,
    separadorDePendencias: ', ',
    pendenciaSingular: (detalhe: string): string =>
      `Falta 1 nota para fechar o bimestre: ${detalhe}.`,
    pendenciaPlural: (total: number, detalhe: string): string =>
      `Faltam ${total} notas para fechar o bimestre: ${detalhe}.`,
  },
} as const;

/* --- Vocabulário de tela ---------------------------------------------------- */

/**
 * `situacaoFinal` é a do BOLETIM (aprovado/reprovado/em curso) e não tem relação com a situação de
 * uma MATRÍCULA (ativa/transferida/…), que pertence ao acadêmico. As duas alimentam etiquetas na
 * mesma folha de estilo, e é só isso que têm em comum.
 */
export const VOCABULARIO = {
  situacaoFinal: { aprovado: 'Aprovado', reprovado: 'Reprovado', em_curso: 'Em curso' },
  presenca: { presente: 'Presente', faltaJustificada: 'Falta justificada', falta: 'Falta' },
  fechamento: { fechado: 'Fechado', aberto: 'Aberto' },
} as const;
