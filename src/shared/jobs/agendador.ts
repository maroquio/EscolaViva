import { MENSAGENS_DE_PROCESSO } from '../constantes';
import { logger } from '../log';
import { comLockExclusivo } from './lock';

export type Job = {
  nome: string;
  chaveDeLock: number;
  intervaloMs: number;
  executar(): Promise<void>;
};

export function iniciarAgendador(jobs: Job[]): { parar(): void } {
  const temporizadores = jobs.map((job) => {
    const temporizador = setInterval(() => {
      void executarJob(job);
    }, job.intervaloMs);
    temporizador.unref();
    return temporizador;
  });

  return {
    parar(): void {
      for (const temporizador of temporizadores) clearInterval(temporizador);
    },
  };
}

async function executarJob(job: Job): Promise<void> {
  try {
    const resultado = await comLockExclusivo(job.chaveDeLock, () => job.executar());
    if (resultado === null) {
      logger.debug({ job: job.nome }, MENSAGENS_DE_PROCESSO.jobIgnorado);
    }
  } catch (erro) {
    logger.error({ job: job.nome, erro: descrever(erro) }, MENSAGENS_DE_PROCESSO.jobFalhou);
  }
}

function descrever(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
