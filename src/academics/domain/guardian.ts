export type Guardian = {
  id: string;
  networkId: string;
  name: string;
  email: string;
  cpf: string | null;
  phone: string | null;
};

export type GuardianLink = {
  guardianId: string;
  name: string;
  email: string;
  relationship: string;
  financiallyResponsible: boolean;
};
