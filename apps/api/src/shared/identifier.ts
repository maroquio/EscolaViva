import { FORMATS } from './constants';

export const isUuid = (value: string): boolean => FORMATS.uuid.test(value);
