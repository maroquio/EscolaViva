import { Table as MantineTable } from '@mantine/core';
import type { ReportCardAsJson } from '@escolaviva/contracts/guardian';
import { formatGrade } from '../../shared/format';
import { SUBJECT_LABEL } from '../../shared/labels/constants';
import { COLUMN_HEADER, NUMBERS_RIGHT, ROW_HEADER } from '../../shared/ui/constants';

export type GradesTableProps = {
  readonly reportCard: ReportCardAsJson;
  readonly terms: readonly number[];
};

export function GradesTable({ reportCard, terms }: GradesTableProps): React.ReactElement {
  return (
    <MantineTable>
      <MantineTable.Caption>
        Notas por disciplina e bimestre — {reportCard.studentName}
      </MantineTable.Caption>
      <MantineTable.Thead>
        <MantineTable.Tr>
          <MantineTable.Th scope={COLUMN_HEADER}>{SUBJECT_LABEL}</MantineTable.Th>
          {terms.map((term) => (
            <MantineTable.Th key={term} scope={COLUMN_HEADER} ta={NUMBERS_RIGHT}>
              {term}º bim.
            </MantineTable.Th>
          ))}
          <MantineTable.Th scope={COLUMN_HEADER} ta={NUMBERS_RIGHT}>
            Média
          </MantineTable.Th>
        </MantineTable.Tr>
      </MantineTable.Thead>
      <MantineTable.Tbody>
        {reportCard.rows.map((row) => (
          <MantineTable.Tr key={row.subjectName}>
            <MantineTable.Th scope={ROW_HEADER}>{row.subjectName}</MantineTable.Th>
            {row.grades.map((grade, index) => (
              <MantineTable.Td key={terms[index] ?? index} ta={NUMBERS_RIGHT}>
                {formatGrade(grade)}
              </MantineTable.Td>
            ))}
            <MantineTable.Td ta={NUMBERS_RIGHT} fw={700}>
              {formatGrade(row.average)}
            </MantineTable.Td>
          </MantineTable.Tr>
        ))}
      </MantineTable.Tbody>
      <MantineTable.Tfoot>
        <MantineTable.Tr>
          <MantineTable.Th scope={ROW_HEADER}>Média do bimestre</MantineTable.Th>
          {reportCard.termAverages.map((average, index) => (
            <MantineTable.Td key={terms[index] ?? index} ta={NUMBERS_RIGHT}>
              {formatGrade(average)}
            </MantineTable.Td>
          ))}
          <MantineTable.Td ta={NUMBERS_RIGHT} fw={700}>
            {formatGrade(reportCard.overallAverage)}
          </MantineTable.Td>
        </MantineTable.Tr>
      </MantineTable.Tfoot>
    </MantineTable>
  );
}
