# I19 — artefato imutável desde o dia 1.
# A MESMA imagem roda em desenvolvimento e em produção; o que muda entre os dois é apenas o
# conjunto de variáveis de ambiente. A tag da imagem é o hash do commit — nunca `latest`,
# nunca um build diferente por ambiente. É assim que "funciona na minha máquina" deixa de
# ser uma frase possível, mesmo sem esteira de CI (que só entra no Estágio 12).

# Os dois manifestos de workspace, e não só o da API: o lockfile registra ambos, e
# `--frozen-lockfile` recusa a instalação se algum membro declarado estiver faltando. Este
# estágio existe só para ser reaproveitado pelos dois seguintes — copiar manifesto é barato,
# e assim uma mudança no código do front não invalida o cache da instalação da API.
FROM oven/bun:1.3-alpine AS manifests
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/

FROM manifests AS dependencies
RUN bun install --frozen-lockfile --production

# O front é construído aqui e nada disto chega ao runtime. A instalação é SEM `--production`
# porque Vite, React e o resto da cadeia são dependências de desenvolvimento: sem elas o
# `bun run build` não existe. O que sai deste estágio é a pasta `dist`, e só ela.
#
# `packages/contracts` vem junto porque o front o declara como dependência — é a única coisa que
# ele pode importar deste repositório, e a regra `web-sees-only-contracts` do dependency-cruiser
# existe para manter assim. Sem esta linha o build morre em `Could not resolve
# "@escolaviva/contracts/enumerations"`.
#
# Nem tudo ali é tipo: `ROLES`, `SHIFTS` e `TERMS` são valores, e esses três atravessam o `tsc`
# para dentro do bundle. Contrato é vocabulário além de forma, e o vocabulário viaja.
FROM manifests AS front
RUN bun install --frozen-lockfile
COPY packages/contracts ./packages/contracts
COPY apps/web ./apps/web
RUN cd apps/web && bun run build

FROM oven/bun:1.3-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Onde a imagem coloca o build do front. O handler estático lê esta variável; dentro da imagem
# o `dist` está em /app/front, e não em apps/web/dist, porque o código do front não vem junto.
ENV FRONT_PATH=/app/front

# São duas cópias, e não uma, porque `workspaces` faz o Bun instalar em modo isolado: o topo
# guarda só o store `.bun/`, e o que `apps/api` resolve são symlinks em `apps/api/node_modules`
# apontando para dentro dele. Copiar apenas o topo produz uma imagem que constrói e morre no
# primeiro import, com `Cannot find package 'hono'`.
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=front /app/apps/web/dist ./front
COPY package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/api/src ./apps/api/src
# O symlink `apps/api/node_modules/@escolaviva/contracts` copiado acima aponta para cá. Hoje a API
# só importa tipos do pacote, e o Bun os apaga antes de resolver — a imagem funcionaria com o
# symlink pendurado no vazio. É o dia em que um handler importar `ROLES` que ela morreria no boot,
# num deploy que passou por todos os testes.
COPY packages/contracts ./packages/contracts
COPY migrations ./migrations
COPY scripts ./scripts

# O usuário `bun` já existe na imagem base e não é root: o processo não escreve em disco
# (I2) e não tem motivo para poder.
USER bun

EXPOSE 3000

# I13 — o healthcheck do container usa /health/live, que só confirma que o processo responde.
# /health verifica o banco e é para o operador decidir tirar a instância de rotação;
# usá-lo aqui faria o container reiniciar em looping toda vez que o banco piscasse.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --quiet --output-document=/dev/null http://127.0.0.1:3000/health/live || exit 1

ENTRYPOINT ["bun", "apps/api/src/main.ts"]
