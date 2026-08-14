# CPF como identificador de acesso

**Data:** 2026-08-14
**Estágio:** 01 (alteração do que já está implementado; não antecipa nada do Estágio 02+)
**Status:** aprovado, aguardando plano de implementação

## Problema

O login hoje é `redeSlug + email + senha`, e o e-mail cumpre dois papéis que não são o mesmo:
identificar quem entra e dizer para onde mandar mensagem. Isso trava a edição de cadastro — o
caminho que originou este trabalho — porque `responsavel.email` e `usuario.email` são colunas
independentes que o produto trata como se fossem uma só.

A prova de que a promessa é falsa está no texto de ajuda de `responsavel_novo.eta`: *"Único na
rede. É por ele que o responsável entra quando o administrador criar o acesso"*. Nada no modelo
garante isso — `convidarUsuario` aceita qualquer e-mail digitado, e a divergência pode nascer hoje,
sem edição nenhuma.

## Decisão

O identificador de acesso passa a ser o **CPF**, que não muda. O e-mail volta a ser só contato.

O vínculo entre o cadastro de uma pessoa (`responsavel`, no acadêmico) e a credencial dela
(`usuario`, na identidade) passa a se dar por CPF. Como o CPF é imutável, o problema da divergência
deixa de existir por construção — não é remediado, é eliminado.

CPF não é segredo e não vira fator de autenticação: a credencial continua sendo a senha. O que o
CPF traz é identificação estável.

## Escopo

**Entra:** coluna `cpf` em `usuario` e `responsavel`; validação de dígitos verificadores;
autenticação por CPF; convite e cadastro pedindo CPF; exibição formatada; redação em log; seed com
CPF gerado; ADR registrando a decisão.

**Não entra:** edição das quatro entidades e desativação de unidade/usuário — trabalho aprovado à
parte, que vem depois desta troca porque ela muda o conteúdo daqueles formulários. CPF de aluno
(dado de censo, sem uso no Estágio 01). Documento genérico com tipo (passaporte, RNE).

## 1. Modelo de dados

Duas migrações, conforme `docs/ADR/0003-janela-de-compatibilidade-de-migracao.md`: nunca remover
coluna que a versão anterior ainda lê.

### `0007_cpf.sql` — abre a janela (commit A)

```sql
ALTER TABLE usuario     ADD COLUMN cpf text;
ALTER TABLE responsavel ADD COLUMN cpf text;

ALTER TABLE usuario     ADD CONSTRAINT usuario_cpf_formato
  CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');
ALTER TABLE responsavel ADD CONSTRAINT responsavel_cpf_formato
  CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');

CREATE UNIQUE INDEX usuario_cpf_unico_na_rede
  ON usuario (rede_id, cpf) WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX responsavel_cpf_unico_na_rede
  ON responsavel (rede_id, cpf) WHERE cpf IS NOT NULL;
```

O índice é **parcial** porque durante a janela existem linhas sem CPF, e vários `NULL` não colidem
entre si. Sem o `WHERE`, a primeira linha sem CPF impediria a segunda.

### `0008_cpf_obrigatorio.sql` — fecha a janela (commit B)

```sql
ALTER TABLE usuario ALTER COLUMN cpf SET NOT NULL;

DROP INDEX usuario_cpf_unico_na_rede;
ALTER TABLE usuario ADD CONSTRAINT usuario_cpf_unico_na_rede UNIQUE (rede_id, cpf);

ALTER TABLE usuario DROP CONSTRAINT usuario_email_unico_na_rede;
```

`responsavel.cpf` **não muda nesta migração**: fica anulável para sempre, com o índice parcial. É a
decisão sobre o responsável estrangeiro — a pessoa existe como contato e aparece na ficha do aluno,
mas não pode receber acesso ao portal enquanto não informar CPF.

`usuario.email` continua `NOT NULL` — é o contato que o Estágio 04 vai usar —, mas deixa de ser
único: mãe e pai podem compartilhar um e-mail de família, restrição que só fazia sentido enquanto
ele identificava.

**Armazenamento:** onze dígitos, sem pontuação. A busca do login precisa ser determinística
independente de quem digitou ter usado pontos.

**Divisão de responsabilidade**, igual à que o projeto já pratica: o banco garante forma e
unicidade; o domínio garante os dígitos verificadores.

## 2. Validação e geração — `src/shared/documento/cpf.ts`

Módulo puro, sem dependência de banco, HTTP, log ou biblioteca.

| Função | Contrato |
|---|---|
| `normalizarCpf(bruto: string): string` | devolve só os dígitos |
| `cpfValido(digitos: string): boolean` | onze dígitos, não todos iguais, dois verificadores corretos |
| `formatarCpf(digitos: string): string` | `12345678909` → `123.456.789-09`; entrada inválida devolve o travessão dos demais formatadores |
| `gerarCpf(semente: number): string` | CPF sintaticamente válido e determinístico |

Sequência repetida (`00000000000`, `11111111111`, …) passa na aritmética dos verificadores e
precisa de recusa explícita.

`gerarCpf` monta os nove dígitos-base com o prefixo fixo `10` seguido de sete dígitos da semente, e
então calcula os dois verificadores. O prefixo tem dois dígitos diferentes entre si, então a base
**nunca** sai uniforme — não há caso a pular, e é justamente pular casos que faria duas sementes
caírem no mesmo CPF. O mapeamento é injetivo para semente em `[0, 10.000.000)`. Serve ao seed e às
fixtures de
teste — não tem uso em produção, e o cabeçalho do arquivo diz isso. Mora junto do validador porque
é o mesmo algoritmo visto do outro lado: o teste de propriedade
`cpfValido(gerarCpf(n)) === true` para uma faixa de sementes exercita os dois de uma vez, e um erro
em qualquer um deles derruba a suíte.

### Fronteira de dependência

`src/shared/documento/` é alcançável pelo domínio. A regra `dominio-puro` do dependency-cruiser
bloqueia hoje `shared/{db,http,log,jobs}`, então o código passa — mas o **comentário** da regra
declara algo mais estrito (*"Só pode alcançar `src/shared/ports/` e `src/shared/resultado.ts`"*).

O comentário é atualizado junto, para incluir utilitário de valor puro. Deixar a regra dizendo uma
coisa e o código fazendo outra é pior que qualquer das duas alternativas.

Descartado: pôr o validador em `identidade/dominio/` e expor por `identidade.cpfValido`. Funciona
sem tocar em regra nenhuma, mas acopla `academico` a `identidade` por causa de aritmética de dígito
verificador — contra o objetivo de extração do Estágio 14.

## 3. Autenticação

Login passa a ser `redeSlug + cpf + senha`.

**Commit A (janela aberta).** `autenticar` recebe um identificador e decide pela forma: contém `@`,
é e-mail; senão é normalizado e tratado como CPF. O campo do formulário chama-se `identificador` e
o rótulo diz **"CPF ou e-mail"** — honesto sobre o que a tela aceita naquele momento.

**Commit B (janela fechada).** O ramo do e-mail sai. O campo passa a chamar-se `cpf`, com rótulo
"CPF", `inputmode="numeric"` e aceitando pontuação ou não.

A mensagem de recusa continua deliberadamente vaga — agora ela não diz se o CPF existe, do mesmo
jeito que hoje não diz se o e-mail existe.

## 4. Convite e cadastro

`/rede/usuarios/novo` ganha campo **CPF obrigatório**; o e-mail continua, como contato.

Escolhido um cadastro de responsável **que já tem CPF**, o domínio recusa quando o CPF digitado
difere do cadastro: *"O CPF não confere com o do cadastro de Fulana."* A mensagem não revela o
número — quem cria o acesso tem o documento em mãos.

Quando o cadastro está **sem** CPF, não há divergência a impedir e o convite segue com o CPF
digitado. Isso é deliberado e é o que mantém a janela honesta: durante ela, os responsáveis já
cadastrados ainda não têm CPF, e exigi-lo do cadastro bloquearia um fluxo que funcionava — o
oposto do que a compatibilidade promete. O cadastro do responsável ganha CPF quando alguém o
editar, trabalho que vem no lote seguinte.

Uma consequência que precisa estar clara: enquanto a janela estiver aberta, cadastro e credencial
de um mesmo responsável podem ter CPFs diferentes se alguém digitar errado no convite. É uma
janela estreita — some no commit B para quem já tem CPF nos dois lados, e a edição de responsável
fecha o resto.

`/secretaria/responsaveis/novo` ganha campo **CPF opcional**, com ajuda explicando que sem ele a
pessoa fica como contato e não recebe acesso ao portal.

## 5. Apresentação

Coluna de CPF formatado nas listas de usuários e de responsáveis: quem administra a rede precisa
conseguir dizer a alguém qual é o CPF de acesso.

`formatarCpf` entra no contexto de template em `render.ts`, ao lado de `formatarData` e dos
auxiliares de erro — o template recebe `it.formatarCpf` pronto.

## 6. Log e privacidade

`CHAVES_PROIBIDAS` em `src/shared/log/redacao.ts:15` **já contém `cpf`** — a redação de log foi
escrita prevendo este dia e não precisa de mudança nenhuma.

O que falta é a prova. O teste `testes/web/checklist.test.ts` já tem `const CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/` e
afirma que nenhuma linha de log contém CPF. Hoje ele passa por vacuidade: não existe CPF no
sistema. Passa a valer de verdade — o cenário de log ganha um CPF inconfundível e o teste afirma
que ele não aparece, nem formatado nem em dígitos crus.

CPF nunca entra em query string.

## 7. Seed

`scripts/seed.ts` grava CPF em todo `usuario` e em todo `responsavel`, via `gerarCpf`, e imprime o
CPF junto das credenciais — como já publica a senha, por ser base de aula.

## 8. Testes

**Unidade (`shared/documento/cpf`)**
- `cpfValido` aceita CPF correto e recusa: tamanho errado, caractere não numérico, verificador
  errado, sequência repetida
- `normalizarCpf` tira pontuação, espaço e traço
- `formatarCpf` devolve a máscara; entrada inválida devolve travessão
- propriedade: `cpfValido(gerarCpf(n))` para uma faixa de sementes, e `gerarCpf` não repete dentro
  da faixa

**Autenticação**
- entra com CPF pontuado e com CPF cru
- entra com e-mail (commit A) — este teste é **removido no commit B**, e a remoção faz parte da
  demonstração da janela
- CPF inexistente e senha errada dão a mesma recusa vaga

**Convite e cadastro**
- CPF inválido é recusado com erro no campo
- CPF repetido na mesma rede é recusado
- o mesmo CPF em outra rede é aceito (a unicidade é por tenant)
- convite apontando responsável cujo CPF diverge é recusado
- convite apontando responsável sem CPF é recusado

**Privacidade**
- nenhum CPF do cenário aparece no log de um fluxo completo

## 9. Sequência de entrega

**Commit A — abre a janela.** `0007`, `shared/documento/cpf.ts`, autenticação aceitando os dois,
convite e cadastro com CPF, exibição, redação de log, seed, testes. Ao fim, quem tem CPF entra por
CPF e quem não tem continua entrando por e-mail. Rollback seguro: o código anterior ignora a coluna
nova.

**Commit B — fecha a janela.** `0008`, remoção do ramo de e-mail na autenticação, campo do
formulário renomeado, teste da janela removido. Ao fim, CPF é o único identificador.

**ADR 0004** — `docs/ADR/0004-cpf-como-identificador-de-acesso.md`, registrando a decisão no formato
que o repositório já usa. Entra no commit B, quando a decisão está de fato consumada.

## 10. Riscos

**CPF passa a ser digitado em toda entrada.** É dado pessoal sob a LGPD. Mitigado pela redação em
log (seção 6) e pela ausência de CPF em URL. Aceito: é a contrapartida de usar um identificador
estável.

**A janela pode ficar aberta indefinidamente** se o commit B não sair. Mitigado por entregar os
dois em sequência imediata; o repositório é material de aula e não tem base com dado real a
recolher.

**Alguém pode ler `gerarCpf` como utilitário de produção.** Mitigado pelo cabeçalho do arquivo e
pelo nome do diretório de testes que o consome.
