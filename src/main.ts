import { EVENTOS_DE_LOG_DE_IDENTIDADE, EXPURGO_DE_SESSOES, identidade } from './identity';
import { config } from './shared/config';
import { LOCK_KEYS, MINUTE_MS, PROCESS_MESSAGES, SERVER, TIME } from './shared/constants';
import { closeDatabase } from './shared/db';
import { startScheduler, type Job } from './shared/jobs';
import { logger } from './shared/log';
import { app } from './web/app';

const DESFECHO_DA_DRENAGEM = { drenou: 'drenou', expirou: 'expirou' } as const;

const expurgoDeSessoes: Job = {
  name: EXPURGO_DE_SESSOES.nome,
  lockKey: LOCK_KEYS.sessionPurge,
  intervalMs: EXPURGO_DE_SESSOES.intervaloEmMinutos * MINUTE_MS,
  async run(): Promise<void> {
    const removidas = await identidade.expurgarSessoesExpiradas();
    logger.info(
      { job: EXPURGO_DE_SESSOES.nome, removidas },
      EVENTOS_DE_LOG_DE_IDENTIDADE.sessoesExpiradasRemovidas,
    );
  },
};

const ociosidadeEmSegundos = (timeoutMs: number): number =>
  Math.min(
    Math.max(1, Math.ceil(timeoutMs / TIME.msPerSecond)),
    SERVER.maxIdleSeconds,
  );

const servidor = Bun.serve({
  port: config.port,
  idleTimeout: ociosidadeEmSegundos(config.httpTimeoutMs),
  fetch: app.fetch,
});

const agendador = startScheduler([expurgoDeSessoes]);

logger.info(
  {
    porta: servidor.port,
    ambiente: config.environment,
    ociosidade_s: ociosidadeEmSegundos(config.httpTimeoutMs),
    jobs: [expurgoDeSessoes.name],
  },
  PROCESS_MESSAGES.up,
);

async function aguardarDrenagem(drenagem: Promise<void>): Promise<void> {
  const prazo = config.httpTimeoutMs + SERVER.drainGraceMs;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const expirou = new Promise<typeof DESFECHO_DA_DRENAGEM.expirou>((resolver) => {
    temporizador = setTimeout(() => resolver(DESFECHO_DA_DRENAGEM.expirou), prazo);
  });

  try {
    const desfecho = await Promise.race([
      drenagem.then(() => DESFECHO_DA_DRENAGEM.drenou),
      expirou,
    ]);
    if (desfecho === DESFECHO_DA_DRENAGEM.drenou) return;
  } finally {
    clearTimeout(temporizador);
  }

  logger.warn(
    { pendentes: servidor.pendingRequests, prazo_ms: prazo },
    PROCESS_MESSAGES.drainTimedOut,
  );
  await servidor.stop(true);
}

let desligando = false;

async function desligar(sinal: string): Promise<void> {
  if (desligando) return;
  desligando = true;
  logger.info(
    { sinal, pendentes: servidor.pendingRequests },
    PROCESS_MESSAGES.shutdownStarted,
  );

  const drenagem = servidor.stop(false);
  agendador.stop();
  await aguardarDrenagem(drenagem);
  await closeDatabase();

  logger.info({ sinal }, PROCESS_MESSAGES.shutdownCompleted);
  process.exit(0);
}

for (const sinal of SERVER.shutdownSignals) {
  process.on(sinal, () => {
    void desligar(sinal);
  });
}
