/**
 * Os quatro papéis do produto. A lista é fechada e repete exatamente o CHECK `papel_valido`
 * do banco: quem pode o quê é decisão de domínio, não configuração de cliente.
 */
export const PAPEIS = ['admin_rede', 'secretaria', 'professor', 'responsavel'] as const;

export type Papel = (typeof PAPEIS)[number];

/** O papel só existe dentro de uma unidade — ninguém é "professor da rede". */
export type PapelEmUnidade = { unidadeId: string; unidadeNome: string; papel: Papel };

export function papelValido(valor: string): valor is Papel {
  return (PAPEIS as readonly string[]).includes(valor);
}

/**
 * Converte o texto vindo do banco no papel do domínio. Recusar em vez de ignorar é deliberado:
 * um papel desconhecido silenciosamente descartado tiraria acesso de alguém sem deixar rastro.
 */
export function paraPapel(valor: string): Papel {
  if (!papelValido(valor)) throw new Error(`papel fora do domínio: ${valor}`);
  return valor;
}
