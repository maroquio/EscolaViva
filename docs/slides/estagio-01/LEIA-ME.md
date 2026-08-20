# EscolaViva — Estágio 1 · apresentação

Apresentação em HTML e CSS puros, sem uma linha de JavaScript. 71 slides em 16:10.

## Como apresentar

Abra `index.html` no navegador — duplo clique basta, não precisa de servidor.

- **PageDown / PageUp**, seta para baixo, ou a roda do mouse: um slide de cada vez.
  Cada slide trava no lugar por `scroll-snap`.
- **Slide 2** é o índice: os títulos são links. Clicar leva ao slide.
- **F11** para tela cheia.

O slide é sempre 16:10 exato. Num projetor de proporção diferente sobra tarja escura em cima
e embaixo, ou nas laterais — o conteúdo nunca distorce e a tipografia escala junto, porque as
medidas são em `cqw` (percentual da largura do slide), não em pixel.

## Plano B: o PDF

`EscolaViva-Estagio-01.pdf` — 71 páginas, uma por slide, 1280×800 paisagem.

Para regerar depois de mudar alguma coisa: abra `index.html` no Chrome, Ctrl+P, escolha
"Salvar como PDF", papel personalizado 1280×800, margens zero, e marque "Gráficos de plano de fundo".
As regras de `@media print` no `estilo.css` fazem o resto.

## O que tem dentro

| Seção | Slides | O que cobre |
| --- | --- | --- |
| Capa e índice | 2 | |
| O sistema | 8 | posicionamento, o que o estágio é, o que ficou de fora, os 14 estágios, as dores plantadas |
| Requisitos | 5 | 42 funcionais e 22 não funcionais, cada RNF com a coluna "como é verificado hoje" |
| O domínio | 18 | casos de uso, invariantes, camada de domínio, ER, quatro ciclos de vida — com recortes ampliados |
| A arquitetura | 11 | arquitetura, regras do portão, núcleo compartilhado, sequência de um POST, stack, pastas, testes |
| A fatia vertical | 17 | "Matricular aluno", das oito camadas ao código completo de cada uma, sem abreviação |
| O frontend | 8 | stack, componentes React, pastas, e as telas capturadas em 1280×800 |
| Fecho | 2 | como rodar na máquina, encerramento |

## Os arquivos

```
index.html                    o deck
estilo.css                    o motor: 16:10, scroll-snap, impressão
EscolaViva-Estagio-01.pdf     o mesmo deck, uma página por slide
assets/diagramas/*.svg        12 diagramas em português (9 traduzidos, 3 novos)
assets/recortes/*.png         13 ampliações das regiões narradas
assets/telas/*.png            10 capturas do sistema, todas 1280×800
```

## Sobre os diagramas

A prosa está em português; **os identificadores continuam em inglês** — `canTransfer()`,
`unitOfWork()`, `apps/api/src/...`, `active_enrollment_unique_per_year`, os nomes de tabela e de
coluna. É deliberado: é isso que o aluno vai encontrar quando abrir o repositório. Um diagrama que
traduz identificador ensina um código que não existe.

Estes SVGs são **cópias** dos que estão em `docs/diagrams/2026-08-20/`. O original em inglês
continua lá e é cobrado por `tests/diagrams.test.ts`, que compara os números do painel com o
repositório e exige que todo caminho citado exista. Traduzir dentro daquela pasta quebraria o
portão; por isso a cópia mora aqui.

## Refazer as capturas

As dez telas vieram do sistema rodando contra o banco de desenvolvimento semeado
(rede `demo`, senha `escolaviva`). Para refazer:

```sh
docker compose --env-file .env -f infra/docker-compose.yml up -d
bun run migrate && bun run seed
bun run build:web
PORT=3333 bun apps/api/src/main.ts
```

E então navegar com o Playwright em `viewport: { width: 1280, height: 800 }`.
Servir o `dist` pela própria API — em vez do Vite — evita o proxy e deixa a captura igual à produção.
