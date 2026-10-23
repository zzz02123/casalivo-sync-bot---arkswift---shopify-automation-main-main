import React, { useState } from 'react';
import { Terminal, Copy, Check, Download, X, FileCode, Clock, ExternalLink } from 'lucide-react';
import { WhitewashConfig, PricingConfig, ShopifyConfig, ArkSwiftConfig } from '../types';
import { generatePythonSyncBotCode } from '../utils/pythonBotGenerator';

interface PythonScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  whitewashConfig: WhitewashConfig;
  pricingConfig: PricingConfig;
  shopifyConfig: ShopifyConfig;
  arkswiftConfig: ArkSwiftConfig;
}

export const PythonScriptModal: React.FC<PythonScriptModalProps> = ({
  isOpen,
  onClose,
  whitewashConfig,
  pricingConfig,
  shopifyConfig,
  arkswiftConfig,
}) => {
  const [activeFile, setActiveFile] = useState<'sync_bot.py' | 'arkswift_api.py' | 'whitewash_engine.py' | 'shopify_client.py' | 'wipe_shopify_products.py' | 'run_daily_sync.bat' | '.env.example' | 'requirements.txt'>('sync_bot.py');
  const [isCopied, setIsCopied] = useState(false);

  if (!isOpen) return null;

  const codeFiles = generatePythonSyncBotCode(whitewashConfig, pricingConfig, shopifyConfig, arkswiftConfig);
  const currentCode = codeFiles[activeFile] || '';

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCode);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownloadAll = () => {
    // Download active file directly
    const blob = new Blob([currentCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = activeFile;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl my-6 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-800/80 px-6 py-4 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                独立 Python 自动化脚本包 (Casalivo Bot Bundle)
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                  支持 Windows 计划任务
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                可直接部署在本地电脑或云服务器 24/7 后台自动运行，无需依赖浏览器保持打开
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* File Tabs & Actions */}
        <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-1 overflow-x-auto py-1">
            {Object.keys(codeFiles).map((fileName) => (
              <button
                key={fileName}
                onClick={() => setActiveFile(fileName as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition ${
                  activeFile === fileName
                    ? 'bg-slate-800 text-amber-300 font-semibold border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                <span>{fileName}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg border border-slate-700 transition"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{isCopied ? '已复制' : '复制当前文件'}</span>
            </button>
            <button
              onClick={handleDownloadAll}
              className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>下载当前脚本</span>
            </button>
          </div>
        </div>

        {/* Code View */}
        <div className="flex-1 overflow-auto bg-slate-950 p-4 font-mono text-xs text-slate-300 leading-relaxed">
          <pre className="select-all whitespace-pre-wrap">{currentCode}</pre>
        </div>

        {/* Windows Task Scheduler Guide */}
        <div className="bg-slate-900 border-t border-slate-800 p-4 text-xs text-slate-300 space-y-2">
          <div className="flex items-center gap-2 font-bold text-amber-400">
            <Clock className="w-4 h-4" />
            <span>Windows 计划任务（Task Scheduler）无感定时执行指南:</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-slate-400">
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <strong className="text-white block mb-0.5">1. 放置脚本到指定目录</strong>
              将生成的 Python 脚本及 <code className="text-amber-300">run_daily_sync.bat</code> 放入固定文件夹（例如 <code className="text-amber-300">D:\casalivo-sync\</code>）。
            </div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <strong className="text-white block mb-0.5">2. 新建任务计划</strong>
              按 Win+R 输入 <code className="text-amber-300">taskschd.msc</code>，点击右侧「创建基本任务」，命名为「Casalivo 每日库存同步」。
            </div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <strong className="text-white block mb-0.5">3. 设置触发器与启动程序</strong>
              触发器选择「每天」或「每小时」，操作选择「启动程序」，脚本路径指向 <code className="text-amber-300">run_daily_sync.bat</code> 即可！
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
