import { FORMATS } from '../constants';

export const isUuid = (value: string): boolean => FORMATS.identifier.test(value);
