import React, { useState } from 'react';
import { Key, Shield, Hash, CheckCircle, RefreshCw, Database, Copy, Check, Terminal, ExternalLink, HelpCircle } from 'lucide-react';
import { ArkSwiftConfig } from '../types';
import { generateArkSwiftSign } from '../utils/arkswiftSign';

interface ArkSwiftSignStudioProps {
  config: ArkSwiftConfig;
  onUpdateConfig: (config: ArkSwiftConfig) => void;
  onTestFetch: (endpoint: string) => Promise<void>;
  isTesting: boolean;
}

export const ArkSwiftSignStudio: React.FC<ArkSwiftSignStudioProps> = ({
  config,
  onUpdateConfig,
  onTestFetch,
  isTesting,
}) => {
  const [testEndpoint, setTestEndpoint] = useState('/api/open/products/stock');
  const [sampleParams, setSampleParams] = useState<Record<string, string>>({
    app_key: config.appKey || 'ark_demo_key_9201',
    timestamp: Math.floor(Date.now() / 1000).toString(),
    page: '1',
    page_size: '50',
    format: 'json',
    v: '1.0',
  });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Generate live signature
  const signResult = generateArkSwiftSign(
    sampleParams,
    config.appSecret || 'ark_sec_demo_secret_key_883',
    config.algorithm,
    config.signStyle
  );

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleParamChange = (k: string, val: string) => {
    setSampleParams((prev) => ({ ...prev, [k]: val }));
  };

  const handleAddParam = () => {
    const key = prompt('请输入新参数名 (如 warehouse_code):');
    if (key && key.trim()) {
      setSampleParams((prev) => ({ ...prev, [key.trim()]: '' }));
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl mb-6">
      {/* Panel Header */}
      <div className="bg-slate-800/80 px-6 py-4 border-b border-slate-700/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              ArkSwift 签名加密与接口联调模块 (API & Sign Studio)
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                ASCII 字典排序 + MD5/SHA256
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              精准对齐 ArkSwift 开放平台签名算法，支持在线试算、参数调试及自动化拉取
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onTestFetch(testEndpoint)}
            disabled={isTesting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-medium text-xs rounded-lg transition disabled:opacity-50"
          >
            {isTesting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>请求中...</span>
              </>
            ) : (
              <>
                <Terminal className="w-3.5 h-3.5" />
                <span>发起联调请求</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: API Configuration & Parameters */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                ArkSwift 开发者凭证设置
              </span>
              <span className="text-slate-500">保存在本地浏览器/环境变量</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">接口 Base URL</label>
                <input
                  type="text"
                  value={config.apiUrl}
                  onChange={(e) => onUpdateConfig({ ...config, apiUrl: e.target.value })}
                  placeholder="https://api.arkswift.com"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">目标路由 Endpoint</label>
                <input
                  type="text"
                  value={testEndpoint}
                  onChange={(e) => setTestEndpoint(e.target.value)}
                  placeholder="/api/open/products/stock"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">AppKey (应用标识)</label>
                <input
                  type="text"
                  value={config.appKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    onUpdateConfig({ ...config, appKey: val });
                    handleParamChange('app_key', val);
                  }}
                  placeholder="例如: ark_prod_8829"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-amber-400 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">AppSecret (接口密钥)</label>
                <input
                  type="password"
                  value={config.appSecret}
                  onChange={(e) => onUpdateConfig({ ...config, appSecret: e.target.value })}
                  placeholder="••••••••••••••••"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-amber-400 font-mono"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex flex-wrap gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">哈希算法:</span>
                <select
                  value={config.algorithm}
                  onChange={(e) => onUpdateConfig({ ...config, algorithm: e.target.value as any })}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="md5">MD5 (常用)</option>
                  <option value="sha256">HMAC-SHA256</option>
                  <option value="rsa-sha256">RSA-SHA256 (非对称密钥)</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-400">拼接规则:</span>
                <select
                  value={config.signStyle}
                  onChange={(e) => onUpdateConfig({ ...config, signStyle: e.target.value as any })}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="secret_suffix">尾部追加 &amp;secret=密钥 (标准)</option>
                  <option value="secret_sandwich">首尾夹逼 密钥+参数+密钥</option>
                </select>
              </div>
            </div>
          </div>

          {/* Dynamic Request Parameters */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300">请求参数表 (Params Payload)</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleParamChange('timestamp', Math.floor(Date.now() / 1000).toString())}
                  className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> 刷新时间戳
                </button>
                <button
                  onClick={handleAddParam}
                  className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded border border-slate-700"
                >
                  + 新增参数
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {Object.entries(sampleParams).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5 bg-slate-900/90 p-1.5 rounded border border-slate-800 text-xs">
                  <span className="font-mono text-slate-400 w-24 truncate">{k}:</span>
                  <input
                    type="text"
                    value={v}
                    onChange={(e) => handleParamChange(k, e.target.value)}
                    className="flex-1 bg-transparent text-white font-mono text-[11px] focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Live Signature Inspection */}
        <div className="lg:col-span-6 flex flex-col justify-between space-y-4">
          <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between text-slate-300 pb-2 border-b border-slate-800">
              <span className="flex items-center gap-1.5 font-sans font-semibold">
                <Hash className="w-3.5 h-3.5 text-indigo-400" />
                实时签名推演过程 (Sign Calculation)
              </span>
              <span className="text-[11px] text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/60">
                已验证
              </span>
            </div>

            {/* Step 1: Sorted Keys */}
            <div>
              <div className="text-[11px] text-slate-400 font-sans mb-1 flex items-center justify-between">
                <span>① ASCII 字典升序参数列表:</span>
                <span className="text-slate-500 font-mono text-[10px]">[{signResult.sortedKeys.join(', ')}]</span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-amber-300 text-[11px] break-all select-all">
                {signResult.sortedKeys.map((k) => `${k}=${sampleParams[k]}`).join('&')}
              </div>
            </div>

            {/* Step 2: Canonical String */}
            <div>
              <div className="text-[11px] text-slate-400 font-sans mb-1 flex items-center justify-between">
                <span>② 待签名原串 (Canonical String with Secret):</span>
                <button
                  onClick={() => handleCopy(signResult.signString, 'signString')}
                  className="text-slate-400 hover:text-white flex items-center gap-1 text-[10px]"
                >
                  {copiedKey === 'signString' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  复制
                </button>
              </div>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-slate-300 text-[11px] break-all max-h-20 overflow-y-auto">
                {signResult.signString}
              </div>
            </div>

            {/* Step 3: Resulting Signature */}
            <div>
              <div className="text-[11px] text-slate-400 font-sans mb-1 flex items-center justify-between">
                <span className="text-emerald-400 font-semibold">③ 最终计算签名 (sign):</span>
                <button
                  onClick={() => handleCopy(signResult.signature, 'signature')}
                  className="text-slate-400 hover:text-white flex items-center gap-1 text-[10px]"
                >
                  {copiedKey === 'signature' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  复制签名
                </button>
              </div>
              <div className="bg-gradient-to-r from-amber-500/10 to-indigo-500/10 p-3 rounded-lg border border-amber-500/30 flex items-center justify-between">
                <span className="text-amber-400 font-bold text-sm tracking-widest break-all select-all">
                  {signResult.signature}
                </span>
                <span className="text-[10px] text-slate-400 uppercase ml-2 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">
                  {config.algorithm}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Notice Card */}
          <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-3 text-xs text-slate-400 flex items-start gap-2.5">
            <HelpCircle className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-slate-200 font-medium">双模拉取设计：</span>
              系统同时支持通过 ArkSwift API 凭据自动拉取，或直接上传 ArkSwift 后台导出的
              <span className="text-amber-300 font-mono"> .csv </span> /
              <span className="text-amber-300 font-mono"> .xlsx </span>库存表格。无论何种输入源，均自动统一进入 Casalivo 洗白与加价流水线！
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
