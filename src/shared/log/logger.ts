import { pino } from 'pino';
import { config } from '../config';
import { LOG, NIVEIS_DE_LOG } from '../constantes';
import { redigir, type CamposDeLog } from './redacao';

/**
 * Os níveis do logger são os MESMOS que a configuração aceita: `config.logLevel` é validado contra
 * `NIVEIS_DE_LOG` e `raiz[nivel]` só existe no pino para os nomes dessa lista. Derivar o tipo —
 * como `Config` já faz — evita a segunda lista, que continuaria compilando enquanto o schema
 * recusasse o valor em tempo de execução.
 */
type Nivel = (typeof NIVEIS_DE_LOG)[number];

/** A assinatura única dos quatro métodos: campos estruturados primeiro, mensagem depois. */
type Emissor = (campos: CamposDeLog, msg: string) => void;

// JSON direto no stdout: sem transport e sem arquivo, porque a aplicação não escreve em disco.
const raiz = pino({ level: config.logLevel });

/**
 * I16: o correlacao_id nasce na borda HTTP, mas `shared/log` não pode importar `shared/http` —
 * seria ciclo de import, já que o http loga. A camada http registra sua fonte no boot e o
 * logger apenas consulta.
 */
let fonteDeCorrelacao: (() => string | undefined) | undefined;

export function registrarFonteDeCorrelacao(f: () => string | undefined): void {
  fonteDeCorrelacao = f;
}

function emitir(nivel: Nivel, campos: CamposDeLog, msg: string): void {
  const seguros = redigir(campos);
  const correlacaoId = fonteDeCorrelacao?.();
  raiz[nivel](
    correlacaoId === undefined ? seguros : { ...seguros, [LOG.campoDeCorrelacao]: correlacaoId },
    msg,
  );
}

/**
 * Um método por nível, gerado a partir da mesma lista que tipa `Nivel`. Escritos à mão, os quatro
 * nomes seriam quatro literais repetindo — em posição de argumento, onde nada os liga à lista — o
 * conjunto que o schema de configuração já governa.
 */
export const logger = Object.fromEntries(
  NIVEIS_DE_LOG.map((nivel): [Nivel, Emissor] => [
    nivel,
    (campos, msg) => {
      emitir(nivel, campos, msg);
    },
  ]),
) as Record<Nivel, Emissor>;
