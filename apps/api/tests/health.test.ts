import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';

const app = createApp();

afterAll(async () => {
  await pool.end();
});

describe('GET /health', () => {
  it('returns 200 with JSON {status:"ok"} and no auth required', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('is independent of X-User-Id header', async () => {
    const noHeader = await request(app).get('/health');
    const withHeader = await request(app)
      .get('/health')
      .set('X-User-Id', '11111111-1111-1111-1111-111111111111');
    expect(noHeader.status).toBe(200);
    expect(withHeader.status).toBe(200);
    expect(noHeader.body).toEqual(withHeader.body);
  });
});

describe('404 handler', () => {
  it('returns JSON 404 for unknown API paths', async () => {
    const res = await request(app).get('/api/this-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
    expect(JSON.stringify(res.body)).not.toMatch(/\bat\s+\//);
  });
});
