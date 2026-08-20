import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, test } from 'vitest';
import { server } from '../testSetup';
import { renderRoutes, userWith } from '../testSupport';
import { Layout } from '../../src/app/Layout';

const SESSION = '*/api/v1/session';

const signedInAs = (...roles: Parameters<typeof userWith>[0]): void => {
  server.use(http.get(SESSION, () => HttpResponse.json({ user: userWith(roles) })));
};

const theContentTheLayoutsOutletOwns = <span>conteúdo</span>;

const layoutAt = (path: string): void => {
  renderRoutes(
    [
      {
        path: '/',
        element: <Layout />,
        children: [{ path: '*', element: theContentTheLayoutsOutletOwns }],
      },
    ],
    path,
  );
};

const navigationLinks = (): string[] =>
  within(screen.getByRole('navigation', { name: 'Navegação principal' }))
    .getAllByRole('link')
    .map((link) => link.textContent?.trim() ?? '');

describe('what the navigation offers, which is only what the person holds', () => {
  test('a guardian sees the guardian area and the account, and nothing else', async () => {
    signedInAs('guardian');
    layoutAt('/guardian');

    await screen.findByText('conteúdo');

    expect(navigationLinks()).toEqual([
      'Painel do responsável',
      'Mural',
      'Trocar senha',
    ]);
  });

  test('two roles produce two areas, plus what both share — the guard decides where they land, and cutting the navigation to the landing role would strand the mother who is also the school registrar', async () => {
    signedInAs('registrar', 'guardian');
    layoutAt('/registrar');

    await screen.findByText('conteúdo');

    expect(navigationLinks()).toContain('Alunos');
    expect(navigationLinks()).toContain('Mural');
  });

  test('the announcements link is offered to a registrar, one of the two roles the server opens that screen to', async () => {
    signedInAs('registrar');
    layoutAt('/registrar');

    await screen.findByText('conteúdo');

    expect(navigationLinks()).toContain('Comunicados');
  });

  test('and withheld from a teacher, who must not see a link to a screen whose every request answers 403', async () => {
    signedInAs('teacher');
    layoutAt('/teacher');

    await screen.findByText('conteúdo');

    expect(navigationLinks()).not.toContain('Comunicados');
  });
});

describe('where the person is standing', () => {
  test('the deepest matching link is the current one — /registrar/students/abc matches both areas, and marking the dashboard while the reader is three levels inside the student list is worse than marking nothing', async () => {
    signedInAs('registrar');
    layoutAt('/registrar/students/abc');

    await screen.findByText('conteúdo');

    expect(screen.getByRole('link', { name: 'Alunos' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Painel da secretaria' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  test('and no link is marked on a screen the navigation does not list — asked inside the navigation, because indexing the whole document offsets the answer by the skip link and the brand and leaves the last entries uninspected', async () => {
    signedInAs('registrar');
    layoutAt('/no-role');

    await screen.findByText('conteúdo');

    const navigation = screen.getByRole('navigation', { name: 'Navegação principal' });
    const marked = within(navigation)
      .getAllByRole('link')
      .filter((link) => link.hasAttribute('aria-current'));
    expect(marked).toEqual([]);
  });
});

describe('the header', () => {
  test('names the network and the person, with the e-mail as the tooltip', async () => {
    signedInAs('registrar');
    layoutAt('/registrar');

    await screen.findByText('conteúdo');

    expect(screen.getByText('Rede Demonstração')).toBeVisible();
    expect(screen.getByText('Ana Souza')).toHaveAttribute('title', 'ana@escolaviva.test');
  });

  test('several schools are counted rather than picked from, because naming one of several would make the header lie', async () => {
    signedInAs('registrar', 'teacher');
    layoutAt('/registrar');

    await screen.findByText('conteúdo');

    expect(screen.getByText('2 escolas')).toBeVisible();
  });

  test('an account with no assignment says so instead of showing an empty line', async () => {
    signedInAs();
    layoutAt('/no-role');

    await screen.findByText('conteúdo');

    expect(screen.getByText('sem unidade atribuída')).toBeVisible();
  });
});

describe('the menu button on a phone', () => {
  test('the menu button says whether the menu it controls is open — Mantine tracks the state on the inner element and never announces it', async () => {
    signedInAs('registrar');
    layoutAt('/registrar');

    await screen.findByText('conteúdo');

    const menu = screen.getByRole('button', { name: 'Menu' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
  });

  test('and names the region it controls', async () => {
    signedInAs('registrar');
    layoutAt('/registrar');

    await screen.findByText('conteúdo');

    const controls = screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-controls');
    expect(controls).not.toBeNull();
    expect(document.getElementById(controls as string)).toBe(
      screen.getByRole('navigation', { name: 'Navegação principal' }),
    );
  });
});

describe('keyboard access', () => {
  test('the skip link starts off-screen — the class name once migrated from the SSR pages without its rule and the link sat visible on every signed-in screen, and the computed transform this reads is in the document only because vite.config.ts processes .module.css', async () => {
    signedInAs('registrar');
    layoutAt('/registrar');

    await screen.findByText('conteúdo');

    const skip = screen.getByRole('link', { name: /pular para o conteúdo/i });
    expect(getComputedStyle(skip).transform).toBe('translateY(-200%)');
    expect(getComputedStyle(skip).position).toBe('absolute');
  });

  test('and slides back into view once it takes focus, without which it is merely hidden and the keyboard never reaches the content — found by text rather than by role because a role query computes visibility, and jsdom caches that computed declaration before the focus happens', async () => {
    signedInAs('registrar');
    layoutAt('/registrar');

    await screen.findByText('conteúdo');

    const skip = screen.getByText(/pular para o conteúdo/i);
    skip.focus();

    expect(getComputedStyle(skip).transform).toBe('translateY(0)');
  });

  test('the skip link points at the content region, without which reaching the content from the top means tabbing through every navigation item, on every page, every time', async () => {
    signedInAs('registrar');
    layoutAt('/registrar');

    await screen.findByText('conteúdo');

    const skip = screen.getByRole('link', { name: /pular para o conteúdo/i });
    expect(skip).toHaveAttribute('href', '#conteudo');
    expect(document.getElementById('conteudo')).not.toBeNull();
  });

  test('and comes before the header, not after it — a skip link inside the region it skips to is reached only after tabbing through everything it was meant to skip', async () => {
    signedInAs('registrar');
    layoutAt('/registrar');

    await screen.findByText('conteúdo');

    const skip = screen.getByRole('link', { name: /pular para o conteúdo/i });
    const content = document.getElementById('conteudo');
    expect(skip.compareDocumentPosition(content as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(content?.contains(skip)).toBe(false);
  });
});

describe("the landmarks a screen reader is offered — Mantine's AppShell.Main and AppShell.Navbar already are the main and the nav, so wrapping either in another of the same kind compiles, looks identical and offers the reader a choice between a thing and itself", () => {
  test('there is exactly one main region', async () => {
    signedInAs('registrar');
    layoutAt('/registrar');

    await screen.findByText('conteúdo');

    expect(document.querySelectorAll('main')).toHaveLength(1);
  });

  test('and exactly one navigation, carrying the name', async () => {
    signedInAs('registrar');
    layoutAt('/registrar');

    await screen.findByText('conteúdo');

    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(screen.getByRole('navigation')).toHaveAccessibleName('Navegação principal');
  });
});

describe('leaving', () => {
  test('a sign-out the server refused still leaves — the cookie may already be gone, and staying is the worse outcome', async () => {
    signedInAs('registrar');
    server.use(
      http.delete(SESSION, () =>
        HttpResponse.json({ errors: [], correlationId: '' }, { status: 500 }),
      ),
    );

    const { user } = renderRoutes(
      [
        {
          path: '/',
          element: <Layout />,
          children: [{ path: '*', element: theContentTheLayoutsOutletOwns }],
        },
        { path: '/login', element: <span>Entrar</span> },
      ],
      '/registrar',
    );

    await screen.findByText('conteúdo');

    await user.click(screen.getByRole('button', { name: 'Sair' }));

    expect(await screen.findByText('Entrar')).toBeVisible();
  });
});
