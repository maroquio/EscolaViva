import { closeDatabase, unitOfWork } from '../apps/api/src/shared/db';
import { E2E_CLEAN_MESSAGE } from './constants';

const MARK = '%[e2e]%';

const FIRST_TEST_DAY = '2026-09-01';

const GUARDIAN_UNDER_TEST = '10000001090';

const removed = await unitOfWork(async ({ sql }) => {
  const students = sql`SELECT id FROM student WHERE name LIKE ${MARK}`;
  const users = sql`SELECT id FROM app_user WHERE name LIKE ${MARK}`;
  const schools = sql`SELECT id FROM school WHERE name LIKE ${MARK}`;

  const counted: {
    alunos: number;
    usuarios: number;
    escolas: number;
    fechamentos: number;
    chamadas: number;
    leituras: number;
  }[] = await sql`
    SELECT
      (SELECT count(*)::int FROM student WHERE name LIKE ${MARK}) AS alunos,
      (SELECT count(*)::int FROM app_user WHERE name LIKE ${MARK}) AS usuarios,
      (SELECT count(*)::int FROM school WHERE name LIKE ${MARK}) AS escolas,
      (SELECT count(*)::int FROM term_closing) AS fechamentos,
      (SELECT count(*)::int FROM attendance WHERE attendance_date >= ${FIRST_TEST_DAY}) AS chamadas,
      (SELECT count(*)::int FROM announcement_recipient
        WHERE read_at IS NOT NULL
          AND user_id IN (SELECT id FROM app_user WHERE cpf = ${GUARDIAN_UNDER_TEST})) AS leituras`;

  await sql`DELETE FROM grade WHERE enrollment_id IN (SELECT id FROM enrollment WHERE student_id IN (${students}))`;
  await sql`DELETE FROM attendance WHERE enrollment_id IN (SELECT id FROM enrollment WHERE student_id IN (${students}))`;
  await sql`DELETE FROM enrollment WHERE student_id IN (${students})`;
  await sql`DELETE FROM student_guardian WHERE student_id IN (${students})`;
  await sql`DELETE FROM student WHERE name LIKE ${MARK}`;

  await sql`DELETE FROM announcement_recipient WHERE user_id IN (${users})`;
  await sql`DELETE FROM student_guardian WHERE user_id IN (${users})`;
  await sql`DELETE FROM session WHERE user_id IN (${users})`;
  await sql`DELETE FROM user_role WHERE user_id IN (${users})`;
  await sql`DELETE FROM app_user WHERE name LIKE ${MARK}`;

  await sql`DELETE FROM term_closing`;

  await sql`DELETE FROM attendance WHERE attendance_date >= ${FIRST_TEST_DAY}`;

  await sql`
    UPDATE announcement_recipient SET read_at = NULL
    WHERE user_id IN (SELECT id FROM app_user WHERE cpf = ${GUARDIAN_UNDER_TEST})`;

  await sql`DELETE FROM user_role WHERE school_id IN (${schools})`;
  await sql`DELETE FROM class_group WHERE school_id IN (${schools})`;
  await sql`DELETE FROM school WHERE name LIKE ${MARK}`;

  return (
    counted[0] ?? { alunos: 0, usuarios: 0, escolas: 0, fechamentos: 0, chamadas: 0, leituras: 0 }
  );
});

console.log(E2E_CLEAN_MESSAGE(removed));

await closeDatabase();
