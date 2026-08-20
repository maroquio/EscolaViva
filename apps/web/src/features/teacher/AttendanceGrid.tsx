import { Checkbox, Table as MantineTable, TextInput } from '@mantine/core';
import type { UseFormRegister } from 'react-hook-form';
import { formatDate } from '../../shared/format';
import { EXCUSE_LABEL, PRESENT_LABEL, STUDENT_LABEL } from '../../shared/labels/constants';
import { COLUMN_HEADER, ROW_HEADER } from '../../shared/ui/constants';
import { ROLL_CALL_FIELD, type IsoDay } from './constants';
import type { RollCallValues } from './schemas';

export type AttendanceRowOnScreen = {
  readonly id: string;
  readonly studentName: string;
  readonly absent: boolean;
};

export type AttendanceGridProps = {
  readonly day: IsoDay;
  readonly rows: readonly AttendanceRowOnScreen[];
  readonly register: UseFormRegister<RollCallValues>;
};

export function AttendanceGrid({ day, rows, register }: AttendanceGridProps): React.ReactElement {
  return (
    <MantineTable>
      <MantineTable.Caption>Chamada de {formatDate(day)}</MantineTable.Caption>
      <MantineTable.Thead>
        <MantineTable.Tr>
          <MantineTable.Th scope={COLUMN_HEADER}>{STUDENT_LABEL}</MantineTable.Th>
          <MantineTable.Th scope={COLUMN_HEADER}>{PRESENT_LABEL}</MantineTable.Th>
          <MantineTable.Th scope={COLUMN_HEADER}>{EXCUSE_LABEL}</MantineTable.Th>
        </MantineTable.Tr>
      </MantineTable.Thead>
      <MantineTable.Tbody>
        {rows.map((row, index) => (
          <MantineTable.Tr key={row.id}>
            <MantineTable.Th scope={ROW_HEADER}>{row.studentName}</MantineTable.Th>
            <MantineTable.Td>
              <Checkbox
                aria-label={`${row.studentName} presente`}
                {...register(ROLL_CALL_FIELD.present(index))}
              />
            </MantineTable.Td>
            <MantineTable.Td>
              <TextInput
                aria-label={`Justificativa de ${row.studentName}`}
                disabled={!row.absent}
                {...register(ROLL_CALL_FIELD.excuse(index))}
              />
            </MantineTable.Td>
          </MantineTable.Tr>
        ))}
      </MantineTable.Tbody>
    </MantineTable>
  );
}
