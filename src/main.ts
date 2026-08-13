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

import { identidade } from './identidade';
import { config } from './shared/config';
import { encerrar } from './shared/db';
import { iniciarAgendador, type Job } from './shared/jobs';
import { logger } from './shared/log';
import { app } from './web/app';

const MILISSEGUNDOS_POR_SEGUNDO = 1000;
const MINUTO_MS = 60 * MILISSEGUNDOS_POR_SEGUNDO;
/** Teto do `idleTimeout` do Bun.serve, em segundos. */
const OCIOSIDADE_MAXIMA_S = 255;
/** Folga sobre o prazo da aplicação antes de cortar conexões que não terminaram. */
const MARGEM_DE_DRENAGEM_MS = 5000;

const INTERVALO_DO_EXPURGO_MS = 15 * MINUTO_MS;
const CHAVE_DE_LOCK_DO_EXPURGO = 1001;

/**
 * O único job do Estágio 01. Com uma instância o lock é redundante; com seis (E08) é o que evita
 * seis expurgos simultâneos varrendo a mesma tabela.
 */
const expurgoDeSessoes: Job = {
  nome: 'expurgo-de-sessoes',
  chaveDeLock: CHAVE_DE_LOCK_DO_EXPURGO,
  intervaloMs: INTERVALO_DO_EXPURGO_MS,
  async executar(): Promise<void> {
    const removidas = await identidade.expurgarSessoesExpiradas();
    logger.info({ job: 'expurgo-de-sessoes', removidas }, 'sessões expiradas removidas');
  },
};

/** I14: o prazo do Bun é em segundos e tem teto; o da aplicação vem em milissegundos do ambiente. */
const ociosidadeEmSegundos = (timeoutMs: number): number =>
  Math.min(Math.max(1, Math.ceil(timeoutMs / MILISSEGUNDOS_POR_SEGUNDO)), OCIOSIDADE_MAXIMA_S);

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
  'escolaviva no ar',
);

/**
 * Espera as requisições em curso terminarem. Quem passar do prazo da aplicação mais a margem já
 * teria estourado o timeout do cliente de qualquer forma: aí a conexão é cortada, com registro.
 */
async function aguardarDrenagem(drenagem: Promise<void>): Promise<void> {
  const prazo = config.httpTimeoutMs + MARGEM_DE_DRENAGEM_MS;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const expirou = new Promise<'expirou'>((resolver) => {
    temporizador = setTimeout(() => resolver('expirou'), prazo);
  });

  try {
    const desfecho = await Promise.race([drenagem.then(() => 'drenou' as const), expirou]);
    if (desfecho === 'drenou') return;
  } finally {
    clearTimeout(temporizador);
  }

  logger.warn(
    { pendentes: servidor.pendingRequests, prazo_ms: prazo },
    'prazo de drenagem esgotado: encerrando conexões em curso',
  );
  await servidor.stop(true);
}

let desligando = false;

async function desligar(sinal: string): Promise<void> {
  if (desligando) return;
  desligando = true;
  logger.info({ sinal, pendentes: servidor.pendingRequests }, 'desligamento iniciado');

  // A ordem importa: parar de aceitar vem antes de tudo, para que a fila não cresça enquanto drena.
  const drenagem = servidor.stop(false);
  agendador.parar();
  await aguardarDrenagem(drenagem);
  await encerrar();

  logger.info({ sinal }, 'desligamento concluído');
  process.exit(0);
}

for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sinal, () => {
    void desligar(sinal);
  });
}
