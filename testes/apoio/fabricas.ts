/*
 * Cenários mínimos e componíveis. Cada fábrica escreve direto no banco, respeitando as mesmas
 * constraints da aplicação, e devolve o que criou com os ids. Escrever pelo INSERT em vez de pelo
 * caso de uso é deliberado: o teste de `matricular` não pode depender de `matricular`.
 */

import type { SituacaoMatricula } from '../../src/academico';
import type { Papel } from '../../src/identidade';
import { sqlDeTeste } from './banco';

export type StatusDeRede = 'ativa' | 'suspensa' | 'cancelada';
export type Turno = 'matutino' | 'vespertino' | 'noturno' | 'integral';
export type PapelEmUnidade = { unidadeId: string; papel: Papel };

/** A senha de todo usuário de teste. Dez caracteres: é o mínimo que o domínio aceita. */
export const SENHA_PADRAO = 'teste-1234';
export const ANO_PADRAO = 2026;
const DOMINIO = 'escolaviva.test';
const DURACAO_DA_SESSAO_HORAS = 12;
const HORA_EM_MS = 3_600_000;
const novoId = (): string => crypto.randomUUID();

/** Nome, e-mail e slug esbarram em índice único real: um contador que nunca reinicia resolve. */
let sequencia = 0;
const proximo = (): number => (sequencia += 1);

const emSnake = (chave: string): string => chave.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);

/**
 * Grava o registro e o devolve. As chaves do objeto viram as colunas — `redeId` é `rede_id` —,
 * então cada fábrica descreve o que criou uma vez só, e não em camelCase e em snake_case.
 */
async function gravar<T extends object>(tabela: string, registro: T): Promise<T> {
  const linha = Object.fromEntries(Object.entries(registro).map(([c, v]) => [emSnake(c), v]));
  const sql = sqlDeTeste();
  await sql`INSERT INTO ${sql(tabela)} ${sql(linha)}`;
  return registro;
}

/** Argon2id custa ~100 ms: sem esta memória um cenário gastaria isso quatro vezes pela mesma senha. */
const hashPorSenha = new Map<string, Promise<string>>();

function hashDeSenha(senha: string): Promise<string> {
  const conhecido = hashPorSenha.get(senha);
  if (conhecido !== undefined) return conhecido;
  const novo = Bun.password.hash(senha);
  hashPorSenha.set(senha, novo);
  return novo;
}

export type RedeDeTeste = { id: string; nome: string; slug: string; status: StatusDeRede };

export async function criarRede(opcoes: {
  nome?: string | undefined; slug?: string | undefined; status?: StatusDeRede | undefined;
} = {}): Promise<RedeDeTeste> {
  const numero = proximo();
  return await gravar('rede', {
    id: novoId(), nome: opcoes.nome ?? `Rede de Teste ${numero}`,
    slug: opcoes.slug ?? `rede-teste-${numero}`, status: opcoes.status ?? 'ativa',
  });
}

export type UnidadeDeTeste = {
  id: string; redeId: string; nome: string; codigoInep: string | null; ativa: boolean;
};

export async function criarUnidade(opcoes: {
  redeId: string; nome?: string | undefined;
  codigoInep?: string | null | undefined; ativa?: boolean | undefined;
}): Promise<UnidadeDeTeste> {
  return await gravar('unidade', {
    id: novoId(), redeId: opcoes.redeId, nome: opcoes.nome ?? `Unidade de Teste ${proximo()}`,
    codigoInep: opcoes.codigoInep ?? null, ativa: opcoes.ativa ?? true,
  });
}

export type UsuarioDeTeste = {
  id: string; redeId: string; nome: string; email: string;
  /** A senha em claro, para o teste conseguir autenticar depois. */
  senha: string;
  ativo: boolean; responsavelId: string | null; papeis: PapelEmUnidade[];
};

export async function criarUsuario(opcoes: {
  redeId: string; nome?: string | undefined; email?: string | undefined; senha?: string | undefined;
  ativo?: boolean | undefined; responsavelId?: string | null | undefined;
  papeis?: PapelEmUnidade[] | undefined;
}): Promise<UsuarioDeTeste> {
  const numero = proximo();
  const usuario: UsuarioDeTeste = {
    id: novoId(), redeId: opcoes.redeId, nome: opcoes.nome ?? `Pessoa de Teste ${numero}`,
    email: opcoes.email ?? `usuario${numero}@${DOMINIO}`, senha: opcoes.senha ?? SENHA_PADRAO,
    ativo: opcoes.ativo ?? true, responsavelId: opcoes.responsavelId ?? null, papeis: opcoes.papeis ?? [],
  };

  // `senha` e `papeis` não são colunas de `usuario`: a primeira vira hash, os segundos viram linhas.
  const { senha, papeis, ...colunas } = usuario;
  await gravar('usuario', { ...colunas, senhaHash: await hashDeSenha(senha) });
  for (const { unidadeId, papel } of papeis) {
    await gravar('papel_usuario', { redeId: usuario.redeId, usuarioId: usuario.id, unidadeId, papel });
  }
  return usuario;
}

export type SessaoDeTeste = {
  id: string; redeId: string; usuarioId: string; expiraEm: Date; ip: string | null;
};

/** Passe `expiraEm` no passado para montar a sessão vencida que o expurgo precisa encontrar. */
export async function criarSessao(opcoes: {
  redeId: string; usuarioId: string; expiraEm?: Date | undefined; ip?: string | null | undefined;
}): Promise<SessaoDeTeste> {
  return await gravar('sessao', {
    id: novoId(), redeId: opcoes.redeId, usuarioId: opcoes.usuarioId,
    expiraEm: opcoes.expiraEm ?? new Date(Date.now() + DURACAO_DA_SESSAO_HORAS * HORA_EM_MS),
    ip: opcoes.ip ?? null,
  });
}

export type AnoLetivoDeTeste = {
  id: string; redeId: string; ano: number; dataInicio: string; dataFim: string;
};

export async function criarAnoLetivo(opcoes: {
  redeId: string; ano?: number | undefined;
  dataInicio?: string | undefined; dataFim?: string | undefined;
}): Promise<AnoLetivoDeTeste> {
  const ano = opcoes.ano ?? ANO_PADRAO;
  return await gravar('ano_letivo', {
    id: novoId(), redeId: opcoes.redeId, ano,
    dataInicio: opcoes.dataInicio ?? `${ano}-02-01`, dataFim: opcoes.dataFim ?? `${ano}-12-15`,
  });
}

export type DisciplinaDeTeste = { id: string; redeId: string; nome: string };

export async function criarDisciplina(opcoes: {
  redeId: string; nome?: string | undefined;
}): Promise<DisciplinaDeTeste> {
  return await gravar('disciplina', {
    id: novoId(), redeId: opcoes.redeId, nome: opcoes.nome ?? `Disciplina ${proximo()}`,
  });
}

export type TurmaDeTeste = {
  id: string; redeId: string; unidadeId: string; anoLetivoId: string;
  nome: string; serie: string; turno: Turno;
};

export async function criarTurma(opcoes: {
  redeId: string; unidadeId: string; anoLetivoId: string;
  nome?: string | undefined; serie?: string | undefined; turno?: Turno | undefined;
}): Promise<TurmaDeTeste> {
  return await gravar('turma', {
    id: novoId(), redeId: opcoes.redeId, unidadeId: opcoes.unidadeId,
    anoLetivoId: opcoes.anoLetivoId, nome: opcoes.nome ?? `Turma ${proximo()}`,
    serie: opcoes.serie ?? '6º ano', turno: opcoes.turno ?? 'matutino',
  });
}

export type TurmaDisciplinaDeTeste = {
  id: string; redeId: string; turmaId: string; disciplinaId: string; professorUsuarioId: string;
};

export async function criarTurmaDisciplina(opcoes: {
  redeId: string; turmaId: string; disciplinaId: string; professorUsuarioId: string;
}): Promise<TurmaDisciplinaDeTeste> {
  return await gravar('turma_disciplina', { id: novoId(), ...opcoes });
}

export type AlunoDeTeste = { id: string; redeId: string; nome: string; dataNascimento: string };

export async function criarAluno(opcoes: {
  redeId: string; nome?: string | undefined; dataNascimento?: string | undefined;
}): Promise<AlunoDeTeste> {
  return await gravar('aluno', {
    id: novoId(), redeId: opcoes.redeId, nome: opcoes.nome ?? `Aluno de Teste ${proximo()}`,
    dataNascimento: opcoes.dataNascimento ?? '2014-05-10',
  });
}

export type ResponsavelDeTeste = {
  id: string; redeId: string; nome: string; email: string; telefone: string | null;
};

export async function criarResponsavel(opcoes: {
  redeId: string; nome?: string | undefined;
  email?: string | undefined; telefone?: string | null | undefined;
}): Promise<ResponsavelDeTeste> {
  const numero = proximo();
  return await gravar('responsavel', {
    id: novoId(), redeId: opcoes.redeId, nome: opcoes.nome ?? `Responsável de Teste ${numero}`,
    email: opcoes.email ?? `responsavel${numero}@${DOMINIO}`, telefone: opcoes.telefone ?? null,
  });
}

export type VinculoDeTeste = {
  redeId: string; alunoId: string; responsavelId: string; parentesco: string; financeiro: boolean;
};

export async function vincularAlunoResponsavel(opcoes: {
  redeId: string; alunoId: string; responsavelId: string;
  parentesco?: string | undefined; financeiro?: boolean | undefined;
}): Promise<VinculoDeTeste> {
  return await gravar('aluno_responsavel', {
    redeId: opcoes.redeId, alunoId: opcoes.alunoId, responsavelId: opcoes.responsavelId,
    parentesco: opcoes.parentesco ?? 'mãe', financeiro: opcoes.financeiro ?? true,
  });
}

export type MatriculaDeTeste = {
  id: string; redeId: string; alunoId: string; turmaId: string; anoLetivoId: string;
  dataMatricula: string; situacao: SituacaoMatricula;
};

export async function criarMatricula(opcoes: {
  redeId: string; alunoId: string; turmaId: string; anoLetivoId: string;
  dataMatricula?: string | undefined; situacao?: SituacaoMatricula | undefined;
}): Promise<MatriculaDeTeste> {
  return await gravar('matricula', {
    id: novoId(), redeId: opcoes.redeId, alunoId: opcoes.alunoId, turmaId: opcoes.turmaId,
    anoLetivoId: opcoes.anoLetivoId, dataMatricula: opcoes.dataMatricula ?? `${ANO_PADRAO}-02-05`,
    situacao: opcoes.situacao ?? 'ativa',
  });
}

export type NotaDeTeste = {
  id: string; redeId: string; matriculaId: string; turmaDisciplinaId: string;
  bimestre: number; valor: number; lancadaPor: string;
};

export async function criarNota(opcoes: {
  redeId: string; matriculaId: string; turmaDisciplinaId: string; lancadaPor: string;
  bimestre?: number | undefined; valor?: number | undefined;
}): Promise<NotaDeTeste> {
  return await gravar('nota', {
    id: novoId(), redeId: opcoes.redeId, matriculaId: opcoes.matriculaId,
    turmaDisciplinaId: opcoes.turmaDisciplinaId, bimestre: opcoes.bimestre ?? 1,
    valor: opcoes.valor ?? 8, lancadaPor: opcoes.lancadaPor,
  });
}

export type FrequenciaDeTeste = {
  id: string; redeId: string; matriculaId: string; data: string;
  presente: boolean; justificativa: string | null;
};

export async function criarFrequencia(opcoes: {
  redeId: string; matriculaId: string; data?: string | undefined;
  presente?: boolean | undefined; justificativa?: string | null | undefined;
}): Promise<FrequenciaDeTeste> {
  return await gravar('frequencia', {
    id: novoId(), redeId: opcoes.redeId, matriculaId: opcoes.matriculaId,
    data: opcoes.data ?? `${ANO_PADRAO}-03-02`, presente: opcoes.presente ?? true,
    justificativa: opcoes.justificativa ?? null,
  });
}

export type DestinatarioDeTeste = { responsavelId: string; lidoEm: Date | null };

export type ComunicadoDeTeste = {
  id: string; redeId: string; unidadeId: string; titulo: string; corpo: string;
  autorUsuarioId: string; publicadoEm: Date | null; destinatarios: DestinatarioDeTeste[];
};

export async function criarComunicado(opcoes: {
  redeId: string; unidadeId: string; autorUsuarioId: string;
  titulo?: string | undefined; corpo?: string | undefined;
  /** `null` monta o comunicado que ainda não foi publicado e não aparece em mural nenhum. */
  publicadoEm?: Date | null | undefined;
  destinatarios?: { responsavelId: string; lidoEm?: Date | null | undefined }[] | undefined;
}): Promise<ComunicadoDeTeste> {
  const comunicado: ComunicadoDeTeste = {
    id: novoId(), redeId: opcoes.redeId, unidadeId: opcoes.unidadeId,
    titulo: opcoes.titulo ?? `Comunicado de Teste ${proximo()}`,
    corpo: opcoes.corpo ?? 'Corpo do comunicado de teste.',
    autorUsuarioId: opcoes.autorUsuarioId,
    publicadoEm: opcoes.publicadoEm === undefined ? new Date() : opcoes.publicadoEm,
    destinatarios: (opcoes.destinatarios ?? []).map((d) => ({ ...d, lidoEm: d.lidoEm ?? null })),
  };

  const { destinatarios, ...colunas } = comunicado;
  await gravar('comunicado', colunas);
  for (const { responsavelId, lidoEm } of destinatarios) {
    await gravar('comunicado_destinatario', {
      redeId: comunicado.redeId, comunicadoId: comunicado.id, responsavelId, lidoEm,
    });
  }
  return comunicado;
}

/**
 * A rede pronta que a maioria dos testes usa: duas unidades, um ano letivo, duas turmas na
 * primeira unidade, três disciplinas alocadas na primeira turma com o mesmo professor, cinco
 * alunos matriculados com um responsável cada e um usuário de cada papel. A segunda turma nasce
 * vazia de propósito: é o destino da transferência.
 */
export type Cenario = {
  rede: RedeDeTeste;
  unidades: [UnidadeDeTeste, UnidadeDeTeste];
  anoLetivo: AnoLetivoDeTeste;
  turmas: [TurmaDeTeste, TurmaDeTeste];
  disciplinas: [DisciplinaDeTeste, DisciplinaDeTeste, DisciplinaDeTeste];
  turmaDisciplinas: [TurmaDisciplinaDeTeste, TurmaDisciplinaDeTeste, TurmaDisciplinaDeTeste];
  alunos: [AlunoDeTeste, AlunoDeTeste, AlunoDeTeste, AlunoDeTeste, AlunoDeTeste];
  responsaveis: [ResponsavelDeTeste, ResponsavelDeTeste, ResponsavelDeTeste, ResponsavelDeTeste, ResponsavelDeTeste];
  matriculas: [MatriculaDeTeste, MatriculaDeTeste, MatriculaDeTeste, MatriculaDeTeste, MatriculaDeTeste];
  admin: UsuarioDeTeste; secretaria: UsuarioDeTeste; professor: UsuarioDeTeste;
  /** O usuário do portal, ligado a `responsaveis[0]`. */
  responsavel: UsuarioDeTeste;
  senha: string;
};

async function matricularAluno(base: {
  redeId: string; turmaId: string; anoLetivoId: string; ano: number;
}): Promise<{ aluno: AlunoDeTeste; responsavel: ResponsavelDeTeste; matricula: MatriculaDeTeste }> {
  const aluno = await criarAluno({ redeId: base.redeId });
  const responsavel = await criarResponsavel({ redeId: base.redeId });
  await vincularAlunoResponsavel({ redeId: base.redeId, alunoId: aluno.id, responsavelId: responsavel.id });
  const matricula = await criarMatricula({
    redeId: base.redeId, alunoId: aluno.id, turmaId: base.turmaId,
    anoLetivoId: base.anoLetivoId, dataMatricula: `${base.ano}-02-05`,
  });
  return { aluno, responsavel, matricula };
}

export async function cenarioCompleto(opcoes: {
  nome?: string | undefined; slug?: string | undefined;
  ano?: number | undefined; senha?: string | undefined;
} = {}): Promise<Cenario> {
  const senha = opcoes.senha ?? SENHA_PADRAO;
  const rede = await criarRede({
    ...(opcoes.nome === undefined ? {} : { nome: opcoes.nome }),
    ...(opcoes.slug === undefined ? {} : { slug: opcoes.slug }),
  });
  const redeId = rede.id;

  const [unidadeA, unidadeB] = await Promise.all([
    criarUnidade({ redeId, nome: `Escola Central ${proximo()}` }),
    criarUnidade({ redeId, nome: `Escola Bairro ${proximo()}` }),
  ]);
  const anoLetivo = await criarAnoLetivo({ redeId, ano: opcoes.ano ?? ANO_PADRAO });

  const admin = await criarUsuario({
    redeId, senha,
    papeis: [
      { unidadeId: unidadeA.id, papel: 'admin_rede' }, { unidadeId: unidadeB.id, papel: 'admin_rede' },
    ],
  });
  const [secretaria, professor] = await Promise.all([
    criarUsuario({ redeId, senha, papeis: [{ unidadeId: unidadeA.id, papel: 'secretaria' }] }),
    criarUsuario({ redeId, senha, papeis: [{ unidadeId: unidadeA.id, papel: 'professor' }] }),
  ]);

  const [turmaA, turmaB] = await Promise.all([
    criarTurma({ redeId, unidadeId: unidadeA.id, anoLetivoId: anoLetivo.id, serie: '6º ano' }),
    criarTurma({ redeId, unidadeId: unidadeA.id, anoLetivoId: anoLetivo.id, serie: '7º ano' }),
  ]);
  const [portugues, matematica, historia] = await Promise.all([
    criarDisciplina({ redeId, nome: `Português ${proximo()}` }),
    criarDisciplina({ redeId, nome: `Matemática ${proximo()}` }),
    criarDisciplina({ redeId, nome: `História ${proximo()}` }),
  ]);
  const alocar = (disciplinaId: string): Promise<TurmaDisciplinaDeTeste> =>
    criarTurmaDisciplina({ redeId, turmaId: turmaA.id, disciplinaId, professorUsuarioId: professor.id });
  const [alocacaoA, alocacaoB, alocacaoC] = await Promise.all([
    alocar(portugues.id), alocar(matematica.id), alocar(historia.id),
  ]);

  const base = { redeId, turmaId: turmaA.id, anoLetivoId: anoLetivo.id, ano: anoLetivo.ano };
  const [um, dois, tres, quatro, cinco] = await Promise.all([
    matricularAluno(base), matricularAluno(base), matricularAluno(base),
    matricularAluno(base), matricularAluno(base),
  ]);

  const responsavel = await criarUsuario({
    redeId, senha, responsavelId: um.responsavel.id,
    papeis: [{ unidadeId: unidadeA.id, papel: 'responsavel' }],
  });

  return {
    rede, anoLetivo, unidades: [unidadeA, unidadeB], turmas: [turmaA, turmaB],
    disciplinas: [portugues, matematica, historia],
    turmaDisciplinas: [alocacaoA, alocacaoB, alocacaoC],
    alunos: [um.aluno, dois.aluno, tres.aluno, quatro.aluno, cinco.aluno],
    responsaveis: [
      um.responsavel, dois.responsavel, tres.responsavel, quatro.responsavel, cinco.responsavel,
    ],
    matriculas: [um.matricula, dois.matricula, tres.matricula, quatro.matricula, cinco.matricula],
    admin, secretaria, professor, responsavel, senha,
  };
}

/** Duas redes completas e independentes: o cenário do teste de isolamento de tenant. */
export async function duasRedes(): Promise<{ a: Cenario; b: Cenario }> {
  const [a, b] = await Promise.all([cenarioCompleto(), cenarioCompleto()]);
  return { a, b };
}
