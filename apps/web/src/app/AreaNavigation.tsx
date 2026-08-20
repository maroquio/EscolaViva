import { Box, NavLink, Stack, Text } from '@mantine/core';
import { Link, useLocation } from 'react-router';
import type { SessionUserAsJson } from '@escolaviva/contracts/session';
import { IN_CAPITALS, MUTED_TEXT } from '../shared/ui/constants';
import { areasOffered, currentHrefIn } from './navigationAreas';

const THE_ONE_THEY_ARE_ON = 'page';

export function AreaNavigation({
  user,
}: {
  readonly user: SessionUserAsJson;
}): React.ReactElement {
  const { pathname } = useLocation();
  const areas = areasOffered(user);
  const currentHref = currentHrefIn(areas, pathname);

  return (
    <Box>
      <Stack gap="lg">
        {areas.map((area) => (
          <div key={area.title}>
            <Text size="xs" c={MUTED_TEXT} tt={IN_CAPITALS} component="h2">
              {area.title}
            </Text>
            {area.links.map((link) => {
              const isCurrent = link.href === currentHref;
              return (
                <NavLink
                  key={link.href}
                  component={Link}
                  to={link.href}
                  label={link.label}
                  active={isCurrent}
                  aria-current={isCurrent ? THE_ONE_THEY_ARE_ON : undefined}
                />
              );
            })}
          </div>
        ))}
      </Stack>
    </Box>
  );
}
