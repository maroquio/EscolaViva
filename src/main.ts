import { EVENTOS_DE_LOG_DE_IDENTIDADE, EXPURGO_DE_SESSOES, identidade } from './identidade';
import { config } from './shared/config';
import {
  CHAVES_DE_LOCK,
  MENSAGENS_DE_PROCESSO,
  MINUTO_MS,
  SERVIDOR,
  TEMPO,
} from './shared/constantes';
import { encerrar } from './shared/db';
import { iniciarAgendador, type Job } from './shared/jobs';
import { logger } from './shared/log';
import { app } from './web/app';

const DESFECHO_DA_DRENAGEM = { drenou: 'drenou', expirou: 'expirou' } as const;

const expurgoDeSessoes: Job = {
  nome: EXPURGO_DE_SESSOES.nome,
  chaveDeLock: CHAVES_DE_LOCK.expurgoDeSessoes,
  intervaloMs: EXPURGO_DE_SESSOES.intervaloEmMinutos * MINUTO_MS,
  async executar(): Promise<void> {
    const removidas = await identidade.expurgarSessoesExpiradas();
    logger.info(
      { job: EXPURGO_DE_SESSOES.nome, removidas },
      EVENTOS_DE_LOG_DE_IDENTIDADE.sessoesExpiradasRemovidas,
    );
  },
};

const ociosidadeEmSegundos = (timeoutMs: number): number =>
  Math.min(
    Math.max(1, Math.ceil(timeoutMs / TEMPO.msPorSegundo)),
    SERVIDOR.ociosidadeMaximaSegundos,
  );

const servidor = Bun.serve({
  port: config.porta,
  idleTimeout: ociosidadeEmSegundos(config.httpTimeoutMs),
  fetch: app.fetch,
});

const agendador = iniciarAgendador([expurgoDeSessoes]);

logger.info(
  {
    porta: servidor.port,
    ambiente: config.ambiente,
    ociosidade_s: ociosidadeEmSegundos(config.httpTimeoutMs),
    jobs: [expurgoDeSessoes.nome],
  },
  MENSAGENS_DE_PROCESSO.noAr,
);

async function aguardarDrenagem(drenagem: Promise<void>): Promise<void> {
  const prazo = config.httpTimeoutMs + SERVIDOR.margemDeDrenagemMs;
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
    MENSAGENS_DE_PROCESSO.drenagemEsgotada,
  );
  await servidor.stop(true);
}

let desligando = false;

async function desligar(sinal: string): Promise<void> {
  if (desligando) return;
  desligando = true;
  logger.info(
    { sinal, pendentes: servidor.pendingRequests },
    MENSAGENS_DE_PROCESSO.desligamentoIniciado,
  );

  const drenagem = servidor.stop(false);
  agendador.parar();
  await aguardarDrenagem(drenagem);
  await encerrar();

  logger.info({ sinal }, MENSAGENS_DE_PROCESSO.desligamentoConcluido);
  process.exit(0);
}

for (const sinal of SERVIDOR.sinaisDeDesligamento) {
  process.on(sinal, () => {
    void desligar(sinal);
  });
}
