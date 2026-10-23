import { ArkSwiftRawItem, CleansedProduct, PricingConfig, WhitewashConfig } from '../types';

export const DEFAULT_WHITEWASH_CONFIG: WhitewashConfig = {
  brandName: 'Casalivo',
  skuPrefix: 'CSL-',
  vendorBlacklist: [
    'SPANISH AOSOM SL',
    'AOSOM',
    'Aosom',
    'HOMCOM',
    'Homcom',
    'OUTSUNNY',
    'Outsunny',
    'PAWHUT',
    'PawHut',
    'VINSETTO',
    'Vinsetto',
    'SOBUY',
    'SoBuy',
    'COSTWAY',
    'Costway',
    'KLEANKIN',
    'Kleankin',
    'DURHAND',
    'Durhand',
  ],
  bannedKeywords: [
    'Aosom',
    'Homcom',
    'Outsunny',
    'Pawhut',
    'Vinsetto',
    'SoBuy',
    'official store',
    'distributor warranty',
    'manufacturer warranty',
    'garantía del fabricante',
    'tienda oficial',
    'distribuidor oficial',
    'Aosom.es',
    'aosom.es',
    'www.aosom',
    'spanish warehouse',
    'almacén españa',
  ],
  wordReplacements: [
    { id: '1', from: 'HOMCOM', to: 'Casalivo' },
    { id: '2', from: 'Homcom', to: 'Casalivo' },
    { id: '3', from: 'OUTSUNNY', to: 'Casalivo' },
    { id: '4', from: 'Outsunny', to: 'Casalivo' },
    { id: '5', from: 'PAWHUT', to: 'Casalivo Pets' },
    { id: '6', from: 'PawHut', to: 'Casalivo Pets' },
    { id: '7', from: 'VINSETTO', to: 'Casalivo Office' },
    { id: '8', from: 'Vinsetto', to: 'Casalivo Office' },
    { id: '9', from: 'AOSOM', to: 'Casalivo' },
    { id: '10', from: 'Aosom', to: 'Casalivo' },
  ],
  safetyStockBuffer: 3,
  autoTags: ['Casalivo', 'HomeLiving', 'FreeShipping', 'VerifiedStock'],
  defaultCategory: 'Home & Living',
};

export interface TaxonomyMapping {
  englishCategory: string;
  shopifyCategory: string; // Level 1-2 or full taxonomy path
  topLevelCategory: string; // Level 1-2
  googleProductCategory: string;
  spanishType: string;
}

export const AOSOM_TAXONOMY_MAP: Record<string, TaxonomyMapping> = {
  greenhouse: {
    englishCategory: 'Greenhouse',
    shopifyCategory: 'Home & Garden > Lawn & Garden > Gardening > Greenhouses',
    topLevelCategory: 'Home & Garden > Lawn & Garden',
    googleProductCategory: 'Home & Garden > Lawn & Garden > Gardening > Greenhouses',
    spanishType: 'Invernaderos y Jardín',
  },
  nightstands: {
    englishCategory: 'Nightstands',
    shopifyCategory: 'Furniture > Tables > Nightstands',
    topLevelCategory: 'Furniture > Tables',
    googleProductCategory: 'Furniture > Tables > Nightstands',
    spanishType: 'Mesitas de Noche',
  },
  'other outdoor furniture': {
    englishCategory: 'Other Outdoor Furniture',
    shopifyCategory: 'Furniture > Outdoor Furniture',
    topLevelCategory: 'Furniture > Outdoor Furniture',
    googleProductCategory: 'Furniture > Outdoor Furniture',
    spanishType: 'Muebles de Exterior',
  },
  'storage trolleys': {
    englishCategory: 'Storage Trolleys',
    shopifyCategory: 'Furniture > Carts & Islands > Carts > Kitchen Carts',
    topLevelCategory: 'Furniture > Carts & Islands',
    googleProductCategory: 'Furniture > Carts & Islands > Carts > Kitchen Carts',
    spanishType: 'Carritos de Almacenaje',
  },
  'trash cans': {
    englishCategory: 'Trash Cans',
    shopifyCategory: 'Home & Garden > Household Supplies > Waste Containment > Trash Cans & Wastebaskets',
    topLevelCategory: 'Home & Garden > Household Supplies',
    googleProductCategory: 'Home & Garden > Household Supplies > Waste Containment > Trash Cans & Wastebaskets',
    spanishType: 'Cubos de Basura',
  },
  'sofa beds & chaise lounges': {
    englishCategory: 'Sofa Beds & Chaise Lounges',
    shopifyCategory: 'Furniture > Sofas > Sofa Beds',
    topLevelCategory: 'Furniture > Sofas',
    googleProductCategory: 'Furniture > Sofas > Sofa Beds',
    spanishType: 'Sofás y Chaise Longues',
  },
  'storage cabinets': {
    englishCategory: 'Storage Cabinets',
    shopifyCategory: 'Furniture > Cabinets & Storage > Storage Cabinets & Lockers',
    topLevelCategory: 'Furniture > Cabinets & Storage',
    googleProductCategory: 'Furniture > Cabinets & Storage > Storage Cabinets & Lockers',
    spanishType: 'Armarios y Muebles Auxiliares',
  },
  awnings: {
    englishCategory: 'Awnings',
    shopifyCategory: 'Home & Garden > Lawn & Garden > Outdoor Living > Awnings',
    topLevelCategory: 'Home & Garden > Lawn & Garden',
    googleProductCategory: 'Home & Garden > Lawn & Garden > Outdoor Living > Awnings',
    spanishType: 'Toldos y Pérgolas',
  },
  'garden furniture sets': {
    englishCategory: 'Garden Furniture Sets',
    shopifyCategory: 'Furniture > Outdoor Furniture > Outdoor Furniture Sets',
    topLevelCategory: 'Furniture > Outdoor Furniture',
    googleProductCategory: 'Furniture > Outdoor Furniture > Outdoor Furniture Sets',
    spanishType: 'Conjuntos de Muebles de Jardín',
  },
  'sun loungers': {
    englishCategory: 'Sun Loungers',
    shopifyCategory: 'Furniture > Outdoor Furniture > Outdoor Seating > Sunloungers',
    topLevelCategory: 'Furniture > Outdoor Furniture',
    googleProductCategory: 'Furniture > Outdoor Furniture > Outdoor Seating > Sunloungers',
    spanishType: 'Tumbonas de Jardín',
  },
  'parasol umbrellas & accessories': {
    englishCategory: 'Parasol Umbrellas & Accessories',
    shopifyCategory: 'Home & Garden > Lawn & Garden > Outdoor Living > Outdoor Umbrellas & Sunshades',
    topLevelCategory: 'Home & Garden > Lawn & Garden',
    googleProductCategory: 'Home & Garden > Lawn & Garden > Outdoor Living > Outdoor Umbrellas & Sunshades',
    spanishType: 'Sombrillas y Parasoles',
  },
  tables: {
    englishCategory: 'Tables',
    shopifyCategory: 'Furniture > Tables > Kitchen & Dining Room Tables',
    topLevelCategory: 'Furniture > Tables',
    googleProductCategory: 'Furniture > Tables > Kitchen & Dining Room Tables',
    spanishType: 'Mesas de Comedor y Centro',
  },
  'shade sails': {
    englishCategory: 'Shade Sails',
    shopifyCategory: 'Home & Garden > Lawn & Garden > Outdoor Living > Outdoor Umbrellas & Sunshades > Shade Sails',
    topLevelCategory: 'Home & Garden > Lawn & Garden',
    googleProductCategory: 'Home & Garden > Lawn & Garden > Outdoor Living > Outdoor Umbrellas & Sunshades > Shade Sails',
    spanishType: 'Toldos Vela de Sombra',
  },
  'charcoal grills': {
    englishCategory: 'Charcoal Grills',
    shopifyCategory: 'Home & Garden > Kitchen & Dining > Kitchen Appliances > Outdoor Grills',
    topLevelCategory: 'Home & Garden > Kitchen & Dining',
    googleProductCategory: 'Home & Garden > Kitchen & Dining > Kitchen Appliances > Outdoor Grills',
    spanishType: 'Barbacoas y Parrillas',
  },
  'bookcases & shelves': {
    englishCategory: 'Bookcases & Shelves',
    shopifyCategory: 'Furniture > Shelving > Bookcases & Standing Shelves',
    topLevelCategory: 'Furniture > Shelving',
    googleProductCategory: 'Furniture > Shelving > Bookcases & Standing Shelves',
    spanishType: 'Estanterías y Librerías',
  },
  'camping & hiking': {
    englishCategory: 'Camping & Hiking',
    shopifyCategory: 'Sporting Goods > Outdoor Recreation > Camping & Hiking',
    topLevelCategory: 'Sporting Goods > Outdoor Recreation',
    googleProductCategory: 'Sporting Goods > Outdoor Recreation > Camping & Hiking',
    spanishType: 'Camping y Aire Libre',
  },
  'pet supplies': {
    englishCategory: 'Pet Supplies',
    shopifyCategory: 'Animals & Pet Supplies > Pet Supplies',
    topLevelCategory: 'Animals & Pet Supplies > Pet Supplies',
    googleProductCategory: 'Animals & Pet Supplies > Pet Supplies',
    spanishType: 'Mascotas',
  },
  'office chairs': {
    englishCategory: 'Office Chairs',
    shopifyCategory: 'Furniture > Office Furniture > Office Chairs',
    topLevelCategory: 'Furniture > Office Furniture',
    googleProductCategory: 'Furniture > Office Furniture > Office Chairs',
    spanishType: 'Sillas de Oficina',
  },
  desks: {
    englishCategory: 'Desks',
    shopifyCategory: 'Furniture > Office Furniture > Desks',
    topLevelCategory: 'Furniture > Office Furniture',
    googleProductCategory: 'Furniture > Office Furniture > Desks',
    spanishType: 'Escritorios de Oficina',
  },
  'shoe racks': {
    englishCategory: 'Shoe Racks',
    shopifyCategory: 'Home & Garden > Household Supplies > Storage & Organization > Clothing & Closet Storage > Shoe Racks & Organizers',
    topLevelCategory: 'Home & Garden > Household Supplies',
    googleProductCategory: 'Home & Garden > Household Supplies > Storage & Organization > Clothing & Closet Storage > Shoe Racks & Organizers',
    spanishType: 'Zapateros',
  },
  'tv stands': {
    englishCategory: 'TV Stands & Entertainment Centers',
    shopifyCategory: 'Furniture > Entertainment Centers & TV Stands',
    topLevelCategory: 'Furniture',
    googleProductCategory: 'Furniture > Entertainment Centers & TV Stands',
    spanishType: 'Muebles de TV y Salón',
  },
  'bar stools': {
    englishCategory: 'Bar Stools',
    shopifyCategory: 'Furniture > Chairs > Table & Bar Stools > Bar Stools',
    topLevelCategory: 'Furniture > Chairs',
    googleProductCategory: 'Furniture > Chairs > Table & Bar Stools > Bar Stools',
    spanishType: 'Taburetes y Sillas Altas',
  },
};

/**
 * Resolves full Shopify Standard Category, 1-2 level taxonomy, and Spanish localized type
 * from raw Aosom 3rd-level English category or title keywords
 */
export function resolveShopifyTaxonomy(rawCategory: string = '', rawTitle: string = ''): TaxonomyMapping {
  const normCat = (rawCategory || '').trim().toLowerCase();
  if (normCat && AOSOM_TAXONOMY_MAP[normCat]) {
    return AOSOM_TAXONOMY_MAP[normCat];
  }

  // Substring search in predefined dictionary
  for (const [key, mapping] of Object.entries(AOSOM_TAXONOMY_MAP)) {
    if (normCat.includes(key) || key.includes(normCat)) {
      return mapping;
    }
  }

  // Keyword-based fallback matching across category & title
  const combined = `${normCat} ${(rawTitle || '').toLowerCase()}`;

  if (/greenhouse|invernadero/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['greenhouse'];
  }
  if (/nightstand|mesita.*noche/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['nightstands'];
  }
  if (/mueble.*tv|soporte.*tv|televisi|tv.*stand|entertainment.*center/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['tv stands'];
  }
  if (/taburete|bar.*stool|counter.*stool/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['bar stools'];
  }
  if (/zapatero|shoe.*rack|shoe.*cabinet/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['shoe racks'];
  }
  if (/grill|barbacoa|parrilla/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['charcoal grills'];
  }
  if (/tumbona|sun.*lounger|hamaca/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['sun loungers'];
  }
  if (/sombrilla|parasol/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['parasol umbrellas & accessories'];
  }
  if (/toldo.*vela|shade.*sail/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['shade sails'];
  }
  if (/toldo|pérgola|cenador|awning|pergola|gazebo/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['awnings'];
  }
  if (/trampa|trap|animal.*vivo|camping|hiking|tienda.*campa/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['camping & hiking'];
  }
  if (/perro|gato|mascota|pet|cat|dog|jaula|rascador|pajarera/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['pet supplies'];
  }
  if (/oficina|escritorio|silla.*oficina|vinsetto|desk|office.*chair/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['office chairs'];
  }
  if (/sofa|sofá|chaise|sillón|butaca/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['sofa beds & chaise lounges'];
  }
  if (/conjunto.*jardín|conjunto.*exterior|garden.*furniture.*set/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['garden furniture sets'];
  }
  if (/jardín|garden|outdoor|terraza/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['other outdoor furniture'];
  }
  if (/librería|estantería|bookcase|bookshelf/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['bookcases & shelves'];
  }
  if (/carrito.*almacenaje|trolley|kitchen.*cart/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['storage trolleys'];
  }
  if (/cubo.*basura|trash.*can|wastebasket/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['trash cans'];
  }
  if (/armario|aparador|storage|cabinet|almacenaje/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['storage cabinets'];
  }
  if (/mesa|table|comedor|dining/i.test(combined)) {
    return AOSOM_TAXONOMY_MAP['tables'];
  }

  // Default fallback: Ensures category strictly matches Shopify Standard Product Taxonomy
  const capEnglish = rawCategory
    ? rawCategory.trim().charAt(0).toUpperCase() + rawCategory.trim().slice(1)
    : 'Home & Living';

  // Smart broad category fallback: If furniture/interior, use 'Furniture'; else 'Home & Garden > Lawn & Garden'
  const isIndoorFurniture = /mueble|interior|furniture|living|salón|dormitorio|cama|silla|cocina|casa/i.test(combined);
  const fallbackShopifyCategory = isIndoorFurniture ? 'Furniture' : 'Home & Garden > Lawn & Garden';

  return {
    englishCategory: capEnglish,
    shopifyCategory: fallbackShopifyCategory,
    topLevelCategory: isIndoorFurniture ? 'Furniture' : 'Home & Garden',
    googleProductCategory: fallbackShopifyCategory,
    spanishType: rawCategory || 'Hogar y Decoración',
  };
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  tiers: [
    { id: 'tier-1', name: '≤ €100 (1.55x)', minCost: 0, maxCost: 100, multiplier: 1.55, flatFee: 0 },
    { id: 'tier-2', name: '€100 - €200 (1.50x)', minCost: 100, maxCost: 200, multiplier: 1.5, flatFee: 0 },
    { id: 'tier-3', name: '> €200 (1.45x)', minCost: 200, maxCost: 999999, multiplier: 1.45, flatFee: 0 },
  ],
  rounding: 'none', // 默认保留原计算两位小数，确保严格遵循 1.55x / 1.5x / 1.45x
  enableCompareAtPrice: false, // 默认关闭吊牌划线价，防止被 GMC 判定虚假促销
  compareAtMultiplier: 1.35,
  shippingFee: 0,
  taxRatePercent: 0,
};

/**
 * Calculates selling price, compare-at price, and profit margin
 * Rule: 将 Aosom 表格中的 list price 和 ES shipping fee 相加：
 *   - 结果 <= 100: 乘以 1.55 倍
 *   - 结果 100 到 200: 乘以 1.50 倍
 *   - 结果 200 以上: 乘以 1.45 倍
 */
export function calculatePricing(
  costPrice: number,
  config: PricingConfig = DEFAULT_PRICING_CONFIG
): {
  sellingPrice: number;
  compareAtPrice: number;
  profitAmount: number;
  profitMargin: number;
  appliedTier: string;
} {
  const cost = Number(costPrice) || 0;
  if (cost <= 0) {
    return {
      sellingPrice: 0,
      compareAtPrice: 0,
      profitAmount: 0,
      profitMargin: 0,
      appliedTier: 'None',
    };
  }

  // Find matching tier based on cost (<= 100: 1.55x, 100~200: 1.50x, > 200: 1.45x)
  const tier =
    config.tiers.find((t, idx) => {
      if (idx === 0) {
        return cost <= t.maxCost;
      }
      const prevMax = config.tiers[idx - 1].maxCost;
      if (idx === config.tiers.length - 1) {
        return cost > prevMax;
      }
      return cost > prevMax && cost <= t.maxCost;
    }) ||
    config.tiers.find((t) => cost >= t.minCost && cost <= t.maxCost) ||
    config.tiers[config.tiers.length - 1];

  let rawPrice = cost * tier.multiplier + tier.flatFee + config.shippingFee;
  if (config.taxRatePercent > 0) {
    rawPrice = rawPrice * (1 + config.taxRatePercent / 100);
  }

  // Rounding
  let finalPrice = rawPrice;
  if (config.rounding === '99') {
    finalPrice = Math.floor(rawPrice) + 0.99;
    if (finalPrice < rawPrice) finalPrice += 1;
  } else if (config.rounding === '95') {
    finalPrice = Math.floor(rawPrice) + 0.95;
    if (finalPrice < rawPrice) finalPrice += 1;
  } else if (config.rounding === 'integer') {
    finalPrice = Math.round(rawPrice);
  } else {
    finalPrice = Math.round(rawPrice * 100) / 100;
  }

  // Calculate compare-at price (MSRP) ONLY if enabled
  let finalCompareAt = 0;
  if (config.enableCompareAtPrice) {
    let rawCompareAt = finalPrice * (config.compareAtMultiplier || 1.35);
    finalCompareAt = Math.floor(rawCompareAt) + 0.99;
    if (finalCompareAt <= finalPrice) {
      finalCompareAt = finalPrice + 10;
    }
    finalCompareAt = Math.round(finalCompareAt * 100) / 100;
  }

  const profitAmount = Math.round((finalPrice - cost - config.shippingFee) * 100) / 100;
  const profitMargin = finalPrice > 0 ? Math.round((profitAmount / finalPrice) * 1000) / 10 : 0;

  return {
    sellingPrice: Math.round(finalPrice * 100) / 100,
    compareAtPrice: finalCompareAt,
    profitAmount,
    profitMargin,
    appliedTier: tier.name,
  };
}

/**
 * Cleanses product title removing sensitive brand words and applying brand replacements
 */
export function cleanseTitle(rawTitle: string, config: WhitewashConfig = DEFAULT_WHITEWASH_CONFIG): string {
  if (!rawTitle) return '';
  let title = rawTitle.trim();

  // Apply word replacements
  for (const rep of config.wordReplacements) {
    if (rep.from && rep.to !== undefined) {
      const regex = new RegExp(`\\b${escapeRegExp(rep.from)}\\b`, 'gi');
      title = title.replace(regex, rep.to);
    }
  }

  // Remove banned keywords
  for (const banned of config.bannedKeywords) {
    if (banned) {
      const regex = new RegExp(`\\b${escapeRegExp(banned)}\\b`, 'gi');
      title = title.replace(regex, '');
    }
  }

  // If title doesn't start with brandName, prepend brand if desired or clean up double spaces
  title = title.replace(/\s+/g, ' ').trim();
  title = title.replace(/^[-–|,\s]+|[-–|,\s]+$/g, '');

  if (!title.toLowerCase().includes(config.brandName.toLowerCase())) {
    title = `${config.brandName} - ${title}`;
  }

  return title;
}

/**
 * Cleanses product description HTML / text
 */
/**
 * Strips shipping and warranty / after-sales terms from description text and HTML.
 * Requirement: 运输和售后不写在描述里 (Shopify stores handle shipping & returns via dedicated policy pages).
 */
export function stripShippingAndWarranty(htmlOrText: string): string {
  if (!htmlOrText) return '';
  let cleaned = htmlOrText;

  // 1. Remove specific HTML blocks for guarantee, warranty, shipping
  cleaned = cleaned.replace(/<div[^>]*class="[^"]*(?:casalivo-guarantee|casalivo-shipping|casalivo-warranty|guarantee|warranty|shipping)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  cleaned = cleaned.replace(/<div[^>]*>[\s\S]*?(?:Envío y servicio|Garantía Casalivo|Garantía:|Atención al cliente|30 días para devoluciones)[\s\S]*?<\/div>/gi, '');

  // 2. Remove supplier warranty & shipping sentences
  const shippingWarrantyRegexes = [
    /[^.!?<>\n\r]*(?:garant[íi]a del fabricante|manufacturer warranty|garant[íi]a oficial|garant[íi]a en defectos|devoluci[óo]n|devoluciones|posventa|postventa|after-sales|atenci[óo]n al cliente)[^.!?<>\n\r]*[.!?]?/gi,
    /[^.!?<>\n\r]*(?:env[íi]o desde almac[ée]n|env[íi]o r[áa]pido|env[íi]o en 3-5|plazo de entrega|tiempo de entrega|almac[ée]n espa[ñn]a|almac[ée]n europeo|seguimiento de pedido incluido)[^.!?<>\n\r]*[.!?]?/gi,
  ];

  for (const reg of shippingWarrantyRegexes) {
    cleaned = cleaned.replace(reg, '');
  }

  // 3. Clean up empty tags and excessive whitespace
  cleaned = cleaned.replace(/<p>\s*<\/p>/gi, '');
  cleaned = cleaned.replace(/<li>\s*<\/li>/gi, '');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  cleaned = cleaned.replace(/\n\s*\n+/g, '\n');

  return cleaned.trim();
}

/**
 * Cleanses product description HTML / text.
 * Note: Per user requirement, shipping and after-sales are NEVER appended or included in product descriptions.
 */
export function cleanseDescription(
  rawDesc: string = '',
  config: WhitewashConfig = DEFAULT_WHITEWASH_CONFIG
): string {
  if (!rawDesc) return `<p>Colección exclusiva de diseño para el hogar.</p>`;

  let desc = rawDesc;

  // Replace brands
  for (const rep of config.wordReplacements) {
    if (rep.from) {
      const regex = new RegExp(`\\b${escapeRegExp(rep.from)}\\b`, 'gi');
      desc = desc.replace(regex, rep.to);
    }
  }

  // Remove banned supplier links / emails / contact phrases
  for (const banned of config.bannedKeywords) {
    if (banned) {
      const regex = new RegExp(`\\b${escapeRegExp(banned)}\\b`, 'gi');
      desc = desc.replace(regex, '');
    }
  }

  // Remove supplier emails and URLs
  desc = desc.replace(/[\w.-]+@[\w.-]+\.\w+/gi, '');
  desc = desc.replace(/https?:\/\/[^\s<>"']+/gi, '');

  // Strip shipping and warranty/after-sales sentences and blocks (运输和售后不写在描述里)
  desc = stripShippingAndWarranty(desc);

  // If description became empty after stripping, provide a clean default
  if (!desc || desc.length < 5) {
    desc = `<p>Diseñado con materiales de alta calidad para ofrecer confort y durabilidad.</p>`;
  }

  return desc;
}

/**
 * Generates brand standardized SKU (e.g. CSL-01-0340)
 */
export function generateBrandSku(
  originalSku: string,
  config: WhitewashConfig = DEFAULT_WHITEWASH_CONFIG
): string {
  if (!originalSku) return `${config.skuPrefix}ITEM`;
  const cleanSku = originalSku.trim().replace(/\s+/g, '-').toUpperCase();
  if (cleanSku.startsWith(config.skuPrefix.toUpperCase())) {
    return cleanSku;
  }
  return `${config.skuPrefix}${cleanSku}`;
}

/**
 * Generates an official 13-digit EAN barcode with 'ean:' prefix:
 * - Country Code (3 digits): 841 (Spain)
 * - Manufacturer Code (5 digits): 57926
 * - Item Code (4 digits): pseudo-random / random 4 digits (0000 - 9999)
 * - Checksum Digit (1 digit): standard GS1 modulo 10 algorithm
 * Example: ean:8415792615295
 */
export function generateEan13Barcode(seed?: string, forceRandom: boolean = false): string {
  const countryCode = '841';
  const manufacturerCode = '57926';

  let itemDigits = '';
  if (seed && !forceRandom) {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const num = Math.abs(hash % 10000);
    itemDigits = String(num).padStart(4, '0');
  } else {
    const randomNum = Math.floor(Math.random() * 10000);
    itemDigits = String(randomNum).padStart(4, '0');
  }

  const first12 = `${countryCode}${manufacturerCode}${itemDigits}`;

  // GS1 modulo 10 checksum
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(first12[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const remainder = sum % 10;
  const checkDigit = remainder === 0 ? 0 : 10 - remainder;

  return `ean:${first12}${checkDigit}`;
}

/**
 * Validates whether a barcode string adheres to ean:84157926XXXXC format
 */
export function isValidEanBarcode(barcode?: string): boolean {
  if (!barcode) return false;
  if (!barcode.startsWith('ean:84157926')) return false;
  if (barcode.length !== 17) return false;
  const digits = barcode.slice(4);
  if (!/^\d{13}$/.test(digits)) return false;

  // Checksum test
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(digits[i], 10);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const remainder = sum % 10;
  const expectedCheck = remainder === 0 ? 0 : 10 - remainder;
  return parseInt(digits[12], 10) === expectedCheck;
}

/**
 * Converts a raw ArkSwift item into a cleansed Casalivo product
 */
export function transformArkSwiftItem(
  item: ArkSwiftRawItem,
  whitewashConfig: WhitewashConfig = DEFAULT_WHITEWASH_CONFIG,
  pricingConfig: PricingConfig = DEFAULT_PRICING_CONFIG
): CleansedProduct {
  const brandSku = generateBrandSku(item.originalSku, whitewashConfig);
  const cleanTitleStr = cleanseTitle(item.originalTitle, whitewashConfig);
  const cleanDescHtml = cleanseDescription(item.description, whitewashConfig);
  // 基础成本：将 Aosom 表格中的 list price 和 ES shipping fee 相加
  const listPrice = Number(item.listPrice !== undefined ? item.listPrice : item.originalPrice) || 0;
  const esShippingFee = Number(item.esShippingFee) || 0;
  const baseCost = listPrice + esShippingFee;

  const pricing = calculatePricing(baseCost, pricingConfig);

  // 1. Resolve Shopify 1st/2nd level taxonomy & English category
  const rawEnglishCat = (item.englishCategory || item.category || '').trim();
  const taxonomy = resolveShopifyTaxonomy(rawEnglishCat, item.originalTitle);

  // 2. Put Aosom 3rd-level English category into tags (Requirement 1)
  const tagSet = new Set<string>();
  (whitewashConfig.autoTags || []).forEach((t) => t && tagSet.add(t));
  if (taxonomy.englishCategory) {
    tagSet.add(taxonomy.englishCategory); // English 3rd-level category name in tag
  }
  if (taxonomy.spanishType && taxonomy.spanishType !== taxonomy.englishCategory) {
    tagSet.add(taxonomy.spanishType);
  }
  if (item.mainColor) {
    tagSet.add(item.mainColor);
  }

  // 3. EAN-13 码强制规则 (国家码 841，厂商代码 57926，4位随机代码 + 校验位，加前缀 ean:)
  let barcode = item.barcode;
  if (!barcode || !isValidEanBarcode(barcode)) {
    barcode = generateEan13Barcode(item.originalSku || item.id);
  }

  // Safety buffer calculation
  const buffer = whitewashConfig.safetyStockBuffer || 0;
  const rawStock = Number(item.stock) || 0;
  const availableStock = rawStock > buffer ? rawStock - buffer : 0;

  return {
    id: item.id || `item_${item.originalSku}`,
    sku: brandSku,
    originalSku: item.originalSku,
    title: cleanTitleStr,
    originalTitle: item.originalTitle,
    vendor: whitewashConfig.brandName,
    originalVendor: item.originalVendor || 'SPANISH AOSOM SL',
    costPrice: Math.round(baseCost * 100) / 100,
    listPrice: Math.round(listPrice * 100) / 100,
    esShippingFee: Math.round(esShippingFee * 100) / 100,
    price: pricing.sellingPrice,
    compareAtPrice: pricing.compareAtPrice, // 0 when disabled (GMC safety)
    profitMargin: pricing.profitMargin,
    profitAmount: pricing.profitAmount,
    stock: rawStock,
    availableStock,
    images: item.images && item.images.length > 0 ? item.images : [
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80',
    ],
    category: taxonomy.spanishType || item.category || whitewashConfig.defaultCategory,
    englishCategory: taxonomy.englishCategory,
    shopifyCategory: taxonomy.shopifyCategory, // 1-2级标准目录，Shopify后台不留空
    googleProductCategory: taxonomy.googleProductCategory,
    mainColor: item.mainColor,
    dimensions: item.dimensions,
    barcode,
    tags: Array.from(tagSet),
    descriptionHtml: cleanDescHtml,
    // 0库存商品也设置 active (后续通过库存表单独更新，库存表无 status 字段)
    status: 'active',
    syncStatus: 'idle',
  };
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
