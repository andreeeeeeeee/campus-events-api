import { describe, it, expect } from 'vitest';
import { isEventDateValid } from './eventRules';

describe('isEventDateValid', () => {
  it('retorna true quando starts_at é no futuro', () => {
    const now = new Date('2026-09-26T12:00:00Z');
    const startsAt = new Date('2026-10-01T12:00:00Z');
    expect(isEventDateValid(startsAt, now)).toBe(true);
  });

  it('retorna false quando starts_at já passou', () => {
    const now = new Date('2026-09-26T12:00:00Z');
    const startsAt = new Date('2026-09-20T12:00:00Z');
    expect(isEventDateValid(startsAt, now)).toBe(false);
  });

  it('retorna false quando starts_at é exatamente igual a agora (caso de limite)', () => {
    const now = new Date('2026-09-26T12:00:00Z');
    const startsAt = new Date('2026-09-26T12:00:00Z');
    expect(isEventDateValid(startsAt, now)).toBe(false);
  });

  it('retorna true quando starts_at é 1ms depois de agora (caso de limite)', () => {
    const now = new Date('2026-09-26T12:00:00.000Z');
    const startsAt = new Date('2026-09-26T12:00:00.001Z');
    expect(isEventDateValid(startsAt, now)).toBe(true);
  });
});