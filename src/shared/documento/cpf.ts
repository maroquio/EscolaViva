/**
 * CPF: normalizar, validar, formatar e gerar.
 *
 * Módulo puro — não conhece banco, HTTP, log nem domínio. É o que permite `identidade` e
 * `academico` usarem a mesma aritmética sem que um passe a depender do outro, e o que mantém o
 * grafo do Estágio 14 extraível.
 *
 * `gerarCpf` existe para o seed e para as fixtures de teste. Não tem uso em produção: nada no
 * sistema inventa o CPF de uma pessoa.
 *
 * Os números do algoritmo ficam NESTE arquivo, e não em `constantes.ts`: pesos, módulo e cortes
 * não são política do produto — são a especificação do dígito verificador, e mudá-los não é
 * "trocar um limite", é validar outro documento. O que sai daqui é só o que a tela compartilha
 * com o resto do sistema: o travessão de valor ausente.
 */

import { AUSENTE } from '../constantes';

const SOMENTE_DIGITOS = /^[0-9]{11}$/;
const TODOS_IGUAIS = /^(\d)\1{10}$/;
const NAO_DIGITO = /\D/g;

/** Quem digitou com ponto e traço e quem digitou cru precisam chegar ao mesmo lugar. */
export const normalizarCpf = (bruto: string): string => bruto.replace(NAO_DIGITO, '');

/* --- Aritmética do dígito verificador --------------------------------------- */

/** O primeiro verificador pesa a partir de 10 sobre nove dígitos; o segundo, a partir de 11. */
const PESO_INICIAL_DO_PRIMEIRO = 10;
const PESO_INICIAL_DO_SEGUNDO = 11;

/**
 * O fator e o módulo da conta, e o resto que a especificação manda tratar como zero.
 *
 * `FATOR_DA_SOMA` e `RESTO_QUE_VIRA_ZERO` valem 10 os dois e não são a mesma decisão: um
 * multiplica a soma antes do módulo, o outro é o único resto de duas casas que `% 11` produz.
 */
const FATOR_DA_SOMA = 10;
const MODULO_DO_VERIFICADOR = 11;
const RESTO_QUE_VIRA_ZERO = 10;

/** Dígitos que entram na conta: os dois últimos do CPF são o resultado dela, não a entrada. */
const DIGITOS_DA_BASE = 9;

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
  const resto = (soma * FATOR_DA_SOMA) % MODULO_DO_VERIFICADOR;
  return resto === RESTO_QUE_VIRA_ZERO ? 0 : resto;
};

const comVerificadores = (base: string): string => {
  const primeiro = verificador(base, PESO_INICIAL_DO_PRIMEIRO);
  const segundo = verificador(`${base}${primeiro}`, PESO_INICIAL_DO_SEGUNDO);
  return `${base}${primeiro}${segundo}`;
};

/**
 * Sequência repetida é recusada à parte porque **passa** na aritmética: `111.111.111-11` fecha os
 * dois verificadores. É o preenchimento mais comum de formulário respondido de qualquer jeito.
 */
export function cpfValido(digitos: string): boolean {
  if (!SOMENTE_DIGITOS.test(digitos)) return false;
  if (TODOS_IGUAIS.test(digitos)) return false;
  return digitos === comVerificadores(digitos.slice(0, DIGITOS_DA_BASE));
}

/* --- Máscara de exibição ----------------------------------------------------- */

/**
 * Onde a máscara `000.000.000-00` corta. `CORTE_DO_TRACO` vale o mesmo que `DIGITOS_DA_BASE` e é
 * outra decisão: uma é o recorte que a conta usa, a outra é onde a pontuação entra na tela.
 */
const CORTE_DO_PRIMEIRO_PONTO = 3;
const CORTE_DO_SEGUNDO_PONTO = 6;
const CORTE_DO_TRACO = 9;

/** `52998224725` vira `529.982.247-25`; o que não for CPF devolve travessão. */
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

/* --- Geração determinística (seed e fixtures) -------------------------------- */

/**
 * Prefixo fixo de dois dígitos diferentes entre si: a base nunca sai uniforme, então não há caso
 * a pular — e pular casos é justamente o que faria duas sementes caírem no mesmo CPF.
 */
const PREFIXO_DA_BASE = '10';
const DIGITOS_DA_SEMENTE = 7;
const FAIXA = 10 ** DIGITOS_DA_SEMENTE;
/** Preenchimento à esquerda da semente: a base precisa ter sempre nove dígitos. */
const PREENCHIMENTO_DA_SEMENTE = '0';

/** CPF válido e determinístico a partir de uma semente. Injetivo para semente em [0, 10.000.000). */
export function gerarCpf(semente: number): string {
  const resto = String(Math.abs(Math.trunc(semente)) % FAIXA).padStart(
    DIGITOS_DA_SEMENTE,
    PREENCHIMENTO_DA_SEMENTE,
  );
  return comVerificadores(`${PREFIXO_DA_BASE}${resto}`);
}
