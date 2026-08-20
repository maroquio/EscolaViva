import type { Role } from '@escolaviva/contracts/enumerations';
import type { SessionUserAsJson } from '@escolaviva/contracts/session';
import { NAVIGATION_AREAS } from './constants';
import { holdsAnyOf } from './guards';

export type NavigationLink = { readonly href: string; readonly label: string };

export type NavigationArea = {
  readonly title: string;
  readonly roles: readonly Role[];
  readonly links: readonly NavigationLink[];
};

const NOTHING_IS_CURRENT = '';

export const areasOffered = (user: SessionUserAsJson): readonly NavigationArea[] =>
  NAVIGATION_AREAS.filter((area) => holdsAnyOf(user, area.roles));

const isAtOrInside = (path: string, href: string): boolean =>
  path === href || path.startsWith(`${href}/`);

const deepestFirst = (one: string, other: string): number => other.length - one.length;

export const currentHrefIn = (
  areas: readonly NavigationArea[],
  path: string,
): string =>
  areas
    .flatMap((area) => area.links.map((link) => link.href))
    .filter((href) => isAtOrInside(path, href))
    .sort(deepestFirst)[0] ?? NOTHING_IS_CURRENT;
