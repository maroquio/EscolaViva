import { Button, Stack, Text, Title } from '@mantine/core';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ALERT_ROLE, RETRY_LABEL, SECONDARY_BUTTON, UNEXPECTED_ERROR_TITLE } from './constants';

type Props = { readonly children: ReactNode };
type State = { readonly failed: boolean };

const reportToTheBrowserConsole = (error: Error, info: ErrorInfo): void => {
  console.error(error, info.componentStack);
};

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportToTheBrowserConsole(error, info);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <Stack gap="md" role={ALERT_ROLE}>
        <Title order={2}>{UNEXPECTED_ERROR_TITLE}</Title>
        <Text>
          Esta parte da tela não pôde ser exibida. O restante da aplicação continua funcionando.
        </Text>
        <div>
          <Button onClick={() => this.setState({ failed: false })} variant={SECONDARY_BUTTON}>
            {RETRY_LABEL}
          </Button>
        </div>
      </Stack>
    );
  }
}
