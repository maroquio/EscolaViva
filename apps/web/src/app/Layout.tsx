import { Anchor, AppShell } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Outlet } from 'react-router';
import { useSession } from '../features/session/queries';
import { Loading } from '../shared/ui/Loading';
import { AppHeader } from './AppHeader';
import { AreaNavigation } from './AreaNavigation';
import classes from './Layout.module.css';
import {
  CONTENT_ID,
  HEADER_HEIGHT,
  NAVBAR_BREAKPOINT,
  NAVBAR_WIDTH,
  NAVIGATION_ID,
} from './constants';

export function Layout(): React.ReactElement {
  const { data: user } = useSession();
  const [menuOpened, { toggle: toggleMenu }] = useDisclosure(false);

  if (user === undefined) return <Loading />;

  return (
    <>
      <Anchor href={`#${CONTENT_ID}`} className={classes.skipToContent}>
        Pular para o conteúdo
      </Anchor>

      <AppShell
        header={{ height: HEADER_HEIGHT }}
        navbar={{
          width: NAVBAR_WIDTH,
          breakpoint: NAVBAR_BREAKPOINT,
          collapsed: { mobile: !menuOpened },
        }}
        padding="md"
      >
        <AppShell.Header>
          <AppHeader user={user} menuOpened={menuOpened} onToggleMenu={toggleMenu} />
        </AppShell.Header>

        <AppShell.Navbar p="md" id={NAVIGATION_ID} aria-label="Navegação principal">
          <AreaNavigation user={user} />
        </AppShell.Navbar>

        <AppShell.Main id={CONTENT_ID} tabIndex={-1}>
          <Outlet />
        </AppShell.Main>
      </AppShell>
    </>
  );
}
