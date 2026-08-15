/**
 * Frequência é POR DIA: um aluno está presente ou ausente numa data, e a justificativa é o texto
 * que a secretaria recebeu do responsável. Não existe frequência por aula no EscolaViva — a
 * chamada é uma linha por aluno por dia, e é isso que a constraint `frequencia_unica_por_dia`
 * garante no banco.
 */

import { FORMATOS, TAMANHO_DA_DATA_ISO } from '../../shared/constantes';
import { MEIA_NOITE_UTC } from '../constantes';

export type LinhaDeChamada = {
  matriculaId: string;
  alunoNome: string;
  presente: boolean;
  justificativa: string | null;
};

/** O que já está registrado para um aluno num dia — o que a tela de chamada abre preenchido. */
export type PresencaDoDia = { presente: boolean; justificativa: string | null };

/** Uma linha do histórico de frequência da matrícula. `data` no formato ISO `AAAA-MM-DD`. */
export type ResumoFrequencia = { data: string; presente: boolean; justificativa: string | null };

/** Dias registrados e quantos deles foram de presença — a base do percentual do boletim. */
export type ApuracaoDeFrequencia = { totalDias: number; presencas: number };

export function dataDeChamadaValida(data: string): boolean {
  if (!FORMATOS.dataIso.test(data)) return false;
  // O formato sozinho aceita 2026-02-30. Converter e comparar a volta ao texto é o que separa
  // uma data que existe de uma sequência de dígitos plausível.
  const convertida = new Date(`${data}${MEIA_NOITE_UTC}`);
  if (Number.isNaN(convertida.getTime())) return false;
  return convertida.toISOString().slice(0, TAMANHO_DA_DATA_ISO) === data;
}

/**
 * Datas ISO com zero à esquerda comparam-se como texto na mesma ordem em que comparam como data,
 * então o intervalo do ano letivo é verificado sem converter nada.
 */
export function dataDentroDoAnoLetivo(data: string, inicio: string, fim: string): boolean {
  return data >= inicio && data <= fim;
}
