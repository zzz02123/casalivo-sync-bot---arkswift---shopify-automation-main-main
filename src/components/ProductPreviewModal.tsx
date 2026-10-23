import React, { useState } from 'react';
import { X, Check, ShieldCheck, Truck, RotateCcw, Star, ShoppingCart, Layers } from 'lucide-react';
import { CleansedProduct, GroupedProductListing, GroupedProductVariant } from '../types';

interface ProductPreviewModalProps {
  product: CleansedProduct | null;
  listing?: GroupedProductListing | null;
  onClose: () => void;
}

export const ProductPreviewModal: React.FC<ProductPreviewModalProps> = ({ product, listing, onClose }) => {
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);

  if (!product && !listing) return null;

  const isListing = Boolean(listing && listing.variants && listing.variants.length > 0);
  const variants = isListing ? listing!.variants : [];
  const currentVariant: GroupedProductVariant | null = isListing ? variants[selectedVariantIdx] || variants[0] : null;

  const displayTitle = listing ? listing.title : product!.title;
  const displayVendor = listing ? listing.vendor : product!.vendor;
  const displayCategory = listing ? listing.category : product!.category;
  const displayEnglishCat = listing ? listing.englishCategory : product!.englishCategory;
  const displayShopifyCat = listing ? listing.shopifyCategory : product!.shopifyCategory;
  const displayPrice = currentVariant ? currentVariant.price : product!.price;
  const displayCompareAt = currentVariant ? currentVariant.compareAtPrice : product!.compareAtPrice;
  const displaySku = currentVariant ? currentVariant.sku : product!.sku;
  const rawBarcode = currentVariant ? currentVariant.barcode : product!.barcode;
  const displayBarcode = rawBarcode && rawBarcode.startsWith('ean:84157926') ? rawBarcode : `ean:84157926${Math.floor(1000 + Math.random() * 9000)}0`;
  const displayStock = currentVariant ? currentVariant.availableStock : product!.availableStock;
  const displayImages = listing ? listing.images : product!.images;
  const displayImage = currentVariant?.image || displayImages[0];
  const displayDescHtml = listing ? listing.descriptionHtml : product!.descriptionHtml;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white text-slate-900 rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl my-6 flex flex-col max-h-[90vh]">
        {/* Mock Storefront Header */}
        <div className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-amber-400 tracking-tight text-sm">CASALIVO</span>
            <span className="text-slate-500 text-xs">| 独立站单个 Listing 详情页渲染模拟</span>
            {isListing && (
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded font-bold">
                主体包含 {variants.length} 个子变体
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Storefront Layout */}
        <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-8 overflow-y-auto">
          {/* Gallery */}
          <div className="space-y-3">
            <div className="aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shadow-inner">
              <img
                src={displayImage}
                alt={displayTitle}
                className="w-full h-full object-cover transition-all duration-300"
              />
            </div>
            {displayImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {displayImages.slice(0, 5).map((img, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      if (isListing) {
                        const matchVarIdx = variants.findIndex((v) => v.image === img);
                        if (matchVarIdx >= 0) setSelectedVariantIdx(matchVarIdx);
                      }
                    }}
                    className={`w-14 h-14 rounded-lg overflow-hidden border cursor-pointer shrink-0 transition ${
                      displayImage === img ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-slate-200 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Product Details */}
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-indigo-600 font-semibold mb-1 flex flex-wrap items-center gap-1.5">
                <span>{displayVendor} • {displayCategory}</span>
                {displayEnglishCat && (
                  <span className="text-[10px] bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded font-mono">
                    Tag: {displayEnglishCat}
                  </span>
                )}
                {displayShopifyCat && (
                  <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">
                    {displayShopifyCat}
                  </span>
                )}
              </div>
              <h2 className="text-lg md:text-xl font-bold text-slate-900 leading-snug">{displayTitle}</h2>
              <div className="text-xs text-slate-500 font-mono mt-1 flex flex-wrap items-center gap-2">
                <span>SKU: <strong className="text-slate-800">{displaySku}</strong></span>
                {displayBarcode && (
                  <>
                    <span>•</span>
                    <span>EAN: <strong className="text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">{displayBarcode}</strong></span>
                  </>
                )}
                <span>•</span>
                <span className="text-emerald-600 font-medium flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> 现货 ({displayStock} 件)
                </span>
              </div>
            </div>

            {/* Price Box */}
            <div className="flex items-baseline space-x-3 p-3 bg-amber-50/70 rounded-xl border border-amber-200/80">
              <span className="text-3xl font-extrabold text-slate-900">€{displayPrice.toFixed(2)}</span>
              {displayCompareAt > displayPrice ? (
                <span className="text-base text-slate-400 line-through">
                  €{displayCompareAt.toFixed(2)}
                </span>
              ) : (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-200">
                  🛡️ GMC合规原价 (无虚假划线)
                </span>
              )}
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-600 text-white">
                包邮含税
              </span>
            </div>

            {/* Variant Option Selector (When multi-variant) */}
            {isListing && variants.length > 1 && (
              <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    <span>选择 {listing!.optionName}:</span>
                  </label>
                  <span className="text-xs font-bold text-indigo-600">
                    {currentVariant?.optionValue}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v, idx) => {
                    const isSelected = idx === selectedVariantIdx;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelectedVariantIdx(idx)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/20'
                            : 'bg-white text-slate-700 border border-slate-300 hover:border-slate-400'
                        }`}
                      >
                        <span>{v.optionValue}</span>
                        <span className={`text-[10px] font-mono ${isSelected ? 'text-amber-300' : 'text-slate-500'}`}>
                          (€{v.price.toFixed(2)})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* CTA Button */}
            <button className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md transition">
              <ShoppingCart className="w-4 h-4" />
              <span>加入购物车 (Add to Cart)</span>
            </button>

            {/* Trust Badges */}
            <div className="grid grid-cols-3 gap-2 py-3 border-y border-slate-200 text-center text-[11px] text-slate-600">
              <div className="flex flex-col items-center gap-1">
                <Truck className="w-4 h-4 text-slate-700" />
                <span>欧洲本地极速派送</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <RotateCcw className="w-4 h-4 text-slate-700" />
                <span>30天无忧退换</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <span>Casalivo 正品保真</span>
              </div>
            </div>

            {/* Description Preview (With Specifications Table) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                <span>商品详情描述 (Body HTML)</span>
                <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  ✓ 纯净版：运输与售后不写入描述
                </span>
              </div>
              <div className="text-xs text-slate-600 leading-relaxed max-h-48 overflow-y-auto pr-1 p-2.5 bg-slate-50/70 rounded-lg border border-slate-200">
                <div
                  dangerouslySetInnerHTML={{ __html: displayDescHtml }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
