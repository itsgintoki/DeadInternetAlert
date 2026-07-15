import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicIp, normalizeHttpTarget } from '../utils/httpTarget.utils.js';

test('recognizes public and private IP addresses', () => {
  assert.equal(isPublicIp('8.8.8.8'), true);
  assert.equal(isPublicIp('127.0.0.1'), false);
  assert.equal(isPublicIp('10.0.0.1'), false);
  assert.equal(isPublicIp('169.254.169.254'), false);
  assert.equal(isPublicIp('::1'), false);
});

test('rejects unsafe URL protocols before making a request', async () => {
  await assert.rejects(normalizeHttpTarget('file:///etc/passwd'), { status: 400 });
  await assert.rejects(normalizeHttpTarget('http://127.0.0.1:8080'), { status: 400 });
});
