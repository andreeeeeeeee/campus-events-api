import { describe, expect, it } from 'vitest';
import { findRoomConflict, RoomInterval } from './roomSchedule';

const room = 'Auditório 1';

const interval = (startsAt: string, endsAt: string, eventRoom = room): RoomInterval => ({
  room: eventRoom,
  starts_at: new Date(startsAt),
  ends_at: new Date(endsAt),
});

describe('findRoomConflict', () => {
  it('allows a new event that starts when another event in the same room ends', () => {
    const existing = interval('2027-01-10T19:00:00.000Z', '2027-01-10T21:00:00.000Z');
    const candidate = interval('2027-01-10T21:00:00.000Z', '2027-01-10T22:00:00.000Z');

    const conflict = findRoomConflict(candidate, [existing]);

    expect(conflict).toBeUndefined();
  });

  it('allows overlapping times when the rooms are different', () => {
    const existing = interval('2027-01-10T19:00:00.000Z', '2027-01-10T21:00:00.000Z', 'Sala 2');
    const candidate = interval('2027-01-10T20:00:00.000Z', '2027-01-10T22:00:00.000Z', room);

    const conflict = findRoomConflict(candidate, [existing]);

    expect(conflict).toBeUndefined();
  });

  it('rejects a partial overlap in the same room', () => {
    const existing = interval('2027-01-10T19:00:00.000Z', '2027-01-10T21:00:00.000Z');
    const candidate = interval('2027-01-10T20:00:00.000Z', '2027-01-10T22:00:00.000Z');

    const conflict = findRoomConflict(candidate, [existing]);

    expect(conflict).toBe(existing);
  });

  it('rejects an event that starts one millisecond before another ends in the same room', () => {
    const existing = interval('2027-01-10T19:00:00.000Z', '2027-01-10T21:00:00.000Z');
    const candidate = interval('2027-01-10T20:59:59.999Z', '2027-01-10T22:00:00.000Z');

    const conflict = findRoomConflict(candidate, [existing]);

    expect(conflict).toBe(existing);
  });
});
