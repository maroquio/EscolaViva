import { Button, Group, Text } from '@mantine/core';
import { formatDate } from '../../shared/format';
import { SECONDARY_BUTTON } from '../../shared/ui/constants';
import type { IsoDay } from './constants';

const START_OF_THE_DAY_IN_UTC = 'T00:00:00Z';
const ISO_DAY_LENGTH = 'YYYY-MM-DD'.length;
const ONE_DAY_IN_MILLISECONDS = 86_400_000;
const DAY_BEFORE = -1;
const DAY_AFTER = 1;

const dayAwayFrom = (day: IsoDay, days: number): IsoDay => {
  const moved = new Date(`${day}${START_OF_THE_DAY_IN_UTC}`);
  moved.setTime(moved.getTime() + days * ONE_DAY_IN_MILLISECONDS);
  return moved.toISOString().slice(0, ISO_DAY_LENGTH);
};

const previousDay = (day: IsoDay): IsoDay => dayAwayFrom(day, DAY_BEFORE);
const nextDay = (day: IsoDay): IsoDay => dayAwayFrom(day, DAY_AFTER);

export type DayStepperProps = {
  readonly day: IsoDay;
  readonly onDayChosen: (day: IsoDay) => void;
};

export function DayStepper({ day, onDayChosen }: DayStepperProps): React.ReactElement {
  return (
    <Group>
      <Button variant={SECONDARY_BUTTON} size="xs" onClick={() => onDayChosen(previousDay(day))}>
        Dia anterior
      </Button>
      <Text fw={700}>{formatDate(day)}</Text>
      <Button variant={SECONDARY_BUTTON} size="xs" onClick={() => onDayChosen(nextDay(day))}>
        Próximo dia
      </Button>
    </Group>
  );
}
