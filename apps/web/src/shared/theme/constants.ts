const BRAND_RAMP_LIGHTNESS = [96, 94, 87, 78, 68, 58, 51, 44, 39, 34];
const BRAND_RAMP_CHROMA = [0.018, 0.03, 0.052, 0.075, 0.098, 0.115, 0.125, 0.13, 0.124, 0.115];
const BRAND_HUE = 262;

const ONE_STEP_IN_REM = 0.25;
const steps = (howMany: number): string => `${howMany * ONE_STEP_IN_REM}rem`;

const DARK_RULE = 'oklch(24% 0.02 260)';
const PAPER_BEHIND_THE_LIFT = 'oklch(98.5% 0.004 95)';
const EDGE = 'oklch(88% 0.008 260)';
const EDGE_WHEN_LIFTED = 'oklch(76% 0.012 260)';
const LIFT_OFFSET = '0.5rem 0.5rem 0';

const liftedOff = (edge: string): string =>
  `${LIFT_OFFSET} ${PAPER_BEHIND_THE_LIFT}, ${LIFT_OFFSET} 1px ${edge}`;

export const BRAND_NAME = 'escola';

export const BRAND_RAMP = BRAND_RAMP_LIGHTNESS.map(
  (lightness, shade) => `oklch(${lightness}% ${BRAND_RAMP_CHROMA[shade]} ${BRAND_HUE})`,
) as [string, string, string, string, string, string, string, string, string, string];

export const SQUARE = '0';

export const FLUID_TYPE = {
  body: 'clamp(0.9375rem, 0.9rem + 0.15vw, 1rem)',
  subsection: 'clamp(1.0625rem, 1rem + 0.3vw, 1.1875rem)',
  section: 'clamp(1.375rem, 1.15rem + 0.85vw, 1.8125rem)',
  page: 'clamp(1.75rem, 1.3rem + 1.8vw, 2.625rem)',
} as const;

export const FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
export const MONOSPACE_FAMILY = "ui-monospace, 'SF Mono', Menlo, monospace";
export const HEADING_FAMILY = "ui-serif, Georgia, 'Times New Roman', serif";

export const SMALL_FONT_SIZES = {
  xs: '0.75rem',
  sm: '0.8125rem',
} as const;

export const SPACING = {
  xs: steps(1),
  sm: steps(2),
  md: steps(4),
  lg: steps(6),
  xl: steps(8),
} as const;

export const BREAKPOINTS = {
  xs: '36em',
  sm: '48em',
  md: '60em',
  lg: '75em',
  xl: '88em',
} as const;

export const SHADOWS = {
  xs: `inset 0 -1px 0 ${DARK_RULE}`,
  sm: `inset -1px 0 0 ${EDGE}`,
  md: liftedOff(EDGE),
  lg: liftedOff(EDGE_WHEN_LIFTED),
  xl: liftedOff(EDGE_WHEN_LIFTED),
} as const;
