type ParamNames<S extends string> = S extends `${string}:${infer Rest}`
  ? Rest extends `${infer Name}/${infer Tail}`
    ? Name | ParamNames<Tail>
    : Rest
  : never;

export type Params<S extends string> = {
  readonly [Name in ParamNames<S>]: string | number;
};

type Args<S extends string> = [ParamNames<S>] extends [never]
  ? []
  : [params: Params<S>];

export type RouteUrl<S extends string> = ((...params: Args<S>) => string) & {
  readonly pattern: S;
};

export type Group<P extends string, R extends Record<string, string>> = {
  readonly prefix: P;
} & { readonly [Name in keyof R]: RouteUrl<R[Name] & string> };

const PARAM = /:([A-Za-z][A-Za-z0-9_]*)/g;

const SLASH = '/';

const join = (prefix: string, pattern: string): string => {
  const raw = `${prefix}${pattern}`;
  return raw.length > 1 && raw.endsWith(SLASH) ? raw.slice(0, -1) : raw;
};

const MISSING_PARAM_MESSAGE = (name: string, path: string): string =>
  `rota montada sem o parâmetro "${name}": ${path}`;

const fill = (path: string, params: Record<string, string | number>): string =>
  path.replace(PARAM, (_whole, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(MISSING_PARAM_MESSAGE(name, path));
    }
    return encodeURIComponent(String(value));
  });

export function group<P extends string, const R extends Record<string, string>>(
  prefix: P,
  routes: R,
): Group<P, R> {
  const urls = Object.entries(routes).map(([name, pattern]) => {
    const absolute = join(prefix, pattern);
    const url = (params: Record<string, string | number> = {}): string =>
      fill(absolute, params);
    return [name, Object.assign(url, { pattern })] as const;
  });

  return { prefix, ...Object.fromEntries(urls) } as Group<P, R>;
}
