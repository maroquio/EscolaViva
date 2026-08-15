import { alocarProfessor } from './aplicacao/alocarProfessor';
import { cadastrarAluno } from './aplicacao/cadastrarAluno';
import { cadastrarDisciplina } from './aplicacao/cadastrarDisciplina';
import { cadastrarResponsavel } from './aplicacao/cadastrarResponsavel';
import { cadastrarTurma } from './aplicacao/cadastrarTurma';
import {
  alunoPorId,
  alunoTemMatricula,
  buscarAlunos,
  contagensPorUnidade,
  listarAnosLetivos,
  listarDisciplinas,
  listarResponsaveis,
  listarTurmaDisciplinas,
  listarTurmas,
  matriculaPorId,
  matriculasAtivasDaTurma,
  matriculasAtivasDosAlunos,
  matriculasDoResponsavel,
  paginaDeAlunos,
  paginaDeAnosLetivos,
  paginaDeDisciplinas,
  paginaDeMatriculasAtivasDaTurma,
  paginaDeMatriculasDoAluno,
  paginaDeMatriculasDoResponsavel,
  paginaDeResponsaveis,
  paginaDeResponsaveisDoAluno,
  paginaDeTurmaDisciplinas,
  paginaDeTurmas,
  responsaveisDaUnidade,
  responsaveisDoAluno,
  responsavelPorId,
  totaisDoAlcance,
  turmaDisciplinaPorId,
  turmaDisciplinasDoProfessor,
  turmaPorId,
  turmasDoProfessor,
} from './aplicacao/consultas';
import { definirAnoLetivo } from './aplicacao/definirAnoLetivo';
import { matricular } from './aplicacao/matricular';
import { transferir } from './aplicacao/transferir';
import { vincularResponsavel } from './aplicacao/vincularResponsavel';

export type { Aluno } from './dominio/aluno';
export type { AnoLetivo } from './dominio/anoLetivo';
export type { Disciplina } from './dominio/disciplina';
export type { Matricula, SituacaoMatricula } from './dominio/matricula';
export type { Responsavel, VinculoResponsavel } from './dominio/responsavel';
export type { Turma, TurmaDisciplina } from './dominio/turma';
export type { ContagemDaUnidade, FiltroDeTurma } from './aplicacao/consultas';

/**
 * A única porta de entrada do módulo: quem estuda, onde e com quem. Casos de uso devolvem
 * `Resultado`; consultas devolvem o valor direto. Nada aqui expõe linha de banco.
 */
export const academico = {
  definirAnoLetivo,
  listarAnosLetivos,
  paginaDeAnosLetivos,
  cadastrarDisciplina,
  listarDisciplinas,
  paginaDeDisciplinas,
  cadastrarTurma,
  listarTurmas,
  paginaDeTurmas,
  contagensPorUnidade,
  totaisDoAlcance,
  turmaPorId,
  alocarProfessor,
  listarTurmaDisciplinas,
  paginaDeTurmaDisciplinas,
  turmaDisciplinaPorId,
  turmaDisciplinasDoProfessor,
  turmasDoProfessor,
  cadastrarAluno,
  buscarAlunos,
  paginaDeAlunos,
  alunoPorId,
  alunoTemMatricula,
  cadastrarResponsavel,
  listarResponsaveis,
  responsavelPorId,
  paginaDeResponsaveis,
  vincularResponsavel,
  responsaveisDoAluno,
  paginaDeResponsaveisDoAluno,
  matricular,
  transferir,
  matriculaPorId,
  matriculasAtivasDaTurma,
  paginaDeMatriculasAtivasDaTurma,
  matriculasAtivasDosAlunos,
  matriculasDoResponsavel,
  paginaDeMatriculasDoResponsavel,
  paginaDeMatriculasDoAluno,
  responsaveisDaUnidade,
};

/**
 * As constantes do módulo que alguém de fora precisa ler. Os nomes ganham o sufixo do dono na
 * travessia: dentro de `academico/` os arquivos importam `LIMITES` de `./constantes`, mas em
 * `web/rotas/secretaria.ts` conviverão limites de três módulos, e `LIMITES.aluno.nome` sozinho não
 * diria de quem é a política. `VOCABULARIO_DO_ACADEMICO.turno` diz.
 *
 * A lista é curta de propósito. `CODIGOS`, `MENSAGENS` e `ERROS_INTERNOS` NÃO saem daqui: eles
 * viajam dentro do `Resultado` que os casos de uso devolvem, e ninguém de fora os alcança pelo
 * nome. Exportá-los "por completude" criava três nomes públicos sem um único importador — e um
 * nome público sem importador mente sobre onde a verdade mora, porque sugere que existe alguém
 * do outro lado que precisa combinar com ele.
 */
export {
  CAMPOS as CAMPOS_DO_ACADEMICO,
  LIMITES as LIMITES_DO_ACADEMICO,
  VOCABULARIO as VOCABULARIO_DO_ACADEMICO,
} from './constantes';

/** Vocabulário fechado do domínio: fonte de tipo, e por isso reexportado direto de `dominio/`. */
export { MATRICULA_ATIVA, SITUACOES_DE_MATRICULA } from './dominio/matricula';
export { TURNOS } from './dominio/turma';
