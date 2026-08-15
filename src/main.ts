/**
 * Boot do processo.
 *
 * A primeira linha executada é o import de `config`: ele valida o ambiente e lança se faltar
 * variável (I18). Um processo que sobe sem `DATABASE_URL` e descobre isso no meio de uma matrícula
 * é pior do que um processo que não sobe.
 *
 * Depois: servidor HTTP com prazo de ociosidade menor que o de quem estiver na frente (I14),
 * agendador com o único job do estágio, e um desligamento que drena as requisições em curso antes
 * de fechar o pool (I13).
 */

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

/**
 * Os dois desfechos possíveis da corrida da drenagem. Ficam locais de propósito: não são vocabulário
 * do produto nem de infraestrutura compartilhada — nascem e morrem dentro de `aguardarDrenagem`, e
 * só existem nomeados para que o `Promise.race` seja lido por palavra em vez de por posição.
 */
const DESFECHO_DA_DRENAGEM = { drenou: 'drenou', expirou: 'expirou' } as const;

/**
 * O único job do Estágio 01. Com uma instância o lock é redundante; com seis (E08) é o que evita
 * seis expurgos simultâneos varrendo a mesma tabela.
 */
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

/** I14: o prazo do Bun é em segundos e tem teto; o da aplicação vem em milissegundos do ambiente. */
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

/**
 * Espera as requisições em curso terminarem. Quem passar do prazo da aplicação mais a margem já
 * teria estourado o timeout do cliente de qualquer forma: aí a conexão é cortada, com registro.
 */
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

  // A ordem importa: parar de aceitar vem antes de tudo, para que a fila não cresça enquanto drena.
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
