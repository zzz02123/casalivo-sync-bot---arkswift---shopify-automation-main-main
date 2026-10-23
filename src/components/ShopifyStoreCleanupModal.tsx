import React, { useState } from 'react';
import {
  Trash2,
  AlertTriangle,
  X,
  RefreshCw,
  ShieldAlert,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  Terminal,
  HelpCircle,
  FileCode,
  Flame,
} from 'lucide-react';
import { ShopifyConfig } from '../types';

interface ShopifyStoreCleanupModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ShopifyConfig;
}

export const ShopifyStoreCleanupModal: React.FC<ShopifyStoreCleanupModalProps> = ({
  isOpen,
  onClose,
  config,
}) => {
  const [activeTab, setActiveTab] = useState<'api_wipe' | 'shopify_admin_guide' | 'python_script'>('api_wipe');
  
  // API wipe state
  const [customShop, setCustomShop] = useState(config.shopDomain || 'casalivo.myshopify.com');
  const [customToken, setCustomToken] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [maxBatch, setMaxBatch] = useState(250);
  
  const [isCheckingCount, setIsCheckingCount] = useState(false);
  const [storeStatus, setStoreStatus] = useState<{
    checked: boolean;
    totalCount: number;
    sampleTitles: string[];
    error?: string;
  } | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteLogs, setDeleteLogs] = useState<string[]>([]);
  const [deleteSummary, setDeleteSummary] = useState<{
    completed: boolean;
    deletedCount: number;
    remainingMore: boolean;
    errors: string[];
  } | null>(null);

  const [isCopied, setIsCopied] = useState(false);

  if (!isOpen) return null;

  const handleCheckStoreProducts = async () => {
    setIsCheckingCount(true);
    setStoreStatus(null);
    try {
      const res = await fetch('/api/shopify/products-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customShop: customShop.trim(),
          customToken: customToken.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStoreStatus({
          checked: true,
          totalCount: data.totalCount,
          sampleTitles: data.sampleTitles || [],
        });
      } else {
        setStoreStatus({
          checked: true,
          totalCount: 0,
          sampleTitles: [],
          error: data.error || '无法获取商品数量，请检查店铺域名与 API Token 权限',
        });
      }
    } catch (err: any) {
      setStoreStatus({
        checked: true,
        totalCount: 0,
        sampleTitles: [],
        error: `网络异常: ${err.message}`,
      });
    } finally {
      setIsCheckingCount(false);
    }
  };

  const handleExecuteDelete = async () => {
    if (confirmInput.trim() !== '确认删除全部' && confirmInput.trim() !== 'CONFIRM_DELETE') {
      alert('请在确认框中准确输入 "确认删除全部" 或 "CONFIRM_DELETE"！');
      return;
    }

    setIsDeleting(true);
    setDeleteSummary(null);
    setDeleteLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 🚀 启动 Shopify 后台商品批量删除任务...`,
      `[${new Date().toLocaleTimeString()}] 目标店铺: ${customShop}`,
    ]);

    try {
      const res = await fetch('/api/shopify/delete-all-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmCode: confirmInput.trim(),
          customShop: customShop.trim(),
          customToken: customToken.trim() || undefined,
          maxBatch: Number(maxBatch) || 250,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const deletedItems = data.deletedItems || [];
        const logs: string[] = [];
        deletedItems.forEach((item: any, idx: number) => {
          logs.push(`[${new Date().toLocaleTimeString()}] ✅ 已彻底删除 #${idx + 1}: ${item.title} (${item.id})`);
        });

        if (data.errors && data.errors.length > 0) {
          data.errors.forEach((errStr: string) => {
            logs.push(`[${new Date().toLocaleTimeString()}] ⚠️ 删除告警: ${errStr}`);
          });
        }

        logs.push(
          `[${new Date().toLocaleTimeString()}] 🏁 本轮批量清理完成，共删除 ${data.deletedCount} 件商品！${
            data.hasMore ? '后台仍有剩余商品，可继续执行下一次清空。' : '后台已无多余商品。'
          }`
        );

        setDeleteLogs((prev) => [...prev, ...logs]);
        setDeleteSummary({
          completed: true,
          deletedCount: data.deletedCount,
          remainingMore: Boolean(data.hasMore),
          errors: data.errors || [],
        });

        // Refresh store count status
        handleCheckStoreProducts();
      } else {
        setDeleteLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ❌ 删除执行中断: ${data.error || '未知服务端错误'}`,
        ]);
        setDeleteSummary({
          completed: false,
          deletedCount: 0,
          remainingMore: false,
          errors: [data.error || '操作失败'],
        });
      }
    } catch (err: any) {
      setDeleteLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ 异常: ${err.message}`,
      ]);
    } finally {
      setIsDeleting(false);
    }
  };

  const pythonScriptCode = `"""
Casalivo - Shopify Store Wipe Tool (Python Standalone Script)
批量安全清空 Shopify 后台全部已有商品
支持 GraphQL 批量查询与 productDelete 异步轮询
"""
import time
import requests

# 1. 配置您的 Shopify 店铺凭据
SHOP_DOMAIN = "${customShop || 'casalivo.myshopify.com'}"
# 具备 write_products 权限的 Admin API Access Token (格式通常为 shpat_xxxxxxxx)
ADMIN_ACCESS_TOKEN = "${customToken || 'shpat_YOUR_TOKEN_HERE'}"
API_VERSION = "2025-07"

HEADERS = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": ADMIN_ACCESS_TOKEN,
}

GRAPHQL_URL = f"https://{SHOP_DOMAIN}/admin/api/{API_VERSION}/graphql.json"

GET_PRODUCTS_QUERY = """
query getProductsToDelete($first: Int!) {
  products(first: $first) {
    pageInfo {
      hasNextPage
    }
    edges {
      node {
        id
        title
      }
    }
  }
}
"""

DELETE_MUTATION = """
mutation deleteProduct($input: ProductDeleteInput!) {
  productDelete(input: $input) {
    deletedProductId
    userErrors {
      field
      message
    }
  }
}
"""

def delete_all_products():
    print(f"[*] 正在连接 Shopify 商店: {SHOP_DOMAIN}")
    total_deleted = 0
    round_no = 1
    
    while True:
        print(f"[*] [第 {round_no} 轮] 正在获取待删除商品批次 (50 件/批)...")
        res = requests.post(
            GRAPHQL_URL,
            headers=HEADERS,
            json={"query": GET_PRODUCTS_QUERY, "variables": {"first": 50}},
            timeout=20
        )
        
        if res.status_code != 200:
            print(f"[!] 请求失败: {res.status_code} - {res.text}")
            break
            
        data = res.json().get("data", {})
        edges = data.get("products", {}).get("edges", [])
        
        if not edges:
            print("[+] Shopify 店铺后台已没有产品，全部清空完成！")
            break
            
        print(f"[*] 本轮拉取到 {len(edges)} 件商品，开始逐一删除...")
        
        for idx, edge in enumerate(edges, start=1):
            prod = edge["node"]
            prod_id = prod["id"]
            title = prod["title"]
            
            del_res = requests.post(
                GRAPHQL_URL,
                headers=HEADERS,
                json={"query": DELETE_MUTATION, "variables": {"input": {"id": prod_id}}},
                timeout=15
            )
            
            if del_res.status_code == 200:
                del_json = del_res.json()
                errs = del_json.get("data", {}).get("productDelete", {}).get("userErrors", [])
                if errs:
                    print(f"  [!] 删除跳过 {title}: {errs}")
                else:
                    total_deleted += 1
                    print(f"  [OK] 已删除 #{total_deleted}: {title}")
            else:
                print(f"  [!] HTTP错误 {title}: {del_res.status_code}")
                
            time.sleep(0.08)  # 避免触发 API 速率限制
            
        round_no += 1
        
    print(f"\\n========================================")
    print(f"[+] 任务结束！总共成功从 Shopify 删除: {total_deleted} 件商品")
    print(f"========================================")

if __name__ == "__main__":
    confirm = input("警告：此操作不可逆，将清空指定 Shopify 店铺所有商品！输入 'YES' 开始: ")
    if confirm.strip().upper() == "YES":
        delete_all_products()
    else:
        print("[*] 已取消操作。")
`;

  const handleCopyPython = () => {
    navigator.clipboard.writeText(pythonScriptCode);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownloadPython = () => {
    const blob = new Blob([pythonScriptCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'wipe_shopify_products.py';
    link.click();
    URL.revokeObjectURL(url);
  };

  const isConfirmed = confirmInput.trim() === '确认删除全部' || confirmInput.trim() === 'CONFIRM_DELETE';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-red-500/30 rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl my-8 flex flex-col max-h-[92vh]">
        {/* Modal Header with Danger theme */}
        <div className="bg-gradient-to-r from-red-950/90 via-slate-900 to-slate-900 px-6 py-4 border-b border-red-900/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-500/20 text-red-400 rounded-xl border border-red-500/30 shadow-inner">
              <Flame className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Shopify 后台商品清空中心 (Store Wipe)</h3>
                <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/40 px-2 py-0.5 rounded-full font-semibold uppercase">
                  高危操作 · 不可逆
                </span>
              </div>
              <p className="text-xs text-slate-400">彻底删除独立站后台已上传的产品数据，准备重新进行多变体规范上架</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-950 px-6 py-2.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('api_wipe')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'api_wipe'
                  ? 'bg-red-500/20 text-red-300 border border-red-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>⚡ 网页一键 API 批量清空</span>
            </button>
            <button
              onClick={() => setActiveTab('shopify_admin_guide')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'shopify_admin_guide'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>🖱️ Shopify 官方后台 30 秒全删（免代码·最推荐）</span>
            </button>
            <button
              onClick={() => setActiveTab('python_script')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'python_script'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>🐍 独立 Python 离线脚本</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* TAB 1: API Wipe */}
          {activeTab === 'api_wipe' && (
            <div className="space-y-4">
              {/* Warning Callout */}
              <div className="p-3.5 bg-red-950/40 border border-red-800/60 rounded-xl flex items-start gap-3 text-xs text-red-200">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-red-300">警告：此操作将彻底删除 Shopify 对应店铺中的商品</p>
                  <p className="text-red-300/80 leading-relaxed">
                    通过 GraphQL 执行 <code>productDelete</code> 会连带清除对应商品的全部变体、图片关联及库存记录。适合在重新发布「智能多变体聚合 Listing」前快速清理脏数据。
                  </p>
                </div>
              </div>

              {/* Step 1: Query Current Store Status */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                    第一步：连接并查询当前 Shopify 店铺后台商品
                  </span>
                  <button
                    onClick={handleCheckStoreProducts}
                    disabled={isCheckingCount || !customShop}
                    className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg border border-slate-700 transition disabled:opacity-50"
                  >
                    {isCheckingCount ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    <span>探测后台商品总数</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">店铺域名 (Shop Domain)</label>
                    <input
                      type="text"
                      value={customShop}
                      onChange={(e) => setCustomShop(e.target.value)}
                      placeholder="casalivo.myshopify.com"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">
                      临时 Admin Access Token (可选，未配置 .env 时填入)
                    </label>
                    <input
                      type="password"
                      value={customToken}
                      onChange={(e) => setCustomToken(e.target.value)}
                      placeholder="shpat_xxxxxxxx (若留空则自动读取服务端配置)"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                {storeStatus && (
                  <div className="pt-2">
                    {storeStatus.error ? (
                      <div className="p-2.5 bg-red-950/50 border border-red-800 rounded-lg text-xs text-red-300">
                        {storeStatus.error}
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-900 border border-slate-700 rounded-lg text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-300">
                            当前 Shopify 后台检测到的商品总数:
                          </span>
                          <span className="text-sm font-bold font-mono text-amber-400">
                            {storeStatus.totalCount} 件
                          </span>
                        </div>
                        {storeStatus.sampleTitles.length > 0 && (
                          <div className="text-[11px] text-slate-400">
                            <span className="text-slate-500">现有商品示例: </span>
                            {storeStatus.sampleTitles.slice(0, 3).join(' · ')}
                            {storeStatus.sampleTitles.length > 3 && ' ...'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 2: Safety Confirmation & Execution */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-red-900/30 space-y-3">
                <span className="text-xs font-semibold text-red-300 flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  第二步：双重安全验证并执行全店产品删除
                </span>

                <div className="space-y-2">
                  <label className="block text-xs text-slate-300">
                    为防止误操作，请在此输入 <strong className="text-red-400 font-mono">确认删除全部</strong> 或{' '}
                    <strong className="text-red-400 font-mono">CONFIRM_DELETE</strong> 解锁操作：
                  </label>
                  <input
                    type="text"
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    placeholder="输入: 确认删除全部"
                    className="w-full bg-slate-900 border border-red-900/60 rounded-lg px-3 py-2 text-red-300 font-mono text-xs focus:outline-none focus:border-red-500"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>单次最大删除批次:</span>
                    <select
                      value={maxBatch}
                      onChange={(e) => setMaxBatch(Number(e.target.value))}
                      className="bg-slate-900 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs"
                    >
                      <option value={50}>50 件</option>
                      <option value={100}>100 件</option>
                      <option value={250}>250 件 (默认)</option>
                      <option value={500}>500 件</option>
                      <option value={1000}>1000 件</option>
                    </select>
                  </div>

                  <button
                    onClick={handleExecuteDelete}
                    disabled={!isConfirmed || isDeleting}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition shadow-lg ${
                      isConfirmed && !isDeleting
                        ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/40 active:scale-95'
                        : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                    }`}
                  >
                    {isDeleting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>正在逐一删除后台商品...</span>
                      </>
                    ) : (
                      <>
                        <Flame className="w-4 h-4" />
                        <span>立即彻底清空 Shopify 商品</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Step 3: Terminal Logs */}
              {(isDeleting || deleteLogs.length > 0) && (
                <div className="bg-black/90 rounded-xl p-3 border border-slate-800 font-mono text-xs space-y-2">
                  <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-1.5">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <Terminal className="w-3.5 h-3.5 text-red-400" />
                      实时删除进度控制台
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {isDeleting ? 'RUNNING...' : 'COMPLETED'}
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1 text-[11px] leading-relaxed">
                    {deleteLogs.map((log, index) => (
                      <p
                        key={index}
                        className={
                          log.includes('✅')
                            ? 'text-emerald-400'
                            : log.includes('❌') || log.includes('⚠️')
                            ? 'text-red-400'
                            : 'text-slate-300'
                        }
                      >
                        {log}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Shopify Admin Native Guide */}
          {activeTab === 'shopify_admin_guide' && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-xl flex items-start gap-3 text-xs text-emerald-200">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-sm text-emerald-300">强烈推荐方案：直接在 Shopify 官方商家后台 30 秒全删</p>
                  <p className="text-emerald-300/80 leading-relaxed">
                    无需任何 API 权限或等待速率限制！Shopify 原生后台拥有内置异步批量处理队列，支持一键选中全店成千上万个产品并一键秒删。
                  </p>
                </div>
              </div>

              {/* 4 Step Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {/* Step 1 */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                      1
                    </span>
                    <h4 className="font-bold text-slate-200">打开后台产品列表</h4>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    登录您的 Shopify 商家管理后台（<code>admin.shopify.com</code>），在左侧主导航栏中点击 <strong className="text-white">「产品 (Products)」</strong>。
                  </p>
                </div>

                {/* Step 2 */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                      2
                    </span>
                    <h4 className="font-bold text-slate-200">勾选表头全选方框</h4>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    在产品表格顶部左侧，勾选最上方的 <strong className="text-white">全选复选框（Check All）</strong>，此时会默认选中当前页的 50 个产品。
                  </p>
                </div>

                {/* Step 3 - Crucial */}
                <div className="bg-slate-950 p-4 rounded-xl border border-amber-500/40 space-y-2 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-bold text-xs">
                      3
                    </span>
                    <h4 className="font-bold text-amber-300">关键：点击「选择商店所有产品」</h4>
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    勾选后表头会出现蓝色提示栏：<em>“已选择此页面的 50 个产品”</em>。其后紧跟一个蓝色可点击链接：
                    <span className="inline-block px-1.5 py-0.5 mt-1 bg-amber-400/20 text-amber-200 rounded border border-amber-400/30 font-semibold">
                      选择商店中的所有 50+ 个产品 (Select all products in your store)
                    </span>
                    ，<strong className="text-amber-400">必须点击此链接</strong> 才能跨页选齐全店所有商品！
                  </p>
                </div>

                {/* Step 4 */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center font-bold text-xs">
                      4
                    </span>
                    <h4 className="font-bold text-slate-200">点击删除产品并确认</h4>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    在页面下方弹出的浮动操作栏中，点击 <strong className="text-white">「... 更多操作 (More actions)」</strong> ➔ 选择 <strong className="text-red-400">「删除产品 (Delete products)」</strong>，二次确认即可完成全量清空！
                  </p>
                </div>
              </div>

              {/* Direct Link Button */}
              <div className="flex justify-end pt-2">
                <a
                  href={`https://${customShop || 'casalivo.myshopify.com'}/admin/products`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition shadow-md shadow-indigo-600/20"
                >
                  <span>直达 Shopify 后台产品管理页</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* TAB 3: Standalone Python Script */}
          {activeTab === 'python_script' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <p>在本地 Windows/Mac 或服务器终端一键运行 Python 脚本批量清理：</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyPython}
                    className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg border border-slate-700 transition"
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{isCopied ? '已复制' : '复制代码'}</span>
                  </button>
                  <button
                    onClick={handleDownloadPython}
                    className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition"
                  >
                    <span>下载 wipe_shopify_products.py</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 font-mono text-xs overflow-x-auto max-h-72">
                <pre className="text-slate-300 leading-relaxed whitespace-pre">
                  {pythonScriptCode}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-950 px-6 py-3.5 border-t border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            清空后台后，可在主界面点击「一键全量洗白推送」重新发布聚合多变体 Listing
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition"
          >
            关闭窗口
          </button>
        </div>
      </div>
    </div>
  );
};
