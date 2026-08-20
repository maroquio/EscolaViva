import { Table as MantineTable } from '@mantine/core';
import type { ReactNode } from 'react';
import { COLUMN_HEADER } from './constants';

export type ColumnAlignment = 'left' | 'right';

const WHERE_THE_READER_EXPECTS_IT: ColumnAlignment = 'left';

export type Column<Row> = {
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
  readonly align?: ColumnAlignment;
};

export type TableProps<Row> = {
  readonly caption: string;
  readonly columns: readonly Column<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
};

function alignmentOf<Row>(column: Column<Row>): ColumnAlignment {
  return column.align ?? WHERE_THE_READER_EXPECTS_IT;
}

export function Table<Row>({ caption, columns, rows, rowKey }: TableProps<Row>): React.ReactElement {
  return (
    <MantineTable>
      <MantineTable.Caption>{caption}</MantineTable.Caption>
      <MantineTable.Thead>
        <MantineTable.Tr>
          {columns.map((column) => (
            <MantineTable.Th key={column.header} ta={alignmentOf(column)} scope={COLUMN_HEADER}>
              {column.header}
            </MantineTable.Th>
          ))}
        </MantineTable.Tr>
      </MantineTable.Thead>
      <MantineTable.Tbody>
        {rows.map((row) => (
          <MantineTable.Tr key={rowKey(row)}>
            {columns.map((column) => (
              <MantineTable.Td key={column.header} ta={alignmentOf(column)}>
                {column.cell(row)}
              </MantineTable.Td>
            ))}
          </MantineTable.Tr>
        ))}
      </MantineTable.Tbody>
    </MantineTable>
  );
}
