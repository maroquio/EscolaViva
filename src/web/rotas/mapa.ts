type NomesDeParametro<S extends string> = S extends `${string}:${infer Resto}`
  ? Resto extends `${infer Nome}/${infer Cauda}`
    ? Nome | NomesDeParametro<Cauda>
    : Resto
  : never;

export type Params<S extends string> = {
  readonly [Nome in NomesDeParametro<S>]: string | number;
};

type Argumentos<S extends string> = [NomesDeParametro<S>] extends [never]
  ? []
  : [parametros: Params<S>];

export type Endereco<S extends string> = ((...parametros: Argumentos<S>) => string) & {
  readonly padrao: S;
};

export type Grupo<P extends string, R extends Record<string, string>> = {
  readonly prefixo: P;
} & { readonly [Nome in keyof R]: Endereco<R[Nome] & string> };

const PARAMETRO = /:([A-Za-z][A-Za-z0-9_]*)/g;

const BARRA = '/';

const juntar = (prefixo: string, padrao: string): string => {
  const bruto = `${prefixo}${padrao}`;
  return bruto.length > 1 && bruto.endsWith(BARRA) ? bruto.slice(0, -1) : bruto;
};

const MENSAGEM_DE_PARAMETRO_FALTANDO = (nome: string, caminho: string): string =>
  `rota montada sem o parâmetro "${nome}": ${caminho}`;

const preencher = (caminho: string, parametros: Record<string, string | number>): string =>
  caminho.replace(PARAMETRO, (_inteiro, nome: string) => {
    const valor = parametros[nome];
    if (valor === undefined) {
      throw new Error(MENSAGEM_DE_PARAMETRO_FALTANDO(nome, caminho));
    }
    return encodeURIComponent(String(valor));
  });

export function grupo<P extends string, const R extends Record<string, string>>(
  prefixo: P,
  rotas: R,
): Grupo<P, R> {
  const enderecos = Object.entries(rotas).map(([nome, padrao]) => {
    const absoluto = juntar(prefixo, padrao);
    const endereco = (parametros: Record<string, string | number> = {}): string =>
      preencher(absoluto, parametros);
    return [nome, Object.assign(endereco, { padrao })] as const;
  });

  return { prefixo, ...Object.fromEntries(enderecos) } as Grupo<P, R>;
}
