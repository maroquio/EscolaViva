# I19 — artefato imutável desde o dia 1.
# A MESMA imagem roda em desenvolvimento e em produção; o que muda entre os dois é apenas o
# conjunto de variáveis de ambiente. A tag da imagem é o hash do commit — nunca `latest`,
# nunca um build diferente por ambiente. É assim que "funciona na minha máquina" deixa de
# ser uma frase possível, mesmo sem esteira de CI (que só entra no Estágio 12).

FROM oven/bun:1.3-alpine AS dependencias
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# I10 — o CSS sai daqui com o hash no nome. `public/` não vem do contexto de build
# (está no .dockerignore); é gerado dentro da imagem, a partir da fonte versionada.
FROM dependencias AS ativos
COPY src ./src
COPY scripts ./scripts
RUN bun scripts/build-assets.ts

FROM oven/bun:1.3-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=dependencias /app/node_modules ./node_modules
COPY --from=ativos /app/public ./public
COPY package.json ./
COPY src ./src
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

ENTRYPOINT ["bun", "src/main.ts"]
