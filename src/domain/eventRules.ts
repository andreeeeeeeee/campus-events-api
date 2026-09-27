export function isEventDateValid(startsAt: Date, now: Date = new Date()): boolean {
  return startsAt.getTime() > now.getTime();
}