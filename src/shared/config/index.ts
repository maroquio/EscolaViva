import { carregarConfig, type Config } from './schema';

export { carregarConfig, type Config } from './schema';

export const config: Config = carregarConfig(Bun.env);
