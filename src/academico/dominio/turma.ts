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

/** A disciplina alocada numa turma, com o professor que a leciona. */
export type TurmaDisciplina = {
  id: string;
  redeId: string;
  turmaId: string;
  disciplinaId: string;
  disciplinaNome: string;
  professorUsuarioId: string;
};

/** O professor entra pela disciplina que leciona; a turma vem junto para ele saber onde está. */
export type TurmaDisciplinaDoProfessor = TurmaDisciplina & {
  turmaNome: string;
  serie: string;
  turno: Turno;
  unidadeId: string;
};

/** O mesmo conjunto do CHECK `turno_valido` no banco, aqui em forma de regra consultável. */
export function turnoValido(valor: string): valor is Turno {
  return TURNOS.some((turno) => turno === valor);
}
