/*
 * Changing your own password.
 *
 * The confirmation is checked at the edge, before the use case runs: verifying a hash costs a
 * hundred milliseconds, and spending them to discover the person mistyped the repeat is spending
 * them for nothing. Nothing about a password reaches the response or the log.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { API } from '../../src/http/constants';
import { clearDatabase } from '../support/database';
import { DEFAULT_PASSWORD, fullScenario } from '../support/factories';
import { read, signIn, write } from './support';

const PASSWORD = `${API.versionedPrefix}/account/password`;
const SESSION = `${API.versionedPrefix}/session`;
const NEW_PASSWORD = 'outra-senha-longa-1234';

type Refusal = { errors: { field?: string; code: string; message: string }[] };

const signedIn = async (): Promise<{ cookie: string; slug: string; cpf: string }> => {
  const scenario = await fullScenario();
  const cookie = await signIn({
    networkSlug: scenario.network.slug,
    cpf: scenario.registrar.cpf,
    password: scenario.password,
  });
  return { cookie, slug: scenario.network.slug, cpf: scenario.registrar.cpf };
};

describe('changing the password', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('with the current password and a matching confirmation it answers 204', async () => {
    const { cookie } = await signedIn();

    const response = await write(
      'PUT',
      PASSWORD,
      {
        currentPassword: DEFAULT_PASSWORD,
        newPassword: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      },
      cookie,
    );

    expect(response.status).toBe(204);
  });

  /*
   * The change has to be real, and only signing in with the new password proves it. A 204 over an
   * unchanged row would look identical from the outside.
   */
  test('the new password is what opens the next session, and the old one stops working', async () => {
    const { cookie, slug, cpf } = await signedIn();

    await write(
      'PUT',
      PASSWORD,
      {
        currentPassword: DEFAULT_PASSWORD,
        newPassword: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      },
      cookie,
    );
    const withNew = await write('POST', SESSION, { networkSlug: slug, cpf, password: NEW_PASSWORD });
    const withOld = await write('POST', SESSION, {
      networkSlug: slug,
      cpf,
      password: DEFAULT_PASSWORD,
    });

    expect(withNew.status).toBe(201);
    expect(withOld.status).toBe(422);
  });

  test('a confirmation that does not match is refused, and the password is unchanged', async () => {
    const { cookie, slug, cpf } = await signedIn();

    const response = await write(
      'PUT',
      PASSWORD,
      {
        currentPassword: DEFAULT_PASSWORD,
        newPassword: NEW_PASSWORD,
        passwordConfirmation: 'outra-coisa-1234',
      },
      cookie,
    );
    const stillWorks = await write('POST', SESSION, {
      networkSlug: slug,
      cpf,
      password: DEFAULT_PASSWORD,
    });

    expect(response.status).toBe(422);
    expect(stillWorks.status).toBe(201);
  });

  test('a wrong current password is refused', async () => {
    const { cookie } = await signedIn();

    const response = await write(
      'PUT',
      PASSWORD,
      {
        currentPassword: 'nao-e-a-atual',
        newPassword: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      },
      cookie,
    );

    expect(response.status).toBe(422);
  });

  test('no password of any kind comes back in a refusal', async () => {
    const { cookie } = await signedIn();

    const response = await write(
      'PUT',
      PASSWORD,
      {
        currentPassword: 'nao-e-a-atual',
        newPassword: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      },
      cookie,
    );
    const raw = await response.text();

    expect(raw).not.toContain(NEW_PASSWORD);
    expect(raw).not.toContain('nao-e-a-atual');
    expect(raw).not.toContain(DEFAULT_PASSWORD);
  });

  test('a body missing a field is a 400, not a 422', async () => {
    const { cookie } = await signedIn();

    const response = await write('PUT', PASSWORD, { newPassword: NEW_PASSWORD }, cookie);
    const refusal = (await response.json()) as Refusal;

    expect(response.status).toBe(400);
    expect(refusal.errors.length).toBeGreaterThan(0);
  });

  test('an anonymous caller gets 401, never a redirect to a screen', async () => {
    const response = await write('PUT', PASSWORD, {
      currentPassword: DEFAULT_PASSWORD,
      newPassword: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    });

    expect(response.status).toBe(401);
  });

  test('the account route is not readable: there is nothing to GET there', async () => {
    const { cookie } = await signedIn();

    const response = await read(PASSWORD, cookie);

    expect(response.status).toBe(404);
  });
});
