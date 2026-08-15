import { CABECALHOS, SEPARADOR_DE_ENCAMINHAMENTO } from '../constantes';

const cadeiaEncaminhada = (req: Request): string[] =>
  (req.headers.get(CABECALHOS.encaminhado) ?? '')
    .split(SEPARADOR_DE_ENCAMINHAMENTO)
    .map((endereco) => endereco.trim())
    .filter((endereco) => endereco.length > 0);

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
