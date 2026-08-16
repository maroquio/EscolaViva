import type { Papel } from './dominio/papel';
import type { StatusDeRede } from './dominio/rede';

export const PAPEL = {
  adminRede: 'network_admin',
  secretaria: 'registrar',
  professor: 'teacher',
  responsavel: 'guardian',
} as const satisfies Record<string, Papel>;

export const REDE_ATIVA = 'active' as const satisfies StatusDeRede;

export const LIMITES = {
  usuario: { nome: 120 },
  unidade: { nome: 120, codigoInep: 20 },
} as const;

export const SEGURANCA = {
  hashDeUsuarioInexistente:
    '$argon2id$v=19$m=65536,t=2,p=1$XMdb31Dd1P5tOekJsaneq6Yl0CU6HnbV15d11ekBprQ$jxM302vDpER0f7uF9xQRIwAkDNaDTukAT0y3bg04lhQ',
  alfabetoSemAmbiguidade: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  tamanhoDaSenhaProvisoria: 12,
} as const;

export const SEPARADOR_DE_ATRIBUICAO = ':';

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

export const MENSAGENS = {
  login: {
    redeObrigatoria: 'informe a rede',
    cpfObrigatorio: 'informe o CPF',
    senhaObrigatoria: 'informe a senha',
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

export const ERROS_INTERNOS = {
  papelForaDoDominio: (valor: string): string => `papel fora do domínio: ${valor}`,
  statusDeRedeForaDoDominio: (valor: string): string => `status de rede fora do domínio: ${valor}`,
} as const;

export const EVENTOS_DE_LOG = {
  autenticacaoRecusada: 'tentativa de autenticação recusada',
  sessaoAberta: 'sessão aberta',
  sessoesExpiradasRemovidas: 'sessões expiradas removidas',
} as const;

export const EXPURGO_DE_SESSOES = { nome: 'expurgo-de-sessoes', intervaloEmMinutos: 15 } as const;

export const VOCABULARIO = {
  papel: {
    network_admin: 'Administração da rede',
    registrar: 'Secretaria',
    teacher: 'Professor',
    guardian: 'Responsável',
  } as const satisfies Record<Papel, string>,
  ativo: { sim: 'Ativo', nao: 'Inativo' },
  unidadeAtiva: { sim: 'Ativa', nao: 'Inativa' },
  semPapel: 'sem papel atribuído',
} as const;
