import { FORMATS, ISO_DATE_LENGTH } from '../../shared/constants';
import { MEIA_NOITE_UTC } from '../constants';

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
  if (!FORMATS.isoDate.test(data)) return false;
  const convertida = new Date(`${data}${MEIA_NOITE_UTC}`);
  if (Number.isNaN(convertida.getTime())) return false;
  return convertida.toISOString().slice(0, ISO_DATE_LENGTH) === data;
}

export function dataDentroDoAnoLetivo(data: string, inicio: string, fim: string): boolean {
  return data >= inicio && data <= fim;
}
