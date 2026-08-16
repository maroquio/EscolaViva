import { MENSAGENS } from '../constants';
import { BIMESTRES } from './grade';

export type FechamentoBimestre = { bimestre: number; fechadoEm: string };

export type EstadoDeFechamento = { bimestre: number; fechado: boolean; fechadoEm: string | null };

export type PendenciaDeFechamento = { disciplinaNome: string; faltando: number };

export function estadosDeFechamento(
  fechados: readonly FechamentoBimestre[],
): EstadoDeFechamento[] {
  return BIMESTRES.map((bimestre) => {
    const fechamento = fechados.find((registro) => registro.bimestre === bimestre);
    return fechamento === undefined
      ? { bimestre, fechado: false, fechadoEm: null }
      : { bimestre, fechado: true, fechadoEm: fechamento.fechadoEm };
  });
}

export function todosBimestresFechados(estados: readonly EstadoDeFechamento[]): boolean {
  return estados.length === BIMESTRES.length && estados.every((estado) => estado.fechado);
}

export function pendenciasDoFechamento(
  disciplinas: readonly { id: string; disciplinaNome: string }[],
  matriculasAtivas: number,
  lancadasPorDisciplina: ReadonlyMap<string, number>,
): PendenciaDeFechamento[] {
  return disciplinas
    .map((disciplina) => ({
      disciplinaNome: disciplina.disciplinaNome,
      faltando: matriculasAtivas - (lancadasPorDisciplina.get(disciplina.id) ?? 0),
    }))
    .filter((pendencia) => pendencia.faltando > 0);
}

export function mensagemDePendencias(pendencias: readonly PendenciaDeFechamento[]): string {
  const total = pendencias.reduce((soma, pendencia) => soma + pendencia.faltando, 0);
  const detalhe = pendencias
    .map((pendencia) =>
      MENSAGENS.fechamento.pendencia(pendencia.disciplinaNome, pendencia.faltando),
    )
    .join(MENSAGENS.fechamento.separadorDePendencias);
  return total === 1
    ? MENSAGENS.fechamento.pendenciaSingular(detalhe)
    : MENSAGENS.fechamento.pendenciaPlural(total, detalhe);
}
