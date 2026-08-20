type ParamNames<S extends string> = S extends `${string}:${infer Rest}`
  ? Rest extends `${infer Name}/${infer Tail}`
    ? Name | ParamNames<Tail>
    : Rest
  : never;

export type Params<S extends string> = {
  readonly [Name in ParamNames<S>]: string | number;
};
