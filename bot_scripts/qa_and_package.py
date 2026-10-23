"""QA + delivery extras for the Casalivo Shopify import CSVs.

- Independent re-parse of every chunk (column integrity, required fields, unique handles/SKUs)
- inventory_on_hand.csv  : in-stock working sheet (SKU, title, stock, cost, price, margin, category)
- preview.html           : visual spot-check of 12 products (remote CDN images)
- delivery_notes.txt     : Chinese upload instructions
Usage: python qa_and_package.py <import_dir>
"""
import csv
import glob
import html
import json
import os
import random
import re
import sys
import zipfile
import collections

csv.field_size_limit(10 ** 9)

REQUIRED = ["Title", "URL handle", "Description", "Status", "SKU", "Price",
            "Cost per item", "Inventory quantity", "Product image URL"]


def main() -> None:
    d = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "shopify_import_full", "shopify_import_es_20261021_clean")
    chunks = sorted(glob.glob(os.path.join(d, "shopify_import_es_full_*.csv")))
    assert chunks, "no chunk found"

    products, image_rows = [], 0
    handles = collections.Counter()
    problems = []
    for f in chunks:
        with open(f, encoding="utf-8-sig", newline="") as fh:
            rd = csv.reader(fh)
            hdr = next(rd)
            n = len(hdr)
            for i, row in enumerate(rd, start=2):
                if len(row) != n:
                    problems.append(f"{os.path.basename(f)}:{i} column count {len(row)}!={n}")
                    continue
                rec = dict(zip(hdr, row))
                if not rec.get("Title"):
                    image_rows += 1
                    if not rec.get("URL handle") or not rec.get("Product image URL"):
                        problems.append(f"{os.path.basename(f)}:{i} broken image row")
                    continue
                handles[rec["URL handle"]] += 1
                for k in REQUIRED:
                    if not rec.get(k, "").strip():
                        problems.append(f"{os.path.basename(f)}:{i} empty {k} ({rec.get('SKU')})")
                try:
                    if float(rec["Price"]) <= float(rec["Cost per item"]):
                        problems.append(f"{os.path.basename(f)}:{i} price<=cost ({rec['SKU']})")
                except ValueError:
                    problems.append(f"{os.path.basename(f)}:{i} bad price ({rec['SKU']})")
                if not rec["Product image URL"].startswith("http"):
                    problems.append(f"{os.path.basename(f)}:{i} bad image url ({rec['SKU']})")
                products.append(rec)

    dup_handles = [h for h, c in handles.items() if c > 1]
    dup_skus = [s for s, c in collections.Counter(p["SKU"] for p in products).items() if c > 1]

    qa = {
        "chunks": [os.path.basename(c) for c in chunks],
        "products": len(products),
        "image_rows": image_rows,
        "active": sum(1 for p in products if p["Status"] == "active"),
        "draft": sum(1 for p in products if p["Status"] == "draft"),
        "duplicate_handles": dup_handles[:10],
        "duplicate_skus": dup_skus[:10],
        "problems": problems[:50],
        "problem_count": len(problems),
        "total_stock_units": sum(int(float(p["Inventory quantity"])) for p in products),
        "avg_price": round(sum(float(p["Price"]) for p in products) / len(products), 2),
        "with_shopify_category": sum(1 for p in products if p["Product category"].strip()),
    }
    json.dump(qa, open(os.path.join(d, "qa_report.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print(json.dumps(qa, ensure_ascii=False, indent=2))

    # ---------------- working inventory sheet (in stock only)
    stock_path = os.path.join(d, "inventory_on_hand.csv")
    in_stock = [p for p in products if p["Status"] == "active"]
    in_stock.sort(key=lambda p: -int(float(p["Inventory quantity"])))
    with open(stock_path, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(["SKU", "Título", "Categoría", "Stock disponible", "Coste (€)", "PVP (€)",
                    "Margen (€)", "Margen (%)", "URL producto"])
        for p in in_stock:
            cost, price = float(p["Cost per item"]), float(p["Price"])
            w.writerow([p["SKU"], p["Title"], p["Type"], p["Inventory quantity"],
                        f"{cost:.2f}", f"{price:.2f}", f"{price - cost:.2f}",
                        f"{(price - cost) / price * 100:.1f}", p["Product image URL"]])

    # ---------------- visual spot-check
    random.seed(20261021)
    sample = random.sample(in_stock, 12)
    cards = []
    for p in sample:
        desc = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", p["Description"]))[:220]
        cards.append(f"""    <article>
      <img src="{html.escape(p['Product image URL'])}" alt="{html.escape(p['Title'])}" loading="lazy">
      <div class="body">
        <span class="sku">{html.escape(p['SKU'])}</span>
        <h2>{html.escape(p['Title'][:110])}</h2>
        <p class="price">{p['Price']} € <s>coste {p['Cost per item']} €</s></p>
        <p class="meta">{html.escape(p['Type'])} · stock {p['Inventory quantity']}</p>
        <p class="desc">{html.escape(desc)}…</p>
      </div>
    </article>""")
    page = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Casalivo · muestra de importación</title>
<style>
 body{{font-family:system-ui,Segoe UI,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:28px}}
 h1{{font-size:20px;margin:0 0 4px}} .sub{{color:#64748b;font-size:13px;margin-bottom:22px}}
 .grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px}}
 article{{background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;display:flex;flex-direction:column}}
 img{{width:100%;height:190px;object-fit:cover;background:#eef2f7}}
 .body{{padding:12px 14px 16px}} .sku{{font-size:11px;color:#94a3b8;letter-spacing:.06em}}
 h2{{font-size:13px;line-height:1.35;margin:6px 0 8px;font-weight:600}}
 .price{{font-weight:700;color:#0f172a;margin:0 0 4px}} .price s{{font-weight:400;color:#94a3b8;font-size:12px;margin-left:6px}}
 .meta{{font-size:12px;color:#64748b;margin:0 0 8px}} .desc{{font-size:12px;color:#475569;line-height:1.5;margin:0}}
</style></head><body>
<h1>Casalivo · muestra de 12 productos del import</h1>
<div class="sub">{len(products)} productos ({qa['active']} activos / {qa['draft']} borradores) · previsualización aleatoria</div>
<div class="grid">
{chr(10).join(cards)}
</div></body></html>"""
    open(os.path.join(d, "preview.html"), "w", encoding="utf-8").write(page)

    # ---------------- notes + zip
    man = json.load(open(os.path.join(d, "manifest.json"), encoding="utf-8"))
    margin = man.get("avg_margin_pct", "")
    notes = f"""CASALIVO · Shopify 导入包（源文件 Aosom ESStore Products 20261021(6).xlsx）

内容
  shopify_import_es_full_01..05.csv   Shopify 产品导入表（当前后台模板），共 {len(products)} 个商品
  inventory_on_hand.csv               有货清单（{qa['active']} 个，按库存排序，含成本/售价/毛利）
  manifest.json                       生成参数与统计
  qa_report.json                      质检结果（{qa['problem_count']} 个问题）
  preview.html                        12 个商品的效果预览

导入步骤
  1. Shopify 后台 → 产品 → 导入 → 上传 shopify_import_es_full_01.csv
     勾选「覆盖具有相同 handle 的产品」，等待完成。
  2. 依次上传 02、03、04、05（每个文件 ≤ 2000 个商品，<13MB，低于 Shopify 15MB 限制）。
  3. 导入完成后在全部分产品里按 Status 过滤：active = 有货上架，draft = 缺货保留不上架。

规则说明
  · 供应商品牌（Aosom/Homcom/Outsunny/PawHut/Vinsetto/SoBuy/Songmics 等）、官网链接、邮箱、
    「官方店/原厂保修」等表述已全部清除；被清除处用中性西语「nuestra colección」补位，句子通顺。
  · 每个商品已映射到 Shopify 标准产品类目（Product category），共 159 个类目全部覆盖，
    8155/8156 个商品有有效类目，仅「Other Supplies」留空由 Shopify 自动识别。
  · SKU 保持供应商原始编码（大写），Handle = SKU + 西语标题 slug，唯一不重复。
  · 售价 = 成本 × 2.5（<20€）/ 2.0（20-50€）/ 1.8（>50€），取整到 .99；平均毛利 {margin}%。
  · 划线价默认留空（避免 Google Merchant Center 判定虚假折扣）；需要时用 --with-compare-at 重新生成。
  · 库存 = 可售数量 − 3（安全缓冲）；≤3 或 0 的商品写入 draft，不公开上架。
  · 重量、尺寸、颜色、材质、卖点、规格表、欧洲仓 3-5 天发货与 12 个月质保文案均为西语。
"""
    open(os.path.join(d, "delivery_notes.txt"), "w", encoding="utf-8").write(notes)

    zip_path = os.path.join(os.path.dirname(d), "casalivo_shopify_import_20261021.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name in sorted(os.listdir(d)):
            if name.endswith((".csv", ".json", ".html", ".txt")):
                z.write(os.path.join(d, name), name)
    print(f"\nzip -> {zip_path}  ({os.path.getsize(zip_path)/1e6:.1f} MB)")


if __name__ == "__main__":
    main()
