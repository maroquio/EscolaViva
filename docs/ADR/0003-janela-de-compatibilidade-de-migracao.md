# ADR 0003 — Janela de compatibilidade: nunca remover coluna que a versão anterior ainda lê

**Status:** aceita — Estágio 01

## Contexto

As migrações são arquivos `.sql` numerados em `migrations/`, aplicados por
`bun run migrate` em uma transação por arquivo, com registro em `schema_migrations`
(I6). O runner é próprio, sem ORM e sem ferramenta externa.

O deploy do Estágio 01 é manual e aceita dois minutos de indisponibilidade. Ainda assim,
existe sempre um intervalo — entre aplicar a migração e o processo novo estar no ar, ou
entre o processo novo subir e o antigo terminar as requisições em curso — em que **duas
versões do código conversam com o mesmo banco**. Uma migração que remove ou renomeia uma
coluna nesse intervalo derruba a versão que ainda a lê.

Escrever isto como regra agora é grátis. Escrever depois do primeiro incidente custa o
incidente.

## Decisão

Toda mudança de schema respeita esta janela, nesta ordem, em **migrações separadas e
deploys separados**:

1. **Adiciona** a estrutura nova (coluna, tabela, índice). Nunca `NOT NULL` sem default na
   mesma migração — a versão antiga não sabe preencher o campo.
2. **Migra** os dados. O código novo escreve nos dois lugares; o antigo continua lendo o
   antigo.
3. **Para de escrever** no antigo, quando não houver mais nenhuma instância da versão
   anterior no ar.
4. **Remove** a estrutura antiga, em uma migração que só acontece depois que o passo 3 está
   em produção há tempo suficiente para não haver rollback plausível.

Renomear coluna é sempre a sequência acima — nunca `ALTER TABLE ... RENAME COLUMN`, que é
os passos 1 e 4 comprimidos em um instante.

## Consequências

- Uma mudança que "seria uma linha" vira quatro migrações ao longo de semanas. É o preço de
  poder fazer rollback do processo sem fazer rollback do banco.
- Rollback fica sempre disponível: como nenhuma migração remove o que a versão anterior lê,
  voltar a imagem antiga é suficiente para voltar o sistema.
- O banco carrega estrutura duplicada durante a janela. É temporário e visível — os passos
  3 e 4 são tarefas, não boa intenção.
- A regra vale desde o dia 1, com uma instância só. Quando o Estágio 08 puser seis
  instâncias e o Estágio 12 automatizar o deploy, o hábito já estará formado e nenhuma
  migração precisará ser reescrita.
