import { Table as MantineTable, TextInput } from '@mantine/core';
import { STUDENT_LABEL } from '../../shared/labels/constants';
import { COLUMN_HEADER, ROW_HEADER } from '../../shared/ui/constants';
import { termInWords } from './constants';
import { asTyped, type GradeAsTyped } from './grade';

const GRADE_FIELD_WIDTH = '7rem';

export type GradeRowOnScreen = {
  readonly id: string;
  readonly studentName: string;
  readonly value: GradeAsTyped;
  readonly error: string | undefined;
};

export type GradeGridProps = {
  readonly rows: readonly GradeRowOnScreen[];
  readonly subjectName: string;
  readonly term: number;
  readonly readOnly: boolean;
  readonly onGradeTyped: (index: number, typed: string) => void;
};

export function GradeGrid({
  rows,
  subjectName,
  term,
  readOnly,
  onGradeTyped,
}: GradeGridProps): React.ReactElement {
  return (
    <MantineTable>
      <MantineTable.Caption>
        Notas do {termInWords(term)} — {subjectName}
      </MantineTable.Caption>
      <MantineTable.Thead>
        <MantineTable.Tr>
          <MantineTable.Th scope={COLUMN_HEADER}>{STUDENT_LABEL}</MantineTable.Th>
          <MantineTable.Th scope={COLUMN_HEADER}>Nota</MantineTable.Th>
        </MantineTable.Tr>
      </MantineTable.Thead>
      <MantineTable.Tbody>
        {rows.map((row, index) => (
          <MantineTable.Tr key={row.id}>
            <MantineTable.Th scope={ROW_HEADER}>{row.studentName}</MantineTable.Th>
            <MantineTable.Td>
              <TextInput
                aria-label={`Nota de ${row.studentName}`}
                defaultValue={asTyped(row.value)}
                disabled={readOnly}
                inputMode="decimal"
                maw={GRADE_FIELD_WIDTH}
                error={row.error}
                onChange={(event) => onGradeTyped(index, event.currentTarget.value)}
              />
            </MantineTable.Td>
          </MantineTable.Tr>
        ))}
      </MantineTable.Tbody>
    </MantineTable>
  );
}
