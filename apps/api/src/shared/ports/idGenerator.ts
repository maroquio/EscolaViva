export interface IdGenerator {
  next(): string;
}

export const uuidIdGenerator: IdGenerator = {
  next: () => crypto.randomUUID(),
};
