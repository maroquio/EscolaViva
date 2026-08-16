import type { SituacaoMatricula } from './domain/enrollment';
import type { Turno } from './domain/classGroup';

export const LIMITES = {
  aluno: {
    nome: 120,
    linhasDaBusca: 50,
  },
  disciplina: { nome: 120 },
  responsavel: { nome: 120, email: 254, telefone: 30 },
  turma: { nome: 60, serie: 60 },
  parentesco: { descricao: 40 },
  anoLetivo: { anoMinimo: 2000, anoMaximo: 2100 },
} as const;

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
    turmaDeOutroAno: 'turma_de_outro_ano',
  },
  transferencia: {
    matriculaNaoEncontrada: 'matricula_nao_encontrada',
    somenteAtivaTransfere: 'matricula_nao_ativa',
    perdeuACorrida: 'matricula_nao_ativa',
    mesmaTurma: 'mesma_turma',
    turmaDestinoNaoEncontrada: 'turma_nao_encontrada',
    turmaDeOutroAno: 'turma_de_outro_ano',
  },
  vinculo: { duplicado: 'vinculo_duplicado' },
} as const;

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
    somenteAtivaTransfere: 'Apenas uma matrícula ativa pode ser transferida.',
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

export const ERROS_INTERNOS = {
  situacaoDesconhecida: (valor: string): string => `situação de matrícula desconhecida: ${valor}`,
  turnoDesconhecido: (valor: string): string => `turno fora do conjunto conhecido: ${valor}`,
  conflitoDeMatriculaNaTransferencia: 'conflito de matrícula ativa durante a transferência',
} as const;

export const VOCABULARIO = {
  turno: {
    morning: 'Matutino',
    afternoon: 'Vespertino',
    evening: 'Noturno',
    full_time: 'Integral',
  } as const satisfies Record<Turno, string>,
  situacaoDeMatricula: {
    active: 'Ativa',
    transferred: 'Transferida',
    cancelled: 'Cancelada',
    completed: 'Concluída',
  } as const satisfies Record<SituacaoMatricula, string>,
} as const;
