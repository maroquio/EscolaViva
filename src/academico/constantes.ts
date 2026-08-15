/**
 * As constantes do módulo acadêmico: limites de campo, textos de recusa, códigos de erro e os
 * nomes de campo que atravessam a fronteira até o formulário.
 *
 * O agrupamento é POR DONO, nunca por valor. `LIMITES.aluno.nome`, `LIMITES.disciplina.nome` e
 * `LIMITES.responsavel.nome` valem 120 os três e são três políticas separadas — ninguém nunca
 * decidiu que o nome de uma disciplina e o de um aluno cabem no mesmo tamanho, eles só
 * concordam hoje. `LIMITES.turma.nome` vale 60 e é a prova: se as quatro fossem uma constante só,
 * essa quarta teria sido "corrigida" para 120 em nome da consistência, e o formulário de turma
 * passaria a aceitar um nome que o banco recusa.
 *
 * O mesmo vale para os textos. `MENSAGENS.aluno.nomeLongo` e `MENSAGENS.turma.nomeLongo` são a
 * mesma frase com números diferentes: cada uma interpola o SEU limite, e é por isso que são duas.
 *
 * Vocabulário fechado que gera tipo — `TURNOS`, `SITUACOES_DE_MATRICULA`, `MATRICULA_ATIVA` —
 * continua no `dominio/`, que é onde ele é fonte de tipo e de `type guard`. Quem está fora do
 * módulo o encontra reexportado pelo `index.ts`, junto com este arquivo.
 *
 * Este arquivo não importa NADA em tempo de execução, e o `import type` abaixo é apagado na
 * compilação. A regra existe porque o caminho natural do refactor é o oposto — `dominio/aluno.ts`
 * passando a ler `LIMITES` daqui —, e uma seta de volta fecharia um ciclo em que uma das duas
 * constantes seria lida antes de existir.
 */

import type { SituacaoMatricula } from './dominio/matricula';
import type { Turno } from './dominio/turma';

/* --- Limites ---------------------------------------------------------------- */

export const LIMITES = {
  aluno: {
    nome: 120,
    /**
     * Teto da busca por nome quando o chamador não pede página: quem chama sem faixa está pedindo
     * uma amostra. Nada a ver com `aluno.nome` — é quantidade de linhas, não tamanho de texto.
     */
    busca: 50,
  },
  disciplina: { nome: 120 },
  responsavel: { nome: 120, email: 254, telefone: 30 },
  turma: { nome: 60, serie: 60 },
  parentesco: { descricao: 40 },
  anoLetivo: { anoMinimo: 2000, anoMaximo: 2100 },
} as const;

/* --- Nomes de campo --------------------------------------------------------- */

/**
 * A chave que amarra schema zod, `falhaDeCampo` e `erroDe()` no `.eta`. Errar uma delas não quebra
 * compilação nem teste: o erro simplesmente deixa de aparecer embaixo do campo, e o usuário vê um
 * formulário que recusa sem dizer onde.
 *
 * `CAMPOS.turma.nome` e `CAMPOS.disciplina.nome` são ambos `'nome'` e continuam separados: são
 * campos de dois formulários diferentes, e renomear um não renomeia o outro.
 */
export const CAMPOS = {
  aluno: { nome: 'nome', dataNascimento: 'dataNascimento' },
  disciplina: { nome: 'nome' },
  responsavel: { nome: 'nome', email: 'email', telefone: 'telefone', cpf: 'cpf' },
  turma: {
    nome: 'nome',
    serie: 'serie',
    turno: 'turno',
    unidadeId: 'unidadeId',
    anoLetivoId: 'anoLetivoId',
  },
  anoLetivo: { ano: 'ano', dataInicio: 'dataInicio', dataFim: 'dataFim' },
  alocacao: {
    turmaId: 'turmaId',
    disciplinaId: 'disciplinaId',
    professorUsuarioId: 'professorUsuarioId',
  },
  matricula: {
    alunoId: 'alunoId',
    turmaId: 'turmaId',
    anoLetivoId: 'anoLetivoId',
    dataMatricula: 'dataMatricula',
  },
  transferencia: { matriculaId: 'matriculaId', turmaDestinoId: 'turmaDestinoId', data: 'data' },
  vinculo: {
    alunoId: 'alunoId',
    responsavelId: 'responsavelId',
    parentesco: 'parentesco',
    financeiro: 'financeiro',
  },
} as const;

/* --- Códigos de erro -------------------------------------------------------- */

/**
 * Contrato de máquina: é o que o teste afirma e o que a camada web compara. Mudar um código é
 * mudar uma API, e por isso eles vivem separados das mensagens, que são texto de tela.
 *
 * Os do topo são compartilhados por mais de um caso de uso PORQUE significam a mesma coisa em
 * todos, com a MESMA frase: `turmaNaoEncontrada` é o par exato de `MENSAGENS.turmaNaoEncontrada`
 * na matrícula e na alocação. Os aninhados são de um caso de uso só.
 *
 * O agrupamento acompanha o das mensagens, e não o dos valores. Onde a recusa foi específica o
 * bastante para merecer prosa própria — "turma de destino" em vez de "turma", "deixou de estar
 * ativa antes da transferência" em vez de "apenas uma matrícula ativa pode ser transferida" — o
 * código é declarado em separado, ao lado da mensagem que o acompanha, mesmo quando a string
 * coincide hoje. É a mesma razão de `LIMITES.aluno.nome` e `LIMITES.disciplina.nome` valerem 120 e
 * continuarem dois: um código fundido só se percebe quando a web já está comparando o errado.
 */
export const CODIGOS = {
  alunoNaoEncontrado: 'aluno_nao_encontrado',
  turmaNaoEncontrada: 'turma_nao_encontrada',
  anoLetivoNaoEncontrado: 'ano_letivo_nao_encontrado',
  disciplinaNaoEncontrada: 'disciplina_nao_encontrada',
  responsavelNaoEncontrado: 'responsavel_nao_encontrado',

  aluno: { dataNoFuturo: 'data_no_futuro' },
  disciplina: { duplicada: 'disciplina_duplicada' },
  responsavel: { emailDuplicado: 'email_duplicado' },
  turma: { unidadeNaoEncontrada: 'unidade_nao_encontrada', duplicada: 'turma_duplicada' },
  anoLetivo: { periodoIncoerente: 'periodo_incoerente', duplicado: 'ano_duplicado' },
  alocacao: {
    semPapelDeProfessor: 'sem_papel_de_professor',
    disciplinaJaAlocada: 'disciplina_ja_alocada',
  },
  matricula: {
    ativaDuplicada: 'matricula_ativa_duplicada',
    /** Par de `MENSAGENS.matricula.turmaDeOutroAno` — "não pertence ao ano letivo informado". */
    turmaDeOutroAno: 'turma_de_outro_ano',
  },
  transferencia: {
    matriculaNaoEncontrada: 'matricula_nao_encontrada',
    /** Checagem prévia: a matrícula já não estava ativa quando a tela foi enviada. */
    somenteAtivaTransfere: 'matricula_nao_ativa',
    /** Corrida perdida no UPDATE. Outro evento, outra frase — e por isso outro código. */
    perdeuACorrida: 'matricula_nao_ativa',
    mesmaTurma: 'mesma_turma',
    /** A tela diz "turma de destino", e não "turma": o par de `turmaDestinoNaoEncontrada`. */
    turmaDestinoNaoEncontrada: 'turma_nao_encontrada',
    /** Par de `MENSAGENS.transferencia.turmaDeOutroAno` — "a turma de DESTINO pertence a outro". */
    turmaDeOutroAno: 'turma_de_outro_ano',
  },
  vinculo: { duplicado: 'vinculo_duplicado' },
} as const;

/* --- Mensagens -------------------------------------------------------------- */

/**
 * Texto de tela. Os interpolados já vêm resolvidos contra o SEU limite — `nomeLongo` do aluno cita
 * 120 e o da turma cita 60, e é justamente por isso que não podem ser a mesma constante.
 *
 * As do topo são compartilhadas porque são a mesma frase para o mesmo fato. `turmaNaoEncontrada`
 * NÃO cobre a transferência: lá o texto fala em "turma de destino", e uniformizar mudaria a tela.
 * `CODIGOS` acompanha esta divisão chave por chave — quem acrescentar uma frase aqui encontra o
 * código irmão no mesmo caminho lá em cima, e não um código genérico servindo duas telas.
 */
export const MENSAGENS = {
  alunoObrigatorio: 'Selecione um aluno.',
  anoLetivoObrigatorio: 'Selecione o ano letivo.',
  alunoNaoEncontrado: 'Aluno não encontrado nesta rede.',
  turmaNaoEncontrada: 'Turma não encontrada nesta rede.',
  anoLetivoNaoEncontrado: 'Ano letivo não encontrado nesta rede.',
  disciplinaNaoEncontrada: 'Disciplina não encontrada nesta rede.',
  responsavelNaoEncontrado: 'Responsável não encontrado nesta rede.',

  aluno: {
    nomeObrigatorio: 'Informe o nome do aluno.',
    nomeLongo: `O nome precisa ter até ${LIMITES.aluno.nome} caracteres.`,
    dataNascimentoFormato: 'Informe a data de nascimento no formato AAAA-MM-DD.',
    dataNoFuturo: 'A data de nascimento não pode estar no futuro.',
  },
  disciplina: {
    nomeObrigatorio: 'Informe o nome da disciplina.',
    nomeLongo: `O nome precisa ter até ${LIMITES.disciplina.nome} caracteres.`,
    duplicada: 'Esta rede já tem uma disciplina com este nome.',
  },
  responsavel: {
    nomeObrigatorio: 'Informe o nome do responsável.',
    nomeLongo: `O nome precisa ter até ${LIMITES.responsavel.nome} caracteres.`,
    emailInvalido: 'Informe um e-mail válido.',
    emailLongo: `O e-mail precisa ter até ${LIMITES.responsavel.email} caracteres.`,
    telefoneLongo: `O telefone precisa ter até ${LIMITES.responsavel.telefone} caracteres.`,
    /** Mesmo texto que o de `identidade`, política de outro módulo. Não fundir. */
    cpfInvalido: 'Informe um CPF válido.',
    emailDuplicado: 'Esta rede já tem um responsável com este e-mail.',
  },
  turma: {
    unidadeObrigatoria: 'Selecione a unidade.',
    nomeObrigatorio: 'Informe o nome da turma.',
    nomeLongo: `O nome precisa ter até ${LIMITES.turma.nome} caracteres.`,
    serieObrigatoria: 'Informe a série.',
    serieLonga: `A série precisa ter até ${LIMITES.turma.serie} caracteres.`,
    turnoInvalido: 'Turno inválido.',
    unidadeNaoEncontrada: 'Unidade não encontrada nesta rede.',
    duplicada: 'Esta unidade já tem uma turma com este nome neste ano letivo.',
  },
  anoLetivo: {
    anoNaoInteiro: 'O ano precisa ser um número inteiro.',
    anoAbaixoDoMinimo: `O ano precisa ser a partir de ${LIMITES.anoLetivo.anoMinimo}.`,
    anoAcimaDoMaximo: `O ano precisa ser até ${LIMITES.anoLetivo.anoMaximo}.`,
    dataInicioFormato: 'Informe a data de início no formato AAAA-MM-DD.',
    dataFimFormato: 'Informe a data de término no formato AAAA-MM-DD.',
    periodoIncoerente: 'A data de término precisa ser posterior à data de início.',
    duplicado: (ano: number): string => `Esta rede já tem o ano letivo ${ano} definido.`,
  },
  alocacao: {
    /** "Selecione a turma." — texto próprio. A matrícula usa "Selecione uma turma.". */
    turmaObrigatoria: 'Selecione a turma.',
    disciplinaObrigatoria: 'Selecione a disciplina.',
    professorObrigatorio: 'Selecione o professor.',
    semPapelDeProfessor: 'Este usuário não tem papel de professor na unidade desta turma.',
    disciplinaJaAlocada: 'Esta disciplina já está alocada nesta turma.',
  },
  matricula: {
    turmaObrigatoria: 'Selecione uma turma.',
    dataFormato: 'Informe a data da matrícula no formato AAAA-MM-DD.',
    turmaDeOutroAno: 'A turma não pertence ao ano letivo informado.',
    ativaDuplicada: 'Este aluno já tem matrícula ativa neste ano letivo.',
  },
  transferencia: {
    matriculaObrigatoria: 'Selecione a matrícula.',
    turmaDestinoObrigatoria: 'Selecione a turma de destino.',
    dataFormato: 'Informe a data da transferência no formato AAAA-MM-DD.',
    matriculaNaoEncontrada: 'Matrícula não encontrada nesta rede.',
    /** Checagem prévia: a matrícula já não estava ativa quando a tela foi enviada. */
    somenteAtivaTransfere: 'Apenas uma matrícula ativa pode ser transferida.',
    /** Corrida perdida: outra requisição encerrou a matrícula durante a transferência. */
    perdeuACorrida: 'Esta matrícula deixou de estar ativa antes da transferência ser concluída.',
    mesmaTurma: 'A turma de destino é a mesma turma da matrícula atual.',
    turmaDestinoNaoEncontrada: 'Turma de destino não encontrada nesta rede.',
    turmaDeOutroAno: 'A turma de destino pertence a outro ano letivo.',
  },
  vinculo: {
    responsavelObrigatorio: 'Selecione um responsável.',
    parentescoObrigatorio: 'Informe o parentesco.',
    parentescoLongo: `O parentesco precisa ter até ${LIMITES.parentesco.descricao} caracteres.`,
    duplicado: 'Este responsável já está vinculado a este aluno.',
  },
} as const;

/* --- Erros internos --------------------------------------------------------- */

/**
 * Texto de `throw`, não de formulário. Estes chegam ao log e à página 500: são falhas de
 * integridade — o banco devolveu algo que a aplicação não sabe interpretar — e não erro de quem
 * está digitando.
 */
export const ERROS_INTERNOS = {
  situacaoDesconhecida: (valor: string): string => `situação de matrícula desconhecida: ${valor}`,
  turnoDesconhecido: (valor: string): string => `turno fora do conjunto conhecido: ${valor}`,
  conflitoDeMatriculaNaTransferencia: 'conflito de matrícula ativa durante a transferência',
} as const;

/* --- Vocabulário de tela ---------------------------------------------------- */

/**
 * O código do domínio e o nome que aparece na tela. Mora no módulo dono, e não em `web/`, porque
 * acrescentar um turno ou uma situação é mudança de domínio: quem acrescentar o valor encontra o
 * rótulo faltando aqui, no mesmo módulo, em vez de descobrir pela tabela mostrando o código cru.
 */
export const VOCABULARIO = {
  turno: {
    matutino: 'Matutino',
    vespertino: 'Vespertino',
    noturno: 'Noturno',
    integral: 'Integral',
  } as const satisfies Record<Turno, string>,
  situacaoDeMatricula: {
    ativa: 'Ativa',
    transferida: 'Transferida',
    cancelada: 'Cancelada',
    concluida: 'Concluída',
  } as const satisfies Record<SituacaoMatricula, string>,
} as const;
