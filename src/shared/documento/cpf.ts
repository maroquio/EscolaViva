import { AUSENTE } from '../constantes';

const SOMENTE_DIGITOS = /^[0-9]{11}$/;
const TODOS_IGUAIS = /^(\d)\1{10}$/;
const NAO_DIGITO = /\D/g;

export const normalizarCpf = (bruto: string): string => bruto.replace(NAO_DIGITO, '');

const PESO_INICIAL_DO_PRIMEIRO = 10;
const PESO_INICIAL_DO_SEGUNDO = 11;

const FATOR_DA_SOMA = 10;
const MODULO_DO_VERIFICADOR = 11;
const RESTO_QUE_VIRA_ZERO = 10;

const DIGITOS_DA_BASE = 9;

const verificador = (digitos: string, pesoInicial: number): number => {
  let soma = 0;
  for (let indice = 0; indice < digitos.length; indice += 1) {
    soma += Number(digitos[indice]) * (pesoInicial - indice);
  }
  const resto = (soma * FATOR_DA_SOMA) % MODULO_DO_VERIFICADOR;
  return resto === RESTO_QUE_VIRA_ZERO ? 0 : resto;
};

const comVerificadores = (base: string): string => {
  const primeiro = verificador(base, PESO_INICIAL_DO_PRIMEIRO);
  const segundo = verificador(`${base}${primeiro}`, PESO_INICIAL_DO_SEGUNDO);
  return `${base}${primeiro}${segundo}`;
};

export function cpfValido(digitos: string): boolean {
  if (!SOMENTE_DIGITOS.test(digitos)) return false;
  if (TODOS_IGUAIS.test(digitos)) return false;
  return digitos === comVerificadores(digitos.slice(0, DIGITOS_DA_BASE));
}

const CORTE_DO_PRIMEIRO_PONTO = 3;
const CORTE_DO_SEGUNDO_PONTO = 6;
const CORTE_DO_TRACO = 9;

export function formatarCpf(digitos: string): string {
  if (!SOMENTE_DIGITOS.test(digitos)) return AUSENTE;
  const [a, b, c, d] = [
    digitos.slice(0, CORTE_DO_PRIMEIRO_PONTO),
    digitos.slice(CORTE_DO_PRIMEIRO_PONTO, CORTE_DO_SEGUNDO_PONTO),
    digitos.slice(CORTE_DO_SEGUNDO_PONTO, CORTE_DO_TRACO),
    digitos.slice(CORTE_DO_TRACO),
  ];
  return `${a}.${b}.${c}-${d}`;
}

const PREFIXO_DA_BASE = '10';
const DIGITOS_DA_SEMENTE = 7;
const FAIXA = 10 ** DIGITOS_DA_SEMENTE;
const PREENCHIMENTO_DA_SEMENTE = '0';

export function gerarCpf(semente: number): string {
  const resto = String(Math.abs(Math.trunc(semente)) % FAIXA).padStart(
    DIGITOS_DA_SEMENTE,
    PREENCHIMENTO_DA_SEMENTE,
  );
  return comVerificadores(`${PREFIXO_DA_BASE}${resto}`);
}
