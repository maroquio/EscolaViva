import { CABECALHOS, SEPARADOR_DE_ENCAMINHAMENTO } from '../constantes';

const cadeiaEncaminhada = (req: Request): string[] =>
  (req.headers.get(CABECALHOS.encaminhado) ?? '')
    .split(SEPARADOR_DE_ENCAMINHAMENTO)
    .map((endereco) => endereco.trim())
    .filter((endereco) => endereco.length > 0);

/**
 * I12: `X-Forwarded-For` é um cabeçalho que qualquer cliente escreve. Sem proxy confiável na
 * frente, acreditar nele é deixar o usuário escolher o próprio IP — por isso a lista vazia o
 * ignora por completo. Com proxies confiáveis, a cadeia é lida da direita para a esquerda,
 * descartando os saltos que nós mesmos operamos; o primeiro endereço que não é nosso é o cliente.
 *
 * A lista vem de `PROXIES_CONFIAVEIS`: colocar uma CDN ou um balanceador na frente da aplicação
 * é mudança de variável de ambiente, não de código.
 */
export function ipDoCliente(
  req: Request,
  enderecoRemoto: string | undefined,
  proxiesConfiaveis: string[],
): string {
  const remoto = enderecoRemoto ?? '';
  if (proxiesConfiaveis.length === 0) return remoto;

  const confiaveis = new Set(proxiesConfiaveis.map((proxy) => proxy.trim()));
  const cadeia = cadeiaEncaminhada(req);
  for (let i = cadeia.length - 1; i >= 0; i -= 1) {
    const candidato = cadeia[i];
    if (candidato !== undefined && !confiaveis.has(candidato)) return candidato;
  }
  return remoto;
}
