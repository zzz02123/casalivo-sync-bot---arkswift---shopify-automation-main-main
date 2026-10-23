import React from 'react';
import { Package, TrendingUp, ShieldAlert, CheckCircle2, DollarSign, Layers } from 'lucide-react';
import { CleansedProduct, PricingConfig, WhitewashConfig } from '../types';

interface DashboardStatsProps {
  products: CleansedProduct[];
  pricingConfig: PricingConfig;
  whitewashConfig: WhitewashConfig;
  masterListingCount?: number;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({
  products,
  pricingConfig,
  whitewashConfig,
  masterListingCount,
}) => {
  const totalCount = products.length;
  const inStockCount = products.filter((p) => p.availableStock > 0).length;
  const lowStockCount = products.filter((p) => p.stock > 0 && p.availableStock === 0).length;
  const syncedCount = products.filter((p) => p.syncStatus === 'success').length;

  const totalCost = products.reduce((sum, p) => sum + p.costPrice * p.availableStock, 0);
  const totalRevenue = products.reduce((sum, p) => sum + p.price * p.availableStock, 0);
  const avgMargin =
    products.length > 0
      ? (products.reduce((sum, p) => sum + p.profitMargin, 0) / products.length).toFixed(1)
      : '0.0';

  const avgPrice =
    products.length > 0
      ? (products.reduce((sum, p) => sum + p.price, 0) / products.length).toFixed(2)
      : '0.00';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 mb-6">
      {/* 1. Master Listings / Variants */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-slate-400 mb-1.5">
          <span className="text-xs font-medium">主体 Listing</span>
          <Layers className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="text-2xl font-bold text-white tracking-tight">
          {masterListingCount !== undefined ? masterListingCount : totalCount}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
          <span className="text-indigo-400 font-semibold">{totalCount} 个</span> 子变体 SKU (Aosom母子归集)
        </div>
      </div>

      {/* 2. In Stock */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-slate-400 mb-1.5">
          <span className="text-xs font-medium">可售现货</span>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="text-2xl font-bold text-emerald-400 tracking-tight">{inStockCount}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          安全缓冲量: -{whitewashConfig.safetyStockBuffer} 件/款
        </div>
      </div>

      {/* 3. Product Status */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-slate-400 mb-1.5">
          <span className="text-xs font-medium">全量商品状态</span>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="text-2xl font-bold text-emerald-400 tracking-tight">Active</div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          含0库存全部上架 (库存后续单独更新)
        </div>
      </div>

      {/* 4. Avg Margin */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-slate-400 mb-1.5">
          <span className="text-xs font-medium">平均毛利率</span>
          <TrendingUp className="w-4 h-4 text-sky-400" />
        </div>
        <div className="text-2xl font-bold text-sky-400 tracking-tight">{avgMargin}%</div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          按 {pricingConfig.tiers.length} 阶梯加价核算
        </div>
      </div>

      {/* 5. Avg Retail Price */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-slate-400 mb-1.5">
          <span className="text-xs font-medium">均件零售价</span>
          <DollarSign className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="text-2xl font-bold text-white tracking-tight">€{avgPrice}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          尾数: .{pricingConfig.rounding} 规整
        </div>
      </div>

      {/* 6. Synced to Shopify */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-slate-400 mb-1.5">
          <span className="text-xs font-medium">Shopify 已同步</span>
          <Layers className="w-4 h-4 text-purple-400" />
        </div>
        <div className="text-2xl font-bold text-purple-400 tracking-tight">
          {syncedCount} <span className="text-xs text-slate-500 font-normal">/ {totalCount}</span>
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          {syncedCount === totalCount && totalCount > 0 ? '全部就绪' : '等待一键上架'}
        </div>
      </div>
    </div>
  );
};
