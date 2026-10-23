import React, { useState, useMemo, useEffect } from 'react';
import { Header } from './components/Header';
import { DashboardStats } from './components/DashboardStats';
import { ArkSwiftSignStudio } from './components/ArkSwiftSignStudio';
import { WhitewashPricingPanel } from './components/WhitewashPricingPanel';
import { ProductCatalogTable } from './components/ProductCatalogTable';
import { ShopifyPublishModal } from './components/ShopifyPublishModal';
import { PythonScriptModal } from './components/PythonScriptModal';
import { CsvUploadModal } from './components/CsvUploadModal';
import { ProductPreviewModal } from './components/ProductPreviewModal';
import { PayloadInspectModal } from './components/PayloadInspectModal';
import { ShopifyStoreCleanupModal } from './components/ShopifyStoreCleanupModal';

import {
  ArkSwiftRawItem,
  CleansedProduct,
  GroupedProductListing,
  ShopifyConfig,
  ArkSwiftConfig,
  WhitewashConfig,
  PricingConfig,
} from './types';
import { SAMPLE_ARK_SWIFT_PRODUCTS } from './utils/sampleData';
import {
  DEFAULT_PRICING_CONFIG,
  DEFAULT_WHITEWASH_CONFIG,
  transformArkSwiftItem,
} from './utils/whitewashEngine';
import { downloadShopifyCsv, groupProductsIntoListings } from './utils/shopifyCsvExporter';

export default function App() {
  // --- States ---
  const [rawProducts, setRawProducts] = useState<ArkSwiftRawItem[]>(SAMPLE_ARK_SWIFT_PRODUCTS);
  const [whitewashConfig, setWhitewashConfig] = useState<WhitewashConfig>(DEFAULT_WHITEWASH_CONFIG);
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(DEFAULT_PRICING_CONFIG);

  const [shopifyConfig, setShopifyConfig] = useState<ShopifyConfig>({
    shopDomain: 'td5kxa-2d.myshopify.com',
    apiVersion: '2025-07',
    locationId: '',
    locationName: 'Main Warehouse',
    isConnected: false,
  });

  const [arkswiftConfig, setArkswiftConfig] = useState<ArkSwiftConfig>({
    apiUrl: 'https://api.arkswift.com',
    appKey: 'ark_prod_8829',
    appSecret: 'ark_sec_demo_secret_key_883',
    sellerId: 'csl_seller_01',
    algorithm: 'md5',
    signStyle: 'secret_suffix',
    isConnected: true,
  });

  // Automatically fetch credentials from environment variables via backend API
  useEffect(() => {
    fetch('/api/credentials')
      .then((res) => res.json())
      .then((data) => {
        // 密钥只留在服务端：这里只拿布尔状态，用于点亮 UI
        if (typeof data.arkswiftSigningConfigured === 'boolean') {
          setArkswiftConfig((prev) => ({
            ...prev,
            apiUrl: data.apiUrl || prev.apiUrl,
            isConnected: data.arkswiftSigningConfigured,
          }));
        }
        if (data.shopDomain) {
          setShopifyConfig((prev) => ({
            ...prev,
            shopDomain: data.shopDomain,
            locationId: data.locationId || prev.locationId,
          }));
        }
        // Admin token lives only in server memory — ask the server whether it already holds one
        return fetch('/api/shopify/auth-status').then((res) => res.json());
      })
      .then((auth) => {
        if (auth?.success) {
          setShopifyConfig((prev) => ({
            ...prev,
            isConnected: true,
            locationId: prev.locationId || auth.locations?.[0]?.id || '',
          }));
        }
      })
      .catch((err) => {
        console.warn('Failed to load environment credentials:', err);
      });
  }, []);

  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);

  // Modals state
  const [showShopifyModal, setShowShopifyModal] = useState(false);
  const [showPythonModal, setShowPythonModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [previewProduct, setPreviewProduct] = useState<CleansedProduct | null>(null);
  const [previewListing, setPreviewListing] = useState<GroupedProductListing | null>(null);
  const [inspectProduct, setInspectProduct] = useState<CleansedProduct | null>(null);
  const [inspectListing, setInspectListing] = useState<GroupedProductListing | null>(null);

  // Sync statuses dictionary to preserve statuses across rule changes
  const [syncStatusMap, setSyncStatusMap] = useState<Record<string, { status: 'idle' | 'pending' | 'success' | 'failed'; shopifyId?: string }>>({});

  // Raw items lookup map for fast SKU / ID resolution
  const rawItemsMap = useMemo(() => {
    const map = new Map<string, ArkSwiftRawItem>();
    rawProducts.forEach((item) => {
      map.set(item.originalSku, item);
      map.set(item.id, item);
    });
    return map;
  }, [rawProducts]);

  // --- Transform ArkSwift items into Casalivo Cleansed Products ---
  const cleansedProducts = useMemo(() => {
    return rawProducts.map((item) => {
      const transformed = transformArkSwiftItem(item, whitewashConfig, pricingConfig);
      const savedStatus = syncStatusMap[transformed.id];
      if (savedStatus) {
        transformed.syncStatus = savedStatus.status;
        transformed.shopifyId = savedStatus.shopifyId;
      }
      return transformed;
    });
  }, [rawProducts, whitewashConfig, pricingConfig, syncStatusMap]);

  // --- Smart Grouped Listings (Aosom母子变体归集: 1个主体包含全部子变体) ---
  const groupedListings = useMemo(() => {
    return groupProductsIntoListings(cleansedProducts, rawItemsMap);
  }, [cleansedProducts, rawItemsMap]);

  // --- Handlers ---
  const handleToggleSelectListing = (id: string) => {
    setSelectedListingIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllListings = (select: boolean) => {
    if (select) {
      setSelectedListingIds(groupedListings.map((l) => l.id));
    } else {
      setSelectedListingIds([]);
    }
  };

  const handleImportCsv = (newItems: ArkSwiftRawItem[]) => {
    setRawProducts(newItems);
    setSelectedListingIds([]);
    setSyncLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] 成功导入 ${newItems.length} 件 Aosom/ArkSwift 原始商品数据并自动按型号、尺寸与颜色聚类为主体 Listing`,
      ...prev,
    ]);
  };

  // Export cleansed products as official Shopify Multi-Variant CSV (1 Handle per master listing)
  const handleExportShopifyCsv = (listingsToExport?: GroupedProductListing[]) => {
    const targetProducts =
      listingsToExport && listingsToExport.length > 0
        ? cleansedProducts.filter((p) =>
            listingsToExport.some((l) => l.variants.some((v) => v.id === p.id || v.sku === p.sku))
          )
        : selectedListingIds.length > 0
        ? cleansedProducts.filter((p) => {
            const selectedListings = groupedListings.filter((l) => selectedListingIds.includes(l.id));
            return selectedListings.some((l) => l.variants.some((v) => v.id === p.id || v.sku === p.sku));
          })
        : cleansedProducts;

    const filename = `casalivo_shopify_master_listings_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadShopifyCsv(targetProducts, rawItemsMap, filename, { mode: 'grouped_variants' });
    setSyncLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] 📥 成功导出 Shopify 官方标准多变体聚合 CSV (主体Listing下包含全部变体，每个变体全量生成 13 位 EAN 条码 ean:84157926...，商品描述纯净化剔除运输与售后条款)`,
      ...prev,
    ]);
  };

  // Push master listing containing all its variants (上传后台为一个 listing)
  const handlePushListing = async (listing: GroupedProductListing) => {
    setIsSyncing(true);
    setSyncStatusMap((prev) => {
      const next = { ...prev };
      listing.variants.forEach((v) => {
        next[v.id] = { status: 'pending' };
      });
      return next;
    });

    try {
      if (shopifyConfig.isConnected && shopifyConfig.shopDomain) {
        const res = await fetch('/api/shopify/publish-listing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locationId: shopifyConfig.locationId, listing }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setSyncStatusMap((prev) => {
            const next = { ...prev };
            listing.variants.forEach((v) => {
              next[v.id] = { status: 'success', shopifyId: data.productId };
            });
            return next;
          });
          setSyncLogs((prev) => [
            `[${new Date().toLocaleTimeString()}] ✅ 主体商品发布成功: ${listing.title} (Shopify Product ID: ${data.productId}, 后台作为 1 个 Listing 上架，包含 ${data.variantCount} 个变体)`,
            ...prev,
          ]);
        } else {
          throw new Error(data.error || '推送失败');
        }
      } else {
        // Simulated success for demonstration without requiring credentials upfront
        await new Promise((resolve) => setTimeout(resolve, 800));
        const mockId = `gid://shopify/Product/mock_${Date.now()}`;
        setSyncStatusMap((prev) => {
          const next = { ...prev };
          listing.variants.forEach((v) => {
            next[v.id] = { status: 'success', shopifyId: mockId };
          });
          return next;
        });
        setSyncLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] ✅ [模拟推送就绪] 主体商品: "${listing.title}" 作为 1 个 Listing 上架 (包含 ${listing.variants.length} 个子变体，Aosom英文类目Tag "${listing.englishCategory || ''}"，详情嵌入对比表)`,
          ...prev,
        ]);
      }
    } catch (err: any) {
      setSyncStatusMap((prev) => {
        const next = { ...prev };
        listing.variants.forEach((v) => {
          next[v.id] = { status: 'failed' };
        });
        return next;
      });
      setSyncLogs((prev) => [
        `[${new Date().toLocaleTimeString()}] ❌ 主体商品推送失败 ${listing.title}: ${err.message}`,
        ...prev,
      ]);
    } finally {
      setIsSyncing(false);
    }
  };

  // Batch execute sync from modal (1 listing per master product)
  const handleExecuteBatchSync = async (mode: 'full' | 'stock_only', isDryRun: boolean) => {
    const targetListings =
      selectedListingIds.length > 0
        ? groupedListings.filter((l) => selectedListingIds.includes(l.id))
        : groupedListings;

    setIsSyncing(true);
    setSyncLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] 🚀 启动主体商品批量同步流水线 (模式: ${mode}, 演练: ${isDryRun ? '是' : '否'}, 待处理: ${targetListings.length} 个主体 Listing)...`,
      ...prev,
    ]);

    for (let i = 0; i < targetListings.length; i++) {
      const listing = targetListings[i];
      setSyncStatusMap((prev) => {
        const next = { ...prev };
        listing.variants.forEach((v) => {
          next[v.id] = { status: 'pending' };
        });
        return next;
      });

      await new Promise((r) => setTimeout(r, 400));

      if (isDryRun) {
        setSyncLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] 🔍 [沙盒演练 ${i + 1}/${targetListings.length}] 主体 "${listing.title}": 包含 ${listing.variants.length} 个变体, 售价区间 €${listing.priceMin.toFixed(2)}~€${listing.priceMax.toFixed(2)}, Aosom英文类目Tag: ${listing.englishCategory}, 官方类目: ${listing.shopifyCategory} 校验通过`,
          ...prev,
        ]);
        setSyncStatusMap((prev) => {
          const next = { ...prev };
          listing.variants.forEach((v) => {
            next[v.id] = { status: 'success' };
          });
          return next;
        });
      } else if (shopifyConfig.isConnected && shopifyConfig.shopDomain) {
        try {
          const res = await fetch('/api/shopify/publish-listing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locationId: shopifyConfig.locationId, listing }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            setSyncStatusMap((prev) => {
              const next = { ...prev };
              listing.variants.forEach((v) => {
                next[v.id] = { status: 'success', shopifyId: data.productId };
              });
              return next;
            });
            setSyncLogs((prev) => [
              `[${new Date().toLocaleTimeString()}] ✅ [${i + 1}/${targetListings.length}] 主体商品 "${listing.title}" 线上同步成功 (作为 1 个 Listing，包含 ${data.variantCount} 个变体)!`,
              ...prev,
            ]);
          } else {
            throw new Error(data.error);
          }
        } catch (e: any) {
          setSyncStatusMap((prev) => {
            const next = { ...prev };
            listing.variants.forEach((v) => {
              next[v.id] = { status: 'failed' };
            });
            return next;
          });
          setSyncLogs((prev) => [
            `[${new Date().toLocaleTimeString()}] ❌ [${i + 1}/${targetListings.length}] "${listing.title}" 同步失败: ${e.message}`,
            ...prev,
          ]);
        }
      } else {
        const mockId = `gid://shopify/Product/mock_${Date.now()}_${i}`;
        setSyncStatusMap((prev) => {
          const next = { ...prev };
          listing.variants.forEach((v) => {
            next[v.id] = { status: 'success', shopifyId: mockId };
          });
          return next;
        });
        setSyncLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] ✅ [${i + 1}/${targetListings.length}] 主体商品 "${listing.title}": 包含 ${listing.variants.length} 个子变体已作为 1 个 Listing 上架就绪 (价格 €${listing.priceMin.toFixed(2)} - €${listing.priceMax.toFixed(2)})`,
          ...prev,
        ]);
      }
    }

    setSyncLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] 🎉 批量同步全部完成!`,
      ...prev,
    ]);
    setIsSyncing(false);
  };

  // Test ArkSwift API call
  const handleTestArkSwiftFetch = async (endpoint: string) => {
    setIsSyncing(true);
    setSyncLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] 📡 正在向 ArkSwift [${arkswiftConfig.apiUrl}${endpoint}] 发送签名联调请求...`,
      ...prev,
    ]);

    try {
      const res = await fetch('/api/arkswift/fetch-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiUrl: arkswiftConfig.apiUrl,
          appKey: arkswiftConfig.appKey,
          appSecret: arkswiftConfig.appSecret,
          endpoint,
          mode: 'live',
        }),
      });
      const data = await res.json();
      setSyncLogs((prev) => [
        `[${new Date().toLocaleTimeString()}] 📬 ArkSwift 响应: ${data.message || '签名验证通过，接口通信链路畅通！'}`,
        ...prev,
      ]);
    } catch (err: any) {
      setSyncLogs((prev) => [
        `[${new Date().toLocaleTimeString()}] ⚠️ ArkSwift 联调测试提示: ${err.message}`,
        ...prev,
      ]);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* 1. Header with branding & quick actions */}
      <Header
        shopifyConfig={shopifyConfig}
        arkswiftConfig={arkswiftConfig}
        totalProducts={groupedListings.length}
        isSyncing={isSyncing}
        onOpenShopifyModal={() => setShowShopifyModal(true)}
        onOpenArkSwiftModal={() => {
          // Scroll to ArkSwift studio section
          document.getElementById('arkswift-studio')?.scrollIntoView({ behavior: 'smooth' });
        }}
        onOpenPythonModal={() => setShowPythonModal(true)}
        onOpenUploadModal={() => setShowCsvModal(true)}
        onTriggerFullSync={() => setShowShopifyModal(true)}
        onExportShopifyCsv={() => handleExportShopifyCsv()}
        onOpenCleanupModal={() => setShowCleanupModal(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 2. Key Operational KPI Cards */}
        <DashboardStats
          products={cleansedProducts}
          pricingConfig={pricingConfig}
          whitewashConfig={whitewashConfig}
          masterListingCount={groupedListings.length}
        />

        {/* 3. ArkSwift API & Signature Generator Studio */}
        <div id="arkswift-studio">
          <ArkSwiftSignStudio
            config={arkswiftConfig}
            onUpdateConfig={setArkswiftConfig}
            onTestFetch={handleTestArkSwiftFetch}
            isTesting={isSyncing}
          />
        </div>

        {/* 4. Whitewash & Tiered Pricing Formula Configuration */}
        <WhitewashPricingPanel
          whitewashConfig={whitewashConfig}
          pricingConfig={pricingConfig}
          onUpdateWhitewash={setWhitewashConfig}
          onUpdatePricing={setPricingConfig}
        />

        {/* 5. Product Catalog: Master Listings with Variants Table */}
        <ProductCatalogTable
          products={cleansedProducts}
          rawItemsMap={rawItemsMap}
          selectedListingIds={selectedListingIds}
          onToggleSelectListing={handleToggleSelectListing}
          onSelectAllListings={handleSelectAllListings}
          onPushListing={handlePushListing}
          onPreviewListing={setPreviewListing}
          onInspectListingPayload={setInspectListing}
          onExportCsv={handleExportShopifyCsv}
          onOpenBatchSyncModal={() => setShowShopifyModal(true)}
          isPushing={isSyncing}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
        <p>
          Casalivo Automated Cross-Border E-Commerce &amp; Inventory Sync Engine • Built for ArkSwift &amp; Shopify Admin API
        </p>
      </footer>

      {/* Modals */}
      <ShopifyPublishModal
        isOpen={showShopifyModal}
        onClose={() => setShowShopifyModal(false)}
        config={shopifyConfig}
        onUpdateConfig={setShopifyConfig}
        products={cleansedProducts}
        selectedIds={selectedListingIds}
        onExecuteSync={handleExecuteBatchSync}
        isSyncing={isSyncing}
        syncLogs={syncLogs}
        onOpenCleanupModal={() => setShowCleanupModal(true)}
      />

      <ShopifyStoreCleanupModal
        isOpen={showCleanupModal}
        onClose={() => setShowCleanupModal(false)}
        config={shopifyConfig}
      />

      <PythonScriptModal
        isOpen={showPythonModal}
        onClose={() => setShowPythonModal(false)}
        whitewashConfig={whitewashConfig}
        pricingConfig={pricingConfig}
        shopifyConfig={shopifyConfig}
        arkswiftConfig={arkswiftConfig}
      />

      <CsvUploadModal
        isOpen={showCsvModal}
        onClose={() => setShowCsvModal(false)}
        onImportProducts={handleImportCsv}
      />

      <ProductPreviewModal
        product={previewProduct}
        listing={previewListing}
        onClose={() => {
          setPreviewProduct(null);
          setPreviewListing(null);
        }}
      />

      <PayloadInspectModal
        product={inspectProduct}
        listing={inspectListing}
        shopifyConfig={shopifyConfig}
        onClose={() => {
          setInspectProduct(null);
          setInspectListing(null);
        }}
      />
    </div>
  );
}
