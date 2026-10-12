import { createHmac } from 'crypto';
import { bearerAuthorized, safeEqual, webhookTokenAuthorized } from './machine-auth';

// Mindbody signs the raw body: `X-Mindbody-Signature: sha256=` + base64(HMAC-SHA256).
// The key is `messageSignatureKey` from POST /subscriptions, returned only once.
// https://developers.mindbodyonline.com/WebhooksDocumentation

export function mindbodySignatureOk(
  rawBody: string,
  header: string | null,
  key: string | undefined,
): boolean {
  if (!key || !header) return false;
  const expected = `sha256=${createHmac('sha256', key).update(rawBody, 'utf8').digest('base64')}`;
  return safeEqual(header, expected);
}

export function webhookAuthorized(req: Request, rawBody: string): boolean {
  if (bearerAuthorized(req, ['MINDBODY_WEBHOOK_SECRET'])) return true;
  if (webhookTokenAuthorized(req)) return true;
  return mindbodySignatureOk(
    rawBody,
    req.headers.get('x-mindbody-signature'),
    process.env.MINDBODY_WEBHOOK_SIGNATURE_KEY,
  );
}
