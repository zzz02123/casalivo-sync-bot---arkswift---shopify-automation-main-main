/**
 * Smoke test for ShopifyTokenManager: caching, TTL math, refresh buffer, invalidate.
 * Run: ./node_modules/.bin/tsx scripts/test_token_manager.ts
 */
process.env.SHOPIFY_SHOP_DOMAIN = 'td5kxa-2d.myshopify.com';
process.env.SHOPIFY_CLIENT_ID = 'test_client_id';
process.env.SHOPIFY_CLIENT_SECRET = 'test_client_secret';
delete process.env.SHOPIFY_ACCESS_TOKEN;

let calls = 0;
const realFetch = globalThis.fetch;
(globalThis as any).fetch = async (_url: string, init: any) => {
  calls += 1;
  const body = new URLSearchParams(init.body.toString());
  if (body.get('grant_type') !== 'client_credentials') throw new Error('wrong grant_type');
  if (body.get('client_id') !== 'test_client_id') throw new Error('wrong client_id');
  return new Response(JSON.stringify({ access_token: `tok_${calls}`, scope: 'write_products,read_products', expires_in: 86399 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

const { ShopifyTokenManager } = await import('../shopify_auth.ts');
const tm = new ShopifyTokenManager();

const assert = (cond: any, msg: string) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ok  ${msg}`);
};

const t1 = await tm.getToken();
assert(t1 === 'tok_1', 'first call exchanges credentials');
const t2 = await tm.getToken();
assert(t2 === 'tok_1' && calls === 1, 'second call served from cache (no new request)');

const st = tm.status();
const ttl = st.expiresInSeconds ?? 0;
assert(ttl > 86_000 && ttl <= 86_399, `ttl cached correctly (${ttl}s)`);
assert(st.source === 'client_credentials' && st.scope?.includes('write_products'), 'source + scope recorded');
assert(!JSON.stringify(st).includes('tok_1'), 'status never leaks the token value');

tm.invalidate();
const t3 = await tm.getToken();
assert(t3 === 'tok_2' && calls === 2, 'invalidate() forces a new exchange');

// expired token -> automatic re-exchange on next call
(tm as any).expiresAt = Date.now() - 1000;
const t4 = await tm.getToken();
assert(t4 === 'tok_3' && calls === 3, 'expired token auto-refreshes');

// 400 from Shopify surfaces as a readable error
(globalThis as any).fetch = async () =>
  new Response('{"error":"application_cannot_be_found","error_description":"Could not find Shopify API application"}', {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
tm.invalidate();
(globalThis as any).fetch = async () =>
  new Response('{"error":"application_cannot_be_found","error_description":"Could not find Shopify API application"}', {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
let surfaced = '';
try {
  await tm.getToken(true);
} catch (err: any) {
  surfaced = err.message;
}
assert(surfaced.includes('application_cannot_be_found'), 'oauth error is surfaced verbatim');

(globalThis as any).fetch = realFetch;
console.log('\nALL PASS');
