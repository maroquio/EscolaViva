export type Responsavel = {
  id: string;
  redeId: string;
  nome: string;
  email: string;
  cpf: string | null;
  telefone: string | null;
};

/** O responsável visto a partir do aluno: quem é, como falar com ele e o que ele responde. */
export type VinculoResponsavel = {
  responsavelId: string;
  nome: string;
  email: string;
  parentesco: string;
  financeiro: boolean;
};
