import React, { useState } from 'react';
import { ShoppingBag, Key, CheckCircle2, AlertCircle, RefreshCw, X, Shield, ArrowRight, Play, Terminal } from 'lucide-react';
import { ShopifyConfig, CleansedProduct } from '../types';

interface ShopifyPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ShopifyConfig;
  onUpdateConfig: (config: ShopifyConfig) => void;
  products: CleansedProduct[];
  selectedIds: string[];
  onExecuteSync: (mode: 'full' | 'stock_only', isDryRun: boolean) => Promise<void>;
  isSyncing: boolean;
  syncLogs: string[];
  onOpenCleanupModal?: () => void;
}

export const ShopifyPublishModal: React.FC<ShopifyPublishModalProps> = ({
  isOpen,
  onClose,
  config,
  onUpdateConfig,
  products,
  selectedIds,
  onExecuteSync,
  isSyncing,
  syncLogs,
  onOpenCleanupModal,
}) => {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; locations?: any[] } | null>(null);
  const [syncMode, setSyncMode] = useState<'full' | 'stock_only'>('full');
  const [isDryRun, setIsDryRun] = useState(false);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/shopify/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopDomain: config.shopDomain }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: `店铺连接成功: ${data.shop.name} (${data.shop.domain}) - 货币: ${data.shop.currency}`,
          locations: data.locations,
        });

        // Auto select first location if not set
        if (data.locations && data.locations.length > 0 && !config.locationId) {
          onUpdateConfig({
            ...config,
            isConnected: true,
            locationId: data.locations[0].id.toString(),
            locationName: data.locations[0].name,
          });
        } else {
          onUpdateConfig({ ...config, isConnected: true });
        }
      } else {
        setTestResult({
          success: false,
          message: data.error || '连接失败：请检查服务端 SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET 与店铺域名',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `网络错误: ${err.message}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const targetCount = selectedIds.length > 0 ? selectedIds.length : products.length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl my-8">
        {/* Modal Header */}
        <div className="bg-slate-800/80 px-6 py-4 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Shopify 推送与配置中心</h3>
              <p className="text-xs text-slate-400">连接 Casalivo 独立站后台 Admin API 并执行自动化同步</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Credentials */}
          <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                Shopify Admin API 凭据
              </span>
              <a
                href="https://help.shopify.com/en/manual/apps/app-types/custom-apps"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-amber-400 hover:underline"
              >
                如何获取 Token?
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">店铺域名 (Shop Domain)</label>
                <input
                  type="text"
                  value={config.shopDomain}
                  onChange={(e) => onUpdateConfig({ ...config, shopDomain: e.target.value })}
                  placeholder="例如: casalivo.myshopify.com"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Admin API 鉴权</label>
                <div className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-300 font-mono flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Client Credentials Grant · 服务端托管</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">令牌由服务端换取并缓存，前端不接触任何密钥</p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                onClick={handleTestConnection}
                disabled={isTesting || !config.shopDomain}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg border border-slate-700 transition disabled:opacity-50"
              >
                {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5 text-emerald-400" />}
                <span>测试连接有效性</span>
              </button>

              {testResult && (
                <div
                  className={`text-xs px-2.5 py-1 rounded-md flex items-center gap-1.5 ${
                    testResult.success
                      ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                      : 'bg-rose-950/60 text-rose-300 border border-rose-800'
                  }`}
                >
                  {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                  <span className="truncate max-w-xs">{testResult.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Location ID Selection */}
          <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 text-xs space-y-2">
            <label className="block font-semibold text-slate-200">
              库存对应仓库 Location ID (用于多仓库存分发)
            </label>
            <input
              type="text"
              value={config.locationId}
              onChange={(e) => onUpdateConfig({ ...config, locationId: e.target.value })}
              placeholder="例如: 8934028340 (测试连接后可自动填充)"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-emerald-400"
            />
            <p className="text-[10px] text-slate-500">
              Shopify 对每个仓库单独管理库存。填入 Location ID 后，推送可直接生效实际在售库存。
            </p>
          </div>

          {/* Sync Trigger Settings */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-300">执行模式选择</h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <button
                onClick={() => setSyncMode('full')}
                className={`p-3 rounded-xl border text-left transition ${
                  syncMode === 'full'
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-white mb-0.5">首次全量铺货 (Full Sync)</div>
                <div className="text-[11px] text-slate-400">
                  创建新商品、绑定图片、写入 Casalivo 品牌详情与阶梯售价
                </div>
              </button>

              <button
                onClick={() => setSyncMode('stock_only')}
                className={`p-3 rounded-xl border text-left transition ${
                  syncMode === 'stock_only'
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-white mb-0.5">日常库存增量更新 (Stock Only)</div>
                <div className="text-[11px] text-slate-400">
                  按 CSL-SKU 极速对比，仅更新变动的实际可用库存，防超卖
                </div>
              </button>
            </div>

            {/* Dry Run Toggle */}
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={isDryRun}
                onChange={(e) => setIsDryRun(e.target.checked)}
                className="rounded border-slate-700 text-amber-500 focus:ring-0 cursor-pointer"
              />
              <span>
                演练模式 (Dry-Run / 沙盒模拟 - 校验全部数据与价格计算，不实际写入线上店铺)
              </span>
            </label>
          </div>

          {/* Logs Terminal if syncing */}
          {syncLogs.length > 0 && (
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 max-h-40 overflow-y-auto space-y-1">
              <div className="text-slate-500 flex items-center gap-1">
                <Terminal className="w-3 h-3" />
                <span>实时推送控制台:</span>
              </div>
              {syncLogs.map((log, index) => (
                <div key={index} className="text-slate-300">
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-800/80 px-6 py-4 border-t border-slate-700/80 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            预计执行: <span className="text-white font-bold">{targetCount}</span> 件商品
            {selectedIds.length > 0 && ' (已勾选指定项)'}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
            >
              取消
            </button>
            <button
              onClick={() => onExecuteSync(syncMode, isDryRun)}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold rounded-lg shadow-lg shadow-amber-500/20 transition active:scale-95 disabled:opacity-50"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>执行中...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>开始推送 ({syncMode === 'full' ? '全量' : '库存'})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
