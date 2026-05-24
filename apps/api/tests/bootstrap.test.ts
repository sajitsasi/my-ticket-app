import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';

const app = createApp();

beforeAll(async () => {
  const res = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM users'
  );
  if (Number(res.rows[0]?.count ?? 0) < 3) {
    throw new Error(
      'Database is not seeded. Run `npm run db:reset` before running these tests.'
    );
  }
});

afterAll(async () => {
  await pool.end();
});

describe('GET /bootstrap', () => {
  it('returns 200 with users and defaultPersonaId without requiring X-User-Id', async () => {
    const res = await request(app).get('/bootstrap');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toHaveProperty('users');
    expect(res.body).toHaveProperty('defaultPersonaId');
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users).toHaveLength(3);

    const expectedKeys = ['id', 'name', 'email', 'role'].sort();
    for (const user of res.body.users) {
      expect(Object.keys(user).sort()).toEqual(expectedKeys);
      expect(typeof user.id).toBe('string');
      expect(user.id.length).toBeGreaterThan(0);
      expect(typeof user.name).toBe('string');
      expect(user.name.length).toBeGreaterThan(0);
      expect(typeof user.email).toBe('string');
      expect(user.email).toContain('@');
      expect(['agent', 'requester']).toContain(user.role);
    }

    expect(typeof res.body.defaultPersonaId).toBe('string');
    expect(res.body.defaultPersonaId).toBe(res.body.users[0].id);
    const userIds = res.body.users.map((u: { id: string }) => u.id);
    expect(userIds).toContain(res.body.defaultPersonaId);
  });

  it('does not depend on X-User-Id header (same body with or without)', async () => {
    const noHeader = await request(app).get('/bootstrap');
    const withHeader = await request(app)
      .get('/bootstrap')
      .set('X-User-Id', '11111111-1111-1111-1111-111111111111');
    expect(noHeader.status).toBe(200);
    expect(withHeader.status).toBe(200);
    expect(noHeader.body).toEqual(withHeader.body);
  });

  it('does not leak password/secret/token-like keys', async () => {
    const res = await request(app).get('/bootstrap');
    const sensitive = /password|secret|token|api[_-]?key/i;
    for (const user of res.body.users) {
      for (const key of Object.keys(user)) {
        expect(sensitive.test(key)).toBe(false);
      }
    }
  });

  it('lives outside the /api namespace', async () => {
    const apiRes = await request(app).get('/api/bootstrap');
    expect(apiRes.status).toBe(404);
  });
});
