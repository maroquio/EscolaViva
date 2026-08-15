/**
 * As constantes do módulo de identidade: quem entra, com que papel e em qual unidade.
 *
 * Duas coincidências de valor que este arquivo mantém separadas de propósito:
 *
 *   - `LIMITES.usuario.nome` e `LIMITES.unidade.nome` valem 120, e os limites de nome do módulo
 *     acadêmico também. São políticas de módulos diferentes, decididas em momentos diferentes, e
 *     a regra `sem-atalho-entre-modulos` já diz o que fazer com elas: cada uma no seu dono.
 *   - `TAMANHO_DA_SENHA_PROVISORIA` vale 12 e `TAMANHO_MINIMO_DE_SENHA` vale 10. Uma é quantos
 *     símbolos o sistema SORTEIA, a outra é o mínimo que a pessoa pode ESCOLHER. Igualá-las
 *     acidentalmente faria uma senha gerada nascer no limite da outra regra.
 *
 * `PAPEIS`, `STATUS_DE_REDE` e `TAMANHO_MINIMO_DE_SENHA` continuam no `dominio/`, onde são fonte
 * de tipo e de `type guard`. Quem está fora do módulo os encontra reexportados pelo `index.ts`,
 * junto com este arquivo — hoje `'professor'` está redigitado em `usuarioRepositorio.ts` e
 * `'responsavel'` em `convidarUsuario.ts`, ambos a poucas linhas da lista que já os declara.
 *
 * Este arquivo não importa NADA em tempo de execução: o `import type` abaixo é apagado na
 * compilação, e é o que permite que `dominio/` passe a ler daqui sem fechar um ciclo.
 */

import type { Papel } from './dominio/papel';
import type { StatusDeRede } from './dominio/rede';

/**
 * Os membros nomeados. O `satisfies` é a checagem que importa: um papel escrito errado aqui não
 * compila, enquanto a mesma string solta no meio de uma consulta passa e devolve lista vazia.
 */
export const PAPEL = {
  adminRede: 'admin_rede',
  secretaria: 'secretaria',
  professor: 'professor',
  responsavel: 'responsavel',
} as const satisfies Record<string, Papel>;

/** O único status que autoriza abrir e manter sessão. */
export const REDE_ATIVA = 'ativa' as const satisfies StatusDeRede;

/* --- Limites ---------------------------------------------------------------- */

export const LIMITES = {
  usuario: { nome: 120 },
  unidade: { nome: 120, codigoInep: 20 },
} as const;

/* --- Segurança -------------------------------------------------------------- */

export const SEGURANCA = {
  /**
   * Hash fixo conferido quando ninguém é encontrado pelo CPF informado. Sem ele a resposta volta
   * em um milissegundo para CPF desconhecido e em cerca de cem para CPF cadastrado, e o relógio
   * passa a responder quem estuda ou trabalha na rede.
   */
  hashDeUsuarioInexistente:
    '$argon2id$v=19$m=65536,t=2,p=1$XMdb31Dd1P5tOekJsaneq6Yl0CU6HnbV15d11ekBprQ$jxM302vDpER0f7uF9xQRIwAkDNaDTukAT0y3bg04lhQ',
  /**
   * Sem I, O, 0 e 1: a senha provisória é ditada por telefone e digitada de novo por quem recebe.
   * O tamanho 32 é load-bearing — 256 é múltiplo de 32, e é isso que mantém o sorteio uniforme.
   */
  alfabetoSemAmbiguidade: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  /** Quantos símbolos a senha SORTEADA tem. Não é o mínimo da senha escolhida pelo usuário. */
  tamanhoDaSenhaProvisoria: 12,
} as const;

/** Separador da chave composta `unidadeId:papel`, usada só em memória para deduplicar. */
export const SEPARADOR_DE_ATRIBUICAO = ':';

/* --- Nomes de campo --------------------------------------------------------- */

export const CAMPOS = {
  login: { redeSlug: 'redeSlug', cpf: 'cpf', senha: 'senha' },
  usuario: {
    nome: 'nome',
    email: 'email',
    cpf: 'cpf',
    atribuicoes: 'atribuicoes',
    responsavelId: 'responsavelId',
  },
  unidade: { nome: 'nome', codigoInep: 'codigoInep' },
  senha: { atual: 'senhaAtual', nova: 'senhaNova', confirmacao: 'senhaConfirmacao' },
} as const;

/* --- Códigos de erro -------------------------------------------------------- */

export const CODIGOS = {
  credenciaisInvalidas: 'credenciais_invalidas',
  redeIndisponivel: 'rede_indisponivel',
  unidadeDeOutraRede: 'unidade_de_outra_rede',
  emailEmUso: 'email_em_uso',
  cpfEmUso: 'cpf_em_uso',
  responsavelObrigatorio: 'responsavel_obrigatorio',
  cpfDivergeDoCadastro: 'cpf_diverge_do_cadastro',
  nomeEmUso: 'nome_em_uso',
  usuarioInexistente: 'usuario_inexistente',
  senhaIncorreta: 'senha_incorreta',
} as const;

/* --- Mensagens -------------------------------------------------------------- */

/**
 * As mensagens deste módulo são minúsculas e sem ponto final; as do acadêmico são capitalizadas e
 * pontuadas. A divergência é real e está preservada de propósito: uniformizá-la mudaria texto de
 * tela, e este refactor não muda comportamento. A única exceção do módulo — `cpfInvalido`, que
 * segue o estilo do acadêmico — continua como está pelo mesmo motivo.
 */
export const MENSAGENS = {
  login: {
    redeObrigatoria: 'informe a rede',
    cpfObrigatorio: 'informe o CPF',
    senhaObrigatoria: 'informe a senha',
    /** Uma frase só para CPF inexistente e senha errada: a tela não é um oráculo. */
    credenciaisInvalidas: 'CPF ou senha inválidos',
    redeIndisponivel: 'rede não encontrada ou fora de operação',
  },
  usuario: {
    redeInvalida: 'rede inválida',
    nomeObrigatorio: 'informe o nome',
    nomeLongo: 'nome longo demais',
    emailObrigatorio: 'informe o e-mail',
    emailInvalido: 'e-mail inválido',
    cpfInvalido: 'Informe um CPF válido.',
    unidadeInvalida: 'unidade inválida',
    papelDesconhecido: 'papel desconhecido',
    semAtribuicao: 'escolha ao menos uma unidade e um papel',
    responsavelInvalido: 'responsável inválido',
    unidadeDeOutraRede: 'unidade não pertence a esta rede',
    emailEmUso: 'já existe usuário com este e-mail na rede',
    cpfEmUso: 'já existe usuário com este CPF na rede',
    responsavelObrigatorio:
      'quem entra como responsável precisa estar ligado a um cadastro de responsável',
    /** Rótulo de reserva quando o nome do cadastro não chegou à mensagem de divergência. */
    rotuloDeResponsavel: 'responsável',
    cpfDivergeDoCadastro: (nomeDoCadastro: string): string =>
      `O CPF não confere com o do cadastro de ${nomeDoCadastro}.`,
  },
  unidade: {
    redeInvalida: 'rede inválida',
    nomeObrigatorio: 'informe o nome da unidade',
    nomeLongo: 'nome longo demais',
    inepLongo: 'código INEP longo demais',
    nomeEmUso: 'já existe unidade com este nome na rede',
  },
  senha: {
    usuarioInvalido: 'usuário inválido',
    atualObrigatoria: 'informe a senha atual',
    novaCurta: (minimo: number): string =>
      `a senha nova precisa de ao menos ${minimo} caracteres`,
    usuarioInexistente: 'usuário não encontrado',
    atualNaoConfere: 'a senha atual não confere',
  },
} as const;

/* --- Erros internos e log --------------------------------------------------- */

export const ERROS_INTERNOS = {
  papelForaDoDominio: (valor: string): string => `papel fora do domínio: ${valor}`,
  statusDeRedeForaDoDominio: (valor: string): string => `status de rede fora do domínio: ${valor}`,
} as const;

export const EVENTOS_DE_LOG = {
  /** Recusa registrada dentro do caso de uso — distinta de "tentativa de entrada", da rota web. */
  autenticacaoRecusada: 'tentativa de autenticação recusada',
  sessaoAberta: 'sessão aberta',
  sessoesExpiradasRemovidas: 'sessões expiradas removidas',
} as const;

/* --- Job de expurgo --------------------------------------------------------- */

/**
 * A cadência é de identidade — é a sessão que expira —, mas a CHAVE do advisory lock mora em
 * `shared/constantes.ts`, junto com a da migração: o espaço numérico é global ao banco, e duas
 * chaves iguais fazem um dos dois jobs nunca rodar, em silêncio.
 */
export const EXPURGO_DE_SESSOES = { nome: 'expurgo-de-sessoes', intervaloEmMinutos: 15 } as const;

/* --- Vocabulário de tela ---------------------------------------------------- */

export const VOCABULARIO = {
  papel: {
    admin_rede: 'Administração da rede',
    secretaria: 'Secretaria',
    professor: 'Professor',
    responsavel: 'Responsável',
  } as const satisfies Record<Papel, string>,
  ativo: { sim: 'Ativo', nao: 'Inativo' },
  unidadeAtiva: { sim: 'Ativa', nao: 'Inativa' },
  semPapel: 'sem papel atribuído',
} as const;
