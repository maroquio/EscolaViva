import { loadConfig, type Config } from './schema';

export { loadConfig, type Config } from './schema';

export const config: Config = loadConfig(Bun.env);
