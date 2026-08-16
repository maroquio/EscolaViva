import type { Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { config } from '../../shared/config';
import { INVITE_COOKIE } from '../constants';

export type Invite = { userId: string; password: string };

export const storeInvite = (
  c: Context,
  path: string,
  userId: string,
  password: string,
): Promise<void> =>
  setSignedCookie(
    c,
    INVITE_COOKIE.name,
    `${userId}${INVITE_COOKIE.separator}${password}`,
    config.sessionSecret,
    {
      path,
      httpOnly: true,
      secure: config.secureCookie,
      sameSite: INVITE_COOKIE.sameSite,
      maxAge: INVITE_COOKIE.maxAgeInSeconds,
    },
  );

export const takeInvite = async (c: Context, path: string): Promise<Invite | null> => {
  const value = await getSignedCookie(c, config.sessionSecret, INVITE_COOKIE.name);
  if (typeof value !== 'string') return null;
  deleteCookie(c, INVITE_COOKIE.name, { path, secure: config.secureCookie });
  const cut = value.indexOf(INVITE_COOKIE.separator);
  if (cut <= 0) return null;
  return { userId: value.slice(0, cut), password: value.slice(cut + 1) };
};
