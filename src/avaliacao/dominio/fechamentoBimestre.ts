import { MENSAGENS } from '../constantes';
import { BIMESTRES } from './nota';

/** Um bimestre encerrado para uma turma. `fechadoEm` é um instante ISO em UTC. */
export type FechamentoBimestre = { bimestre: number; fechadoEm: string };

/** Os quatro bimestres da turma com o estado de cada um — a grade que a tela desenha. */
export type EstadoDeFechamento = { bimestre: number; fechado: boolean; fechadoEm: string | null };

/** O que falta para o bimestre poder ser fechado, por disciplina. */
export type PendenciaDeFechamento = { disciplinaNome: string; faltando: number };

/**
 * Expande as linhas gravadas na grade completa: o bimestre sem linha é um bimestre aberto.
 * A ausência é informação, então ela vira estado explícito em vez de sumir da lista.
 */
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

/**
 * Quantas notas faltam em cada disciplina para que o bimestre da turma possa ser fechado.
 * A disciplina completa não aparece na lista: a secretaria só precisa ver o que a impede.
 */
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

/**
 * A recusa precisa dizer para onde ir. "Faltam 7 notas" manda a secretaria procurar; "Matemática
 * (5), História (2)" manda ela abrir duas telas e resolver.
 */
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
