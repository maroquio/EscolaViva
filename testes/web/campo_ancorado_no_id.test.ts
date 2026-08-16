/*
 * O `id` do controle é o nome do campo — e nome de campo tem dono.
 *
 * Num formulário o nome do campo aparece quatro vezes na mesma linha de código: no `name`, que é o
 * que o navegador manda de volta; no `id`, que é a âncora do controle; no `for` do rótulo, que
 * casa com esse `id`; e dentro dos ids derivados (`nome-ajuda`, `nome-erro`), que o
 * `aria-describedby` cita. Três dessas quatro já vinham da constante — `name="<%= campos.nome %>"`,
 * `it.idDaAjuda(campos.nome)`, `descricao(campos.nome, true)`. A quarta, o `id` base, estava
 * reescrita à mão.
 *
 * Isso não é cosmética: `id`, `for` e `name` do mesmo controle têm de ser a MESMA palavra, senão o
 * rótulo deixa de clicar no campo e o leitor de tela deixa de anunciá-lo. Enquanto uma das quatro
 * for cópia, renomear o campo na constante quebra a tela em silêncio — o `name` acompanha, o `id`
 * fica para trás, e nenhum teste de rota nota, porque o formulário continua gravando.
 *
 * O verificador de magic values não alcança `id` nem `for`: ele varre `name`, `value`, `href`,
 * `action`, `maxlength` e os atributos de texto, e não estes. É este arquivo que segura a regra
 * aqui, e por isso ele vem em três partes: a regra, a sonda que prova que a regra morde, e a tela
 * congelada, onde a âncora que passou a vir da constante continua saindo com o nome do campo.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { CAMPOS } from '../../src/web/constantes';
import { firstExistingPath } from '../apoio/paths';

const RAIZ_DO_PROJETO = join(import.meta.dir, '..', '..');

const TEMPLATE = () =>
  firstExistingPath(
    'src/web/templates/secretaria/aluno_novo.eta',
    'src/web/templates/registrar/student_new.eta',
  );

const TELA_CONGELADA = join(import.meta.dir, 'golden', 'secretaria-aluno-novo.txt');

const NOMES_DOS_CAMPOS = Object.values(CAMPOS.aluno);

const ANCORA = /\b(id|for)\s*=\s*"([^"]*)"/g;

const BLOCO_DO_ETA = /<%[\s\S]*?%>/g;

const fonteDoTemplate = async (): Promise<string> =>
  Bun.file(join(RAIZ_DO_PROJETO, await TEMPLATE())).text();

type Ancora = { readonly atributo: string; readonly valor: string };

const ancorasDe = (fonte: string): Ancora[] =>
  [...fonte.matchAll(ANCORA)].map((achado) => ({
    atributo: achado[1] ?? '',
    valor: achado[2] ?? '',
  }));

/** O que sobra da âncora depois de tirar o que veio por interpolação: o pedaço escrito à mão. */
const escritoAMao = (valor: string): string => valor.replaceAll(BLOCO_DO_ETA, '');

const ancorasQueReescrevemOCampo = (fonte: string): string[] =>
  ancorasDe(fonte)
    .filter(({ valor }) => NOMES_DOS_CAMPOS.some((campo) => escritoAMao(valor).includes(campo)))
    .map(({ atributo, valor }) => `${atributo}="${valor}"`);

const ANCORA_QUE_INTERPOLA = new RegExp(
  `\\b(id|for)="<%=\\s*campos\\.(${NOMES_DOS_CAMPOS.join('|')})\\s*%>"`,
  'g',
);

/** Desfaz a correção: devolve o `id`/`for` a nome escrito à mão, como estava antes. */
const comOCampoReescritoAMao = (fonte: string): string =>
  fonte.replaceAll(
    ANCORA_QUE_INTERPOLA,
    (_inteiro, atributo: string, campo: string) => `${atributo}="${campo}"`,
  );

const SONDA_VIVA = 'a sonda devolveu ao menos uma âncora ao nome escrito à mão';

const SONDA_MORTA =
  'a sonda não conseguiu reescrever âncora nenhuma — ela deixou de provar qualquer coisa sobre a ' +
  'regra acima; conserte a sonda antes de confiar no resultado dela.';

const vereditoDaSonda = (fonte: string, recaida: string): string =>
  recaida === fonte ? SONDA_MORTA : SONDA_VIVA;

describe('o nome do campo do aluno vem da constante em toda âncora', () => {
  test('nenhum `id` ou `for` do formulário reescreve o nome do campo à mão', async () => {
    const fonte = await fonteDoTemplate();

    expect(ancorasDe(fonte).length).toBeGreaterThan(0);
    expect(ancorasQueReescrevemOCampo(fonte)).toEqual([]);
  });

  test('a sonda: devolver a âncora ao nome escrito à mão volta a ser acusado', async () => {
    const fonte = await fonteDoTemplate();
    const recaida = comOCampoReescritoAMao(fonte);

    expect(vereditoDaSonda(fonte, recaida)).toBe(SONDA_VIVA);
    expect(ancorasQueReescrevemOCampo(recaida).length).toBeGreaterThan(0);
  });

  test('a tela congelada continua casando cada `for` com o `id` de mesmo nome', async () => {
    const html = await Bun.file(TELA_CONGELADA).text();
    const ancoras = ancorasDe(html);

    const rotulos = ancoras.filter(({ atributo }) => atributo === 'for').map(({ valor }) => valor);
    const controles = new Set(
      ancoras.filter(({ atributo }) => atributo === 'id').map(({ valor }) => valor),
    );

    expect(rotulos).toEqual([...NOMES_DOS_CAMPOS]);
    expect(rotulos.filter((rotulo) => !controles.has(rotulo))).toEqual([]);
  });
});
