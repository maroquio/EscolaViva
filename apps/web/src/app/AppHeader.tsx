import { Anchor, Box, Burger, Button, Group, Text } from '@mantine/core';
import { Link, useNavigate } from 'react-router';
import type { SessionUserAsJson } from '@escolaviva/contracts/session';
import { APP_ROUTES } from '../constants';
import { useSignOut } from '../features/session/mutations';
import { MUTED_TEXT, ON_A_SINGLE_LINE, QUIET_BUTTON } from '../shared/ui/constants';
import classes from './Layout.module.css';
import {
  BRAND,
  NAVBAR_BREAKPOINT,
  NAVBAR_WIDTH,
  NAVIGATION_ID,
  assignedSchoolsInWords,
} from './constants';

const NO_SCHOOL_ASSIGNED = 'sem unidade atribuída';

const BRAND_COLUMN_SETS_THE_SPACING = 0;
const PUSHED_TO_THE_END = 'auto';

const whereTheyAreAssigned = (user: SessionUserAsJson): string => {
  const schools = [...new Set(user.roles.map((assignment) => assignment.schoolName))];
  if (schools.length === 0) return NO_SCHOOL_ASSIGNED;
  if (schools.length > 1) return assignedSchoolsInWords(schools.length);
  return schools[0] ?? NO_SCHOOL_ASSIGNED;
};

export function AppHeader({
  user,
  menuOpened,
  onToggleMenu,
}: {
  readonly user: SessionUserAsJson;
  readonly menuOpened: boolean;
  readonly onToggleMenu: () => void;
}): React.ReactElement {
  const signOut = useSignOut();
  const navigate = useNavigate();

  const leaveEvenIfTheServerRefused = (): void => {
    signOut.mutate(undefined, {
      onSettled: () => void navigate(APP_ROUTES.login, { replace: true }),
    });
  };

  return (
    <Group h="100%" px="md" gap={BRAND_COLUMN_SETS_THE_SPACING} wrap={ON_A_SINGLE_LINE}>
      <Group
        gap="sm"
        wrap={ON_A_SINGLE_LINE}
        className={classes.brandColumn}
        style={{ '--navbar-width': `${NAVBAR_WIDTH}px` }}
      >
        <Burger
          opened={menuOpened}
          onClick={onToggleMenu}
          hiddenFrom={NAVBAR_BREAKPOINT}
          size="sm"
          aria-label="Menu"
          aria-expanded={menuOpened}
          aria-controls={NAVIGATION_ID}
        />
        <Anchor component={Link} to={APP_ROUTES.root} fw={700}>
          {BRAND}
        </Anchor>
      </Group>

      <Box visibleFrom="sm">
        <Text size="sm">{user.networkName}</Text>
        <Text size="xs" c={MUTED_TEXT}>
          {whereTheyAreAssigned(user)}
        </Text>
      </Box>

      <Group gap="md" wrap={ON_A_SINGLE_LINE} style={{ marginInlineStart: PUSHED_TO_THE_END }}>
        <Text size="sm" title={user.email}>
          {user.name}
        </Text>
        <Button
          variant={QUIET_BUTTON}
          size="xs"
          loading={signOut.isPending}
          onClick={leaveEvenIfTheServerRefused}
        >
          Sair
        </Button>
      </Group>
    </Group>
  );
}
