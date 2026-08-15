/**
 * As constantes da camada web: para onde se vai, o que se renderiza e o que a tela diz.
 *
 * `ROTAS` e `TEMPLATES` são mapas SEPARADOS, e é a separação que importa. Hoje eles colidem por
 * coincidência — `conta.ts` tem `TEMPLATE = '/conta/senha'` e `ROTA = '/conta/senha'`, duas
 * constantes com o mesmo valor logo abaixo uma da outra; `rede.ts` tem `TEMPLATE_UNIDADES` e
 * `ROTA_UNIDADES`, também idênticas. Mas `rede.ts` também tem `TEMPLATE_ANOS = '/rede/anos'` ao
 * lado de `ROTA_ANOS = '/rede/anos-letivos'`, e essas duas já divergem. Um caminho de URL e um
 * caminho de arquivo são coisas diferentes que às vezes se escrevem igual: renomear o arquivo do
 * template não pode mudar o endereço que o usuário tem no favorito, e mudar o endereço não pode
 * exigir renomear arquivo. Fundi-los amarraria as duas decisões para sempre.
 *
 * `ROTAS` é montado com `grupo()` (`rotas/mapa.ts`), que devolve `.prefixo` para a montagem,
 * `.padrao` para o registro no router e a chamada para o endereço absoluto — as três leituras de
 * uma decisão só. Os `:params` são conferidos pelo compilador.
 */

import { CAMPOS_DO_ACADEMICO } from '../academico';
import { CAMPOS_DA_AVALIACAO, ROTULO_DE_BIMESTRE } from '../avaliacao';
import { CAMPOS_DA_COMUNICACAO } from '../comunicacao';
import { CAMPOS_DE_IDENTIDADE, PAPEL } from '../identidade';
import { ATIVOS, AUSENTE, CAMINHOS_DE_ENTRADA, CAMINHOS_DE_SAUDE } from '../shared/constantes';
import { grupo } from './rotas/mapa';

/**
 * Reexportados, e não redeclarados: os três são decididos uma vez do lado de baixo da fronteira,
 * porque `shared/` precisa deles e não enxerga a camada web — `documento/cpf.ts` imprime `AUSENTE`,
 * `http/cacheControl.ts` reconhece o asset pelo prefixo de `ATIVOS` e `http/erros.ts` monta a
 * página de reserva com `TITULOS_DE_ERRO`. Passar por aqui dá à camada web um lugar só de onde
 * importar, sem abrir um segundo lugar onde o valor possa mudar.
 */
export { ATIVOS, AUSENTE, TITULOS_DE_ERRO } from '../shared/constantes';

/* --- Rotas ------------------------------------------------------------------ */

/**
 * Prefixo de URL dos arquivos publicados (I10) e o curinga que casa qualquer nome abaixo dele.
 *
 * O prefixo é de `shared/constantes.ts` porque `shared/http/cacheControl.ts` decide por ele a
 * política de cache do asset, e `shared/` não enxerga a camada web. Aqui ele aparece duas vezes —
 * no padrão que o router registra (`ROTAS.publicas.publico`) e no recorte que `app.ts` faz do
 * caminho para achar o nome do arquivo —, e as duas leituras saem da mesma decisão.
 */
export const PREFIXO_PUBLICO = ATIVOS.prefixoDeUrl;

/** O que os dois layouts trocam pelo nome versionado ao montar o `href` da folha de estilo. */
export const CURINGA_DE_ASSET = '*';

/**
 * As entradas do sistema, montadas na raiz. `login` e `painel` vêm de `shared/constantes.ts`
 * porque `shared/http` também precisa deles — o middleware que recusa anônimo redireciona para o
 * login, e o de idempotência usa o painel como destino de reserva — e `shared/` não enxerga a
 * camada web. Continuam existindo uma vez só; o que muda é de que lado da fronteira são
 * declarados.
 */
export const ROTAS = {
  publicas: grupo('', {
    raiz: '/',
    login: CAMINHOS_DE_ENTRADA.login,
    logout: '/logout',
    painel: CAMINHOS_DE_ENTRADA.painel,
    saude: CAMINHOS_DE_SAUDE.prontidao,
    saudeViva: CAMINHOS_DE_SAUDE.vivacidade,
    /** Curinga do servidor de arquivos publicados (I10), montado a partir do prefixo de `shared`. */
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
    /** O endereço fala em "anos-letivos"; o template correspondente se chama "anos". */
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

/**
 * Os prefixos que recebem `middlewareIdempotencia` (I4) — os grupos cujos formulários carregam
 * `_chave`. `publicas` fica de fora porque `/logout` não tem registro a proteger; `/login` é
 * inscrito à parte, em `rotas/index.ts`, por ser POST anônimo.
 */
export const GRUPOS_DE_ESCRITA = [
  ROTAS.conta.prefixo,
  ROTAS.rede.prefixo,
  ROTAS.secretaria.prefixo,
  ROTAS.professor.prefixo,
  ROTAS.responsavel.prefixo,
  ROTAS.comunicados.prefixo,
] as const;

/** O padrão curinga que estende um prefixo de grupo a todas as suas sub-rotas. */
export const curingaDe = (prefixo: string): string => `${prefixo}/*`;

/**
 * Ordem de precedência do painel: uma pessoa pode acumular papéis — a secretária que também é mãe
 * de aluno —, e a tela inicial é a do papel de maior alcance na rede.
 *
 * O que esta tabela decide é a ORDEM, e só ela. Os quatro nomes vêm de `PAPEL` (`identidade`), pelo
 * mesmo motivo que `CAMPOS` aponta para o `CAMPOS` de cada módulo em vez de redigitá-lo: escritos à
 * mão aqui, um `'secretria'` compilaria — `find` simplesmente não acharia o papel, e quem tem só
 * esse papel cairia na página "conta sem papel atribuído" com o acesso inteiro em ordem. Com
 * `PAPEL.secretaria` o erro de digitação não passa do `tsc`.
 */
export const PAINEL_POR_PAPEL = [
  { papel: PAPEL.adminRede, destino: ROTAS.rede.painel() },
  { papel: PAPEL.secretaria, destino: ROTAS.secretaria.painel() },
  { papel: PAPEL.professor, destino: ROTAS.professor.painel() },
  { papel: PAPEL.responsavel, destino: ROTAS.responsavel.painel() },
] as const;

/* --- Templates -------------------------------------------------------------- */

/** Caminhos de ARQUIVO dentro de `src/web/templates`, sem extensão. Não são endereços de URL. */
export const TEMPLATES = {
  layout: '/_layout',
  layoutPublico: '/_layout_publico',
  erro: '/erro',
  login: '/login',

  /**
   * Os sete parciais. Nenhum é incluído por caminho escrito à mão: o template recebe este objeto
   * inteiro como `it.parciais` e escreve `include(it.parciais.vazio, …)`.
   *
   * Quem injeta é `render.ts`, junto com `it.rotas`, e não o handler. `paginacao` e `vazio` chegam
   * pelo `PARCIAIS` que cada arquivo de rota espalha no contexto, o que funciona porque é a PÁGINA
   * que os inclui — mas `icone`, `cabecalho`, `navegacao`, `mensagens` e `scriptAvisos` são
   * incluídos pelos LAYOUTS, e layout não é escolhido por rota nenhuma: `render.ts` decide entre
   * `_layout` e `_layout_publico` olhando a sessão, e a página de erro de `shared/http` nem passa
   * por handler. Pedir a cada rota que se lembre de passar o que o layout usa daria certo até a
   * primeira que esquecesse, e o sintoma seria a moldura sumindo da tela.
   */
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

  /** Diretório raiz dos templates, relativo a `src/web`. */
  diretorio: 'templates',
} as const;

/* --- Parâmetros de query ---------------------------------------------------- */

/**
 * Cada tabela tem seu próprio parâmetro de página: a ficha do aluno mostra responsáveis e
 * matrículas lado a lado, e um `?p=2` só saberia dizer qual das duas avançou.
 */
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
  /** As mensagens do POST-Redirect-GET. */
  ok: 'ok',
  erro: 'erro',
} as const;

/* --- Nomes de campo de formulário ------------------------------------------- */

/**
 * O `name=` do HTML precisa casar com a leitura do corpo na rota e com `erroDe()` no template. Os
 * três estão em arquivos diferentes e nenhum compilador liga um ao outro: errar um faz o campo
 * chegar vazio ao servidor, que recusa por obrigatório o que a pessoa acabou de preencher.
 *
 * É UM contrato só, e o dono dele é o módulo que emite a falha: `vincularResponsavel.ts` devolve
 * `falhaDeCampo(CAMPOS.vinculo.responsavelId, …)` e é `erroDe('responsavelId')` no `.eta` que
 * decide embaixo de qual caixa o texto aparece. Enquanto este arquivo REDECLARAVA os mesmos nomes,
 * as duas pontas podiam divergir sem que compilador ou teste dissessem uma palavra — o formulário
 * recusava e a explicação sumia da tela.
 *
 * Por isso cada grupo abaixo APONTA para o `CAMPOS` do módulo dono, atravessando pelo `index.ts`
 * como manda `sem-atalho-entre-modulos`. O que sobra escrito aqui é o que só existe na camada web:
 * a codificação de lista do formulário HTML e os prefixos por linha da tabela do diário.
 *
 * O sufixo `[]` não é decoração: é assim que o leitor de formulário do Hono monta uma lista. Sem
 * ele, a segunda caixa marcada sobrescreve a primeira — e é uma decisão de MARCAÇÃO, não de
 * domínio, que é o motivo de `unidades`, `papeis` e `responsaveis` nascerem deste lado.
 */
export const CAMPOS = {
  login: CAMPOS_DE_IDENTIDADE.login,
  senha: CAMPOS_DE_IDENTIDADE.senha,
  aluno: CAMPOS_DO_ACADEMICO.aluno,
  responsavel: CAMPOS_DO_ACADEMICO.responsavel,
  vinculo: CAMPOS_DO_ACADEMICO.vinculo,
  matricula: CAMPOS_DO_ACADEMICO.matricula,
  transferencia: CAMPOS_DO_ACADEMICO.transferencia,
  turma: CAMPOS_DO_ACADEMICO.turma,
  disciplina: CAMPOS_DO_ACADEMICO.disciplina,
  alocacao: CAMPOS_DO_ACADEMICO.alocacao,
  unidade: CAMPOS_DE_IDENTIDADE.unidade,
  /** As linhas de atribuição chegam como duas listas paralelas e viram `atribuicoes` na rota. */
  usuario: { ...CAMPOS_DE_IDENTIDADE.usuario, unidades: 'unidade[]', papeis: 'papel[]' },
  anoLetivo: CAMPOS_DO_ACADEMICO.anoLetivo,
  /** `responsaveis[]` é a caixa marcada na tela; `destinatarios` é o campo que a recusa aponta. */
  comunicado: { ...CAMPOS_DA_COMUNICACAO, responsaveis: 'responsaveis[]' },
  /** Prefixos concatenados ao id da matrícula: uma coluna da tabela vira N campos. */
  diario: { nota: 'nota_', presenca: 'presenca_', justificativa: 'justificativa_' },
  bimestre: CAMPOS_DA_AVALIACAO.bimestre,
  data: CAMPOS_DA_AVALIACAO.data,
  notas: CAMPOS_DA_AVALIACAO.notas,
} as const;

/** Valor enviado pela caixa de responsável financeiro quando marcada. */
export const MARCADO = 'sim';

/* --- Valores iniciais de formulário ----------------------------------------- */

/** O formulário em branco. Vazio explícito, e não `undefined`, para o `value=` sair como "". */
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

/* --- Títulos de tela -------------------------------------------------------- */

/**
 * Cada título aparece na rota que o passa e de novo no `<h1>` do template, quando não também no
 * botão que leva até ele — "Cadastrar aluno" está escrito seis vezes hoje. É texto de produto:
 * mudá-lo é decisão de quem escreve o sistema, e precisa mudar nos seis de uma vez.
 *
 * O menu é o sétimo lugar: `parciais/_navegacao.eta` rotula treze links com o título da tela para
 * onde eles levam, e recebe o mapa inteiro como `it.titulos` (ver `auxiliares`, em `render.ts`).
 * Renomear "Anos letivos" e esquecer o menu deixaria o sistema chamando a mesma tela por dois
 * nomes — o do link e o do `<h1>` que ele abre.
 */
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

/* --- Áreas do sistema ------------------------------------------------------- */

/**
 * O nome de cada área: o rótulo do grupo no menu (`parciais/_navegacao.eta`) e o sobretítulo que
 * toda tela daquela área imprime acima do `<h1>` — "Rede", "Secretaria", "Acompanhamento".
 *
 * São a mesma decisão nas duas pontas, e é isso que justifica um dono só: o sobretítulo existe para
 * dizer em que parte do menu a pessoa está. Renomear o grupo e esquecer as treze telas de secretaria
 * deixaria o menu e o cabeçalho chamando o mesmo lugar por dois nomes.
 *
 * Distinto de `TITULOS`, que é o nome de uma TELA. "Unidades" é título; "Rede" é a área onde aquele
 * título mora, e o sobretítulo das telas internas compõe os dois — `Rede · Unidades` — com o
 * `APRESENTACAO.separador`.
 *
 * `ensino` é o grupo do professor no menu, e a tela dele diz "Professor" no sobretítulo. A
 * divergência é real e está preservada: são as únicas duas pontas que hoje NÃO combinam, e
 * uniformizá-las mudaria a tela. Por isso o `'Professor'` de `professor/painel.eta` continua escrito
 * lá, sozinho, e não vira um sétimo membro deste mapa fingindo ser o mesmo valor.
 */
export const AREAS = {
  rede: 'Rede',
  secretaria: 'Secretaria',
  ensino: 'Ensino',
  acompanhamento: 'Acompanhamento',
  comunicacao: 'Comunicação',
  conta: 'Conta',
} as const;

/* --- Rótulos de dado -------------------------------------------------------- */

/**
 * O nome que cada dado tem na tela: o `<th>` que encabeça a coluna, o `<dt>` da ficha, o
 * `cartao__rotulo` do cartão e o `<label>` da caixa que edita aquele mesmo dado.
 *
 * UMA CHAVE POR COISA NOMEADA, e não uma por posição. A tentação era separar "cabeçalho de coluna"
 * de "rótulo de campo", já que a mesma palavra aparece nos dois. Mas o repositório mostra que a
 * divergência real não é de posição, é de SIGNIFICADO: em `secretaria/turmas.eta` o filtro diz
 * "Ano letivo" e a coluna diz "Ano" — e não porque um é `<label>` e o outro é `<th>`, e sim porque
 * o filtro escolhe o ano letivo (a entidade) enquanto a coluna mostra o ano (o número). São duas
 * coisas, e por isso são `anoLetivo` e `ano`. Onde a coisa é a mesma — "Unidade" no filtro e na
 * coluna, na mesma tela — a palavra é a mesma por decisão, e não por acaso.
 *
 * Mora em `web/`, ao lado de `TITULOS`, e não no módulo de domínio: ao contrário de
 * `VOCABULARIO_DO_ACADEMICO.turno`, nenhum destes rótulos é o par de um valor fechado do domínio.
 * Acrescentar um turno obriga a nomeá-lo; acrescentar uma coluna é decisão de quem desenha a tela.
 *
 * "Situação" NÃO está aqui, de propósito — ver o comentário logo abaixo do mapa.
 */
export const ROTULOS = {
  aluno: 'Aluno',
  turma: 'Turma',
  unidade: 'Unidade',
  disciplina: 'Disciplina',
  responsavel: 'Responsável',
  /** O NÚMERO do ano, que é o que a coluna e o `<dt>` mostram. */
  ano: 'Ano',
  /** A ENTIDADE ano letivo, que é o que o filtro e o `<select>` escolhem. */
  anoLetivo: 'Ano letivo',
  matricula: 'Matrícula',
  /** Uma coisa só: a contagem de matrículas ativas, no cartão, na coluna e no `<h2>`. */
  matriculasAtivas: 'Matrículas ativas',
  nome: 'Nome',
  cpf: 'CPF',
  email: 'E-mail',
  inicio: 'Início',
  termino: 'Término',
  frequencia: 'Frequência',
  destinatarios: 'Destinatários',
  /** A coluna dos botões de linha. Convenção da tabela, e não nome de dado — mas mora junto. */
  acoes: 'Ações',
} as const;

/**
 * "Situação" fica FORA de `ROTULOS`, e a decisão é o exemplo mais claro do que este arquivo evita.
 *
 * A palavra encabeça cinco colunas, e cada uma mostra um vocabulário fechado diferente, de quatro
 * módulos diferentes: a unidade é Ativa/Inativa (`VOCABULARIO_DE_IDENTIDADE.unidadeAtiva`), o
 * usuário é Ativo/Inativo (`.ativo`), a matrícula é Ativa/Transferida/Cancelada/Concluída
 * (`VOCABULARIO_DO_ACADEMICO.situacaoDeMatricula`), o dia de aula é Presente/Falta
 * (`VOCABULARIO_DA_AVALIACAO.presenca`) e o boletim é Aprovado/Reprovado/Em curso (`.situacaoFinal`).
 *
 * "Situação" é o substantivo genérico do português que serve de cabeça para os cinco. Um dono único
 * prometeria que as cinco mudam juntas, e elas não mudam: decidir que a tabela de frequência passa a
 * dizer "Presença" é uma mudança da tela de frequência, e não pode renomear a coluna da lista de
 * unidades. As cinco ocorrências ficam escritas onde estão, com `// magic-values: permitido`.
 */

/* --- Substantivos contáveis ------------------------------------------------- */

/**
 * O substantivo de cada coisa, no singular e no plural, minúsculo: o que vai depois do número na
 * linha "3 disciplinas" e no rótulo da barra de paginação.
 *
 * Singular e plural são UMA decisão, e é por isso que cada entrada é um par e não duas chaves
 * soltas: quem trocar "responsável" por "contato" tem de trocar "responsáveis" no mesmo movimento,
 * e hoje as duas metades estão escritas na mesma linha do `.eta` justamente porque ninguém consegue
 * mudar uma sem a outra.
 *
 * É outra decisão que `ROTULOS`, ainda que as palavras se pareçam. `ROTULOS.disciplina` é "Disciplina",
 * o nome do dado no alto de uma coluna; `CONTAGEM.disciplina.plural` é "disciplinas", o substantivo
 * no meio de uma frase contada. A maiúscula não é enfeite: uma nomeia, a outra é lida em voz
 * corrida — e é por isso que o dia em que o produto quiser encurtar o cabeçalho da coluna a frase
 * "3 disciplinas" não muda junto.
 *
 * Os rótulos de paginação QUALIFICADOS — "responsáveis vinculados", "disciplinas alocadas",
 * "comunicados não lidos", "alunos encontrados" — não saem daqui: cada um descreve o recorte
 * daquela tabela, existe uma vez só e é decisão da tela, não do substantivo.
 */
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

/** A forma de um substantivo contável, para quem escreve o auxiliar que escolhe entre as duas. */
export type SubstantivoContavel = { readonly singular: string; readonly plural: string };

/* --- Rótulos de ação -------------------------------------------------------- */

/**
 * O texto dos botões e links que TIRAM a pessoa da tela em que ela está.
 *
 * `cancelar` e `voltarPara` são uma família só, e em dois níveis, porque respondem à mesma pergunta
 * de dois jeitos. Na mesma tela de matrícula, o link do alto diz "Voltar à ficha" e o botão ao pé do
 * formulário diz "Cancelar" — os dois apontam para o MESMO endereço. O de cima nomeia o destino; o
 * de baixo nomeia o que se está abandonando, e por isso é uma palavra só, igual nos doze formulários
 * do sistema. Fundi-los faria o formulário dizer "Voltar à ficha" no botão de desistir; separá-los
 * em dois mapas esconderia que são a mesma decisão de produto — como se sai daqui.
 *
 * `buscarAluno` é a terceira forma: não é saída, é a chamada que três telas fazem para a MESMA busca
 * — o botão do painel, o botão da lista de responsáveis e a ação do estado vazio da turma. Mora aqui
 * porque é rótulo de link de navegação, e o que a distingue está escrito no nome da chave.
 *
 * O membro de `voltarPara` é o DESTINO, e não a tela de origem: `ficha` aparece em três telas que
 * voltam para a ficha do aluno. Quem acrescentar uma quarta encontra o rótulo pronto em vez de
 * escrever "Voltar para a ficha" e deixar o sistema com duas redações para o mesmo caminho.
 */
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

/* --- Estados vazios --------------------------------------------------------- */

/**
 * O título do estado vazio das três telas que dependem de aluno matriculado: a chamada, o
 * lançamento de notas e a ficha da turma.
 *
 * Só o TÍTULO tem dono. O parágrafo abaixo dele é diferente nas três — "não há chamada a registrar",
 * "não há nota a lançar", "matricule pela ficha do aluno" — porque cada tela diz o que fazer a
 * seguir, e o que fazer a seguir depende de onde a pessoa está. O fato constatado, esse é um só.
 */
export const SEM_ALUNO_MATRICULADO = 'Nenhum aluno matriculado';

/* --- Avisos de sucesso ------------------------------------------------------ */

/** O que a pessoa lê depois do POST-Redirect-GET. */
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
  /** O "1º bimestre" sai de `ROTULO_DE_BIMESTRE`: é o mesmo que as três telas do diário imprimem. */
  bimestreFechado: (bimestre: number, turma: string): string =>
    `${ROTULO_DE_BIMESTRE(bimestre)} fechado para a turma ${turma}.`,
} as const;

/** Os códigos que voltam na query; a frase que a pessoa lê nasce do mapa acima. */
export const CODIGOS_DE_AVISO = {
  senhaAlterada: 'senha-alterada',
  unidadeCriada: 'unidade-criada',
  usuarioConvidado: 'usuario-convidado',
  anoDefinido: 'ano-definido',
} as const;

/* --- Erros decididos na camada web ------------------------------------------ */

/**
 * O ano letivo antes da conversão para número. Mora ao lado do erro que ele dispara porque os
 * dois são a mesma decisão dita duas vezes — a regra e a frase que a explica —, e um `\d{3}`
 * aceito aqui faria `ERROS_DE_FORMULARIO.anoInvalido` mentir sobre o que recusa.
 */
export const ANO_EM_QUATRO_DIGITOS = /^\d{4}$/;

/**
 * Erros de formulário que o caso de uso não tem como decidir: conferir a confirmação de senha,
 * exigir quatro dígitos antes de converter o ano, recusar linha de atribuição pela metade.
 *
 * O `campo` sai de `CAMPOS` e não é redigitado: quem lê esta falha é o mesmo `erroDe()` que lê as
 * do módulo, e o texto só aparece embaixo da caixa certa se as duas pontas disserem a mesma
 * palavra. O `codigo`, sim, nasce aqui — a recusa é decidida nesta camada e não tem dono lá dentro.
 */
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
  /**
   * Sem `mensagem`, ao contrário das vizinhas: as duas recusas abaixo não têm redação única.
   * Quem as emite compõe a frase com um número que só existe em tempo de execução — o intervalo
   * da nota — ou com um texto próprio da tela de envio. Declarar aqui um texto que todo consumidor
   * sobrescreve seria pior que não declarar nenhum: quem procurasse pela frase que a tela mostra
   * encontraria esta, e ela nunca chegou a uma tela.
   */
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

/** Erro por célula da tabela de notas — o texto da TELA, distinto do texto da aplicação. */
export const NOTA_FORA_DA_FAIXA = (minimo: number, maximo: number): string =>
  `Use um número de ${minimo} a ${maximo}.`;

/**
 * As frases das duas recusas que `ERROS_DE_FORMULARIO` declara sem `mensagem`.
 *
 * `notaInvalida` e `semSelecao` levam campo e código de lá e a redação daqui, porque a primeira
 * depende do intervalo da nota, que vem de `LIMITES_DA_AVALIACAO` em tempo de execução, e a
 * segunda tem o texto próprio da tela de envio. Um `mensagem` fixo naquele objeto seria letra
 * morta — todo consumidor o substituiria.
 *
 * O que muda ao trazê-las para cá é o DONO: até agora as duas estavam redigidas dentro de
 * `web/rotas/professor.ts` e `web/rotas/comunicados.ts`, que é arquivo de rota e não de texto, e
 * lá ninguém as encontrava ao procurar pela frase que aparece na tela.
 */
export const RESUMO_DE_NOTA_FORA_DA_FAIXA = (minimo: number, maximo: number): string =>
  `Confira os campos destacados: há nota fora do intervalo de ${minimo} a ${maximo}.`;

export const SEM_SELECAO_NO_ENVIO =
  'Marque ao menos um responsável ou escolha enviar para toda a unidade.';

/* --- Páginas de erro -------------------------------------------------------- */

/**
 * O parágrafo que acompanha cada título de erro. Os TÍTULOS vêm reexportados do `shared` no topo
 * deste arquivo — a página de reserva de `shared/http/erros.ts` precisa deles e não enxerga a
 * camada web —, e os detalhes ficam aqui porque aquela página de reserva não tem parágrafo: ela
 * mostra título e código de correlação, e nada mais.
 *
 * A 404 genérica de `TITULOS_DE_ERRO[404]` é a que o `notFound` da aplicação usa. Já
 * `PAGINAS_DE_ERRO.registroForaDoAlcance` é OUTRA 404: fala em "outra unidade" e não em "outra
 * rede", porque quem a vê é a secretaria, para quem a rede não é o limite.
 */
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

/** Último recurso, em `text/plain`, quando nem a página de erro pôde ser montada. */
export const ERRO_INESPERADO_EM_TEXTO = 'Erro inesperado';

/* --- Diagnósticos ----------------------------------------------------------- */

/**
 * Texto de `throw` e de log — vai para a ocorrência, nunca para a tela. Separado das mensagens de
 * usuário de propósito: estes podem ser específicos e técnicos justamente porque ninguém de fora
 * os lê.
 */
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

/* --- Apresentação ----------------------------------------------------------- */

/**
 * As quatro primeiras chaves são a moldura de marca, e chegam aos dois layouts como
 * `it.apresentacao` — ver `auxiliares`, em `render.ts`. O resto são regras de formatação, lidas
 * daqui pelo próprio `render.ts` e por alguns handlers.
 */
export const APRESENTACAO = {
  /** Sufixo de marca no `<title>` de toda página. */
  sufixoDoTitulo: ' · EscolaViva',
  /**
   * A logotipia, e por isso MARCAÇÃO: a ênfase na segunda metade da palavra é o desenho da marca,
   * não decoração do template. Sai com `<%~ %>` nos dois lugares que a imprimem — o cabeçalho da
   * aplicação e a folha do login —, e a saída crua é segura porque o valor é este literal e nunca
   * um dado de usuário. Guardar só `'EscolaViva'` e deixar o `<em>` no `.eta` partiria o nome do
   * produto em dois pedaços que teriam de ser recortados igual nos dois arquivos.
   */
  marca: 'Escola<em>Viva</em>',
  subtituloPublico: 'Portal da rede escolar',
  rodapePublico: 'Sistema de uso restrito. O acesso é registrado.',
  /** Separador de atributos numa mesma linha: nome · série · turno. */
  separador: ' · ',
  separadorDeTurno: ' · turno ',
  sufixoDePercentual: ' %',
  separadorDecimal: ',',
  /** `10^casas` — uma casa decimal na exibição de nota. */
  fatorDeUmaCasa: 10,
  /** A taxa sai do domínio como fração de 0 a 1 e vira percentual aqui, num lugar só. */
  fatorPercentual: 100,
  /** A mensagem volta na URL depois do redirecionamento: entra na página curta e escapada. */
  limiteDaMensagem: 160,
  opcaoVazia: 'Selecione…',
  colunaDeDoisDigitos: 2,
  preenchimentoDeDigito: '0',
} as const;

/** Convenção de id dos elementos que descrevem um campo, lida por `aria-describedby`. */
export const SUFIXOS_DE_ID = { ajuda: '-ajuda', erro: '-erro' } as const;

/** A tabela de notas usa PREFIXO, e não sufixo: o id é `erro-<matriculaId>`. */
export const PREFIXOS_DE_ID = { erroDeCelula: 'erro-', pendencia: 'pendencia-' } as const;

export const PAGINACAO = {
  /** Sete números cabem na barra sem quebrar a linha no celular. */
  janela: 7,
  rotuloPadrao: 'itens',
} as const;

/** Sem JavaScript no cliente, "uma ou mais atribuições" são linhas fixas que podem ficar vazias. */
export const LINHAS_DE_ATRIBUICAO = 3;

/* --- Assets e cache da camada web ------------------------------------------- */

/** O nome do asset é gerado pelo build (`app.<hash>.css`): nada além disso é servido daqui. */
export const NOME_DE_ASSET = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,127})$/;

export const TIPOS_DE_ASSET: Record<string, string> = {
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
};

export const TIPO_DE_ASSET_PADRAO = 'application/octet-stream';

/**
 * Política de cache das respostas de saúde. Tem o mesmo valor de `CACHE.anonimo`, de
 * `shared/constantes.ts`, e é outra política: uma governa página anônima, esta governa sonda.
 */
export const SEM_CACHE_NA_SAUDE = 'no-store';

/** Vocabulário do corpo JSON de `/health`. */
export const CORPO_DE_SAUDE = {
  ok: { status: 'ok', banco: 'ok' },
  degradado: { status: 'degradado', banco: 'indisponivel' },
  vivo: { status: 'ok' },
} as const;

/* --- Cookie do convite ------------------------------------------------------ */

/**
 * A senha provisória atravessa o redirecionamento num cookie assinado de vida curtíssima, restrito
 * ao caminho da lista de usuários: ela é mostrada uma vez e não pode sobreviver à tela.
 */
export const COOKIE_DO_CONVITE = {
  nome: 'ev_convite',
  validadeEmSegundos: 120,
  separador: ':',
  sameSite: 'Lax',
} as const;

/* --- Documento -------------------------------------------------------------- */

/**
 * O que os dois layouts declaram no `<head>` e o id que ancora o `<main>`. Chega ao `.eta` como
 * `it.documento` (ver `auxiliares`, em `render.ts`), porque é a MESMA declaração nas duas molduras:
 * escrita à mão, `_layout` ganharia um `color-scheme` que `_layout_publico` não teria, e a tela de
 * login passaria a divergir do resto do sistema sem que nada acusasse.
 *
 * Duas cópias deliberadas ficam de fora, e as duas são de fronteira:
 *
 *   - `shared/http/erros.ts` escreve `lang="pt-BR"` na página de reserva. `shared/` não enxerga a
 *     camada web — é a mesma fronteira que levou `TITULOS_DE_ERRO` a nascer em
 *     `shared/constantes.ts` —, e aquela página existe justamente para o instante em que o motor
 *     de template ainda não foi registrado.
 *   - `parciais/_script_avisos.eta` escreve `'conteudo'` dentro do `<script>`. Aquele corpo viaja
 *     byte a byte para o navegador e é incluído sem `it`: não há de onde interpolar.
 */
export const DOCUMENTO = {
  idioma: 'pt-BR',
  esquemaDeCor: 'light',
  robots: 'noindex, nofollow',
  /** Alvo do link de pular navegação e do foco depois que um aviso é fechado. */
  idDoConteudo: 'conteudo',
} as const;
