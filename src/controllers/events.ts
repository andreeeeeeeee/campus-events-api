import { NextFunction, Request, Response } from 'express';
import { Event, EventInput } from '../database/types';
import { AppContext } from '../app';

export interface EventsController {
  addEvent(req: Request, res: Response<Event>, next: NextFunction): Promise<void>;
}

export const makeEventsController = ({ queries }: AppContext): EventsController => {
  return {
    addEvent: async (req, res) => {
      const event = EventInput.parse(req.body);
      const newEvent = await queries.addEvent(event);
      res.status(201).send(newEvent);
    },
  };
};
