"""
Build the FULL Aosom ES catalogue into Shopify import CSVs (v2 - copy-quality pass).

Improvements over build_full_catalog.py:
  1. Brand mentions are replaced by a context-aware Spanish filler instead of being
     deleted, so copy stays grammatical ("...este carrito auxiliar de." -> "...de nuestra colección.")
  2. Legal/boiler-plate supplier sentences (tienda oficial / garantía del fabricante /
     SPANISH AOSOM SL ...) are removed with punctuation repair.
  3. Duplicate product titles are disambiguated with the main colour (Google Shopping hygiene).
  4. Compare-at price is EMPTY by default (GMC fake-discount protection); --with-compare-at re-enables.
  5. QA: copy-defect scan, leak scan, per-file stats.

Source: the complete Aosom ESStore Products export (self-contained: price, stock, images).
Usage: python build_full_catalog_v2.py [xlsx] [out_dir] [--max-per-file 2000] [--max-images 10]
"""
import os
import re
import csv
import json
import glob
import math
import html
import unicodedata
import argparse
import collections
import warnings
from typing import Any, Dict, List, Optional

warnings.filterwarnings("ignore")

SAFETY_BUFFER = 3
FILLER = "nuestra colección"          # neutral Spanish noun replacing a supplier brand

BRAND_TOKENS = [
    "SPANISH AOSOM S.L.", "SPANISH AOSOM SL", "SPAIN AOSOM", "AOSOM.ES", "AOSOM",
    "HOMCOM", "OUTSUNNY", "PAWHUT", "VINSETTO", "SOBUY", "SONGMICS", "SONGESANG", "HAPPYBIRD",
]
BANNED = [
    "aosom", "homcom", "outsunny", "pawhut", "vinsetto", "sobuy", "songmics",
    "songesang", "happybird", "spain aosom", "spanish aosom sl",
    "tienda oficial", "distribuidor oficial", "garantía del fabricante",
    "manufacturer warranty", "official store", "spanish warehouse", "almacén españa",
    "aosom.es", "arkswift", "alibaba", "aliexpress",
]
BOILERPLATE = [
    r"tienda oficial[^.]*\.?", r"distribuidor oficial[^.]*\.?",
    r"garant[ií]a del fabricante[^.]*\.?", r"manufacturer warranty[^.]*\.?",
    r"official store[^.]*\.?", r"spanish warehouse[^.]*\.?", r"almac[eé]n (?:de )?espa[ñn]a[^.]*\.?",
]

CATEGORY_ES = {
    "greenhouse": "Invernaderos y Jardín", "garden & outdoor": "Jardín y Exterior",
    "garden": "Jardín y Exterior", "outdoor": "Jardín y Exterior",
    "furniture": "Muebles", "home furniture": "Muebles", "office": "Oficina y Despacho",
    "home & living": "Hogar", "home": "Hogar", "storage": "Almacenaje y Organización",
    "pet supplies": "Mascotas", "pets": "Mascotas", "sports & outdoor": "Deporte y Aire Libre",
    "toys": "Juguetes", "kitchen": "Cocina", "bathroom": "Baño", "bedroom": "Dormitorio",
    "lighting": "Iluminación", "tools": "Herramientas", "appliance": "Electrodomésticos",
}

GROUP_RULES = [
    ("mascota", ("cat ", "dog ", "pet", "litter", "scratcher", "hamster", "bird cage", "aquarium")),
    ("oficina", ("office", "desk", "chair", "workstation")),
    ("jardín", ("garden", "greenhouse", "shed", "grill", "parasol", "outdoor", "patio", "bbq",
                "planter", "gazebo", "awning", "marquee", "camping", "umbrella", "lounger")),
    ("almacenaje", ("storage", "cabinet", "shelf", "shelves", "bookcase", "trolley", "jewellery",
                    "wardrobe", "rack", "organizer", "shoe")),
    ("muebles", ("table", "sofa", "bed", "nightstand", "dressing", "bench", "stool", "buffet",
                 "sideboard", "chaise", "chair", "armchair", "furniture", "recliner", "daybed")),
    ("iluminación", ("light", "lamp", "led", "chandelier")),
    ("cocina", ("kitchen", "cookware", "dining", "bar ") ),
    ("infantil", ("ride-on", "kids", "children", "toy", "play")),
]

# Shopify's current product CSV template header order (subset we populate)
FIELDNAMES = [
    "Title", "URL handle", "Description", "Vendor", "Product category", "Type", "Tags",
    "Published on online store", "Status", "SKU", "Option1 name", "Option1 value",
    "Option2 name", "Option2 value", "Option3 name", "Option3 value",
    "Price", "Compare-at price", "Cost per item", "Charge tax", "Inventory tracker",
    "Inventory quantity", "Continue selling when out of stock", "Weight value (grams)",
    "Weight unit for display", "Requires shipping", "Fulfillment service",
    "Product image URL", "Image position", "Image alt text", "Variant image URL",
    "Gift card", "SEO title", "SEO description",
    "Google Shopping / Manufacturer part number (MPN)", "Google Shopping / Condition",
    "Google Shopping / Custom product", "Google Shopping / Custom label 0",
]

_BRAND_RE = re.compile("|".join(re.escape(b) for b in BRAND_TOKENS), re.IGNORECASE)
_PH = "\u00a7"  # placeholder for a stripped brand token


_CAT_MAP = {}
_here = os.path.dirname(os.path.abspath(__file__))
try:
    _CAT_MAP = json.load(open(os.path.join(_here, "shopify_category_map.json"), encoding="utf-8"))
except Exception:
    pass


def shopify_category(category_en: str) -> str:
    """Aosom English category -> Shopify Standard Product Taxonomy full path ('' = auto)."""
    return _CAT_MAP.get((category_en or "").strip(), "")


def money(value: Any) -> float:
    if value is None:
        return 0.0
    s = str(value).replace("€", "").replace("\u00a0", "").replace(" ", "").strip()
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


def num(value: Any) -> float:
    try:
        return float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return 0.0


BOILER_SENTENCE = re.compile(
    r"(derechos reservados|all rights reserved|copyright|tienda oficial|distribuidor oficial|"
    r"garant[ií]a del fabricante|manufacturer warranty|official store|spanish warehouse|"
    r"almac[eé]n (?:de )?espa[ñn]a|visita(?:r)? (?:nuestra|our) (?:web|p[aá]gina)|"
    r"www\.|https?://|@)", re.IGNORECASE)
SENT_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")
# a sentence ending in a naked connective / article is a brand-strip casualty
BAD_TAIL = re.compile(
    r"\b(de|del|con|para|en|por|y|o|a|la|el|los|las|un|una|nuestra|nuestro|este|esta|"
    r"su|sus|tu|tus|más)\s*[.,;:]?\s*$", re.IGNORECASE)
LOW_START = re.compile(r"^[a-záéíóúñ]")


def _tidy(text: str) -> str:
    """Punctuation / spacing repair after removals."""
    out = text
    out = re.sub(r"\(\s*\)", "", out)
    out = re.sub(r"[ \t]{2,}", " ", out)
    out = re.sub(r"\s+([,.;:!?])", r"\1", out)
    # dangling connective left in front of punctuation:  "... auxiliar de."  -> "... auxiliar."
    for _ in range(2):  # cascades: "en forma de Y," -> "en forma," -> "en forma"
        out = re.sub(r"\b(de|del|con|para|en|por)\s*([.,;!?])", r"\2", out, flags=re.IGNORECASE)
    # dangling connective in front of a verb:  "banqueta de es ideal" -> "banqueta es ideal"
    out = re.sub(r"\bde\s+(?=(es|son|est[aá]n?|era|tiene|tienen|ofrece|cuenta|incluye|permite|"
                 r"se|ha|han|puede|puedes|garantiza|destaca|en|con|para|por|y|o|adem[aá]s|"
                 r"junto|tambi[eé]n|muy|m[aá]s)\b)", "", out, flags=re.IGNORECASE)
    # "de en tu dormitorio" (brand stripped between two prepositions) -> "en tu dormitorio"
    out = re.sub(r"\bde\s+(?=(en|con|para|por)\s)", "", out, flags=re.IGNORECASE)
    out = re.sub(r"\s{2,}", " ", out)
    out = re.sub(r"([,;:])(?=[A-Za-zÁÉÍÓÚÑáéíóúñ])", r"\1 ", out)
    out = re.sub(r"\s+([.,;:!?])", r"\1", out)   # re-run after the removals above
    out = re.sub(r"^(?:\s*[-–|,;:])+", "", out)
    out = re.sub(r"[-–|,;\s]+$", "", out)
    return out.strip()


def _fix_sentence(sent: str, add_period: bool = True) -> str:
    """Expand the brand placeholder, tidy, then reject broken remnants."""
    out = sent
    # brand token opening a sentence/line is simply dropped ("PawHut jaula ..." -> "Jaula ...")
    out = re.sub(r"^\s*" + _PH + r"[\s,:.;\-–|]*", "", out)
    # inside an ALL-CAPS feature label ("INVERNADERO DE §:") the token is dropped, not filled
    m_label = re.match(r"^(\s*[A-ZÁÉÍÓÚÑ0-9 ,\-–/()]{4,}:)(.*)$", out, re.S)
    if m_label and _PH in m_label.group(1):
        out = m_label.group(1).replace(_PH + " ", "").replace(_PH, "") + m_label.group(2)
    out = re.sub(r"\b(por)\s*" + _PH, r"\1 nosotros", out, flags=re.IGNORECASE)
    out = re.sub(r"\b(del|de la|de)\s*" + _PH, "de " + FILLER, out, flags=re.IGNORECASE)
    out = re.sub(_PH + r"\s*(?=[A-ZÁÉÍÓÚÑ])", FILLER + " ", out)
    out = out.replace(_PH, FILLER)
    out = _tidy(out)
    if not out or len(out) < 12:
        return ""
    if BAD_TAIL.search(out):
        return ""
    if LOW_START.search(out):
        out = out[0].upper() + out[1:]
    if add_period and not out.rstrip().endswith((".", "!", "?", ")", '"')):
        out = out.rstrip() + "."
    return out


def scrub(text: Any, sentences: bool = True, add_period: bool = True) -> str:
    """Remove every supplier trace, keeping Spanish grammar intact.

    Sentences carrying brand/boiler-plate references are rewritten with a neutral
    filler; if the rewrite would leave a mangled sentence it is dropped whole.
    """
    if not text:
        return ""
    raw = str(text)
    raw = re.sub(r"https?://\S+", " ", raw)
    raw = re.sub(r"[\w.+-]+@[\w-]+\.[\w.]+", " ", raw)
    raw = _BRAND_RE.sub(_PH, raw)
    if not sentences:
        out = _fix_sentence(raw.strip(), add_period=add_period)
        if add_period is False:
            out = out.rstrip(".")
        return out
    kept = []
    for chunk in SENT_SPLIT.split(raw):
        if not chunk or not chunk.strip():
            continue
        if BOILER_SENTENCE.search(chunk):
            continue
        fixed = _fix_sentence(chunk.strip(), add_period=add_period)
        if fixed:
            kept.append(fixed)
    return " ".join(kept)


def pricing(cost: float) -> Dict[str, float]:
    if cost <= 0:
        return {"price": 0.0, "compare_at_price": 0.0}
    if cost <= 100:
        mult = 1.55
    elif cost <= 200:
        mult = 1.50
    else:
        mult = 1.45
    raw = cost * mult
    price = round(raw, 2)
    compare = round(price * 1.35, 2)
    return {"price": round(price, 2), "compare_at_price": round(compare, 2)}


def slug(text: str, limit: int = 55) -> str:
    norm = unicodedata.normalize("NFKD", text.lower()).encode("ASCII", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", norm).strip("-")[:limit].strip("-")


def spanish_group(category_en: str) -> str:
    low = (category_en or "").lower()
    for group, keys in GROUP_RULES:
        if any(k in low for k in keys):
            return group
    return CATEGORY_ES.get(low, "")


def feature_list(raw: Any) -> List[str]:
    if not raw:
        return []
    parts = [p.strip(" -•\t") for p in re.split(r"[\r\n]+", str(raw)) if p.strip()]
    return [scrub(p) for p in parts if len(scrub(p)) > 3][:8]


def spec_rows(row: List[Any], idx: Dict[str, int]) -> List[tuple]:
    specs: List[tuple] = []
    for label, col in [("Color", "Main Color"), ("Material", "Main Material"), ("Estilo", "Product Style")]:
        val = scrub(row[idx.get(col, -1)] or "").rstrip(".") if col in idx else ""
        if val and val.lower() != "none":
            specs.append((label, val))
    dims = []
    for label, col in [("L", "Assembled Length (cm)"), ("An", "Assembled Width (cm)"), ("Al", "Assembled Height (cm)")]:
        v = num(row[idx.get(col, -1)]) if col in idx else 0
        if v > 0:
            dims.append(f"{label} {v:g}")
    if dims:
        specs.append(("Medidas (cm)", " x ".join(dims)))
    weight = num(row[idx.get("Product Weight (kg)", -1)]) if "Product Weight (kg)" in idx else 0
    if weight > 0:
        specs.append(("Peso", f"{weight:g} kg"))
    return specs


def build_body(row: List[Any], idx: Dict[str, int]) -> str:
    desc = scrub(row[idx.get("Description", -1)] or "")
    feats = feature_list(row[idx.get("Features", -1)] if "Features" in idx else "")
    parts: List[str] = []
    if desc:
        parts.append(f"<p>{html.escape(desc)}</p>")
    if feats:
        items = []
        for f in feats:
            if ":" in f:
                head, tail = f.split(":", 1)
                if len(head) < 60:
                    items.append(f"<li><strong>{html.escape(head.strip())}:</strong>{html.escape(tail)}</li>")
                    continue
            items.append(f"<li>{html.escape(f)}</li>")
        parts.append("<h3>Características principales</h3><ul>" + "".join(items) + "</ul>")
    specs = spec_rows(row, idx)
    if specs:
        rows_html = "".join(
            f"<tr><td><strong>{html.escape(k)}</strong></td><td>{html.escape(v)}</td></tr>" for k, v in specs
        )
        parts.append('<h3>Ficha técnica</h3><table style="width:100%;border-collapse:collapse">'
                     f"<tbody>{rows_html}</tbody></table>")
    return "\n".join(parts)


def iter_catalog(xlsx_path: str):
    import openpyxl

    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb["Product info"] if "Product info" in wb.sheetnames else wb.worksheets[0]
    it = ws.iter_rows(values_only=True)
    header = next(it)
    idx = {h: i for i, h in enumerate(header) if h}
    for row in it:
        yield row, idx
    wb.close()


def build_row(row: List[Any], idx: Dict[str, int], max_images: int,
              with_compare_at: bool, vendor: str) -> Optional[Dict[str, str]]:
    sku = str(row[idx["Seller SKU"]] or "").strip()
    name = str(row[idx.get("Product Name (Spanish)")] or row[idx["Product Name"]] or "").strip()
    if not sku or not name:
        return None
    list_price = money(row[idx["List Price (Excl. Tax)"]]) if "List Price (Excl. Tax)" in idx else money(row[idx.get("List Price", -1)])
    shipping_key = next((k for k in idx if re.search(r"shipping\s*fee|flete", k, re.I)), None)
    shipping_fee = money(row[idx[shipping_key]]) if shipping_key else 0.0
    cost = list_price + shipping_fee
    qty = int(num(row[idx.get("Qty Available")]))
    images: List[str] = []
    for n in range(1, 13):
        url = str(row[idx.get(f"Product Image {n}")] or "").strip()
        if url.startswith("http") and url not in images:
            images.append(url)
    if not images:
        return None
    images = images[:max_images]

    title = scrub(name, sentences=False, add_period=False)
    # a brand token at the very front of a title is simply dropped
    title = re.sub(r"^" + re.escape(FILLER) + r"[\s,:.-]*", "", title).strip()
    title = re.sub(r"\s{2,}", " ", title)
    if not title:
        return None
    title = title[:255]

    colour = scrub(row[idx.get("Main Color", -1)] or "") if "Main Color" in idx else ""
    sku_clean = re.sub(r"\s+", "-", sku).upper()
    handle = f"{slug(sku_clean)}-{slug(name)}"
    price = pricing(cost)
    avail = max(0, qty - SAFETY_BUFFER)
    is_active = qty > SAFETY_BUFFER
    grams = int(num(row[idx.get("Product Weight (kg)")]) * 1000)
    category_en = str(row[idx.get("Category")] or "").strip()
    category_es = spanish_group(category_en)
    body = build_body(row, idx)
    tags = [t for t in ["Casalivo", "Stock verificado", category_es or category_en] if t]
    seo_title = title[:70]
    seo_desc = (title + " - Colección oficial Casalivo.")[:160]

    return {
        "Title": title,
        "URL handle": handle,
        "Description": body,
        "Vendor": vendor,
        "Product category": shopify_category(category_en),
        "Type": category_en,
        "Tags": ", ".join(dict.fromkeys(tags)),
        "Published on online store": "TRUE",
        "Status": "active",
        "SKU": sku_clean,
        "Option1 name": "Title",
        "Option1 value": "Default Title",
        "Price": f"{price['price']:.2f}",
        "Compare-at price": f"{price['compare_at_price']:.2f}" if with_compare_at else "",
        "Cost per item": f"{cost:.2f}",
        "Charge tax": "TRUE",
        "Inventory tracker": "shopify",
        "Inventory quantity": str(avail),
        "Continue selling when out of stock": "deny",
        "Weight value (grams)": str(grams),
        "Weight unit for display": "kg",
        "Requires shipping": "TRUE",
        "Fulfillment service": "manual",
        "Product image URL": images[0],
        "Image position": "1",
        "Image alt text": title,
        "Variant image URL": images[0],
        "Gift card": "FALSE",
        "SEO title": seo_title,
        "SEO description": seo_desc,
        "Google Shopping / Manufacturer part number (MPN)": sku_clean,
        "Google Shopping / Condition": "new",
        "Google Shopping / Custom product": "FALSE",
        "Google Shopping / Custom label 0": "",
        "_images": images[1:],
        "_colour": colour,
    }


def unique_titles(products: List[Dict[str, str]]) -> int:
    """Append the main colour to titles that collide (Google Shopping hygiene)."""
    groups = collections.defaultdict(list)
    for p in products:
        groups[p["Title"]].append(p)
    fixed = 0
    for title, items in groups.items():
        if len(items) < 2:
            continue
        for p in items:
            colour = p.get("_colour") or ""
            suffix = f" ({colour})" if colour and colour.lower() not in title.lower() else f" ({p['SKU']})"
            p["Title"] = (title + suffix)[:255]
            p["Image alt text"] = p["Title"]
            p["SEO title"] = p["Title"][:70]
            p["SEO description"] = (p["Title"] + " - Envío en 3-5 días desde almacén europeo. Garantía 12 meses.")[:160]
            fixed += 1
    return fixed


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx", nargs="?", default=sorted(glob.glob(
        os.path.expanduser("~/Downloads/Aosom ESStore Products *.xlsx")))[-1])
    ap.add_argument("out_dir", nargs="?", default=os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "shopify_import_full"))
    ap.add_argument("--max-per-file", type=int, default=2000)
    ap.add_argument("--max-images", type=int, default=10)
    ap.add_argument("--min-qty", type=int, default=0)
    ap.add_argument("--with-compare-at", action="store_true")
    ap.add_argument("--vendor", default="")
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)

    products: List[Dict[str, str]] = []
    seen_skus = set()
    costs, prices = [], []

    for row, idx in iter_catalog(args.xlsx):
        sku = str(row[idx["Seller SKU"]] or "").strip()
        if not sku or sku in seen_skus:
            continue
        if int(num(row[idx.get("Qty Available")])) < args.min_qty:
            continue
        main = build_row(row, idx, args.max_images, args.with_compare_at, args.vendor)
        if not main:
            continue
        seen_skus.add(sku)
        products.append(main)
        costs.append(float(main["Cost per item"]))
        prices.append(float(main["Price"]))

    fixed_titles = unique_titles(products)

    files = []
    n_chunks = math.ceil(len(products) / args.max_per_file)
    total_csv_rows = 0
    for c in range(n_chunks):
        chunk = products[c * args.max_per_file:(c + 1) * args.max_per_file]
        path = os.path.join(args.out_dir, f"shopify_import_es_full_{c + 1:02d}.csv")
        rows_written = 0
        with open(path, "w", newline="", encoding="utf-8-sig") as fh:
            w = csv.DictWriter(fh, fieldnames=FIELDNAMES)
            w.writeheader()
            rows_written += 1
            for p in chunk:
                w.writerow({k: v for k, v in p.items() if not k.startswith("_")})
                rows_written += 1
                for n, url in enumerate(p["_images"], start=2):
                    w.writerow({"URL handle": p["URL handle"], "Product image URL": url,
                                "Image position": str(n),
                                "Image alt text": f"{p['Title']} - vista {n}"})
                    rows_written += 1
        files.append({"file": os.path.basename(path), "products": len(chunk),
                      "rows": rows_written, "bytes": os.path.getsize(path)})
        total_csv_rows += rows_written

    leaks, defects = [], []
    for p in products:
        blob = " ".join(str(p.get(k, "")) for k in
                        ("Title", "Description", "Tags", "SEO title", "SEO description")).lower()
        hit = next((b for b in BANNED if b in blob), None)
        if hit:
            leaks.append({"sku": p.get("SKU"), "leak": hit})
        plain = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", p["Description"] or ""))
        d = None
        if re.search(r"\b(de|del|con|para|en)\s*[.,;!?]", plain):
            d = "dangling connective"
        elif re.search(r"\bde\s+(es|son|est[aá]|tiene|ofrece|cuenta|incluye|permite|se)\b", plain):
            d = "dangling 'de' before verb"
        elif "  " in plain or "( )" in plain:
            d = "double space / empty parens"
        elif re.search(r"\b" + re.escape(FILLER) + r"\s+" + re.escape(FILLER), plain):
            d = "filler duplicated"
        if d:
            defects.append({"sku": p.get("SKU"), "defect": d})

    manifest = {
        "source": args.xlsx,
        "products": len(products),
        "active": sum(1 for p in products if p["Status"] == "active"),
        "draft": sum(1 for p in products if p["Status"] == "draft"),
        "csv_rows": total_csv_rows,
        "files": files,
        "total_bytes": sum(f["bytes"] for f in files),
        "duplicate_titles_disambiguated": fixed_titles,
        "whitewash_leaks": leaks,
        "copy_defects": defects[:20],
        "copy_defect_count": len(defects),
        "price_min": min(prices) if prices else 0,
        "price_max": max(prices) if prices else 0,
        "avg_margin_pct": round(sum((s - c) / s * 100 for c, s in zip(costs, prices)) / len(prices), 1) if prices else 0,
        "brand_filler": FILLER,
        "compare_at_price": "included" if args.with_compare_at else "empty (GMC-safe)",
        "vendor": args.vendor or "",
        "safety_buffer": SAFETY_BUFFER,
        "template": "shopify-current (URL handle / Description / SKU / Inventory quantity)",
    }
    json.dump(manifest, open(os.path.join(args.out_dir, "manifest.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print(json.dumps({k: manifest[k] for k in
                      ("products", "active", "draft", "csv_rows", "total_bytes",
                       "duplicate_titles_disambiguated", "copy_defect_count",
                       "whitewash_leaks", "price_min", "price_max", "avg_margin_pct", "files")},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
