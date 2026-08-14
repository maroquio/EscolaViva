/**
 * CPF: normalizar, validar, formatar e gerar.
 *
 * Módulo puro — não conhece banco, HTTP, log nem domínio. É o que permite `identidade` e
 * `academico` usarem a mesma aritmética sem que um passe a depender do outro, e o que mantém o
 * grafo do Estágio 14 extraível.
 *
 * `gerarCpf` existe para o seed e para as fixtures de teste. Não tem uso em produção: nada no
 * sistema inventa o CPF de uma pessoa.
 */

const SOMENTE_DIGITOS = /^[0-9]{11}$/;
const TODOS_IGUAIS = /^(\d)\1{10}$/;
const NAO_DIGITO = /\D/g;

/** O mesmo travessão que `formatarData` e `formatarNota` usam para valor ausente. */
const AUSENTE = '—';

/** Quem digitou com ponto e traço e quem digitou cru precisam chegar ao mesmo lugar. */
export const normalizarCpf = (bruto: string): string => bruto.replace(NAO_DIGITO, '');

/**
 * Cada verificador é a soma dos dígitos por pesos decrescentes, vezes dez, módulo onze — e resto
 * dez vira zero. O primeiro pesa a partir de 10 sobre nove dígitos; o segundo, a partir de 11
 * sobre dez.
 */
const verificador = (digitos: string, pesoInicial: number): number => {
  let soma = 0;
  for (let indice = 0; indice < digitos.length; indice += 1) {
    soma += Number(digitos[indice]) * (pesoInicial - indice);
  }
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
};

const comVerificadores = (base: string): string => {
  const primeiro = verificador(base, 10);
  const segundo = verificador(`${base}${primeiro}`, 11);
  return `${base}${primeiro}${segundo}`;
};

/**
 * Sequência repetida é recusada à parte porque **passa** na aritmética: `111.111.111-11` fecha os
 * dois verificadores. É o preenchimento mais comum de formulário respondido de qualquer jeito.
 */
export function cpfValido(digitos: string): boolean {
  if (!SOMENTE_DIGITOS.test(digitos)) return false;
  if (TODOS_IGUAIS.test(digitos)) return false;
  return digitos === comVerificadores(digitos.slice(0, 9));
}

/** `52998224725` vira `529.982.247-25`; o que não for CPF devolve travessão. */
export function formatarCpf(digitos: string): string {
  if (!SOMENTE_DIGITOS.test(digitos)) return AUSENTE;
  const [a, b, c, d] = [
    digitos.slice(0, 3),
    digitos.slice(3, 6),
    digitos.slice(6, 9),
    digitos.slice(9),
  ];
  return `${a}.${b}.${c}-${d}`;
}

/**
 * Prefixo fixo de dois dígitos diferentes entre si: a base nunca sai uniforme, então não há caso
 * a pular — e pular casos é justamente o que faria duas sementes caírem no mesmo CPF.
 */
const PREFIXO_DA_BASE = '10';
const DIGITOS_DA_SEMENTE = 7;
const FAIXA = 10 ** DIGITOS_DA_SEMENTE;

/** CPF válido e determinístico a partir de uma semente. Injetivo para semente em [0, 10.000.000). */
export function gerarCpf(semente: number): string {
  const resto = String(Math.abs(Math.trunc(semente)) % FAIXA).padStart(DIGITOS_DA_SEMENTE, '0');
  return comVerificadores(`${PREFIXO_DA_BASE}${resto}`);
}
