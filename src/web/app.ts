import { join } from 'node:path';
import { Hono } from 'hono';
import { identity } from '../identity';
import { ASSETS } from '../shared/constants';
import {
  cacheControlMiddleware,
  correlationMiddleware,
  createSessionMiddleware,
  currentUser,
  currentUserOrNull,
  errorsMiddleware,
  hasRole,
  requireLogin,
  type Variables,
} from '../shared/http';
import {
  ASSET_NAME,
  ASSET_TYPES,
  DASHBOARD_BY_ROLE,
  DEFAULT_ASSET_TYPE,
  ERROR_DETAILS,
  ERROR_PAGES,
  ERROR_TITLES,
  PUBLIC_PREFIX,
  ROUTES,
  UNEXPECTED_ERROR_TEXT,
} from './constants';
import { healthRoutes } from './health';
import { renderError } from './render';
import { mountRoutes } from './routes';

const PUBLIC_DIR = join(import.meta.dir, '..', '..', ASSETS.directory);

const EXTENSION_SEPARATOR = '.';

export const app = new Hono<{ Variables: Variables }>();

app.use(errorsMiddleware);
app.use(correlationMiddleware);
app.use(cacheControlMiddleware);
app.use(createSessionMiddleware(identity.validSession));

app.onError(async (error, c) => {
  const response = await errorsMiddleware(c, () => Promise.reject(error));
  return response ?? c.text(UNEXPECTED_ERROR_TEXT, 500);
});

const assetType = (name: string): string => {
  const extension = name.slice(name.lastIndexOf(EXTENSION_SEPARATOR) + 1).toLowerCase();
  return ASSET_TYPES[extension] ?? DEFAULT_ASSET_TYPE;
};

app.get(ROUTES.public.assets.pattern, async (c) => {
  const name = c.req.path.slice(PUBLIC_PREFIX.length);
  if (!ASSET_NAME.test(name)) {
    return renderError(
      c,
      404,
      ERROR_PAGES.invalidAssetName.title,
      ERROR_PAGES.invalidAssetName.detail,
    );
  }

  const file = Bun.file(join(PUBLIC_DIR, name));
  if (!(await file.exists())) {
    return renderError(
      c,
      404,
      ERROR_PAGES.missingAsset.title,
      ERROR_PAGES.missingAsset.detail,
    );
  }

  return new Response(file, { headers: { 'Content-Type': assetType(name) } });
});

app.route(ROUTES.public.prefix, healthRoutes);

app.get(ROUTES.public.root.pattern, (c) =>
  c.redirect(
    currentUserOrNull(c) === null ? ROUTES.public.login() : ROUTES.public.dashboard(),
    303,
  ),
);

app.get(ROUTES.public.dashboard.pattern, requireLogin(), (c) => {
  const user = currentUser(c);
  const dashboard = DASHBOARD_BY_ROLE.find(({ role }) => hasRole(user, role));
  if (dashboard === undefined) {
    return renderError(
      c,
      403,
      ERROR_PAGES.accountWithoutRole.title,
      ERROR_PAGES.accountWithoutRole.detail,
    );
  }
  return c.redirect(dashboard.target, 303);
});

mountRoutes(app);

app.notFound((c) => renderError(c, 404, ERROR_TITLES[404], ERROR_DETAILS[404]));
