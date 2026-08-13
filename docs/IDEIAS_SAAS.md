# 12 Ideias de SaaS Compatíveis com os 14 Estágios

> Documento derivado de [`EVOLUCAO_SAAS.md`](./EVOLUCAO_SAAS.md).
> Cada ideia foi escolhida para que **a feature de produto entregue em cada estágio gere naturalmente
> a dor que autoriza o componente daquele estágio** — sem forçar, sem antecipar.

---

## Como ler o roadmap

Cada linha da tabela responde a três coisas na ordem em que o curso exige:

| Coluna | Significado |
|--------|-------------|
| **Feature entregue** | O que o produto ganha naquele estágio (valor para o cliente) |
| **Dor gerada** | O sintoma observável que a feature produz alguns dias/semanas depois |
| **Entra** | O componente que a dor autoriza |

A ordem canônica dos componentes é fixa (é o esqueleto do curso):

`01` Web+Monólito+Postgres · `02` Gateway de Pagamentos · `03` Object Storage · `04` Mensageria ·
`05` Fila+Worker · `06` CDN · `07` Cache · `08` Balanceador · `09` WAF+Rate Limit · `10` Réplica ·
`11` Observabilidade · `12` CI/CD · `13` Busca Dedicada · `14` Serviço Extraído+API GW+Tracing

O que varia entre as 12 ideias é **a feature que produz a dor**. É isso que torna cada domínio
adequado ou não. Um SaaS sem busca central nunca justifica o Estágio 13; um sem superfície pública
nunca justifica o 09; um sem relatório pesado nunca justifica o 10.

---

## Critérios usados para selecionar

Uma ideia só entrou na lista se satisfaz os sete pontos de estrangulamento do modelo:

1. **Cobrança recorrente real** (E02) — não é freeware nem projeto interno.
2. **Upload de arquivo pelo usuário** (E03) — anexo, foto, documento.
3. **Trabalho lento e adiável** (E05) — lote, PDF, importação, processamento.
4. **Superfície pública indexável + área logada** (E06/E09) — o que atrai scraping e credential stuffing.
5. **Relatório analítico com fechamento periódico** (E10) — competindo com a operação.
6. **Busca como porta de entrada, não como filtro** (E13) — catálogo, acervo ou histórico grande.
7. **Um domínio com fronteira clara e dono definido** (E14) — candidato honesto à extração.

---

## Quadro comparativo

| # | Ideia | Domínio extraído no E14 | Força do E13 (busca) | Força do E09 (borda) | Risco para sala de aula |
|---|-------|-------------------------|----------------------|----------------------|-------------------------|
| 1 | **AgendaSaúde** — clínicas e consultórios | Faturamento de convênios (TISS) | Alta | Alta | Baixo ⭐ |
| 2 | **EduPlay** — LMS white-label | Certificação e assinatura digital | Média-alta | Média | Médio (vídeo/transcodificação) |
| 3 | **VagaCerta** — ATS / recrutamento | Triagem e matching de currículos | **Máxima** | Alta | Baixo |
| 4 | **JurisFlow** — escritórios de advocacia | Captura de publicações oficiais | Alta | Média | Baixo |
| 5 | **ImobiHub** — CRM + portal imobiliário | Publicação em portais parceiros | **Máxima** | **Máxima** | Baixo ⭐ |
| 6 | **PetCare** — petshop e clínica veterinária | Estoque e emissão fiscal (NF-e) | Média-alta | Média | Baixo |
| 7 | **CondoLive** — gestão de condomínios | Cobrança e conciliação bancária | Média | Média-alta | Baixo |
| 8 | **TicketON** — eventos e ingressos | Repasse ao produtor + antifraude | Alta | **Máxima** | Alto (concorrência de estoque) |
| 9 | **OficinaPro** — oficinas mecânicas | Compras e integração com fornecedores | Alta | Média | Baixo |
| 10 | **HelpDeskBR** — suporte e base de conhecimento | Ingestão multicanal (e-mail/WhatsApp) | **Máxima** | Alta | Baixo ⭐ |
| 11 | **AgroTrack** — gestão de propriedades rurais | Ingestão de telemetria/IoT | Média | Média-baixa | Médio (geo/IoT) |
| 12 | **FreteFácil** — transporte e entregas | Roteirização | Média | **Máxima** | Médio (roteirização) |

⭐ = recomendação para a disciplina (ver seção final).

---

# As 12 ideias

## 1. AgendaSaúde — gestão de clínicas e consultórios

**Público:** clínicas pequenas e médias, consultórios com 1–20 profissionais.
**Cobrança:** assinatura mensal por profissional ativo.
**E01 mínimo:** cadastro de pacientes, agenda por profissional, marcação/cancelamento, login com papéis (recepção, profissional, admin).

**Por que fecha os 14:** anexos clínicos forçam o E03; lembretes forçam o E04/E05; a página pública de
agendamento é superfície de ataque real (E06/E09); o fechamento mensal por convênio é o relatório do
E10; prontuário e histórico dão volume de texto para o E13; faturamento de convênio tem regra,
compliance e ritmo próprios — extração honesta no E14.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Agenda + cadastro de pacientes + prontuário em texto | Nada doeu. 40 clínicas, 1 servidor | Web · Monólito · Postgres |
| 02 | Planos Starter/Pro, cobrança por profissional ativo | Precisa cobrar cartão sem guardar cartão | Gateway de Pagamentos |
| 03 | Anexo de exames e laudos (PDF/JPG) no prontuário | Arquivos no disco local sumiram no deploy | Object Storage |
| 04 | Confirmação de consulta e lembrete de 24 h | SMTP próprio caiu no spam; paciente não recebeu | Mensageria (E-mail/SMS) |
| 05 | Recibo/atestado em PDF + disparo do lote de lembretes da véspera | Provedor de e-mail lento → marcar consulta dá timeout | Fila · Worker |
| 06 | Página pública de agendamento com marca da clínica | Clínicas de outros estados reclamam de lentidão; banda cresce | CDN |
| 07 | Painel do dia (agenda + taxa de ocupação + faltas) | Recepção recarrega a cada 2 min; CPU do banco em 85 % | Cache em Memória |
| 08 | Atendimento em sábado e feriado (SLA de balcão) | Deploy tira 3 min do ar, e agora são diários | Balanceador de Carga |
| 09 | Cadastro e login do paciente na página pública | Bots reservam horários em massa; contas invadidas | WAF · Rate Limiting |
| 10 | Relatório de produtividade e faturamento por convênio | Virada de mês trava o banco por horas | Réplica de Leitura |
| 11 | — (nenhuma feature; a dor é operacional) | 40 min fora do ar descobertos por WhatsApp de cliente | Observabilidade |
| 12 | — (6 times mexendo no mesmo código) | Deploy manual na sexta quebrou a cobrança | CI/CD e Testes |
| 13 | Busca global: paciente, CID, medicamento, evolução | Busca com `LIKE` varre tudo e não tolera erro de digitação | Busca Dedicada |
| 14 | Faturamento TISS com regras por operadora | Time e compliance próprios presos na mesma fila de deploy | Serviço Extraído · API Gateway · Tracing |

---

## 2. EduPlay — plataforma de cursos online white-label

**Público:** escolas, cursos livres e produtores de conteúdo que querem plataforma própria.
**Cobrança:** assinatura da escola + venda de curso avulso ao aluno.
**E01 mínimo:** cursos, módulos, aulas em texto, matrícula, marcação de progresso.

**Por que fecha os 14:** vídeo é o caso mais didático de E03+E05+E06 na mesma trilha; catálogo público
atrai raspagem (E09); certificado tem valor legal e time próprio (E14). É a ideia com o **melhor
Estágio 06** da lista — a conta de banda aparece sozinha.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Cursos, módulos, aulas em texto, matrícula, progresso | Nada doeu | Web · Monólito · Postgres |
| 02 | Venda de curso avulso e assinatura da escola | Precisa cobrar e emitir recorrência | Gateway de Pagamentos |
| 03 | Upload de vídeo-aula e material de apoio | Vídeo no disco do container morre no deploy | Object Storage |
| 04 | E-mail de matrícula, boas-vindas e recuperação de senha | E-mail próprio na caixa de spam do aluno | Mensageria |
| 05 | Transcodificação de vídeo e emissão de certificado em PDF | Upload de 1 GB bloqueia a requisição; turma inteira trava | Fila · Worker |
| 06 | Player de vídeo e biblioteca de materiais | Alunos de todo o país; banda vira o 2º item da fatura | CDN |
| 07 | Dashboard do aluno com progresso agregado e ranking | Mesma agregação recalculada a cada carregamento | Cache em Memória |
| 08 | Aula ao vivo com pico na abertura da turma | Deploy no meio da aula derruba a sala | Balanceador de Carga |
| 09 | Catálogo público com SEO + login do aluno | Concorrente clona o catálogo; contas compartilhadas por stuffing | WAF · Rate Limiting |
| 10 | Relatório de engajamento por turma para a escola | Export CSV mensal deixa o player lento para todos | Réplica de Leitura |
| 11 | — | Player fora do ar por 40 min sem ninguém saber | Observabilidade |
| 12 | — (times de player, autoria e cobrança) | Deploy quebrou emissão de certificado na véspera da formatura | CI/CD e Testes |
| 13 | Busca no catálogo **e dentro da transcrição das aulas** | Busca vira porta de entrada e é o endpoint mais lento | Busca Dedicada |
| 14 | Certificação com assinatura digital e validade legal | Regra, auditoria e ritmo próprios travados na fila comum | Serviço Extraído · API Gateway · Tracing |

---

## 3. VagaCerta — ATS (gestão de recrutamento e seleção)

**Público:** empresas de 50 a 5.000 funcionários e consultorias de RH.
**Cobrança:** assinatura por vaga aberta simultânea.
**E01 mínimo:** vagas, candidatos, pipeline kanban de etapas, anotações do recrutador.

**Por que fecha os 14:** é a ideia com o **Estágio 13 mais natural de todas** — buscar dentro de
100 mil currículos é literalmente o produto, e nenhum `LIKE` resolve. A página de carreiras pública dá
o E06 e o E09 de graça.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Vagas, candidatos, pipeline de etapas | Nada doeu | Web · Monólito · Postgres |
| 02 | Plano por vaga aberta simultânea | Cobrança recorrente com upgrade/downgrade | Gateway de Pagamentos |
| 03 | Upload de currículo em PDF/DOCX | Currículos somem no deploy; RH perde candidatura | Object Storage |
| 04 | E-mail de inscrição, convite e devolutiva | E-mail de empresa entregue como spam prejudica a marca | Mensageria |
| 05 | Extração de texto do currículo + devolutiva em massa | Parsing dentro da requisição faz a candidatura dar timeout | Fila · Worker |
| 06 | Página de carreiras com marca do cliente | Candidatos de todo o país; assets pesados de cada cliente | CDN |
| 07 | Funil da vaga (contagem por etapa, tempo médio) | Recrutador recarrega o funil o dia inteiro | Cache em Memória |
| 08 | Publicação de vaga de alto volume (pico programado) | Deploy diário e servidor único derrubam a inscrição | Balanceador de Carga |
| 09 | Candidatura sem login na página pública | Concorrente raspa vagas e salários; bots inflam candidaturas | WAF · Rate Limiting |
| 10 | Relatório de tempo de contratação e diversidade | Consulta analítica no fechamento trava o produto | Réplica de Leitura |
| 11 | — | Página de carreiras fora do ar; cliente perdeu candidatos | Observabilidade |
| 12 | — | Deploy quebrou o parser e ninguém sabia o que subiu | CI/CD e Testes |
| 13 | **Busca no banco de currículos** (sinônimo, erro, faceta) | Buscar "desenvolvedor pyton" não retorna nada e varre a tabela | Busca Dedicada |
| 14 | Triagem/matching automático de candidatos | Carga de CPU e ciclo de modelo diferentes do resto | Serviço Extraído · API Gateway · Tracing |

---

## 4. JurisFlow — gestão de escritórios de advocacia

**Público:** escritórios de 2 a 100 advogados.
**Cobrança:** assinatura por advogado ativo.
**E01 mínimo:** clientes, processos, andamentos, agenda de prazos.

**Por que fecha os 14:** prazo processual é fatal — indisponibilidade vira dano jurídico, o que dá o
argumento mais forte da lista para o E08 e o E11. O robô de captura de publicações é um domínio de
extração excelente: escala, ritmo e modo de falha completamente diferentes do CRUD.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Clientes, processos, andamentos, prazos | Nada doeu | Web · Monólito · Postgres |
| 02 | Plano por advogado ativo | Cobrança recorrente com nota fiscal | Gateway de Pagamentos |
| 03 | Anexo de petições, procurações e provas | Documento do processo sumiu no deploy — risco real | Object Storage |
| 04 | Alerta de prazo por e-mail e SMS | Alerta caiu no spam e o prazo quase venceu | Mensageria |
| 05 | Captura de publicações do diário oficial + alerta em lote | Captura noturna dentro da requisição estoura timeout | Fila · Worker |
| 06 | Portal do cliente com a marca do escritório | Escritórios em várias UFs; assets do portal pesam | CDN |
| 07 | Painel de prazos do dia e da semana | Consultado a cada 5 min por todo o escritório | Cache em Memória |
| 08 | Compromisso de disponibilidade em dia de prazo | 3 min fora do ar em dia de protocolo é inaceitável | Balanceador de Carga |
| 09 | Portal do cliente aberto na internet | Dados sigilosos + credential stuffing em conta de cliente | WAF · Rate Limiting |
| 10 | Relatório de honorários, horas e produtividade | Fechamento mensal trava a consulta de prazos | Réplica de Leitura |
| 11 | — | Robô de captura falhou em silêncio por dois dias | Observabilidade |
| 12 | — | Deploy quebrou a captura na véspera de um prazo | CI/CD e Testes |
| 13 | Busca em petições, andamentos e jurisprudência anexada | Buscar tese jurídica com `LIKE` não encontra nada útil | Busca Dedicada |
| 14 | Captura de publicações como serviço próprio | Crawler tem escala e falhas próprias; time dedicado | Serviço Extraído · API Gateway · Tracing |

---

## 5. ImobiHub — CRM imobiliário com portal público

**Público:** imobiliárias e corretores autônomos.
**Cobrança:** assinatura por número de imóveis anunciados.
**E01 mínimo:** imóveis, proprietários, corretores, leads.

**Por que fecha os 14:** é a ideia cujos estágios **06, 09 e 13 são exemplos de livro-texto** — portal
com dezenas de fotos por imóvel, concorrente raspando o catálogo inteiro e busca por facetas
(bairro, faixa de preço, quartos) com tolerância a erro.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Imóveis, proprietários, corretores, leads | Nada doeu | Web · Monólito · Postgres |
| 02 | Plano por imóvel ativo no portal | Precisa cobrar por uso sem guardar cartão | Gateway de Pagamentos |
| 03 | Upload de fotos e plantas do imóvel | 30 fotos por imóvel no disco; deploy apagou o acervo | Object Storage |
| 04 | Novo lead notifica o corretor; alerta de imóvel ao cliente | Lead notificado com atraso ou no spam = venda perdida | Mensageria |
| 05 | Redimensionamento + marca d'água das fotos e envio ao XML dos portais | Publicar imóvel demora 40 s processando imagem na requisição | Fila · Worker |
| 06 | Portal público de anúncios com galeria | Visitantes nacionais; banda de imagem é o maior item da fatura | CDN |
| 07 | Home do portal com destaques e contadores | Mesma consulta de destaques a cada visita anônima | Cache em Memória |
| 08 | Campanha de mídia paga gerando pico de tráfego | Servidor único cai no pico; deploy derruba o portal | Balanceador de Carga |
| 09 | Catálogo público completo e área do cliente | **Concorrente raspa o catálogo inteiro**; contas invadidas | WAF · Rate Limiting |
| 10 | Relatório de performance por corretor e por imóvel | Consulta analítica trava o portal em horário nobre | Réplica de Leitura |
| 11 | — | Portal fora do ar em dia de campanha, descoberto pelo cliente | Observabilidade |
| 12 | — | Deploy quebrou a publicação nos portais parceiros | CI/CD e Testes |
| 13 | **Busca com facetas** (bairro, preço, quartos, característica) | Filtro em SQL não tolera erro nem ordena por relevância | Busca Dedicada |
| 14 | Publicação em portais parceiros como serviço | Integrações externas com ritmo e falha próprios | Serviço Extraído · API Gateway · Tracing |

---

## 6. PetCare — gestão de petshops e clínicas veterinárias

**Público:** petshops, banho e tosa, clínicas veterinárias e pequenas redes.
**Cobrança:** assinatura por loja + módulos.
**E01 mínimo:** tutores, pets, agenda de serviços, comanda de venda.

**Por que fecha os 14:** combina agenda, PDV e prontuário — o que dá dores variadas em estágios
diferentes. A emissão fiscal (NF-e/NFS-e) é um domínio de extração perfeito: regra externa,
homologação, time próprio.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Tutores, pets, agenda de banho/consulta, comanda | Nada doeu | Web · Monólito · Postgres |
| 02 | Plano da loja + venda de pacote de banhos pré-pago | Cobrar assinatura e pacote sem tocar em cartão | Gateway de Pagamentos |
| 03 | Carteira de vacinação, foto do pet, exames | Foto do "antes e depois" some no deploy | Object Storage |
| 04 | Lembrete de vacina e de retorno do banho | Lembrete manual por WhatsApp não escala; e-mail no spam | Mensageria |
| 05 | Campanha de lembrete de vacina para toda a base | Disparo para 3.000 tutores estoura a requisição | Fila · Worker |
| 06 | Vitrine online de produtos e serviços da loja | Rede com franquias em várias cidades; fotos de produto pesam | CDN |
| 07 | Painel do balcão (agenda do dia + fila de espera) | Telão do balcão recarrega a cada 30 s; banco no limite | Cache em Memória |
| 08 | Sábado como dia de pico (dobro do movimento) | Deploy derruba o PDV no meio do sábado | Balanceador de Carga |
| 09 | Vitrine pública com preços + login do tutor | Concorrente monitora preços por scraping; contas invadidas | WAF · Rate Limiting |
| 10 | Relatório de faturamento por serviço e curva ABC | Fechamento mensal trava o PDV das lojas | Réplica de Leitura |
| 11 | — | PDV fora do ar em sábado, descoberto por telefone | Observabilidade |
| 12 | — | Deploy quebrou o pagamento de pacote pré-pago | CI/CD e Testes |
| 13 | Busca de produto no PDV (código, marca, sinônimo) | "racao golden" sem acento não encontra nada no caixa | Busca Dedicada |
| 14 | Estoque e emissão fiscal (NF-e / NFS-e) | Regra fiscal, homologação e time próprios | Serviço Extraído · API Gateway · Tracing |

---

## 7. CondoLive — gestão de condomínios

**Público:** administradoras de condomínio e síndicos profissionais.
**Cobrança:** assinatura por unidade sob gestão.
**E01 mínimo:** condomínios, unidades, moradores, ocorrências, mural de avisos.

**Por que fecha os 14:** tem o **pico de carga mais previsível da lista** (dia 1 do mês: geração de
todos os boletos), o que torna o Estágio 05 e o 08 tangíveis. Conciliação bancária (CNAB) é um
domínio financeiro de fronteira clara para o E14.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Condomínios, unidades, moradores, ocorrências, mural | Nada doeu | Web · Monólito · Postgres |
| 02 | Taxa condominial por boleto/Pix + plano da administradora | Ninguém quer processar pagamento na mão | Gateway de Pagamentos |
| 03 | Atas, balancetes e fotos de ocorrência | Documento da assembleia sumiu no deploy | Object Storage |
| 04 | Comunicado geral, aviso de encomenda, boleto por e-mail | Aviso impresso no elevador não chega a quem viaja | Mensageria |
| 05 | Geração e envio de **todos os boletos no dia 1** | 500 boletos por condomínio na requisição = timeout garantido | Fila · Worker |
| 06 | Portal do morador com documentos e fotos | Administradora com prédios em várias cidades | CDN |
| 07 | Painel do síndico (inadimplência, reservas, ocorrências) | Síndico e portaria consultam o dia inteiro | Cache em Memória |
| 08 | Reserva de área comum em tempo real | Dia 1 e dia 10 são picos; deploy derruba a emissão | Balanceador de Carga |
| 09 | Login do morador aberto na internet | Dado pessoal de milhares de moradores; stuffing no login | WAF · Rate Limiting |
| 10 | Prestação de contas e balancete mensal | Fechamento contábil trava o portal na semana mais movimentada | Réplica de Leitura |
| 11 | — | Boletos não saíram no dia 1 e ninguém percebeu | Observabilidade |
| 12 | — | Deploy quebrou o cálculo de rateio da taxa | CI/CD e Testes |
| 13 | Busca em atas, comunicados, regimento e ocorrências | "onde foi decidido isso?" não se resolve com filtro | Busca Dedicada |
| 14 | Cobrança e conciliação bancária (CNAB, retorno, baixa) | Integração bancária com compliance e time próprios | Serviço Extraído · API Gateway · Tracing |

---

## 8. TicketON — plataforma de eventos e ingressos

**Público:** produtores de evento, casas de show, congressos.
**Cobrança:** taxa por ingresso vendido + plano do produtor.
**E01 mínimo:** eventos, lotes de ingresso, pedido, check-in por QR.

**Por que fecha os 14:** tem o **Estágio 09 mais dramático da lista** (bots de cambista) e um gancho
pedagógico raro no E07: o contador de ingressos disponíveis *pode* ser cacheado, mas a decisão de
vender **não** — exercita a invariante I5 e o "deixado de fora" do Estágio 07.
⚠️ Exige cuidado com concorrência de estoque; escolha só se a turma aguentar essa discussão em paralelo.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Eventos, lotes, pedidos, check-in por QR | Nada doeu | Web · Monólito · Postgres |
| 02 | Venda de ingresso com taxa de conveniência | Cartão, Pix e antifraude fora do escopo do time | Gateway de Pagamentos |
| 03 | Banner do evento, mapa de assentos, PDF do ingresso | Ingresso gerado some no deploy; comprador sem entrada | Object Storage |
| 04 | Envio do ingresso por e-mail + lembrete por SMS | Ingresso no spam = pessoa na porta sem entrar | Mensageria |
| 05 | Geração de QR + PDF de compras em lote (corporativo) | 200 ingressos numa compra travam o checkout | Fila · Worker |
| 06 | Página do evento com banner e mapa de assentos | Público nacional; assets pesados na divulgação | CDN |
| 07 | Contador "restam N ingressos" no lote | Milhares recarregam a página na abertura de vendas | Cache em Memória |
| 08 | Abertura de venda de show grande (pico programado) | Servidor único não sobrevive ao minuto zero | Balanceador de Carga |
| 09 | Página de venda pública sem login | **Bots de cambista** varrem lotes; scraping de preço; stuffing | WAF · Rate Limiting |
| 10 | Relatório de vendas para o produtor + fechamento | Produtor consulta relatório durante a venda e trava tudo | Réplica de Leitura |
| 11 | — | Checkout com erro por 40 min na abertura = receita perdida | Observabilidade |
| 12 | — | Deploy quebrou o check-in na portaria do evento | CI/CD e Testes |
| 13 | Busca de eventos por artista, cidade, categoria | Busca vira a home do produto e o endpoint mais lento | Busca Dedicada |
| 14 | Repasse ao produtor + antifraude | Conformidade financeira e ciclo próprios | Serviço Extraído · API Gateway · Tracing |

---

## 9. OficinaPro — gestão de oficinas mecânicas

**Público:** oficinas independentes, centros automotivos e pequenas redes.
**Cobrança:** assinatura por oficina, faixas por número de OS/mês.
**E01 mínimo:** clientes, veículos, ordem de serviço, orçamento.

**Por que fecha os 14:** o catálogo de peças (centenas de milhares de itens, com código, aplicação e
sinônimo) é uma justificativa impecável para o E13, e a importação da tabela do fornecedor é um dos
melhores exemplos de trabalho lento para o E05.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Clientes, veículos, ordem de serviço, orçamento | Nada doeu | Web · Monólito · Postgres |
| 02 | Assinatura por oficina com faixas de uso | Cobrança recorrente e upgrade automático | Gateway de Pagamentos |
| 03 | Fotos do veículo antes/depois e laudo técnico | Foto que comprova o estado do carro some no deploy | Object Storage |
| 04 | Link de aprovação do orçamento + "veículo pronto" | Telefonema não escala; e-mail próprio não chega | Mensageria |
| 05 | Importação da tabela de peças do fornecedor (80 mil linhas) | Import na requisição dá timeout e trava a oficina | Fila · Worker |
| 06 | Portal de aprovação de orçamento com fotos | Rede com oficinas em várias cidades; fotos pesam | CDN |
| 07 | Painel do pátio por status (telão da oficina) | Telão recarrega a cada 30 s o dia inteiro | Cache em Memória |
| 08 | Oficina depende do sistema para liberar o carro | Deploy trava a liberação de veículo no fim do dia | Balanceador de Carga |
| 09 | Consulta pública de OS pela placa | Consulta por placa é enumerada por bots; stuffing no login | WAF · Rate Limiting |
| 10 | Relatório de margem por serviço e produtividade | Fechamento mensal trava o pátio | Réplica de Leitura |
| 11 | — | Aprovação de orçamento fora do ar por 40 min | Observabilidade |
| 12 | — | Deploy quebrou o cálculo de mão de obra na OS | CI/CD e Testes |
| 13 | **Busca no catálogo de peças** (código, aplicação, sinônimo) | "pastilha freio gol g5" não encontra o item certo | Busca Dedicada |
| 14 | Compras e integração com fornecedores | Integrações com ritmo, falha e time próprios | Serviço Extraído · API Gateway · Tracing |

---

## 10. HelpDeskBR — atendimento e base de conhecimento

**Público:** empresas de software, provedores e operações de suporte B2B.
**Cobrança:** assinatura por agente.
**E01 mínimo:** tickets, filas, agentes, status e SLA básico.

**Por que fecha os 14:** o produto **é** busca — "já resolvemos isso antes?" é a pergunta central.
A ingestão de e-mail (e depois WhatsApp) é um domínio de extração excelente: entrada de terceiro,
volume imprevisível, falha isolada. Estágios 05, 13 e 14 encaixam sem esforço.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Tickets, filas, agentes, status, SLA | Nada doeu | Web · Monólito · Postgres |
| 02 | Assinatura por agente | Cobrança com agente ativo variando no mês | Gateway de Pagamentos |
| 03 | Anexos e capturas de tela no ticket | Print que provava o bug some no deploy | Object Storage |
| 04 | Notificação de resposta + **abertura de ticket por e-mail** | E-mail do produto cai no spam do cliente | Mensageria |
| 05 | Regras de automação + pesquisa de satisfação pós-fechamento | Processar e-mail recebido na requisição gera timeout no webhook | Fila · Worker |
| 06 | Central de ajuda pública com artigos, imagens e GIFs | Clientes em vários fusos; assets da central pesam | CDN |
| 07 | Telão de SLA e fila por time | Time inteiro com o painel aberto o expediente todo | Cache em Memória |
| 08 | SLA contratual de disponibilidade | Deploy derruba o suporte no pico da manhã | Balanceador de Carga |
| 09 | Formulário público de abertura + central indexada | Spam automatizado abre tickets; base raspada; stuffing | WAF · Rate Limiting |
| 10 | Relatório mensal de SLA e CSAT por cliente | Relatório do fechamento trava a fila de atendimento | Réplica de Leitura |
| 11 | — | E-mails deixaram de virar ticket por 40 min sem alerta | Observabilidade |
| 12 | — | Deploy quebrou a automação de escalonamento de SLA | CI/CD e Testes |
| 13 | **Busca na base + em tickets históricos** | "já resolvemos isso?" não se responde com `LIKE` | Busca Dedicada |
| 14 | Ingestão multicanal (e-mail, WhatsApp, chat) | Volume imprevisível e falha de terceiro precisam isolar-se | Serviço Extraído · API Gateway · Tracing |

---

## 11. AgroTrack — gestão de propriedades rurais

**Público:** produtores rurais médios, cooperativas e consultorias agronômicas (forte no ES: café, fruticultura).
**Cobrança:** assinatura por hectare ou por propriedade.
**E01 mínimo:** propriedades, talhões, safras, apontamento de atividade de campo.

**Por que fecha os 14:** custo por talhão é um relatório analítico honesto para o E10, e a ingestão de
telemetria (estação meteorológica, sensor de solo) é um domínio de extração com volume e ritmo
radicalmente diferentes do CRUD.
⚠️ O Estágio 09 é o mais fraco desta ideia — precisa da API pública de dados/cotação para se sustentar.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Propriedades, talhões, safras, apontamento de campo | Nada doeu | Web · Monólito · Postgres |
| 02 | Assinatura por hectare gerenciado | Cobrança recorrente com faixa por área | Gateway de Pagamentos |
| 03 | Foto de campo, laudo de solo, nota de insumo | Foto do talhão some no deploy; perde o histórico da safra | Object Storage |
| 04 | Alerta de janela de aplicação e aviso climático | Aviso por telefone não escala; e-mail próprio não chega | Mensageria |
| 05 | Cálculo de custo por talhão + importação da estação meteorológica | Recalcular a safra inteira na requisição estoura o timeout | Fila · Worker |
| 06 | App de campo que baixa mapas e assets | Produtores em áreas remotas com conexão ruim | CDN |
| 07 | Painel da safra (custo acumulado, produtividade prevista) | Consultor abre o painel de cada cliente dezenas de vezes | Cache em Memória |
| 08 | Apontamento em tempo real durante a colheita | Deploy no período de colheita interrompe o campo | Balanceador de Carga |
| 09 | API pública de indicadores e cotação regional | API raspada em massa; conta de produtor invadida | WAF · Rate Limiting |
| 10 | Relatório de rentabilidade por safra e export contábil | Fechamento da safra trava o apontamento de campo | Réplica de Leitura |
| 11 | — | Importação da estação parou há 3 dias sem ninguém notar | Observabilidade |
| 12 | — | Deploy quebrou o cálculo de custo no meio da safra | CI/CD e Testes |
| 13 | Busca de insumo/defensivo por princípio ativo e marca | Nome comercial, sinônimo e erro de digitação não batem | Busca Dedicada |
| 14 | Ingestão de telemetria e IoT | Volume por segundo e ritmo próprios; time de dados dedicado | Serviço Extraído · API Gateway · Tracing |

---

## 12. FreteFácil — gestão de transporte e entregas

**Público:** transportadoras regionais, operadores logísticos e e-commerces com frota.
**Cobrança:** assinatura por entrega processada.
**E01 mínimo:** clientes, coletas, entregas, motoristas, atualização de status.

**Por que fecha os 14:** a página pública de rastreio é o **melhor exemplo simultâneo de E06, E07 e E09**
de toda a lista — conteúdo público, releitura obsessiva pelo destinatário e enumeração de códigos por
bots. Roteirização é um serviço extraído com justificativa técnica clara (CPU-bound).
⚠️ Roteirização pode virar um projeto por si só; trate como caixa-preta simples até o E14.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Clientes, coletas, entregas, motoristas, status | Nada doeu | Web · Monólito · Postgres |
| 02 | Cobrança por entrega processada | Faturamento por uso, recorrente | Gateway de Pagamentos |
| 03 | Comprovante de entrega (foto do canhoto assinado) | POD perdido no deploy = entrega não comprovada | Object Storage |
| 04 | "Saiu para entrega" e "entregue" por e-mail/SMS | Destinatário liga para o SAC porque não foi avisado | Mensageria |
| 05 | Romaneio em PDF + notificação de status de mil entregas | Disparo em lote na requisição derruba o fechamento do dia | Fila · Worker |
| 06 | **Página pública de rastreio** com mapa e assets | Destinatários em todo o país; rastreio é a página mais acessada | CDN |
| 07 | Rastreio consultado repetidamente pelo mesmo destinatário | O mesmo código consultado 8× por dia; banco no limite | Cache em Memória |
| 08 | Fechamento diário da operação em horário fixo | Deploy derruba o rastreio e enche o SAC | Balanceador de Carga |
| 09 | Rastreio público por código + login do embarcador | **Enumeração de códigos** e scraping do concorrente; stuffing | WAF · Rate Limiting |
| 10 | Relatório de SLA por transportadora e fatura mensal | Fechamento de fatura trava a operação de campo | Réplica de Leitura |
| 11 | — | Rastreio fora do ar por 40 min descoberto pelo cliente | Observabilidade |
| 12 | — | Deploy quebrou o cálculo de frete na emissão | CI/CD e Testes |
| 13 | Busca por destinatário, NF, endereço ou CPF | Endereço com erro de digitação não encontra a entrega | Busca Dedicada |
| 14 | Roteirização como serviço próprio | CPU-bound, escala e ritmo diferentes; time dedicado | Serviço Extraído · API Gateway · Tracing |

---

# Lote 2 — mais 12 opções

Mesmos sete critérios de seleção. Nenhuma repete o domínio das doze anteriores.

## Quadro comparativo — lote 2

| # | Ideia | Domínio extraído no E14 | Força do E13 (busca) | Força do E09 (borda) | Risco para sala de aula |
|---|-------|-------------------------|----------------------|----------------------|-------------------------|
| 13 | **MesaPronta** — restaurantes e delivery | Integrações com marketplaces (iFood/Rappi) | Média-alta | Alta | Baixo |
| 14 | **ServiçoJá** — marketplace de serviços locais | Repasse e escrow | **Máxima** | Alta | Médio (split de pagamento) |
| 15 | **HospedaFácil** — motor de reservas para pousadas | Channel manager (OTAs) | Alta | **Máxima** | Médio (overbooking) |
| 16 | **EscolaViva** — gestão escolar da educação básica | Financeiro de mensalidades | Média | Média-alta | Baixo ⭐ |
| 17 | **LabResult** — laboratórios de análises clínicas | Interfaceamento de equipamentos (HL7/ASTM) | Alta | **Máxima** | Baixo |
| 18 | **AssinaJá** — assinatura eletrônica de documentos | Carimbo do tempo e ICP-Brasil | Alta | Alta | Baixo ⭐ |
| 19 | **ObraViva** — gestão de obras e diário de obra | Orçamento e composição de custo (SINAPI) | Média-alta | Média | Baixo |
| 20 | **LojaPronta** — e-commerce hospedado multi-tenant | Cálculo de frete e logística | **Máxima** | **Máxima** | Alto (escopo enorme) |
| 21 | **VozAberta** — áudio e newsletter paga | Motor de envio de e-mail em massa | Alta | Média | Médio (transcodificação) |
| 22 | **ContaFácil** — escritórios de contabilidade | Processamento fiscal / SPED | Alta | Média | Médio (regra fiscal) |
| 23 | **FormFlow** — formulários e pesquisas | Motor de webhooks e integrações | Alta | **Máxima** | Baixo ⭐ |
| 24 | **GymPro** — academias e estúdios | Cobrança recorrente e régua de inadimplência | Média | Média | Baixo |

---

## 13. MesaPronta — gestão de restaurantes e delivery

**Público:** restaurantes, bares e redes de food service.
**Cobrança:** assinatura do restaurante + taxa sobre pedido online.
**E01 mínimo:** cardápio, mesas, comanda, pedido, fechamento de conta.

**Por que fecha os 14:** o cardápio digital por QR code é conteúdo público e pesado (E06) que todo
cliente sentado à mesa carrega ao mesmo tempo (E07). Sexta-feira 20 h é o pico que justifica o E08
sem retórica. As integrações com marketplaces são o serviço extraído perfeito: contrato de terceiro,
ritmo próprio e falha isolada.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Cardápio, mesas, comanda, pedido, fechamento | Nada doeu | Web · Monólito · Postgres |
| 02 | Assinatura do restaurante + pagamento online do pedido | Cobrar sem processar cartão na mão | Gateway de Pagamentos |
| 03 | Fotos dos pratos, logo e cardápio em PDF | Fotos do cardápio somem no deploy de terça | Object Storage |
| 04 | "Pedido confirmado" e "saiu para entrega" ao cliente | Ligar para cada cliente não escala; e-mail no spam | Mensageria |
| 05 | Impressão na cozinha + envio do pedido às integrações | Pedido demora 9 s aguardando a impressora e o garçom perde a mesa | Fila · Worker |
| 06 | Cardápio digital público por QR code na mesa | Rede em várias cidades; fotos de prato dominam a banda | CDN |
| 07 | Cardápio e disponibilidade abertos por todos à mesa | 40 pessoas carregam o mesmo cardápio no mesmo minuto | Cache em Memória |
| 08 | Operação de sexta e sábado à noite | Deploy no meio do jantar derruba o salão inteiro | Balanceador de Carga |
| 09 | Cardápio e preços públicos + login do cliente | Agregador raspa preços; bots fazem pedido falso; stuffing | WAF · Rate Limiting |
| 10 | Relatório de faturamento por prato e fechamento de caixa | Fechamento mensal trava a comanda no horário de pico | Réplica de Leitura |
| 11 | — | Pedidos pararam de chegar na cozinha por 40 min numa sexta | Observabilidade |
| 12 | — | Deploy quebrou o cálculo de taxa de serviço na conta | CI/CD e Testes |
| 13 | Busca no cardápio e no histórico de pedidos | "coca zero" e "x tudo" não encontram nada com `LIKE` | Busca Dedicada |
| 14 | Integrações com iFood, Rappi e afins | Contrato, ritmo e falha de terceiro presos na fila comum | Serviço Extraído · API Gateway · Tracing |

---

## 14. ServiçoJá — marketplace de serviços locais

**Público:** prestadores autônomos (eletricista, diarista, professor particular) e quem contrata.
**Cobrança:** comissão sobre o serviço fechado + plano de destaque do prestador.
**E01 mínimo:** prestadores, categorias de serviço, pedidos de orçamento, propostas.

**Por que fecha os 14:** buscar "eletricista perto de mim, bem avaliado, disponível amanhã" **é** o
produto — o Estágio 13 é inescapável. O escrow (segurar o dinheiro até a conclusão do serviço) é um
domínio financeiro com fronteira nítida e compliance próprio para o Estágio 14.
⚠️ Split de pagamento adiciona complexidade contábil; deixe como assunto do E02 e não antes.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Prestadores, categorias, pedidos de orçamento, propostas | Nada doeu | Web · Monólito · Postgres |
| 02 | Comissão sobre o serviço + plano de destaque | Cobrar de dois lados sem tocar em cartão | Gateway de Pagamentos |
| 03 | Portfólio de fotos e documento do prestador | Portfólio do prestador some no deploy; ele abandona a plataforma | Object Storage |
| 04 | Aviso de novo pedido ao prestador e de proposta ao cliente | Prestador avisado 2 h depois perde o serviço | Mensageria |
| 05 | Distribuição do pedido para N prestadores + verificação de documento | Distribuir para 30 prestadores na requisição dá timeout | Fila · Worker |
| 06 | Perfis públicos com portfólio e avaliações | Cobertura nacional; fotos de portfólio dominam a banda | CDN |
| 07 | Home com destaques e reputação agregada por categoria/cidade | Mesma agregação de nota e ranking a cada visita anônima | Cache em Memória |
| 08 | Campanha de mídia com pico programado | Servidor único cai na campanha; deploy derruba a busca | Balanceador de Carga |
| 09 | Perfis públicos com telefone e e-mail | Catálogo de contatos raspado em massa; avaliação falsa por bot | WAF · Rate Limiting |
| 10 | Relatório de conversão por categoria e repasse mensal | Fechamento do repasse trava a busca em horário nobre | Réplica de Leitura |
| 11 | — | Pedidos não chegavam a nenhum prestador há 40 min | Observabilidade |
| 12 | — | Deploy quebrou o cálculo de comissão | CI/CD e Testes |
| 13 | **Busca por serviço + região + avaliação + disponibilidade** | Filtro em SQL não ordena por relevância nem tolera erro | Busca Dedicada |
| 14 | Repasse e escrow (retenção, liberação, disputa) | Compliance financeiro e ciclo próprios | Serviço Extraído · API Gateway · Tracing |

---

## 15. HospedaFácil — motor de reservas para pousadas e hotéis

**Público:** pousadas, hotéis pequenos e médios, hostels.
**Cobrança:** assinatura por quarto + taxa sobre reserva direta.
**E01 mínimo:** quartos, tarifas por período, reservas, hóspedes, check-in/out.

**Por que fecha os 14:** *rate shopping* — concorrentes raspando tarifas — é uma prática real e diária
no setor, o que torna o Estágio 09 concreto. O channel manager (sincronizar disponibilidade com
Booking e Airbnb) é o serviço extraído mais defensável: integrações de terceiro, ritmo próprio e
consequência grave em caso de falha (overbooking).

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Quartos, tarifas, reservas, hóspedes, check-in | Nada doeu | Web · Monólito · Postgres |
| 02 | Sinal/pré-pagamento da reserva + plano da pousada | Guardar cartão de hóspede é risco que ninguém quer | Gateway de Pagamentos |
| 03 | Fotos dos quartos, documento do hóspede, comprovantes | Galeria da pousada apagada no deploy | Object Storage |
| 04 | Confirmação de reserva, voucher e lembrete de check-in | Voucher no spam; hóspede chega sem comprovante | Mensageria |
| 05 | Sincronização de disponibilidade com OTAs + voucher em PDF | Confirmar reserva espera 4 APIs externas e dá timeout | Fila · Worker |
| 06 | Site de reserva direta com galeria de fotos | Hóspedes de outros países e estados; galeria pesa | CDN |
| 07 | Consulta de disponibilidade e tarifa por período | Cada visitante repete a mesma consulta de calendário | Cache em Memória |
| 08 | Alta temporada com pico de reservas | Reserva direta fora do ar em dezembro é receita perdida | Balanceador de Carga |
| 09 | Tarifas e disponibilidade públicas | **Rate shopping**: concorrentes raspam tarifas diariamente; stuffing | WAF · Rate Limiting |
| 10 | Relatório de ocupação, diária média e RevPAR | Fechamento mensal trava a busca de disponibilidade | Réplica de Leitura |
| 11 | — | Sincronização parou e gerou overbooking descoberto no balcão | Observabilidade |
| 12 | — | Deploy quebrou o cálculo de tarifa por temporada | CI/CD e Testes |
| 13 | Busca por destino, data e facetas (pet, piscina, café) | Filtro em SQL não ranqueia nem tolera erro no destino | Busca Dedicada |
| 14 | Channel manager (Booking, Airbnb, Expedia) | Integrações com contrato, ritmo e falha próprios | Serviço Extraído · API Gateway · Tracing |

---

## 16. EscolaViva — gestão escolar da educação básica

> 📐 **Estágio 01 detalhado:** [`ESCOLAVIVA_ESTAGIO_01.md`](./ESCOLAVIVA_ESTAGIO_01.md) — módulos por
> domínio, modelo de dados e as 22 invariantes mapeadas para onde entram no código.

**Público:** escolas privadas de educação infantil, fundamental e médio.
**Cobrança:** assinatura por aluno matriculado.
**E01 mínimo:** alunos, turmas, professores, notas, frequência.

**Por que fecha os 14:** o fechamento de bimestre (gerar 1.200 boletins em PDF e comunicar todos os
responsáveis) é um dos exemplos mais limpos de Estágio 05 da lista inteira. Domínio que a turma
conhece por dentro — todo aluno já foi aluno.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Alunos, turmas, professores, notas, frequência | Nada doeu | Web · Monólito · Postgres |
| 02 | Mensalidade recorrente e taxa de matrícula | Escola não quer processar boleto e cartão sozinha | Gateway de Pagamentos |
| 03 | Documentos de matrícula, atestados, trabalhos entregues | Histórico escolar digitalizado some no deploy | Object Storage |
| 04 | Comunicado ao responsável, aviso de falta, boletim | Bilhete na agenda não chega; e-mail próprio cai no spam | Mensageria |
| 05 | Fechamento de bimestre: 1.200 boletins em PDF + comunicado geral | Fechar o bimestre trava a secretaria por horas | Fila · Worker |
| 06 | Portal do responsável com circulares, fotos e materiais | Rede com várias unidades; materiais pesados | CDN |
| 07 | Painel do responsável (notas, faltas, financeiro) | Toda a comunidade escolar consulta na semana da nota | Cache em Memória |
| 08 | Período de rematrícula com pico concentrado | Deploy no dia da rematrícula derruba o processo | Balanceador de Carga |
| 09 | Portal do responsável aberto na internet | Dado de menor de idade; credential stuffing no login | WAF · Rate Limiting |
| 10 | Censo escolar, relatório de rendimento e inadimplência | Relatório mensal deixa a consulta de nota lenta para todos | Réplica de Leitura |
| 11 | — | Comunicado de suspensão de aula não saiu e ninguém soube | Observabilidade |
| 12 | — | Deploy quebrou o cálculo da média do bimestre | CI/CD e Testes |
| 13 | Busca em histórico escolar, ocorrências e documentos | Localizar "quando o aluno mudou de turma" varre tudo | Busca Dedicada |
| 14 | Financeiro de mensalidades (inadimplência, acordos, conciliação) | Regra financeira e time próprios travados na fila comum | Serviço Extraído · API Gateway · Tracing |

---

## 17. LabResult — laboratórios de análises clínicas

**Público:** laboratórios de análises clínicas e redes de coleta.
**Cobrança:** assinatura por unidade + faixa por exame processado.
**E01 mínimo:** pacientes, pedidos de exame, coletas, digitação de resultado.

**Por que fecha os 14:** laudo é arquivo desde o primeiro dia (E03) e o portal público de resultado por
protocolo é **enumerável** — dado de saúde exposto por força bruta é o Estágio 09 mais grave da lista.
O interfaceamento com equipamentos (protocolos HL7/ASTM) é um serviço extraído com justificativa
técnica indiscutível.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Pacientes, pedidos de exame, coletas, resultados | Nada doeu | Web · Monólito · Postgres |
| 02 | Pagamento particular do exame + plano do laboratório | Cobrar no balcão e online sem guardar cartão | Gateway de Pagamentos |
| 03 | Laudo em PDF e imagens de exame | Laudo assinado sumiu no deploy — problema legal | Object Storage |
| 04 | "Seu resultado está pronto" por e-mail e SMS | Paciente volta ao balcão porque não foi avisado | Mensageria |
| 05 | Interfaceamento com equipamento + laudo assinado em lote | Gerar 400 laudos após a rodada trava a digitação | Fila · Worker |
| 06 | Portal de resultados com laudos e imagens | Rede de unidades em várias cidades; imagem pesa | CDN |
| 07 | Portal de resultado e painel de produção | Mesmo paciente consulta o resultado 6× no dia | Cache em Memória |
| 08 | Coleta começa às 6 h e não pode parar | Deploy no meio da recepção trava o atendimento | Balanceador de Carga |
| 09 | Consulta pública de resultado por protocolo | **Protocolo enumerável** expõe laudo de saúde; stuffing | WAF · Rate Limiting |
| 10 | Relatório de produtividade e faturamento por convênio | Fechamento mensal trava a liberação de resultado | Réplica de Leitura |
| 11 | — | Interfaceamento parou e resultados não subiram por 40 min | Observabilidade |
| 12 | — | Deploy quebrou a liberação automática de laudo | CI/CD e Testes |
| 13 | Busca por paciente, exame, código e histórico de resultado | Comparar resultado histórico com `LIKE` é inviável | Busca Dedicada |
| 14 | Interfaceamento de equipamentos (HL7/ASTM) | Drivers, protocolos e time próprios; falha precisa isolar-se | Serviço Extraído · API Gateway · Tracing |

---

## 18. AssinaJá — assinatura eletrônica de documentos

**Público:** empresas de qualquer porte que fecham contratos à distância.
**Cobrança:** plano por envelope/documento assinado.
**E01 mínimo:** documentos, signatários, fluxo de assinatura, trilha de auditoria.

**Por que fecha os 14:** o produto é arquivo + e-mail — E03 e E04 entram como núcleo, não como
periferia. O link público de assinatura é uma superfície de ataque legítima (E09), e o carimbo do
tempo / ICP-Brasil é um serviço extraído com HSM, auditoria e conformidade próprios.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Documentos, signatários, fluxo, trilha de auditoria | Nada doeu | Web · Monólito · Postgres |
| 02 | Plano por envelope assinado | Cobrança por uso, com faixas e excedente | Gateway de Pagamentos |
| 03 | Upload do documento e guarda da versão assinada | Contrato assinado desapareceu no deploy — dano jurídico | Object Storage |
| 04 | Convite para assinar e lembrete por e-mail/SMS | Convite no spam = contrato parado por dias | Mensageria |
| 05 | Renderização do PDF carimbado + lembretes em lote | Carimbar 80 páginas na requisição estoura o timeout | Fila · Worker |
| 06 | Página pública de assinatura com visualizador de PDF | Signatários em qualquer lugar; visualizador é pesado | CDN |
| 07 | Painel de envelopes pendentes, assinados e expirados | Cliente com 5 mil envelopes recarrega o painel o dia todo | Cache em Memória |
| 08 | Contrato com prazo de assinatura no mesmo dia | Deploy derruba a assinatura na hora do fechamento | Balanceador de Carga |
| 09 | Link público de assinatura sem login | Link enumerado; phishing sobre a marca; stuffing no login | WAF · Rate Limiting |
| 10 | Relatório de tempo de assinatura e auditoria por período | Auditoria mensal trava o envio de novos envelopes | Réplica de Leitura |
| 11 | — | Convites não saíram por 40 min; ninguém assinou nada | Observabilidade |
| 12 | — | Deploy quebrou a geração da trilha de auditoria | CI/CD e Testes |
| 13 | Busca dentro do conteúdo dos documentos | "achar todo contrato com cláusula X" não é filtro, é busca | Busca Dedicada |
| 14 | Carimbo do tempo e ICP-Brasil | HSM, conformidade e auditoria com ciclo próprio | Serviço Extraído · API Gateway · Tracing |

---

## 19. ObraViva — gestão de obras e diário de obra

**Público:** construtoras de pequeno e médio porte, gerenciadoras e engenheiros autônomos.
**Cobrança:** assinatura por obra ativa.
**E01 mínimo:** obras, etapas, cronograma, diário de obra, equipes.

**Por que fecha os 14:** obra é registrada em foto — o E03 entra cedo e com volume. A medição mensal
(curva S + relatório fotográfico em PDF) é um Estágio 05 e um Estágio 10 naturais no mesmo domínio.
A base de composição de custo (SINAPI/TCPO) é grande, atualiza por fora e tem dono próprio.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Obras, etapas, cronograma, diário de obra, equipes | Nada doeu | Web · Monólito · Postgres |
| 02 | Assinatura por obra ativa | Cobrança recorrente que varia com o portfólio | Gateway de Pagamentos |
| 03 | Fotos do diário, projetos e ART/laudos | Registro fotográfico da obra apagado no deploy | Object Storage |
| 04 | Aviso de medição aprovada e alerta de atraso de etapa | Aviso por telefone não escala em 12 obras simultâneas | Mensageria |
| 05 | Medição mensal + curva S + relatório fotográfico em PDF | Gerar o relatório com 300 fotos na requisição dá timeout | Fila · Worker |
| 06 | Portal do cliente/investidor com galeria de progresso | Obras em várias cidades; galeria de progresso pesa | CDN |
| 07 | Painel do cronograma físico-financeiro | Engenheiro e cliente consultam o mesmo painel o dia todo | Cache em Memória |
| 08 | Apontamento de campo pela manhã, todos os dias | Deploy às 7 h trava a equipe inteira no canteiro | Balanceador de Carga |
| 09 | Portal do cliente exposto na internet | Dados de contrato e cronograma; stuffing no login | WAF · Rate Limiting |
| 10 | Relatório de custo realizado × orçado por obra | Fechamento de medição trava o apontamento de campo | Réplica de Leitura |
| 11 | — | App de campo parou de subir fotos há 2 dias, sem alerta | Observabilidade |
| 12 | — | Deploy quebrou o cálculo da medição no dia do pagamento | CI/CD e Testes |
| 13 | Busca em diários, RDOs e memoriais descritivos | "quando choveu e parou o serviço?" não é filtro | Busca Dedicada |
| 14 | Orçamento e composição de custo (SINAPI/TCPO) | Base grande com atualização e time próprios | Serviço Extraído · API Gateway · Tracing |

---

## 20. LojaPronta — plataforma de e-commerce hospedado

**Público:** pequenos e médios lojistas que querem loja própria sem marketplace.
**Cobrança:** assinatura do lojista + taxa sobre venda.
**E01 mínimo:** lojista, produtos, carrinho, pedido, checkout.

**Por que fecha os 14:** é a ideia em que **quase todos os estágios são obrigatórios** — vitrine pesada
(E06), catálogo lido por anônimos (E07), Black Friday (E08), *card testing* no checkout (E09) e busca
como principal caminho de conversão (E13).
⚠️ Escopo enorme. Só escolha se a disciplina puder restringir o E01 a um recorte pequeno de verdade.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Lojista, produtos, carrinho, pedido, checkout | Nada doeu | Web · Monólito · Postgres |
| 02 | Checkout com cartão e Pix + plano do lojista | Ninguém no time quer tocar em dado de cartão | Gateway de Pagamentos |
| 03 | Fotos de produto e banners da loja | Catálogo de imagens apagado no deploy; loja fica vazia | Object Storage |
| 04 | Confirmação de pedido, rastreio e carrinho abandonado | E-mail próprio no spam derruba a taxa de recuperação | Mensageria |
| 05 | Cotação de frete em várias transportadoras + import de catálogo | Checkout espera 5 transportadoras e dá timeout | Fila · Worker |
| 06 | Vitrine com dezenas de imagens por página | Compradores nacionais; imagem é o maior item da fatura | CDN |
| 07 | Vitrine, categoria e destaques lidos por anônimos | Mesma consulta de vitrine a cada visita; banco no limite | Cache em Memória |
| 08 | Black Friday e campanhas com pico programado | Servidor único não sobrevive; deploy derruba a campanha | Balanceador de Carga |
| 09 | Checkout e catálogo abertos ao público | **Card testing** no checkout; comparadores raspam preço; stuffing | WAF · Rate Limiting |
| 10 | Relatório de vendas e curva ABC para o lojista | Lojista abre o relatório durante a campanha e trava a loja | Réplica de Leitura |
| 11 | — | Checkout com erro por 40 min = receita perdida, sem alerta | Observabilidade |
| 12 | — | Deploy quebrou o cálculo de desconto no carrinho | CI/CD e Testes |
| 13 | Busca no catálogo da loja com sinônimo, erro e faceta | Busca é o caminho de maior conversão e o endpoint mais lento | Busca Dedicada |
| 14 | Cálculo de frete e integrações de logística | Integrações com ritmo e falha próprios; time dedicado | Serviço Extraído · API Gateway · Tracing |

---

## 21. VozAberta — publicação de áudio e newsletter paga

**Público:** criadores de conteúdo, veículos independentes e podcasters.
**Cobrança:** assinatura paga do leitor, com repasse ao autor.
**E01 mínimo:** publicações, episódios, edições, assinantes, feed.

**Por que fecha os 14:** tem o **melhor Estágio 05 da lista** — enviar uma edição para 50 mil assinantes
não cabe em requisição nenhuma — e o **melhor Estágio 06**, porque distribuir áudio é banda pura.
O motor de envio em massa (reputação de IP, bounce, throttling por provedor) é um serviço extraído
com operação completamente distinta do produto.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Publicações, edições, episódios, assinantes, feed RSS | Nada doeu | Web · Monólito · Postgres |
| 02 | Assinatura paga do leitor com repasse ao autor | Cobrança recorrente e cancelamento self-service | Gateway de Pagamentos |
| 03 | Upload de áudio e imagem de capa | Episódio publicado some no deploy; feed quebra | Object Storage |
| 04 | Envio da edição por e-mail aos assinantes | E-mail próprio destrói a entregabilidade do autor | Mensageria |
| 05 | Transcodificação do áudio + **envio para 50 mil assinantes** | Publicar edição na requisição é impossível de qualquer forma | Fila · Worker |
| 06 | Distribuição de áudio via RSS e player web | Ouvintes globais; áudio é banda pura e cresce sozinha | CDN |
| 07 | Página do episódio com contagem de plays e leituras | Edição nova recebe milhares de acessos na mesma hora | Cache em Memória |
| 08 | Envio da edição semanal em horário fixo | Deploy na hora do envio derruba a publicação | Balanceador de Carga |
| 09 | Conteúdo com paywall e área do assinante | Paywall contornado e conteúdo raspado; stuffing na conta | WAF · Rate Limiting |
| 10 | Relatório de abertura, retenção e receita por edição | Relatório do autor trava a leitura para os assinantes | Réplica de Leitura |
| 11 | — | Edição saiu para metade da base e ninguém percebeu | Observabilidade |
| 12 | — | Deploy quebrou o paywall e liberou conteúdo pago | CI/CD e Testes |
| 13 | Busca no arquivo de edições e **na transcrição dos episódios** | Buscar uma fala dentro de 400 episódios não é filtro | Busca Dedicada |
| 14 | Motor de envio em massa (reputação, bounce, throttling) | Operação de entregabilidade com ritmo e time próprios | Serviço Extraído · API Gateway · Tracing |

---

## 22. ContaFácil — gestão de escritórios de contabilidade

**Público:** escritórios contábeis que atendem de 30 a 2.000 empresas.
**Cobrança:** assinatura por cliente sob gestão.
**E01 mínimo:** clientes, obrigações acessórias, prazos, documentos recebidos.

**Por que fecha os 14:** a importação em lote de XML de NF-e (dezenas de milhares por cliente, todo
mês) é um Estágio 05 que não admite discussão. O processamento fiscal/SPED muda por lei, por UF e por
regime tributário — o domínio com o ciclo de mudança mais distinto de toda a lista.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Clientes, obrigações, prazos, documentos recebidos | Nada doeu | Web · Monólito · Postgres |
| 02 | Honorário recorrente por cliente | Cobrança mensal com reajuste e faixas | Gateway de Pagamentos |
| 03 | Documentos fiscais e contábeis enviados pelo cliente | Documento do fechamento sumiu no deploy | Object Storage |
| 04 | Cobrança de documento faltante e aviso de guia disponível | Cobrar por WhatsApp 300 clientes não escala | Mensageria |
| 05 | Importação de XML de NF-e em lote + geração de guias | Importar 40 mil XMLs na requisição é inviável | Fila · Worker |
| 06 | Portal do cliente com documentos e guias | Clientes em várias UFs; portal com muitos PDFs | CDN |
| 07 | Painel de obrigações do mês por cliente | Escritório inteiro consulta o painel o dia todo | Cache em Memória |
| 08 | Fechamento concentrado até o dia 20 | Deploy no dia 20 para o escritório inteiro | Balanceador de Carga |
| 09 | Portal do cliente com dado fiscal exposto | Dado fiscal sensível; credential stuffing no login | WAF · Rate Limiting |
| 10 | Relatório de rentabilidade por cliente e fechamento contábil | Fechamento trava a importação de documentos | Réplica de Leitura |
| 11 | — | Importação de XML parou e o fechamento atrasou 2 dias | Observabilidade |
| 12 | — | Deploy quebrou a geração de guia na véspera do vencimento | CI/CD e Testes |
| 13 | Busca em documentos fiscais (CNPJ, nota, valor, CFOP) | Localizar uma nota entre milhões varre a tabela | Busca Dedicada |
| 14 | Processamento fiscal / SPED | Regra por UF e regime muda por lei; time e ciclo próprios | Serviço Extraído · API Gateway · Tracing |

---

## 23. FormFlow — formulários, pesquisas e coleta de dados

**Público:** empresas, pesquisadores e times de marketing que coletam dados online.
**Cobrança:** plano por volume de respostas por mês.
**E01 mínimo:** formulários, campos, respostas, painel de resultados.

**Por que fecha os 14:** o formulário público embutido em sites de terceiros é o exemplo mais direto de
E06 **e** de E07 (a definição do formulário é idêntica em milhares de carregamentos). É também o
Estágio 11 mais grave da lista: resposta não gravada é dado perdido para sempre, sem como recuperar.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Formulários, campos, respostas, painel de resultados | Nada doeu | Web · Monólito · Postgres |
| 02 | Plano por volume de respostas | Cobrança por uso com excedente | Gateway de Pagamentos |
| 03 | Campo de upload de arquivo na resposta | Anexos de respondentes somem no deploy | Object Storage |
| 04 | Confirmação ao respondente + aviso ao dono do formulário | Dono do formulário descobre respostas só ao abrir o painel | Mensageria |
| 05 | Webhooks por resposta + exportação de 200 mil respostas | Chamar o webhook do cliente dentro da requisição dá timeout | Fila · Worker |
| 06 | Formulário público embutido em sites de terceiros | Respondentes globais; script e assets carregados em toda parte | CDN |
| 07 | Renderização do formulário público | A mesma definição de formulário lida milhares de vezes por hora | Cache em Memória |
| 08 | Pesquisa de grande alcance com coleta concentrada | Deploy no meio da coleta perde respostas | Balanceador de Carga |
| 09 | Formulário público sem autenticação | **Ímã de spam e bot**; IDs enumerados; stuffing no painel | WAF · Rate Limiting |
| 10 | Painel analítico de respostas e exportação | Análise de 2 milhões de respostas trava a coleta ao vivo | Réplica de Leitura |
| 11 | — | Respostas não gravadas por 40 min — dado perdido para sempre | Observabilidade |
| 12 | — | Deploy quebrou a lógica condicional dos campos | CI/CD e Testes |
| 13 | Busca em respostas de texto livre | Ler milhões de respostas abertas exige índice, não `LIKE` | Busca Dedicada |
| 14 | Motor de webhooks e integrações | Terceiros lentos, retry e fila por cliente com ritmo próprio | Serviço Extraído · API Gateway · Tracing |

---

## 24. GymPro — gestão de academias e estúdios

**Público:** academias, boxes de crossfit, estúdios de pilates e personal trainers.
**Cobrança:** mensalidade recorrente do aluno + plano da academia.
**E01 mínimo:** alunos, planos, treinos, check-in.

**Por que fecha os 14:** o check-in na catraca é um Estágio 07 muito concreto — cada entrada consulta a
situação do aluno, e às 18 h isso acontece centenas de vezes por minuto. A cobrança recorrente com
régua de inadimplência (retentativa, renegociação, bloqueio) é um domínio financeiro com dono próprio.

| # | Feature entregue | Dor gerada | Entra |
|---|------------------|------------|-------|
| 01 | Alunos, planos, treinos, check-in | Nada doeu | Web · Monólito · Postgres |
| 02 | Mensalidade recorrente em cartão e débito | Recorrência é o núcleo do negócio e ninguém quer o cartão | Gateway de Pagamentos |
| 03 | Foto de avaliação física, atestado médico, ficha em PDF | Avaliação física do aluno some no deploy | Object Storage |
| 04 | Aviso de cobrança vencida, avaliação e aula | Cobrar pessoalmente na recepção não escala | Mensageria |
| 05 | Cobrança recorrente de toda a base no dia 5 + campanha de retenção | Rodar 3.000 cobranças na requisição é impossível | Fila · Worker |
| 06 | App do aluno com vídeos de execução dos exercícios | Rede com unidades em várias cidades; vídeo pesa | CDN |
| 07 | Check-in na catraca consultando situação do aluno | Às 18 h a mesma consulta acontece centenas de vezes por minuto | Cache em Memória |
| 08 | Catraca dependente do sistema entre 18 h e 20 h | Deploy no pico trava a entrada e forma fila na porta | Balanceador de Carga |
| 09 | Página pública de matrícula + app do aluno | Contas compartilhadas por stuffing; bots na matrícula promocional | WAF · Rate Limiting |
| 10 | Relatório de churn, frequência e receita recorrente | Fechamento mensal deixa a catraca lenta | Réplica de Leitura |
| 11 | — | Catraca liberando errado por 40 min, descoberto pelo professor | Observabilidade |
| 12 | — | Deploy quebrou a renovação automática do plano | CI/CD e Testes |
| 13 | Busca na biblioteca de exercícios e no histórico de treino | Montar treino buscando por grupo muscular e equipamento | Busca Dedicada |
| 14 | Cobrança recorrente e régua de inadimplência | Retentativa, renegociação e conformidade com time próprio | Serviço Extraído · API Gateway · Tracing |

---

# Recomendação para a disciplina

## Top 5 entre as 24

| Posição | Ideia | Por quê |
|---------|-------|---------|
| 🥇 | **HelpDeskBR** (#10) | Domínio que todo aluno já usou como cliente. Os 14 estágios encaixam sem nenhuma forçada, e o E13 (busca) e o E14 (ingestão de e-mail) são os mais defensáveis de todas. Sem complexidade algorítmica competindo com a arquitetura. |
| 🥈 | **FormFlow** (#23) | O menor E01 possível (formulário, campo, resposta) com o maior alcance de estágios. O E07 é único: a mesma definição de formulário é lida milhares de vezes, e cachear isso é seguro — enquanto a resposta gravada nunca pode vir de cópia. Ensina I5 e I11 melhor que qualquer outra. |
| 🥉 | **ImobiHub** (#5) | Estágios 06, 09 e 13 são exemplos literalmente iguais aos do curso (raspagem de catálogo, banda de imagem, busca com facetas). Ótimo para demonstrar o modelo, mas o domínio é menos familiar que o suporte. |
| 4º | **AssinaJá** (#18) | Arquivo e e-mail entram como núcleo do produto, não como periferia — o aluno sente o E03 e o E04 no primeiro sprint. Trilha de auditoria força a discussão de imutabilidade e idempotência (I4) desde cedo. |
| 5º | **EscolaViva** (#16) | Domínio que a turma conhece por dentro. O fechamento de bimestre é o exemplo mais limpo de E05 da lista, e o E10 (censo, rendimento, inadimplência) sai naturalmente do mesmo dado. |

**Menção honrosa:** **AgendaSaúde** (#1) e **LabResult** (#17) — dores perfeitas, mas dado de saúde
puxa a discussão para LGPD. Didático, porém consome tempo de aula que era da arquitetura.

## O que evitar se o objetivo é ensinar arquitetura

Estas ideias têm um problema técnico paralelo forte que **rouba atenção do assunto real da
disciplina**. Só escolha assumindo esse tema como bônus:

| Ideia | Problema paralelo |
|-------|-------------------|
| **TicketON** (#8) | Concorrência de estoque de ingressos |
| **FreteFácil** (#12) | Roteirização |
| **AgroTrack** (#11) | Geoprocessamento e ingestão IoT |
| **LojaPronta** (#20) | Escopo de e-commerce completo — o E01 sozinho vira um semestre |
| **ServiçoJá** (#14) | Split de pagamento e escrow |
| **ContaFácil** (#22) | Regra fiscal brasileira |
| **HospedaFácil** (#15) | Overbooking e sincronização com OTAs |
| **VozAberta** (#21) | Transcodificação de áudio |

## Se o semestre for curto

Não corte estágios do meio — isso quebra o encadeamento das dores. Duas alternativas honestas:

1. **Implementar até o Estágio 08** e apresentar 09–14 como seminário/projeto de arquitetura em papel,
   com o gatilho de dor e as invariantes descritas no formato da Seção 8 do documento de referência.
2. **Implementar todos os 14 em escala de laboratório**, simulando cada dor com carga sintética
   (`k6`/`locust`) em vez de esperar contas reais. É o mais didático: o aluno *mede* a dor antes de
   adicionar o componente, que é exatamente o princípio 2.1 do curso.

## Não negociável, seja qual for a ideia escolhida

As 22 invariantes da Seção 5 de [`EVOLUCAO_SAAS.md`](./EVOLUCAO_SAAS.md) precisam existir já no
**Estágio 01**. Em especial, as que os alunos mais esquecem e que custam caro depois:

- **I1** — monólito modular com pastas por domínio desde o primeiro commit (destrava o E14).
- **I2** — nada de estado em memória de processo ou disco local (destrava o E03 e o E08).
- **I3** — `Mailer`, `FileStorage` e `PaymentGateway` atrás de interface (destrava o E05).
- **I4** — idempotência em webhook e job (destrava o E02 e o E05).
- **I5** — o banco é a única fonte da verdade; cache, réplica e índice nunca decidem nada.
- **I11** — nunca cachear resposta autenticada sem separar por usuário.
- **I16** — correlation ID gerado na borda, propagado em log, HTTP e mensagem (destrava o E11 e o E14).

Um projeto que ignora I1, I2 e I3 no Estágio 01 **não chega** ao Estágio 14 por adição — e é justamente
essa a lição central do curso.
