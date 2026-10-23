import React, { useState } from 'react';
import { UploadCloud, FileSpreadsheet, Check, AlertCircle, X, ArrowRight } from 'lucide-react';
import Papa from 'papaparse';
import { ArkSwiftRawItem } from '../types';
import { generateEan13Barcode } from '../utils/whitewashEngine';

interface CsvUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportProducts: (items: ArkSwiftRawItem[]) => void;
}

export const CsvUploadModal: React.FC<CsvUploadModalProps> = ({
  isOpen,
  onClose,
  onImportProducts,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<{
    sku: string;
    title: string;
    listPrice: string;
    esShippingFee: string;
    price: string;
    stock: string;
    vendor: string;
    images: string;
    category: string;
    color: string;
    dimensions: string;
  }>({
    sku: '',
    title: '',
    listPrice: '',
    esShippingFee: '',
    price: '',
    stock: '',
    vendor: '',
    images: '',
    category: '',
    color: '',
    dimensions: '',
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setErrorMsg(null);

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0 && results.data.length === 0) {
          setErrorMsg('CSV 解析错误: ' + results.errors[0].message);
          return;
        }

        const data = results.data as Record<string, any>[];
        setParsedRows(data);
        const detectedHeaders = results.meta.fields || [];
        setHeaders(detectedHeaders);

        // Auto match columns based on typical Aosom / ArkSwift headers
        const matchedListPrice =
          detectedHeaders.find((h) => /^list\s*price/i.test(h)) ||
          detectedHeaders.find((h) => /list\s*price|cost\s*price|供货价|单价|批发价|基础价/i.test(h)) ||
          '';

        const matchedShipping =
          detectedHeaders.find((h) => /es\s*shipping\s*fee/i.test(h)) ||
          detectedHeaders.find((h) => /shipping\s*fee|es\s*shipping|运费|flete/i.test(h)) ||
          '';

        const mapping = {
          sku: detectedHeaders.find((h) => /^seller\s*sku$/i.test(h)) || detectedHeaders.find((h) => /sku|商品编码|条形码|code|item_no/i.test(h)) || detectedHeaders[0] || '',
          title: detectedHeaders.find((h) => /product\s*name.*spanish|spanish.*name/i.test(h)) || detectedHeaders.find((h) => /title|name|商品名称|标题|item_name/i.test(h)) || detectedHeaders[1] || '',
          listPrice: matchedListPrice || detectedHeaders.find((h) => /cost|price|成本/i.test(h)) || '',
          esShippingFee: matchedShipping || '',
          price: matchedListPrice || detectedHeaders.find((h) => /cost|price|成本/i.test(h)) || '',
          stock: detectedHeaders.find((h) => /qty\s*avail|stock|quantity|qty|库存|数量|可用库存/i.test(h)) || '',
          vendor: detectedHeaders.find((h) => /vendor|supplier|品牌|供应商|原厂/i.test(h)) || '',
          images: detectedHeaders.find((h) => /image|img|图片|主图|pic/i.test(h)) || '',
          category: detectedHeaders.find((h) => /^category$/i.test(h)) || detectedHeaders.find((h) => /category|三级类目|类目|分类/i.test(h)) || '',
          color: detectedHeaders.find((h) => /main\s*color|color|颜色/i.test(h)) || '',
          dimensions: detectedHeaders.find((h) => /assembled.*(length|width|height)|dimension|medidas|尺寸/i.test(h)) || '',
        };
        setColumnMapping(mapping);
      },
    });
  };

  const handleConfirmImport = () => {
    if (parsedRows.length === 0) {
      setErrorMsg('没有可导入的数据行');
      return;
    }

    const items: ArkSwiftRawItem[] = parsedRows.map((row, idx) => {
      const rawSku = String(row[columnMapping.sku] || `ITEM-${idx + 1}`).trim();
      const rawTitle = String(row[columnMapping.title] || `ArkSwift Item ${rawSku}`).trim();
      
      // 提取 List Price 和 ES Shipping Fee 并相加作为基准成本
      const listPriceVal = columnMapping.listPrice
        ? parseFloat(String(row[columnMapping.listPrice] || '0').replace(/[^0-9.]/g, '')) || 0
        : parseFloat(String(row[columnMapping.price] || '0').replace(/[^0-9.]/g, '')) || 0;

      const shippingFeeVal = columnMapping.esShippingFee
        ? parseFloat(String(row[columnMapping.esShippingFee] || '0').replace(/[^0-9.]/g, '')) || 0
        : 0;

      const combinedCost = listPriceVal + shippingFeeVal;
      const finalCost = combinedCost > 0 ? combinedCost : (parseFloat(String(row[columnMapping.price] || '25.0').replace(/[^0-9.]/g, '')) || 25.0);

      const rawStock = parseInt(String(row[columnMapping.stock] || '0').replace(/[^0-9]/g, '')) || 10;
      const rawVendor = String(row[columnMapping.vendor] || 'SPANISH AOSOM SL').trim();
      // Requirement 1: Column X Category is Aosom's 3rd-level English category
      const rawCategory = String(row[columnMapping.category] || '').trim();
      const rawColor = columnMapping.color ? String(row[columnMapping.color] || '').trim() : '';
      const rawDims = columnMapping.dimensions ? String(row[columnMapping.dimensions] || '').trim() : '';
      const rawImage = String(row[columnMapping.images] || '').trim();

      const images = rawImage
        ? rawImage.split(/[,;|]/).map((u) => u.trim()).filter(Boolean)
        : ['https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80'];

      return {
        id: `csv-${Date.now()}-${idx}`,
        originalSku: rawSku,
        originalTitle: rawTitle,
        originalVendor: rawVendor,
        originalPrice: finalCost,
        listPrice: listPriceVal || finalCost,
        esShippingFee: shippingFeeVal,
        stock: rawStock,
        category: rawCategory || 'Greenhouse',
        englishCategory: rawCategory,
        mainColor: rawColor,
        dimensions: rawDims,
        barcode: generateEan13Barcode(rawSku),
        images,
        description: `Imported from Aosom/ArkSwift CSV export (${rawSku})`,
      };
    });

    onImportProducts(items);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl my-6">
        {/* Header */}
        <div className="bg-slate-800/80 px-6 py-4 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">导入 Aosom / ArkSwift 供应商表格</h3>
              <p className="text-xs text-slate-400">支持 CSV / TXT 格式，自动识别三级类目(Category)、规格与价格</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* File input */}
          <div className="border-2 border-dashed border-slate-700 hover:border-amber-400/60 rounded-xl p-6 text-center transition bg-slate-950/40">
            <UploadCloud className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-200 mb-1">
              {file ? file.name : '点击选择或拖拽供应商表格 (例如: Aosom ESStore Products.csv / 库存.csv)'}
            </p>
            <p className="text-[11px] text-slate-500 mb-3">支持 Aosom / ArkSwift 导出的任意商品库存表格</p>
            <label className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg cursor-pointer transition">
              <span>浏览本地文件</span>
              <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Column Mapping Section if file loaded */}
          {headers.length > 0 && (
            <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">
                  表格列头映射 (已成功解析 {parsedRows.length} 行数据)
                </span>
                <span className="text-[10px] text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800">
                  自动配对完成
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">SKU 编码列 (Seller SKU) *</label>
                  <select
                    value={columnMapping.sku}
                    onChange={(e) => setColumnMapping({ ...columnMapping, sku: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  >
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">商品标题列 (Product Name) *</label>
                  <select
                    value={columnMapping.title}
                    onChange={(e) => setColumnMapping({ ...columnMapping, title: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  >
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Aosom 三级英文类目 (Category) *</label>
                  <select
                    value={columnMapping.category}
                    onChange={(e) => setColumnMapping({ ...columnMapping, category: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-amber-300 font-medium"
                  >
                    <option value="">-- 未指定 (自动推断) --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">用于自动填充 Tag 并映射 Shopify 1-2 级目录</span>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">主颜色列 (Main Color / Color)</label>
                  <select
                    value={columnMapping.color}
                    onChange={(e) => setColumnMapping({ ...columnMapping, color: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  >
                    <option value="">-- 无 / 未指定 --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Aosom 底价列 (List Price Excl. Tax) *
                  </label>
                  <select
                    value={columnMapping.listPrice}
                    onChange={(e) => setColumnMapping({ ...columnMapping, listPrice: e.target.value, price: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  >
                    <option value="">-- 未指定 (默认 €25.00) --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    西班牙运费列 (ES Shipping Fee)
                  </label>
                  <select
                    value={columnMapping.esShippingFee}
                    onChange={(e) => setColumnMapping({ ...columnMapping, esShippingFee: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-amber-300 font-medium"
                  >
                    <option value="">-- 无 / 表格未包含 (€0.00) --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">实时库存量 (Qty Available) *</label>
                  <select
                    value={columnMapping.stock}
                    onChange={(e) => setColumnMapping({ ...columnMapping, stock: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  >
                    <option value="">-- 未指定 (默认 10件) --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pricing Rule Note */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-200/90 flex items-start gap-2">
                <span className="text-base shrink-0 leading-none">⚡</span>
                <div>
                  <strong>自动核算规则生效：</strong>系统将 <strong>List Price</strong> 与 <strong>ES Shipping Fee</strong> 相加计算基准成本：
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-amber-300/90 font-mono">
                    <span className="bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">相加 ≤ €100 ➔ 1.55 倍</span>
                    <span className="bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">相加 €100~€200 ➔ 1.50 倍</span>
                    <span className="bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">相加 &gt; €200 ➔ 1.45 倍</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-800/80 px-6 py-4 border-t border-slate-700/80 flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-2 bg-slate-800 text-slate-300 text-xs rounded-lg">
            取消
          </button>
          <button
            onClick={handleConfirmImport}
            disabled={parsedRows.length === 0}
            className="flex items-center gap-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition disabled:opacity-50"
          >
            <span>开始一键洗白入库 ({parsedRows.length} 行)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
