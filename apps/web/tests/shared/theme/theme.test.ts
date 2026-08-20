import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DEFAULT_THEME } from '@mantine/core';
import { describe, expect, test } from 'vitest';
import { theme } from '../../../src/shared/theme/theme';
import {
  ABSENCE_COLOUR,
  AGREEMENT_COLOUR,
  CAUTION_COLOUR,
  NOTICE_COLOUR,
  REFUSAL_COLOUR,
} from '../../../src/shared/ui/constants';

const SEMANTIC_COLOURS = [
  REFUSAL_COLOUR,
  AGREEMENT_COLOUR,
  NOTICE_COLOUR,
  CAUTION_COLOUR,
  ABSENCE_COLOUR,
];

const POSTCSS_CONFIG_ON_DISK = resolve(process.cwd(), 'postcss.config.cjs');

const INJECTED_BREAKPOINT = /'mantine-breakpoint-(xs|sm|md|lg|xl)':\s*'([^']+)'/g;

describe('what Mantine requires to be there', () => {
  test('the primary palette has the ten shades Mantine indexes', () => {
    const primary = theme.colors?.[theme.primaryColor ?? ''];

    expect(primary).toHaveLength(10);
    expect(primary?.every((shade) => /^#|^oklch|^rgb/.test(shade))).toBe(true);
  });

  test('the theme carries the brand palette and nothing else, because a semantic colour is a `color` prop from shared/ui/constants and never an extra palette here', () => {
    expect(Object.keys(theme.colors ?? {})).toEqual([theme.primaryColor]);
  });

  test('and each of those five semantic colours is a name Mantine already ships, so `color={REFUSAL_COLOUR}` resolves to a scale instead of a raw CSS colour', () => {
    for (const colour of SEMANTIC_COLOURS) {
      expect(Object.keys(DEFAULT_THEME.colors)).toContain(colour);
    }
  });

  test('font sizes and spacing cover the five keys it looks up', () => {
    for (const key of ['xs', 'sm', 'md', 'lg', 'xl'] as const) {
      expect(theme.fontSizes?.[key]).toBeDefined();
      expect(theme.spacing?.[key]).toBeDefined();
    }
  });
});

describe('the decisions theme.ts is the only place to carry, and which a redesign would undo', () => {
  test('the corners stay square, which is not what Mantine does when left alone', () => {
    expect(theme.defaultRadius).toBe(0);
    expect(DEFAULT_THEME.defaultRadius).not.toBe(0);
  });

  test('and no radius key smuggles a curve back in', () => {
    const radii = Object.values(theme.radius ?? {});

    expect(radii.length).toBeGreaterThan(0);
    expect(radii.every((value) => value === '0')).toBe(true);
  });

  test('the breakpoint that collapses the sidebar is not the one Mantine would have used, and the gap between the two is where the layout moves', () => {
    expect(theme.breakpoints?.md).toBe('60em');
    expect(DEFAULT_THEME.breakpoints.md).not.toBe(theme.breakpoints?.md);
  });

  test('the five breakpoints match the ones PostCSS hands to the mixins', () => {
    expect(theme.breakpoints).toEqual({
      xs: '36em',
      sm: '48em',
      md: '60em',
      lg: '75em',
      xl: '88em',
    });
  });

  test('the fluid type scale stays a clamp() expression, because resolving one to a fixed rem freezes a size meant to breathe with the viewport', () => {
    expect(theme.fontSizes?.md).toContain('clamp(');
    expect(theme.headings?.sizes?.h1?.fontSize).toContain('clamp(');
  });

  test('the three font families are declared here, serif for headings', () => {
    expect(theme.fontFamily).toContain('system-ui');
    expect(theme.fontFamilyMonospace).toContain('ui-monospace');
    expect(theme.headings?.fontFamily).toContain('ui-serif');
  });
});

describe('the five breakpoints are written twice, and nothing in the toolchain compares the two files, so this one reads postcss.config.cjs as text — the file the build actually loads, CommonJS inside an ESM workspace, resolved from the working directory because import.meta.url is not a file: URL under jsdom', () => {
  test('every mantine-breakpoint variable PostCSS injects matches the theme, so a component cannot take its media query from one file and its layout from the other', async () => {
    const source = await readFile(POSTCSS_CONFIG_ON_DISK, 'utf8');
    const declared = Object.fromEntries(
      [...source.matchAll(INJECTED_BREAKPOINT)].map(([, key, value]) => [key, value]),
    );

    expect(Object.keys(declared)).toHaveLength(5);
    expect(declared).toEqual(theme.breakpoints);
  });
});
