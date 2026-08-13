import { pino } from 'pino';
import { config } from '../config';
import { redigir, type CamposDeLog } from './redacao';

type Nivel = 'debug' | 'info' | 'warn' | 'error';

// JSON direto no stdout: sem transport e sem arquivo, porque a aplicação não escreve em disco.
const raiz = pino({ level: config.logLevel });

/**
 * I16: o correlacao_id nasce na borda HTTP, mas `shared/log` não pode importar `shared/http` —
 * seria ciclo de import, já que o http loga. A camada http registra sua fonte no boot e o
 * logger apenas consulta.
 */
let fonteDeCorrelacao: (() => string | undefined) | undefined;

export function registrarFonteDeCorrelacao(f: () => string | undefined): void {
  fonteDeCorrelacao = f;
}

function emitir(nivel: Nivel, campos: CamposDeLog, msg: string): void {
  const seguros = redigir(campos);
  const correlacaoId = fonteDeCorrelacao?.();
  raiz[nivel](
    correlacaoId === undefined ? seguros : { ...seguros, correlacao_id: correlacaoId },
    msg,
  );
}

export const logger = {
  debug(campos: CamposDeLog, msg: string): void {
    emitir('debug', campos, msg);
  },
  info(campos: CamposDeLog, msg: string): void {
    emitir('info', campos, msg);
  },
  warn(campos: CamposDeLog, msg: string): void {
    emitir('warn', campos, msg);
  },
  error(campos: CamposDeLog, msg: string): void {
    emitir('error', campos, msg);
  },
};
