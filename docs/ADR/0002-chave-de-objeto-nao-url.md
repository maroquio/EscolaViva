# ADR 0002 — Quando houver arquivo, a coluna guarda a chave do objeto, não a URL

**Status:** aceita — Estágio 01 (decisão registrada antes de existir o problema)

## Contexto

No Estágio 01 não há arquivo nenhum. O documento de matrícula continua em papel na
secretaria, o boletim é uma tela e o comunicado fica no mural do portal. Não existe upload,
não existe `documento`, não existe armazenamento de objetos — e nada disso é criado "para
depois", nem como pasta vazia, nem como interface sem implementação.

Mesmo assim há uma decisão que precisa estar tomada antes da primeira linha de código do
Estágio 03: **o que a tabela guarda quando o arquivo existir**. É a invariante I9.

Guardar a URL completa parece prático — basta jogar no `src` da imagem. O preço aparece
depois, todo de uma vez: trocar de bucket, de região ou de provedor vira `UPDATE` em massa;
colocar CDN na frente (Estágio 06) exige reescrever URLs gravadas; link assinado com
expiração não cabe em coluna, porque o que está gravado envelhece. A URL é uma decisão de
entrega, e decisão de entrega não pertence ao dado.

## Decisão

Quando o armazenamento de objetos entrar no Estágio 03, a coluna se chamará
`documento.chave_objeto` e guardará **a chave do objeto** — o caminho lógico dentro do
bucket, algo como `rede/<rede_id>/matricula/<matricula_id>/<uuid>.pdf`.

**Jamais `documento.url`.** A URL é montada na hora da entrega, a partir da chave mais a
configuração do ambiente (bucket, região, domínio da CDN, assinatura e prazo).

## Consequências

- Trocar de bucket, de região, de provedor ou pôr CDN na frente é mudança de configuração,
  não migração de dados.
- Link assinado com expiração passa a ser possível sem gambiarra: a chave é estável, a URL
  é efêmera.
- O nome da coluna é o lembrete. `chave_objeto` não convida ninguém a colar um endereço
  `https://` ali dentro; `url` convidaria.
- O custo hoje é este arquivo. É a definição de decisão barata agora e cara depois.
