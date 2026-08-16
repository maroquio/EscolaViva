/*
 * Cenários mínimos e componíveis. Cada fábrica escreve direto no banco, respeitando as mesmas
 * constraints da aplicação, e devolve o que criou com os ids. Escrever pelo INSERT em vez de pelo
 * caso de uso é deliberado: o teste de `matricular` não pode depender de `matricular`.
 */

import type { SituacaoMatricula } from '../../src/academico';
import type { Papel } from '../../src/identidade';
import { gerarCpf } from '../../src/shared/documento';
import { sqlDeTeste } from './banco';

export type StatusDeRede = 'active' | 'suspended' | 'cancelled';
export type Turno = 'morning' | 'afternoon' | 'evening' | 'full_time';
export type PapelEmUnidade = { schoolId: string; role: Papel };

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
 * Grava o registro e o devolve. As chaves do objeto viram as colunas — `networkId` é
 * `network_id` —, então cada fábrica descreve o que criou uma vez só, e não em camelCase e em
 * snake_case.
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

export type RedeDeTeste = { id: string; name: string; slug: string; status: StatusDeRede };

export async function criarRede(opcoes: {
  name?: string | undefined; slug?: string | undefined; status?: StatusDeRede | undefined;
} = {}): Promise<RedeDeTeste> {
  const numero = proximo();
  return await gravar('network', {
    id: novoId(), name: opcoes.name ?? `Rede de Teste ${numero}`,
    slug: opcoes.slug ?? `rede-teste-${numero}`, status: opcoes.status ?? 'active',
  });
}

export type UnidadeDeTeste = {
  id: string; networkId: string; name: string; inepCode: string | null; active: boolean;
};

export async function criarUnidade(opcoes: {
  networkId: string; name?: string | undefined;
  inepCode?: string | null | undefined; active?: boolean | undefined;
}): Promise<UnidadeDeTeste> {
  return await gravar('school', {
    id: novoId(), networkId: opcoes.networkId, name: opcoes.name ?? `Unidade de Teste ${proximo()}`,
    inepCode: opcoes.inepCode ?? null, active: opcoes.active ?? true,
  });
}

export type UsuarioDeTeste = {
  id: string; networkId: string; name: string; email: string;
  /** Migração 0008 (ADR 0004): toda linha de `app_user` tem CPF, sempre — nunca `null` aqui. */
  cpf: string;
  /** A senha em claro, para o teste conseguir autenticar depois. */
  senha: string;
  active: boolean; guardianId: string | null; papeis: PapelEmUnidade[];
};

export async function criarUsuario(opcoes: {
  networkId: string; name?: string | undefined; email?: string | undefined;
  cpf?: string | undefined; senha?: string | undefined;
  active?: boolean | undefined; guardianId?: string | null | undefined;
  papeis?: PapelEmUnidade[] | undefined;
}): Promise<UsuarioDeTeste> {
  const numero = proximo();
  const usuario: UsuarioDeTeste = {
    id: novoId(), networkId: opcoes.networkId, name: opcoes.name ?? `Pessoa de Teste ${numero}`,
    email: opcoes.email ?? `usuario${numero}@${DOMINIO}`,
    cpf: opcoes.cpf === undefined ? gerarCpf(numero) : opcoes.cpf,
    senha: opcoes.senha ?? SENHA_PADRAO,
    active: opcoes.active ?? true, guardianId: opcoes.guardianId ?? null, papeis: opcoes.papeis ?? [],
  };

  // `senha` e `papeis` não são colunas de `app_user`: a primeira vira hash, os segundos viram linhas.
  const { senha, papeis, ...colunas } = usuario;
  await gravar('app_user', { ...colunas, passwordHash: await hashDeSenha(senha) });
  for (const { schoolId, role } of papeis) {
    await gravar('user_role', { networkId: usuario.networkId, userId: usuario.id, schoolId, role });
  }
  return usuario;
}

export type SessaoDeTeste = {
  id: string; networkId: string; userId: string; expiresAt: Date; ip: string | null;
};

/** Passe `expiresAt` no passado para montar a sessão vencida que o expurgo precisa encontrar. */
export async function criarSessao(opcoes: {
  networkId: string; userId: string; expiresAt?: Date | undefined; ip?: string | null | undefined;
}): Promise<SessaoDeTeste> {
  return await gravar('session', {
    id: novoId(), networkId: opcoes.networkId, userId: opcoes.userId,
    expiresAt: opcoes.expiresAt ?? new Date(Date.now() + DURACAO_DA_SESSAO_HORAS * HORA_EM_MS),
    ip: opcoes.ip ?? null,
  });
}

export type AnoLetivoDeTeste = {
  id: string; networkId: string; year: number; startDate: string; endDate: string;
};

export async function criarAnoLetivo(opcoes: {
  networkId: string; year?: number | undefined;
  startDate?: string | undefined; endDate?: string | undefined;
}): Promise<AnoLetivoDeTeste> {
  const year = opcoes.year ?? ANO_PADRAO;
  return await gravar('academic_year', {
    id: novoId(), networkId: opcoes.networkId, year,
    startDate: opcoes.startDate ?? `${year}-02-01`, endDate: opcoes.endDate ?? `${year}-12-15`,
  });
}

export type DisciplinaDeTeste = { id: string; networkId: string; name: string };

export async function criarDisciplina(opcoes: {
  networkId: string; name?: string | undefined;
}): Promise<DisciplinaDeTeste> {
  return await gravar('subject', {
    id: novoId(), networkId: opcoes.networkId, name: opcoes.name ?? `Disciplina ${proximo()}`,
  });
}

export type TurmaDeTeste = {
  id: string; networkId: string; schoolId: string; academicYearId: string;
  name: string; gradeLevel: string; shift: Turno;
};

export async function criarTurma(opcoes: {
  networkId: string; schoolId: string; academicYearId: string;
  name?: string | undefined; gradeLevel?: string | undefined; shift?: Turno | undefined;
}): Promise<TurmaDeTeste> {
  return await gravar('class_group', {
    id: novoId(), networkId: opcoes.networkId, schoolId: opcoes.schoolId,
    academicYearId: opcoes.academicYearId, name: opcoes.name ?? `Turma ${proximo()}`,
    gradeLevel: opcoes.gradeLevel ?? '6º ano', shift: opcoes.shift ?? 'morning',
  });
}

export type TurmaDisciplinaDeTeste = {
  id: string; networkId: string; classGroupId: string; subjectId: string; teacherUserId: string;
};

export async function criarTurmaDisciplina(opcoes: {
  networkId: string; classGroupId: string; subjectId: string; teacherUserId: string;
}): Promise<TurmaDisciplinaDeTeste> {
  return await gravar('class_group_subject', { id: novoId(), ...opcoes });
}

export type AlunoDeTeste = { id: string; networkId: string; name: string; birthDate: string };

export async function criarAluno(opcoes: {
  networkId: string; name?: string | undefined; birthDate?: string | undefined;
}): Promise<AlunoDeTeste> {
  return await gravar('student', {
    id: novoId(), networkId: opcoes.networkId, name: opcoes.name ?? `Aluno de Teste ${proximo()}`,
    birthDate: opcoes.birthDate ?? '2014-05-10',
  });
}

export type ResponsavelDeTeste = {
  id: string; networkId: string; name: string; email: string; cpf: string | null;
  phone: string | null;
};

export async function criarResponsavel(opcoes: {
  networkId: string; name?: string | undefined; email?: string | undefined;
  cpf?: string | null | undefined; phone?: string | null | undefined;
}): Promise<ResponsavelDeTeste> {
  const numero = proximo();
  return await gravar('guardian', {
    id: novoId(), networkId: opcoes.networkId, name: opcoes.name ?? `Responsável de Teste ${numero}`,
    email: opcoes.email ?? `responsavel${numero}@${DOMINIO}`,
    cpf: opcoes.cpf === undefined ? gerarCpf(numero) : opcoes.cpf, phone: opcoes.phone ?? null,
  });
}

export type VinculoDeTeste = {
  networkId: string; studentId: string; guardianId: string; relationship: string;
  financiallyResponsible: boolean;
};

export async function vincularAlunoResponsavel(opcoes: {
  networkId: string; studentId: string; guardianId: string;
  relationship?: string | undefined; financiallyResponsible?: boolean | undefined;
}): Promise<VinculoDeTeste> {
  return await gravar('student_guardian', {
    networkId: opcoes.networkId, studentId: opcoes.studentId, guardianId: opcoes.guardianId,
    relationship: opcoes.relationship ?? 'mãe',
    financiallyResponsible: opcoes.financiallyResponsible ?? true,
  });
}

export type MatriculaDeTeste = {
  id: string; networkId: string; studentId: string; classGroupId: string; academicYearId: string;
  enrollmentDate: string; status: SituacaoMatricula;
};

export async function criarMatricula(opcoes: {
  networkId: string; studentId: string; classGroupId: string; academicYearId: string;
  enrollmentDate?: string | undefined; status?: SituacaoMatricula | undefined;
}): Promise<MatriculaDeTeste> {
  return await gravar('enrollment', {
    id: novoId(), networkId: opcoes.networkId, studentId: opcoes.studentId,
    classGroupId: opcoes.classGroupId, academicYearId: opcoes.academicYearId,
    enrollmentDate: opcoes.enrollmentDate ?? `${ANO_PADRAO}-02-05`,
    status: opcoes.status ?? 'active',
  });
}

export type NotaDeTeste = {
  id: string; networkId: string; enrollmentId: string; classGroupSubjectId: string;
  term: number; value: number; postedBy: string;
};

export async function criarNota(opcoes: {
  networkId: string; enrollmentId: string; classGroupSubjectId: string; postedBy: string;
  term?: number | undefined; value?: number | undefined;
}): Promise<NotaDeTeste> {
  return await gravar('grade', {
    id: novoId(), networkId: opcoes.networkId, enrollmentId: opcoes.enrollmentId,
    classGroupSubjectId: opcoes.classGroupSubjectId, term: opcoes.term ?? 1,
    value: opcoes.value ?? 8, postedBy: opcoes.postedBy,
  });
}

export type FrequenciaDeTeste = {
  id: string; networkId: string; enrollmentId: string; attendanceDate: string;
  present: boolean; excuse: string | null;
};

export async function criarFrequencia(opcoes: {
  networkId: string; enrollmentId: string; attendanceDate?: string | undefined;
  present?: boolean | undefined; excuse?: string | null | undefined;
}): Promise<FrequenciaDeTeste> {
  return await gravar('attendance', {
    id: novoId(), networkId: opcoes.networkId, enrollmentId: opcoes.enrollmentId,
    attendanceDate: opcoes.attendanceDate ?? `${ANO_PADRAO}-03-02`, present: opcoes.present ?? true,
    excuse: opcoes.excuse ?? null,
  });
}

export type DestinatarioDeTeste = { guardianId: string; readAt: Date | null };

export type ComunicadoDeTeste = {
  id: string; networkId: string; schoolId: string; title: string; body: string;
  authorUserId: string; publishedAt: Date | null; destinatarios: DestinatarioDeTeste[];
};

export async function criarComunicado(opcoes: {
  networkId: string; schoolId: string; authorUserId: string;
  title?: string | undefined; body?: string | undefined;
  /** `null` monta o comunicado que ainda não foi publicado e não aparece em mural nenhum. */
  publishedAt?: Date | null | undefined;
  destinatarios?: { guardianId: string; readAt?: Date | null | undefined }[] | undefined;
}): Promise<ComunicadoDeTeste> {
  const comunicado: ComunicadoDeTeste = {
    id: novoId(), networkId: opcoes.networkId, schoolId: opcoes.schoolId,
    title: opcoes.title ?? `Comunicado de Teste ${proximo()}`,
    body: opcoes.body ?? 'Corpo do comunicado de teste.',
    authorUserId: opcoes.authorUserId,
    publishedAt: opcoes.publishedAt === undefined ? new Date() : opcoes.publishedAt,
    destinatarios: (opcoes.destinatarios ?? []).map((d) => ({ ...d, readAt: d.readAt ?? null })),
  };

  const { destinatarios, ...colunas } = comunicado;
  await gravar('announcement', colunas);
  for (const { guardianId, readAt } of destinatarios) {
    await gravar('announcement_recipient', {
      networkId: comunicado.networkId, announcementId: comunicado.id, guardianId, readAt,
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
  networkId: string; classGroupId: string; academicYearId: string; year: number;
}): Promise<{ aluno: AlunoDeTeste; responsavel: ResponsavelDeTeste; matricula: MatriculaDeTeste }> {
  const aluno = await criarAluno({ networkId: base.networkId });
  const responsavel = await criarResponsavel({ networkId: base.networkId });
  await vincularAlunoResponsavel({
    networkId: base.networkId, studentId: aluno.id, guardianId: responsavel.id,
  });
  const matricula = await criarMatricula({
    networkId: base.networkId, studentId: aluno.id, classGroupId: base.classGroupId,
    academicYearId: base.academicYearId, enrollmentDate: `${base.year}-02-05`,
  });
  return { aluno, responsavel, matricula };
}

export async function cenarioCompleto(opcoes: {
  name?: string | undefined; slug?: string | undefined;
  year?: number | undefined; senha?: string | undefined;
} = {}): Promise<Cenario> {
  const senha = opcoes.senha ?? SENHA_PADRAO;
  const rede = await criarRede({
    ...(opcoes.name === undefined ? {} : { name: opcoes.name }),
    ...(opcoes.slug === undefined ? {} : { slug: opcoes.slug }),
  });
  const networkId = rede.id;

  const [unidadeA, unidadeB] = await Promise.all([
    criarUnidade({ networkId, name: `Escola Central ${proximo()}` }),
    criarUnidade({ networkId, name: `Escola Bairro ${proximo()}` }),
  ]);
  const anoLetivo = await criarAnoLetivo({ networkId, year: opcoes.year ?? ANO_PADRAO });

  const admin = await criarUsuario({
    networkId, senha,
    papeis: [
      { schoolId: unidadeA.id, role: 'network_admin' }, { schoolId: unidadeB.id, role: 'network_admin' },
    ],
  });
  const [secretaria, professor] = await Promise.all([
    criarUsuario({ networkId, senha, papeis: [{ schoolId: unidadeA.id, role: 'registrar' }] }),
    criarUsuario({ networkId, senha, papeis: [{ schoolId: unidadeA.id, role: 'teacher' }] }),
  ]);

  const [turmaA, turmaB] = await Promise.all([
    criarTurma({ networkId, schoolId: unidadeA.id, academicYearId: anoLetivo.id, gradeLevel: '6º ano' }),
    criarTurma({ networkId, schoolId: unidadeA.id, academicYearId: anoLetivo.id, gradeLevel: '7º ano' }),
  ]);
  const [portugues, matematica, historia] = await Promise.all([
    criarDisciplina({ networkId, name: `Português ${proximo()}` }),
    criarDisciplina({ networkId, name: `Matemática ${proximo()}` }),
    criarDisciplina({ networkId, name: `História ${proximo()}` }),
  ]);
  const alocar = (subjectId: string): Promise<TurmaDisciplinaDeTeste> =>
    criarTurmaDisciplina({ networkId, classGroupId: turmaA.id, subjectId, teacherUserId: professor.id });
  const [alocacaoA, alocacaoB, alocacaoC] = await Promise.all([
    alocar(portugues.id), alocar(matematica.id), alocar(historia.id),
  ]);

  const base = {
    networkId, classGroupId: turmaA.id, academicYearId: anoLetivo.id, year: anoLetivo.year,
  };
  const [um, dois, tres, quatro, cinco] = await Promise.all([
    matricularAluno(base), matricularAluno(base), matricularAluno(base),
    matricularAluno(base), matricularAluno(base),
  ]);

  const responsavel = await criarUsuario({
    networkId, senha, guardianId: um.responsavel.id,
    papeis: [{ schoolId: unidadeA.id, role: 'guardian' }],
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
