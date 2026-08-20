import { describe, expect, test, vi } from 'vitest';
import { ApiError, applyErrors } from '../../../src/shared/api/error';

describe('ApiError — the array the API sends is the array React Hook Form receives, because both ends already speak { field, code, message } and there is no translator between them', () => {
  test('carries the status, the problems and the correlation code', () => {
    const error = new ApiError(422, [{ field: 'name', code: 'x', message: 'Informe o nome.' }], 'abc');

    expect(error.status).toBe(422);
    expect(error.errors[0]?.field).toBe('name');
    expect(error.correlationId).toBe('abc');
  });

  test('its message is the first problem, so an uncaught one still reads', () => {
    const error = new ApiError(422, [{ code: 'x', message: 'Não foi possível concluir.' }], '');

    expect(error.message).toBe('Não foi possível concluir.');
  });

  test('with no problems at all it still says something a person can read', () => {
    const error = new ApiError(0, [], '');

    expect(error.message).not.toBe('');
  });

  test('messageWithNoField() is the one that becomes the warning at the top of the form', () => {
    const error = new ApiError(
      422,
      [
        { field: 'cpf', code: 'x', message: 'CPF inválido.' },
        { code: 'y', message: 'Já existe um usuário com este e-mail.' },
      ],
      '',
    );

    expect(error.messageWithNoField()).toBe('Já existe um usuário com este e-mail.');
  });

  test('and is null when every problem belongs to a field', () => {
    const error = new ApiError(422, [{ field: 'cpf', code: 'x', message: 'CPF inválido.' }], '');

    expect(error.messageWithNoField()).toBeNull();
  });
});

describe('applyErrors — where each problem is routed on its way to a screen: to its input, or to the warning at the top', () => {
  const collect = (): {
    set: [string, string][];
    warnings: string[];
    setError: never;
    warn: (message: string) => void;
  } => {
    const set: [string, string][] = [];
    const warnings: string[] = [];
    return {
      set,
      warnings,
      setError: ((field: string, options: { message?: string }) =>
        set.push([field, options.message ?? ''])) as never,
      warn: (message: string) => warnings.push(message),
    };
  };

  test('a problem with a known field goes to the input, one without goes to the warning', () => {
    const { set, warnings, setError, warn } = collect();
    const error = new ApiError(
      422,
      [
        { field: 'cpf', code: 'x', message: 'CPF inválido.' },
        { code: 'y', message: 'Já existe um usuário com este e-mail.' },
      ],
      'abc',
    );

    applyErrors(error, setError, warn, ['cpf', 'email']);

    expect(set).toEqual([['cpf', 'CPF inválido.']]);
    expect(warnings).toEqual(['Já existe um usuário com este e-mail.']);
  });

  test('a problem naming a field the form does not have becomes a warning, not silence, which is what the fourth argument exists for: setError on a name the form never registered throws nothing, warns nothing and renders nothing, leaving a form that refused to submit and says nothing about why', () => {
    const { set, warnings, setError, warn } = collect();
    const error = new ApiError(
      422,
      [{ field: 'roleAssignments', code: 'z', message: 'Escolha ao menos uma unidade.' }],
      'abc',
    );

    applyErrors(error, setError, warn, ['name', 'cpf']);

    expect(set).toEqual([]);
    expect(warnings).toEqual(['Escolha ao menos uma unidade.']);
  });

  test('two problems with no field are joined, because warn holds a single message', () => {
    const { warnings, setError, warn } = collect();
    const error = new ApiError(
      409,
      [
        { code: 'a', message: 'A turma já está fechada.' },
        { code: 'b', message: 'O ano letivo já foi encerrado.' },
      ],
      'abc',
    );

    applyErrors(error, setError, warn, ['name']);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('A turma já está fechada.');
    expect(warnings[0]).toContain('O ano letivo já foi encerrado.');
  });

  test('what is not an ApiError still tells the person something', () => {
    const { set, warnings, setError, warn } = collect();

    applyErrors(new Error('kaboom'), setError, warn, ['name']);

    expect(set).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).not.toContain('kaboom');
  });

  test('several field problems all reach their inputs', () => {
    const { set, setError, warn } = collect();
    const error = new ApiError(
      422,
      [
        { field: 'name', code: 'a', message: 'Informe o nome.' },
        { field: 'cpf', code: 'b', message: 'CPF inválido.' },
      ],
      '',
    );

    applyErrors(error, setError, warn, ['name', 'cpf']);

    expect(set).toEqual([
      ['name', 'Informe o nome.'],
      ['cpf', 'CPF inválido.'],
    ]);
  });
});

describe('a refusal with no detail at all, arriving outside the envelope — a 502 from a proxy, a captive portal page, a 413 from an intermediary: client.ts builds them all with body.errors ?? [], so the routing loop has nothing to iterate', () => {
  test('still reaches the person, and carries the code support will ask for, because silence is the one answer a form may never give and sixteen of them once gave it', () => {
    const setError = vi.fn();
    const warn = vi.fn();

    applyErrors(new ApiError(502, [], 'abc-123'), setError, warn, ['name']);

    expect(setError).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('502');
    expect(String(warn.mock.calls[0]?.[0])).toContain('abc-123');
  });

  test('and a refusal that does come with detail is untouched', () => {
    const setError = vi.fn();
    const warn = vi.fn();

    applyErrors(
      new ApiError(422, [{ field: 'name', code: 'required', message: 'Informe o nome.' }], 'x'),
      setError,
      warn,
      ['name'],
    );

    expect(setError).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });
});
