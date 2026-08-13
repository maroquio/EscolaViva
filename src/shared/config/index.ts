import { carregarConfig, type Config } from './schema';

export { carregarConfig, type Config } from './schema';

/**
 * I18 — validado no import, não no primeiro uso. Se faltar variável, o processo morre no
 * boot com a lista completa do que falta, em vez de servir requisições até esbarrar na
 * configuração ausente no meio de uma matrícula.
 */
export const config: Config = carregarConfig(Bun.env);
