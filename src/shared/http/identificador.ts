/**
 * O acadêmico compara id com coluna `uuid`: um `:id` digitado à mão viraria erro de conversão do
 * PostgreSQL, isto é, 500 no lugar de 404. A borda recusa antes de chegar lá — vale tanto para o
 * parâmetro de rota quanto para um id que chegue solto no corpo de um POST, como o
 * `responsavelId` do convite de usuário. `rede.ts` e `secretaria.ts` importam esta guarda em vez
 * de cada um manter a própria cópia.
 */
const FORMATO_DE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ehIdentificador = (valor: string): boolean => FORMATO_DE_ID.test(valor);
