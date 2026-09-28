import { NextFunction, Request, Response } from 'express';
import { Event, EventInput } from '../database/types';
import { AppContext } from '../app';
import { isEventDateValid } from '../domain/eventRules';
import { findRoomConflict } from '../domain/roomSchedule';
import { HttpError } from '../errors';

export interface EventsController {
  addEvent(req: Request, res: Response<Event>, next: NextFunction): Promise<void>;
}

export const makeEventsController = ({ queries }: AppContext): EventsController => {
  return {
    addEvent: async (req, res) => {
      const event = EventInput.parse(req.body);

      if (!isEventDateValid(event.starts_at)) {
        throw new HttpError(400, 'starts_at deve ser no futuro');
      }

      const existing = await queries.listEventsByRoom(event.room);
      if (findRoomConflict(event, existing)) {
        throw new HttpError(409, 'já existe um evento nesta sala nesse horário');
      }

      const newEvent = await queries.addEvent(event);
      res.status(201).send(newEvent);
    },
  };
};