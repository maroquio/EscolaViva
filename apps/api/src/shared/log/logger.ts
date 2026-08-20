import { pino } from 'pino';
import { config } from '../config';
import { LOG_LEVELS } from '../constants';
import { LOG } from './constants';
import { redact, type LogFields } from './redaction';

type Level = (typeof LOG_LEVELS)[number];

type Emitter = (fields: LogFields, msg: string) => void;

const root = pino({ level: config.logLevel });

let correlationSource: (() => string | undefined) | undefined;

export function registerCorrelationSource(f: () => string | undefined): void {
  correlationSource = f;
}

function emit(level: Level, fields: LogFields, msg: string): void {
  const safe = redact(fields);
  const correlationId = correlationSource?.();
  root[level](
    correlationId === undefined ? safe : { ...safe, [LOG.correlationField]: correlationId },
    msg,
  );
}

export const logger = Object.fromEntries(
  LOG_LEVELS.map((level): [Level, Emitter] => [
    level,
    (fields, msg) => {
      emit(level, fields, msg);
    },
  ]),
) as Record<Level, Emitter>;
