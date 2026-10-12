import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { bearerAuthorized, webhookTokenAuthorized } from './machine-auth';
import { mindbodySignatureOk } from './mindbody-signature';
import { createHmac } from 'crypto';

const ENV_KEYS = ['CRON_SECRET', 'SYNC_SECRET', 'MINDBODY_WEBHOOK_SECRET', 'MINDBODY_WEBHOOK_SIGNATURE_KEY'] as const;
const saved: Record<string, string | undefined> = {};

for (const key of ENV_KEYS) saved[key] = process.env[key];

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function clearSecrets() {
  for (const key of ENV_KEYS) delete process.env[key];
}

test('bearer auth fails closed when no secret is configured', () => {
  clearSecrets();
  const req = new Request('https://example.com/api/milestones/cron', {
    headers: { authorization: 'Bearer anything', 'x-vercel-cron': '1' },
  });
  assert.equal(bearerAuthorized(req), false);
});

test('bearer auth accepts CRON_SECRET and rejects the vercel cron header alone', () => {
  clearSecrets();
  process.env.CRON_SECRET = 'cron-secret-value';
  const ok = new Request('https://example.com/api/milestones/cron', {
    headers: { authorization: 'Bearer cron-secret-value' },
  });
  assert.equal(bearerAuthorized(ok), true);

  const spoofed = new Request('https://example.com/api/milestones/cron', {
    headers: { 'x-vercel-cron': '1' },
  });
  assert.equal(bearerAuthorized(spoofed), false);

  const wrong = new Request('https://example.com/api/milestones/cron', {
    headers: { authorization: 'Bearer cron-secret-valu' },
  });
  assert.equal(bearerAuthorized(wrong), false);
});

test('bearer auth accepts SYNC_SECRET for manual triggers', () => {
  clearSecrets();
  process.env.SYNC_SECRET = 'sync-secret-value';
  const req = new Request('https://example.com/api/mindbody/sync-refresh', {
    headers: { authorization: 'Bearer sync-secret-value' },
  });
  assert.equal(bearerAuthorized(req), true);
});

test('webhook token is not a cron bearer', () => {
  clearSecrets();
  process.env.MINDBODY_WEBHOOK_SECRET = 'hook-secret';
  const asBearer = new Request('https://example.com/api/milestones/cron', {
    headers: { authorization: 'Bearer hook-secret' },
  });
  assert.equal(bearerAuthorized(asBearer), false);
  assert.equal(bearerAuthorized(asBearer, ['MINDBODY_WEBHOOK_SECRET']), true);

  const asToken = new Request('https://example.com/api/mindbody/webhooks?token=hook-secret');
  assert.equal(webhookTokenAuthorized(asToken), true);
  const wrongToken = new Request('https://example.com/api/mindbody/webhooks?token=nope');
  assert.equal(webhookTokenAuthorized(wrongToken), false);
});

test('mindbody signature matches the documented sha256= base64 hmac', () => {
  const key = 'signature-key';
  const body = '{"eventId":"client.updated"}';
  const header = `sha256=${createHmac('sha256', key).update(body, 'utf8').digest('base64')}`;
  assert.equal(mindbodySignatureOk(body, header, key), true);
  assert.equal(mindbodySignatureOk(body, header, 'other-key'), false);
  assert.equal(mindbodySignatureOk(body, 'sha256=aaaa', key), false);
  assert.equal(mindbodySignatureOk(body, header, undefined), false);
});
