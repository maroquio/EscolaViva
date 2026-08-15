import { FORMATOS } from '../constantes';

/**
 * O acadêmico compara id com coluna `uuid`: um `:id` digitado à mão viraria erro de conversão do
 * PostgreSQL, isto é, 500 no lugar de 404. A borda recusa antes de chegar lá — vale tanto para o
 * parâmetro de rota quanto para um id que chegue solto no corpo de um POST, como o
 * `responsavelId` do convite de usuário. `rede.ts` e `secretaria.ts` importam esta guarda em vez
 * de cada um manter a própria cópia.
 *
 * A expressão em si é `FORMATOS.identificador`, e não uma cópia local: id de recurso é um formato
 * de borda como qualquer outro. Ela continua separada de `FORMATOS.chaveDeIdempotencia`, que hoje
 * se escreve igual e é outra decisão — ver o comentário de `shared/constantes.ts`.
 */
export const ehIdentificador = (valor: string): boolean => FORMATOS.identificador.test(valor);
