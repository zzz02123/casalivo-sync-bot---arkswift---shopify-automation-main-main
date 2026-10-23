import { CleansedProduct, ArkSwiftRawItem, GroupedProductListing, GroupedProductVariant } from '../types';
import { generateHandle } from './shopifyCsvExporter';

/**
 * Regex patterns to extract dimensions and size specs from Spanish titles
 * e.g. "81x26x34,5 cm", "140x80x74cm", "3x3m", "4x3x2 m", "50×36×70 cm"
 */
const DIMENSION_REGEX = /(\d+([,.]\d+)?\s*[xX*×]\s*\d+([,.]\d+)?(?:\s*[xX*×]\s*\d+([,.]\d+)?)?\s*(?:cm|m|mm)?)/i;

/**
 * Common color keywords in Spanish
 */
const COLOR_REGEX = /\b(Blanco|Negro|Gris(?:\s*Antracita)?|Verde|Azul|Rojo|Marrón(?:\s*Rústico)?|Beige|Natural|Plateado|Dorado|Crema|Rosa|Amarillo)\b/i;

interface ExtractedOption {
  optionType: 'Tamaño / Medidas' | 'Color' | 'Modelo';
  optionValue: string;
  cleanedBaseTitle: string;
}

/**
 * Extracts variation attribute (dimensions or color) and strips it from the raw title
 * to produce a clean, generalized parent title suitable for SEO
 */
export function extractVariationAndBaseTitle(title: string, product: CleansedProduct): ExtractedOption {
  let workingTitle = title.replace(/^Casalivo\s*[-–|:]\s*/i, '').trim();

  // 1. Check for Dimensions
  const dimMatch = workingTitle.match(DIMENSION_REGEX);
  if (dimMatch && dimMatch[0]) {
    const rawDim = dimMatch[0].trim();
    const formattedDim = rawDim.replace(/\s+/g, '').replace(/x|X|\*/g, ' × ');
    const stripped = workingTitle
      .replace(dimMatch[0], '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.-])/, '$1')
      .trim();

    return {
      optionType: 'Tamaño / Medidas',
      optionValue: product.dimensions || formattedDim,
      cleanedBaseTitle: cleanSpanishBaseTitle(stripped),
    };
  }

  // 2. Check for Color if product explicitly has mainColor or matches color regex
  if (product.mainColor) {
    const stripped = workingTitle
      .replace(new RegExp(`\\b${product.mainColor}\\b`, 'gi'), '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return {
      optionType: 'Color',
      optionValue: product.mainColor,
      cleanedBaseTitle: cleanSpanishBaseTitle(stripped),
    };
  }

  const colorMatch = workingTitle.match(COLOR_REGEX);
  if (colorMatch && colorMatch[0]) {
    const colorVal = colorMatch[0].trim();
    const stripped = workingTitle
      .replace(colorMatch[0], '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return {
      optionType: 'Color',
      optionValue: colorVal,
      cleanedBaseTitle: cleanSpanishBaseTitle(stripped),
    };
  }

  // 3. Fallback to model/default
  return {
    optionType: 'Modelo',
    optionValue: product.sku.split('-').slice(1).join('-') || 'Estándar',
    cleanedBaseTitle: cleanSpanishBaseTitle(workingTitle),
  };
}

/**
 * Cleans up leftover punctuation and hanging words from base title
 */
function cleanSpanishBaseTitle(text: string): string {
  let cleaned = text
    .replace(/^[-–|,;:\s]+|[-–|,;:\s]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}

/**
 * Synthesizes an SEO-optimized Spanish title for a multi-variant main listing
 * Avoids single specific dimension clutter and focuses on high-intent search terms
 */
export function buildSeoListingTitle(
  brandName: string,
  baseTitle: string,
  optionType: 'Tamaño / Medidas' | 'Color' | 'Modelo',
  variantCount: number
): string {
  let cleanBase = baseTitle.replace(new RegExp(`^${brandName}\\s*[-–|:]?\\s*`, 'i'), '').trim();

  // If there are multiple variants, append an attractive Spanish SEO buyer intent suffix
  let suffix = '';
  if (variantCount > 1) {
    if (optionType === 'Tamaño / Medidas') {
      suffix = ' - Varios Tamaños';
    } else if (optionType === 'Color') {
      suffix = ' - Varios Colores';
    } else {
      suffix = ' - Varios Modelos';
    }
  }

  let finalTitle = `${brandName} ${cleanBase}${suffix}`.trim();
  // Ensure title doesn't exceed 120 chars for optimal Shopify and Google SERP rendering
  if (finalTitle.length > 120) {
    finalTitle = finalTitle.slice(0, 117) + '...';
  }
  return finalTitle;
}

/**
 * Generates an SEO-optimized HTML description for the merged listing
 * Includes:
 * 1. Introduction emphasizing the collection and versatility
 * 2. Key features (bullet points)
 * 3. Variant comparison matrix table (overcoming Shopify's shared description limit)
 * 4. European shipping & warranty reassurance
 * 5. Structured FAQ section for search ranking
 */
export function buildSeoListingDescription(
  brandName: string,
  baseTitle: string,
  optionType: string,
  variants: GroupedProductVariant[],
  categoryName: string,
  sampleDescriptionHtml: string
): string {
  // Extract features from sample description if present
  const featuresMatch = sampleDescriptionHtml.match(/<h3>Características principales<\/h3><ul>[\s\S]*?<\/ul>/i);
  const existingFeatures = featuresMatch ? featuresMatch[0] : '';

  // Generate Comparison Matrix Rows
  const tableRows = variants
    .map((v) => {
      const weightText = v.weight ? `${v.weight} kg` : '-';
      const stockBadge =
        v.availableStock > 0
          ? `<span style="color:#059669; font-weight:600;">En Stock (${v.availableStock})</span>`
          : `<span style="color:#dc2626;">Agotado</span>`;

      return `
      <tr style="border-bottom: 1px solid #e2e8f0; transition: background 0.2s;">
        <td style="padding: 10px 14px; font-weight: 600; color: #0f172a;">${v.optionValue}</td>
        <td style="padding: 10px 14px; font-family: monospace; color: #475569;">${v.sku}</td>
        <td style="padding: 10px 14px; color: #475569;">${weightText}</td>
        <td style="padding: 10px 14px;">${stockBadge}</td>
        <td style="padding: 10px 14px; font-weight: 700; color: #0284c7; font-size: 1.05em;">€${v.price.toFixed(2)}</td>
      </tr>`;
    })
    .join('');

  return `
<div class="casalivo-product-description" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #334155;">
  <!-- SEO Lead Paragraph -->
  <p style="font-size: 1.05em; color: #1e293b; margin-bottom: 18px;">
    La <strong>${baseTitle}</strong> de <strong>${brandName}</strong> ha sido desarrollada para combinar resistencia, diseño funcional y máxima comodidad en tu hogar.
    ${
      variants.length > 1
        ? `Esta gama cuenta con <strong>diferentes opciones de ${optionType.toLowerCase()}</strong> para que elijas la alternativa que mejor se adapte a tus necesidades específicas.`
        : ''
    }
  </p>

  ${
    existingFeatures ||
    `
  <!-- Características -->
  <h3 style="color: #0f172a; font-size: 1.15em; margin-top: 24px; margin-bottom: 12px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
    Características Principales
  </h3>
  <ul style="padding-left: 20px; margin-bottom: 20px; space-y: 8px;">
    <li><strong>Materiales de alta durabilidad:</strong> Estructura robusta diseñada para uso intensivo y prolongado.</li>
    <li><strong>Acabado premium:</strong> Superficies tratadas resistentes al desgaste y fáciles de limpiar.</li>
    <li><strong>Montaje intuitivo:</strong> Incluye instrucciones detalladas y todos los accesorios necesarios para su instalación.</li>
    <li><strong>Versatilidad de uso:</strong> Ideal para cualquier espacio interior o exterior.</li>
  </ul>
  `
  }

  <!-- Variant Comparison Table (Shopify Shared Description Solution) -->
  <div class="casalivo-matrix-card" style="margin: 28px 0; padding: 20px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
      <h3 style="margin: 0; font-size: 1.1em; color: #0f172a; font-weight: 700;">
        📐 Tabla Técnica de Medidas y Opciones Disponibles
      </h3>
      <span style="font-size: 0.8em; background: #e0f2fe; color: #0369a1; padding: 3px 8px; rounded: 4px; font-weight: 600;">
        ${variants.length} Variantes
      </span>
    </div>
    <p style="font-size: 0.88em; color: #64748b; margin-bottom: 14px;">
      Selecciona tu opción preferida en el menú desplegable superior. A continuación puedes comparar las especificaciones técnicas de cada modelo:
    </p>
    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; font-size: 0.9em; text-align: left; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
        <thead>
          <tr style="background: #f1f5f9; color: #1e293b; font-size: 0.82em; text-transform: uppercase; letter-spacing: 0.05em;">
            <th style="padding: 10px 14px;">Opción / Tamaño</th>
            <th style="padding: 10px 14px;">Código SKU</th>
            <th style="padding: 10px 14px;">Peso Aprox.</th>
            <th style="padding: 10px 14px;">Disponibilidad</th>
            <th style="padding: 10px 14px;">Precio</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Shipping & Reassurance Block -->
  <div style="margin-top: 24px; padding: 16px 20px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #0284c7;">
    <h4 style="margin: 0 0 8px 0; color: #0f172a; font-size: 1em;">🚚 Envío Rápido y Garantía Oficial ${brandName}</h4>
    <ul style="margin: 0; padding-left: 18px; font-size: 0.9em; color: #475569;">
      <li><strong>Entrega express en 3-5 días laborables</strong> desde nuestros almacenes en España/Europa.</li>
      <li><strong>Seguimiento de envío en tiempo real</strong> para cada pedido.</li>
      <li><strong>30 días de plazo de devolución</strong> y garantía oficial frente a cualquier defecto de fabricación.</li>
    </ul>
  </div>
</div>
`;
}

/**
 * Intelligent Algorithm: Groups products into unified multi-variant parent listings
 * Merges items belonging to the same product family and rewrites Title and Description for SEO
 */
export function groupProductsIntoListings(
  products: CleansedProduct[],
  rawMap: Map<string, ArkSwiftRawItem> = new Map()
): GroupedProductListing[] {
  // Grouping map keyed by sanitized root title + category
  const clusters = new Map<string, {
    baseTitle: string;
    optionType: 'Tamaño / Medidas' | 'Color' | 'Modelo';
    primaryProduct: CleansedProduct;
    items: Array<{ product: CleansedProduct; optionVal: string; raw?: ArkSwiftRawItem }>;
  }>();

  for (const product of products) {
    const raw = rawMap.get(product.originalSku) || rawMap.get(product.sku);
    const { optionType, optionValue, cleanedBaseTitle } = extractVariationAndBaseTitle(product.title, product);

    // Grouping key: Vendor + Category + sanitized base title (words only)
    const normalizedKey = `${product.vendor}__${product.englishCategory || product.category}__${cleanedBaseTitle
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúüñ]+/g, ' ')
      .trim()}`;

    if (!clusters.has(normalizedKey)) {
      clusters.set(normalizedKey, {
        baseTitle: cleanedBaseTitle,
        optionType,
        primaryProduct: product,
        items: [],
      });
    }

    clusters.get(normalizedKey)!.items.push({
      product,
      optionVal: optionValue,
      raw,
    });
  }

  // Build GroupedProductListing objects
  const listings: GroupedProductListing[] = [];

  for (const [, cluster] of clusters.entries()) {
    const { baseTitle, optionType, primaryProduct, items } = cluster;
    const variantCount = items.length;

    // 1. Build SEO-optimized Unified Title
    const brandName = primaryProduct.vendor || 'Casalivo';
    const seoListingTitle = buildSeoListingTitle(brandName, baseTitle, optionType, variantCount);
    const handle = generateHandle(seoListingTitle, primaryProduct.sku.split('-')[1] || primaryProduct.sku);

    // 2. Build Variants List
    const variants: GroupedProductVariant[] = items.map((item) => {
      const p = item.product;
      const raw = item.raw || rawMap.get(p.originalSku) || rawMap.get(p.sku);
      return {
        id: p.id,
        sku: p.sku,
        originalSku: p.originalSku,
        optionName: optionType,
        optionValue: item.optionVal,
        price: p.price,
        compareAtPrice: p.compareAtPrice,
        stock: p.stock,
        availableStock: p.availableStock,
        costPrice: p.costPrice,
        weight: raw?.weight,
        barcode: raw?.barcode,
        image: p.images[0] || '',
      };
    });

    // 3. Price & Stock Aggregation
    const prices = variants.map((v) => v.price);
    const priceMin = Math.min(...prices);
    const priceMax = Math.max(...prices);
    const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);
    const totalAvailableStock = variants.reduce((sum, v) => sum + v.availableStock, 0);

    // 4. Combined Images (deduped)
    const imageSet = new Set<string>();
    items.forEach((item) => {
      (item.product.images || []).forEach((img) => img && imageSet.add(img));
    });
    const images = Array.from(imageSet);

    // 5. Tags: Union of all variant tags + English Category
    const tagSet = new Set<string>();
    items.forEach((item) => {
      (item.product.tags || []).forEach((t) => t && tagSet.add(t));
    });
    if (primaryProduct.englishCategory) {
      tagSet.add(primaryProduct.englishCategory);
    }
    tagSet.add('MultiVariante');

    // 6. Build SEO Description with Specifications Table
    const descriptionHtml = buildSeoListingDescription(
      brandName,
      baseTitle,
      optionType,
      variants,
      primaryProduct.category,
      primaryProduct.descriptionHtml
    );

    // 7. SEO Meta tags
    const seoTitle = `${seoListingTitle} | ${brandName} Oficial`.slice(0, 70);
    const seoDescription = `Comprar ${baseTitle} en ${brandName}. Disponible en varias opciones de ${optionType.toLowerCase()}. Envío en 3-5 días y garantía oficial.`.slice(0, 160);

    // Determine status
    const anySynced = items.some((i) => i.product.syncStatus === 'success');
    const syncStatus = anySynced ? 'success' : 'idle';

    listings.push({
      id: `group-${handle}`,
      handle,
      vendor: brandName,
      title: seoListingTitle,
      originalBaseTitle: baseTitle,
      category: primaryProduct.category,
      englishCategory: primaryProduct.englishCategory || 'Home & Living',
      shopifyCategory: primaryProduct.shopifyCategory || 'Home & Garden > Lawn & Garden',
      googleProductCategory: primaryProduct.googleProductCategory || primaryProduct.shopifyCategory || '',
      tags: Array.from(tagSet),
      optionName: optionType,
      variants,
      priceMin,
      priceMax,
      totalStock,
      totalAvailableStock,
      images,
      descriptionHtml,
      seoTitle,
      seoDescription,
      syncStatus,
      shopifyId: primaryProduct.shopifyId,
    });
  }

  return listings;
}
