# ADR 0004 — CPF como identificador de acesso, e-mail volta a ser só contato

**Status:** aceita — Estágio 01
**Parcialmente superseded pela ADR 0006:** a decisão central segue valendo e sai reforçada. Cai
apenas a consequência "Responsável sem CPF não recebe portal" — sob as premissas da 0006, o
responsável sem CPF deixa de ser cadastrável, e não só de receber acesso.

## Contexto

O login era `redeSlug + email + senha`, e o e-mail cumpria dois papéis que não são o mesmo:
identificar quem entra e dizer para onde mandar mensagem. Isso travava a edição de cadastro —
o caminho que originou este trabalho — porque `responsavel.email` (acadêmico) e `usuario.email`
(identidade) são colunas independentes que o produto tratava como se fossem uma só.

A prova de que a promessa era falsa está no texto de ajuda de `responsavel_novo.eta`: *"Único na
rede. É por ele que o responsável entra quando o administrador criar o acesso"*. Nada no modelo
garantia isso — `convidarUsuario` aceitava qualquer e-mail digitado, e a divergência podia nascer
no primeiro convite, sem edição nenhuma.

A mudança de schema segue a janela de compatibilidade da ADR 0003 (I6): `0007` abriu a janela —
coluna `cpf` anulável em `usuario` e `responsavel`, login aceitando CPF ou e-mail — e `0008` a
fecha, depois que o seed provou que toda linha de `usuario` já tem CPF.

## Decisão

O identificador de acesso passa a ser o **CPF**, que não muda. O e-mail volta a ser só contato.

O vínculo entre o cadastro de uma pessoa (`responsavel`, no acadêmico) e a credencial dela
(`usuario`, na identidade) passa a se dar por CPF. Como o CPF é imutável, o problema da
divergência deixa de existir por construção — não é remediado, é eliminado.

CPF não é segredo e não vira fator de autenticação: a credencial continua sendo a senha. O que o
CPF traz é identificação estável.

**Descartado:** manter o e-mail como identificador e apenas tornar a divergência visível na
tela — mostrar um aviso quando `responsavel.email` e `usuario.email` de uma mesma pessoa
diferissem. Essa alternativa trata o sintoma, não a causa: não impede a divergência de nascer,
só a denuncia depois que já nasceu, e cada tela nova que tocasse nos dois cadastros precisaria
lembrar de repetir a checagem. Trocar o identificador remove a categoria inteira do problema em
vez de instrumentá-la.

## Consequências

- **E-mail deixa de ser único por rede.** `0008` derruba `usuario_email_unico_na_rede` — a
  restrição só fazia sentido enquanto o e-mail identificava. Mãe e pai passam a poder
  compartilhar um e-mail de família.
- **Responsável sem CPF não recebe portal.** `responsavel.cpf` segue anulável para sempre, com o
  índice parcial de `0007`: quem não informa CPF continua existindo como contato e aparece na
  ficha do aluno, mas `convidarUsuario` não cria acesso sem CPF válido. É a decisão explícita
  sobre o responsável estrangeiro.
- **CPF é dado pessoal e passa a trafegar em toda tentativa de login**, não só no cadastro — sob a
  LGPD, isso pesa mais do que um identificador que já era digitado só uma vez. `CHAVES_PROIBIDAS`
  em `src/shared/log/redacao.ts` já redige `cpf` antes deste commit, e o CPF nunca entra em query
  string; a redação foi escrita prevendo este dia.
- **A janela fica provada, não só descrita.** O teste que afirmava "durante a janela, ainda entra
  com e-mail" é apagado — não comentado, não pulado — e dá lugar ao seu negativo fotográfico,
  "e-mail não entra mais". As duas pontas, lado a lado no histórico de commits, são a demonstração
  executável de I6: nenhuma migração remove o que a versão anterior lê, e o código novo prova que
  parou de precisar do que a migração seguinte remove.
