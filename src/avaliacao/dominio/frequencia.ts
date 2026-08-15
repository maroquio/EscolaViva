import { FORMATOS, TAMANHO_DA_DATA_ISO } from '../../shared/constantes';
import { MEIA_NOITE_UTC } from '../constantes';

export type LinhaDeChamada = {
  matriculaId: string;
  alunoNome: string;
  presente: boolean;
  justificativa: string | null;
};

export type PresencaDoDia = { presente: boolean; justificativa: string | null };

export type ResumoFrequencia = { data: string; presente: boolean; justificativa: string | null };

export type ApuracaoDeFrequencia = { totalDias: number; presencas: number };

export function dataDeChamadaValida(data: string): boolean {
  if (!FORMATOS.dataIso.test(data)) return false;
  const convertida = new Date(`${data}${MEIA_NOITE_UTC}`);
  if (Number.isNaN(convertida.getTime())) return false;
  return convertida.toISOString().slice(0, TAMANHO_DA_DATA_ISO) === data;
}

export function dataDentroDoAnoLetivo(data: string, inicio: string, fim: string): boolean {
  return data >= inicio && data <= fim;
}
