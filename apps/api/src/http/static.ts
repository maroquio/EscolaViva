import type { Hono } from 'hono';
import { join } from 'node:path';
import { config } from '../shared/config';
import { ASSETS, CONTEXT_VARIABLES, HEADERS } from '../shared/constants';
import type { Variables } from '../shared/http';
import {
  ASSET_NAME,
  ASSET_TYPES,
  DEFAULT_ASSET_TYPE,
  DOCUMENT_MEDIA_TYPE,
  SERVER_PATHS,
  WILDCARD_PATH,
} from './constants';

type WebApplication = Hono<{ Variables: Variables }>;

const EXTENSION_SEPARATOR = '.';

const assetType = (name: string): string => {
  const extension = name.slice(name.lastIndexOf(EXTENSION_SEPARATOR) + 1).toLowerCase();
  return ASSET_TYPES[extension] ?? DEFAULT_ASSET_TYPE;
};

const decodedName = (raw: string): string | null => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
};

const belongsToTheServer = (path: string): boolean =>
  SERVER_PATHS.some((prefix) => path.startsWith(prefix));

export function mountStatic(app: WebApplication, frontRoot = config.frontPath): void {
  app.get(`${ASSETS.buildUrlPrefix}${WILDCARD_PATH}`, async (c) => {
    const name = decodedName(c.req.path.slice(ASSETS.buildUrlPrefix.length));
    if (name === null || !ASSET_NAME.test(name)) return c.notFound();

    const file = Bun.file(join(frontRoot, ASSETS.buildDirectory, name));
    if (!(await file.exists())) return c.notFound();

    return c.body(await file.arrayBuffer(), { headers: { [HEADERS.contentType]: assetType(name) } });
  });

  app.get(WILDCARD_PATH, async (c) => {
    if (belongsToTheServer(c.req.path)) return c.notFound();

    const document = Bun.file(join(frontRoot, ASSETS.document));
    if (!(await document.exists())) return c.notFound();

    c.set(CONTEXT_VARIABLES.applicationDocument, true);
    return c.body(await document.arrayBuffer(), {
      headers: { [HEADERS.contentType]: DOCUMENT_MEDIA_TYPE },
    });
  });
}
