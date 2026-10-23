import React from 'react';
import { RefreshCw, Play, UploadCloud, ShieldCheck, ShoppingBag, Database, FileSpreadsheet } from 'lucide-react';
import { ShopifyConfig, ArkSwiftConfig } from '../types';

interface HeaderProps {
  shopifyConfig: ShopifyConfig;
  arkswiftConfig: ArkSwiftConfig;
  totalProducts: number;
  isSyncing: boolean;
  onOpenShopifyModal: () => void;
  onOpenArkSwiftModal: () => void;
  onOpenPythonModal: () => void;
  onOpenUploadModal: () => void;
  onTriggerFullSync: () => void;
  onExportShopifyCsv?: () => void;
  onOpenCleanupModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  shopifyConfig,
  arkswiftConfig,
  totalProducts,
  isSyncing,
  onOpenShopifyModal,
  onOpenArkSwiftModal,
  onOpenPythonModal,
  onOpenUploadModal,
  onTriggerFullSync,
  onExportShopifyCsv,
  onOpenCleanupModal,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Title */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
            <span className="text-xl tracking-tighter">CSL</span>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                Casalivo <span className="text-amber-400 font-normal">Sync Bot</span>
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30">
                v2.4
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              ArkSwift ➔ Casalivo 洗白 ➔ Shopify 自动铺货与库存同步中枢
            </p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="hidden md:flex items-center space-x-3 text-xs">
          {/* ArkSwift Status */}
          <button
            onClick={onOpenArkSwiftModal}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition ${
              arkswiftConfig.isConnected
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800 hover:bg-emerald-900/40'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700/60'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-amber-400" />
            <span>ArkSwift API: {arkswiftConfig.isConnected ? '已连接' : '配置/签名'}</span>
          </button>

          {/* Shopify Status */}
          <button
            onClick={onOpenShopifyModal}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition ${
              shopifyConfig.isConnected
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800 hover:bg-emerald-900/40'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700/60'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Shopify: {shopifyConfig.isConnected ? (shopifyConfig.shopDomain ? shopifyConfig.shopDomain.split('.')[0] : '已连接') : '待连接'}
            </span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          {/* Upload CSV */}
          <button
            onClick={onOpenUploadModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition"
            title="导入 ArkSwift 导出的库存表格"
          >
            <UploadCloud className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">导入表格</span>
          </button>

          {/* Export Shopify CSV */}
          {onExportShopifyCsv && (
            <button
              onClick={onExportShopifyCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-700/60 text-xs font-semibold rounded-lg transition"
              title="导出清洗后的商品为标准 Shopify 导入 CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">导出 Shopify 表格</span>
            </button>
          )}

          {/* Trigger Full Sync */}
          <button
            onClick={onTriggerFullSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold text-xs rounded-lg shadow-sm shadow-amber-500/20 transition active:scale-95 disabled:opacity-50"
          >
            {isSyncing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
                <span>同步中...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>一键全量洗白推送</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
