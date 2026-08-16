# ADR 0006 — A pessoa é o usuário: a tabela `responsavel` deixa de existir

**Status:** aceita — Estágio 01. **Registrada, não implementada.**
**Supersede:** a consequência "responsável sem CPF continua existindo como contato" da ADR 0004, e as decisões 1, 2 e 3 da ADR 0005.

> **Nota de leitura.** Os identificadores citados aqui (`usuario`, `responsavel`,
> `aluno_responsavel`) são os do código anterior à conversão do vocabulário para inglês. Quando a
> conversão passar, os nomes mudam mas a decisão não. A implementação foi deliberadamente adiada
> para depois dela, para que a migração nasça já com os nomes definitivos em vez de renomear duas
> vezes o mesmo objeto.

## Contexto

A ADR 0005 aceitou uma duplicação e adiou uma dívida, ambas por causa de uma premissa: um
responsável pode existir sem acesso ao portal. Dessa premissa saíam as três decisões daquela ADR
— `nome`, `email` e `cpf` continuarem nas duas tabelas; `usuario.responsavel_id` continuar
apontando de identidade para acadêmico; e a correção de direção ficar como dívida com gatilho.

**A premissa mudou.** Passam a valer duas regras de produto:

1. CPF é obrigatório para responsável.
2. Todo responsável pode fazer login.

Com elas, o cadastro deixa de precisar existir separado da credencial — e o desenho certo não é
mais o que a ADR 0005 adiou. Virar a coluna de lado resolveria a direção da dependência ao custo
de uma consulta por requisição do responsável. Sob as premissas novas há uma solução que não custa
consulta nenhuma, porque não sobra o que buscar.

A análise da ADR 0005 continua válida e é o motivo desta existir: a inversão vive em três camadas
— chave estrangeira, campo devolvido por `sessaoValida()` e campo estrutural em `UsuarioDaSessao`
—, nenhuma é `import`, e por isso as três regras do `dependency-cruiser` passam sobre ela.

## Decisão

**`usuario` passa a ser a pessoa. `academico` guarda só a relação acadêmica, apontando para
identidade.**

```sql
ALTER TABLE usuario ADD COLUMN telefone text;

CREATE TABLE aluno_responsavel (
  rede_id     uuid NOT NULL REFERENCES rede(id),
  aluno_id    uuid NOT NULL REFERENCES aluno(id),
  usuario_id  uuid NOT NULL REFERENCES usuario(id),
  parentesco  text NOT NULL,
  financeiro  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (aluno_id, usuario_id)
);
CREATE INDEX aluno_responsavel_por_usuario ON aluno_responsavel (rede_id, usuario_id);

-- comunicado_destinatario passa a referenciar usuario_id no lugar de responsavel_id

DROP TABLE responsavel;
ALTER TABLE usuario DROP COLUMN responsavel_id;
```

Dezenove tabelas viram dezoito, quarenta e duas chaves estrangeiras viram quarenta, e **nenhuma
aponta na direção contrária à do código**. `identidade` passa a ser folha do grafo também no banco.

**O que some junto:** `responsavelId` sai de `UsuarioAutenticado` e de `UsuarioDaSessao`. O painel
do responsável passa a filtrar por `usuarioAtual(c).id` direto — o usuário logado *é* o
responsável, e não há tradução a fazer. Essa é a diferença entre esta decisão e a que a ADR 0005
adiou: lá o `responsavelId` precisaria ser buscado a cada requisição, porque quem monta a sessão é
`identidade` e `identidade` não pode saber o que é um responsável.

**A listagem de responsáveis muda de dono.** Sai de `academico`, que hoje faz `ORDER BY nome` em
três consultas, e passa a ser `identidade.paginaDeUsuarios` filtrada por papel — que já ordena por
`u.nome`, no contexto que é dono do nome. Ordenar e paginar por um campo de outro contexto deixa de
ser um problema porque deixa de ser necessário.

**Papel e vínculo não viram redundância — viram dois níveis.** `papel_usuario` responde "pode abrir
o portal" e é o que `exigirPapel` verifica; `aluno_responsavel` responde "de quais alunos" e é o
que a consulta filtra. É a separação que já existe hoje, e que o comentário de `rotas/responsavel.ts`
descreve: *"`exigirPapel(PAPEL.responsavel)` diz que a pessoa é responsável por alguém — não diz
por quem."* O modelo novo só a torna mais honesta, porque os dois níveis passam a usar a mesma
chave.

**Descartado:** quebrar `usuario` em `pessoa` (nome, email, cpf, telefone) e `credencial`
(pessoa_id, senha_hash, ativo), com `aluno_responsavel.pessoa_id`. É o modelo geral, e o único que
preserva pessoa sem credencial sem reabrir a duplicação. Cai porque contradiz a premissa 2 e
cobra uma junção em todo login para sustentar um caso que a premissa acabou de declarar
inexistente. Fica registrado como o caminho a seguir **se** a premissa 2 for revogada.

**Descartado também:** manter `responsavel` como tabela e apenas mover o vínculo para dentro dela
(`responsavel.usuario_id`), que era a correção prevista na ADR 0005. Resolve a direção da
dependência, mas mantém `nome`, `email` e `cpf` duplicados em duas tabelas que podem divergir, e
cobra a consulta extra. Sob as premissas novas ela é estritamente pior do que apagar a tabela.

## Consequências

- **O responsável sem CPF deixa de ser representável — e isso é assumido.** A ADR 0004 registrou o
  contrário: `responsavel.cpf` anulável *para sempre*, e quem não informasse CPF continuaria
  existindo como contato, aparecendo na ficha do aluno sem receber portal. Era a decisão explícita
  sobre o responsável estrangeiro. A premissa 1 revoga essa consequência. O avô que só recebe
  comunicado, e o responsável sem CPF, passam a não ser cadastráveis. **A decisão central da ADR
  0004 — CPF como identificador de acesso, e-mail de volta a contato — não é superseded; sai
  reforçada.** O que cai é apenas aquela consequência.
- **Nenhum caso de uso pode mais divergir `nome` ou `email` entre cadastro e credencial**, porque
  não há mais dois registros. A ADR 0004 eliminou a divergência do identificador por construção;
  esta elimina a do contato pelo mesmo caminho. É o fim da categoria, não o remédio dela.
- **Toda pessoa ganha `senha_hash` e senha provisória**, inclusive quem nunca vai entrar. Mais
  material sensível em repouso, para um benefício que só se realiza se a pessoa logar.
- **`responsavel` passa a significar uma coisa só.** Hoje o nome faz dois trabalhos: é valor de
  `PAPEIS`, a permissão, e é o nome da tabela de cadastro. A ambiguidade que a ADR 0005 apontou
  como pré-requisito de qualquer mexida aqui se resolve por consequência, sem trabalho de
  linguagem separado.
- **O obstáculo da migração é dado, não DDL.** Seguindo a ADR 0003: `0009` abre a janela com as
  colunas novas anuláveis e faz o backfill por `usuario.responsavel_id`; o código passa a ler as
  novas; `0010` fecha com `NOT NULL`, troca de chave primária e os dois `DROP`. O backfill exige um
  `usuario` para cada `responsavel` vinculado, e `usuario.cpf` é `NOT NULL` — todo responsável hoje
  cadastrado sem CPF trava a etapa. **É a coleta de CPF que decide o cronograma, não a migração.**
- **`vincularResponsavel` não concede o papel na mesma transação.** A fachada de `identidade` não
  expõe nenhuma escrita que aceite o `sql` de uma unidade de trabalho em curso, e abrir essa porta
  vazaria infraestrutura pela linguagem publicada. As duas operações continuam separadas, como
  hoje, e um usuário com papel e sem vínculo continua vendo um portal vazio — comportamento
  idêntico ao atual, não regressão.
- **O aluno logar deixa de dobrar a dívida.** Com o vínculo já apontando para `usuario`, um
  `aluno.usuario_id` seguiria a mesma direção. Segue pendente, nesse caso, o que a premissa 1 não
  resolve: a tabela `aluno` não tem CPF, e exigir CPF de criança de primeiro ano é decisão de
  produto, não de schema.
- **Nada disto foi implementado.** Não há migração `0009`, não há mudança em `src/`. Esta ADR é o
  registro da decisão e do plano; a execução vem depois da conversão do vocabulário do código para
  inglês, por uma razão de ordenação: escrever a migração antes obrigaria a renomear as mesmas
  colunas duas vezes, e o histórico de schema ficaria com uma etapa que só existiu por acidente de
  agenda.
