/**
 * Shopify Admin API auth — Client Credentials Grant (server-side only)
 * ---------------------------------------------------------------------
 * Frontend never sees a secret or a token. This module:
 *   1. exchanges SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET for an access token
 *   2. caches it in memory for `expires_in` seconds (Shopify: 86399 = 24h)
 *   3. refreshes 5 minutes before expiry (timer + lazy check, single-flight)
 *   4. invalidates and re-auths once on a 401
 *
 * Token endpoint: POST https://{shop}.myshopify.com/admin/oauth/access_token
 *   grant_type=client_credentials&client_id=…&client_secret=…
 *
 * Storefront API is deliberately NOT handled here — it uses the read-only
 * public Storefront token (SHOPIFY_STOREFRONT_TOKEN) and never the admin one.
 */

export const ADMIN_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-07';
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const TOKEN_TIMEOUT_MS = 20_000;

export interface TokenStatus {
  configured: boolean;
  shop: string | null;
  cached: boolean;
  scope: string | null;
  expiresAt: string | null;
  expiresInSeconds: number | null;
  source: 'client_credentials' | 'static_env' | null;
  lastError: string | null;
  apiVersion: string;
}

function normShop(input?: string | null): string | null {
  if (!input) return null;
  let s = input.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!s) return null;
  if (!s.includes('.')) s = `${s}.myshopify.com`;
  return s;
}

/** Shopify answers OAuth failures with an HTML error page — pull the human line out. */
function extractOauthError(body: string): string {
  const oauth = body.match(/Oauth error ([a-z0-9_]+)/i);
  const detail = body.match(/<div class="content--desc">\s*([^<]+)</i);
  if (oauth && detail) return `${oauth[1]}: ${detail[1].trim()}`;
  if (oauth) return oauth[1];
  const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.slice(0, 300);
}

export class ShopifyTokenManager {

  private token: string | null = null;
  private expiresAt = 0;
  private scope: string | null = null;
  private source: TokenStatus['source'] = null;
  private lastError: string | null = null;
  private inflight: Promise<string> | null = null;
  private timer: NodeJS.Timeout | null = null;

  /** Env is read lazily: dotenv.config() in server.ts runs after module import. */
  private cfg() {
    return {
      shop: normShop(process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_SHOP),
      clientId: (process.env.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_API_KEY || '').trim(),
      clientSecret: (process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET || '').trim(),
      // Legacy escape hatch for local debugging only. Never exposed to the frontend.
      staticToken: (process.env.SHOPIFY_ACCESS_TOKEN || '').trim(),
    };
  }

  get shop(): string | null {
    return this.cfg().shop;
  }

  get configured(): boolean {
    const { shop, clientId, clientSecret, staticToken } = this.cfg();
    return Boolean(shop && ((clientId && clientSecret) || staticToken));
  }

  get usingStaticToken(): boolean {
    const { clientId, clientSecret, staticToken } = this.cfg();
    return !(clientId && clientSecret) && Boolean(staticToken);
  }

  status(): TokenStatus {
    return {
      configured: this.configured,
      shop: this.shop,
      cached: Boolean(this.token) && Date.now() < this.expiresAt,
      scope: this.scope,
      expiresAt: this.expiresAt ? new Date(this.expiresAt).toISOString() : null,
      expiresInSeconds: this.expiresAt ? Math.max(0, Math.round((this.expiresAt - Date.now()) / 1000)) : null,
      source: this.source,
      lastError: this.lastError,
      apiVersion: ADMIN_API_VERSION,
    };
  }

  invalidate(): void {
    this.token = null;
    this.expiresAt = 0;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleRefresh(): void {
    if (this.timer) clearTimeout(this.timer);
    const delay = Math.max(30_000, this.expiresAt - Date.now() - REFRESH_BUFFER_MS);
    this.timer = setTimeout(() => {
      this.getToken(true).catch((err) => {
        this.lastError = err?.message || String(err);
        console.warn('[shopify-auth] background refresh failed:', this.lastError);
      });
    }, delay);
    this.timer.unref?.();
  }

  async getToken(force = false): Promise<string> {
    if (!force && this.token && Date.now() < this.expiresAt - REFRESH_BUFFER_MS) {
      return this.token;
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.fetchToken()
      .then((token) => {
        this.inflight = null;
        return token;
      })
      .catch((err) => {
        this.inflight = null;
        throw err;
      });
    return this.inflight;
  }

  private async fetchToken(): Promise<string> {
    const { shop, clientId, clientSecret, staticToken } = this.cfg();
    if (!shop) throw new Error('SHOPIFY_SHOP_DOMAIN 未配置');
    if (!clientId || !clientSecret) {
      if (staticToken) {
        // Deprecated path: a manually issued shpat_ token, env-only.
        this.token = staticToken;
        this.expiresAt = Date.now() + 60 * 60 * 1000;
        this.source = 'static_env';
        this.scope = null;
        console.warn('[shopify-auth] SHOPIFY_ACCESS_TOKEN in use — migrate to client credentials grant');
        return this.token;
      }
      throw new Error('SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET 未配置，无法换取 Admin token');
    }

    const url = `https://${shop}/admin/oauth/access_token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);
    let res: globalThis.Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const raw = await res.text();
    if (!res.ok) {
      this.lastError = `token request ${res.status}: ${extractOauthError(raw)}`;
      this.token = null;
      this.expiresAt = 0;
      throw new Error(this.lastError);
    }

    let parsed: { access_token?: string; scope?: string; expires_in?: number };
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.lastError = `token response is not JSON: ${raw.slice(0, 200)}`;
      throw new Error(this.lastError);
    }
    if (!parsed.access_token) {
      this.lastError = `token response missing access_token: ${raw.slice(0, 200)}`;
      throw new Error(this.lastError);
    }

    this.token = parsed.access_token;
    this.scope = parsed.scope || null;
    this.expiresAt = Date.now() + (Number(parsed.expires_in) || 86_399) * 1000;
    this.source = 'client_credentials';
    this.lastError = null;
    this.scheduleRefresh();

    console.log(
      `[shopify-auth] admin token ok shop=${shop} scope="${this.scope}" ttl=${Math.round(
        (this.expiresAt - Date.now()) / 1000
      )}s`
    );
    return this.token;
  }
}

export const tokenManager = new ShopifyTokenManager();

/** Admin GraphQL call — token injected server-side, retried once on 401. */
export async function adminGraphql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!tokenManager.shop) throw new Error('SHOPIFY_SHOP_DOMAIN 未配置');
  const url = `https://${tokenManager.shop}/admin/api/${ADMIN_API_VERSION}/graphql.json`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await tokenManager.getToken();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    });

    if (res.status === 401 && attempt === 0) {
      tokenManager.invalidate();
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`Shopify GraphQL ${res.status}: ${text.slice(0, 400)}`);
    const json = JSON.parse(text);
    if (json.errors?.length) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors).slice(0, 400)}`);
    return json.data as T;
  }
  throw new Error('Shopify GraphQL: 401 after re-auth');
}

/** Admin REST call — same token handling. `path` is relative, e.g. "/products.json". */
export async function adminRest<T = any>(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | number> } = {}
): Promise<T> {
  if (!tokenManager.shop) throw new Error('SHOPIFY_SHOP_DOMAIN 未配置');
  const qs = init.query ? `?${new URLSearchParams(init.query as any).toString()}` : '';
  const url = `https://${tokenManager.shop}/admin/api/${ADMIN_API_VERSION}${path}${qs}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await tokenManager.getToken();
    const res = await fetch(url, {
      method: init.method || 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (res.status === 401 && attempt === 0) {
      tokenManager.invalidate();
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`Shopify REST ${res.status}: ${text.slice(0, 400)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }
  throw new Error('Shopify REST: 401 after re-auth');
}
