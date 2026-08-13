export interface IdGenerator {
  novo(): string;
}

/**
 * A chave primária é gerada pela aplicação, não pelo banco: assim pai e filho são escritos
 * na mesma transação sem uma ida e volta para descobrir o id do pai.
 */
export const idGeneratorUuid: IdGenerator = {
  novo: () => crypto.randomUUID(),
};
