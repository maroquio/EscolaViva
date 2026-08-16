export type Responsavel = {
  id: string;
  redeId: string;
  nome: string;
  email: string;
  cpf: string | null;
  telefone: string | null;
};

export type VinculoResponsavel = {
  responsavelId: string;
  nome: string;
  email: string;
  parentesco: string;
  financeiro: boolean;
};
