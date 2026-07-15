import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticate } from '../middlewares/auth.middlewares.js';
import { loginSchema } from '../validations/auth.validations.js';

test('authentication does not accept tokens from query strings', () => {
  let received;
  authenticate({ headers: {}, query: { token: 'leaked-token' } }, {}, (error) => { received = error; });
  assert.equal(received.status, 401);
  assert.equal(received.message, 'No token provided');
});

test('login input normalizes email addresses', () => {
  const result = loginSchema.parse({ email: 'USER@Example.COM ', password: 'correct-horse-battery-staple' });
  assert.equal(result.email, 'user@example.com');
});
