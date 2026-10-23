import React, { useState, useMemo } from 'react';
import {
  Search,
  ShoppingBag,
  Eye,
  Code,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  Layers,
  Sparkles,
  ShieldCheck,
  Send,
  ExternalLink,
} from 'lucide-react';
import { CleansedProduct, GroupedProductListing, GroupedProductVariant, ArkSwiftRawItem } from '../types';
import { groupProductsIntoListings } from '../utils/shopifyCsvExporter';

interface ProductCatalogTableProps {
  products: CleansedProduct[];
  rawItemsMap: Map<string, ArkSwiftRawItem>;
  selectedListingIds: string[];
  onToggleSelectListing: (id: string) => void;
  onSelectAllListings: (select: boolean) => void;
  onPushListing: (listing: GroupedProductListing) => Promise<void>;
  onPreviewListing: (listing: GroupedProductListing) => void;
  onInspectListingPayload: (listing: GroupedProductListing) => void;
  onExportCsv?: (listingsToExport?: GroupedProductListing[]) => void;
  onOpenBatchSyncModal?: () => void;
  isPushing: boolean;
}

export const ProductCatalogTable: React.FC<ProductCatalogTableProps> = ({
  products,
  rawItemsMap,
  selectedListingIds,
  onToggleSelectListing,
  onSelectAllListings,
  onPushListing,
  onPreviewListing,
  onInspectListingPayload,
  onExportCsv,
  onOpenBatchSyncModal,
  isPushing,
}) => {
  const [expandedListingIds, setExpandedListingIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [syncFilter, setSyncFilter] = useState<'all' | 'synced' | 'unsynced'>('all');
  const [variantFilter, setVariantFilter] = useState<'all' | 'multi_only' | 'single_only'>('all');

  // Compute master listings using smart grouping algorithm
  const groupedListings = useMemo(() => {
    return groupProductsIntoListings(products, rawItemsMap);
  }, [products, rawItemsMap]);

  const toggleExpandListing = (id: string) => {
    setExpandedListingIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const expandAll = () => {
    setExpandedListingIds(groupedListings.map((l) => l.id));
  };

  const collapseAll = () => {
    setExpandedListingIds([]);
  };

  const filteredListings = groupedListings.filter((l) => {
    // Search
    const q = searchQuery.toLowerCase().trim();
    const matchSearch =
      !q ||
      l.title.toLowerCase().includes(q) ||
      l.originalBaseTitle.toLowerCase().includes(q) ||
      l.category.toLowerCase().includes(q) ||
      (l.englishCategory && l.englishCategory.toLowerCase().includes(q)) ||
      (l.shopifyCategory && l.shopifyCategory.toLowerCase().includes(q)) ||
      l.variants.some(
        (v) =>
          v.sku.toLowerCase().includes(q) ||
          v.originalSku.toLowerCase().includes(q) ||
          v.optionValue.toLowerCase().includes(q)
      );

    // Stock
    let matchStock = true;
    if (stockFilter === 'in_stock') matchStock = l.totalAvailableStock > 0;
    else if (stockFilter === 'low_stock') matchStock = l.totalStock > 0 && l.totalAvailableStock === 0;
    else if (stockFilter === 'out_of_stock') matchStock = l.totalStock === 0;

    // Sync
    let matchSync = true;
    if (syncFilter === 'synced') matchSync = l.syncStatus === 'success';
    else if (syncFilter === 'unsynced') matchSync = l.syncStatus !== 'success';

    // Variant Filter
    let matchVariant = true;
    if (variantFilter === 'multi_only') matchVariant = l.variants.length > 1;
    else if (variantFilter === 'single_only') matchVariant = l.variants.length === 1;

    return matchSearch && matchStock && matchSync && matchVariant;
  });

  const allFilteredSelected =
    filteredListings.length > 0 &&
    filteredListings.every((l) => selectedListingIds.includes(l.id));

  const multiVariantCount = groupedListings.filter((l) => l.variants.length > 1).length;
  const totalVariantsCount = groupedListings.reduce((sum, l) => sum + l.variants.length, 0);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl space-y-0">
      {/* 1. Core Architecture Notice Banner */}
      <div className="bg-gradient-to-r from-indigo-950/90 via-slate-900 to-slate-950 p-4 sm:px-6 border-b border-indigo-900/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-500/30 shrink-0 mt-0.5">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>主体 Listing 与智能变体归集架构</span>
                <span className="text-[10px] bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 px-2 py-0.5 rounded-full font-bold">
                  Aosom 母子关系引擎生效中
                </span>
              </h3>
              <span className="text-[10px] bg-sky-500/20 text-sky-200 border border-sky-400/30 px-2 py-0.5 rounded-full font-bold font-mono">
                EAN-13: ean:84157926XXXXC (全量配置)
              </span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 rounded-full font-bold">
                描述纯净化: 运输与售后已剥离
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              针对 Aosom 供应商表格<strong>无母子关系表</strong>的特征，系统已自动按型号根码、规格尺寸（
              <code className="text-amber-300 font-mono">Tamaño</code>）与颜色（
              <code className="text-amber-300 font-mono">Color</code>
              ）识别聚类为<strong>主体 Listing</strong>。上传后台时为<strong>单一商品（1个 Listing）</strong>
              。每个变体均已赋予符合标准的 13 位 EAN 条码（国家码 841 + 厂商代码 57926 + 随机 4 位 + 模10校验位，加前缀 <code className="text-sky-300 font-mono">ean:</code>），商品描述（Body HTML）纯净化处理，不写运输与售后政策。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
          <div className="text-right text-xs">
            <div className="text-slate-400">
              主体 Listing: <strong className="text-white font-mono text-sm">{groupedListings.length}</strong> 款
            </div>
            <div className="text-[11px] text-indigo-300 font-medium">
              包含 <strong className="text-amber-300 font-mono">{totalVariantsCount}</strong> 个子变体 SKU
            </div>
          </div>
        </div>
      </div>

      {/* 2. Controls & Search Toolbar */}
      <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索主体标题、子SKU、英文类目Tag、官方标准目录..."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400"
            />
          </div>

          <select
            value={variantFilter}
            onChange={(e) => setVariantFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-400"
          >
            <option value="all">全部款式 ({groupedListings.length})</option>
            <option value="multi_only">多变体聚合款 ({multiVariantCount})</option>
            <option value="single_only">单规格标准款 ({groupedListings.length - multiVariantCount})</option>
          </select>

          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-400"
          >
            <option value="all">全部库存状态</option>
            <option value="in_stock">现货充足 (可售)</option>
            <option value="low_stock">安全保护 (熔断)</option>
            <option value="out_of_stock">原仓缺货 (0件)</option>
          </select>

          <select
            value={syncFilter}
            onChange={(e) => setSyncFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-400"
          >
            <option value="all">全部上架状态</option>
            <option value="synced">已上架 (线上)</option>
            <option value="unsynced">待同步至Shopify (Active)</option>
          </select>

          <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
            <button
              onClick={expandAll}
              className="text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800 transition"
              title="全部展开查看子变体明细"
            >
              全部展开
            </button>
            <span className="text-slate-600">•</span>
            <button
              onClick={collapseAll}
              className="text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800 transition"
              title="全部收起"
            >
              全部收起
            </button>
          </div>
        </div>

        {/* Action Buttons: Batch Push & Export */}
        <div className="flex items-center gap-2.5 shrink-0 self-end lg:self-auto">
          {selectedListingIds.length > 0 && (
            <span className="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-lg border border-indigo-500/30 text-xs font-semibold">
              已选 {selectedListingIds.length} 个主体 Listing
            </span>
          )}

          {onOpenBatchSyncModal && (
            <button
              onClick={onOpenBatchSyncModal}
              disabled={isPushing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-md transition active:scale-95 disabled:opacity-50"
              title="批量推送主体商品到 Shopify 后台 (一个主体生成一个含多变体的商品)"
            >
              <Send className="w-3.5 h-3.5" />
              <span>批量推送到后台 {selectedListingIds.length > 0 ? `(${selectedListingIds.length})` : ''}</span>
            </button>
          )}

          {onExportCsv && (
            <button
              onClick={() => {
                const targetListings =
                  selectedListingIds.length > 0
                    ? filteredListings.filter((l) => selectedListingIds.includes(l.id))
                    : filteredListings;
                onExportCsv(targetListings);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-md transition active:scale-95"
              title="导出符合 Shopify 官方标准的多变体聚合 CSV (每个主体对应一个 Handle，包含全部变体行)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>导出 Shopify 标准 CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Master Listings Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/90 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
            <tr>
              <th className="py-3 px-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={(e) => onSelectAllListings(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                  title="全选/全不选当前筛选的主体 Listing"
                />
              </th>
              <th className="py-3 px-2 w-10 text-center">展开</th>
              <th className="py-3 px-3 w-16">主图</th>
              <th className="py-3 px-3 min-w-[320px]">主体 SEO 商品标题 &amp; 目录/标签映射</th>
              <th className="py-3 px-3 w-36">变体归集规格</th>
              <th className="py-3 px-3 w-44">EAN-13 条形码 (Barcode)</th>
              <th className="py-3 px-3 w-36">聚合售价区间</th>
              <th className="py-3 px-3 w-28">总可售库存</th>
              <th className="py-3 px-3 w-24 text-center">Shopify 状态</th>
              <th className="py-3 px-4 w-44 text-right">后台操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-slate-300">
            {filteredListings.map((listing) => {
              const isExpanded = expandedListingIds.includes(listing.id);
              const isSelected = selectedListingIds.includes(listing.id);
              const isMulti = listing.variants.length > 1;

              return (
                <React.Fragment key={listing.id}>
                  {/* Master Listing Row */}
                  <tr
                    className={`transition group ${
                      isSelected
                        ? 'bg-indigo-950/30 hover:bg-indigo-950/50'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-3.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelectListing(listing.id)}
                        className="rounded border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                      />
                    </td>

                    {/* Expand Chevron */}
                    <td className="py-3.5 px-2 text-center">
                      <button
                        onClick={() => toggleExpandListing(listing.id)}
                        className="p-1 hover:bg-slate-700/60 rounded text-slate-400 hover:text-white transition"
                        title={isExpanded ? '收起变体明细' : '展开变体明细'}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-indigo-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                    </td>

                    {/* Main Image */}
                    <td className="py-3.5 px-3">
                      <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-700/80 bg-slate-950 relative shrink-0">
                        <img
                          src={listing.images[0]}
                          alt={listing.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          loading="lazy"
                        />
                      </div>
                    </td>

                    {/* Unified Master Title & Category / Tag Badges */}
                    <td className="py-3.5 px-3">
                      <div className="font-semibold text-white line-clamp-1 group-hover:text-indigo-200 transition flex items-center gap-1.5">
                        <span title={listing.title}>{listing.title}</span>
                        {isMulti ? (
                          <span className="shrink-0 px-2 py-0.5 rounded text-[10px] bg-indigo-500/25 text-indigo-300 border border-indigo-400/30 font-bold flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            <span>{listing.variants.length} 变体合一</span>
                          </span>
                        ) : (
                          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700 font-medium">
                            单规格
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                        供应商原基础标题: {listing.originalBaseTitle}
                      </div>

                      {/* Category & Tag Badges */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {/* Requirement 1: Aosom 3rd-level English category tag */}
                        {listing.englishCategory && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-sky-950/90 text-sky-300 border border-sky-800/80 font-mono font-medium"
                            title="Aosom 供应商第三级英文目录名，已自动写入 Shopify 产品 Tag"
                          >
                            <span>🏷️ Tag:</span>
                            <span className="font-bold">{listing.englishCategory}</span>
                          </span>
                        )}

                        {/* Requirement 2: Shopify 1-2 Level Standard Category (never empty) */}
                        {listing.shopifyCategory && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-indigo-950/80 text-indigo-300 border border-indigo-800/80"
                            title="Shopify 官方标准类目（1-2级），已自动映射，后台不留空"
                          >
                            <span>🗂️</span>
                            <span>{listing.shopifyCategory}</span>
                          </span>
                        )}

                        {/* Brand badge */}
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-950/60 text-amber-300 border border-amber-800/60 font-semibold">
                          品牌: {listing.vendor}
                        </span>
                      </div>
                    </td>

                    {/* Variation Dimension & Values */}
                    <td className="py-3.5 px-3">
                      <div className="font-medium text-slate-200 text-xs flex items-center gap-1">
                        <span className="text-indigo-400 font-bold">{listing.optionName}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[150px] mt-0.5 font-mono">
                        {listing.variants.map((v) => v.optionValue).join(', ')}
                      </div>
                    </td>

                    {/* EAN-13 Barcode */}
                    <td className="py-3.5 px-3">
                      <div className="font-mono text-xs font-semibold text-sky-400 flex items-center gap-1.5">
                        <span className="bg-sky-950/80 border border-sky-800/80 px-2 py-0.5 rounded text-[11px] text-sky-300 font-mono tracking-tight select-all">
                          {listing.variants[0]?.barcode || 'ean:84157926...'}
                        </span>
                        {isMulti && (
                          <span
                            onClick={() => toggleExpandListing(listing.id)}
                            className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded cursor-pointer hover:bg-slate-700 hover:text-white transition"
                            title="展开查看所有子变体的专属 EAN 条码"
                          >
                            +{listing.variants.length - 1}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        国家码 841 • 厂商 57926
                      </div>
                    </td>

                    {/* Price Range & GMC Status */}
                    <td className="py-3.5 px-3">
                      <div className="font-mono font-bold text-amber-400 text-sm">
                        {listing.priceMin === listing.priceMax ? (
                          `€${listing.priceMin.toFixed(2)}`
                        ) : (
                          `€${listing.priceMin.toFixed(2)} ~ €${listing.priceMax.toFixed(2)}`
                        )}
                      </div>
                      {/* Requirement 3: Compare-at price omitted for GMC safety */}
                      <div className="text-[10px] text-emerald-400/90 font-medium flex items-center gap-1 mt-0.5">
                        <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>GMC合规(吊牌价已清空)</span>
                      </div>
                    </td>

                    {/* Total Stock */}
                    <td className="py-3.5 px-3">
                      <div className="font-mono font-bold text-white">
                        {listing.totalAvailableStock}{' '}
                        <span className="text-[10px] text-slate-400 font-normal">件可售</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        原仓合计: {listing.totalStock} 件
                      </div>
                    </td>

                    {/* Shopify Status */}
                    <td className="py-3.5 px-3 text-center">
                      {listing.syncStatus === 'success' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium" title="已成功推送至 Shopify 后台，状态为 Active">
                          <CheckCircle2 className="w-3 h-3" /> 已上架 (Active)
                        </span>
                      ) : listing.syncStatus === 'pending' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-medium">
                          <RefreshCw className="w-3 h-3 animate-spin" /> 上传中
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/70 text-[11px] font-medium" title="全量商品状态为 Active（含0库存商品，后续通过库存表单独更新）">
                          Active (待推)
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onPreviewListing(listing)}
                          className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
                          title="前台买家视角预览 (含变体切换和参数对比表)"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onInspectListingPayload(listing)}
                          className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-amber-400 rounded-lg transition"
                          title="查看将发送至 Shopify 后台的 1个 Listing + Variants 数据结构"
                        >
                          <Code className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onPushListing(listing)}
                          disabled={isPushing}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition active:scale-95 disabled:opacity-50 shadow-sm"
                          title="将此主体及其全部子变体作为一个 Listing 推送至 Shopify 后台"
                        >
                          推送到后台
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Sub-row: Child Variants Expansion Table */}
                  {isExpanded && (
                    <tr className="bg-slate-950/80 border-b border-slate-800">
                      <td colSpan={10} className="p-3 pl-14 pr-6">
                        <div className="bg-slate-900/90 rounded-xl border border-indigo-900/40 p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                            <span className="flex items-center gap-2 text-indigo-300">
                              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                              <span>
                                子变体明细列表 ({listing.variants.length} 项变体属于同一主体 Listing)
                              </span>
                            </span>
                            <span className="text-[11px] text-slate-400">
                              变体属性维度:{' '}
                              <strong className="text-amber-300 font-mono">
                                {listing.optionName}
                              </strong>
                            </span>
                          </div>

                          <table className="w-full text-left text-xs">
                            <thead className="text-[10px] text-slate-400 uppercase border-b border-slate-800 pb-1 bg-slate-950/40">
                              <tr>
                                <th className="py-1.5 px-3">图</th>
                                <th className="py-1.5 px-3">
                                  选项值 ({listing.optionName})
                                </th>
                                <th className="py-1.5 px-3">Casalivo SKU</th>
                                <th className="py-1.5 px-3">Aosom 原厂 SKU</th>
                                <th className="py-1.5 px-3">EAN 条形码 (Barcode)</th>
                                <th className="py-1.5 px-3">成本 (List Price + 运费)</th>
                                <th className="py-1.5 px-3">核算售价 (Price)</th>
                                <th className="py-1.5 px-3">原仓 ➔ 可售库存</th>
                                <th className="py-1.5 px-3">重量 / 规格</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 text-slate-300">
                              {listing.variants.map((v) => (
                                <tr key={v.id} className="hover:bg-slate-800/40">
                                  <td className="py-2 px-3">
                                    <div className="w-8 h-8 rounded border border-slate-700 bg-slate-950 overflow-hidden">
                                      <img
                                        src={v.image || listing.images[0]}
                                        alt=""
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 font-bold text-white">
                                    {v.optionValue}
                                  </td>
                                  <td className="py-2 px-3 font-mono text-amber-300 font-semibold">
                                    {v.sku}
                                  </td>
                                  <td className="py-2 px-3 font-mono text-slate-400">
                                    {v.originalSku}
                                  </td>
                                  <td className="py-2 px-3 font-mono text-[11px] text-sky-400 font-semibold whitespace-nowrap">
                                    {v.barcode || '-'}
                                  </td>
                                  <td className="py-2 px-3 font-mono text-slate-300">
                                    <div>€{v.costPrice.toFixed(2)}</div>
                                    {v.esShippingFee !== undefined && v.esShippingFee > 0 && (
                                      <div className="text-[10px] text-slate-500 font-mono">
                                        底€{v.listPrice?.toFixed(2)} + 运€{v.esShippingFee.toFixed(2)}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 font-mono">
                                    <div className="font-bold text-emerald-400">€{v.price.toFixed(2)}</div>
                                    <div className="text-[10px] text-amber-400/90 font-mono">
                                      {v.costPrice <= 100 ? '1.55x' : v.costPrice <= 200 ? '1.50x' : '1.45x'}
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 font-mono">
                                    <span className="text-slate-400">{v.stock}件</span> ➔{' '}
                                    <span className="text-white font-bold">
                                      {v.availableStock}件
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-slate-400 text-[11px]">
                                    {v.weight ? `${v.weight} kg` : '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {filteredListings.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-500">
                  <div className="max-w-xs mx-auto space-y-2">
                    <p className="text-sm font-medium">未找到符合条件的主体商品</p>
                    <p className="text-xs text-slate-600">
                      请尝试重置搜索关键词，或点击右上角「导入表格」添加新数据
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
