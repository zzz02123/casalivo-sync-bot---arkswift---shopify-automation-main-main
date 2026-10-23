import Papa from 'papaparse';
import { CleansedProduct, ArkSwiftRawItem, GroupedProductListing, GroupedProductVariant } from '../types';
import { generateEan13Barcode, isValidEanBarcode, stripShippingAndWarranty } from './whitewashEngine';

/**
 * Standard Shopify Product CSV Header specification
 */
export interface ShopifyCsvRow {
  Handle: string;
  Title: string;
  'Body (HTML)': string;
  Vendor: string;
  'Product Category': string;
  Type: string;
  Tags: string;
  Published: string;
  'Option1 Name': string;
  'Option1 Value': string;
  'Option2 Name'?: string;
  'Option2 Value'?: string;
  'Option3 Name'?: string;
  'Option3 Value'?: string;
  'Variant SKU': string;
  'Variant Grams': string;
  'Variant Inventory Tracker': string;
  'Variant Inventory Qty': string;
  'Variant Inventory Policy': string;
  'Variant Fulfillment Service': string;
  'Variant Price': string;
  'Variant Compare At Price': string;
  'Variant Requires Shipping': string;
  'Variant Taxable': string;
  'Variant Barcode': string;
  'Image Src': string;
  'Image Position': string;
  'Image Alt Text': string;
  'Gift Card': string;
  'SEO Title': string;
  'SEO Description': string;
  'Google Shopping / Google Product Category': string;
  'Google Shopping / Gender': string;
  'Google Shopping / Age Group': string;
  'Google Shopping / MPN': string;
  'Google Shopping / Condition': string;
  'Google Shopping / Custom Product': string;
  'Google Shopping / Custom Label 0': string;
  'Variant Image': string;
  'Variant Weight Unit': string;
  'Cost per item': string;
  Status: string;
}

export interface CsvExportOptions {
  mode?: 'standalone' | 'grouped_variants';
}

/**
 * Generate a URL-friendly handle slug from title and SKU
 */
export function generateHandle(title: string, sku?: string): string {
  const cleanTitle = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents (á -> a)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  if (sku) {
    const cleanSku = sku.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `${cleanSku}-${cleanTitle}`.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  }
  return cleanTitle.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Builds HTML specs table for grouped variants to solve Shopify's shared description limitation:
 * "Shopify对变体支持不友好，它默认是多个变体共用一个标题和描述"
 */
export function buildVariantsComparisonMatrix(variants: Array<{ product: CleansedProduct; optionVal: string; raw?: ArkSwiftRawItem }>): string {
  if (variants.length <= 1) return '';

  const rows = variants.map((v) => {
    const p = v.product;
    const raw = v.raw;
    const dims = p.dimensions || v.optionVal || '-';
    const weight = raw?.weight ? `${raw.weight} kg` : '-';
    return `<tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 8px 12px; font-weight: 600; color: #0f172a;">${v.optionVal}</td>
      <td style="padding: 8px 12px; color: #475569;">${dims}</td>
      <td style="padding: 8px 12px; font-family: monospace; color: #64748b;">${p.sku}</td>
      <td style="padding: 8px 12px; color: #475569;">${weight}</td>
      <td style="padding: 8px 12px; font-weight: 700; color: #0284c7;">€${p.price.toFixed(2)}</td>
    </tr>`;
  }).join('\n');

  return `
<div class="casalivo-variants-matrix" style="margin: 24px 0; padding: 18px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px;">
  <h4 style="margin: 0 0 12px 0; font-size: 1.05em; color: #0f172a; font-weight: bold; display: flex; align-items: center; gap: 6px;">
    <span>📐 Guía Comparativa de Opciones y Medidas Disponibles</span>
  </h4>
  <p style="margin: 0 0 12px 0; font-size: 0.85em; color: #64748b;">
    Esta colección dispone de distintas variantes de tamaño y configuración. Consulta la siguiente tabla técnica:
  </p>
  <table style="width: 100%; border-collapse: collapse; font-size: 0.88em; text-align: left; background: #ffffff; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    <thead>
      <tr style="background: #e2e8f0; color: #1e293b; text-transform: uppercase; font-size: 0.78em; letter-spacing: 0.05em;">
        <th style="padding: 10px 12px;">Variante</th>
        <th style="padding: 10px 12px;">Medidas</th>
        <th style="padding: 10px 12px;">Referencia SKU</th>
        <th style="padding: 10px 12px;">Peso</th>
        <th style="padding: 10px 12px;">Precio</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</div>
`;
}

/**
 * Intelligently groups standalone products into multi-variant listings
 * - Groups by root SKU model or normalized base title (without dimensions/colors)
 * - Identifies variation dimension (Tamaño / Medidas vs Color vs Modelo)
 * - SEO Title Optimization: e.g. "Casalivo - Invernadero Caseta de Jardín (Varios Tamaños)"
 * - Automatically injects comparison matrix HTML into description
 * - Aggregates min-max prices, available stock, images, and standard categories
 */
export function groupProductsIntoListings(
  products: CleansedProduct[],
  rawItemsMap: Map<string, ArkSwiftRawItem> = new Map()
): GroupedProductListing[] {
  const groupsMap = new Map<string, CleansedProduct[]>();

  for (const product of products) {
    const title = product.title || '';

    // Root SKU identifier (e.g. 845-667 from 845-667V01)
    const rawSku = (product.originalSku || product.sku).toUpperCase();
    const skuRoot = rawSku.replace(/V\d+.*$/i, '').replace(/[-_][A-Z0-9]{1,3}$/, '').trim();

    // Cleaned base title (strip brand prefix, dimensions, colors, trailing punctuation)
    let baseTitle = title
      .replace(/^Casalivo\s*[-–]\s*/i, '')
      .replace(/(\d+(?:[,.]\d+)?\s*[xX*×]\s*\d+(?:[,.]\d+)?(?:\s*[xX*×]\s*\d+(?:[,.]\d+)?)?\s*(?:cm|m|mm)?)/gi, '')
      .replace(/\b(Blanco|Negro|Gris|Marrón|Madera|Verde|Azul|Rojo|Beige|Natural|Roble|Nogal|Plateado|Dorado|Crema|Rosa|Amarillo|Antracita)\b/gi, '')
      .replace(/[-–|,\s]+/g, ' ')
      .trim();

    if (!baseTitle) baseTitle = title;

    // Grouping key: use category + normalized base title
    const normBaseKey = baseTitle.toLowerCase().slice(0, 45);
    const groupKey = normBaseKey.length > 5
      ? `${product.category}:::${normBaseKey}`
      : skuRoot.length > 4
      ? `${product.category}:::sku_${skuRoot}`
      : `single_${product.id}`;

    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, []);
    }
    groupsMap.get(groupKey)!.push(product);
  }

  const listings: GroupedProductListing[] = [];

  for (const [_, group] of groupsMap.entries()) {
    const isMultiVariant = group.length > 1;
    const first = group[0];
    const category = first.category || 'Home & Living';
    const englishCategory = first.englishCategory || 'Home & Living';
    const shopifyCategory = first.shopifyCategory || 'Home & Garden > Lawn & Garden';
    const googleProductCategory = first.googleProductCategory || shopifyCategory;

    // Detect variation dimension (Dimension vs Color vs Model)
    let hasDimDiff = false;
    let hasColorDiff = false;

    const dimValues = new Set<string>();
    const colorValues = new Set<string>();

    group.forEach((p) => {
      const dim = p.dimensions || (p.title.match(/(\d+(?:[,.]\d+)?\s*[xX*×]\s*\d+(?:[,.]\d+)?(?:\s*[xX*×]\s*\d+(?:[,.]\d+)?)?\s*(?:cm|m|mm)?)/i)?.[1]?.trim());
      if (dim) dimValues.add(dim);
      const col = p.mainColor || (p.title.match(/\b(Blanco|Negro|Gris|Marrón|Madera|Verde|Azul|Rojo|Beige|Natural|Roble|Nogal|Plateado|Dorado|Crema|Rosa|Amarillo|Antracita)\b/i)?.[1]?.trim());
      if (col) colorValues.add(col);
    });

    if (dimValues.size > 1) hasDimDiff = true;
    if (colorValues.size > 1) hasColorDiff = true;

    const optionName = hasDimDiff
      ? 'Tamaño / Medidas'
      : hasColorDiff
      ? 'Color'
      : isMultiVariant
      ? 'Opción / Modelo'
      : 'Title';

    // Construct unified clean Spanish base title for SEO
    let baseTitleClean = first.title
      .replace(/^Casalivo\s*[-–]\s*/i, '')
      .replace(/(\d+(?:[,.]\d+)?\s*[xX*×]\s*\d+(?:[,.]\d+)?(?:\s*[xX*×]\s*\d+(?:[,.]\d+)?)?\s*(?:cm|m|mm)?)/gi, '')
      .replace(/\b(Blanco|Negro|Gris|Marrón|Madera|Verde|Azul|Rojo|Beige|Natural|Roble|Nogal|Plateado|Dorado|Crema|Rosa|Amarillo|Antracita)\b/gi, '')
      .replace(/[-–|,\s]+/g, ' ')
      .trim();

    if (!baseTitleClean) baseTitleClean = first.title;

    let listingTitle: string;
    if (isMultiVariant) {
      const suffix = hasDimDiff
        ? '(Varios Tamaños Disponibles)'
        : hasColorDiff
        ? '(Varios Colores)'
        : '(Múltiples Opciones)';
      listingTitle = `Casalivo - ${baseTitleClean} ${suffix}`;
    } else {
      listingTitle = first.title;
    }

    // Build variants
    const variants: GroupedProductVariant[] = group.map((p, idx) => {
      const raw = rawItemsMap.get(p.originalSku) || rawItemsMap.get(p.sku);
      let optVal = 'Default Title';

      if (isMultiVariant) {
        if (hasDimDiff) {
          optVal = p.dimensions || (p.title.match(/(\d+(?:[,.]\d+)?\s*[xX*×]\s*\d+(?:[,.]\d+)?(?:\s*[xX*×]\s*\d+(?:[,.]\d+)?)?\s*(?:cm|m|mm)?)/i)?.[1]?.trim()) || `Opción ${idx + 1}`;
        } else if (hasColorDiff) {
          optVal = p.mainColor || (p.title.match(/\b(Blanco|Negro|Gris|Marrón|Madera|Verde|Azul|Rojo|Beige|Natural|Roble|Nogal|Plateado|Dorado|Crema|Rosa|Amarillo|Antracita)\b/i)?.[1]?.trim()) || `Color ${idx + 1}`;
        } else {
          optVal = p.sku;
        }
      }

      return {
        id: p.id,
        sku: p.sku,
        originalSku: p.originalSku,
        optionName,
        optionValue: optVal,
        price: p.price,
        compareAtPrice: p.compareAtPrice,
        stock: p.stock,
        availableStock: p.availableStock,
        costPrice: p.costPrice,
        listPrice: p.listPrice,
        esShippingFee: p.esShippingFee,
        weight: raw?.weight,
        barcode: isValidEanBarcode(p.barcode)
          ? p.barcode
          : isValidEanBarcode(raw?.barcode)
          ? raw!.barcode!
          : generateEan13Barcode(p.originalSku || p.sku),
        image: p.images[0] || '',
      };
    });

    // Build variants matrix HTML (technical specs only, no shipping/warranty)
    const matrixData = variants.map((v, i) => ({
      product: group[i],
      optionVal: v.optionValue,
      raw: rawItemsMap.get(v.originalSku) || rawItemsMap.get(v.sku),
    }));
    const matrixHtml = buildVariantsComparisonMatrix(matrixData);

    // Merge description HTML: Strip any shipping & warranty completely
    let fullDescHtml = stripShippingAndWarranty(first.descriptionHtml || `<p>${listingTitle}</p>`);
    if (isMultiVariant && matrixHtml && !fullDescHtml.includes('casalivo-variants-matrix')) {
      fullDescHtml += `\n${matrixHtml}`;
    }

    // Merge tags
    const allTags = new Set<string>();
    group.forEach((p) => (p.tags || []).forEach((t) => allTags.add(t)));
    if (englishCategory) allTags.add(englishCategory);
    if (isMultiVariant) allTags.add('Multi-Variant');

    // Merge images
    const allImages: string[] = [];
    group.forEach((p) => {
      (p.images || []).forEach((img) => {
        if (img && !allImages.includes(img)) allImages.push(img);
      });
    });

    const prices = variants.map((v) => v.price);
    const totalStock = variants.reduce((acc, v) => acc + v.stock, 0);
    const totalAvailableStock = variants.reduce((acc, v) => acc + v.availableStock, 0);
    const handle = generateHandle(listingTitle, first.sku);

    listings.push({
      id: `listing-${first.id}`,
      handle,
      vendor: first.vendor || 'Casalivo',
      title: listingTitle,
      originalBaseTitle: first.originalTitle,
      category,
      englishCategory,
      shopifyCategory,
      googleProductCategory,
      tags: Array.from(allTags),
      optionName,
      variants,
      priceMin: Math.min(...prices),
      priceMax: Math.max(...prices),
      totalStock,
      totalAvailableStock,
      images: allImages.length > 0 ? allImages : first.images,
      descriptionHtml: fullDescHtml,
      seoTitle: listingTitle.slice(0, 70),
      seoDescription: `${listingTitle} - Colección oficial Casalivo.`.slice(0, 160),
      syncStatus: group.every((p) => p.syncStatus === 'success')
        ? 'success'
        : group.some((p) => p.syncStatus === 'pending')
        ? 'pending'
        : 'idle',
      shopifyId: first.shopifyId,
    });
  }

  return listings;
}

/**
 * Converts CleansedProduct items into Shopify's standard CSV export format
 * Properly fills 'Product Category' (Shopify Standard 1-2 level taxonomy, never left blank)
 * Omits 'Variant Compare At Price' when disabled (0) to protect GMC approval
 * Supports both standalone items and smart grouped variants with comparison tables
 */
export function convertToShopifyCsvRows(
  products: CleansedProduct[],
  rawItemsMap: Map<string, ArkSwiftRawItem> = new Map(),
  options: CsvExportOptions = { mode: 'grouped_variants' }
): ShopifyCsvRow[] {
  const rows: ShopifyCsvRow[] = [];

  if (options.mode !== 'standalone') {
    const listings = groupProductsIntoListings(products, rawItemsMap);

    for (const listing of listings) {
      listing.variants.forEach((v: GroupedProductVariant, vIdx: number) => {
        const isFirst = vIdx === 0;
        const raw = rawItemsMap.get(v.originalSku) || rawItemsMap.get(v.sku);
        const grams = Math.round((v.weight || raw?.weight || 1.0) * 1000).toString();

        rows.push({
          Handle: listing.handle,
          Title: isFirst ? listing.title : '',
          'Body (HTML)': isFirst ? listing.descriptionHtml : '',
          Vendor: isFirst ? listing.vendor : '',
          'Product Category': isFirst ? listing.shopifyCategory : '',
          Type: isFirst ? listing.category : '',
          Tags: isFirst ? listing.tags.join(', ') : '',
          Published: isFirst ? 'TRUE' : '',
          'Option1 Name': isFirst ? listing.optionName : '',
          'Option1 Value': v.optionValue,
          'Option2 Name': '',
          'Option2 Value': '',
          'Option3 Name': '',
          'Option3 Value': '',
          'Variant SKU': v.sku,
          'Variant Grams': grams,
          'Variant Inventory Tracker': 'shopify',
          'Variant Inventory Qty': v.availableStock.toString(),
          'Variant Inventory Policy': 'deny',
          'Variant Fulfillment Service': 'manual',
          'Variant Price': v.price.toFixed(2),
          // GMC policy protection: only write compare-at price if positive
          'Variant Compare At Price': v.compareAtPrice > 0 ? v.compareAtPrice.toFixed(2) : '',
          'Variant Requires Shipping': 'TRUE',
          'Variant Taxable': 'FALSE',
          'Variant Barcode': (isValidEanBarcode(v.barcode) ? v.barcode : generateEan13Barcode(v.sku || v.originalSku)) || '',
          'Image Src': listing.images[vIdx] || listing.images[0] || '',
          'Image Position': (vIdx + 1).toString(),
          'Image Alt Text': isFirst ? listing.title : `${listing.title} - ${v.optionValue}`,
          'Gift Card': isFirst ? 'FALSE' : '',
          'SEO Title': isFirst ? listing.seoTitle : '',
          'SEO Description': isFirst ? listing.seoDescription : '',
          'Google Shopping / Google Product Category': isFirst ? (listing.googleProductCategory || listing.shopifyCategory) : '',
          'Google Shopping / Gender': '',
          'Google Shopping / Age Group': '',
          'Google Shopping / MPN': v.sku,
          'Google Shopping / Condition': 'new',
          'Google Shopping / Custom Product': 'FALSE',
          'Google Shopping / Custom Label 0': listing.vendor,
          'Variant Image': v.image || '',
          'Variant Weight Unit': 'kg',
          'Cost per item': v.costPrice ? v.costPrice.toFixed(2) : '',
          Status: 'active',
        });
      });

      // Additional images if more images than variants
      if (listing.images.length > listing.variants.length) {
        for (let i = listing.variants.length; i < listing.images.length; i++) {
          rows.push({
            Handle: listing.handle,
            Title: '',
            'Body (HTML)': '',
            Vendor: '',
            'Product Category': '',
            Type: '',
            Tags: '',
            Published: '',
            'Option1 Name': '',
            'Option1 Value': '',
            'Variant SKU': '',
            'Variant Grams': '',
            'Variant Inventory Tracker': '',
            'Variant Inventory Qty': '',
            'Variant Inventory Policy': '',
            'Variant Fulfillment Service': '',
            'Variant Price': '',
            'Variant Compare At Price': '',
            'Variant Requires Shipping': '',
            'Variant Taxable': '',
            'Variant Barcode': '',
            'Image Src': listing.images[i],
            'Image Position': (i + 1).toString(),
            'Image Alt Text': `${listing.title} - vista ${i + 1}`,
            'Gift Card': '',
            'SEO Title': '',
            'SEO Description': '',
            'Google Shopping / Google Product Category': '',
            'Google Shopping / Gender': '',
            'Google Shopping / Age Group': '',
            'Google Shopping / MPN': '',
            'Google Shopping / Condition': '',
            'Google Shopping / Custom Product': '',
            'Google Shopping / Custom Label 0': '',
            'Variant Image': '',
            'Variant Weight Unit': '',
            'Cost per item': '',
            Status: '',
          });
        }
      }
    }

    return rows;
  }

  // --- Standalone Product Mode ---
  for (const product of products) {
    const raw = rawItemsMap.get(product.originalSku) || rawItemsMap.get(product.sku);
    const handle = generateHandle(product.title, product.sku);
    const weightKg = raw?.weight || 1.0;
    const grams = Math.round(weightKg * 1000).toString();
    const barcode: string = (isValidEanBarcode(product.barcode)
      ? product.barcode
      : isValidEanBarcode(raw?.barcode)
      ? raw!.barcode
      : generateEan13Barcode(product.sku || product.originalSku)) || '';
    const images = product.images && product.images.length > 0 ? product.images : [];
    const cleanDesc = stripShippingAndWarranty(product.descriptionHtml || `<p>${product.title}</p>`);

    // Main variant row (first row contains full product info)
    const mainRow: ShopifyCsvRow = {
      Handle: handle,
      Title: product.title,
      'Body (HTML)': cleanDesc,
      Vendor: product.vendor || 'Casalivo',
      // Requirement 2: Auto-mapped 1st/2nd level taxonomy, NEVER left empty!
      'Product Category': product.shopifyCategory || 'Home & Garden > Lawn & Garden',
      Type: product.category || 'Home & Living',
      // Requirement 1: Tags include Aosom 3rd-level English category + brand + type
      Tags: (product.tags || ['Casalivo', 'Dropship', 'VerifiedStock']).join(', '),
      Published: 'TRUE',
      'Option1 Name': 'Title',
      'Option1 Value': 'Default Title',
      'Option2 Name': '',
      'Option2 Value': '',
      'Option3 Name': '',
      'Option3 Value': '',
      'Variant SKU': product.sku,
      'Variant Grams': grams,
      'Variant Inventory Tracker': 'shopify',
      'Variant Inventory Qty': product.availableStock.toString(),
      'Variant Inventory Policy': 'deny',
      'Variant Fulfillment Service': 'manual',
      'Variant Price': product.price.toFixed(2),
      // Requirement 3: Omit compare-at price when 0/disabled to protect GMC approval
      'Variant Compare At Price': product.compareAtPrice > 0 ? product.compareAtPrice.toFixed(2) : '',
      'Variant Requires Shipping': 'TRUE',
      'Variant Taxable': 'FALSE',
      'Variant Barcode': barcode,
      'Image Src': images[0] || '',
      'Image Position': images[0] ? '1' : '',
      'Image Alt Text': product.title,
      'Gift Card': 'FALSE',
      'SEO Title': product.title.slice(0, 70),
      'SEO Description': (product.title + ' - Colección exclusiva Casalivo.').slice(0, 160),
      'Google Shopping / Google Product Category': product.googleProductCategory || product.shopifyCategory || '',
      'Google Shopping / Gender': '',
      'Google Shopping / Age Group': '',
      'Google Shopping / MPN': product.sku,
      'Google Shopping / Condition': 'new',
      'Google Shopping / Custom Product': 'FALSE',
      'Google Shopping / Custom Label 0': 'Casalivo',
      'Variant Image': images[0] || '',
      'Variant Weight Unit': 'kg',
      'Cost per item': product.costPrice ? product.costPrice.toFixed(2) : '',
      Status: 'active',
    };

    rows.push(mainRow);

    // If product has more images, append additional image rows for Shopify
    if (images.length > 1) {
      for (let i = 1; i < images.length; i++) {
        rows.push({
          Handle: handle,
          Title: '',
          'Body (HTML)': '',
          Vendor: '',
          'Product Category': '',
          Type: '',
          Tags: '',
          Published: '',
          'Option1 Name': '',
          'Option1 Value': '',
          'Variant SKU': '',
          'Variant Grams': '',
          'Variant Inventory Tracker': '',
          'Variant Inventory Qty': '',
          'Variant Inventory Policy': '',
          'Variant Fulfillment Service': '',
          'Variant Price': '',
          'Variant Compare At Price': '',
          'Variant Requires Shipping': '',
          'Variant Taxable': '',
          'Variant Barcode': '',
          'Image Src': images[i],
          'Image Position': (i + 1).toString(),
          'Image Alt Text': `${product.title} - Vista ${i + 1}`,
          'Gift Card': '',
          'SEO Title': '',
          'SEO Description': '',
          'Google Shopping / Google Product Category': '',
          'Google Shopping / Gender': '',
          'Google Shopping / Age Group': '',
          'Google Shopping / MPN': '',
          'Google Shopping / Condition': '',
          'Google Shopping / Custom Product': '',
          'Google Shopping / Custom Label 0': '',
          'Variant Image': '',
          'Variant Weight Unit': '',
          'Cost per item': '',
          Status: '',
        });
      }
    }
  }

  return rows;
}

/**
 * Generates ready-to-download Shopify CSV string
 */
export function generateShopifyCsv(
  products: CleansedProduct[],
  rawItemsMap: Map<string, ArkSwiftRawItem> = new Map(),
  options: CsvExportOptions = { mode: 'grouped_variants' }
): string {
  const rows = convertToShopifyCsvRows(products, rawItemsMap, options);
  return Papa.unparse(rows, {
    quotes: true,
    header: true,
    newline: '\r\n', // Standard Windows/Excel/Shopify CRLF line ending
  });
}

/**
 * Triggers a browser download of the generated Shopify CSV file
 */
export function downloadShopifyCsv(
  products: CleansedProduct[],
  rawItemsMap: Map<string, ArkSwiftRawItem> = new Map(),
  filename: string = 'shopify_products_export.csv',
  options: CsvExportOptions = { mode: 'grouped_variants' }
) {
  const csvContent = generateShopifyCsv(products, rawItemsMap, options);
  // Add UTF-8 BOM so Excel opens Spanish accents (ñ, á, é) properly
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
