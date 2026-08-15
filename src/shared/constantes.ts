export const TEMPO = {
  msPorSegundo: 1000,
  segundosPorMinuto: 60,
  segundosPorHora: 3600,
  msPorHora: 3_600_000,
  msPorDia: 86_400_000,
} as const;

export const MINUTO_MS = TEMPO.segundosPorMinuto * TEMPO.msPorSegundo;

export const DIAS_DA_SEMANA = {
  sabadoJs: 6,
  primeiroDiaDoFimDeSemanaIso: 6,
} as const;

export const SERVIDOR = {
  ociosidadeMaximaSegundos: 255,
  margemDeDrenagemMs: 5000,
  sinaisDeDesligamento: ['SIGTERM', 'SIGINT'],
} as const;

export const AMBIENTES = ['development', 'test', 'production'] as const;
export const NIVEIS_DE_LOG = ['debug', 'info', 'warn', 'error'] as const;

export const AMBIENTE_PRODUCAO = 'production';
export const AMBIENTE_DESENVOLVIMENTO = 'development';

export const BOOLEANOS_DE_AMBIENTE = ['true', 'false'] as const;
export const VERDADEIRO_DE_AMBIENTE = 'true';

export const PADROES_DE_CONFIG = {
  ambiente: AMBIENTE_DESENVOLVIMENTO,
  porta: 3000,
  sessaoDuracaoHoras: 12,
  httpTimeoutMs: 25000,
  logLevel: 'info',
} as const;

export const TAMANHO_MINIMO_DO_SEGREDO = 32;

export const SEPARADOR_DE_LISTA_DE_AMBIENTE = ',';

export const MENSAGENS_DE_CONFIG = {
  booleanoInvalido: 'use true ou false',
  ambienteInvalido: `use ${AMBIENTES.join(', ').replace(/, ([^,]*)$/, ' ou $1')}`,
  portaInvalida: 'precisa ser um número inteiro de porta',
  databaseUrlAusente: 'obrigatória — conexão do PostgreSQL primário',
  sessionSecretAusente: 'obrigatória — segredo que assina o cookie de sessão',
  sessionSecretCurto: `precisa de no mínimo ${TAMANHO_MINIMO_DO_SEGREDO} caracteres`,
  duracaoInvalida: 'precisa ser um número de horas',
  timeoutInvalido: 'precisa ser um número de milissegundos',
  logLevelInvalido: `use ${NIVEIS_DE_LOG.join(', ').replace(/, ([^,]*)$/, ' ou $1')}`,
  rotuloDaRaiz: 'ambiente',
  cabecalhoDoRelatorio: 'Configuração de ambiente inválida — o processo não sobe (I18).',
  rodapeDoRelatorio: 'Consulte .env.example.',
} as const;

export const BANCO = {
  maxConexoes: 10,
  tempoOciosoSegundos: 30,
  tempoDeConexaoSegundos: 10,
} as const;

export const CHAVES_DE_LOCK = {
  expurgoDeSessoes: 1001,
  migracao: 4242,
} as const;

export const TAMANHO_PADRAO = 10;

export const CABECALHOS = {
  cacheControl: 'Cache-Control',
  vary: 'Vary',
  cookie: 'Cookie',
  location: 'Location',
  correlacao: 'X-Correlation-Id',
  encaminhado: 'X-Forwarded-For',
} as const;

export const METODOS = { get: 'GET', post: 'POST' } as const;

export const CACHE = {
  asset: 'public, max-age=31536000, immutable',
  autenticado: 'private, no-store',
  anonimo: 'no-store',
} as const;

export const SEPARADOR_DE_ENCAMINHAMENTO = ',';

export const FORMATOS = {
  chaveDeIdempotencia: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  identificador: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  correlacao: /^[A-Za-z0-9._:-]{8,128}$/,
  dataIso: /^\d{4}-\d{2}-\d{2}$/,
} as const;

export const TAMANHO_DA_DATA_ISO = 10;

export const ENTIDADES_HTML = {
  ecomercial: '&amp;',
  menorQue: '&lt;',
  maiorQue: '&gt;',
  aspasDuplas: '&quot;',
} as const;

export const CAMPO_CHAVE = '_chave';

export const VARIAVEIS_DE_CONTEXTO = {
  usuario: 'usuario',
  sessaoId: 'sessaoId',
  corpo: 'corpo',
  correlacaoId: 'correlacaoId',
} as const;

export const COOKIE = {
  sessao: 'ev_sessao',
  caminho: '/',
  sameSite: 'Lax',
} as const;

export const HASH_DE_RESPOSTA = { algoritmo: 'sha256', codificacao: 'hex' } as const;

export const MOTIVOS_INTERNOS = {
  requisicaoSemSessao: 'requisição sem sessão',
  redeIndisponivelSemSessao: 'rede indisponível sem sessão',
  acessoNegadoPorPapel: 'acesso negado por papel',
  escritaSemChave: 'escrita sem chave de idempotência',
} as const;

export const ATIVOS = {
  diretorio: 'publico',
  prefixoDeUrl: '/publico/',
  nomeLogicoDaFolha: 'app.css',
  manifesto: 'manifest.json',
  caracteresDeHash: 8,
  algoritmoDeHash: 'sha256',
  codificacaoDeHash: 'hex',
} as const;

export const MIGRACOES = { diretorio: 'migrations', glob: '*.sql' } as const;

export const LOG = {
  campoDeCorrelacao: 'correlacao_id',
  valorRedigido: '[redigido]',
  profundidadeMaxima: 6,
} as const;

export const CHAVES_PROIBIDAS: readonly string[] = [
  'nome',
  'nome_completo',
  'aluno_nome',
  'email',
  'senha',
  'senha_hash',
  'senha_provisoria',
  'cpf',
  'telefone',
  'valor',
  'nota',
  'notas',
  'justificativa',
  'titulo',
  'corpo',
  'data_nascimento',
  'authorization',
  'cookie',
  'set-cookie',
  'session_secret',
  'database_url',
];

export const EVENTOS_DE_LOG_HTTP = {
  falhaAoAtender: 'falha ao atender requisição',
  requisicaoRecusada: 'requisição recusada',
} as const;

export const MENSAGENS_DE_PROCESSO = {
  noAr: 'escolaviva no ar',
  desligamentoIniciado: 'desligamento iniciado',
  desligamentoConcluido: 'desligamento concluído',
  drenagemEsgotada: 'prazo de drenagem esgotado: encerrando conexões em curso',
  jobIgnorado: 'job ignorado: lock em outra instancia',
  jobFalhou: 'job falhou',
} as const;

export const AUSENTE = '—';

export const TAMANHO_DO_CPF_COM_MASCARA = 14;

export const CAMINHOS_DE_ENTRADA = { login: '/login', painel: '/painel' } as const;

export const TITULOS_DE_ERRO = {
  400: 'Requisição inválida',
  401: 'Entre para continuar',
  403: 'Acesso não permitido',
  404: 'Página não encontrada',
  422: 'Não foi possível concluir',
  500: 'Erro inesperado',
} as const;

export const CAMINHOS_DE_SAUDE = { prontidao: '/health', vivacidade: '/health/live' } as const;

export const PRAZO_DA_SONDA_MS = 2000;

export const LOCALE = 'pt-BR';
