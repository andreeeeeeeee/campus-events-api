import { z } from 'zod/v4';

export const Person = z.object({
  name: z.string().trim().min(1),
  age: z.number().positive().max(150),
});
export type Person = z.infer<typeof Person>;

const EventBase = z.object({
  title: z.string().trim().min(1).max(255),
  starts_at: z.coerce.date(),
  ends_at: z.coerce.date(),
  room: z.string().trim().min(1).max(255),
  organizer: z.string().trim().min(1).max(255),
});

export const EventInput = EventBase.refine((event) => event.ends_at > event.starts_at, {
  message: 'ends_at must be after starts_at',
  path: ['ends_at'],
});
export type EventInput = z.infer<typeof EventInput>;

export const Event = EventBase.extend({
  id: z.number().int().positive(),
  created_at: z.coerce.date(),
});
export type Event = z.infer<typeof Event>;
