export type Page<T> = {
  readonly items: readonly T[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
  readonly size: number;
};
