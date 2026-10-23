import React, { useState } from 'react';
import { Sliders, Sparkles, Shield, DollarSign, Plus, Trash2, ArrowRight, Tag, Calculator } from 'lucide-react';
import { WhitewashConfig, PricingConfig, PricingTier } from '../types';
import { calculatePricing } from '../utils/whitewashEngine';

interface WhitewashPricingPanelProps {
  whitewashConfig: WhitewashConfig;
  pricingConfig: PricingConfig;
  onUpdateWhitewash: (config: WhitewashConfig) => void;
  onUpdatePricing: (config: PricingConfig) => void;
}

export const WhitewashPricingPanel: React.FC<WhitewashPricingPanelProps> = ({
  whitewashConfig,
  pricingConfig,
  onUpdateWhitewash,
  onUpdatePricing,
}) => {
  const [activeTab, setActiveTab] = useState<'whitewash' | 'pricing'>('pricing');
  const [simListPrice, setSimListPrice] = useState<number>(35.0);
  const [simShippingFee, setSimShippingFee] = useState<number>(7.5);
  const [newBannedWord, setNewBannedWord] = useState('');

  // Simulator calculation: List Price + ES Shipping Fee
  const simTotalCost = (simListPrice || 0) + (simShippingFee || 0);
  const simResult = calculatePricing(simTotalCost, pricingConfig);

  const handleAddTier = () => {
    const newTier: PricingTier = {
      id: `tier-${Date.now()}`,
      name: `区间 ${pricingConfig.tiers.length + 1}`,
      minCost: 100,
      maxCost: 200,
      multiplier: 1.6,
      flatFee: 0,
    };
    onUpdatePricing({
      ...pricingConfig,
      tiers: [...pricingConfig.tiers, newTier],
    });
  };

  const handleUpdateTier = (id: string, field: keyof PricingTier, value: any) => {
    const updated = pricingConfig.tiers.map((t) => (t.id === id ? { ...t, [field]: value } : t));
    onUpdatePricing({ ...pricingConfig, tiers: updated });
  };

  const handleDeleteTier = (id: string) => {
    if (pricingConfig.tiers.length <= 1) return;
    onUpdatePricing({
      ...pricingConfig,
      tiers: pricingConfig.tiers.filter((t) => t.id !== id),
    });
  };

  const handleAddBannedWord = () => {
    if (!newBannedWord.trim()) return;
    if (!whitewashConfig.bannedKeywords.includes(newBannedWord.trim())) {
      onUpdateWhitewash({
        ...whitewashConfig,
        bannedKeywords: [...whitewashConfig.bannedKeywords, newBannedWord.trim()],
      });
    }
    setNewBannedWord('');
  };

  const handleRemoveBannedWord = (word: string) => {
    onUpdateWhitewash({
      ...whitewashConfig,
      bannedKeywords: whitewashConfig.bannedKeywords.filter((w) => w !== word),
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl mb-6">
      {/* Tab Navigation */}
      <div className="bg-slate-800/80 px-6 py-3 border-b border-slate-700/80 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('pricing')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'pricing'
                ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>阶梯定价与利润引擎 (Tiered Pricing)</span>
          </button>

          <button
            onClick={() => setActiveTab('whitewash')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'whitewash'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>品牌洗白与敏感词过滤 (Brand Whitewash)</span>
          </button>
        </div>

        <span className="text-xs text-slate-400 hidden sm:block">
          所有修改实时作用于商品列表与推送 Payload
        </span>
      </div>

      <div className="p-6">
        {activeTab === 'pricing' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Tier Config */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    阶梯定价引擎 (List Price + ES Shipping Fee)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Aosom 原始 List Price 与 ES Shipping Fee 相加后按阶梯核算售价：≤ €100 (1.55x)、€100~€200 (1.50x)、&gt; €200 (1.45x)
                  </p>
                </div>
                <button
                  onClick={handleAddTier}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs rounded-lg border border-slate-700 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>添加阶梯</span>
                </button>
              </div>

              {/* Tiers List */}
              <div className="space-y-2.5">
                {pricingConfig.tiers.map((tier, idx) => (
                  <div
                    key={tier.id}
                    className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center gap-3 text-xs"
                  >
                    <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-400 font-bold flex items-center justify-center text-[11px]">
                      {idx + 1}
                    </div>

                    <div className="flex-1 min-w-[140px]">
                      <input
                        type="text"
                        value={tier.name}
                        onChange={(e) => handleUpdateTier(tier.id, 'name', e.target.value)}
                        className="bg-transparent font-medium text-white focus:outline-none w-full border-b border-transparent focus:border-amber-400"
                      />
                      <div className="text-[10px] text-slate-500">区间名称</div>
                    </div>

                    {/* Min - Max Cost */}
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500">€</span>
                      <input
                        type="number"
                        value={tier.minCost}
                        onChange={(e) => handleUpdateTier(tier.id, 'minCost', parseFloat(e.target.value) || 0)}
                        className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-white text-center focus:outline-none focus:border-amber-400"
                      />
                      <span className="text-slate-500">~</span>
                      <input
                        type="number"
                        value={tier.maxCost >= 999999 ? '∞' : tier.maxCost}
                        onChange={(e) =>
                          handleUpdateTier(
                            tier.id,
                            'maxCost',
                            e.target.value === '∞' ? 999999 : parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-white text-center focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    {/* Multiplier */}
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">×</span>
                      <input
                        type="number"
                        step="0.1"
                        value={tier.multiplier}
                        onChange={(e) => handleUpdateTier(tier.id, 'multiplier', parseFloat(e.target.value) || 1)}
                        className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-amber-400 font-bold text-center focus:outline-none focus:border-amber-400"
                      />
                      <span className="text-slate-500">倍</span>
                    </div>

                    {/* Flat Fee */}
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">+€</span>
                      <input
                        type="number"
                        value={tier.flatFee}
                        onChange={(e) => handleUpdateTier(tier.id, 'flatFee', parseFloat(e.target.value) || 0)}
                        className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-white text-center focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    {pricingConfig.tiers.length > 1 && (
                      <button
                        onClick={() => handleDeleteTier(tier.id)}
                        className="text-slate-500 hover:text-rose-400 p-1"
                        title="删除区间"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* GMC Protection Notice Banner & Extra Pricing Controls */}
              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-3 text-xs">
                {/* GMC Compare-at price toggle */}
                <div className="p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors duration-200 bg-slate-900/90 border-slate-700">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-xs">
                        划线吊牌价 (Compare-At Price / 促销划线价)
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${pricingConfig.enableCompareAtPrice ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
                        {pricingConfig.enableCompareAtPrice ? '已开启' : '已关闭 (GMC 安全模式)'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {pricingConfig.enableCompareAtPrice
                        ? '已启用划线原价展示。请确保已有真实销售记录或参考价格。'
                        : '已遵循 GMC (Google Merchant Center) 规范关闭虚假划线价，Shopify 前台及导出的 CSV 中划线价为空，仅保留真实售价。'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onUpdatePricing({
                        ...pricingConfig,
                        enableCompareAtPrice: !pricingConfig.enableCompareAtPrice,
                      })
                    }
                    className={`shrink-0 px-3 py-1.5 rounded-lg font-bold text-xs transition flex items-center gap-1.5 ${
                      pricingConfig.enableCompareAtPrice
                        ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                  >
                    {pricingConfig.enableCompareAtPrice ? '关闭吊牌价 (推荐)' : '开启吊牌价'}
                  </button>
                </div>

                {!pricingConfig.enableCompareAtPrice && (
                  <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-lg text-[11px] text-amber-200/90 flex items-start gap-2">
                    <span className="text-base shrink-0 leading-none">🛡️</span>
                    <div>
                      <strong>GMC 防封提示：</strong> 新独立站未有充分历史销售记录前若标注划线原价，Google GMC 审核会直接判定“虚假折扣 / 不实陈述 (Misrepresentation)”导致封号。待 GMC 审核通过稳定后，再开启此开关配置促销划线价。
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="block text-slate-400 mb-1">尾数价格规整</label>
                    <select
                      value={pricingConfig.rounding}
                      onChange={(e) => onUpdatePricing({ ...pricingConfig, rounding: e.target.value as any })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="99">.99 心理价 (如 €79.99)</option>
                      <option value="95">.95 促销价 (如 €79.95)</option>
                      <option value="integer">取整整数 (如 €80.00)</option>
                      <option value="none">保留原计算两位小数</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">划线原价倍率 (若开启)</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.05"
                        disabled={!pricingConfig.enableCompareAtPrice}
                        value={pricingConfig.compareAtMultiplier}
                        onChange={(e) =>
                          onUpdatePricing({
                            ...pricingConfig,
                            compareAtMultiplier: parseFloat(e.target.value) || 1.3,
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-amber-400 disabled:opacity-40"
                      />
                      <span className="text-slate-500">×售价</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">单件附加杂费 / 运费</label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500">€</span>
                      <input
                        type="number"
                        value={pricingConfig.shippingFee}
                        onChange={(e) =>
                          onUpdatePricing({
                            ...pricingConfig,
                            shippingFee: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Live Interactive Simulator */}
            <div className="lg:col-span-5 flex flex-col justify-between">
              <div className="bg-gradient-to-br from-slate-950 to-slate-900 p-5 rounded-2xl border border-amber-500/30 shadow-xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg">
                      <Calculator className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">实时加价模拟器 (Pricing Simulator)</h4>
                      <p className="text-[10px] text-slate-400">输入进货供货价，即刻核算最终零售价与毛利</p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono">
                    {simResult.appliedTier}
                  </span>
                </div>

                {/* Dual Inputs: List Price & ES Shipping Fee */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Aosom List Price:
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-slate-400 font-bold text-xs">€</span>
                      <input
                        type="number"
                        step="0.5"
                        value={simListPrice}
                        onChange={(e) => setSimListPrice(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-amber-500/50 rounded-xl pl-6 pr-2 py-1.5 text-white font-mono text-sm font-bold focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      ES Shipping Fee:
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-slate-400 font-bold text-xs">€</span>
                      <input
                        type="number"
                        step="0.5"
                        value={simShippingFee}
                        onChange={(e) => setSimShippingFee(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-amber-500/50 rounded-xl pl-6 pr-2 py-1.5 text-white font-mono text-sm font-bold focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Base Cost Badge */}
                <div className="p-2 bg-slate-900/90 border border-slate-800 rounded-lg flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">两者相加基准成本:</span>
                  <span className="text-amber-300 font-bold">
                    €{simListPrice.toFixed(2)} + €{simShippingFee.toFixed(2)} = €{simTotalCost.toFixed(2)}
                  </span>
                </div>

                {/* Calculation Outputs */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 mb-0.5">Shopify 建议售价 (Price)</div>
                    <div className="text-xl font-extrabold text-amber-400 font-mono">
                      €{simResult.sellingPrice.toFixed(2)}
                    </div>
                    {pricingConfig.enableCompareAtPrice && simResult.compareAtPrice > 0 ? (
                      <div className="text-[10px] text-slate-500 line-through">
                        原价 €{simResult.compareAtPrice.toFixed(2)}
                      </div>
                    ) : (
                      <div className="text-[10px] text-emerald-400 font-medium">
                        吊牌价已关闭 (GMC安全)
                      </div>
                    )}
                  </div>

                  <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 mb-0.5">毛利润 &amp; 利润率</div>
                    <div className="text-xl font-extrabold text-emerald-400 font-mono">
                      €{simResult.profitAmount.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-emerald-400 font-medium">
                      毛利率 {simResult.profitMargin}%
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/60 space-y-1">
                  <div className="flex justify-between">
                    <span>相加总成本 (List + 运费):</span>
                    <span className="font-mono text-white">€{simTotalCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>核算匹配倍率:</span>
                    <span className="font-mono text-amber-300 font-semibold">
                      {simTotalCost <= 100 ? '1.55x (≤€100)' : simTotalCost <= 200 ? '1.50x (€100~€200)' : '1.45x (>€200)'}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold text-amber-300 pt-1 border-t border-slate-800">
                    <span>纯利润 (每件):</span>
                    <span className="font-mono text-emerald-400">€{simResult.profitAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Tab 2: Brand Whitewashing Rules */
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  目标独立站品牌名 (Brand Name)
                </label>
                <p className="text-[10px] text-slate-500 mb-2">
                  原厂所有品牌与供应商（如 SPANISH AOSOM SL）将统一清洗为此品牌
                </p>
                <input
                  type="text"
                  value={whitewashConfig.brandName}
                  onChange={(e) => onUpdateWhitewash({ ...whitewashConfig, brandName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-bold focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  SKU 规范前缀 (Brand SKU Prefix)
                </label>
                <p className="text-[10px] text-slate-500 mb-2">
                  自动将原厂 SKU（如 01-0340）规范为属于你品牌的商品编号
                </p>
                <input
                  type="text"
                  value={whitewashConfig.skuPrefix}
                  onChange={(e) => onUpdateWhitewash({ ...whitewashConfig, skuPrefix: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-amber-300 font-mono font-bold focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  安全库存保护阈值 (Safety Stock Buffer)
                </label>
                <p className="text-[10px] text-slate-500 mb-2">
                  当原仓库存低于此值，Shopify 自动显示售罄或下架防超卖
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={whitewashConfig.safetyStockBuffer}
                    onChange={(e) =>
                      onUpdateWhitewash({
                        ...whitewashConfig,
                        safetyStockBuffer: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-bold focus:outline-none focus:border-indigo-400"
                  />
                  <span className="text-xs text-slate-400 shrink-0">件/款</span>
                </div>
              </div>
            </div>

            {/* Banned Keywords & Supplier Blacklist */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-rose-400" />
                    敏感词与违禁词过滤库 (Banned Keywords)
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    在标题、详情中检测到以下词汇时将自动抹除，防止买家查出原厂来源或原售后声明
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newBannedWord}
                    onChange={(e) => setNewBannedWord(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddBannedWord()}
                    placeholder="添加敏感词..."
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-rose-400"
                  />
                  <button
                    onClick={handleAddBannedWord}
                    className="px-2.5 py-1 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 text-xs rounded-lg transition"
                  >
                    + 添加
                  </button>
                </div>
              </div>

              {/* Tag Cloud */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {whitewashConfig.bannedKeywords.map((word) => (
                  <span
                    key={word}
                    className="inline-flex items-center gap-1 bg-slate-900 text-slate-300 px-2.5 py-1 rounded-md text-xs border border-slate-800 hover:border-rose-500/40 transition group"
                  >
                    <span>{word}</span>
                    <button
                      onClick={() => handleRemoveBannedWord(word)}
                      className="text-slate-500 group-hover:text-rose-400 ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* EAN-13 Barcode & Clean Description Hygiene Card */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-sky-500/20 text-sky-400 rounded-lg">
                    <Tag className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">
                      EAN-13 国际条形码与描述纯净化规则 (Barcode &amp; Description Hygiene)
                    </h4>
                    <p className="text-[10px] text-slate-400">
                      严格遵循用户定制的 EAN-13 生成规则与独立站政策分离规范
                    </p>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded font-mono font-bold">
                  规则已生效
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800">
                  <div className="text-sky-400 font-bold flex items-center gap-1.5 mb-1">
                    <span>📦 13位 EAN 条形码规则 (Barcode)</span>
                  </div>
                  <ul className="text-slate-400 text-[11px] space-y-1 list-disc list-inside">
                    <li><strong className="text-white">国家代码:</strong> 841 (西班牙)</li>
                    <li><strong className="text-white">厂商代码:</strong> 57926</li>
                    <li><strong className="text-white">商品代码:</strong> 4位随机数字</li>
                    <li><strong className="text-white">校验码:</strong> GS1 Modulo-10 标准算法</li>
                    <li><strong className="text-white">格式前缀:</strong> 带 <code className="text-amber-300 font-mono">ean:</code> (如 <code className="text-emerald-400 font-mono">ean:8415792615295</code>)</li>
                  </ul>
                </div>

                <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800">
                  <div className="text-emerald-400 font-bold flex items-center gap-1.5 mb-1">
                    <span>🚫 纯净商品描述：运输与售后不写在描述里</span>
                  </div>
                  <ul className="text-slate-400 text-[11px] space-y-1 list-disc list-inside">
                    <li><strong className="text-white">去运输化:</strong> 彻底剔除发货、快递、时效等语句</li>
                    <li><strong className="text-white">去售后化:</strong> 剔除原厂质保、保修、退换等条款</li>
                    <li><strong className="text-white">职责分离:</strong> 运输由独立站 Shipping Policy 统一展示</li>
                    <li><strong className="text-white">避免冲突:</strong> 售后由 Refund Policy 统一承载，避免描述臃肿</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Category & Tags Automation Card */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-bold text-white">
                  Aosom 英文三级类目与 Shopify 标准类目双向映射引擎
                </h4>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                按照平台规范，供应商表格中的三级英文目录（如 <code className="text-amber-300 font-mono">Greenhouse</code>、<code className="text-amber-300 font-mono">Nightstands</code>、<code className="text-amber-300 font-mono">Sun Loungers</code>、<code className="text-amber-300 font-mono">Camping & Hiking</code>）将自动执行：
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800">
                  <span className="text-amber-400 font-bold block mb-1">🏷️ 自动填入产品 Tags 标签</span>
                  <span className="text-slate-400 text-[11px]">
                    保留原始英文三级类目为 Tag，利于按精准品类过滤聚合与投放。
                  </span>
                </div>
                <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800">
                  <span className="text-sky-400 font-bold block mb-1">🗂️ 自动映射 Shopify 1-2 级官方类目</span>
                  <span className="text-slate-400 text-[11px]">
                    自动映射标准类目（例如 <code className="text-slate-300 font-mono">Home & Garden &gt; Lawn & Garden</code>），确保 Shopify 后台 Category 列不再留空。
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
