import { Router } from 'express';
import { makeEventsController } from '../controllers/events';
import { AppContext } from '../app';

export const makeEventsRoutes = (ctx: AppContext): Router => {
  const router = Router();
  const controller = makeEventsController(ctx);

  router.post('/', controller.addEvent);

  return router;
};
