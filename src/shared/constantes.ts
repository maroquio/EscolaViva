/**
 * As constantes de INFRAESTRUTURA — o que o processo precisa saber sobre tempo, protocolo,
 * conexão e arquivos publicados, e nada sobre escola.
 *
 * A fronteira deste arquivo é a mesma regra `shared-nao-conhece-dominio` do `.dependency-cruiser`:
 * nenhum limite de nome de aluno, nenhuma mensagem de formulário e nenhum código de erro de
 * negócio entram aqui. Se um valor só faz sentido depois de explicar o que é uma matrícula, ele
 * pertence ao `constantes.ts` do módulo dono, não a este.
 *
 * Este arquivo NÃO IMPORTA NADA, de propósito. Ele é a folha do grafo, e é o que permite que
 * `dominio/` o alcance sem violar `dominio-puro` — a regra barra `shared/db`, `shared/http`,
 * `shared/log` e `shared/jobs`, e continua barrando depois desta adição.
 */

/* --- Tempo ----------------------------------------------------------------- */

/**
 * Conversores de calendário, não políticas. Cada um existia solto em um arquivo diferente —
 * `3_600_000` em `identidade/dominio/sessao.ts`, `3600` em `shared/http/sessao.ts`, `86_400_000`
 * em `web/rotas/professor.ts` e de novo em `scripts/seed.ts` — e a única coisa que os ligava era
 * o leitor lembrar quantos zeros tinha cada um.
 */
export const TEMPO = {
  msPorSegundo: 1000,
  segundosPorMinuto: 60,
  segundosPorHora: 3600,
  msPorHora: 3_600_000,
  msPorDia: 86_400_000,
} as const;

/** Um minuto em milissegundos — a unidade em que o agendador declara os intervalos dos jobs. */
export const MINUTO_MS = TEMPO.segundosPorMinuto * TEMPO.msPorSegundo;

/**
 * Os dois números do fim de semana. Coincidem em valor e NÃO são a mesma constante: `Date#getUTCDay`
 * numera 0=domingo…6=sábado, e o `isodow` do PostgreSQL numera 1=segunda…7=domingo. Fundi-los
 * trocaria sábado por domingo em um dos dois lados, e o defeito apareceria como "a carga tem 20 %
 * mais dias letivos do que deveria" — longe da linha que o causou.
 */
export const DIAS_DA_SEMANA = {
  /** Índice do sábado em `Date#getUTCDay`. */
  sabadoJs: 6,
  /** Primeiro dia do fim de semana em `extract(isodow ...)` do PostgreSQL. */
  primeiroDiaDoFimDeSemanaIso: 6,
} as const;

/* --- Servidor e desligamento ------------------------------------------------ */

export const SERVIDOR = {
  /** Teto do `idleTimeout` do `Bun.serve`, em segundos — limite do runtime, não do produto. */
  ociosidadeMaximaSegundos: 255,
  /** Folga sobre o prazo HTTP antes de cortar conexões que não terminaram (I13). */
  margemDeDrenagemMs: 5000,
  sinaisDeDesligamento: ['SIGTERM', 'SIGINT'],
} as const;

/* --- Configuração de ambiente ----------------------------------------------- */

/**
 * Os conjuntos aceitos pelo `schema.ts` e os valores assumidos quando a variável não vem.
 *
 * As mensagens são derivadas das listas, e não redigitadas: hoje `'use development, test ou
 * production'` é escrito à mão logo abaixo da lista que enumera exatamente isso, e acrescentar um
 * ambiente deixaria a frase mentindo sem quebrar nada.
 */
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

/** Piso criptográfico do segredo que assina o cookie — não é limite de campo de formulário. */
export const TAMANHO_MINIMO_DO_SEGREDO = 32;

/** Separador da lista `PROXIES_CONFIAVEIS` lida do ambiente. */
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
  /** Rótulo do problema que não tem caminho de variável — ele está na raiz do schema. */
  rotuloDaRaiz: 'ambiente',
  cabecalhoDoRelatorio: 'Configuração de ambiente inválida — o processo não sobe (I18).',
  rodapeDoRelatorio: 'Consulte .env.example.',
} as const;

/* --- Banco ------------------------------------------------------------------ */

/**
 * `maxConexoes` e `tempoDeConexaoSegundos` valem 10 os dois, e o `TAMANHO_PADRAO` da paginação,
 * logo abaixo, também. São três decisões sem relação: uma é tamanho de pool, outra é prazo em
 * segundos, a terceira é quantas linhas cabem na tela. Uma constante só para as três seria um
 * valor que ninguém consegue mudar sem quebrar duas coisas que não estava olhando — por isso as
 * três estão neste arquivo, vizinhas e separadas, e não fundidas.
 */
export const BANCO = {
  maxConexoes: 10,
  /** As opções de tempo do `Bun.sql` são em SEGUNDOS, não em milissegundos. */
  tempoOciosoSegundos: 30,
  tempoDeConexaoSegundos: 10,
} as const;

/**
 * O espaço numérico dos advisory locks do PostgreSQL é global ao banco: dois jobs com a mesma
 * chave se excluem em silêncio, e o segundo simplesmente nunca roda. Estarem lado a lado é a
 * única forma de alguém reparar antes de repetir um número.
 */
export const CHAVES_DE_LOCK = {
  expurgoDeSessoes: 1001,
  migracao: 4242,
} as const;

/* --- Paginação --------------------------------------------------------------- */

/**
 * Dez linhas: a tabela inteira cabe na tela sem rolagem interna e a contagem segue legível.
 *
 * É o padrão de todo `tamanho` opcional do sistema — o `shared/paginacao` o reexporta e é de lá
 * que o `aplicacao/consultas.ts` de cada módulo o importa. Recorte de lista é infraestrutura: o
 * número não depende de saber o que é uma matrícula, e por isso cabe neste arquivo.
 */
export const TAMANHO_PADRAO = 10;

/* --- HTTP: cabeçalhos, métodos e cache -------------------------------------- */

export const CABECALHOS = {
  cacheControl: 'Cache-Control',
  vary: 'Vary',
  cookie: 'Cookie',
  location: 'Location',
  correlacao: 'X-Correlation-Id',
  encaminhado: 'X-Forwarded-For',
} as const;

export const METODOS = { get: 'GET', post: 'POST' } as const;

/**
 * `anonimo` e o `no-store` de `/health` têm o mesmo valor e são políticas diferentes: uma governa
 * página sem sessão, a outra governa sonda de saúde. Quando a página anônima passar a poder ser
 * cacheada — e ela pode —, só uma das duas muda.
 */
export const CACHE = {
  asset: 'public, max-age=31536000, immutable',
  autenticado: 'private, no-store',
  anonimo: 'no-store',
} as const;

/** Separador da cadeia de `X-Forwarded-For`, definido pelo protocolo (I12). */
export const SEPARADOR_DE_ENCAMINHAMENTO = ',';

/* --- HTTP: formatos e variáveis de contexto --------------------------------- */

/**
 * `chaveDeIdempotencia` e `identificador` são a mesma expressão e conceitos distintos: uma valida
 * a chave de uma REQUISIÇÃO (I4), a outra o id de um RECURSO que vem na URL. O dia em que a chave
 * de idempotência deixar de ser UUID — um ULID ordenável, por exemplo — só uma das duas muda.
 */
export const FORMATOS = {
  chaveDeIdempotencia: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  identificador: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /** O id de correlação volta no cabeçalho da resposta: curto e imprimível. */
  correlacao: /^[A-Za-z0-9._:-]{8,128}$/,
  /** Data no formato canônico `AAAA-MM-DD`. */
  dataIso: /^\d{4}-\d{2}-\d{2}$/,
} as const;

/** Comprimento de uma data ISO `AAAA-MM-DD` — o recorte que tira o dia de um instante. */
export const TAMANHO_DA_DATA_ISO = 10;

/**
 * As quatro entidades do escape mínimo de HTML — gramática do formato, não decisão de produto, e
 * por isso infraestrutura como o resto deste arquivo.
 *
 * Nomeadas porque o par `padrão → entidade` é trocável sem ninguém notar: `/</g` casado com
 * `&gt;` produz uma página perfeitamente válida com o conteúdo errado dentro.
 */
export const ENTIDADES_HTML = {
  ecomercial: '&amp;',
  menorQue: '&lt;',
  maiorQue: '&gt;',
  aspasDuplas: '&quot;',
} as const;

/** Nome do campo oculto que carrega a chave de idempotência (I4) — casado com 13 `.eta`. */
export const CAMPO_CHAVE = '_chave';

/** Nomes das variáveis do contexto Hono. Precisam casar com as chaves do tipo `Variaveis`. */
export const VARIAVEIS_DE_CONTEXTO = {
  usuario: 'usuario',
  sessaoId: 'sessaoId',
  corpo: 'corpo',
  correlacaoId: 'correlacaoId',
} as const;

export const COOKIE = {
  sessao: 'ev_sessao',
  /** Escopo do cookie de sessão. Abrir e apagar precisam do MESMO caminho, ou ele não sai. */
  caminho: '/',
  sameSite: 'Lax',
} as const;

/** Algoritmo e codificação da impressão gravada na tabela de idempotência. */
export const HASH_DE_RESPOSTA = { algoritmo: 'sha256', codificacao: 'hex' } as const;

export const MOTIVOS_INTERNOS = {
  /** Registrado no 401 por ausência de sessão — o mesmo texto em `autorizacao.ts` e `sessao.ts`. */
  requisicaoSemSessao: 'requisição sem sessão',
  /** Outro ponto de falha: pedir a rede corrente sem sessão. Não é o de cima. */
  redeIndisponivelSemSessao: 'rede indisponível sem sessão',
  acessoNegadoPorPapel: 'acesso negado por papel',
  escritaSemChave: 'escrita sem chave de idempotência',
} as const;

/* --- Arquivos publicados (I10) ---------------------------------------------- */

/**
 * O nome lógico `app.css` é a chave do manifesto e o argumento que os dois layouts passam para
 * `it.asset()`. Trocá-lo no build sem trocá-lo nos `.eta` serve uma folha que não existe — e a
 * página sobe sem estilo nenhum, sem erro em lugar algum.
 */
export const ATIVOS = {
  diretorio: 'publico',
  prefixoDeUrl: '/publico/',
  nomeLogicoDaFolha: 'app.css',
  manifesto: 'manifest.json',
  caracteresDeHash: 8,
  algoritmoDeHash: 'sha256',
  codificacaoDeHash: 'hex',
} as const;

/** Diretório dos arquivos `.sql` de migração, e o que conta como um deles. */
export const MIGRACOES = { diretorio: 'migrations', glob: '*.sql' } as const;

/* --- Log --------------------------------------------------------------------- */

export const LOG = {
  /** Nome do campo de correlação em toda linha de log — irmão, e não igual, do cabeçalho HTTP. */
  campoDeCorrelacao: 'correlacao_id',
  valorRedigido: '[redigido]',
  profundidadeMaxima: 6,
} as const;

/**
 * I17: o log carrega identificador, nunca conteúdo. Aluno é menor de idade — nome, nascimento,
 * nota e contato do responsável não podem existir em linha de log, e segredo nenhum tampouco.
 */
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

/**
 * As duas linhas de log do middleware de erros. Ficam junto de `MENSAGENS_DE_PROCESSO` porque são
 * a mesma coisa que elas — rótulo de evento de infraestrutura —, e o sufixo `_HTTP` as distingue
 * dos `EVENTOS_DE_LOG` de `identidade` e de `web`, que nomeiam eventos de negócio e continuam
 * cada um no `constantes.ts` do seu módulo.
 */
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

/* --- Apresentação compartilhada --------------------------------------------- */

/**
 * O travessão de valor ausente. Mora aqui, e não em `web/`, porque `shared/documento/cpf.ts`
 * precisa dele e `shared/` não pode olhar para cima — é a mesma decisão de `formatarData` e
 * `formatarNota`, e não pode divergir entre um CPF em branco e uma nota em branco na mesma tabela.
 */
export const AUSENTE = '—';

/** Máscara do CPF digitado: 11 dígitos, dois pontos e um traço. */
export const TAMANHO_DO_CPF_COM_MASCARA = 14;

/**
 * Os dois caminhos que `shared/http` precisa conhecer: para onde o visitante anônimo é mandado, e
 * o destino de reserva quando a escrita idempotente ainda está em curso.
 *
 * Ficam aqui e não em `web/constantes.ts` por causa da direção da dependência — `shared/` é
 * infraestrutura e não enxerga a camada web. `ROTAS.publicas` é montado A PARTIR destes dois, de
 * modo que continuam existindo uma vez só, mesmo morando na camada de baixo.
 */
export const CAMINHOS_DE_ENTRADA = { login: '/login', painel: '/painel' } as const;

/**
 * O título de cada página de erro, por status.
 *
 * Mora aqui pela MESMA razão de `CAMINHOS_DE_ENTRADA`, e não porque título de tela seja assunto de
 * infraestrutura: `shared/http/erros.ts` monta a página de reserva — o documento mínimo que
 * responde enquanto ninguém injetou o motor de template — e precisa dos títulos sem poder enxergar
 * a camada web. Declarar embaixo e reexportar em cima é o que mantém os seis textos existindo uma
 * vez só; a alternativa é a cópia byte a byte que já existiu nos dois lados, com o risco de alguém
 * corrigir a redação de um 403 e não do outro.
 *
 * Aqui ficam só os TÍTULOS. `DETALHES_DE_ERRO` continua em `web/constantes.ts` porque a página de
 * reserva não tem parágrafo de detalhe — ela mostra título e código de correlação, e nada mais.
 */
export const TITULOS_DE_ERRO = {
  400: 'Requisição inválida',
  401: 'Entre para continuar',
  403: 'Acesso não permitido',
  404: 'Página não encontrada',
  422: 'Não foi possível concluir',
  500: 'Erro inesperado',
} as const;

/** Sonda de saúde (I13). Registrada em `web/health.ts`, conhecida aqui por ser infraestrutura. */
export const CAMINHOS_DE_SAUDE = { prontidao: '/health', vivacidade: '/health/live' } as const;

/** Prazo do `SELECT 1` do `/health`: banco fora do ar responde 503 rápido, sem pendurar a rota. */
export const PRAZO_DA_SONDA_MS = 2000;

/** Locale do português usado em ordenação e em formatação de número no terminal. */
export const LOCALE = 'pt-BR';
