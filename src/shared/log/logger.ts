import { pino } from 'pino';
import { config } from '../config';
import { LOG, NIVEIS_DE_LOG } from '../constantes';
import { redigir, type CamposDeLog } from './redacao';

type Nivel = (typeof NIVEIS_DE_LOG)[number];

type Emissor = (campos: CamposDeLog, msg: string) => void;

const raiz = pino({ level: config.logLevel });

let fonteDeCorrelacao: (() => string | undefined) | undefined;

export function registrarFonteDeCorrelacao(f: () => string | undefined): void {
  fonteDeCorrelacao = f;
}

function emitir(nivel: Nivel, campos: CamposDeLog, msg: string): void {
  const seguros = redigir(campos);
  const correlacaoId = fonteDeCorrelacao?.();
  raiz[nivel](
    correlacaoId === undefined ? seguros : { ...seguros, [LOG.campoDeCorrelacao]: correlacaoId },
    msg,
  );
}

export const logger = Object.fromEntries(
  NIVEIS_DE_LOG.map((nivel): [Nivel, Emissor] => [
    nivel,
    (campos, msg) => {
      emitir(nivel, campos, msg);
    },
  ]),
) as Record<Nivel, Emissor>;
