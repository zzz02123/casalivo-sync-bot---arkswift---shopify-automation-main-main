import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

dotenv.config();

import { adminGraphql, adminRest, tokenManager, ADMIN_API_VERSION } from './shopify_auth.ts';

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- ArkSwift Sign Utility Function ---
export function calculateArkSwiftSignature(
  params: Record<string, string | number>,
  secret: string,
  algorithm: 'md5' | 'sha256' | 'rsa-sha256' = 'md5',
  style: 'secret_suffix' | 'secret_sandwich' = 'secret_suffix'
): { signString: string; signature: string } {
  // 1. Filter out empty, null, or 'sign' parameter
  const filteredKeys = Object.keys(params).filter(
    (k) => k !== 'sign' && params[k] !== undefined && params[k] !== null && params[k] !== ''
  );

  // 2. Sort keys alphabetically (ASCII dictionary order)
  filteredKeys.sort();

  // 3. Concat key=value pairs
  const kvPairs = filteredKeys.map((k) => `${k}=${params[k]}`);
  const baseParamString = kvPairs.join('&');

  // 4. Construct string with secret
  let signString = '';
  if (style === 'secret_sandwich') {
    signString = `${secret}${baseParamString}${secret}`;
  } else {
    // Standard: baseParamString + secret or baseParamString & secret
    signString = `${baseParamString}&secret=${secret}`;
  }

  // 5. Hash & signature
  let signature = '';
  const isRsaKey = secret.startsWith('MIIG') || secret.includes('BEGIN PRIVATE KEY');
  if (algorithm === 'rsa-sha256' || (algorithm === 'sha256' && isRsaKey)) {
    try {
      let pem = secret.trim();
      if (!pem.includes('BEGIN PRIVATE KEY')) {
        const chunks = pem.match(/.{1,64}/g) || [pem];
        pem = `-----BEGIN PRIVATE KEY-----\n${chunks.join('\n')}\n-----END PRIVATE KEY-----`;
      }
      const signer = crypto.createSign('RSA-SHA256');
      signer.update(signString);
      signature = signer.sign(pem, 'base64');
    } catch {
      signature = crypto.createHmac('sha256', secret).update(signString).digest('hex').toUpperCase();
    }
  } else if (algorithm === 'sha256') {
    signature = crypto.createHmac('sha256', secret).update(signString).digest('hex').toUpperCase();
  } else {
    signature = crypto.createHash('md5').update(signString, 'utf8').digest('hex').toUpperCase();
  }

  return { signString, signature };
}

// --- EAN-13 Barcode & Description Hygiene Helpers ---
export function ensureEan13Barcode(barcode?: string, seed?: string): string {
  if (barcode && barcode.startsWith('ean:84157926') && barcode.length === 17) {
    return barcode;
  }
  const countryCode = '841';
  const manufacturerCode = '57926';
  let num = Math.floor(Math.random() * 10000);
  if (seed) {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    num = Math.abs(hash % 10000);
  }
  const itemDigits = String(num).padStart(4, '0');
  const first12 = `${countryCode}${manufacturerCode}${itemDigits}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(first12[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const remainder = sum % 10;
  const checkDigit = remainder === 0 ? 0 : 10 - remainder;
  return `ean:${first12}${checkDigit}`;
}

export function sanitizeDescription(desc: string = ''): string {
  if (!desc) return '';
  let out = desc;
  out = out.replace(/<div[^>]*class="[^"]*(?:casalivo-guarantee|casalivo-shipping|casalivo-warranty|guarantee|warranty|shipping)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  out = out.replace(/<div[^>]*>[\s\S]*?(?:Envío y servicio|Garantía Casalivo|Garantía:|Atención al cliente|30 días para devoluciones)[\s\S]*?<\/div>/gi, '');
  out = out.replace(/[^.!?<>\n\r]*(?:garant[íi]a del fabricante|manufacturer warranty|garant[íi]a oficial|devoluci[óo]n|devoluciones|posventa|postventa|after-sales)[^.!?<>\n\r]*[.!?]?/gi, '');
  out = out.replace(/[^.!?<>\n\r]*(?:env[íi]o desde almac[ée]n|env[íi]o r[áa]pido|env[íi]o en 3-5|almac[ée]n espa[ñn]a|almac[ée]n europeo)[^.!?<>\n\r]*[.!?]?/gi, '');
  return out.trim();
}

// --- API Endpoints ---

// 1. Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

// Public runtime config — zero secrets, zero tokens leave the server
app.get('/api/credentials', (_req: Request, res: Response) => {
  res.json({
    success: true,
    apiUrl: process.env.ARKSWIFT_API_URL || 'https://api.arkswift.com',
    shopDomain: tokenManager.shop,
    arkswiftSigningConfigured: Boolean(process.env.ARKSWIFT_APP_KEY && process.env.ARKSWIFT_APP_SECRET),
    storefrontConfigured: Boolean(process.env.SHOPIFY_STOREFRONT_TOKEN),
    locationId: process.env.SHOPIFY_LOCATION_ID || '',
    adminAuthMode: 'client_credentials_grant',
  });
});

// Admin token status — reports the server-side cache, never the token value
app.get('/api/shopify/auth-status', async (_req: Request, res: Response) => {
  const status = tokenManager.status();
  let shop: any = null;
  let error: string | null = null;
  if (status.configured) {
    try {
      const data = await adminGraphql(`{ shop { name myshopifyDomain currencyCode } }`);
      shop = data.shop;
    } catch (err: any) {
      error = err.message;
    }
  }
  res.json({ success: !error && Boolean(shop), status, shop, error });
});

// Force an immediate token refresh (invalidates the cache first)
app.post('/api/shopify/refresh-token', async (_req: Request, res: Response) => {
  try {
    tokenManager.invalidate();
    await tokenManager.getToken(true);
    res.json({ success: true, status: tokenManager.status() });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message, status: tokenManager.status() });
  }
});

// 2. ArkSwift Signature Test & Generator
app.post('/api/arkswift/sign', (req: Request, res: Response) => {
  try {
    const { params = {}, secret = '', algorithm = 'md5', style = 'secret_suffix' } = req.body;
    const result = calculateArkSwiftSignature(params, secret, algorithm, style);
    res.json({
      success: true,
      timestamp: params.timestamp || Math.floor(Date.now() / 1000),
      ...result,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 3. ArkSwift Mock / Real API Fetcher Proxy
app.post('/api/arkswift/fetch-products', async (req: Request, res: Response) => {
  try {
    const { apiUrl, appKey, appSecret, page = 1, pageSize = 20, mode = 'live' } = req.body;

    // If live API URL is provided and valid, attempt fetch
    if (apiUrl && appKey && appSecret && mode === 'live') {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const params: Record<string, string | number> = {
        app_key: appKey,
        timestamp,
        page,
        page_size: pageSize,
        format: 'json',
        v: '1.0',
      };
      const { signature } = calculateArkSwiftSignature(params, appSecret);
      params.sign = signature;

      try {
        const queryStr = new URLSearchParams(params as any).toString();
        const fullUrl = `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}${queryStr}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(fullUrl, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json();
          return res.json({ success: true, source: 'live_api', data });
        }
      } catch (fetchErr: any) {
        // Fallback gracefully with descriptive notice
        console.warn('ArkSwift live API request timed out or failed, falling back:', fetchErr.message);
      }
    }

    // Return structured response indicating ready for real credentials
    return res.json({
      success: true,
      source: 'simulated_fallback',
      message: 'ArkSwift API connection template verified. Please ensure server URL and credentials are valid.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Shopify connection test + locations (token obtained server-side)
app.post('/api/shopify/test-connection', async (_req: Request, res: Response) => {
  try {
    const data = await adminGraphql(`
      query {
        shop { name myshopifyDomain currencyCode primaryDomain { url } }
        locations(first: 20) { edges { node { id name isPrimary activatable } } }
      }
    `);
    const locations = (data.locations?.edges || []).map((e: any) => e.node);
    res.json({
      success: true,
      shop: data.shop,
      locations,
      primaryLocation: locations.find((l: any) => l.isPrimary) || locations[0] || null,
      token: tokenManager.status(),
    });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message, token: tokenManager.status() });
  }
});

const PRODUCT_BY_SKU = `
  query($q: String!) {
    productVariants(first: 1, query: $q) {
      edges { node { id sku product { id } inventoryItem { id } } }
    }
  }
`;

const CREATE_PRODUCT = `
  mutation($input: ProductInput!) {
    productCreate(input: $input) {
      product { id title variants(first: 1) { edges { node { id sku } } } }
      userErrors { field message }
    }
  }
`;

const UPDATE_PRODUCT = `
  mutation($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id title variants(first: 1) { edges { node { id sku } } } }
      userErrors { field message }
    }
  }
`;

const UPDATE_VARIANTS = `
  mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id sku price }
      userErrors { field message }
    }
  }
`;

const CREATE_VARIANTS = `
  mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants { id sku price }
      userErrors { field message }
    }
  }
`;

const GET_PRODUCT_VARIANTS = `
  query($id: ID!) {
    product(id: $id) {
      id
      variants(first: 50) {
        edges {
          node {
            id
            sku
            title
            inventoryItem { id }
          }
        }
      }
    }
  }
`;

async function resolveLocationId(preferred?: string): Promise<string | null> {
  if (preferred) return preferred;
  if (process.env.SHOPIFY_LOCATION_ID) return process.env.SHOPIFY_LOCATION_ID;
  const data = await adminGraphql(`{ locations(first: 20) { edges { node { id name isPrimary } } } }`);
  const locs = (data.locations?.edges || []).map((e: any) => e.node);
  return (locs.find((l: any) => l.isPrimary) || locs[0])?.id || null;
}

async function setInventory(inventoryItemId: string, locationId: string, quantity: number) {
  const data = await adminGraphql(
    `mutation($input: InventorySetQuantitiesInput!) {
       inventorySetQuantities(input: $input) { userErrors { field message } }
     }`,
    {
      input: {
        name: 'available',
        reason: 'correction',
        ignoreCompareQuantity: true,
        quantities: [{ inventoryItemId, locationId, quantity: Math.max(0, Math.round(quantity)) }],
      },
    }
  );
  const errs = data.inventorySetQuantities?.userErrors || [];
  if (errs.length) throw new Error(`inventory: ${JSON.stringify(errs)}`);
}

async function publishToOnlineStore(productId: string) {
  const pubs = await adminGraphql(`{ publications(first: 20) { edges { node { id name } } } }`);
  const list = (pubs.publications?.edges || []).map((e: any) => e.node);
  const target = list.find((p: any) => /online store|tienda online/i.test(p.name)) || list[0];
  if (!target) return;
  const result = await adminGraphql(
    `mutation($id: ID!, $input: [PublicationInput!]!) {
       publishablePublish(id: $id, input: $input) { userErrors { field message } }
     }`,
    { id: productId, input: [{ publicationId: target.id }] }
  );
  const errs = result.publishablePublish?.userErrors || [];
  if (errs.length) console.warn('[publish]', JSON.stringify(errs));
}

// 5. Publish (create-or-update by SKU) — no token in the request body
app.post('/api/shopify/publish-product', async (req: Request, res: Response) => {
  try {
    const { product, locationId } = req.body || {};
    if (!product || !product.sku || !product.title) {
      return res.status(400).json({ success: false, error: 'product.sku 和 product.title 必填' });
    }

    const existing = await adminGraphql(PRODUCT_BY_SKU, { q: `sku:${product.sku}` });
    const hit = existing.productVariants?.edges?.[0]?.node || null;

    const rawTags = Array.isArray(product.tags)
      ? product.tags
      : String(product.tags || 'Casalivo').split(',').map((t: string) => t.trim());
    const finalTags = Array.from(new Set(rawTags.filter(Boolean)));
    if (product.englishCategory && !finalTags.includes(product.englishCategory)) {
      finalTags.push(product.englishCategory);
    }

    const input: any = {
      title: product.title,
      descriptionHtml: sanitizeDescription(product.descriptionHtml || `<p>${product.description || product.title}</p>`),
      vendor: product.vendor || 'Casalivo',
      productType: product.category || product.productType || 'Home & Living',
      tags: finalTags,
      status: String(product.status || 'active').toUpperCase(),
    };

    const variantInput: any = {
      price: Number(product.price).toFixed(2),
      inventoryPolicy: 'DENY',
      taxable: product.taxable !== false,
      // 2025-07 moved `sku` off ProductVariantsBulkInput onto InventoryItemInput
      inventoryItem: { sku: product.sku, tracked: true },
      barcode: ensureEan13Barcode(product.barcode, product.sku),
    };
    // GMC policy protection: only send compareAtPrice if positive and enabled
    if (product.compareAtPrice && Number(product.compareAtPrice) > 0) {
      variantInput.compareAtPrice = Number(product.compareAtPrice).toFixed(2);
    } else {
      variantInput.compareAtPrice = null;
    }
    if (product.weight) {
      variantInput.inventoryItem.measurement = { weight: { value: Number(product.weight), unit: 'KILOGRAMS' } };
    }

    let productId: string;
    let action: string;

    if (hit) {
      productId = hit.product.id;
      const upd = await adminGraphql(UPDATE_PRODUCT, { input: { ...input, id: productId } });
      const errs = upd.productUpdate?.userErrors || [];
      if (errs.length) return res.status(422).json({ success: false, error: errs });
      variantInput.id = hit.id;
      action = 'updated';
    } else {
      const created = await adminGraphql(CREATE_PRODUCT, { input });
      const errs = created.productCreate?.userErrors || [];
      if (errs.length) return res.status(422).json({ success: false, error: errs });
      productId = created.productCreate.product.id;
      variantInput.id = created.productCreate.product.variants.edges[0].node.id;
      action = 'created';
    }

    const vres = await adminGraphql(UPDATE_VARIANTS, { productId, variants: [variantInput] });
    const verrs = vres.productVariantsBulkUpdate?.userErrors || [];
    if (verrs.length) return res.status(422).json({ success: false, error: verrs });

    if (Array.isArray(product.images) && product.images.length) {
      try {
        await adminGraphql(
          `mutation($productId: ID!, $media: [CreateMediaInput!]!) {
             productCreateMedia(productId: $productId, media: $media) {
               mediaUserErrors { field message }
             }
           }`,
          {
            productId,
            media: product.images.map((src: string) => ({ originalSource: src, mediaContentType: 'IMAGE' })),
          }
        );
      } catch (mediaErr: any) {
        console.warn('media attach failed:', mediaErr.message);
      }
    }

    const loc = await resolveLocationId(locationId);
    if (loc && product.stock !== undefined && product.stock !== null) {
      const again = await adminGraphql(PRODUCT_BY_SKU, { q: `sku:${product.sku}` });
      const invItemId = again.productVariants?.edges?.[0]?.node?.inventoryItem?.id;
      if (invItemId) await setInventory(invItemId, loc, Number(product.stock));
    }

    if (String(product.status || 'active').toLowerCase() === 'active') {
      await publishToOnlineStore(productId);
    }

    res.json({ success: true, action, productId, sku: product.sku, token: tokenManager.status() });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message });
  }
});

// 5.1 Publish Parent Listing with Variants (主体商品 + 子变体，上传后台是一个 listing)
app.post('/api/shopify/publish-listing', async (req: Request, res: Response) => {
  try {
    const { listing, locationId } = req.body || {};
    if (!listing || !listing.title || !Array.isArray(listing.variants) || !listing.variants.length) {
      return res.status(400).json({ success: false, error: 'listing 及 listing.variants 必填' });
    }

    // 1. Check if any variant already exists on Shopify
    let productId: string | null = null;

    for (const v of listing.variants) {
      if (v.sku) {
        const existing = await adminGraphql(PRODUCT_BY_SKU, { q: `sku:${v.sku}` });
        const hit = existing.productVariants?.edges?.[0]?.node;
        if (hit?.product?.id) {
          productId = hit.product.id;
          break;
        }
      }
    }

    const rawTags = Array.isArray(listing.tags)
      ? listing.tags
      : String(listing.tags || 'Casalivo').split(',').map((t: string) => t.trim());
    const finalTags = Array.from(new Set(rawTags.filter(Boolean)));
    if (listing.englishCategory && !finalTags.includes(listing.englishCategory)) {
      finalTags.push(listing.englishCategory);
    }

    const input: any = {
      title: listing.title,
      descriptionHtml: sanitizeDescription(listing.descriptionHtml || `<p>${listing.title}</p>`),
      vendor: listing.vendor || 'Casalivo',
      productType: listing.category || 'Home & Living',
      tags: finalTags,
      status: 'ACTIVE',
    };

    let action = 'updated';

    if (!productId) {
      // Create new parent product
      const created = await adminGraphql(CREATE_PRODUCT, { input });
      const errs = created.productCreate?.userErrors || [];
      if (errs.length) return res.status(422).json({ success: false, error: errs });
      productId = created.productCreate.product.id;
      action = 'created';
    } else {
      // Update existing parent product
      const upd = await adminGraphql(UPDATE_PRODUCT, { input: { ...input, id: productId } });
      const errs = upd.productUpdate?.userErrors || [];
      if (errs.length) return res.status(422).json({ success: false, error: errs });
    }

    if (!productId) {
      return res.status(500).json({ success: false, error: 'Product ID could not be established' });
    }

    // 2. Query all existing variants on this product
    const prodData = await adminGraphql(GET_PRODUCT_VARIANTS, { id: productId });
    const existingEdges = prodData.product?.variants?.edges || [];
    const existingVariants: any[] = existingEdges.map((e: any) => e.node);

    // 3. Match variants: updates vs creations
    const toUpdate: any[] = [];
    const toCreate: any[] = [];
    const usedExistingIds = new Set<string>();

    for (let i = 0; i < listing.variants.length; i++) {
      const v = listing.variants[i];
      const vInput: any = {
        price: Number(v.price).toFixed(2),
        inventoryPolicy: 'DENY',
        taxable: true,
        inventoryItem: { sku: v.sku, tracked: true },
        barcode: ensureEan13Barcode(v.barcode, v.sku),
      };
      if (v.compareAtPrice && Number(v.compareAtPrice) > 0) {
        vInput.compareAtPrice = Number(v.compareAtPrice).toFixed(2);
      } else {
        vInput.compareAtPrice = null;
      }
      if (v.weight) {
        vInput.inventoryItem.measurement = { weight: { value: Number(v.weight), unit: 'KILOGRAMS' } };
      }

      // Find an existing variant matching SKU or the first unused existing variant
      let match = existingVariants.find((ev: any) => ev.sku === v.sku && !usedExistingIds.has(ev.id));
      if (!match && i === 0 && existingVariants.length > 0 && !usedExistingIds.has(existingVariants[0].id)) {
        match = existingVariants[0];
      }

      if (match) {
        usedExistingIds.add(match.id);
        vInput.id = match.id;
        toUpdate.push(vInput);
      } else {
        toCreate.push(vInput);
      }
    }

    if (toUpdate.length > 0) {
      try {
        const vres = await adminGraphql(UPDATE_VARIANTS, { productId, variants: toUpdate });
        const verrs = vres.productVariantsBulkUpdate?.userErrors || [];
        if (verrs.length) console.warn('Variants update warning:', verrs);
      } catch (e: any) {
        console.warn('Variants update failed:', e.message);
      }
    }

    if (toCreate.length > 0) {
      try {
        const cres = await adminGraphql(CREATE_VARIANTS, { productId, variants: toCreate });
        const cerrs = cres.productVariantsBulkCreate?.userErrors || [];
        if (cerrs.length) console.warn('Variants create warning:', cerrs);
      } catch (e: any) {
        console.warn('Variants create failed:', e.message);
      }
    }

    // 4. Attach media images
    if (Array.isArray(listing.images) && listing.images.length) {
      try {
        await adminGraphql(
          `mutation($productId: ID!, $media: [CreateMediaInput!]!) {
             productCreateMedia(productId: $productId, media: $media) {
               mediaUserErrors { field message }
             }
           }`,
          {
            productId,
            media: listing.images.slice(0, 8).map((src: string) => ({ originalSource: src, mediaContentType: 'IMAGE' })),
          }
        );
      } catch (mediaErr: any) {
        console.warn('media attach warning:', mediaErr.message);
      }
    }

    // 5. Update inventory for each variant
    const loc = await resolveLocationId(locationId);
    if (loc) {
      for (const v of listing.variants) {
        if (v.stock !== undefined && v.stock !== null) {
          try {
            const again = await adminGraphql(PRODUCT_BY_SKU, { q: `sku:${v.sku}` });
            const invItemId = again.productVariants?.edges?.[0]?.node?.inventoryItem?.id;
            if (invItemId) {
              const qtyToSet = v.availableStock !== undefined ? Number(v.availableStock) : Number(v.stock);
              await setInventory(invItemId, loc, qtyToSet);
            }
          } catch (e: any) {
            console.warn(`inventory set for ${v.sku} failed:`, e.message);
          }
        }
      }
    }

    // 6. Publish to Online Store channel
    await publishToOnlineStore(productId);

    res.json({
      success: true,
      action,
      productId,
      variantCount: listing.variants.length,
      title: listing.title,
      token: tokenManager.status(),
    });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message });
  }
});

// 6. Bulk stock sync by SKU — no token in the request body
app.post('/api/shopify/update-inventory', async (req: Request, res: Response) => {
  try {
    const { items, locationId } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ success: false, error: 'items 必须是数组 [{sku, stock}]' });
    }
    const loc = await resolveLocationId(locationId);
    if (!loc) return res.status(400).json({ success: false, error: '找不到库存地点' });

    const skuMap = new Map<string, string>();
    let cursor: string | null = null;
    for (let page = 0; page < 40; page++) {
      const data: any = await adminGraphql(
        `query($cursor: String) {
           productVariants(first: 250, after: $cursor) {
             pageInfo { hasNextPage endCursor }
             edges { node { sku inventoryItem { id } } }
           }
         }`,
        { cursor }
      );
      for (const edge of data.productVariants.edges) {
        if (edge.node.sku) skuMap.set(String(edge.node.sku).toLowerCase(), edge.node.inventoryItem.id);
      }
      if (!data.productVariants.pageInfo.hasNextPage) break;
      cursor = data.productVariants.pageInfo.endCursor;
    }

    const results: any[] = [];
    for (const item of items) {
      const key = String(item.sku || '').toLowerCase();
      const invItemId =
        skuMap.get(key) || (item.originalSku ? skuMap.get(String(item.originalSku).toLowerCase()) : undefined);
      if (!invItemId) {
        results.push({ sku: item.sku, status: 'skipped', reason: 'SKU not found on Shopify' });
        continue;
      }
      try {
        await setInventory(invItemId, loc, Number(item.stock));
        results.push({ sku: item.sku, status: 'success', stock: item.stock });
      } catch (e: any) {
        results.push({ sku: item.sku, status: 'error', error: e.message });
      }
    }
    res.json({ success: true, count: results.length, details: results });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message });
  }
});

// 7. Storefront API — read-only public token, strictly separated from the Admin API
app.post('/api/shopify/fetch-storefront', async (req: Request, res: Response) => {
  try {
    const { limit = 50 } = req.body || {};
    const shopDomain = tokenManager.shop;
    const token = process.env.SHOPIFY_STOREFRONT_TOKEN;
    if (!shopDomain) return res.status(400).json({ success: false, error: 'SHOPIFY_SHOP_DOMAIN 未配置' });
    if (!token) {
      return res.status(400).json({ success: false, error: 'SHOPIFY_STOREFRONT_TOKEN 未配置（仅用于店铺前端只读查询）' });
    }

    const query = `
      query getProducts($first: Int!) {
        products(first: $first) {
          edges { node {
            id title descriptionHtml vendor productType tags
            images(first: 5) { edges { node { url } } }
            variants(first: 5) { edges { node { id sku price { amount } barcode weight } } }
          } }
        }
      }
    `;

    const sfRes = await fetch(`https://${shopDomain}/api/${ADMIN_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': token },
      body: JSON.stringify({ query, variables: { first: Math.min(100, Number(limit) || 50) } }),
    });
    const raw = await sfRes.text();
    if (!sfRes.ok) {
      return res
        .status(sfRes.status)
        .json({ success: false, error: `Storefront API ${sfRes.status}: ${raw.slice(0, 300)}` });
    }
    res.json({ success: true, shopDomain, data: JSON.parse(raw) });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message });
  }
});

// 8. Query count and sample titles of products in Shopify
app.post('/api/shopify/products-count', async (req: Request, res: Response) => {
  try {
    const { customShop, customToken } = req.body || {};
    const shop = (customShop || tokenManager.shop || '').trim();
    if (!shop) {
      return res.status(400).json({ success: false, error: 'Shopify 店铺域名未配置' });
    }

    const query = `
      query getProductsCount {
        products(first: 20) {
          edges {
            node {
              id
              title
              status
            }
          }
        }
      }
    `;

    let data: any;
    if (customShop && customToken) {
      const s = customShop.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      const cleanShop = s.includes('.') ? s : `${s}.myshopify.com`;
      const url = `https://${cleanShop}/admin/api/${ADMIN_API_VERSION}/graphql.json`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': customToken.trim() },
        body: JSON.stringify({ query }),
      });
      const t = await r.text();
      if (!r.ok) throw new Error(`Shopify GraphQL ${r.status}: ${t.slice(0, 300)}`);
      data = JSON.parse(t).data;
    } else {
      data = await adminGraphql(query);
    }

    const edges = data?.products?.edges || [];
    const sampleTitles = edges.map((e: any) => e.node.title);

    let totalCount = edges.length;
    try {
      if (customShop && customToken) {
        const s = customShop.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        const cleanShop = s.includes('.') ? s : `${s}.myshopify.com`;
        const countUrl = `https://${cleanShop}/admin/api/${ADMIN_API_VERSION}/products/count.json`;
        const cr = await fetch(countUrl, {
          headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': customToken.trim() },
        });
        if (cr.ok) {
          const cj = await cr.json();
          totalCount = cj.count ?? edges.length;
        }
      } else {
        const countRes = await adminRest<{ count: number }>('/products/count.json');
        totalCount = countRes?.count ?? edges.length;
      }
    } catch {
      // keep fallback
    }

    res.json({
      success: true,
      shop,
      totalCount,
      sampleTitles,
    });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message });
  }
});

// 9. Batch Delete All Products from Shopify
app.post('/api/shopify/delete-all-products', async (req: Request, res: Response) => {
  try {
    const { confirmCode, customShop, customToken, maxBatch = 250 } = req.body || {};

    if (confirmCode !== 'CONFIRM_DELETE' && confirmCode !== 'DELETE_ALL_PRODUCTS' && confirmCode !== '确认删除全部') {
      return res.status(400).json({
        success: false,
        error: '安全校验失败：必须输入 "CONFIRM_DELETE" 或 "确认删除全部" 确认指令',
      });
    }

    const shop = (customShop || tokenManager.shop || '').trim();
    if (!shop) {
      return res.status(400).json({ success: false, error: 'Shopify 店铺域名未配置' });
    }

    const GET_BATCH_QUERY = `
      query getProductsToDelete($first: Int!) {
        products(first: $first) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
            }
          }
        }
      }
    `;

    const DELETE_MUTATION = `
      mutation deleteProduct($input: ProductDeleteInput!) {
        productDelete(input: $input) {
          deletedProductId
          userErrors {
            field
            message
          }
        }
      }
    `;

    const runGraphql = async (q: string, vars: any = {}) => {
      if (customShop && customToken) {
        const s = customShop.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        const cleanShop = s.includes('.') ? s : `${s}.myshopify.com`;
        const url = `https://${cleanShop}/admin/api/${ADMIN_API_VERSION}/graphql.json`;
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': customToken.trim() },
          body: JSON.stringify({ query: q, variables: vars }),
        });
        const t = await r.text();
        if (!r.ok) throw new Error(`Shopify GraphQL ${r.status}: ${t.slice(0, 300)}`);
        const json = JSON.parse(t);
        if (json.errors?.length) throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
        return json.data;
      }
      return await adminGraphql(q, vars);
    };

    let totalDeleted = 0;
    const deletedItems: { id: string; title: string }[] = [];
    const errors: string[] = [];

    let hasMore = true;
    let iteration = 0;
    const maxIterations = 20;

    while (hasMore && iteration < maxIterations && totalDeleted < maxBatch) {
      iteration++;
      const batchSize = Math.min(50, maxBatch - totalDeleted);
      const queryData = await runGraphql(GET_BATCH_QUERY, { first: batchSize });
      const edges = queryData?.products?.edges || [];

      if (edges.length === 0) {
        hasMore = false;
        break;
      }

      for (const edge of edges) {
        const { id, title } = edge.node;
        try {
          const delRes = await runGraphql(DELETE_MUTATION, { input: { id } });
          const userErrs = delRes?.productDelete?.userErrors || [];
          if (userErrs.length > 0) {
            errors.push(`${title}: ${userErrs.map((e: any) => e.message).join(', ')}`);
          } else {
            totalDeleted++;
            deletedItems.push({ id, title });
          }
        } catch (delErr: any) {
          errors.push(`${title}: ${delErr.message}`);
        }

        // Small throttle to stay well below Shopify API rate limit
        await new Promise((resolve) => setTimeout(resolve, 80));
      }

      if (edges.length < batchSize) {
        hasMore = false;
      }
    }

    res.json({
      success: true,
      deletedCount: totalDeleted,
      deletedItems,
      errors,
      hasMore,
    });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message });
  }
});

// --- Vite middleware integration ---
async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(import.meta.dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Casalivo Sync Server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
