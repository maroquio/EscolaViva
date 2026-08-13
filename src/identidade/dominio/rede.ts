/**
 * A rede é a conta contratante: uma escola isolada é apenas uma rede de uma unidade.
 * `status` é definido à mão pelo administrador no Estágio 01 — não existe plano nem assinatura
 * aqui, e é ele quem liga e desliga o acesso de uma rede inteira.
 */
export const STATUS_DE_REDE = ['ativa', 'suspensa', 'cancelada'] as const;

export type StatusDeRede = (typeof STATUS_DE_REDE)[number];

export type Rede = { id: string; nome: string; slug: string; status: StatusDeRede };

function ehStatusDeRede(valor: string): valor is StatusDeRede {
  return (STATUS_DE_REDE as readonly string[]).includes(valor);
}

/**
 * Converte o texto vindo do banco no status do domínio. O CHECK `rede_status_valido` já garante
 * o conjunto; se algo escapou dele o esquema está errado, e servir a rede assim mesmo seria
 * decidir sobre um estado que a aplicação não sabe interpretar.
 */
export function paraStatusDeRede(valor: string): StatusDeRede {
  if (!ehStatusDeRede(valor)) throw new Error(`status de rede fora do domínio: ${valor}`);
  return valor;
}

/** Rede suspensa ou cancelada não abre sessão nem mantém as que já estavam abertas. */
export function redeAtiva(rede: Rede): boolean {
  return rede.status === 'ativa';
}
