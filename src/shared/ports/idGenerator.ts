export interface IdGenerator {
  novo(): string;
}

export const idGeneratorUuid: IdGenerator = {
  novo: () => crypto.randomUUID(),
};
