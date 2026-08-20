import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { formatGrade, formatPercent, formatRate } from '../../../src/shared/format/number';

const TYPESCRIPT_SOURCE = /\.tsx?$/;
const DECLARES_A_HUNDRED = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)(?:\s*:[^=]+)?\s*=\s*100\b/g;

const namesOfAHundredIn = (text: string): string[] =>
  Array.from(text.matchAll(DECLARES_A_HUNDRED)).flatMap((declaration) => declaration[1] ?? []);

const multipliesBy = (text: string, factor: string): boolean =>
  new RegExp(`\\*\\s*${factor}\\b|\\b${factor}\\s*\\*`).test(text);

const everyTypeScriptSourceFile = async (): Promise<Map<string, string>> => {
  const source = resolve(process.cwd(), 'src');
  const entries = await readdir(source, { recursive: true });
  const texts = new Map<string, string>();

  for (const entry of entries.filter((name) => TYPESCRIPT_SOURCE.test(name))) {
    texts.set(entry.replaceAll('\\', '/'), await readFile(resolve(source, entry), 'utf8'));
  }

  return texts;
};

describe('a grade', () => {
  test('is truncated, never rounded, because Math.round would turn 5,99 into the 6,0 that prints aprovado beside a status saying reprovado — a literal port of a server rule is exactly where the rule gets quietly improved into a bug', () => {
    expect(formatGrade(5.99)).toBe('5,9');
    expect(formatGrade(9.99)).toBe('9,9');
    expect(formatGrade(6.04)).toBe('6,0');
  });

  test('uses the comma the country writes with', () => {
    expect(formatGrade(7.5)).toBe('7,5');
  });

  test('an absent grade is an em dash, not a zero', () => {
    expect(formatGrade(null)).toBe('—');
    expect(formatGrade(undefined)).toBe('—');
    expect(formatGrade('')).toBe('—');
    expect(formatGrade('não é número')).toBe('—');
  });

  test('a numeric string is accepted, because that is how JSON carries it', () => {
    expect(formatGrade('8.25')).toBe('8,2');
  });
});

describe('a rate', () => {
  test('becomes a percentage, as it does on the server', () => {
    expect(formatRate(0.123)).toBe('12,3 %');
    expect(formatRate(0)).toBe('0,0 %');
    expect(formatRate(1)).toBe('100,0 %');
  });

  test('and the multiplication by 100 happens in this module and in no other, because leaving it spread around already cost a screen showing 0,1 % for what was 12,3 % — a second helper doing it again is invisible to any assertion on what formatRate returns', async () => {
    const sources = await everyTypeScriptSourceFile();
    const aHundred = ['100', ...[...sources.values()].flatMap(namesOfAHundredIn)];

    const turningFractionsIntoPercentages = [...sources]
      .filter(([, text]) => aHundred.some((factor) => multipliesBy(text, factor)))
      .map(([path]) => path);

    expect(turningFractionsIntoPercentages).toEqual(['shared/format/number.ts']);
  });

  test('an absent rate is an em dash', () => {
    expect(formatRate(null)).toBe('—');
  });

  test('a percentage is not multiplied again: formatPercent takes a number that is already a percentage and formatRate takes a fraction, and handing a fraction to the first is the mistake the pair exists to make visible', () => {
    expect(formatPercent(12.3)).toBe('12,3 %');
    expect(formatPercent(null)).toBe('—');
  });
});
