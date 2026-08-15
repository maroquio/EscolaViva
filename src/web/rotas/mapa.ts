/**
 * O mapa de rotas: um caminho existe uma vez só, e o compilador cobra os `:params`.
 *
 * Antes disto, `/secretaria/alunos/:id` aparecia em quatro lugares — na constante `ROTA_*` do
 * arquivo de rota, no `.get()` que a registra, no `redirect` que volta para ela depois do POST e,
 * escrito à mão, no `href` de meia dúzia de `.eta`. Renomear a rota exigia lembrar dos quatro; o
 * que sobrava virava link quebrado, e link quebrado em `.eta` não quebra compilação, quebra a
 * tela de quem está usando o sistema.
 *
 * `grupo()` devolve as três formas do mesmo caminho, e é por isso que ele é um objeto e não uma
 * string:
 *
 *   - `.prefixo` — onde o router é montado (`app.route`);
 *   - `.padrao`  — o caminho RELATIVO que o router registra (`rotasSecretaria.get`);
 *   - a chamada  — o caminho ABSOLUTO já preenchido, que vai para `href`, `action` e `redirect`.
 *
 * A separação entre padrão e chamada não é conveniência: o Hono registra `/alunos/:id` e o
 * navegador precisa de `/secretaria/alunos/123`. Eram duas strings porque são duas coisas; agora
 * são duas leituras de uma decisão só.
 */

/**
 * Os nomes dos `:params` de um padrão, colhidos do próprio literal.
 *
 * É esta linha que faz `ROTAS.secretaria.aluno({})` não compilar. Sem ela o parâmetro seria
 * `Record<string, string>` e um `{ ind: x }` — `id` digitado errado — passaria pela revisão, pelo
 * `tsc` e pelo teste, para só então montar `/secretaria/alunos/:id` e devolver 404 ao usuário.
 * O erro de digitação em nome de parâmetro é invisível em tempo de execução justamente porque a
 * URL continua sendo uma string válida.
 */
type NomesDeParametro<S extends string> = S extends `${string}:${infer Resto}`
  ? Resto extends `${infer Nome}/${infer Cauda}`
    ? Nome | NomesDeParametro<Cauda>
    : Resto
  : never;

/** O objeto de parâmetros exigido por um padrão. Rota sem `:param` produz `{}`. */
export type Params<S extends string> = {
  readonly [Nome in NomesDeParametro<S>]: string | number;
};

/**
 * Rota sem parâmetro é chamada sem argumento — e não com um objeto vazio.
 *
 * A distinção existe porque `{}` em TypeScript aceita qualquer objeto: se toda rota recebesse
 * `Params<S>`, `ROTAS.secretaria.alunos({ id: 7 })` compilaria em silêncio e o `id` sumiria sem
 * aviso. Com a lista de argumentos vazia, o mesmo engano vira erro de aridade.
 */
type Argumentos<S extends string> = [NomesDeParametro<S>] extends [never]
  ? []
  : [parametros: Params<S>];

export type Endereco<S extends string> = ((...parametros: Argumentos<S>) => string) & {
  /** O caminho relativo ao prefixo do grupo — o que o router registra. */
  readonly padrao: S;
};

export type Grupo<P extends string, R extends Record<string, string>> = {
  readonly prefixo: P;
} & { readonly [Nome in keyof R]: Endereco<R[Nome] & string> };

const PARAMETRO = /:([A-Za-z][A-Za-z0-9_]*)/g;

/**
 * O padrão do painel de cada grupo é `'/'`, porque é assim que o Hono registra a raiz de um
 * router. Concatenado ao prefixo isso daria `/secretaria/`, e o Hono trata `/secretaria` e
 * `/secretaria/` como rotas diferentes: o link com a barra final cairia no `notFound`.
 */
const juntar = (prefixo: string, padrao: string): string => {
  const bruto = `${prefixo}${padrao}`;
  return bruto.length > 1 && bruto.endsWith('/') ? bruto.slice(0, -1) : bruto;
};

/**
 * O `encodeURIComponent` está aqui e não em cada chamador porque o valor que entra na URL vem do
 * banco — um id, hoje sempre UUID, mas a garantia não pode depender disso continuar verdade.
 *
 * O `throw` é rede para os `.eta`: dentro do TypeScript o tipo já impede a chamada sem parâmetro,
 * mas o template é texto e não passa pelo compilador. Falhar alto na página de erro é preferível
 * a servir um `href` com `:id` literal, que só aparece quando alguém clica.
 */
const preencher = (caminho: string, parametros: Record<string, string | number>): string =>
  caminho.replace(PARAMETRO, (_inteiro, nome: string) => {
    const valor = parametros[nome];
    if (valor === undefined) {
      throw new Error(`rota montada sem o parâmetro "${nome}": ${caminho}`);
    }
    return encodeURIComponent(String(valor));
  });

/**
 * Declara um grupo de rotas a partir do prefixo em que ele é montado e dos caminhos relativos.
 *
 * O parâmetro de tipo `const R` preserva os literais: sem ele os valores chegariam aqui como
 * `string`, `NomesDeParametro` não teria o que ler e a checagem de parâmetro deixaria de existir
 * sem que nada acusasse.
 */
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
