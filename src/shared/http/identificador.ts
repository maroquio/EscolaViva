import { FORMATOS } from '../constantes';

export const ehIdentificador = (valor: string): boolean => FORMATOS.identificador.test(valor);
