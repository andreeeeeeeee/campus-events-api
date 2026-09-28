export interface RoomInterval {
  room: string;
  starts_at: Date;
  ends_at: Date;
}

export function findRoomConflict<T extends RoomInterval>(
  candidate: RoomInterval,
  existing: readonly T[],
): T | undefined {
  return existing.find(
    (event) =>
      event.room === candidate.room &&
      candidate.starts_at < event.ends_at &&
      event.starts_at < candidate.ends_at,
  );
}
