export const TURNOS = ['matutino', 'vespertino', 'noturno', 'integral'] as const;

export type Turno = (typeof TURNOS)[number];

export type Turma = {
  id: string;
  redeId: string;
  unidadeId: string;
  anoLetivoId: string;
  nome: string;
  serie: string;
  turno: Turno;
};

export type TurmaDisciplina = {
  id: string;
  redeId: string;
  turmaId: string;
  disciplinaId: string;
  disciplinaNome: string;
  professorUsuarioId: string;
};

export type TurmaDisciplinaDoProfessor = TurmaDisciplina & {
  turmaNome: string;
  serie: string;
  turno: Turno;
  unidadeId: string;
};

export function turnoValido(valor: string): valor is Turno {
  return TURNOS.some((turno) => turno === valor);
}
