import { Button } from '@mantine/core';
import { describe, expect, test } from 'vitest';
import { renderWithProviders } from '../../testSupport';

describe('the theme reaches the components, which the tests beside this one cannot see: a well-formed object the provider ignores passes every assertion there and still leaves the screens looking like default Mantine', () => {
  test('the default radius the provider publishes is square, read from the custom property on the root — the value every control reads — because jsdom evaluates no Mantine stylesheet and a computed radius here is empty whatever the theme says', () => {
    renderWithProviders(<Button>salvar</Button>);

    const root = getComputedStyle(document.documentElement);

    expect(root.getPropertyValue('--mantine-radius-default').trim()).toBe('0rem');
  });

  test('the provider publishes the brand scale as CSS variables', () => {
    renderWithProviders(<Button>salvar</Button>);

    const root = document.documentElement;
    const shade = getComputedStyle(root).getPropertyValue('--mantine-color-escola-6').trim();

    expect(shade).toContain('oklch');
  });
});
