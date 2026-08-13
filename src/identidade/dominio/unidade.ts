/**
 * A unidade é a escola física da rede. Todo papel, toda turma e todo comunicado pendem dela —
 * é ela que separa "a professora do Centro" da "professora da Serra" dentro da mesma conta.
 */
export type Unidade = {
  id: string;
  redeId: string;
  nome: string;
  codigoInep: string | null;
  ativa: boolean;
};
