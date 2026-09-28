import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Express } from 'express';
import request from 'supertest';
import { getConfig } from '../config';
import { applyMigrations } from '../database/migrate';
import { getPool } from '../database/pool';
import { Queries, makeQueries } from '../database/queries';
import { makeApp } from '../app';
import { makeMiddleware } from '../middleware';
import pino from 'pino';

const logger = pino({ level: 'silent' });

describe('events router', () => {
  const config = getConfig('TEST_');
  let app: Express;
  let queries: Queries;

  beforeAll(async () => {
    await applyMigrations(config.databaseUrl, 'up');
    const middleware = makeMiddleware(logger);
    queries = makeQueries(config.databaseUrl);
    app = makeApp({ queries, middleware });
  });

  beforeEach(async () => {
    const pool = getPool(config.databaseUrl);
    await pool.query('DELETE FROM events');
  });

  afterAll(async () => {
    await applyMigrations(config.databaseUrl, 'down');
    await getPool(config.databaseUrl).end();
  });

  const validEvent = {
    title: 'Palestra de Extensão',
    starts_at: '2027-01-10T19:00:00Z',
    ends_at: '2027-01-10T21:00:00Z',
    room: 'Auditório 1',
    organizer: 'Coordenação de Extensão',
  };

  describe('POST /events', () => {
    it('cria o evento e retorna 201', async () => {
      const response = await request(app).post('/events').send(validEvent);
      expect(response.statusCode).toBe(201);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.body).toMatchObject({
        title: validEvent.title,
        room: validEvent.room,
        organizer: validEvent.organizer,
      });
      expect(response.body.id).toEqual(expect.any(Number));
    });

    it('responde 400 com corpo inválido', async () => {
      const bodyData = [
        { ...validEvent, title: '' },
        { ...validEvent, ends_at: '2027-01-10T18:00:00Z' }, // antes de starts_at
        { ...validEvent, starts_at: '2020-01-01T00:00:00Z' }, // regra de negócio: no passado
        {},
      ];

      for (const body of bodyData) {
        const response = await request(app).post('/events').send(body);
        expect(response.statusCode).toBe(400);
        expect(response.body).toEqual({
          status: 400,
          message: expect.any(String),
          name: expect.any(String),
        });
      }
    });

    it('persiste o evento no banco', async () => {
      const response = await request(app).post('/events').send(validEvent);
      expect(response.statusCode).toBe(201);

      const pool = getPool(config.databaseUrl);
      const { rows } = await pool.query('SELECT * FROM events WHERE id = $1', [response.body.id]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ title: validEvent.title, room: validEvent.room });
    });
  });
});