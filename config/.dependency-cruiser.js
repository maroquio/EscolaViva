/**
 * I1 — a fronteira entre os módulos verificada por ferramenta, não por combinado verbal.
 * Roda em `bun run check`.
 *
 * Grafo permitido no Estágio 01:
 *
 *   comunicacao ──┐
 *   avaliacao ────┼──▶ academico ──▶ identidade
 *                 └──▶ identidade
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
const configuracao = {
  forbidden: [
    {
      name: 'sem-atalho-entre-modulos',
      comment:
        'Um módulo só enxerga outro pelo seu `index.ts`. Caminho interno (dominio/, aplicacao/, ' +
        'infra/) é privado. Protege a resposta para "o que mais mexe nisso?": quando `cobranca/` ' +
        'for extraído no Estágio 14, a lista de dependentes é exatamente quem importa o index — ' +
        'sem essa regra a extração vira reescrita. `from.pathNot` tira `src/shared/` do alcance ' +
        'desta regra porque `shared-nao-conhece-dominio` já proíbe qualquer seta saindo dali, e ' +
        'relatar a mesma violação duas vezes só confunde quem vai corrigir.',
      severity: 'error',
      from: {
        // O grupo captura o módulo de origem e reaparece como `$1` no `to.pathNot`:
        // é assim que um módulo continua livre para importar os próprios arquivos internos.
        path: '^src/([^/]+)/',
        pathNot: '^src/shared/',
      },
      to: {
        path: '^src/(?:identidade|academico|avaliacao|comunicacao)/',
        pathNot: [
          '^src/$1/',
          '^src/(?:identidade|academico|avaliacao|comunicacao)/index\\.ts$',
        ],
      },
    },
    {
      name: 'dominio-puro',
      comment:
        'O domínio não sabe que existe banco, HTTP, log, agendador ou biblioteca de terceiro. ' +
        'Só pode alcançar `src/shared/ports/`, `src/shared/resultado.ts` e `src/shared/documento/` — ' +
        'este último por ser valor puro, sem I/O e sem regra de negócio de nenhum módulo: a ' +
        'aritmética do CPF é a mesma para identidade e para academico, e duplicá-la seria pior que ' +
        'compartilhá-la. É o que torna o teste de regra pedagógica um teste puro, e o que destrava ' +
        'I3: quando o `Mailer` entrar no Estágio 04, `ports/` será o único lugar onde ele cabe.',
      severity: 'error',
      from: { path: '^src/[^/]+/dominio/' },
      to: { path: ['^src/shared/(?:db|http|log|jobs)/', 'node_modules'] },
    },
    {
      name: 'shared-nao-conhece-dominio',
      comment:
        'A dependência é sempre de fora para dentro: `src/shared/` é infraestrutura sem regra de ' +
        'negócio e não pode importar identidade, academico, avaliacao nem comunicacao. Por isso ' +
        '`shared/http/sessao.ts` declara a forma estrutural do usuário em vez de importá-la. ' +
        'Sem essa regra, extrair um módulo no Estágio 14 arrastaria o `shared/` inteiro junto.',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/(?:identidade|academico|avaliacao|comunicacao)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    // Sem isto, um `import type` some do grafo e as três regras ficam sem dente.
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.js', '.mjs', '.json'],
    },
  },
};

export default configuracao;
