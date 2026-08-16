import { FORMATOS } from '../constants';

export const ehIdentificador = (valor: string): boolean => FORMATOS.identificador.test(valor);
