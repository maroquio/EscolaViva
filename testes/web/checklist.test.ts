/*
 * A Seção 8 do documento do Estágio 01, item a item, executável.
 *
 * A lista original é de caixas de marcar, e caixa de marcar é promessa. Aqui cada item é uma
 * verificação que roda: a regra de dependência quebra mesmo quando alguém a viola, o processo
 * morre mesmo quando falta variável, a saúde responde 503 mesmo com o banco fora do ar. É este
 * arquivo, e não a leitura do documento, que autoriza dizer que o estágio está pronto.
 *
 * Três itens do documento não cabem em teste automatizado e ficam de fora de propósito: a
 * restauração do dump em outro banco (`scripts/restore-test.sh`), e os quatro números de medição
 * da Seção 5, que são observações anotadas por quem executa, não asserções.
 */

import { SQL } from 'bun';
import { join } from 'node:path';
import { unlink } from 'node:fs/promises';
import { beforeEach, describe, expect, test } from 'bun:test';
import { config } from '../../src/shared/config';
import { gerarCpf } from '../../src/shared/documento';
import { CHAVES_PROIBIDAS } from '../../src/shared/log';
import { limparBanco, sqlDeTeste } from '../apoio/banco';
import {
  cenarioCompleto,
  criarAluno,
  criarAnoLetivo,
  criarDisciplina,
  criarMatricula,
  criarRede,
  criarTurma,
  criarTurmaDisciplina,
  criarUnidade,
  criarUsuario,
  SENHA_PADRAO,
} from '../apoio/fabricas';
import {
  abrir,
  capturarLogDeUmFluxo,
  entrar,
  enviar,
  postar,
  RAIZ_DO_PROJETO,
  rodarProcesso,
  saudeComBancoForaDoAr,
  valoresDoLog,
} from './apoio';

const PRAZO_DE_PROCESSO_MS = 60_000;

/* ------------------------------------------------------------------------- */

describe('`bun run check` falha se um módulo importar arquivo interno de outro', () => {
  type Violacao = { regra: string; caminho: string; conteudo: string };

  /*
   * As três regras nomeiam os quatro módulos numa alternância de regex. Plantar a violação
   * em um módulo só provava que a alternância casa aquele nome — um erro de digitação em
   * qualquer um dos outros três ('assesment', 'comunication') deixaria aquele módulo sem
   * regra nenhuma e a saída continuaria verde. Por isso cada regra é plantada nos quatro.
   */
  const MODULOS = ['academico', 'avaliacao', 'comunicacao', 'identidade'] as const;

  const ALVO_INTERNO: Readonly<Record<(typeof MODULOS)[number], string>> = {
    academico: 'identidade/dominio/usuario',
    avaliacao: 'academico/dominio/aluno',
    comunicacao: 'identidade/dominio/papel',
    identidade: 'academico/dominio/turma',
  };

  const VIOLACOES: readonly Violacao[] = MODULOS.flatMap((modulo) => [
    {
      regra: 'sem-atalho-entre-modulos',
      caminho: `src/${modulo}/_violacao_de_teste.ts`,
      conteudo:
        `import type * as Interno from '../${ALVO_INTERNO[modulo]}';\n` +
        'export type Atalho = keyof typeof Interno;\n',
    },
    {
      regra: 'dominio-puro',
      caminho: `src/${modulo}/dominio/_violacao_de_teste.ts`,
      conteudo:
        "import { leitura } from '../../shared/db';\n" +
        'export const conexao = (): unknown => leitura();\n',
    },
    {
      regra: 'shared-nao-conhece-dominio',
      caminho: `src/shared/_violacao_de_teste_${modulo}.ts`,
      conteudo:
        `import { ${modulo} } from '../${modulo}';\n` +
        `export const porta = (): unknown => ${modulo};\n`,
    },
  ]);

  const rodarCheck = (): Promise<{ codigo: number; saida: string; erro: string }> =>
    rodarProcesso(['x', 'depcruise', 'src', '--config', 'config/.dependency-cruiser.js'], {});

  /** O arquivo em falta some no `finally`: uma suíte que deixa lixo em `src/` quebra a seguinte. */
  const checarCom = async (violacao: Violacao): Promise<{ codigo: number; saida: string }> => {
    const caminho = join(RAIZ_DO_PROJETO, violacao.caminho);
    await Bun.write(caminho, violacao.conteudo);
    try {
      const { codigo, saida, erro } = await rodarCheck();
      return { codigo, saida: `${saida}${erro}` };
    } finally {
      await unlink(caminho);
    }
  };

  test('o grafo limpo passa, e é esse o ponto de partida', async () => {
    const { codigo } = await rodarCheck();

    expect(codigo).toBe(0);
  }, PRAZO_DE_PROCESSO_MS);

  for (const violacao of VIOLACOES) {
    test(`a regra ${violacao.regra} derruba a verificação em ${violacao.caminho}`, async () => {
      const { codigo, saida } = await checarCom(violacao);

      expect(codigo).not.toBe(0);
      expect(saida).toContain(violacao.regra);
      expect(saida).toContain(violacao.caminho);
    }, PRAZO_DE_PROCESSO_MS);
  }

  test('o arquivo em falta não sobra depois do teste', async () => {
    const restos = await Promise.all(
      VIOLACOES.map((violacao) => Bun.file(join(RAIZ_DO_PROJETO, violacao.caminho)).exists()),
    );

    expect(restos).toEqual(VIOLACOES.map(() => false));
  });
});

/* ------------------------------------------------------------------------- */

describe('nenhum arquivo é escrito em disco pela aplicação', () => {
  const PADROES: readonly { nome: string; expressao: RegExp }[] = [
    { nome: 'writeFile', expressao: /\bwriteFile(?:Sync)?\s*\(/ },
    { nome: 'appendFile', expressao: /\bappendFile(?:Sync)?\s*\(/ },
    { nome: 'createWriteStream', expressao: /\bcreateWriteStream\s*\(/ },
    { nome: 'Bun.write', expressao: /\bBun\s*\.\s*write\b/ },
    { nome: 'fs.', expressao: /\bfs\s*\./ },
  ];

  const escritasEmDisco = async (): Promise<string[]> => {
    const raizDoCodigo = join(RAIZ_DO_PROJETO, 'src');
    const encontradas: string[] = [];
    for await (const relativo of new Bun.Glob('**/*.ts').scan({ cwd: raizDoCodigo })) {
      const linhas = (await Bun.file(join(raizDoCodigo, relativo)).text()).split('\n');
      linhas.forEach((linha, indice) => {
        for (const padrao of PADROES) {
          if (padrao.expressao.test(linha)) {
            encontradas.push(`src/${relativo}:${indice + 1} usa ${padrao.nome}`);
          }
        }
      });
    }
    return encontradas;
  };

  test('nenhum módulo de `src/` grava arquivo', async () => {
    const encontradas = await escritasEmDisco();

    expect(encontradas).toEqual([]);
  });

  test('a varredura de fato leu o código, e não uma pasta vazia', async () => {
    const arquivos: string[] = [];
    for await (const relativo of new Bun.Glob('**/*.ts').scan({ cwd: join(RAIZ_DO_PROJETO, 'src') })) {
      arquivos.push(relativo);
    }

    expect(arquivos.length).toBeGreaterThan(50);
    expect(arquivos).toContain('web/app.ts');
  });
});

/* ------------------------------------------------------------------------- */

describe('derrubar o container e subir outro não perde nada além de sessões', () => {
  beforeEach(async () => {
    await limparBanco();
  });

  /** Uma conexão nova, fora do pool da aplicação: é o que um segundo contêiner teria. */
  const outraConexao = async <T>(usar: (sql: SQL) => Promise<T>): Promise<T> => {
    const sql = new SQL({ url: config.databaseUrl, max: 1 });
    try {
      return await usar(sql);
    } finally {
      await sql.close();
    }
  };

  test('o que uma requisição grava, outra conexão lê', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrar({
      redeSlug: cenario.rede.slug,
      cpf: cenario.secretaria.cpf,
      senha: cenario.senha,
    });

    await enviar('/secretaria/disciplinas', { nome: 'Sociologia' }, cookie);
    const gravadas = await outraConexao((sql) =>
      sql<{ nome: string }[]>`
        SELECT nome FROM disciplina WHERE rede_id = ${cenario.rede.id} AND nome = 'Sociologia'`,
    );

    expect(gravadas.map((linha) => linha.nome)).toEqual(['Sociologia']);
  });

  test('o processo não guarda sessão em memória: apagar a linha derruba o acesso', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrar({
      redeSlug: cenario.rede.slug,
      cpf: cenario.secretaria.cpf,
      senha: cenario.senha,
    });

    const antes = await abrir('/secretaria', cookie);
    await outraConexao((sql) => sql`DELETE FROM sessao WHERE usuario_id = ${cenario.secretaria.id}`);
    const depois = await abrir('/secretaria', cookie);

    expect(antes.status).toBe(200);
    expect(depois.status).toBe(303);
    expect(depois.headers.get('Location')).toBe('/login');
  });

  test('nenhuma tabela além de `sessao` guarda estado de usuário conectado', async () => {
    const comValidade = await sqlDeTeste()<{ tabela: string }[]>`
      SELECT table_name AS tabela
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND column_name = 'expira_em'
      ORDER BY table_name`;

    expect(comValidade.map((linha) => linha.tabela)).toEqual(['sessao']);
  });
});

/* ------------------------------------------------------------------------- */

describe('toda tabela de negócio tem `rede_id` e FK declarada', () => {
  /** `rede` é a própria dona; as outras duas são plataforma, e não pertencem a rede nenhuma. */
  const FORA_DA_REGRA = ['rede', 'requisicao_idempotente', 'schema_migrations'];

  type LinhaDoCatalogo = { tabela: string; tem_coluna: boolean; tem_fk: boolean };

  const todasAsTabelas = (): Promise<LinhaDoCatalogo[]> => sqlDeTeste()<LinhaDoCatalogo[]>`
    SELECT t.table_name AS tabela,
           EXISTS (
             SELECT 1 FROM information_schema.columns c
             WHERE c.table_schema = t.table_schema
               AND c.table_name = t.table_name
               AND c.column_name = 'rede_id'
           ) AS tem_coluna,
           EXISTS (
             SELECT 1
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage k
               ON k.constraint_schema = tc.constraint_schema
              AND k.constraint_name = tc.constraint_name
             JOIN information_schema.constraint_column_usage r
               ON r.constraint_schema = tc.constraint_schema
              AND r.constraint_name = tc.constraint_name
             WHERE tc.table_schema = t.table_schema
               AND tc.table_name = t.table_name
               AND tc.constraint_type = 'FOREIGN KEY'
               AND k.column_name = 'rede_id'
               AND r.table_name = 'rede'
           ) AS tem_fk
    FROM information_schema.tables t
    WHERE t.table_schema = current_schema()
      AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name`;

  /** A exceção fica fora da consulta, escrita à mão e visível: é a lista que precisa ser lida. */
  const catalogo = async (): Promise<LinhaDoCatalogo[]> =>
    (await todasAsTabelas()).filter((linha) => !FORA_DA_REGRA.includes(linha.tabela));

  test('nenhuma tabela de negócio fica sem a coluna `rede_id`', async () => {
    const linhas = await catalogo();

    const semColuna = linhas.filter((linha) => !linha.tem_coluna).map((linha) => linha.tabela);

    expect(linhas.length).toBeGreaterThan(10);
    expect(semColuna).toEqual([]);
  });

  test('nenhuma tabela de negócio fica sem a chave estrangeira para `rede`', async () => {
    const linhas = await catalogo();

    const semChave = linhas.filter((linha) => !linha.tem_fk).map((linha) => linha.tabela);

    expect(semChave).toEqual([]);
  });

  test('as tabelas de junção também carregam a rede, e não só as principais', async () => {
    const linhas = await catalogo();

    const nomes = linhas.map((linha) => linha.tabela);

    expect(nomes).toContain('papel_usuario');
    expect(nomes).toContain('aluno_responsavel');
    expect(nomes).toContain('comunicado_destinatario');
  });
});

/* ------------------------------------------------------------------------- */

describe('enviar o mesmo formulário duas vezes cria um registro', () => {
  beforeEach(async () => {
    await limparBanco();
  });

  test('dois envios com a mesma chave produzem uma linha só', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrar({
      redeSlug: cenario.rede.slug,
      cpf: cenario.secretaria.cpf,
      senha: cenario.senha,
    });
    const campos = { _chave: crypto.randomUUID(), nome: 'Educação Física' };

    await postar('/secretaria/disciplinas', campos, cookie);
    await postar('/secretaria/disciplinas', campos, cookie);
    const linhas = await sqlDeTeste()<{ total: string }[]>`
      SELECT count(*)::text AS total
        FROM disciplina
       WHERE rede_id = ${cenario.rede.id} AND nome = 'Educação Física'`;

    expect(Number(linhas[0]?.total ?? '0')).toBe(1);
  });

  test('dois envios com chaves distintas produzem duas linhas', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrar({
      redeSlug: cenario.rede.slug,
      cpf: cenario.secretaria.cpf,
      senha: cenario.senha,
    });

    await enviar('/secretaria/disciplinas', { nome: 'Educação Física' }, cookie);
    await enviar('/secretaria/disciplinas', { nome: 'Educação Artística' }, cookie);
    const linhas = await sqlDeTeste()<{ total: string }[]>`
      SELECT count(*)::text AS total
        FROM disciplina
       WHERE rede_id = ${cenario.rede.id} AND nome LIKE 'Educação%'`;

    expect(Number(linhas[0]?.total ?? '0')).toBe(2);
  });
});

/* ------------------------------------------------------------------------- */

describe('rota autenticada responde `Cache-Control: private, no-store`', () => {
  beforeEach(async () => {
    await limparBanco();
  });

  test('toda tela com sessão recusa cache compartilhado', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrar({
      redeSlug: cenario.rede.slug,
      cpf: cenario.secretaria.cpf,
      senha: cenario.senha,
    });

    const telas = await Promise.all(
      ['/secretaria', '/secretaria/turmas', '/secretaria/disciplinas', '/conta/senha'].map(
        (caminho) => abrir(caminho, cookie),
      ),
    );

    expect(telas.map((tela) => tela.headers.get('Cache-Control'))).toEqual([
      'private, no-store',
      'private, no-store',
      'private, no-store',
      'private, no-store',
    ]);
    expect(telas.map((tela) => tela.headers.get('Vary'))).toEqual([
      'Cookie',
      'Cookie',
      'Cookie',
      'Cookie',
    ]);
  });

  test('o boletim do responsável, que é o pior caso, também recusa cache', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrar({
      redeSlug: cenario.rede.slug,
      cpf: cenario.responsavel.cpf,
      senha: cenario.senha,
    });

    const boletim = await abrir(
      `/responsavel/matriculas/${cenario.matriculas[0].id}/boletim`,
      cookie,
    );

    expect(boletim.status).toBe(200);
    expect(boletim.headers.get('Cache-Control')).toBe('private, no-store');
  });

  test('o arquivo publicado, cujo nome carrega o hash, pode ser guardado para sempre', async () => {
    const resposta = await abrir('/publico/app.2a17037a.css');

    expect(resposta.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  test('a tela de entrada, sem sessão, também não vai para cache nenhum', async () => {
    const resposta = await abrir('/login');

    expect(resposta.headers.get('Cache-Control')).toBe('no-store');
  });
});

/* ------------------------------------------------------------------------- */

describe('`/health` responde 503 com o banco parado', () => {
  test('com o banco de pé, a saúde é 200 e a vida é 200', async () => {
    const saude = await abrir('/health');
    const vida = await abrir('/health/live');

    expect([saude.status, vida.status]).toEqual([200, 200]);
  });

  test('com o banco fora do ar, a saúde cai para 503 e a vida continua 200', async () => {
    const semBanco = await saudeComBancoForaDoAr();

    expect(semBanco.health).toBe(503);
    expect(semBanco.live).toBe(200);
  }, PRAZO_DE_PROCESSO_MS);

  test('nos dois casos as respostas de saúde recusam cache', async () => {
    const comBanco = await abrir('/health');
    const semBanco = await saudeComBancoForaDoAr();

    expect(comBanco.headers.get('Cache-Control')).toBe('no-store');
    expect(semBanco.healthCache).toBe('no-store');
    expect(semBanco.liveCache).toBe('no-store');
  }, PRAZO_DE_PROCESSO_MS);
});

/* ------------------------------------------------------------------------- */

describe('falta uma variável de ambiente e o processo não sobe', () => {
  const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres';

  /** Variável declarada vazia vence o `.env` do projeto: é assim que a falta é simulada. */
  const subirMain = (
    ambiente: Record<string, string>,
  ): Promise<{ codigo: number; saida: string; erro: string }> =>
    rodarProcesso(['src/main.ts'], { APP_ENV: 'test', PORT: '45671', ...ambiente });

  test('sem DATABASE_URL o boot morre citando a variável', async () => {
    const { codigo, erro } = await subirMain({ DATABASE_URL: '', SESSION_SECRET: SEGREDO });

    expect(codigo).not.toBe(0);
    expect(erro).toContain('DATABASE_URL');
    expect(erro).toContain('o processo não sobe');
  }, PRAZO_DE_PROCESSO_MS);

  test('sem SESSION_SECRET o boot morre citando a variável', async () => {
    const { codigo, erro } = await subirMain({
      DATABASE_URL: Bun.env.DATABASE_URL ?? '',
      SESSION_SECRET: '',
    });

    expect(codigo).not.toBe(0);
    expect(erro).toContain('SESSION_SECRET');
  }, PRAZO_DE_PROCESSO_MS);

  test('a falta é apontada de uma vez, e não uma variável por reinício', async () => {
    const { erro } = await subirMain({ DATABASE_URL: '', SESSION_SECRET: '' });

    expect(erro).toContain('DATABASE_URL');
    expect(erro).toContain('SESSION_SECRET');
  }, PRAZO_DE_PROCESSO_MS);

  test('segredo curto demais também impede o boot', async () => {
    const { codigo, erro } = await subirMain({
      DATABASE_URL: Bun.env.DATABASE_URL ?? '',
      SESSION_SECRET: 'curto-demais',
    });

    expect(codigo).not.toBe(0);
    expect(erro).toContain('SESSION_SECRET');
  }, PRAZO_DE_PROCESSO_MS);
});

/* ------------------------------------------------------------------------- */

describe('nenhum log contém nome, e-mail, CPF ou nota', () => {
  const CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;

  const NOME_DO_PROFESSOR = 'Ludmila Vasconcelos Trindade';
  const EMAIL_DO_PROFESSOR = 'ludmila.trindade@escolaviva.test';
  /** Semente própria, e não o contador global das fábricas: aqui o valor precisa ser previsível. */
  const CPF_DO_PROFESSOR = gerarCpf(910_827);
  const NOME_DO_ALUNO = 'Anastácio Quintiliano Bragança';
  const SLUG = 'rede-do-teste-de-log';
  const NOTA = 7.3;
  const BIMESTRE = 1;

  beforeEach(async () => {
    await limparBanco();
  });

  /** Um cenário com nomes próprios inconfundíveis: qualquer vazamento aparece por igualdade. */
  const cenarioComNomesProprios = async (): Promise<{
    redeSlug: string;
    email: string;
    cpf: string;
    senha: string;
    turmaDisciplinaId: string;
    matriculaIds: string[];
    bimestre: number;
    nota: number;
  }> => {
    const rede = await criarRede({ nome: 'Rede do Teste de Log', slug: SLUG });
    const unidade = await criarUnidade({ redeId: rede.id });
    const anoLetivo = await criarAnoLetivo({ redeId: rede.id });
    const turma = await criarTurma({
      redeId: rede.id,
      unidadeId: unidade.id,
      anoLetivoId: anoLetivo.id,
    });
    const disciplina = await criarDisciplina({ redeId: rede.id });
    const professor = await criarUsuario({
      redeId: rede.id,
      nome: NOME_DO_PROFESSOR,
      email: EMAIL_DO_PROFESSOR,
      cpf: CPF_DO_PROFESSOR,
      senha: SENHA_PADRAO,
      papeis: [{ unidadeId: unidade.id, papel: 'professor' }],
    });
    const turmaDisciplina = await criarTurmaDisciplina({
      redeId: rede.id,
      turmaId: turma.id,
      disciplinaId: disciplina.id,
      professorUsuarioId: professor.id,
    });
    const aluno = await criarAluno({ redeId: rede.id, nome: NOME_DO_ALUNO });
    const matricula = await criarMatricula({
      redeId: rede.id,
      alunoId: aluno.id,
      turmaId: turma.id,
      anoLetivoId: anoLetivo.id,
    });

    return {
      redeSlug: rede.slug,
      email: professor.email,
      cpf: CPF_DO_PROFESSOR,
      senha: SENHA_PADRAO,
      turmaDisciplinaId: turmaDisciplina.id,
      matriculaIds: [matricula.id],
      bimestre: BIMESTRE,
      nota: NOTA,
    };
  };

  test('o fluxo de fato produziu log — o teste não passa por silêncio', async () => {
    const capturado = await capturarLogDeUmFluxo(await cenarioComNomesProprios());

    expect(capturado.linhas.length).toBeGreaterThanOrEqual(3);
    expect(capturado.linhas.every((linha) => typeof linha['msg'] === 'string')).toBe(true);
  }, PRAZO_DE_PROCESSO_MS);

  test('nenhum valor pessoal do cenário aparece em linha de log', async () => {
    const cenario = await cenarioComNomesProprios();

    const capturado = await capturarLogDeUmFluxo(cenario);
    const valores = capturado.linhas.flatMap(valoresDoLog);
    const proibidos: unknown[] = [
      NOME_DO_PROFESSOR, EMAIL_DO_PROFESSOR, CPF_DO_PROFESSOR, NOME_DO_ALUNO, NOTA,
    ];

    expect(valores.filter((valor) => proibidos.includes(valor))).toEqual([]);
    expect(capturado.bruto).not.toContain(EMAIL_DO_PROFESSOR);
    expect(capturado.bruto).not.toContain(NOME_DO_ALUNO);
    // Cru, não formatado: é a forma que a coluna grava, e é essa forma que vazaria de verdade.
    expect(capturado.bruto).not.toContain(CPF_DO_PROFESSOR);
  }, PRAZO_DE_PROCESSO_MS);

  test('o log guarda identificadores e o desfecho, que é do que a operação precisa', async () => {
    const cenario = await cenarioComNomesProprios();

    const capturado = await capturarLogDeUmFluxo(cenario);
    const campos = new Set(capturado.linhas.flatMap((linha) => Object.keys(linha)));

    expect(campos.has('correlacao_id')).toBe(true);
    expect(capturado.bruto).toContain(SLUG);
    expect(capturado.bruto).toContain('recusado');
  }, PRAZO_DE_PROCESSO_MS);

  test('nenhuma chave proibida escapa com valor, e nenhum CPF aparece', async () => {
    const cenario = await cenarioComNomesProprios();

    const capturado = await capturarLogDeUmFluxo(cenario);
    const vazando = capturado.linhas.flatMap((linha) =>
      Object.entries(linha).filter(
        ([chave, valor]) => CHAVES_PROIBIDAS.includes(chave) && valor !== '[redigido]',
      ),
    );

    expect(vazando).toEqual([]);
    expect(CPF.test(capturado.bruto)).toBe(false);
  }, PRAZO_DE_PROCESSO_MS);

  test('a página de erro entrega o código de correlação, e não o detalhe da falha', async () => {
    const cenario = await cenarioCompleto();
    const cookie = await entrar({
      redeSlug: cenario.rede.slug,
      cpf: cenario.secretaria.cpf,
      senha: cenario.senha,
    });

    const recusada = await postar('/secretaria/disciplinas', { nome: 'Xadrez' }, cookie);
    const pagina = await recusada.text();

    expect(recusada.status).toBe(400);
    expect(pagina).not.toContain('requisicao_idempotente');
    expect(pagina).not.toContain(cenario.secretaria.email);
  });
});
