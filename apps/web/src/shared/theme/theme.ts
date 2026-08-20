import { createTheme } from '@mantine/core';
import {
  BRAND_NAME,
  BRAND_RAMP,
  BREAKPOINTS,
  FLUID_TYPE,
  FONT_FAMILY,
  HEADING_FAMILY,
  MONOSPACE_FAMILY,
  SHADOWS,
  SMALL_FONT_SIZES,
  SPACING,
  SQUARE,
} from './constants';

export const theme = createTheme({
  primaryColor: BRAND_NAME,
  colors: { [BRAND_NAME]: BRAND_RAMP },

  defaultRadius: 0,
  radius: { xs: SQUARE, sm: SQUARE, md: SQUARE, lg: SQUARE, xl: SQUARE },

  fontFamily: FONT_FAMILY,
  fontFamilyMonospace: MONOSPACE_FAMILY,

  fontSizes: {
    xs: SMALL_FONT_SIZES.xs,
    sm: SMALL_FONT_SIZES.sm,
    md: FLUID_TYPE.body,
    lg: FLUID_TYPE.subsection,
    xl: FLUID_TYPE.section,
  },

  headings: {
    fontFamily: HEADING_FAMILY,
    sizes: {
      h1: { fontSize: FLUID_TYPE.page },
      h2: { fontSize: FLUID_TYPE.section },
      h3: { fontSize: FLUID_TYPE.subsection },
      h4: { fontSize: FLUID_TYPE.body },
    },
  },

  spacing: SPACING,

  breakpoints: BREAKPOINTS,

  shadows: SHADOWS,
});
