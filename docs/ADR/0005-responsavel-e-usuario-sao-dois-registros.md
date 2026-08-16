# ADR 0005 — Responsável e usuário seguem dois registros, e a seta que isso obriga

**Status:** superseded pela ADR 0006 — as três decisões caíram junto com a premissa que as
sustentava ("um responsável pode existir sem credencial"). A **análise** continua válida e é o
motivo de a 0006 existir: as três camadas da inversão, o ponto cego do `dependency-cruiser` e o
contraste com o professor.

## Contexto

A mesma pessoa aparece duas vezes no banco quando um responsável tem acesso ao portal:
`responsavel` (acadêmico) guarda o cadastro, `usuario` (identidade) guarda a credencial. Três
colunas existem nas duas tabelas — `nome`, `email` e `cpf` — e podem divergir. Trocar o e-mail na
ficha da secretaria não troca o e-mail de login.

A ADR 0004 já enfrentou metade disso. Ela tirou do e-mail o papel de identificar e o devolveu a
contato, e o CPF, por ser imutável, passou a ser a ponte estável entre cadastro e credencial. Na
prática essa ponte é uma **guarda**, não uma chave: `convidarUsuario` recusa o convite quando o
`cpfDoCadastro` diverge do CPF informado. A ligação estrutural continua sendo a coluna
`usuario.responsavel_id`, criada em `0006`. `nome` e `email` seguem livres para divergir a partir
do primeiro convite — o que 0004 assumiu quando derrubou a unicidade do e-mail para que mãe e pai
compartilhem um e-mail de família.

O preço estrutural dessa coluna é uma inversão de dependência, e ela aparece em três camadas —
nenhuma delas é um `import`, e por isso as três regras do `dependency-cruiser` passam:

| Camada | Onde |
|---|---|
| Banco | `usuario.responsavel_id` REFERENCES `responsavel(id)` — identidade aponta para acadêmico |
| Linguagem publicada | `identidade.sessaoValida()` devolve `responsavelId` |
| Núcleo compartilhado | `UsuarioDaSessao.responsavelId`, em `src/shared/http/sessao.ts` |

A terceira é a mais incômoda: `shared/` declara um campo cujo significado pertence a `academico`.
Ela escapa de `shared-nao-conhece-dominio` porque é `string | null` declarado estruturalmente, sem
importar nada. Acoplamento nominal não é acoplamento de módulo para a ferramenta — mas é para
quem mantém.

O contraste que explica a origem está dentro do próprio acadêmico: **o professor não tem esse
problema.** Ele é `turma_disciplina.professor_usuario_id REFERENCES usuario(id)` — acadêmico
apontando para identidade, direção certa — e não tem tabela própria. A diferença é acidental: o
responsável precisava de `telefone` e de `parentesco`, alguém criou a tabela, e `nome`, `email` e
`cpf` vieram de carona. A inversão nasceu de uma coluna de contato, não de uma decisão.

## Decisão

**1. Um responsável continua podendo existir sem credencial.** É o que o código faz — o cadastro
não cria `usuario`, e `convidarUsuario` exige um `responsavelId` que já exista —, e é o que a ADR
0004 registrou ao dizer que `responsavel.cpf` segue anulável *para sempre*: quem não informa CPF
continua existindo como contato e aparece na ficha do aluno, sem receber portal. Essa ordem
— cadastrar a família primeiro, distribuir acesso depois — é requisito, não acidente.

**2. `nome`, `email` e `cpf` continuam nas duas tabelas.** `responsavel` é a verdade do cadastro,
`usuario` é a verdade do acesso, e o CPF imutável é a ponte que a 0004 garante.

**Descartado:** deixar só `telefone` em `responsavel` e manter `nome`, `email` e `cpf` apenas em
`usuario`. É a modelagem correta em abstrato — é exatamente o formato do professor — e resolve a
duplicação de uma vez. Ela cai por causa da decisão 1: sem `nome` próprio, cadastrar um
responsável passa a exigir criar um `usuario`, que exige CPF `NOT NULL` e `senha_hash`. O
responsável sem CPF, que a 0004 protegeu explicitamente, deixaria de ser representável. E vaza
para os comunicados: `responsaveisDaUnidade` seleciona `FROM responsavel` sem nenhum join com
`usuario`, então comunicado vai hoje para responsável sem login — que ficaria sem nome na tela de
acompanhamento de leitura.

Há um segundo custo, menor mas concreto: `academico` faz `ORDER BY nome` em três consultas de
responsável. Com o nome em outro contexto, o padrão já estabelecido para o professor — devolver o
id e resolver o nome com `identidade.nomesDeUsuarios()`, juntando em memória — **não ordena e não
pagina**. Para o professor isso não dói, porque a lista de alocações pagina por outra coisa e o
nome é decorativo. A lista de responsáveis da secretaria pagina por nome.

**Descartado também:** derivar o vínculo por `JOIN ON usuario.cpf = responsavel.cpf`, dispensando
a coluna. `responsavel.cpf` é anulável por decisão da 0004, então responsável sem CPF nunca
casaria e o portal dele ficaria vazio sem erro nenhum. Amarrar duas tabelas por valor de negócio
em vez de identidade também quebra na primeira correção de CPF digitado errado.

**3. A inversão fica registrada como dívida, com o momento de pagá-la.** A correção é conhecida e
mecânica: mover a coluna para o outro lado.

```sql
ALTER TABLE responsavel ADD COLUMN usuario_id uuid REFERENCES usuario(id);
CREATE INDEX responsavel_por_usuario ON responsavel (rede_id, usuario_id);
ALTER TABLE usuario DROP COLUMN responsavel_id;
```

Junto some `responsavelId` de `UsuarioAutenticado` e de `UsuarioDaSessao`, e as rotas do
responsável passam a perguntar `academico.responsavelDoUsuario(redeId, usuarioId)` em vez de ler
da sessão. As três camadas caem juntas e `identidade` vira folha do grafo também no banco.

Não é feita agora porque o custo aparece em toda requisição do responsável — hoje o
`responsavelId` chega de graça no `SELECT` que monta a sessão, e não dá para resolver com `JOIN`,
porque quem monta a sessão é `identidade` e `identidade` não pode saber o que é um responsável. A
consulta extra é a consequência de respeitar a fronteira, não um efeito colateral a otimizar.

**Os dois gatilhos que tornam a dívida vencida:**

- **Extração de módulo (Estágio 14).** A pergunta "o que mais mexe nisso?" tem resposta pelo
  `index.ts`, mas não pelo schema: separar `identidade` de `academico` em bancos distintos esbarra
  nesta chave estrangeira, e nela apenas.
- **O aluno passar a logar.** A modelagem atual duplicaria a inversão — `usuario.aluno_id`
  apontando de novo para o acadêmico, e `alunoId` entrando em `UsuarioDaSessao` ao lado de
  `responsavelId`. Virar a coluna antes torna `academico.aluno.usuario_id` a direção natural.
  Fica pendente, nesse caso, o problema que a 0004 já expôs: `usuario.cpf` é `NOT NULL`, e a
  tabela `aluno` não tem CPF nenhum — exigir CPF de criança de primeiro ano é decisão de produto,
  não de schema.

## Consequências

- **A divergência de `nome` e `email` é aceita e não é instrumentada.** Nada avisa quando o e-mail
  do cadastro e o do login diferem. A 0004 já descartou o aviso de divergência como remédio para
  o identificador; para o contato, a divergência não é defeito — é o caso de uso de mãe e pai
  compartilhando um e-mail de família.
- **O `dependency-cruiser` continua verde sobre um acoplamento real.** As três regras leem
  `import`, e as três camadas desta inversão são chave estrangeira, campo de retorno e campo
  estrutural. Vale saber que verde ali não quer dizer fronteira intacta, e que esta ADR é o único
  lugar onde isso está escrito.
- **`responsavel` é um nome que faz dois trabalhos.** É valor de `PAPEIS` — a permissão, em
  `papel_usuario` — e é o nome da tabela de cadastro, em `academico`. As duas leituras convivem em
  toda conversa sobre este assunto. Separar o vocabulário é pré-requisito de qualquer mexida
  futura aqui, e é trabalho de linguagem antes de ser trabalho de schema.
- **O professor segue como o modelo de referência.** Quando a dúvida for "como isto deveria estar
  modelado?", a resposta está em `turma_disciplina.professor_usuario_id`: sem tabela espelho, sem
  atributo duplicado, seta apontando de acadêmico para identidade.
