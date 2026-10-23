export interface ArkSwiftRawItem {
  id: string;
  originalSku: string;
  originalTitle: string;
  originalVendor: string;
  originalPrice: number; // Combined base cost in EUR (list price + ES shipping fee)
  listPrice?: number; // Raw Aosom list price in EUR
  esShippingFee?: number; // Raw Aosom ES shipping fee in EUR
  stock: number;
  category: string;
  barcode?: string;
  images: string[];
  description?: string;
  weight?: number; // in kg
  dimensions?: string;
  mainColor?: string;
  englishCategory?: string;
  features?: string;
  selected?: boolean;
}

export interface CleansedProduct {
  id: string;
  sku: string; // e.g. CSL-01-0340
  originalSku: string;
  title: string;
  originalTitle: string;
  vendor: string; // 'Casalivo'
  originalVendor: string;
  costPrice: number; // Combined base cost (list price + ES shipping fee) in EUR
  listPrice?: number; // Raw Aosom list price in EUR
  esShippingFee?: number; // Raw Aosom ES shipping fee in EUR
  price: number; // Selling price in EUR
  compareAtPrice: number; // Strikethrough MSRP (0 if disabled)
  profitMargin: number; // Percentage, e.g. 52.3%
  profitAmount: number; // in EUR
  stock: number;
  availableStock: number; // after safety buffer
  images: string[];
  category: string; // Product type / category
  englishCategory?: string; // Aosom 3rd-level category (e.g. Greenhouse, Nightstands)
  shopifyCategory?: string; // Auto-mapped Shopify 1-2 level category, e.g. Home & Garden > Lawn & Garden
  googleProductCategory?: string; // Auto-mapped Google Shopping category for GMC
  mainColor?: string;
  dimensions?: string;
  barcode?: string; // 13-digit EAN barcode with 'ean:' prefix (e.g. ean:8415792615295)
  tags: string[];
  descriptionHtml: string;
  status: 'active' | 'draft';
  syncStatus: 'idle' | 'pending' | 'success' | 'failed';
  lastSyncAt?: string;
  shopifyId?: string;
  errorMessage?: string;
}

export interface GroupedProductVariant {
  id: string;
  sku: string;
  originalSku: string;
  optionName: string; // e.g. "Tamaño / Medidas" or "Color"
  optionValue: string; // e.g. "81x26x34,5 cm"
  price: number;
  compareAtPrice: number;
  stock: number;
  availableStock: number;
  costPrice: number;
  listPrice?: number;
  esShippingFee?: number;
  weight?: number;
  barcode?: string;
  image: string;
}

export interface GroupedProductListing {
  id: string;
  handle: string;
  vendor: string;
  title: string; // SEO-optimized unified Spanish title
  originalBaseTitle: string;
  category: string;
  englishCategory: string; // Aosom 3rd-level category (e.g. Greenhouse, Camping & Hiking)
  shopifyCategory: string; // Standard 1-2 level category, never blank
  googleProductCategory: string;
  tags: string[];
  optionName: string; // e.g. "Tamaño / Medidas" or "Color"
  variants: GroupedProductVariant[];
  priceMin: number;
  priceMax: number;
  totalStock: number;
  totalAvailableStock: number;
  images: string[];
  descriptionHtml: string; // SEO-optimized description with comparison matrix table
  seoTitle: string;
  seoDescription: string;
  syncStatus: 'idle' | 'pending' | 'success' | 'failed';
  shopifyId?: string;
}

export interface PricingTier {
  id: string;
  name: string;
  minCost: number;
  maxCost: number;
  multiplier: number; // e.g. 2.5
  flatFee: number; // e.g. 0
}

export interface PricingConfig {
  tiers: PricingTier[];
  rounding: '99' | '95' | 'integer' | 'none';
  enableCompareAtPrice: boolean; // 是否启用划线吊牌价 (GMC 审核建议关闭，防止被判定虚假促销)
  compareAtMultiplier: number; // e.g. 1.35x
  shippingFee: number;
  taxRatePercent: number; // e.g. 0 or 21%
}

export interface WordReplacement {
  id: string;
  from: string;
  to: string;
  isRegex?: boolean;
}

export interface WhitewashConfig {
  brandName: string; // 'Casalivo'
  skuPrefix: string; // 'CSL-'
  vendorBlacklist: string[]; // e.g. ['SPANISH AOSOM SL', 'Aosom', 'Homcom', 'Outsunny']
  wordReplacements: WordReplacement[];
  bannedKeywords: string[]; // e.g. ['warranty', 'official dealer', 'Aosom.es']
  safetyStockBuffer: number; // e.g. 3 (if stock < 3, mark as 0)
  autoTags: string[]; // ['Casalivo', 'Dropship', 'Fast Delivery']
  defaultCategory: string;
}

export interface ShopifyConfig {
  shopDomain: string; // e.g. td5kxa-2d.myshopify.com
  /** @deprecated token 只存在于服务端内存 (Client Credentials Grant)，前端永不保存 */
  accessToken?: string;
  apiVersion: string;
  locationId: string;
  locationName: string;
  isConnected: boolean;
}

export interface ArkSwiftConfig {
  apiUrl: string;
  appKey: string;
  appSecret: string;
  sellerId: string;
  algorithm: 'md5' | 'sha256' | 'rsa-sha256';
  signStyle: 'secret_suffix' | 'secret_sandwich';
  isConnected: boolean;
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  category: 'arkswift' | 'whitewash' | 'shopify' | 'system';
  message: string;
  details?: any;
}
