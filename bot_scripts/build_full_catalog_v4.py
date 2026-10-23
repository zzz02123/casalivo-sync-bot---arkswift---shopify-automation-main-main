"""
Build the FULL Aosom ES catalogue into Shopify import CSVs (v4 - colour + size variants).

On top of v3 (colour variants via SKU colour code), this version ALSO merges SIZE
variants (same model, different dimensions) into the same parent listing:

  * Option1 = Color   (from SKU trailing colour code)
  * Option2 = Talla   (from the title's dimension tokens that differ between sizes)

Grouping is two-phase:
  1. Colour merge  : group by SKU with trailing colour code stripped (as v3).
  2. Size merge    : group the colour-parents by a normalised title (all numbers -> "#",
                     colour stripped) so "Árbol 120cm/150cm/180cm" becomes one parent.

A parent with >=2 distinct colours gets Option1=Color; >=2 distinct sizes gets Option2=Talla.
"""
import os
import re
import csv
import json
import glob
import math
import argparse
import collections
import warnings

from build_full_catalog_v2 import scrub, pricing, slug, shopify_category, build_body, FIELDNAMES, SAFETY_BUFFER

warnings.filterwarnings("ignore")

# dimension token: LxWxH + unit, or number + meaningful unit (no bare numbers / kg / specs)
DIM = re.compile(
    r"(?:Ø\s*)?\d+(?:[.,]\d+)?\s*(?:(?:x|×|\*)\s*\d+(?:[.,]\d+)?){0,2}\s*[a-záéíóúñü]+\b",
    re.I)


def norm_tok(t):
    return re.sub(r"\s+", " ", t.strip().lower()).replace(",", ".")


def title_tokens(title):
    return [norm_tok(m.group(0)) for m in DIM.finditer(title)]


def normalize_title(title):
    t = re.sub(r"\d+(?:[.,]\d+)?", "#", title)
    t = re.sub(r"\s+", " ", t).strip().lower()
    return t


def color_words(all_colors):
    ws = sorted({(c or "").strip().lower() for c in all_colors if (c or "").strip()}, key=len, reverse=True)
    return [w for w in ws if len(w) >= 3]


def strip_color(title, words):
    low = title.lower()
    for w in words:
        if w and low.endswith(w) and len(title) > len(w) + 1:
            return title[:len(title) - len(w)].rstrip(" \t-–,;").strip()
    return title


def strip_dims(title):
    return re.sub(r"\s+", " ", DIM.sub(" ", title)).strip()


def sku_base(sku):
    s = (sku or "").strip()
    if re.search(r"[A-Z]{2,4}$", s) and not re.search(r"[0-9]$", s):
        return re.sub(r"[A-Z]{2,4}$", "", s).rstrip("-")
    return s


def iter_catalog(xlsx_path):
    import openpyxl
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb["Product info"] if "Product info" in wb.sheetnames else wb.worksheets[0]
    it = ws.iter_rows(values_only=True)
    header = next(it)
    idx = {h: i for i, h in enumerate(header) if h}
    for row in it:
        yield row, idx
    wb.close()


def row_title(row, idx):
    name = str(row[idx.get("Product Name (Spanish)")] or row[idx["Product Name"]] or "").strip()
    t = scrub(name, sentences=False, add_period=False)
    t = re.sub(r"^\s*nuestra colección[\s,:.-]*", "", t).strip()
    return re.sub(r"\s{2,}", " ", t)[:255]


def row_field(row, idx, name):
    return row[idx[name]] if name in idx else ""


def money(v):
    if v is None:
        return 0.0
    s = str(v).replace("€", "").replace("\u00a0", "").replace(" ", "").strip()
    if not s:
        return 0.0
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def num(v):
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return 0.0


def row_images(row, idx, max_images):
    out = []
    for n in range(1, 13):
        u = str(row_field(row, idx, f"Product Image {n}") or "").strip()
        if u.startswith("http") and u not in out:
            out.append(u)
    return out[:max_images]


def make_variant(row, idx, max_images):
    sku = str(row_field(row, idx, "Seller SKU") or "").strip()
    cost = money(row_field(row, idx, "List Price (Excl. Tax)"))
    qty = int(num(row_field(row, idx, "Qty Available")))
    grams = int(num(row_field(row, idx, "Product Weight (kg)")) * 1000)
    return {
        "sku": re.sub(r"\s+", "-", sku).upper(),
        "cost": cost,
        "price": pricing(cost)["price"],
        "avail": max(0, qty - SAFETY_BUFFER),
        "active": qty > SAFETY_BUFFER,
        "grams": grams,
        "images": row_images(row, idx, max_images),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx", nargs="?", default=sorted(glob.glob(
        os.path.expanduser("~/Downloads/Aosom ESStore Products *.xlsx")))[-1])
    ap.add_argument("out_dir", nargs="?", default=os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "shopify_import_full"))
    ap.add_argument("--rows-per-file", type=int, default=20000)
    ap.add_argument("--max-images", type=int, default=10)
    args = ap.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)
    for stale in glob.glob(os.path.join(args.out_dir, "shopify_import_es_full_*.csv")):
        os.remove(stale)
    for stale in ("manifest.json", "qa_report.json", "inventory_on_hand.csv", "preview.html",
                  "delivery_notes.txt"):
        sp = os.path.join(args.out_dir, stale)
        if os.path.exists(sp):
            os.remove(sp)

    # ---- load
    catalog = []   # dict per row
    all_colors = []
    for row, idx in iter_catalog(args.xlsx):
        sku = str(row_field(row, idx, "Seller SKU") or "").strip()
        if not sku:
            continue
        all_colors.append(row_field(row, idx, "Main Color"))
        catalog.append({"sku": sku, "row": row, "idx": idx,
                        "title": row_title(row, idx),
                        "color": (row_field(row, idx, "Main Color") or "").strip() or "Color",
                        "tokens": title_tokens(row_title(row, idx))})
    cwords = color_words(all_colors)

    # ---- phase 1: colour merge by SKU base
    groups = collections.OrderedDict()
    for p in catalog:
        groups.setdefault(sku_base(p["sku"]), []).append(p)

    protos = []   # each: {title (colour-stripped), norm, members:[p]}
    for base, members in groups.items():
        colors = {p["color"] for p in members}
        if len(members) > 1 and len(colors) >= 2:
            first = members[0]
            t = strip_color(first["title"], cwords) or first["title"]
            protos.append({"title": t, "norm": normalize_title(strip_color(first["title"], cwords)),
                           "members": members})
        else:
            for p in members:
                protos.append({"title": p["title"], "norm": normalize_title(strip_color(p["title"], cwords)),
                               "members": [p]})

    # ---- phase 2: size merge by normalised title
    sgroups = collections.OrderedDict()
    for pr in protos:
        sgroups.setdefault(pr["norm"], []).append(pr)

    parents = []   # final parents
    for norm, prs in sgroups.items():
        members = [p for pr in prs for p in pr["members"]]
        # size labels: tokens that differ across members
        all_toks = [t for p in members for t in p["tokens"]]
        common = {t for t in set(all_toks) if all(t in p["tokens"] for p in members)}
        size_labels = []
        for p in members:
            diff = [t for t in p["tokens"] if t not in common]
            size_labels.append(" ".join(diff) if diff else "Estándar")

        variants = []
        for p, sl in zip(members, size_labels):
            v = make_variant(p["row"], p["idx"], args.max_images)
            v["color"] = p["color"]
            v["size"] = sl
            variants.append(v)

        has_color = len({v["color"] for v in variants}) >= 2
        has_size = len({v["size"] for v in variants}) >= 2

        if has_color or has_size:
            # model title: colour stripped + dimensions stripped
            title = strip_dims(strip_color(members[0]["title"], cwords)) or members[0]["title"]
        else:
            title = members[0]["title"]   # single: keep full title (with colour)

        # option names
        opt1 = "Color" if has_color else "Title"
        opt2 = "Talla" if has_size else ""

        # dedupe duplicate (colour,size) listings (same product re-listed under a
        # V## version code): keep the one with the most stock
        best = {}
        for v in variants:
            key = (v["color"], v["size"])
            if key not in best or v["avail"] > best[key]["avail"]:
                best[key] = v
        variants = list(best.values())

        # compute handle & shared fields from first member
        first = members[0]
        cat_en = str(row_field(first["row"], first["idx"], "Category") or "").strip()
        body = build_body(first["row"], first["idx"])
        shared = row_images(first["row"], first["idx"], args.max_images)
        base_key = sku_base(first["sku"])
        handle = f"{slug(base_key)}-{slug(title)}"

        parents.append({
            "handle": handle, "title": title, "body": body, "type": cat_en,
            "category": shopify_category(cat_en),
            "tags": ", ".join(dict.fromkeys(["Envío desde Europa", "Stock verificado", cat_en])),
            "opt1": opt1, "opt2": opt2, "variants": variants,
            "shared": shared, "base": base_key,
        })

    # ---- de-dup parent titles (collisions across different SKU families)
    tc = collections.Counter(p["title"] for p in parents)
    dup = {t for t, c in tc.items() if c > 1}
    for p in parents:
        if p["title"] in dup:
            p["title"] = f"{p['title']} - {slug(p['base']).upper()}"[:255]

    # ---- emit CSV
    rows_out = []
    seen_skus = set()
    costs, prices = [], []
    for p in parents:
        any_active = any(v["active"] for v in p["variants"])
        for i, v in enumerate(p["variants"]):
            if v["sku"] in seen_skus:
                continue
            seen_skus.add(v["sku"])
            first = (i == 0)
            r = {
                "Title": p["title"],
                "URL handle": p["handle"],
                "Description": p["body"] if first else "",
                "Vendor": "",
                "Product category": p["category"] if first else "",
                "Type": p["type"] if first else "",
                "Published on online store": "TRUE" if first else "",
                "Status": "active" if first else "",
                "SKU": v["sku"],
                "Option1 name": p["opt1"] if first else "",
                "Option1 value": v["color"] if p["opt1"] == "Color" else "Default Title",
                "Option2 name": p["opt2"] if first else "",
                "Option2 value": v["size"] if p["opt2"] else "",
                "Price": f"{v['price']:.2f}",
                "Compare-at price": "",
                "Cost per item": f"{v['cost']:.2f}",
                "Charge tax": "TRUE",
                "Inventory tracker": "shopify",
                "Inventory quantity": str(v["avail"]),
                "Continue selling when out of stock": "deny",
                "Weight value (grams)": str(v["grams"]),
                "Weight unit for display": "kg",
                "Requires shipping": "TRUE",
                "Fulfillment service": "manual",
                "Product image URL": (p["shared"][0] if p["shared"] else "") if first else "",
                "Image position": "1" if first else "",
                "Image alt text": p["title"] if first else "",
                "Variant image URL": v["images"][0] if v["images"] else "",
                "Gift card": "FALSE" if first else "",
                "SEO title": p["title"][:70] if first else "",
                "SEO description": (p["title"] + " - Envío en 3-5 días desde almacén europeo. Garantía 12 meses.")[:160] if first else "",
                "Google Shopping / Manufacturer part number (MPN)": v["sku"],
                "Google Shopping / Condition": "new" if first else "",
                "Google Shopping / Custom product": "FALSE" if first else "",
                "Google Shopping / Custom label 0": "",
            }
            rows_out.append(r)
            costs.append(v["cost"])
            prices.append(v["price"])
        for n, url in enumerate(p["shared"][1:], start=2):
            rows_out.append({"URL handle": p["handle"], "Product image URL": url,
                             "Image position": str(n),
                             "Image alt text": f"{p['title']} - vista {n}"})

    # ---- write chunks
    files = []
    n_chunks = math.ceil(len(rows_out) / args.rows_per_file)
    total = 0
    for c in range(n_chunks):
        chunk = rows_out[c * args.rows_per_file:(c + 1) * args.rows_per_file]
        path = os.path.join(args.out_dir, f"shopify_import_es_full_{c + 1:02d}.csv")
        with open(path, "w", newline="", encoding="utf-8-sig") as fh:
            w = csv.DictWriter(fh, fieldnames=FIELDNAMES)
            w.writeheader()
            for r in chunk:
                w.writerow({k: r.get(k, "") for k in FIELDNAMES})
        files.append({"file": os.path.basename(path), "rows": len(chunk) + 1, "bytes": os.path.getsize(path)})
        total += len(chunk) + 1

    # ---- QA
    leaks = []
    for r in rows_out:
        if not r.get("Title"):
            continue
        blob = " ".join(str(r.get(k, "")) for k in
                        ("Title", "Description", "Tags", "SEO title", "SEO description")).lower()
        hit = next((b for b in ["aosom", "homcom", "outsunny", "pawhut", "vinsetto", "sobuy",
                                "songmics", "arkswift", "alibaba", "aliexpress"] if b in blob), None)
        if hit:
            leaks.append({"sku": r.get("SKU"), "leak": hit})

    has_color = sum(1 for p in parents if p["opt1"] == "Color")
    has_size = sum(1 for p in parents if p["opt2"] == "Talla")
    manifest = {
        "source": args.xlsx,
        "parents": len(parents),
        "total_variants": sum(len(p["variants"]) for p in parents),
        "color_variant_parents": has_color,
        "size_variant_parents": has_size,
        "single_products": sum(1 for p in parents if p["opt1"] == "Title" and not p["opt2"]),
        "csv_rows": total,
        "files": files,
        "total_bytes": sum(f["bytes"] for f in files),
        "whitewash_leaks": leaks,
        "price_min": min(prices) if prices else 0,
        "price_max": max(prices) if prices else 0,
        "avg_margin_pct": round(sum((s - c) / s * 100 for c, s in zip(costs, prices)) / len(prices), 1) if prices else 0,
        "template": "shopify-current (Option1=Color, Option2=Talla)",
    }
    json.dump(manifest, open(os.path.join(args.out_dir, "manifest.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print(json.dumps({k: manifest[k] for k in
                      ("parents", "total_variants", "color_variant_parents",
                       "size_variant_parents", "single_products", "csv_rows", "total_bytes",
                       "whitewash_leaks", "price_min", "price_max", "avg_margin_pct", "files")},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
