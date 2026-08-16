export type AcademicYear = {
  id: string;
  networkId: string;
  year: number;
  startDate: string;
  endDate: string;
};

export function isCoherentPeriod(startDate: string, endDate: string): boolean {
  return endDate > startDate;
}
