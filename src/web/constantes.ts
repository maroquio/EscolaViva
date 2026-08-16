import { ACADEMIC_FIELDS } from '../academics';
import { ASSESSMENT_FIELDS, TERM_LABEL } from '../assessment';
import { COMMUNICATION_FIELDS } from '../communication';
import { IDENTITY_FIELDS, ROLE } from '../identity';
import { ASSETS, ENTRY_PATHS, HEALTH_PATHS, MISSING_VALUE } from '../shared/constants';
import { grupo } from './rotas/mapa';

export { ASSETS, ERROR_TITLES, MISSING_VALUE } from '../shared/constants';

export const PREFIXO_PUBLICO = ASSETS.urlPrefix;

export const CURINGA_DE_ASSET = '*';

export const ROTAS = {
  publicas: grupo('', {
    raiz: '/',
    login: ENTRY_PATHS.login,
    logout: '/logout',
    painel: ENTRY_PATHS.dashboard,
    saude: HEALTH_PATHS.readiness,
    saudeViva: HEALTH_PATHS.liveness,
    publico: `${PREFIXO_PUBLICO}${CURINGA_DE_ASSET}`,
  }),

  conta: grupo('/conta', {
    senha: '/senha',
  }),

  rede: grupo('/rede', {
    painel: '/',
    unidades: '/unidades',
    unidadeNova: '/unidades/nova',
    usuarios: '/usuarios',
    usuarioNovo: '/usuarios/novo',
    anosLetivos: '/anos-letivos',
    anoLetivoNovo: '/anos-letivos/novo',
  }),

  secretaria: grupo('/secretaria', {
    painel: '/',
    alunos: '/alunos',
    alunoNovo: '/alunos/novo',
    aluno: '/alunos/:id',
    alunoResponsavelNovo: '/alunos/:id/responsaveis/novo',
    alunoResponsaveis: '/alunos/:id/responsaveis',
    alunoMatricular: '/alunos/:id/matricular',
    matriculas: '/matriculas',
    matriculaTransferir: '/matriculas/:id/transferir',
    responsaveis: '/responsaveis',
    responsavelNovo: '/responsaveis/novo',
    turmas: '/turmas',
    turmaNova: '/turmas/nova',
    turma: '/turmas/:id',
    turmaDisciplinaNova: '/turmas/:id/disciplinas/nova',
    turmaDisciplinas: '/turmas/:id/disciplinas',
    disciplinas: '/disciplinas',
    disciplinaNova: '/disciplinas/nova',
  }),

  professor: grupo('/professor', {
    painel: '/',
    notas: '/disciplinas/:turmaDisciplinaId/notas',
    chamada: '/turmas/:turmaId/chamada',
    fechamento: '/turmas/:turmaId/fechamento',
  }),

  responsavel: grupo('/responsavel', {
    painel: '/',
    boletim: '/matriculas/:id/boletim',
    frequencia: '/matriculas/:id/frequencia',
    mural: '/mural',
    comunicado: '/mural/:comunicadoId',
    comunicadoLido: '/mural/:comunicadoId/lido',
  }),

  comunicados: grupo('/comunicados', {
    lista: '/',
    novo: '/novo',
  }),
} as const;

export const GRUPOS_DE_ESCRITA = [
  ROTAS.conta.prefixo,
  ROTAS.rede.prefixo,
  ROTAS.secretaria.prefixo,
  ROTAS.professor.prefixo,
  ROTAS.responsavel.prefixo,
  ROTAS.comunicados.prefixo,
] as const;

export const curingaDe = (prefixo: string): string => `${prefixo}/*`;

export const PAINEL_POR_PAPEL = [
  { papel: ROLE.networkAdmin, destino: ROTAS.rede.painel() },
  { papel: ROLE.registrar, destino: ROTAS.secretaria.painel() },
  { papel: ROLE.teacher, destino: ROTAS.professor.painel() },
  { papel: ROLE.guardian, destino: ROTAS.responsavel.painel() },
] as const;

export const TEMPLATES = {
  layout: '/_layout',
  layoutPublico: '/_layout_publico',
  erro: '/erro',
  login: '/login',

  parciais: {
    icone: '/parciais/_icone',
    cabecalho: '/parciais/_cabecalho',
    navegacao: '/parciais/_navegacao',
    mensagens: '/parciais/_mensagens',
    scriptAvisos: '/parciais/_script_avisos',
    paginacao: '/parciais/_paginacao',
    vazio: '/parciais/_vazio',
  },

  conta: { senha: '/conta/senha' },

  rede: {
    painel: '/rede/painel',
    unidades: '/rede/unidades',
    unidadeNova: '/rede/unidade_nova',
    usuarios: '/rede/usuarios',
    usuarioNovo: '/rede/usuario_novo',
    anos: '/rede/anos',
    anoNovo: '/rede/ano_novo',
  },

  secretaria: {
    painel: '/secretaria/painel',
    alunos: '/secretaria/alunos',
    alunoNovo: '/secretaria/aluno_novo',
    aluno: '/secretaria/aluno',
    alunoResponsavelNovo: '/secretaria/aluno_responsavel_novo',
    alunoMatriculaNova: '/secretaria/aluno_matricula_nova',
    matriculaTransferencia: '/secretaria/matricula_transferencia',
    responsaveis: '/secretaria/responsaveis',
    responsavelNovo: '/secretaria/responsavel_novo',
    turmas: '/secretaria/turmas',
    turmaNova: '/secretaria/turma_nova',
    turma: '/secretaria/turma',
    turmaDisciplinaNova: '/secretaria/turma_disciplina_nova',
    disciplinas: '/secretaria/disciplinas',
    disciplinaNova: '/secretaria/disciplina_nova',
  },

  professor: {
    painel: '/professor/painel',
    notas: '/professor/notas',
    chamada: '/professor/chamada',
    fechamento: '/professor/fechamento',
  },

  responsavel: {
    painel: '/responsavel/painel',
    boletim: '/responsavel/boletim',
    frequencia: '/responsavel/frequencia',
    mural: '/responsavel/mural',
    comunicado: '/responsavel/comunicado',
  },

  comunicados: { lista: '/comunicados/lista', novo: '/comunicados/novo' },

  diretorio: 'templates',
} as const;

export const PARAMETROS = {
  paginaPadrao: 'p',
  paginaDeResponsaveis: 'pResponsaveis',
  paginaDeMatriculas: 'pMatriculas',
  paginaDeDisciplinas: 'pDisciplinas',
  paginaDeNaoLidos: 'pNaoLidos',
  paginaDeLidos: 'pLidos',
  busca: 'q',
  unidade: 'unidade',
  ano: 'ano',
  unidadeId: 'unidadeId',
  bimestre: 'bimestre',
  data: 'data',
  ok: 'ok',
  erro: 'erro',
} as const;

export const CAMPOS = {
  login: {
    redeSlug: IDENTITY_FIELDS.login.networkSlug,
    cpf: IDENTITY_FIELDS.login.cpf,
    senha: IDENTITY_FIELDS.login.password,
  },
  senha: {
    atual: IDENTITY_FIELDS.password.current,
    nova: IDENTITY_FIELDS.password.new,
    confirmacao: IDENTITY_FIELDS.password.confirmation,
  },
  aluno: {
    nome: ACADEMIC_FIELDS.student.name,
    dataNascimento: ACADEMIC_FIELDS.student.birthDate,
  },
  responsavel: {
    nome: ACADEMIC_FIELDS.guardian.name,
    email: ACADEMIC_FIELDS.guardian.email,
    telefone: ACADEMIC_FIELDS.guardian.phone,
    cpf: ACADEMIC_FIELDS.guardian.cpf,
  },
  vinculo: {
    alunoId: ACADEMIC_FIELDS.guardianLink.studentId,
    responsavelId: ACADEMIC_FIELDS.guardianLink.guardianId,
    parentesco: ACADEMIC_FIELDS.guardianLink.relationship,
    financeiro: ACADEMIC_FIELDS.guardianLink.financiallyResponsible,
  },
  matricula: {
    alunoId: ACADEMIC_FIELDS.enrollment.studentId,
    turmaId: ACADEMIC_FIELDS.enrollment.classGroupId,
    anoLetivoId: ACADEMIC_FIELDS.enrollment.academicYearId,
    dataMatricula: ACADEMIC_FIELDS.enrollment.enrollmentDate,
  },
  transferencia: {
    matriculaId: ACADEMIC_FIELDS.transfer.enrollmentId,
    turmaDestinoId: ACADEMIC_FIELDS.transfer.targetClassGroupId,
    data: ACADEMIC_FIELDS.transfer.date,
  },
  turma: {
    nome: ACADEMIC_FIELDS.classGroup.name,
    serie: ACADEMIC_FIELDS.classGroup.gradeLevel,
    turno: ACADEMIC_FIELDS.classGroup.shift,
    unidadeId: ACADEMIC_FIELDS.classGroup.schoolId,
    anoLetivoId: ACADEMIC_FIELDS.classGroup.academicYearId,
  },
  disciplina: { nome: ACADEMIC_FIELDS.subject.name },
  alocacao: {
    turmaId: ACADEMIC_FIELDS.teachingAssignment.classGroupId,
    disciplinaId: ACADEMIC_FIELDS.teachingAssignment.subjectId,
    professorUsuarioId: ACADEMIC_FIELDS.teachingAssignment.teacherUserId,
  },
  unidade: { nome: IDENTITY_FIELDS.school.name, codigoInep: IDENTITY_FIELDS.school.inepCode },
  usuario: {
    nome: IDENTITY_FIELDS.user.name,
    email: IDENTITY_FIELDS.user.email,
    cpf: IDENTITY_FIELDS.user.cpf,
    atribuicoes: IDENTITY_FIELDS.user.roleAssignments,
    responsavelId: IDENTITY_FIELDS.user.guardianId,
    unidades: 'unidade[]',
    papeis: 'papel[]',
  },
  anoLetivo: {
    ano: ACADEMIC_FIELDS.academicYear.year,
    dataInicio: ACADEMIC_FIELDS.academicYear.startDate,
    dataFim: ACADEMIC_FIELDS.academicYear.endDate,
  },
  comunicado: {
    titulo: COMMUNICATION_FIELDS.title,
    corpo: COMMUNICATION_FIELDS.body,
    unidadeId: COMMUNICATION_FIELDS.schoolId,
    autorUsuarioId: COMMUNICATION_FIELDS.authorUserId,
    destinatarios: COMMUNICATION_FIELDS.recipients,
    alcance: COMMUNICATION_FIELDS.audience,
    responsaveis: 'responsaveis[]',
  },
  diario: { nota: 'nota_', presenca: 'presenca_', justificativa: 'justificativa_' },
  bimestre: ASSESSMENT_FIELDS.term,
  data: ASSESSMENT_FIELDS.date,
  notas: ASSESSMENT_FIELDS.grades,
} as const;

export const MARCADO = 'sim';

export const VALORES_INICIAIS = {
  login: { redeSlug: '', cpf: '' },
  aluno: { nome: '', dataNascimento: '' },
  responsavel: { nome: '', email: '', telefone: '', cpf: '' },
  turma: { nome: '', serie: '', turno: '', unidadeId: '', anoLetivoId: '' },
  disciplina: { nome: '' },
  unidade: { nome: '', codigoInep: '' },
  usuario: { nome: '', email: '', cpf: '', responsavelId: '' },
  anoLetivo: { ano: '', dataInicio: '', dataFim: '' },
} as const;

export const TITULOS = {
  produto: 'EscolaViva',
  login: 'Entrar',
  trocarSenha: 'Trocar senha',

  rede: {
    painel: 'Painel da rede',
    unidades: 'Unidades',
    unidadeNova: 'Criar unidade',
    usuarios: 'Usuários',
    usuarioNovo: 'Convidar usuário',
    anos: 'Anos letivos',
    anoNovo: 'Definir ano letivo',
  },
  secretaria: {
    painel: 'Painel da secretaria',
    alunos: 'Alunos',
    alunoNovo: 'Cadastrar aluno',
    aluno: 'Ficha do aluno',
    vincularResponsavel: 'Vincular responsável',
    matricular: 'Matricular em uma turma',
    transferir: 'Transferir de turma',
    responsaveis: 'Responsáveis',
    responsavelNovo: 'Cadastrar responsável',
    turmas: 'Turmas',
    turmaNova: 'Cadastrar turma',
    turma: (nome: string): string => `Turma ${nome}`,
    alocar: 'Alocar disciplina e professor',
    disciplinas: 'Disciplinas',
    disciplinaNova: 'Cadastrar disciplina',
  },
  professor: {
    painel: 'Minhas turmas',
    notas: (disciplina: string, turma: string): string => `${disciplina} · ${turma}`,
    chamada: (turma: string): string => `Chamada · ${turma}`,
    fechamento: (turma: string): string => `Fechamento · ${turma}`,
  },
  responsavel: {
    painel: 'Meus alunos',
    boletim: (aluno: string): string => `Boletim de ${aluno}`,
    frequencia: (aluno: string): string => `Frequência de ${aluno}`,
    mural: 'Mural de comunicados',
  },
  comunicados: { lista: 'Comunicados', novo: 'Novo comunicado' },
} as const;

export const AREAS = {
  rede: 'Rede',
  secretaria: 'Secretaria',
  ensino: 'Ensino',
  acompanhamento: 'Acompanhamento',
  comunicacao: 'Comunicação',
  conta: 'Conta',
} as const;

export const ROTULOS = {
  aluno: 'Aluno',
  turma: 'Turma',
  unidade: 'Unidade',
  disciplina: 'Disciplina',
  responsavel: 'Responsável',
  ano: 'Ano',
  anoLetivo: 'Ano letivo',
  matricula: 'Matrícula',
  matriculasAtivas: 'Matrículas ativas',
  nome: 'Nome',
  cpf: 'CPF',
  email: 'E-mail',
  inicio: 'Início',
  termino: 'Término',
  frequencia: 'Frequência',
  destinatarios: 'Destinatários',
  acoes: 'Ações',
} as const;

export const CONTAGEM = {
  aluno: { singular: 'aluno', plural: 'alunos' },
  turma: { singular: 'turma', plural: 'turmas' },
  unidade: { singular: 'unidade', plural: 'unidades' },
  disciplina: { singular: 'disciplina', plural: 'disciplinas' },
  responsavel: { singular: 'responsável', plural: 'responsáveis' },
  matricula: { singular: 'matrícula', plural: 'matrículas' },
  comunicado: { singular: 'comunicado', plural: 'comunicados' },
  usuario: { singular: 'usuário', plural: 'usuários' },
  anoLetivo: { singular: 'ano letivo', plural: 'anos letivos' },
} as const;

export type SubstantivoContavel = { readonly singular: string; readonly plural: string };

export const ACOES = {
  cancelar: 'Cancelar',
  buscarAluno: 'Buscar aluno',
  voltarPara: {
    painel: 'Voltar ao painel',
    busca: 'Voltar à busca',
    ficha: 'Voltar à ficha',
    alunos: 'Voltar aos alunos',
    turma: 'Voltar à turma',
    turmas: 'Voltar às turmas',
    mural: 'Voltar ao mural',
    comunicados: 'Voltar aos comunicados',
  },
} as const;

export const SEM_ALUNO_MATRICULADO = 'Nenhum aluno matriculado';

export const AVISOS = {
  sessaoEncerrada: 'Sessão encerrada.',
  senhaAlterada: 'Senha alterada. Use a senha nova no próximo acesso.',
  alunoCadastrado: 'Aluno cadastrado.',
  responsavelVinculado: 'Responsável vinculado.',
  matriculaRegistrada: 'Matrícula registrada.',
  transferenciaConcluida: 'Transferência concluída.',
  responsavelCadastrado: 'Responsável cadastrado.',
  turmaCadastrada: 'Turma cadastrada.',
  disciplinaAlocada: 'Disciplina alocada.',
  disciplinaCadastrada: 'Disciplina cadastrada.',
  unidadeCriada: 'Unidade criada.',
  usuarioConvidado: 'Usuário criado. A senha provisória está logo abaixo.',
  anoDefinido: 'Ano letivo definido.',
  comunicadoPublicado: 'Comunicado publicado. A taxa de leitura começa a contar agora.',
  comunicadoLido: 'Comunicado marcado como lido.',
  leituraNaoRegistrada: 'Não foi possível registrar a leitura.',
  notasNenhuma: 'Lançamento salvo: nenhuma nota preenchida.',
  notaUma: '1 nota gravada.',
  notasVarias: (total: number): string => `${total} notas gravadas.`,
  chamadaRegistrada: (data: string): string => `Chamada de ${data} registrada.`,
  bimestreFechado: (bimestre: number, turma: string): string =>
    `${TERM_LABEL(bimestre)} fechado para a turma ${turma}.`,
} as const;

export const CODIGOS_DE_AVISO = {
  senhaAlterada: 'senha-alterada',
  unidadeCriada: 'unidade-criada',
  usuarioConvidado: 'usuario-convidado',
  anoDefinido: 'ano-definido',
} as const;

export const ANO_EM_QUATRO_DIGITOS = /^\d{4}$/;

export const ERROS_DE_FORMULARIO = {
  confirmacaoDiferente: {
    campo: CAMPOS.senha.confirmacao,
    codigo: 'confirmacao_diferente',
    mensagem: 'A confirmação não confere com a senha nova.',
  },
  anoInvalido: {
    campo: CAMPOS.anoLetivo.ano,
    codigo: 'ano_invalido',
    mensagem: 'Informe o ano com quatro dígitos.',
  },
  atribuicaoIncompleta: {
    campo: CAMPOS.usuario.atribuicoes,
    codigo: 'atribuicao_incompleta',
    mensagem: 'Cada atribuição precisa de uma unidade e de um papel.',
  },
  notaInvalida: {
    campo: CAMPOS.notas,
    codigo: 'nota_invalida',
  },
  semSelecao: {
    campo: CAMPOS.comunicado.destinatarios,
    codigo: 'sem_selecao',
  },
  destinatarioForaDaUnidade: {
    campo: CAMPOS.comunicado.destinatarios,
    codigo: 'destinatario_fora_da_unidade',
    mensagem: 'Um dos responsáveis marcados não pertence à unidade escolhida.',
  },
  unidadeAusente: {
    campo: CAMPOS.comunicado.unidadeId,
    codigo: 'unidade_ausente',
    mensagem: 'Escolha a unidade que vai enviar o comunicado.',
  },
} as const;

export const NOTA_FORA_DA_FAIXA = (minimo: number, maximo: number): string =>
  `Use um número de ${minimo} a ${maximo}.`;

export const RESUMO_DE_NOTA_FORA_DA_FAIXA = (minimo: number, maximo: number): string =>
  `Confira os campos destacados: há nota fora do intervalo de ${minimo} a ${maximo}.`;

export const SEM_SELECAO_NO_ENVIO =
  'Marque ao menos um responsável ou escolha enviar para toda a unidade.';

export const DETALHES_DE_ERRO = {
  400: 'O formulário chegou incompleto ou com um campo que o sistema não reconhece. Volte, confira os dados e envie de novo.',
  401: 'A sessão terminou ou ainda não foi aberta. Entre novamente para continuar de onde parou.',
  403: 'Sua conta não tem permissão para esta tela. Se você deveria ter, peça ao administrador da rede.',
  404: 'O endereço não existe, ou o registro pertence a outra rede. Use o menu para voltar a uma tela conhecida.',
  422: 'Os dados estão consistentes, mas a situação atual não permite concluir esta operação.',
  500: 'Algo falhou do nosso lado. A ocorrência foi registrada com o código abaixo.',
} as const;

export const PAGINAS_DE_ERRO = {
  contaSemPapel: {
    titulo: 'Conta sem papel atribuído',
    detalhe:
      'Seu acesso existe, mas ainda não foi ligado a nenhuma unidade. Peça ao administrador da rede para atribuir um papel.',
  },
  assetNomeInvalido: {
    titulo: 'Arquivo não encontrado',
    detalhe: 'Este endereço não corresponde a nenhum arquivo publicado.',
  },
  assetInexistente: {
    titulo: 'Arquivo não encontrado',
    detalhe: 'O arquivo pedido não faz parte desta versão do sistema.',
  },
  registroForaDoAlcance: {
    titulo: 'Registro não encontrado',
    detalhe:
      'O endereço não existe, ou o registro pertence a outra unidade. Use o menu para voltar a uma tela conhecida.',
  },
} as const;

export const ERRO_INESPERADO_EM_TEXTO = 'Erro inesperado';

export const DIAGNOSTICOS = {
  bimestreNoLancamento: 'bimestre fora do conjunto no lançamento',
  bimestreNoFechamento: 'bimestre fora do conjunto no fechamento',
  dataDeChamadaMalformada: 'data de chamada malformada',
  disciplinaForaDoQuadro: 'disciplina fora do quadro do professor',
  turmaForaDoQuadro: 'turma fora do quadro do professor',
  contaSemResponsavel: 'conta sem responsável vinculado',
  matriculaForaDaResponsabilidade: 'matrícula fora da responsabilidade',
  matriculaSemBoletim: 'matrícula sem boletim',
  matriculaSemFrequencia: 'matrícula sem apuração de frequência',
  comunicadoForaDoMural: 'comunicado fora do mural do responsável',
  unidadeForaDoAlcance: 'unidade fora do alcance do usuário',
} as const;

export const EVENTOS_DE_LOG = {
  tentativaDeEntrada: 'tentativa de entrada',
  recusado: 'recusado',
  sucesso: 'sucesso',
  senhaAlterada: 'senha alterada pelo próprio usuário',
  unidadeCriada: 'unidade criada',
  usuarioConvidado: 'usuário convidado',
  anoLetivoDefinido: 'ano letivo definido',
} as const;

export const APRESENTACAO = {
  sufixoDoTitulo: ' · EscolaViva',
  marca: 'Escola<em>Viva</em>',
  subtituloPublico: 'Portal da rede escolar',
  rodapePublico: 'Sistema de uso restrito. O acesso é registrado.',
  separador: ' · ',
  separadorDeTurno: ' · turno ',
  sufixoDePercentual: ' %',
  separadorDecimal: ',',
  fatorDeUmaCasa: 10,
  fatorPercentual: 100,
  limiteDaMensagem: 160,
  opcaoVazia: 'Selecione…',
  colunaDeDoisDigitos: 2,
  preenchimentoDeDigito: '0',
} as const;

const ETIQUETA = {
  ativa: 'etiqueta--ativa',
  transferida: 'etiqueta--transferida',
  cancelada: 'etiqueta--cancelada',
  concluida: 'etiqueta--concluida',
  aprovado: 'etiqueta--aprovado',
  reprovado: 'etiqueta--reprovado',
  emCurso: 'etiqueta--em-curso',
  semModificador: '',
} as const;

export const CLASSE_DA_ETIQUETA = {
  situacaoDeMatricula: {
    active: ETIQUETA.ativa,
    transferred: ETIQUETA.transferida,
    cancelled: ETIQUETA.cancelada,
    completed: ETIQUETA.concluida,
  },
  matriculaDoResponsavel: {
    active: ETIQUETA.ativa,
    transferred: ETIQUETA.transferida,
    cancelled: ETIQUETA.semModificador,
    completed: ETIQUETA.semModificador,
  },
  situacaoFinal: {
    passed: ETIQUETA.aprovado,
    failed: ETIQUETA.reprovado,
    in_progress: ETIQUETA.emCurso,
  },
  presenca: {
    presente: ETIQUETA.ativa,
    faltaJustificada: ETIQUETA.transferida,
    falta: ETIQUETA.reprovado,
  },
  fechamento: { fechado: ETIQUETA.aprovado, aberto: ETIQUETA.emCurso },
} as const;

export const SUFIXOS_DE_ID = { ajuda: '-ajuda', erro: '-erro' } as const;

export const PREFIXOS_DE_ID = { erroDeCelula: 'erro-', pendencia: 'pendencia-' } as const;

export const PAGINACAO = {
  janela: 7,
} as const;

export const LINHAS_DE_ATRIBUICAO = 3;

export const NOME_DE_ASSET = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,127})$/;

export const TIPOS_DE_ASSET: Record<string, string> = {
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
};

export const TIPO_DE_ASSET_PADRAO = 'application/octet-stream';

export const SEM_CACHE_NA_SAUDE = 'no-store';

export const CORPO_DE_SAUDE = {
  ok: { status: 'ok', banco: 'ok' },
  degradado: { status: 'degradado', banco: 'indisponivel' },
  vivo: { status: 'ok' },
} as const;

export const COOKIE_DO_CONVITE = {
  nome: 'ev_convite',
  validadeEmSegundos: 120,
  separador: ':',
  sameSite: 'Lax',
} as const;

export const DOCUMENTO = {
  idioma: 'pt-BR',
  esquemaDeCor: 'light',
  robots: 'noindex, nofollow',
  idDoConteudo: 'conteudo',
} as const;
