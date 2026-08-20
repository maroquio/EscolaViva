import { Hono } from 'hono';
import { identity } from '../identity';
import {
  cacheControlMiddleware,
  correlationMiddleware,
  createSessionMiddleware,
  errorResponse,
  errorsMiddleware,
  type Variables,
} from '../shared/http';
import { STATUS } from '../shared/constants';
import { ROOT_PATH } from './constants';
import { mountApi } from './routes/api';
import { mountStatic } from './static';
import { healthRoutes } from './health';

export const app = new Hono<{ Variables: Variables }>();

app.use(errorsMiddleware);
app.use(correlationMiddleware);
app.use(cacheControlMiddleware);
app.use(createSessionMiddleware(identity.validSession));

app.onError(async (error, c) => {
  const response = await errorsMiddleware(c, () => Promise.reject(error));
  if (response !== undefined) return response;
  return errorResponse(c, STATUS.internalFailure);
});

app.route(ROOT_PATH, healthRoutes);

mountApi(app);

mountStatic(app);

app.notFound((c) => errorResponse(c, STATUS.notFound));
