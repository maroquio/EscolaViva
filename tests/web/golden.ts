/*
 * A rede de proteção do refactor: o HTML de toda tela renderizada hoje, congelado em arquivo.
 *
 * Um refactor puro promete que nada muda para quem usa o sistema. Teste de unidade não cobra essa
 * promessa — ele olha um pedaço de cada vez, e o que quebra em uma reorganização de rotas é
 * justamente a costura: um `href` que passou a apontar para outro lugar, um rótulo que sumiu do
 * layout, um `redirect` que trocou de destino. O golden compara o documento inteiro, byte a byte,
 * contra o que o sistema respondia antes.
 *
 * Três decisões governam o arquivo:
 *
 * 1. UM cenário, montado à mão e nomeado. As fábricas numeram nomes com um contador de processo
 *    (`Aluno de Teste 47`), e esse número depende de quantos testes rodaram antes — o que faria o
 *    golden passar sozinho e falhar na suíte inteira. Aqui todo nome, e-mail, CPF e data é
 *    escrito, e o cenário é o mesmo em qualquer ordem de execução.
 *
 * 2. Normalização por dicionário, e não por vassoura. Os identificadores do cenário viram
 *    marcadores COM NOME — `{{aluno01}}`, `{{turma1}}` —, então trocar o `href` de um aluno pelo de
 *    outro continua sendo uma diferença visível. Só o que não tem como ser previsto (a chave de
 *    idempotência, o hash do CSS, o carimbo de tempo do banco) vira marcador anônimo.
 *
 * 3. O documento congelado inclui status e cabeçalhos de resposta. Metade das rotas de entrada não
 *    tem corpo: `/` e `/painel` são redirecionamentos, e o destino deles é exatamente o que um
 *    refactor de rotas pode trocar sem que nenhum HTML mude.
 */

import { join } from 'node:path';
import { app } from '../../src/web/app';
import { generateCpf } from '../../src/shared/document';
import { sqlDeTeste } from '../support/database';
import {
  SENHA_PADRAO,
  criarAluno,
  criarAnoLetivo,
  criarComunicado,
  criarDisciplina,
  criarFrequencia,
  criarMatricula,
  criarNota,
  criarRede,
  criarResponsavel,
  criarTurma,
  criarTurmaDisciplina,
  criarUnidade,
  criarUsuario,
  vincularAlunoResponsavel,
  type AlunoDeTeste,
  type MatriculaDeTeste,
  type ResponsavelDeTeste,
} from '../support/factories';
import { entrar } from './support';

export const PASTA_GOLDEN = join(import.meta.dir, 'golden');

/**
 * Papéis que abrem as telas. `anonimo` é a ausência de sessão, e também é uma tela; `semPapel` é a
 * conta que existe e ainda não foi ligada a unidade nenhuma, que é a única porta para a tela
 * "Conta sem papel atribuído" de `/painel`.
 */
export type Papel =
  | 'anonimo'
  | 'semPapel'
  | 'admin'
  | 'secretaria'
  | 'professor'
  | 'responsavel';

export type Tela = {
  /** Nome do arquivo em `tests/web/golden/`, sem extensão. */
  readonly nome: string;
  readonly papel: Papel;
  readonly caminho: string;
};

/*
 * Cabeçalho aceito pelo middleware de correlação (I16): fixá-lo aqui torna a página de erro
 * determinística sem que a normalização precise apagar o código de ocorrência — se ele sumir da
 * tela, o golden acusa.
 */
const CORRELACAO = 'golden-correlacao-fixa';

/** Um identificador que respeita o formato e não existe no banco: a porta do 404. */
const ID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

const ANO_CORRENTE = 2026;
const ANO_ANTERIOR = 2025;
const TOTAL_DE_ALUNOS = 12;
const TOTAL_DE_DIAS_DE_CHAMADA = 12;
const BIMESTRE_FECHADO = 1;

const doisDigitos = (valor: number): string => String(valor).padStart(2, '0');

/* --- Cenário ---------------------------------------------------------------- */

export type CenarioGolden = {
  readonly cookies: Readonly<Record<Papel, string>>;
  readonly marcadores: ReadonlyMap<string, string>;
  readonly ids: {
    readonly unidadeA: string;
    readonly unidadeB: string;
    readonly anoCorrente: string;
    readonly turma1: string;
    readonly turma2: string;
    readonly alocacao1: string;
    readonly aluno1: string;
    readonly matricula1: string;
    readonly comunicado1: string;
    readonly inexistente: string;
  };
};

/**
 * Monta a rede inteira do golden. Tudo é escrito à mão de propósito: dez linhas por tabela custam
 * menos do que descobrir, seis meses depois, que o golden só passa quando roda sozinho.
 *
 * O tamanho não é arbitrário — doze alunos, doze responsáveis e doze dias de chamada são dois a
 * mais do que a página (dez), e é isso que faz a barra de paginação aparecer em três telas
 * diferentes. Barra de paginação monta `href` a partir do caminho da requisição, e caminho é
 * exatamente o que o refactor de rotas mexe.
 */
export async function montarCenarioGolden(): Promise<CenarioGolden> {
  const rede = await criarRede({ name: 'Rede Modelo do Litoral', slug: 'rede-golden' });
  const redeId = rede.id;

  const unidadeA = await criarUnidade({ networkId: redeId, name: 'Escola Central', inepCode: '32001234' });
  const unidadeB = await criarUnidade({ networkId: redeId, name: 'Escola do Bairro', inepCode: '32005678' });

  const anoCorrente = await criarAnoLetivo({ networkId: redeId, year: ANO_CORRENTE });
  const anoAnterior = await criarAnoLetivo({ networkId: redeId, year: ANO_ANTERIOR });

  const admin = await criarUsuario({
    networkId: redeId,
    name: 'Alice Diretora',
    email: 'alice@golden.test',
    cpf: generateCpf(9_100_001),
    senha: SENHA_PADRAO,
    papeis: [
      { schoolId: unidadeA.id, role: 'network_admin' },
      { schoolId: unidadeB.id, role: 'network_admin' },
    ],
  });
  const secretaria = await criarUsuario({
    networkId: redeId,
    name: 'Bruno Secretário',
    email: 'bruno@golden.test',
    cpf: generateCpf(9_100_002),
    senha: SENHA_PADRAO,
    papeis: [{ schoolId: unidadeA.id, role: 'registrar' }],
  });
  const professor = await criarUsuario({
    networkId: redeId,
    name: 'Carla Professora',
    email: 'carla@golden.test',
    cpf: generateCpf(9_100_003),
    senha: SENHA_PADRAO,
    papeis: [{ schoolId: unidadeA.id, role: 'teacher' }],
  });

  const turma1 = await criarTurma({
    networkId: redeId, schoolId: unidadeA.id, academicYearId: anoCorrente.id,
    name: '6A', gradeLevel: '6º ano', shift: 'morning',
  });
  const turma2 = await criarTurma({
    networkId: redeId, schoolId: unidadeA.id, academicYearId: anoCorrente.id,
    name: '7B', gradeLevel: '7º ano', shift: 'afternoon',
  });

  const portugues = await criarDisciplina({ networkId: redeId, name: 'Língua Portuguesa' });
  const matematica = await criarDisciplina({ networkId: redeId, name: 'Matemática' });
  const historia = await criarDisciplina({ networkId: redeId, name: 'História' });

  const alocar = (disciplinaId: string): Promise<{ id: string }> =>
    criarTurmaDisciplina({
      networkId: redeId, classGroupId: turma1.id, subjectId: disciplinaId, teacherUserId: professor.id,
    });
  const alocacao1 = await alocar(portugues.id);
  const alocacao2 = await alocar(matematica.id);
  const alocacao3 = await alocar(historia.id);

  const alunos: AlunoDeTeste[] = [];
  const responsaveis: ResponsavelDeTeste[] = [];
  const matriculas: MatriculaDeTeste[] = [];
  for (let numero = 1; numero <= TOTAL_DE_ALUNOS; numero += 1) {
    const rotulo = doisDigitos(numero);
    const aluno = await criarAluno({
      networkId: redeId, name: `Aluno ${rotulo} da Silva`, birthDate: `2014-${rotulo}-08`,
    });
    const responsavel = await criarResponsavel({
      networkId: redeId,
      name: `Responsável ${rotulo} da Silva`,
      email: `responsavel${rotulo}@golden.test`,
      cpf: generateCpf(9_200_000 + numero),
      phone: `2799000${rotulo}${rotulo}`,
    });
    await vincularAlunoResponsavel({
      networkId: redeId, studentId: aluno.id, guardianId: responsavel.id,
      relationship: numero % 2 === 0 ? 'pai' : 'mãe', financiallyResponsible: numero === 1,
    });
    const matricula = await criarMatricula({
      networkId: redeId, studentId: aluno.id, classGroupId: turma1.id,
      academicYearId: anoCorrente.id, enrollmentDate: `${ANO_CORRENTE}-02-05`,
    });
    alunos.push(aluno);
    responsaveis.push(responsavel);
    matriculas.push(matricula);
  }

  // Conta criada e ainda não atribuída: `/painel` não tem para onde mandá-la, e diz isso na tela.
  const semPapel = await criarUsuario({
    networkId: redeId,
    name: 'Eva Recém-Convidada',
    email: 'eva@golden.test',
    cpf: generateCpf(9_100_005),
    senha: SENHA_PADRAO,
    papeis: [],
  });

  const responsavel = await criarUsuario({
    networkId: redeId,
    name: 'Responsável 01 da Silva',
    email: 'portal01@golden.test',
    cpf: generateCpf(9_100_004),
    senha: SENHA_PADRAO,
    guardianId: responsaveis[0]?.id ?? null,
    papeis: [{ schoolId: unidadeA.id, role: 'guardian' }],
  });

  // Notas de dois bimestres para o primeiro aluno (o boletim precisa de linha cheia) e do primeiro
  // bimestre para os quatro primeiros (a tela de notas precisa de coluna preenchida e vazia).
  const alocacoes = [alocacao1, alocacao2, alocacao3];
  const VALORES = [8.5, 7, 9.5];
  for (let indice = 0; indice < alocacoes.length; indice += 1) {
    for (const bimestre of [1, 2]) {
      await criarNota({
        networkId: redeId,
        enrollmentId: matriculas[0]?.id ?? '',
        classGroupSubjectId: alocacoes[indice]?.id ?? '',
        postedBy: professor.id,
        term: bimestre,
        value: (VALORES[indice] ?? 0) - (bimestre === 1 ? 0 : 1),
      });
    }
  }
  for (let indice = 1; indice < 4; indice += 1) {
    await criarNota({
      networkId: redeId,
      enrollmentId: matriculas[indice]?.id ?? '',
      classGroupSubjectId: alocacao1.id,
      postedBy: professor.id,
      term: 1,
      value: 6 + indice,
    });
  }

  for (let dia = 1; dia <= TOTAL_DE_DIAS_DE_CHAMADA; dia += 1) {
    const presente = dia % 5 !== 0;
    await criarFrequencia({
      networkId: redeId,
      enrollmentId: matriculas[0]?.id ?? '',
      attendanceDate: `${ANO_CORRENTE}-03-${doisDigitos(dia)}`,
      present: presente,
      excuse: presente ? null : 'Consulta médica com atestado.',
    });
  }

  /*
   * Meio-dia UTC de propósito: `formatarDataHora` imprime a hora local, e um carimbo à meia-noite
   * mudaria de dia conforme o fuso de quem roda a suíte. A hora em si é normalizada; o dia, não.
   */
  const comunicado1 = await criarComunicado({
    networkId: redeId, schoolId: unidadeA.id, authorUserId: admin.id,
    title: 'Reunião de pais e mestres',
    body: 'A reunião do primeiro bimestre acontece no dia 20, às 19h, no auditório da unidade.',
    publishedAt: new Date('2026-03-10T12:00:00.000Z'),
    destinatarios: [
      { guardianId: responsaveis[0]?.id ?? '', readAt: new Date('2026-03-11T12:00:00.000Z') },
      { guardianId: responsaveis[1]?.id ?? '' },
      { guardianId: responsaveis[2]?.id ?? '' },
    ],
  });
  const comunicado2 = await criarComunicado({
    networkId: redeId, schoolId: unidadeA.id, authorUserId: secretaria.id,
    title: 'Feira de ciências',
    body: 'A feira de ciências ocupa o pátio na primeira semana de maio.',
    publishedAt: new Date('2026-04-05T12:00:00.000Z'),
    destinatarios: [
      { guardianId: responsaveis[0]?.id ?? '' },
      { guardianId: responsaveis[1]?.id ?? '', readAt: new Date('2026-04-06T12:00:00.000Z') },
    ],
  });
  const comunicado3 = await criarComunicado({
    networkId: redeId, schoolId: unidadeB.id, authorUserId: admin.id,
    title: 'Rascunho ainda não publicado',
    body: 'Este comunicado não foi publicado e não aparece em mural nenhum.',
    publishedAt: null,
    destinatarios: [],
  });

  // O primeiro bimestre da turma fechado: é o estado que a tela de fechamento e o boletim mostram.
  const sql = sqlDeTeste();
  await sql`
    INSERT INTO term_closing (id, network_id, class_group_id, term, closed_at, closed_by)
    VALUES (${crypto.randomUUID()}, ${redeId}, ${turma1.id}, ${BIMESTRE_FECHADO},
            ${new Date('2026-04-20T12:00:00.000Z')}, ${professor.id})
  `;

  const comoQuem = (cpf: string): Promise<string> =>
    entrar({ redeSlug: rede.slug, cpf, senha: SENHA_PADRAO });

  const cookies: Record<Papel, string> = {
    anonimo: '',
    semPapel: await comoQuem(semPapel.cpf),
    admin: await comoQuem(admin.cpf),
    secretaria: await comoQuem(secretaria.cpf),
    professor: await comoQuem(professor.cpf),
    responsavel: await comoQuem(responsavel.cpf),
  };

  const marcadores = new Map<string, string>([
    [rede.id, '{{rede}}'],
    [unidadeA.id, '{{unidadeA}}'],
    [unidadeB.id, '{{unidadeB}}'],
    [anoCorrente.id, '{{anoCorrente}}'],
    [anoAnterior.id, '{{anoAnterior}}'],
    [admin.id, '{{usuarioAdmin}}'],
    [secretaria.id, '{{usuarioSecretaria}}'],
    [professor.id, '{{usuarioProfessor}}'],
    [responsavel.id, '{{usuarioResponsavel}}'],
    [semPapel.id, '{{usuarioSemPapel}}'],
    [turma1.id, '{{turma1}}'],
    [turma2.id, '{{turma2}}'],
    [portugues.id, '{{disciplinaPortugues}}'],
    [matematica.id, '{{disciplinaMatematica}}'],
    [historia.id, '{{disciplinaHistoria}}'],
    [alocacao1.id, '{{alocacao1}}'],
    [alocacao2.id, '{{alocacao2}}'],
    [alocacao3.id, '{{alocacao3}}'],
    [comunicado1.id, '{{comunicado1}}'],
    [comunicado2.id, '{{comunicado2}}'],
    [comunicado3.id, '{{comunicado3}}'],
    [ID_INEXISTENTE, '{{idInexistente}}'],
  ]);
  for (let indice = 0; indice < TOTAL_DE_ALUNOS; indice += 1) {
    const rotulo = doisDigitos(indice + 1);
    marcadores.set(alunos[indice]?.id ?? '', `{{aluno${rotulo}}}`);
    marcadores.set(responsaveis[indice]?.id ?? '', `{{responsavel${rotulo}}}`);
    marcadores.set(matriculas[indice]?.id ?? '', `{{matricula${rotulo}}}`);
  }

  return {
    cookies,
    marcadores,
    ids: {
      unidadeA: unidadeA.id,
      unidadeB: unidadeB.id,
      anoCorrente: anoCorrente.id,
      turma1: turma1.id,
      turma2: turma2.id,
      alocacao1: alocacao1.id,
      aluno1: alunos[0]?.id ?? '',
      matricula1: matriculas[0]?.id ?? '',
      comunicado1: comunicado1.id,
      inexistente: ID_INEXISTENTE,
    },
  };
}

/* --- As telas --------------------------------------------------------------- */

/**
 * Toda rota GET registrada em `src/web/app.ts`, `src/web/health.ts` e `src/web/routes/*.ts`, mais as
 * variações de estado que são telas diferentes com o mesmo caminho: a lista com e sem busca, o
 * formulário com e sem unidade escolhida, a página com e sem aviso de sucesso, a segunda página de
 * uma tabela paginada e o 404 de quem pede o registro de outra unidade.
 */
export function telasDoSistema(ids: CenarioGolden['ids']): readonly Tela[] {
  const mensagemDeSaida = encodeURIComponent('Sessão encerrada.');

  return [
    /* Sem sessão ----------------------------------------------------------- */
    { nome: 'anonimo-raiz', papel: 'anonimo', caminho: '/' },
    { nome: 'anonimo-login', papel: 'anonimo', caminho: '/login' },
    { nome: 'anonimo-login-apos-sair', papel: 'anonimo', caminho: `/login?ok=${mensagemDeSaida}` },
    { nome: 'anonimo-painel', papel: 'anonimo', caminho: '/painel' },
    { nome: 'anonimo-secretaria', papel: 'anonimo', caminho: '/secretaria' },
    { nome: 'anonimo-rota-inexistente', papel: 'anonimo', caminho: '/nao-existe' },
    { nome: 'anonimo-publico-inexistente', papel: 'anonimo', caminho: '/publico/nao-existe.css' },
    { nome: 'anonimo-publico-nome-recusado', papel: 'anonimo', caminho: '/publico/..%2Fsegredo' },

    /* Conta sem papel atribuído -------------------------------------------- */
    { nome: 'sem-papel-painel', papel: 'semPapel', caminho: '/painel' },
    { nome: 'sem-papel-raiz', papel: 'semPapel', caminho: '/' },

    /* Saúde ---------------------------------------------------------------- */
    { nome: 'saude-health', papel: 'anonimo', caminho: '/health' },
    { nome: 'saude-health-live', papel: 'anonimo', caminho: '/health/live' },

    /* Administração da rede ------------------------------------------------ */
    { nome: 'admin-raiz', papel: 'admin', caminho: '/' },
    { nome: 'admin-painel', papel: 'admin', caminho: '/painel' },
    { nome: 'admin-login-com-sessao', papel: 'admin', caminho: '/login' },
    { nome: 'admin-rede-painel', papel: 'admin', caminho: '/rede' },
    { nome: 'admin-rede-unidades', papel: 'admin', caminho: '/rede/unidades' },
    { nome: 'admin-rede-unidades-criada', papel: 'admin', caminho: '/rede/unidades?ok=unidade-criada' },
    { nome: 'admin-rede-unidade-nova', papel: 'admin', caminho: '/rede/unidades/nova' },
    { nome: 'admin-rede-usuarios', papel: 'admin', caminho: '/rede/usuarios' },
    { nome: 'admin-rede-usuarios-convidado', papel: 'admin', caminho: '/rede/usuarios?ok=usuario-convidado' },
    { nome: 'admin-rede-usuario-novo', papel: 'admin', caminho: '/rede/usuarios/novo' },
    { nome: 'admin-rede-anos-letivos', papel: 'admin', caminho: '/rede/anos-letivos' },
    { nome: 'admin-rede-anos-letivos-definido', papel: 'admin', caminho: '/rede/anos-letivos?ok=ano-definido' },
    { nome: 'admin-rede-ano-novo', papel: 'admin', caminho: '/rede/anos-letivos/novo' },
    { nome: 'admin-comunicados', papel: 'admin', caminho: '/comunicados' },
    { nome: 'admin-comunicados-unidade', papel: 'admin', caminho: `/comunicados?unidadeId=${ids.unidadeA}` },
    { nome: 'admin-comunicado-novo', papel: 'admin', caminho: '/comunicados/novo' },
    { nome: 'admin-comunicado-novo-unidade', papel: 'admin', caminho: `/comunicados/novo?unidadeId=${ids.unidadeA}` },
    { nome: 'admin-conta-senha', papel: 'admin', caminho: '/conta/senha' },
    { nome: 'admin-conta-senha-alterada', papel: 'admin', caminho: '/conta/senha?ok=senha-alterada' },
    { nome: 'admin-professor-proibido', papel: 'admin', caminho: '/professor' },

    /* Secretaria ------------------------------------------------------------ */
    { nome: 'secretaria-painel-redirecionado', papel: 'secretaria', caminho: '/painel' },
    { nome: 'secretaria-painel', papel: 'secretaria', caminho: '/secretaria' },
    { nome: 'secretaria-alunos-sem-busca', papel: 'secretaria', caminho: '/secretaria/alunos' },
    { nome: 'secretaria-alunos-busca', papel: 'secretaria', caminho: '/secretaria/alunos?q=Silva' },
    { nome: 'secretaria-alunos-busca-pagina-2', papel: 'secretaria', caminho: '/secretaria/alunos?q=Silva&p=2' },
    { nome: 'secretaria-aluno-novo', papel: 'secretaria', caminho: '/secretaria/alunos/novo' },
    { nome: 'secretaria-aluno-ficha', papel: 'secretaria', caminho: `/secretaria/alunos/${ids.aluno1}` },
    { nome: 'secretaria-aluno-inexistente', papel: 'secretaria', caminho: `/secretaria/alunos/${ids.inexistente}` },
    { nome: 'secretaria-aluno-responsavel-novo', papel: 'secretaria', caminho: `/secretaria/alunos/${ids.aluno1}/responsaveis/novo` },
    { nome: 'secretaria-aluno-matricular', papel: 'secretaria', caminho: `/secretaria/alunos/${ids.aluno1}/matricular` },
    { nome: 'secretaria-matricula-transferir', papel: 'secretaria', caminho: `/secretaria/matriculas/${ids.matricula1}/transferir` },
    { nome: 'secretaria-responsaveis', papel: 'secretaria', caminho: '/secretaria/responsaveis' },
    { nome: 'secretaria-responsaveis-pagina-2', papel: 'secretaria', caminho: '/secretaria/responsaveis?p=2' },
    { nome: 'secretaria-responsavel-novo', papel: 'secretaria', caminho: '/secretaria/responsaveis/novo' },
    { nome: 'secretaria-turmas', papel: 'secretaria', caminho: '/secretaria/turmas' },
    { nome: 'secretaria-turmas-filtradas', papel: 'secretaria', caminho: `/secretaria/turmas?unidade=${ids.unidadeA}&ano=${ids.anoCorrente}` },
    { nome: 'secretaria-turma-nova', papel: 'secretaria', caminho: '/secretaria/turmas/nova' },
    { nome: 'secretaria-turma-ficha', papel: 'secretaria', caminho: `/secretaria/turmas/${ids.turma1}` },
    { nome: 'secretaria-turma-ficha-pagina-2', papel: 'secretaria', caminho: `/secretaria/turmas/${ids.turma1}?pMatriculas=2` },
    { nome: 'secretaria-turma-disciplina-nova', papel: 'secretaria', caminho: `/secretaria/turmas/${ids.turma1}/disciplinas/nova` },
    { nome: 'secretaria-disciplinas', papel: 'secretaria', caminho: '/secretaria/disciplinas' },
    { nome: 'secretaria-disciplina-nova', papel: 'secretaria', caminho: '/secretaria/disciplinas/nova' },
    { nome: 'secretaria-comunicados', papel: 'secretaria', caminho: '/comunicados' },
    { nome: 'secretaria-comunicado-novo', papel: 'secretaria', caminho: '/comunicados/novo' },
    { nome: 'secretaria-rota-inexistente', papel: 'secretaria', caminho: '/nao-existe' },

    /* Professor ------------------------------------------------------------- */
    { nome: 'professor-painel-redirecionado', papel: 'professor', caminho: '/painel' },
    { nome: 'professor-painel', papel: 'professor', caminho: '/professor' },
    { nome: 'professor-notas', papel: 'professor', caminho: `/professor/disciplinas/${ids.alocacao1}/notas` },
    { nome: 'professor-notas-bimestre-2', papel: 'professor', caminho: `/professor/disciplinas/${ids.alocacao1}/notas?bimestre=2` },
    { nome: 'professor-chamada-data-fixa', papel: 'professor', caminho: `/professor/turmas/${ids.turma1}/chamada?data=${ANO_CORRENTE}-03-05` },
    { nome: 'professor-chamada-hoje', papel: 'professor', caminho: `/professor/turmas/${ids.turma1}/chamada` },
    { nome: 'professor-fechamento', papel: 'professor', caminho: `/professor/turmas/${ids.turma1}/fechamento` },
    { nome: 'professor-turma-alheia', papel: 'professor', caminho: `/professor/turmas/${ids.turma2}/fechamento` },
    { nome: 'professor-conta-senha', papel: 'professor', caminho: '/conta/senha' },

    /* Responsável ----------------------------------------------------------- */
    { nome: 'responsavel-painel-redirecionado', papel: 'responsavel', caminho: '/painel' },
    { nome: 'responsavel-painel', papel: 'responsavel', caminho: '/responsavel' },
    { nome: 'responsavel-boletim', papel: 'responsavel', caminho: `/responsavel/matriculas/${ids.matricula1}/boletim` },
    { nome: 'responsavel-frequencia', papel: 'responsavel', caminho: `/responsavel/matriculas/${ids.matricula1}/frequencia` },
    { nome: 'responsavel-frequencia-pagina-2', papel: 'responsavel', caminho: `/responsavel/matriculas/${ids.matricula1}/frequencia?p=2` },
    { nome: 'responsavel-mural', papel: 'responsavel', caminho: '/responsavel/mural' },
    { nome: 'responsavel-comunicado', papel: 'responsavel', caminho: `/responsavel/mural/${ids.comunicado1}` },
    { nome: 'responsavel-comunicado-alheio', papel: 'responsavel', caminho: `/responsavel/mural/${ids.inexistente}` },
    { nome: 'responsavel-conta-senha', papel: 'responsavel', caminho: '/conta/senha' },
  ];
}

/* --- Normalização ----------------------------------------------------------- */

const UUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
/**
 * As duas grafias do campo convivem enquanto o repositório é convertido para inglês. Se a
 * regex ficasse só com a antiga, o campo renomeado deixaria de ser normalizado e os 57
 * fixtures que o carregam passariam a divergir a cada execução, com um UUID novo por vez.
 */
const CHAVE_DE_IDEMPOTENCIA = /(name="_(?:chave|key)" value=")[^"]*(")/g;
/**
 * O nome publicado do CSS (I10) e o nome cru que `asset()` devolve quando ainda não houve
 * `bun run build:assets` viram o mesmo marcador. São a mesma linha da tela; congelar o hash faria
 * 71 arquivos mudarem a cada ajuste de folha de estilo, e um clone novo, sem manifesto, reprovaria
 * um refactor que não encostou em CSS nenhum.
 */
const ASSET_VERSIONADO = /\/(?:publico|public)\/app\.(?:[0-9a-f]{6,}\.)?css/g;
/** `Tue Mar 10 2026 09:00:00 GMT-0300 (Brasilia Standard Time)` — o `toString` de um `Date`. */
const DATA_DO_JAVASCRIPT =
  /[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT[+-]\d{4}(?: \([^)]*\))?/g;
const CARIMBO_ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const HORA_DO_DIA = /\b\d{2}:\d{2}\b/g;

/** Dois dias para cada lado cobrem o fuso local, o dia UTC e a virada da meia-noite no meio da suíte. */
const JANELA_DE_DIAS = 2;
const MS_POR_DIA = 86_400_000;

/**
 * Os dias que dependem de quando a suíte roda: o `hoje()` da secretaria (dia UTC), o `hoje()` do
 * professor (dia local) e o dia anterior e o seguinte da tela de chamada. Todos viram o mesmo
 * marcador — a distinção entre eles fica congelada em `professor-chamada-data-fixa`, que passa a
 * data na query e por isso não depende de relógio nenhum.
 */
function diasCorrentes(): string[] {
  const agora = Date.now();
  const dias = new Set<string>();
  for (let passo = -JANELA_DE_DIAS; passo <= JANELA_DE_DIAS; passo += 1) {
    const data = new Date(agora + passo * MS_POR_DIA);
    dias.add(`${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`);
    dias.add(data.toISOString().slice(0, 10));
  }
  return [...dias];
}

const emBrasileiro = (iso: string): string => {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
};

/**
 * Troca o que não pode ser previsto por marcadores estáveis, e nada além disso.
 *
 * A ordem importa: os carimbos de tempo inteiros saem antes das datas soltas, senão `2026-08-14` de
 * dentro de `2026-08-14T12:00:00Z` seria trocado primeiro e o resto do carimbo ficaria órfão. Os
 * identificadores conhecidos saem antes do varredor de UUID, senão todos virariam `{{uuid}}` e o
 * golden deixaria de distinguir o `href` de um aluno do `href` de outro.
 */
export function normalizar(texto: string, marcadores: ReadonlyMap<string, string>): string {
  let saida = texto;

  saida = saida.replace(CHAVE_DE_IDEMPOTENCIA, '$1{{chave}}$2');
  saida = saida.replace(ASSET_VERSIONADO, '/publico/app.{{hashDoCss}}.css');
  saida = saida.replaceAll(CORRELACAO, '{{correlacao}}');

  for (const [bruto, marcador] of marcadores) {
    if (bruto !== '') saida = saida.replaceAll(bruto, marcador);
  }

  saida = saida.replace(DATA_DO_JAVASCRIPT, '{{carimboDeTempo}}');
  saida = saida.replace(CARIMBO_ISO, '{{carimboDeTempo}}');

  for (const dia of diasCorrentes()) {
    saida = saida.replaceAll(dia, '{{diaCorrente}}');
    saida = saida.replaceAll(emBrasileiro(dia), '{{diaCorrente}}');
  }

  saida = saida.replace(HORA_DO_DIA, '{{hora}}');
  saida = saida.replace(UUID, '{{uuid}}');

  return saida;
}

/* --- Captura ---------------------------------------------------------------- */

/** O que entra no arquivo golden além do corpo: o que um refactor de rotas pode trocar sozinho. */
const CABECALHOS_CONGELADOS = ['Location', 'Content-Type', 'Cache-Control', 'Vary'] as const;

const SEPARADOR = '-'.repeat(78);

export async function capturar(tela: Tela, cenario: CenarioGolden): Promise<string> {
  const cookie = cenario.cookies[tela.papel];
  const cabecalhos: Record<string, string> = { 'X-Correlation-Id': CORRELACAO };
  if (cookie !== '') cabecalhos['Cookie'] = cookie;

  const resposta = await app.request(tela.caminho, { headers: cabecalhos });
  const corpo = await resposta.text();

  const linhas = [`GET ${tela.caminho}`, `papel: ${tela.papel}`, `status: ${resposta.status}`];
  for (const nome of CABECALHOS_CONGELADOS) {
    const valor = resposta.headers.get(nome);
    if (valor !== null) linhas.push(`${nome}: ${valor}`);
  }
  linhas.push(SEPARADOR, corpo);

  return normalizar(linhas.join('\n'), cenario.marcadores);
}

export const caminhoDoGolden = (nome: string): string => join(PASTA_GOLDEN, `${nome}.txt`);
