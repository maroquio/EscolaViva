# Evolução de um SaaS — Guia de Referência para Agentes de IA

> **Fonte:** curso interativo `Evolução de um SaaS` (`backend/bundles/saas-evolution/index.html`,
> constantes `STAGES`, `C`, `LAYERS`, `TECH`, `GLOSSARY`).
> Este documento é a transcrição estruturada do conteúdo do curso, acrescida das regras de
> compatibilidade que um agente precisa seguir para propor um sistema que atravesse os 14
> estágios sem reescrita.

---

## 1. Para que serve este documento

Este arquivo é o *briefing* de um agente de IA encarregado de **propor, projetar ou revisar a
arquitetura de um SaaS**. O curso descreve uma trajetória de 14 estágios, de 40 contas
pagantes a 700 mil, em que **cada componente entra como resposta a uma dor concreta** — nunca
por antecipação.

O agente instruído por este documento deve produzir uma arquitetura que satisfaça,
simultaneamente, duas exigências que parecem contraditórias:

1. **Começar no Estágio 01** — nada além de cliente web, aplicação monolítica e banco relacional.
2. **Ser compatível com o Estágio 14** — cada um dos 13 estágios seguintes deve ser alcançável
   por *adição*, não por reescrita.

A ponte entre as duas é a **Seção 5 (Invariantes de Compatibilidade)**: decisões que custam
pouco no dia 1 e que, se ignoradas, transformam um estágio futuro em um projeto de migração.

### Prompt-base sugerido

```
Você vai propor a arquitetura de um SaaS de <domínio>.

Leia docs/EVOLUCAO_SAAS.md e siga o modelo de evolução por dor descrito nele:

1. Entregue o Estágio 01 completo (cliente web + monólito modular + banco relacional).
2. Para cada um dos 14 estágios, produza:
   - o gatilho de dor que autoriza a entrada do componente naquele contexto;
   - a métrica ou sintoma observável que confirma que a dor chegou;
   - o que muda no código e na infraestrutura;
   - o que continua deliberadamente de fora, e por quê.
3. Respeite TODAS as invariantes da Seção 5 já no Estágio 01.
4. Nunca antecipe um componente. Se o componente não tem dor correspondente
   no estágio proposto, ele não entra — registre-o em "Deixado de fora de propósito".
```

---

## 2. Os três princípios do curso

Toda decisão do curso deriva destes três princípios. O agente deve poder justificar qualquer
recomendação citando um deles.

### 2.1 Componente só entra depois da dor

> "Simplicidade aqui não é atalho, é a decisão certa." — Estágio 01

Não existe componente que entre por boa prática, por moda ou por currículo. Cada estágio
começa com **o que doeu** (um sintoma concreto, mensurável) e só então introduz o componente.

### 2.2 Todo componente cobra aluguel permanente

> "Cada componente adicionado cobra aluguel permanente: deploy, monitoramento, plantão e
> alguém que entenda quando quebrar."

O aluguel é pago para sempre e inclui: um deploy a mais, um alvo de monitoramento a mais, uma
entrada no plantão, uma seção na documentação, e a lentidão que ele impõe à próxima entrega.
Enquanto o aluguel for maior que o benefício, o componente não entra.

### 2.3 O que fica de fora é decisão, não esquecimento

Cada estágio do curso declara explicitamente **o que foi deixado de fora de propósito**, com
duas informações: *por quê* e *entra quando*. Uma proposta de arquitetura sem essa lista é
incompleta — ela não distingue "ainda não precisamos" de "não pensamos nisso".

---

## 3. Modelo de camadas

O diagrama do curso organiza os componentes em seis camadas. As quatro primeiras formam o
eixo vertical do sistema; as duas últimas são transversais.

| # | Camada | O que é | Componentes |
|---|--------|---------|-------------|
| 01 | **Canais** | Por onde o usuário entra | Cliente Web |
| 02 | **Borda** | O que atende antes da aplicação | CDN, Balanceador de Carga, WAF e Rate Limiting, API Gateway |
| 03 | **Aplicação** | Onde o produto acontece | Aplicação Monolítica, Fila de Mensagens, Worker Assíncrono, Serviço Extraído |
| 04 | **Dados** | A fonte da verdade e seus apoios | Banco Relacional, Armazenamento de Objetos, Cache em Memória, Réplica de Leitura, Busca Dedicada |
| — | **Externo** (integrações) | Serviços de terceiros | Gateway de Pagamentos, Mensageria (E-mail/SMS) |
| — | **Operação** | Como o sistema é observado e entregue | Observabilidade, CI/CD e Testes, Tracing Distribuído |

---

## 4. Os 14 estágios

### Visão geral

| # | Título | Componentes que entram | Contas | Time | Fase | Infra |
|---|--------|------------------------|--------|------|------|-------|
| 01 | O monólito que basta | Cliente Web, Aplicação Monolítica, Banco Relacional | 40 | 2 | Pré-seed | 1 servidor |
| 02 | Dinheiro entra no produto | Gateway de Pagamentos | 300 | 3 | Pré-seed | 1 servidor |
| 03 | Arquivos não podem morar no servidor | Armazenamento de Objetos | 900 | 4 | Seed | 1 servidor |
| 04 | O produto precisa falar com o usuário | Mensageria (E-mail/SMS) | 2.500 | 5 | Seed | 1 servidor |
| 05 | Tirar o lento do caminho do usuário | Fila de Mensagens, Worker Assíncrono | 6.000 | 7 | Seed | 2 servidores |
| 06 | Aproximar o conteúdo do usuário | CDN | 12.000 | 9 | Série A | 2 servidores |
| 07 | Parar de perguntar a mesma coisa ao banco | Cache em Memória | 25.000 | 12 | Série A | 3 servidores |
| 08 | Deixar de ter um ponto único de falha | Balanceador de Carga | 45.000 | 18 | Série A | 6 instâncias |
| 09 | A borda vira alvo | WAF e Rate Limiting | 70.000 | 24 | Série B | 6 instâncias |
| 10 | Separar quem lê de quem escreve | Réplica de Leitura | 110.000 | 30 | Série B | 6 instâncias |
| 11 | Enxergar o que está acontecendo | Observabilidade | 180.000 | 40 | Série B | 12 instâncias |
| 12 | Entregar sem depender de heroísmo | CI/CD e Testes | 260.000 | 55 | Série B | 12 instâncias |
| 13 | Buscar deixa de ser filtrar | Busca Dedicada | 400.000 | 70 | Série C | 20 instâncias |
| 14 | O primeiro serviço sai do monólito | Serviço Extraído, API Gateway, Tracing Distribuído | 700.000 | 110 em 9 times | Série C | 40+ instâncias |

> As colunas de escala são **referência de ordem de grandeza**, não gatilho. O gatilho é sempre
> a dor descrita em "O que doeu". Um produto B2B com 400 contas de altíssimo valor pode chegar
> ao Estágio 10 antes de um B2C com 200 mil.

---

### Estágio 01 — O monólito que basta

**Entra:** Cliente Web · Aplicação Monolítica · Banco de Dados Relacional
**Escala:** 40 contas ativas · 2 pessoas · Pré-seed · 1 servidor

**O que doeu:** Nada doeu ainda. Duas pessoas, quarenta contas pagantes e uma pergunta de
suporte por semana. O sistema inteiro cabe em um repositório, sobe com um comando e é depurado
com um breakpoint.

**Por que agora:** Simplicidade aqui não é atalho, é a decisão certa. Cada componente adicionado
cobra aluguel permanente: deploy, monitoramento, plantão e alguém que entenda quando quebrar.
Enquanto ninguém sente dor, esse aluguel é maior que o benefício.

**Deixado de fora de propósito:** Fila · Cache · Réplica · Microserviços
*Por quê:* nenhum deles resolve um problema que este sistema tem hoje.
*Entra quando:* um de cada vez, quando uma dor concreta aparecer — os treze estágios seguintes
são exatamente essas dores.

---

### Estágio 02 — Dinheiro entra no produto

**Entra:** Gateway de Pagamentos
**Escala:** 300 contas · 3 pessoas · Pré-seed · 1 servidor

**O que doeu:** O produto saiu do plano gratuito e precisou cobrar assinatura. Ninguém no time
queria guardar número de cartão, nem lidar com fraude e chargeback.

**Por que agora:** Pagamento é problema regulado, com antifraude, parcelamento e disputa. O
gateway resolve isso e mantém o dado sensível fora do seu servidor: o cartão vai do navegador
direto para ele, e você fica com um identificador opaco e um webhook.

**Deixado de fora:** Fila de mensagens.
*Por quê:* o aviso do gateway é processado na hora, dentro da mesma requisição — neste volume
dá certo. *Entra quando:* o processamento demorar a ponto de o gateway achar que você não
respondeu e reenviar o aviso.

---

### Estágio 03 — Arquivos não podem morar no servidor

**Entra:** Armazenamento de Objetos
**Escala:** 900 contas · 4 pessoas · Seed · 1 servidor

**O que doeu:** Os usuários passaram a anexar documentos. Os arquivos iam para o disco local —
e desapareceram no deploy de terça, quando o container foi substituído por um novo.

**Por que agora:** Servidor de aplicação precisa ser descartável. Qualquer estado que more nele
é perdido no próximo deploy e impede ter uma segunda máquina.

**Deixado de fora:** CDN.
*Por quê:* os arquivos são servidos pelo próprio servidor da aplicação; com tráfego pequeno e
concentrado numa região, isso não incomoda. *Entra quando:* houver usuários longe do servidor,
ou quando a banda virar item relevante da fatura.

---

### Estágio 04 — O produto precisa falar com o usuário

**Entra:** Mensageria (E-mail / SMS)
**Escala:** 2.500 contas · 5 pessoas · Seed · 1 servidor

**O que doeu:** Confirmação de cadastro, redefinição de senha e aviso de falha de cobrança
viraram parte do fluxo. As primeiras tentativas com servidor de e-mail próprio caíram no spam.

**Por que agora:** Entregar e-mail de forma confiável depende de reputação de IP e domínio,
autenticação por SPF e DKIM e relação com provedores. É trabalho contínuo, sem diferencial
competitivo.

**Deixado de fora:** Fila de mensagens · Worker.
*Por quê:* o e-mail sai dentro da requisição; o usuário espera o provedor responder.
*Entra quando:* no primeiro dia em que o provedor ficar lento — é o próximo estágio.

---

### Estágio 05 — Tirar o lento do caminho do usuário

**Entra:** Fila de Mensagens · Worker Assíncrono
**Escala:** 6.000 contas · 7 pessoas · Seed · 2 servidores

**O que doeu:** O provedor de e-mail teve uma tarde ruim e passou a responder em nove segundos.
Como o envio era feito dentro da requisição, finalizar o cadastro começou a dar timeout. O
produto inteiro parecia fora do ar por causa de um e-mail.

**Por que agora:** A fila desacopla quem pede de quem executa. A aplicação grava, publica a
tarefa e responde na hora; o worker processa quando conseguir e tenta de novo se falhar. Falha
de terceiro deixa de virar falha sua.

**Deixado de fora:** Serviços separados.
*Por quê:* fila e worker rodam o mesmo código, no mesmo repositório e no mesmo banco — só a
porta de entrada mudou. *Entra quando:* times diferentes precisarem publicar em ritmos
diferentes.

---

### Estágio 06 — Aproximar o conteúdo do usuário

**Entra:** CDN
**Escala:** 12.000 contas · 9 pessoas · Série A · 2 servidores

**O que doeu:** Clientes em outras regiões relatavam páginas lentas, e a medição confirmou:
tudo vinha de uma única região. A conta de banda já era o segundo maior item da fatura.

**Por que agora:** A CDN mantém cópia do conteúdo estático perto de quem acessa e absorve a
maior parte das requisições antes que cheguem à origem. Ganha-se latência e capacidade sem
alterar a aplicação.

**Deixado de fora:** Cache de conteúdo dinâmico.
*Por quê:* a CDN guarda só arquivos estáticos. *Entra quando:* a leitura repetida ao banco virar
gargalo — e aí a resposta é cache em memória, não CDN.

---

### Estágio 07 — Parar de perguntar a mesma coisa ao banco

**Entra:** Cache em Memória
**Escala:** 25.000 contas · 12 pessoas · Série A · 3 servidores

**O que doeu:** O painel inicial roda a mesma consulta pesada a cada carregamento, e o usuário
recarrega várias vezes por hora. O banco vivia com CPU acima de 85%.

**Por que agora:** O cache guarda o resultado pronto e o devolve em microssegundos. Isso adia o
custo bem maior de escalar a camada de dados. **Os índices foram revisados antes: cache é o que
sobra depois de esgotar o barato.**

**Deixado de fora:** Cache de dado crítico.
*Por quê:* saldo, permissão e disponibilidade continuam vindo direto do banco. *Entra quando:*
nunca, provavelmente — nem todo dado deve ser cacheado.

---

### Estágio 08 — Deixar de ter um ponto único de falha

**Entra:** Balanceador de Carga
**Escala:** 45.000 contas · 18 pessoas · Série A · 6 instâncias

**O que doeu:** Todo deploy tirava o sistema do ar por três minutos, e eles passaram a acontecer
diariamente. Pior: o servidor era um só, então um problema de hardware significaria uma manhã
inteira fora do ar.

**Por que agora:** O balanceador distribui tráfego entre instâncias, roda health check em cada
uma e retira de rotação a que falhou. É o que permite subir a versão nova antes de derrubar a
antiga, e sobreviver à perda de uma máquina.

**Deixado de fora:** Redundância do banco.
*Por quê:* a aplicação passou a escalar, o banco não — ele agora é o único ponto único de falha
que sobrou. *Entra quando:* leitura pesada e escrita crítica começarem a competir pelo mesmo
banco.

---

### Estágio 09 — A borda vira alvo

**Entra:** WAF e Rate Limiting
**Escala:** 70.000 contas · 24 pessoas · Série B · 6 instâncias

**O que doeu:** Um concorrente passou a raspar dados públicos em massa, e a tela de login
começou a receber credential stuffing com listas de senhas vazadas. Algumas contas de clientes
foram invadidas.

**Por que agora:** Filtrar isso na aplicação significa pagar o custo de processar o ataque. O WAF
barra padrões conhecidos e limita a taxa por origem e por conta antes que a requisição chegue ao
servidor, protegendo capacidade e usuários ao mesmo tempo.

**Deixado de fora:** Autenticação em dois fatores.
*Por quê:* o WAF reduz o volume do ataque, mas não impede que uma senha correta e vazada
funcione. *Entra quando:* o dado guardado justificar o atrito extra no login.

---

### Estágio 10 — Separar quem lê de quem escreve

**Entra:** Réplica de Leitura
**Escala:** 110.000 contas · 30 pessoas · Série B · 6 instâncias

**O que doeu:** Os clientes ganharam relatórios e exportação. Toda virada de mês, as consultas
analíticas travavam o banco e o produto ficava lento para todos por horas.

**Por que agora:** Relatório e operação têm requisitos opostos: um lê muito e tolera segundos de
atraso, o outro escreve pouco e precisa de resposta imediata. A réplica isola os dois. De quebra,
ela é candidata a promoção se o primário falhar.

**Deixado de fora:** Data warehouse.
*Por quê:* a réplica atende relatório operacional, não análise histórica; consultas de cohort e
retenção sobrecarregariam a réplica do mesmo jeito. *Entra quando:* existir um time de dados com
perguntas que o produto não responde.

---

### Estágio 11 — Enxergar o que está acontecendo

**Entra:** Observabilidade
**Escala:** 180.000 contas · 40 pessoas · Série B · 12 instâncias

**O que doeu:** Um incidente de quarenta minutos foi descoberto por um e-mail de cliente. Com
uma dúzia de instâncias descartáveis, não havia mais onde "entrar no servidor para ver o log".

**Por que agora:** Logs centralizados, métricas e alertas transformam suposição em medição. O
objetivo não é painel bonito: é reduzir o tempo entre o problema começar e alguém saber dele, e
depois o tempo até entender a causa.

**Deixado de fora:** Tracing distribuído.
*Por quê:* é quase tudo um processo só; o profiler da aplicação já responde onde o tempo foi
gasto. *Entra quando:* a requisição passar a atravessar mais de um processo.

---

### Estágio 12 — Entregar sem depender de heroísmo

**Entra:** CI/CD e Testes
**Escala:** 260.000 contas · 55 pessoas · Série B · 12 instâncias

**O que doeu:** Com seis times mexendo no mesmo código, um deploy manual na sexta-feira quebrou
a cobrança. A correção levou duas horas porque ninguém sabia com certeza o que tinha ido para
produção.

**Por que agora:** A esteira roda a verificação a cada commit, gera um artefato imutável e
publica de forma gradual, com rollback rápido. Deploy deixa de ser evento e vira rotina — e é a
rotina que permite corrigir rápido quando algo passa.

**Deixado de fora:** Cobertura total de testes.
*Por quê:* testar tudo custa caro e envelhece mal; a esteira cobre o caminho crítico — entrar,
executar a ação principal, cobrar. *Entra quando:* nunca como meta — a cobertura cresce nos
pontos onde já houve incidente.

---

### Estágio 13 — Buscar deixa de ser filtrar

**Entra:** Busca Dedicada
**Escala:** 400.000 contas · 70 pessoas · Série C · 20 instâncias

**O que doeu:** A busca virou a porta de entrada do produto. Com consulta por curinga no banco,
erro de digitação não encontrava nada e cada busca varria a tabela inteira. Passou a ser o
endpoint mais lento do sistema.

**Por que agora:** Um índice invertido resolve tolerância a erro, sinônimo, relevância e faceta —
coisas que um banco relacional não foi projetado para fazer. Só vale quando a busca é
funcionalidade central, não quando é uma lista com filtro.

**Deixado de fora:** Busca como fonte da verdade.
*Por quê:* o índice é uma cópia atualizada com atraso; se o preço mudou há dois segundos, a
busca ainda pode mostrar o antigo. Ela serve para o usuário encontrar o item, mas quem decide
preço, disponibilidade e permissão na hora de confirmar continua sendo o banco.
*Entra quando:* nunca — cópia não vira fonte da verdade.

---

### Estágio 14 — O primeiro serviço sai do monólito

**Entra:** Serviço Extraído · API Gateway · Tracing Distribuído
**Escala:** 700.000 contas · 110 pessoas em 9 times · Série C · 40+ instâncias

**O que doeu:** Cobrança tinha time dedicado, ciclo de mudança próprio e exigências de
conformidade diferentes do resto. Mesmo assim, cada ajuste esperava na mesma fila de deploy que
o restante do produto.

**Por que agora:** A extração aconteceu **por dor de organização, não por moda**. O domínio
escolhido tinha fronteira clara e dono definido — os dois critérios que importam. O gateway dá
uma porta única a quem consome a API: o aplicativo continua chamando um só endereço, sem precisar
saber que agora existem dois sistemas atrás dele. E o tracing recupera a visibilidade que se
perde na separação: dentro do monólito, uma função chamava a outra e o profiler mostrava o
caminho inteiro; agora essa chamada atravessa a rede.

**Deixado de fora:** Os demais domínios.
*Por quê:* o resto do sistema continua monolítico, por escolha — cada serviço extraído cobra
deploy, plantão e coordenação próprios. *Entra quando:* um de cada vez, e só quando existir um
time para pagar essa conta.

---

## 5. Invariantes de compatibilidade

Esta é a seção operativa para o agente. São as decisões que **precisam existir no Estágio 01**
para que os estágios 02–14 sejam adição, e não reescrita. Todas custam pouco no dia 1.

| # | Invariante | Estágio que ela destrava | Custo se ignorada |
|---|-----------|--------------------------|-------------------|
| I1 | **Monólito modular**: pastas por domínio (`cobranca/`, `identidade/`, `agenda/`) que só conversam por interfaces públicas, com a regra verificada pela ferramenta de build | 14 | Extração vira reescrita; "big ball of mud" em dois anos |
| I2 | **Aplicação stateless**: nenhum estado em memória de processo nem em disco local; sessão em cookie assinado ou em armazém compartilhado | 03, 08 | Sticky session permanente; segunda instância impossível |
| I3 | **Efeitos colaterais atrás de interface** (`Mailer`, `FileStorage`, `PaymentGateway`): a chamada síncrona do Estágio 04 vira publicação em fila no 05 trocando a implementação | 05 | Cada ponto de envio precisa ser reescrito individualmente |
| I4 | **Idempotência em toda entrada externa**: webhook e job registram o identificador do evento antes de processar | 02, 05 | Cobrança em duplicidade; reentrega da fila corrompe dados |
| I5 | **Banco é a única fonte da verdade**; cache, índice de busca e réplica são projeções que nunca decidem nada | 07, 10, 13 | Preço, permissão ou saldo lidos de cópia desatualizada |
| I6 | **Migrações versionadas** no repositório, aplicadas na mesma ordem em todos os ambientes, com janela de compatibilidade (nunca remover coluna que a versão anterior ainda lê) | 08, 12 | Deploy sem indisponibilidade se torna impossível |
| I7 | **Backup com restauração testada** (não apenas backup) e point-in-time recovery | 01 → sempre | "Backup não verificado não é backup" |
| I8 | **Integridade no banco**: chave estrangeira, unicidade e restrição de verificação, não só na aplicação | 01 → sempre | Alguém grava direto e o modelo se rompe |
| I9 | **Chave do objeto, não URL completa**, guardada no banco para arquivos | 03, 06 | Migração de provedor de storage travada |
| I10 | **Assets versionados no nome** (`app.9f2c1b.js`) com TTL longo | 06 | Purga manual de CDN; usuários com arquivo antigo por minutos |
| I11 | **Nunca cachear resposta autenticada sem separar por usuário** | 06, 07 | Entregar dado de um cliente para outro — o erro mais grave da lista |
| I12 | **`X-Forwarded-For` lido corretamente** desde que exista qualquer proxy na frente | 06, 08, 09 | Rate limiting e investigação de abuso param de funcionar |
| I13 | **`/health` que verifica dependências** (não apenas "estou vivo") + connection draining no desligamento | 08 | Instância quebrada permanece em rotação |
| I14 | **Timeout da aplicação menor que o do balanceador** | 08 | Usuário vê 504, log registra sucesso, ninguém encontra o problema |
| I15 | **Roteamento leitura/escrita explícito por consulta** (uma função, mesmo que aponte sempre ao primário no início) | 10 | Leitura pós-escrita mostra dado antigo a quem acabou de salvar |
| I16 | **Correlation ID gerado na borda** e propagado em log, em cabeçalho HTTP e em metadado de mensagem | 11, 14 | Rastro quebra exatamente na fronteira assíncrona |
| I17 | **Log estruturado, sem dado pessoal nem segredo** | 11 | Problema de conformidade criado pela própria observabilidade |
| I18 | **Configuração por variável de ambiente, segredos fora do repositório** | 12 | Segredo no arquivo de esteira, lido por muita gente |
| I19 | **Artefato imutável e versionado** (mesma imagem em todos os ambientes) | 12 | "Funciona na homologação" |
| I20 | **Lock distribuído em todo job periódico** | 05, 08 | Job duplicado ao rodar em duas instâncias |
| I21 | **Eventos de domínio publicados via outbox** (mesma transação do dado) quando a fila entrar | 05, 14 | Dado e evento divergem |
| I22 | **Validação de verdade sempre no servidor**; validação no cliente é só retorno rápido | 01 → sempre | Regra de negócio visível, editável e não auditável |

---

## 6. Catálogo de componentes

Referência condensada. Para cada componente: quando entra, o que custa e as armadilhas que o
curso destaca.

### Canais

**Cliente Web** — *Canal*
Interface no navegador. No começo é HTML renderizado pelo próprio monólito: sem projeto
separado, sem build paralelo, sem API pública para versionar.
*Quando:* desde o dia 1. A pergunta real é quando separá-lo — a resposta honesta costuma ser
"quando existir um time de front-end".
*Custa:* SPA separada dobra deploys e obriga a criar API pública versionada.
*Armadilhas:* confiar na validação do cliente; adotar SPA por padrão; colocar regra de negócio
no navegador.
*Tecnologias:* HTML+CSS · htmx/Hotwire · React/Vue · Cookies de sessão.

### Borda

**CDN** — *Estágio 06*
Cópias do conteúdo estático perto de quem acessa; primeira camada a receber a requisição.
*Custa:* cache serve conteúdo velho com invalidação errada; mais uma camada entre você e o
defeito.
*Armadilhas:* cachear resposta autenticada sem separar por usuário; publicar arquivo novo com o
mesmo nome e depender de purga; TTL longo em conteúdo que muda; esquecer o `X-Forwarded-For`.
*Tecnologias:* Cloudflare · CloudFront · Fastly · Cache-Control + versão no nome.

**Balanceador de Carga** — *Estágio 08*
Distribui requisições entre instâncias e retira de rotação as que falham no health check.
*Custa:* obriga a aplicação a ser stateless; multiplica instâncias a observar.
*Armadilhas:* health check que não checa dependências; falta de draining; sticky session como
solução permanente; timeout do balanceador menor que o da aplicação.
*Tecnologias:* ALB/NLB · Nginx · HAProxy · Traefik.

**WAF e Rate Limiting** — *Estágio 09*
Filtro na borda que inspeciona a requisição antes de ela chegar à aplicação.
*Custa:* regra agressiva bloqueia cliente pagante; adiciona latência.
*Armadilhas:* ativar regras gerenciadas direto em modo de bloqueio; tratar WAF como substituto
de código seguro; limitar só por IP; não registrar o que foi bloqueado.
*Tecnologias:* Cloudflare WAF · AWS WAF · Token bucket · Bot management.

**API Gateway** — *Estágio 14*
Porta única da API pública: valida token, aplica política e roteia.
*Quando:* só quando existe mais de um serviço atrás da mesma API. Com um serviço só, o
balanceador já cumpre o papel.
*Custa:* ponto central de falha; mais um salto de rede.
*Armadilhas:* regra de negócio na configuração do gateway; virar barramento de integração;
achar que "estar atrás do gateway" significa seguro.
*Tecnologias:* Kong · Amazon API Gateway · Envoy · JWT com escopos.

### Aplicação

**Aplicação Monolítica** — *Estágio 01*
Um processo com todas as regras de negócio. Um repositório, um deploy, uma transação.
*Quando:* ponto de partida correto para praticamente todo produto novo. Só se sai daqui quando
coordenar deploys entre times doer mais que a rede entre serviços.
*Custa:* falha isolada derruba o processo inteiro; escala como bloco único.
*Armadilhas:* confundir monólito com bagunça; trocar por microserviços para resolver problema
de código — rede não conserta acoplamento.
*Tecnologias:* Rails/Django/Laravel · Spring Boot · .NET · Node+NestJS.

**Fila de Mensagens** — *Estágio 05*
Intermediário durável entre quem pede e quem executa.
*Custa:* troca resposta imediata por consistência eventual; mais um componente com estado.
*Armadilhas:* assumir entrega exatamente uma vez; não monitorar o tamanho da fila; ignorar a
dead-letter queue; passar objetos grandes na mensagem em vez do identificador.
*Tecnologias:* RabbitMQ · NATS/JetStream · Amazon SQS · Redis+Sidekiq · DLQ.

**Worker Assíncrono** — *Estágio 05*
Consome a fila. Mesmo código da aplicação, com entrada diferente.
*Custa:* dobra a superfície de deploy; falhas ficam invisíveis por padrão.
*Armadilhas:* worker novo lendo tarefa enfileirada pelo código antigo; job periódico sem lock;
tarefa longa sem ponto de retomada; tratar o worker como lugar sem regra.
*Tecnologias:* Sidekiq/Celery · BullMQ · Lock distribuído · Exponential backoff.

**Serviço Extraído** — *Estágio 14*
Primeiro pedaço retirado do monólito, com banco, deploy e time próprios.
*Quando:* quando times distintos disputam o mesmo deploy e uma parte tem requisitos de escala,
conformidade ou ritmo diferentes. Extrair por moda é o erro mais caro da lista.
*Custa:* transações locais viram coordenação distribuída; chamada de função vira chamada de rede.
*Armadilhas:* extrair e manter banco compartilhado (pior dos dois mundos); fatiar por camada
técnica; chamada síncrona em cadeia; começar por dez serviços de uma vez.
*Tecnologias:* Contrato versionado · Eventos de domínio · Database per service · Outbox pattern.

### Dados

**Banco de Dados Relacional** — *Estágio 01*
Fonte da verdade, com transações e restrições.
*Quando:* desde o primeiro dia. Resolve mais casos, por mais tempo, do que a discussão pública
sobre escalabilidade sugere.
*Custa:* é o componente com estado; vira o gargalo natural — quase toda evolução posterior
existe para tirar carga daqui.
*Armadilhas:* backup nunca restaurado; integridade só na aplicação; migração destrutiva sem
janela de compatibilidade; índice faltando descoberto só em produção.
*Tecnologias:* PostgreSQL · MySQL · Backup + point-in-time recovery · Migrações versionadas.

**Armazenamento de Objetos** — *Estágio 03*
Disco remoto para arquivos; cada arquivo vira uma URL. Devolve ao servidor a condição de
descartável.
*Custa:* não é sistema de arquivos; egress surpreende na fatura.
*Armadilhas:* bucket público "temporariamente"; confiar na extensão do arquivo em vez do
conteúdo real; guardar URL completa em vez da chave; passar todo upload pelo servidor de
aplicação, reintroduzindo o gargalo que o componente veio remover.
*Tecnologias:* Amazon S3 · Cloudflare R2 · MinIO · URLs pré-assinadas.

**Cache em Memória** — *Estágio 07*
Chave-valor em memória para respostas caras e repetidas.
*Quando:* quando a medição mostra a mesma leitura se repetindo. **Antes disso, um índice bem
colocado resolve o mesmo problema por muito menos.**
*Custa:* invalidação é problema difícil; cria um caminho onde o sistema funciona "quase sempre".
*Armadilhas:* usar cache para esconder consulta mal escrita; cache sem expiração; cache
stampede; cachear dado que precisa estar correto (saldo, permissão, estoque).
*Tecnologias:* Redis · Memcached · Cache-aside · TTL com jitter.

**Réplica de Leitura** — *Estágio 10*
Cópia do primário que atende somente consultas.
*Custa:* replication lag; a aplicação passa a decidir consulta a consulta; custo dobrado na
camada mais cara.
*Armadilhas:* ler da réplica logo após gravar no primário; **confundir réplica com backup** —
ela copia o erro fielmente, inclusive o `DELETE` sem cláusula; não monitorar o lag; promover sem
procedimento ensaiado.
*Tecnologias:* Streaming replication · Read/write splitting · Failover automático · Monitor de lag.

**Busca Dedicada** — *Estágio 13*
Índice invertido especializado em texto.
*Quando:* quando a busca vira funcionalidade central. Antes disso, a busca textual nativa do
PostgreSQL resolve muito bem.
*Custa:* mais uma cópia dos dados, que vai divergir; operação própria (shards, réplicas,
reindexação); relevância é ajuste contínuo.
*Armadilhas:* tratar o índice como fonte da verdade; não ter reindexação completa; sincronizar
por gatilho síncrono na escrita; expor a linguagem de consulta ao usuário final.
*Tecnologias:* OpenSearch/Elasticsearch · Meilisearch · Sincronização por eventos · Reindexação
programada.

### Externo

**Gateway de Pagamentos** — *Estágio 02*
Processa cartão, boleto e Pix. Os dados do cartão nunca tocam seu servidor.
*Custa:* taxa por transação, permanentemente; você herda a disponibilidade do fornecedor;
migrar de gateway depois é projeto, não configuração.
*Armadilhas:* webhook sem idempotência; tratar webhook como fonte da verdade sem reconciliar
contra a API; guardar qualquer parte do cartão; modelar assinatura como booleano no usuário e
não conseguir explicar o histórico de cobrança.
*Tecnologias:* Stripe · Mercado Pago · Pagar.me · Webhooks idempotentes.

**Mensageria (E-mail / SMS)** — *Estágio 04*
Entrega e-mail transacional e mensagem curta.
*Custa:* custo por mensagem; entregabilidade é reputação acumulada.
*Armadilhas:* misturar marketing e transacional no mesmo domínio; enviar de forma síncrona
dentro da requisição; não tratar rejeição permanente; dado sensível no corpo do e-mail.
*Tecnologias:* Amazon SES/Resend · Twilio · SPF+DKIM+DMARC · Templates versionados.

### Operação

**Observabilidade** — *Estágio 11*
Logs centralizados, métricas e alertas.
*Custa:* volume de log fica caro rápido; alerta demais gera fadiga e o time para de olhar.
*Armadilhas:* alertar em causa em vez de sintoma (alerte que a latência do usuário subiu, não
que a CPU está em 80%); registrar dado pessoal em log; painel sem alerta; métrica só de média —
ela esconde a tail latency.
*Tecnologias:* Grafana+Prometheus · OpenTelemetry · Datadog · Sentry.

**CI/CD e Testes** — *Estágio 12*
Verificação automática a cada commit e entrega sem passo manual.
*Custa:* suíte de testes é código e envelhece; esteira lenta faz o time contorná-la.
*Armadilhas:* teste instável; perseguir cobertura como número; segredo no arquivo da esteira;
rollback que nunca foi executado sob pressão.
*Tecnologias:* GitHub Actions · GitLab CI · Jenkins · Argo CD · Canary deploy · Feature flags.

**Tracing Distribuído** — *Estágio 14*
Identificador que atravessa gateway, serviços, fila e banco, produzindo uma linha do tempo.
*Custa:* instrumentação precisa existir em todos os serviços; amostragem é obrigatória em
volume alto; armazenamento de rastros é caro em escala.
*Armadilhas:* propagar contexto na API mas não na fila, cortando o rastro na fronteira
assíncrona; amostragem uniforme baixa; instrumentar só a borda; dado sensível nos atributos do
span.
*Tecnologias:* OpenTelemetry · Jaeger/Tempo · Propagação de contexto · Tail-based sampling.

---

## 7. Antipadrões que o agente deve recusar

Recusas diretas, com a justificativa que o curso oferece:

1. **Começar por microserviços.** "Rede não conserta acoplamento — ela o torna mais caro."
   Serviço extraído é o Estágio 14, e por dor de organização.
2. **Cache antes de índice.** "Cache é o que sobra depois de esgotar o barato."
3. **Fila antes de haver algo lento no caminho do usuário.** A fila do Estágio 05 existe porque
   um provedor externo passou a responder em nove segundos.
4. **CDN para resolver carga de banco.** CDN guarda estático; leitura repetida ao banco é cache.
5. **Busca dedicada para uma lista com filtro.** A busca textual nativa do PostgreSQL resolve
   muito bem antes disso.
6. **Réplica como estratégia de backup.** A réplica copia o erro fielmente.
7. **API Gateway com um único serviço atrás.** O balanceador já cumpre o papel.
8. **Tracing distribuído em monólito.** O profiler local já responde a pergunta.
9. **Perseguir cobertura de testes como número.** Cobrir o caminho crítico vale mais.
10. **Extrair serviço mantendo banco compartilhado.** Acoplamento de monólito com latência de rede.

---

## 8. Formato de saída esperado do agente

Para cada estágio proposto, o agente deve entregar exatamente estes campos — o mesmo esqueleto
que o curso usa:

```markdown
### Estágio NN — <título curto e concreto>

**Entra:** <componentes>
**Escala de referência:** <contas> · <time> · <fase> · <infra>

**O que doeu:** <sintoma observável, com número quando possível>
**Sinal de medição:** <a métrica que confirma a dor — p95, CPU do banco, tamanho da fila…>

**Por que agora:** <por que este componente e não outro; o que ele remove do caminho>

**O que muda:**
- Código: <mudanças concretas>
- Infraestrutura: <recursos novos>
- Operação: <o que entra no plantão e no monitoramento>

**Aluguel permanente:** <o custo contínuo assumido>

**Deixado de fora de propósito:** <lista>
- *Por quê:* <justificativa>
- *Entra quando:* <gatilho concreto>

**Invariantes exercidas:** <I1, I4, I16…>
```

---

## 9. Onde este conteúdo vive no repositório

| Artefato | Caminho |
|----------|---------|
| Bundle interativo (fonte da verdade do conteúdo) | `backend/bundles/saas-evolution/index.html` |
| Notas de empacotamento e CSP do bundle | `backend/bundles/saas-evolution/README.md` |
| Seed do curso no LMS | `backend/src/infrastructure/database/seeds/seedSaasEvolutionCourse.ts` |
| Renderização full-bleed no portal | `frontend/src/utils/courseExperience.ts` (`isSingleArtifactCourse`) |

Ao alterar o conteúdo do curso (`STAGES`, `C`, `GLOSSARY` em `index.html`), este documento fica
defasado — atualize os dois juntos.
