/*
 * O `id` do controle é o nome do campo — e nome de campo tem dono.
 *
 * Num formulário o nome do campo aparece quatro vezes na mesma linha de código: no `name`, que é o
 * que o navegador manda de volta; no `id`, que é a âncora do controle; no `for` do rótulo, que
 * casa com esse `id`; e dentro dos ids derivados (`name-help`, `name-error`), que o
 * `aria-describedby` cita. Três dessas quatro já vinham da constante — `name="<%= fields.name %>"`,
 * `it.helpId(fields.name)`, `describedBy(fields.name, true)`. A quarta, o `id` base, estava
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
import { FIELDS } from '../../src/web/constants';
import { firstExistingPath } from '../support/paths';

const PROJECT_ROOT = join(import.meta.dir, '..', '..');

const TEMPLATE = () =>
  firstExistingPath(
    'src/web/templates/secretaria/aluno_novo.eta',
    'src/web/templates/registrar/student_new.eta',
  );

const FROZEN_SCREEN = join(import.meta.dir, 'golden', 'secretaria-aluno-novo.txt');

const FIELD_NAMES = Object.values(FIELDS.student);

/** A chave da constante é o que o template escreve; o valor é o que sai no HTML. */
const FIELD_NAME: Record<string, string> = FIELDS.student;
const FIELD_KEYS = Object.keys(FIELD_NAME);

const ANCHOR = /\b(id|for)\s*=\s*"([^"]*)"/g;

const ETA_BLOCK = /<%[\s\S]*?%>/g;

const templateSource = async (): Promise<string> =>
  Bun.file(join(PROJECT_ROOT, await TEMPLATE())).text();

type Anchor = { readonly attribute: string; readonly value: string };

const anchorsOf = (source: string): Anchor[] =>
  [...source.matchAll(ANCHOR)].map((finding) => ({
    attribute: finding[1] ?? '',
    value: finding[2] ?? '',
  }));

/** O que sobra da âncora depois de tirar o que veio por interpolação: o pedaço escrito à mão. */
const writtenByHand = (value: string): string => value.replaceAll(ETA_BLOCK, '');

const anchorsThatRewriteTheField = (source: string): string[] =>
  anchorsOf(source)
    .filter(({ value }) => FIELD_NAMES.some((field) => writtenByHand(value).includes(field)))
    .map(({ attribute, value }) => `${attribute}="${value}"`);

const INTERPOLATING_ANCHOR = new RegExp(
  `\\b(id|for)="<%=\\s*fields\\.(${FIELD_KEYS.join('|')})\\s*%>"`,
  'g',
);

/** Desfaz a correção: devolve o `id`/`for` a nome escrito à mão, como estava antes. */
const withTheFieldRewrittenByHand = (source: string): string =>
  source.replaceAll(
    INTERPOLATING_ANCHOR,
    (_inteiro, attribute: string, key: string) => `${attribute}="${FIELD_NAME[key] ?? key}"`,
  );

const LIVE_PROBE = 'a sonda devolveu ao menos uma âncora ao nome escrito à mão';

const DEAD_PROBE =
  'a sonda não conseguiu reescrever âncora nenhuma — ela deixou de provar qualquer coisa sobre a ' +
  'regra acima; conserte a sonda antes de confiar no resultado dela.';

const probeVerdict = (source: string, regression: string): string =>
  regression === source ? DEAD_PROBE : LIVE_PROBE;

describe('o nome do campo do aluno vem da constante em toda âncora', () => {
  test('nenhum `id` ou `for` do formulário reescreve o nome do campo à mão', async () => {
    const source = await templateSource();

    expect(anchorsOf(source).length).toBeGreaterThan(0);
    expect(anchorsThatRewriteTheField(source)).toEqual([]);
  });

  test('a sonda: devolver a âncora ao nome escrito à mão volta a ser acusado', async () => {
    const source = await templateSource();
    const regression = withTheFieldRewrittenByHand(source);

    expect(probeVerdict(source, regression)).toBe(LIVE_PROBE);
    expect(anchorsThatRewriteTheField(regression).length).toBeGreaterThan(0);
  });

  test('a tela congelada continua casando cada `for` com o `id` de mesmo nome', async () => {
    const html = await Bun.file(FROZEN_SCREEN).text();
    const anchors = anchorsOf(html);

    const labels = anchors.filter(({ attribute }) => attribute === 'for').map(({ value }) => value);
    const controls = new Set(
      anchors.filter(({ attribute }) => attribute === 'id').map(({ value }) => value),
    );

    expect(labels).toEqual([...FIELD_NAMES]);
    expect(labels.filter((label) => !controls.has(label))).toEqual([]);
  });
});
