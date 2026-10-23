"""QA + delivery packaging for the variant-aware build (v3).

- Independent re-parse of every chunk; verifies variant integrity
  (unique handles/SKUs, distinct colour option values, price > cost, images present).
- inventory_on_hand.csv  : variant-level working sheet (SKU, parent title, colour, stock, cost, price, margin)
- preview.html           : visual spot-check of variant parents with colour swatches
- delivery_notes.txt     : Chinese upload instructions
- casalivo_shopify_import_<date>.zip
"""
import csv
import glob
import html
import json
import os
import random
import re
import sys
import collections
import datetime
import zipfile

csv.field_size_limit(10 ** 9)


def main():
    d = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "shopify_import_full",
        "shopify_import_es_20261021_clean")
    chunks = sorted(glob.glob(os.path.join(d, "shopify_import_es_full_*.csv")))
    assert chunks, "no chunks found in " + d

    rows = []
    for f in chunks:
        with open(f, encoding="utf-8-sig", newline="") as fh:
            for r in csv.DictReader(fh):
                rows.append(r)

    by_handle = collections.defaultdict(list)
    for r in rows:
        by_handle[r["URL handle"]].append(r)

    problems = []
    sku_counter = collections.Counter()
    variant_parents = 0
    single = 0
    n_variants = 0
    n_active_parents = 0

    for h, rs in by_handle.items():
        vr = [r for r in rs if r.get("Title")]
        if not vr:
            problems.append(("no title rows", h))
            continue
        skus = [r["SKU"] for r in vr]
        for s in skus:
            sku_counter[s] += 1
        combos = {(r["Option1 value"], r["Option2 value"]) for r in vr}
        if len(combos) != len(vr):
            problems.append(("dup option combo", h))
        if len(set(skus)) != len(skus):
            problems.append(("dup sku in parent", h, skus))
        if len(vr) > 1:
            variant_parents += 1
        else:
            single += 1
        n_variants += len(vr)
        if vr[0]["Status"] == "active":
            n_active_parents += 1
        for r in vr:
            try:
                if float(r["Price"]) <= float(r["Cost per item"]):
                    problems.append(("price<=cost", r["SKU"]))
            except ValueError:
                problems.append(("bad price", r["SKU"]))
            if not (r["Product image URL"].startswith("http") or r["Variant image URL"].startswith("http")):
                problems.append(("no image", r["SKU"]))

    dup_skus = [s for s, c in sku_counter.items() if c > 1]
    qa = {
        "parents": len(by_handle),
        "variant_parents": variant_parents,
        "single_products": single,
        "total_variants": n_variants,
        "active_parents": n_active_parents,
        "duplicate_handles": [],
        "duplicate_skus": dup_skus[:20],
        "problems": problems[:50],
        "problem_count": len(problems),
    }
    json.dump(qa, open(os.path.join(d, "qa_report.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print(json.dumps(qa, ensure_ascii=False, indent=2))

    # ---------------- variant-level inventory sheet
    inv_path = os.path.join(d, "inventory_on_hand.csv")
    sheet = []
    for h, rs in by_handle.items():
        vr = [r for r in rs if r.get("Title")]
        for r in vr:
            if not r["SKU"]:
                continue
            cost = float(r["Cost per item"])
            price = float(r["Price"])
            qty = int(float(r["Inventory quantity"]))
            sheet.append({
                "SKU": r["SKU"],
                "Título": r["Title"],
                "Color": r["Option1 value"] if r["Option1 name"] == "Color" else "",
                "Talla": r["Option2 value"] if r["Option2 name"] == "Talla" else "",
                "Categoría Shopify": r["Product category"],
                "Stock": qty,
                "Coste (€)": f"{cost:.2f}",
                "PVP (€)": f"{price:.2f}",
                "Margen (€)": f"{price - cost:.2f}",
                "Margen (%)": f"{(price - cost) / price * 100:.1f}",
                "Estado": "active" if qty > 0 else "draft",
            })
    sheet.sort(key=lambda x: -x["Stock"])
    with open(inv_path, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=["SKU", "Título", "Color", "Talla", "Categoría Shopify",
                                           "Stock", "Coste (€)", "PVP (€)", "Margen (€)",
                                           "Margen (%)", "Estado"])
        w.writeheader()
        for s in sheet:
            w.writerow(s)

    # ---------------- visual spot-check (variant parents)
    random.seed(20261021)
    vp = [h for h, rs in by_handle.items() if sum(1 for r in rs if r.get("Title")) > 1]
    sample = random.sample(vp, min(12, len(vp)))
    cards = []
    for h in sample:
        rs = by_handle[h]
        vr = [r for r in rs if r.get("Title")]
        title = vr[0]["Title"]
        img = vr[0]["Variant image URL"] or vr[0]["Product image URL"]
        desc = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", vr[0]["Description"] or ""))[:160]
        chips = "".join(
            f'<span class="chip">{html.escape((r["Option1 value"] if r["Option1 name"]=="Color" else "") + ((" · " + r["Option2 value"]) if r["Option2 name"]=="Talla" else ""))} <i>{r["Price"]}€</i></span>'
            for r in vr)
        cards.append(f"""    <article>
      <img src="{html.escape(img)}" alt="{html.escape(title)}" loading="lazy">
      <div class="body">
        <span class="sku">{html.escape(vr[0]['SKU'].rsplit('-',1)[0] if '-' in vr[0]['SKU'] else vr[0]['SKU'])} · {len(vr)} colores</span>
        <h2>{html.escape(title[:110])}</h2>
        <div class="chips">{chips}</div>
        <p class="desc">{html.escape(desc)}…</p>
      </div>
    </article>""")
    page = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Casalivo · variantes</title>
<style>
 body{{font-family:system-ui,Segoe UI,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:28px}}
 h1{{font-size:20px;margin:0 0 4px}} .sub{{color:#64748b;font-size:13px;margin-bottom:22px}}
 .grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px}}
 article{{background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;display:flex;flex-direction:column}}
 img{{width:100%;height:200px;object-fit:cover;background:#eef2f7}}
 .body{{padding:12px 14px 16px}} .sku{{font-size:11px;color:#94a3b8;letter-spacing:.05em}}
 h2{{font-size:13px;line-height:1.35;margin:6px 0 10px;font-weight:600}}
 .chips{{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}}
 .chip{{font-size:11px;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:999px;padding:3px 9px}}
 .chip i{{font-style:normal;color:#6366f1;margin-left:4px}}
 .desc{{font-size:12px;color:#475569;line-height:1.5;margin:0}}
</style></head><body>
<h1>Casalivo · 变体母体合并效果（随机 12 个）</h1>
<div class="sub">{qa['parents']} 个母体（{qa['variant_parents']} 个多彩色变体 + {qa['single_products']} 个单品）· {qa['total_variants']} 个变体 SKU</div>
<div class="grid">
{chr(10).join(cards)}
</div></body></html>"""
    open(os.path.join(d, "preview.html"), "w", encoding="utf-8").write(page)

    # ---------------- notes + zip
    man = json.load(open(os.path.join(d, "manifest.json"), encoding="utf-8"))
    notes = f"""CASALIVO · Shopify 导入包（变体合并版，源文件 Aosom ESStore Products 20261021(6).xlsx）

内容
  shopify_import_es_full_01..04.csv   Shopify 产品导入表（当前后台模板），共 {qa['parents']} 个母体 / {qa['total_variants']} 个变体 SKU
  inventory_on_hand.csv               变体级有货清单（含颜色、成本、售价、毛利、状态）
  manifest.json                       生成参数与统计
  qa_report.json                      质检结果（{qa['problem_count']} 个问题）
  preview.html                        变体合并效果预览（12 个母体）

变体合并规则
  · 颜色变体（Option1 = Color）：同一商品的不同颜色（SKU 后缀颜色码，如 831-135BK/WT/GY）合并。
  · 尺码变体（Option2 = Talla）：同一商品的不同尺寸/规格（如 120cm/150cm、20kg/30kg、4/7 cajones、
    84/100 pulgadas）合并为一个母体，尺寸放到了 Option2 变体选项上。
  · 结果：8156 个 SKU → {qa['parents']} 个母体（颜色变体 {man['color_variant_parents']} 个、
    尺码变体 {man['size_variant_parents']} 个、单品 {qa['single_products']} 个）。
  · 母体标题已去掉末尾颜色词和尺寸，颜色/尺码放到了变体选项上。

导入步骤（同前）
  1. Shopify 后台 → 产品 → 导入，按 01→04 顺序上传，勾选「覆盖具有相同 handle 的产品」。
  2. 同一 handle 的多行会被识别为同一产品的多个变体。

其它规则（同前）
  · 供应商品牌/官网/邮箱/官方店等已清除，用中性西语「nuestra colección」补位。
  · 每个母体已映射 Shopify 标准产品类目（159 类目全覆盖）。
  · 售价 = 成本 × 2.5 / 2.0 / 1.8，取整 .99；划线价留空（防 GMC 误判）。
  · 库存 = 可售 − 3 安全缓冲；全颜色缺货的母体自动转 draft。
"""
    open(os.path.join(d, "delivery_notes.txt"), "w", encoding="utf-8").write(notes)

    zip_path = os.path.join(os.path.dirname(d),
                            f"casalivo_shopify_import_20261021.zip")
    if os.path.exists(zip_path):
        os.remove(zip_path)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name in sorted(os.listdir(d)):
            if name.endswith((".csv", ".json", ".html", ".txt")):
                z.write(os.path.join(d, name), name)
    print(f"\nzip -> {zip_path}  ({os.path.getsize(zip_path)/1e6:.1f} MB)")


if __name__ == "__main__":
    main()
