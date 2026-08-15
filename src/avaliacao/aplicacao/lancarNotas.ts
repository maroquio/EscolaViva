import { z } from 'zod';
import { academico } from '../../academico';
import { unidadeDeTrabalho, type UnidadeDeTrabalho } from '../../shared/db';
import {
  errosDeSchema,
  falha,
  falhaDeCampo,
  sucesso,
  type Resultado,
} from '../../shared/resultado';
import { CAMPOS, CODIGOS, MENSAGENS } from '../constantes';
import { bimestreValido, valorDeNotaValido } from '../dominio/nota';
import * as fechamentoRepositorio from '../infra/fechamentoRepositorio';
import * as notaRepositorio from '../infra/notaRepositorio';

export type LancamentoDeNotas = {
  redeId: string;
  turmaDisciplinaId: string;
  bimestre: number;
  lancadaPor: string;
  notas: { matriculaId: string; valor: number | null }[];
};

type NotaEnviada = { matriculaId: string; valor: number | null };

const esquema = z.object({
  redeId: z.string().uuid(),
  turmaDisciplinaId: z.string().uuid(),
  bimestre: z.number().refine(bimestreValido, MENSAGENS.bimestreInvalido),
  lancadaPor: z.string().uuid(),
  notas: z
    .array(
      z.object({
        matriculaId: z.string().uuid(),
        valor: z
          .number()
          .nullable()
          .refine(
            (valor) => valor === null || valorDeNotaValido(valor),
            MENSAGENS.notaForaDaEscala,
          ),
      }),
    )
    .min(1, MENSAGENS.loteDeNotasVazio),
});

export async function lancarNotas(entrada: LancamentoDeNotas): Promise<Resultado<number>> {
  const validada = esquema.safeParse(entrada);
  if (!validada.success) return falha(...errosDeSchema(validada.error.issues));
  const { redeId, turmaDisciplinaId, bimestre, lancadaPor, notas } = validada.data;

  const turmaDisciplina = await academico.turmaDisciplinaPorId(redeId, turmaDisciplinaId);
  if (turmaDisciplina === null) {
    return falhaDeCampo(
      CAMPOS.turmaDisciplinaId,
      CODIGOS.turmaDisciplinaNaoEncontrada,
      MENSAGENS.turmaDisciplinaNaoEncontrada,
    );
  }

  const recusa = await conferirMatriculas(redeId, turmaDisciplina.turmaId, notas);
  if (recusa !== null) return recusa;

  return await unidadeDeTrabalho<Resultado<number>>(async (uow) => {
    const fechado = await fechamentoRepositorio.estaFechado(
      uow.sql,
      redeId,
      turmaDisciplina.turmaId,
      bimestre,
    );
    if (fechado) {
      return falhaDeCampo(
        CAMPOS.bimestre,
        CODIGOS.bimestreFechado,
        MENSAGENS.bimestreFechadoParaLancamento,
      );
    }
    return sucesso(
      await gravarLote(uow, { redeId, turmaDisciplinaId, bimestre, lancadaPor, notas }),
    );
  });
}

async function conferirMatriculas(
  redeId: string,
  turmaId: string,
  notas: readonly { matriculaId: string }[],
): Promise<Resultado<number> | null> {
  const matriculas = await academico.matriculasAtivasDaTurma(redeId, turmaId);
  const daTurma = new Set(matriculas.map((matricula) => matricula.id));
  const enviadas = notas.map((nota) => nota.matriculaId);
  if (enviadas.some((matriculaId) => !daTurma.has(matriculaId))) {
    return falhaDeCampo(
      CAMPOS.notas,
      CODIGOS.notas.matriculaForaDaTurma,
      MENSAGENS.notas.matriculaForaDaTurma,
    );
  }
  if (new Set(enviadas).size !== enviadas.length) {
    return falhaDeCampo(
      CAMPOS.notas,
      CODIGOS.notas.matriculaRepetida,
      MENSAGENS.notas.matriculaRepetida,
    );
  }
  return null;
}

async function gravarLote(
  { sql }: UnidadeDeTrabalho,
  lancamento: {
    redeId: string;
    turmaDisciplinaId: string;
    bimestre: number;
    lancadaPor: string;
    notas: readonly NotaEnviada[];
  },
): Promise<number> {
  const { redeId, turmaDisciplinaId, bimestre, lancadaPor, notas } = lancamento;
  const paraApagar = notas.filter((nota) => nota.valor === null).map((nota) => nota.matriculaId);
  if (paraApagar.length > 0) {
    await notaRepositorio.apagarEmLote(sql, redeId, turmaDisciplinaId, bimestre, paraApagar);
  }

  const paraGravar = notas.filter(
    (nota): nota is { matriculaId: string; valor: number } => nota.valor !== null,
  );
  if (paraGravar.length === 0) return 0;
  return await notaRepositorio.gravarEmLote(sql, {
    redeId,
    turmaDisciplinaId,
    bimestre,
    lancadaPor,
    notas: paraGravar,
  });
}
