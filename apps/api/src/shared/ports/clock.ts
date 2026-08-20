import { ISO_DATE_FORMAT, TIME_ZONE } from './constants';

export interface Clock {
  now(): Date;
  today(): string;
}

const calendarDay = new Intl.DateTimeFormat(ISO_DATE_FORMAT.locale, {
  timeZone: TIME_ZONE,
  ...ISO_DATE_FORMAT.parts,
});

export const dayOf = (instant: Date): string => calendarDay.format(instant);

export const systemClock: Clock = {
  now: () => new Date(),
  today: () => dayOf(new Date()),
};
