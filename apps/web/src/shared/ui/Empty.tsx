import { Button, Stack, Text } from '@mantine/core';
import { Link } from 'react-router';
import { SECONDARY_BUTTON } from './constants';

export type EmptyProps = {
  readonly title: string;
  readonly text?: string;
  readonly action?: { readonly href: string; readonly text: string };
};

export function Empty({ title, text, action }: EmptyProps): React.ReactElement {
  return (
    <Stack gap="sm">
      <Text fw={700}>{title}</Text>
      {text !== undefined && <Text>{text}</Text>}
      {action !== undefined && (
        <div>
          <Button component={Link} to={action.href} variant={SECONDARY_BUTTON}>
            {action.text}
          </Button>
        </div>
      )}
    </Stack>
  );
}
