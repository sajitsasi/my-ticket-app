import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';

const app = createApp();

beforeAll(async () => {
  const res = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users');
  if (Number(res.rows[0]?.count ?? 0) < 3) {
    throw new Error(
      'Database is not seeded. Run `npm run db:reset` before running these tests.'
    );
  }
});

afterAll(async () => {
  await pool.end();
});

describe('GET /api/users', () => {
  it('returns 200 with array of 3 users with the documented shape', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(3);

    const expectedKeys = ['id', 'name', 'email', 'role'].sort();
    const ids = new Set<string>();
    const emails = new Set<string>();

    for (const user of res.body) {
      expect(Object.keys(user).sort()).toEqual(expectedKeys);
      expect(typeof user.id).toBe('string');
      expect(user.id.length).toBeGreaterThan(0);
      expect(typeof user.name).toBe('string');
      expect(user.name.length).toBeGreaterThan(0);
      expect(typeof user.email).toBe('string');
      expect(user.email).toContain('@');
      expect(['agent', 'requester']).toContain(user.role);
      ids.add(user.id);
      emails.add(user.email);
    }

    expect(ids.size).toBe(3);
    expect(emails.size).toBe(3);
  });

  it('does not leak password/secret/token-like keys', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(200);
    const sensitive = /password|secret|token|api[_-]?key/i;
    for (const user of res.body) {
      for (const key of Object.keys(user)) {
        expect(sensitive.test(key)).toBe(false);
      }
    }
  });

  it('returns the same body regardless of X-User-Id', async () => {
    const noHeader = await request(app).get('/api/users');
    const withHeader = await request(app)
      .get('/api/users')
      .set('X-User-Id', '11111111-1111-1111-1111-111111111111');
    expect(noHeader.status).toBe(200);
    expect(withHeader.status).toBe(200);
    expect(withHeader.body).toEqual(noHeader.body);
  });
});
