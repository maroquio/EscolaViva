/*
 * The ports are the only place in the system that talks to the real clock and to the identifier
 * generator. What is pinned down here is the contract the use cases assume: `now()` gives back a
 * Date that moves with time, and `next()` gives back a uuid that never repeats.
 */

import { describe, expect, test } from 'bun:test';
import { dayOf, systemClock, uuidIdGenerator } from '../../src/shared/ports';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ROLL_CALLS = 1000;

describe('systemClock', () => {
  test('now() gives back a Date', () => {
    const clock = systemClock;

    const instant = clock.now();

    expect(instant).toBeInstanceOf(Date);
  });

  test('now() gives back the present instant, between before and after the call', () => {
    const before = Date.now();

    const instant = systemClock.now();

    expect(instant.getTime()).toBeGreaterThanOrEqual(before);
    expect(instant.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('now() never goes backwards between two readings in a row', () => {
    const first = systemClock.now();

    const second = systemClock.now();

    expect(second.getTime()).toBeGreaterThanOrEqual(first.getTime());
  });

  test('now() gives back a fresh Date on every call, not a shared instance', () => {
    const first = systemClock.now();

    const second = systemClock.now();

    expect(second).not.toBe(first);
  });
});

/*
 * Until 2026-08-19 there were two answers to "what day is today": the teacher's route assembled the
 * date from the local parts of the Date, and the student registration read it off toISOString, in
 * UTC. On a machine three hours behind UTC they disagreed for the last three hours of every day —
 * the roll call opened on one date and the age check used another. Both now come through the clock,
 * and the clock answers in the calendar the school lives in, not in the one the container happens
 * to be configured with.
 */
describe('today(), in the school calendar', () => {
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  test('gives back a date in YYYY-MM-DD', () => {
    expect(systemClock.today()).toMatch(ISO_DATE);
  });

  test('late evening in Brazil is still today, not tomorrow', () => {
    const nineThirtyPmInBrasilia = new Date('2026-08-20T00:30:00Z');

    expect(dayOf(nineThirtyPmInBrasilia)).toBe('2026-08-19');
  });

  test('past midnight in Brazil is already tomorrow', () => {
    const twelveThirtyAmInBrasilia = new Date('2026-08-20T03:30:00Z');

    expect(dayOf(twelveThirtyAmInBrasilia)).toBe('2026-08-20');
  });

  test('the turn of the year is read in the school calendar too', () => {
    const ninePmOnDecemberThirtyFirst = new Date('2027-01-01T00:00:00Z');

    expect(dayOf(ninePmOnDecemberThirtyFirst)).toBe('2026-12-31');
  });

  test('today() is the day of the instant now() reports', () => {
    const clock = systemClock;

    expect(clock.today()).toBe(dayOf(clock.now()));
  });
});

describe('uuidIdGenerator', () => {
  test('next() gives back a valid uuid', () => {
    const generator = uuidIdGenerator;

    const id = generator.next();

    expect(id).toMatch(UUID_V4);
  });

  test(`next() does not repeat across ${ROLL_CALLS} calls`, () => {
    const generator = uuidIdGenerator;

    const generated = new Set(Array.from({ length: ROLL_CALLS }, () => generator.next()));

    expect(generated.size).toBe(ROLL_CALLS);
  });

  test(`all ${ROLL_CALLS} generated identifiers are valid uuids`, () => {
    const generator = uuidIdGenerator;

    const invalid = Array.from({ length: ROLL_CALLS }, () => generator.next()).filter(
      (id) => !UUID_V4.test(id),
    );

    expect(invalid).toEqual([]);
  });
});
