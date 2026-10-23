import React, { useState } from 'react';
import { X, Code, Copy, Check, Terminal, Layers } from 'lucide-react';
import { CleansedProduct, GroupedProductListing, ShopifyConfig } from '../types';
import { generateEan13Barcode, isValidEanBarcode } from '../utils/whitewashEngine';

interface PayloadInspectModalProps {
  product: CleansedProduct | null;
  listing?: GroupedProductListing | null;
  shopifyConfig: ShopifyConfig;
  onClose: () => void;
}

export const PayloadInspectModal: React.FC<PayloadInspectModalProps> = ({
  product,
  listing,
  shopifyConfig,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!product && !listing) return null;

  const isListing = Boolean(listing && listing.variants && listing.variants.length > 0);

  const payload = isListing
    ? {
        product: {
          title: listing!.title,
          body_html: listing!.descriptionHtml,
          vendor: listing!.vendor,
          product_category: listing!.shopifyCategory || 'Home & Garden > Lawn & Garden',
          product_type: listing!.category,
          tags: listing!.tags.join(', '),
          status: 'active',
          images: listing!.images.slice(0, 8).map((src) => ({ src })),
          options: [
            {
              name: listing!.optionName,
              values: listing!.variants.map((v) => v.optionValue),
            },
          ],
          variants: listing!.variants.map((v) => ({
            option1: v.optionValue,
            sku: v.sku,
            price: v.price.toFixed(2),
            compare_at_price: v.compareAtPrice > 0 ? v.compareAtPrice.toFixed(2) : null,
            inventory_management: 'shopify',
            inventory_policy: 'deny',
            fulfillment_service: 'manual',
            requires_shipping: true,
            barcode: isValidEanBarcode(v.barcode) ? v.barcode : generateEan13Barcode(v.sku),
          })),
        },
        inventory_adjustments: listing!.variants.map((v) => ({
          sku: v.sku,
          location_id: shopifyConfig.locationId || 'LOC_DEFAULT',
          available: v.availableStock,
        })),
        note: 'Uploaded as ONE Shopify Product Listing containing all child variants',
      }
    : {
        product: {
          title: product!.title,
          body_html: product!.descriptionHtml,
          vendor: product!.vendor,
          product_category: product!.shopifyCategory || 'Home & Garden > Lawn & Garden',
          product_type: product!.category,
          tags: product!.tags.join(', '),
          status: product!.status,
          images: product!.images.map((src) => ({ src })),
          variants: [
            {
              sku: product!.sku,
              price: product!.price.toFixed(2),
              compare_at_price: product!.compareAtPrice > 0 ? product!.compareAtPrice.toFixed(2) : null,
              inventory_management: 'shopify',
              inventory_policy: 'deny',
              fulfillment_service: 'manual',
              requires_shipping: true,
              barcode: isValidEanBarcode(product!.barcode) ? product!.barcode : generateEan13Barcode(product!.sku),
            },
          ],
        },
        inventory_adjustment: {
          location_id: shopifyConfig.locationId || 'LOC_DEFAULT',
          available: product!.availableStock,
        },
      };

  const jsonString = JSON.stringify(payload, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl my-6 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-slate-800/80 px-6 py-4 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg">
              <Code className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Shopify Admin API Payload 报文
                {isListing ? (
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-bold px-2 py-0.5 rounded border border-indigo-500/30 flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    单个 Listing (下挂 {listing!.variants.length} 个子变体)
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-800 text-amber-300 font-mono px-2 py-0.5 rounded border border-slate-700">
                    {product!.sku}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                POST https://{shopifyConfig.shopDomain || 'store.myshopify.com'}/admin/api/2024-04/products.json
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-slate-950 p-4 font-mono text-xs text-amber-300/90 leading-relaxed">
          <pre className="select-all">{jsonString}</pre>
        </div>

        {/* Footer */}
        <div className="bg-slate-800/80 px-6 py-3 border-t border-slate-700/80 flex items-center justify-between">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-slate-500" />
            已自动绑定 Casalivo 品牌、毛利阶梯定价与多图列表
          </span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? '已复制 JSON' : '复制 Payload'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
