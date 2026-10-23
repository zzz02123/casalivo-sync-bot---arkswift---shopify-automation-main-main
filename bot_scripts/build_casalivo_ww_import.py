"""
Casalivo - Aosom ES xlsx -> Shopify import, cleansed by whitewash_engine.py
---------------------------------------------------------------------------
All cleansing / pricing / SKU / barcode logic lives in WhitewashEngine
(brand replacement, banned keywords, tier pricing, CSL- SKU, EAN-13).
This script only does the Shopify plumbing:

  * read the Aosom ES export ("Product info" sheet, Spanish columns)
  * merge colour + size variants into ONE parent product (Option1=Color, Option2=Talla)
  * call WhitewashEngine.transform() for every SKU
  * emit the current Shopify product CSV template, chunked, + manifest + QA report

Storefront rules applied here (not in the engine):
  * Variant Barcodes = ean: + 841 (Spain) + 5792 (manufacturer) + 5 digits + check
    digit; unique per variant, stable across rebuilds
  * Vendor stays empty and the Casalivo brand is removed from the title
  * Body (HTML) is assembled from Features / Description / colour / material /
    dimensions / weight / assembly manual as a mobile-first landing page

Usage:
  python build_casalivo_ww_import.py [xlsx] [out_dir] [--rows-per-file 20000]
                                     [--max-images 10] [--no-keep-out-of-stock]
                                     [--reuse-handles ../shopify_import_casalivo_es.csv]
"""
import argparse
import collections
import csv
import glob
import hashlib
import html
import json
import math
import os
import re
import sys
import unicodedata
import warnings
from typing import Any, Dict, List, Optional

warnings.filterwarnings("ignore")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from whitewash_engine import WhitewashEngine as W  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
MAX_IMAGES = 10
DEFAULT_REUSE_HANDLES = os.path.join(HERE, "..", "shopify_import_casalivo_es.csv")

try:
    TAXONOMY = json.load(open(os.path.join(HERE, "shopify_category_map.json"), encoding="utf-8"))
except Exception:  # pragma: no cover
    TAXONOMY = {}

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
    ("cocina", ("kitchen", "cookware", "dining", "bar ")),
    ("infantil", ("ride-on", "kids", "children", "toy", "play")),
]

FIELDNAMES = [
    "Title", "URL handle", "Description", "Vendor", "Product category", "Type", "Tags",
    "Published on online store", "Status", "SKU", "Variant Barcodes", "Option1 name", "Option1 value",
    "Option2 name", "Option2 value", "Option3 name", "Option3 value",
    "Price", "Compare-at price", "Cost per item", "Charge tax", "Inventory tracker",
    "Inventory quantity", "Continue selling when out of stock", "Weight value (grams)",
    "Weight unit for display", "Requires shipping", "Fulfillment service",
    "Product image URL", "Image position", "Image alt text", "Variant image URL",
    "Gift card", "SEO title", "SEO description",
    "Google Shopping / Manufacturer part number (MPN)", "Google Shopping / Condition",
    "Google Shopping / Custom product", "Google Shopping / Custom label 0",
    # drawer-ready assembly manual: the theme reads this instead of parsing the description
    "Assembly manual (product.metafields.custom.assembly_manual)",
]

# size tokens: numbers WITH a real unit ("120cm", "3,5x3x2 m") — a bare
# "6 Ventanas" or "PE 140 g/m²" must never be treated as a size
DIM = re.compile(
    r"(?:Ø\s*)?\d+(?:[.,]\d+)?\s*(?:(?:x|×|\*)\s*\d+(?:[.,]\d+)?){0,2}\s*"
    r"(?:cm|mm|m|kg|g|l|ml|pulgadas?|inches?)(?![\w/²%])", re.I)
NUM_CTX = re.compile(r"\d+(?:[.,]\d+)?(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,12})?", re.I)
BRAND_PREFIX = re.compile(r"^casalivo(?:\s+(?:pets|office))?\s*[-–—:|]*\s*", re.I)
BRAND_ANY = re.compile(r"\bcasalivo(?:\s+(?:pets|office))?\b\s*[-–—:|,]*\s*", re.I)
# supplier house brands the engine does not know about (they still show up in the ES feed)
EXTRA_BRANDS = re.compile(r"\b(?:aiyaplay|qaba|kleankin|songmics|vasagle|feandrea)\b\s*", re.I)

# GS1: 841 = Spain, 5792 = the manufacturer code, the 5 digits that follow are
# free for the seller and the 13th is the modulo-10 check digit -> ean:8415792615295
EAN_PREFIX = "8415792"
EAN_SPACE = 100000  # 5 free digits

ACRONYMS = {"pe", "pvc", "pu", "ps", "pp", "abs", "mdf", "hdpe", "eva", "led", "uv",
            "usb", "xxl", "xl", "xs", "kg", "cm", "mm", "3d", "4k", "ce", "tv", "dvd",
            "gps", "spf", "cad", "usb-c"}


# ------------------------------------------------------------------ helpers
def money(value: Any) -> float:
    """'1.234,56€' / '61,88€' -> float"""
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


def slug(text: str, limit: int = 60) -> str:
    norm = unicodedata.normalize("NFKD", (text or "").lower()).encode("ASCII", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", norm).strip("-")[:limit].strip("-")


def norm_color(value: Any) -> str:
    """'GRIS OSCURO' / 'gris oscuro' -> 'Gris Oscuro' so one colour never shows twice."""
    words = re.sub(r"\s+", " ", str(value or "").strip()).split(" ")
    small = {"y", "e", "o", "u", "de", "del", "con", "para"}
    out = []
    for i, w in enumerate(words):
        if not w:
            continue
        if i and w.lower() in small:
            out.append(w.lower())
        else:
            out.append(w[:1].upper() + w[1:].lower())
    return " ".join(out)


def tidy_copy(text: str) -> str:
    """Punctuation repair for what a brand/banned-word deletion leaves behind.

    WhitewashEngine removes the supplier tokens, so "Esta banqueta de Aosom es ideal"
    becomes "Esta banqueta de  es ideal". This pass stitches those holes without
    touching the engine itself.
    """
    if not text:
        return ""
    out = re.sub(r"\(\s*\)", "", str(text))
    out = re.sub(r"[ \t]{2,}", " ", out)
    for _ in range(3):
        prev = out
        # dangling preposition/article right before punctuation ("portátil de .")
        out = re.sub(r"\b(de|del|con|para|en|por|y|o|a|la|el|los|las)\s*([.,;:!?])", r"\2", out,
                     flags=re.IGNORECASE)
        # dangling "de" in front of a verb / adjective
        # "de" before a verb: "banqueta de es ideal" -> "banqueta es ideal".
        # Never before "un/una/este/esta": those are valid after "de".
        out = re.sub(
            r"\b(de|del)\s+(?=(es|son|est(?:á|an|aba|aban)|era|eran|tiene|tienen|ofrece|incluye|"
            r"permite|se|ha|han|puede|puedes|garantiza|destaca)\b)", "", out, flags=re.IGNORECASE)
        # punctuation left doubled by a removed brand (", ," / ", .")
        out = re.sub(r"([,;:])\s*(?=[,;:])", "", out)
        out = re.sub(r",\s*\.", ".", out)
        out = re.sub(r"\s+([,.;:!?])", r"\1", out)
        out = re.sub(r"\s{2,}", " ", out)
        if out == prev:
            break
    out = re.sub(r"^(?:\s*[-–|,;:])+", "", out)
    # a removed brand at the very end leaves the preposition that introduced it
    out = re.sub(r"\s+\b(de|del|con|para|en|por|y|o)$", "", out, flags=re.IGNORECASE)
    return out.strip()


def clean_lines(text: Any) -> List[str]:
    """Feature block: one bullet per line, each line cleansed by the engine."""
    if not text:
        return []
    items = []
    for line in re.split(r"[\r\n]+", str(text)):
        line = tidy_copy(W.clean_description(line.strip(" -•\t"))).strip(" .;")
        if len(line) > 3:
            items.append(line)
    return items[:8]


def spanish_group(category_en: str) -> str:
    low = (category_en or "").lower()
    for group, keys in GROUP_RULES:
        if any(k in low for k in keys):
            return group[:1].upper() + group[1:]
    return CATEGORY_ES.get(low, "")


def shopify_category(category_en: str) -> str:
    return TAXONOMY.get((category_en or "").strip(), "")


def row_get(row, idx, name, default=""):
    i = idx.get(name)
    return row[i] if i is not None and i < len(row) else default


def row_images(row, idx, limit=MAX_IMAGES) -> List[str]:
    out = []
    for n in range(1, 13):
        url = str(row_get(row, idx, f"Product Image {n}") or "").strip()
        if url.startswith("http") and url not in out:
            out.append(url)
    return out[:limit]


# ------------------------------------------------------------------ barcodes
def ean13_check(raw12: str) -> int:
    """GS1 modulo-10 check digit."""
    total = sum(int(ch) * (1 if i % 2 == 0 else 3) for i, ch in enumerate(raw12))
    return (10 - total % 10) % 10


def assign_barcodes(catalog: List[Dict[str, Any]]) -> None:
    """ean:841 5792 xxxxx check — one per variant, never repeated.

    The start point is a hash of the SKU, so a rebuild fingerprints the same
    barcode to the same SKU; when two SKUs land on the same slot the next free
    one is taken, which keeps the whole catalogue collision-free.
    """
    used = set()
    for v in catalog:
        n = int(hashlib.md5(v["sku"].encode("utf-8")).hexdigest(), 16) % EAN_SPACE
        for _ in range(EAN_SPACE):
            raw12 = f"{EAN_PREFIX}{n:05d}"
            if raw12 not in used:
                used.add(raw12)
                v["barcode"] = f"ean:{raw12}{ean13_check(raw12)}"
                break
            n = (n + 1) % EAN_SPACE


# ------------------------------------------------------------------ copy
def strip_brand(text: str) -> str:
    """Drop the house brand the engine injects; empty vendor, neutral title."""
    if not text:
        return ""
    out = BRAND_ANY.sub(" ", str(text))
    # "mesa de Casalivo con ruedas" -> "mesa de  con ruedas": only the "de" left
    # hanging in front of another preposition is dropped (never "para el" / "en la")
    out = re.sub(r"\b(?:de|del)\s+(?=(?:con|para|en|por|y|o)\b)", "", out, flags=re.IGNORECASE)
    out = tidy_copy(out).strip(" -–,;:|.")
    out = re.sub(r"\s{2,}", " ", out)
    return out[:1].upper() + out[1:] if out else ""


def strip_brand_text(text: str) -> str:
    """Same for a paragraph, but keep the original when the cleanup guts it."""
    if not text:
        return ""
    out = strip_brand(text)
    return out if len(out) >= max(12, len(text) * 0.5) else str(text).strip()


def sentence_case(label: str) -> str:
    """'PUERTA Y VENTANAS ENROLLABLES' -> 'Puerta y ventanas enrollables'."""
    words = str(label or "").split()
    out = []
    for i, w in enumerate(words):
        core = re.sub(r"[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]", "", w)
        if core and core.isupper() and core.lower() not in ACRONYMS:
            lower = core[:1].upper() + core[1:].lower() if i == 0 else core.lower()
            out.append(w.replace(core, lower))
        else:
            out.append(w)
    s = " ".join(out).strip()
    return s[:1].upper() + s[1:] if s else ""


def es_num(value: float) -> str:
    """15.5 -> 15,5 (Spanish decimal comma)."""
    return f"{value:g}".replace(".", ",")


def seo_description(text: str, limit: int = 160) -> str:
    """Cut on a word boundary so the meta description never ends mid-word."""
    flat = re.sub(r"\s+", " ", text or "").strip()
    if len(flat) <= limit:
        return flat
    cut = flat[:limit].rsplit(" ", 1)[0].rstrip(" ,;:.")
    return cut + "."


def paragraphs(text: str, per: int = 2, limit: int = 6) -> List[str]:
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text or "") if s.strip()]
    return [" ".join(sents[i:i + per]) for i in range(0, len(sents), per)][:limit]


H2 = 'style="font-size:19px;line-height:1.3;margin:34px 0 14px;font-weight:700"'
TD_L = ('style="padding:11px 14px 11px 0;border-bottom:1px solid #ececec;color:#6b6b6b;'
        'width:44%;vertical-align:top;font-size:15px"')
TD_R = 'style="padding:11px 0;border-bottom:1px solid #ececec;vertical-align:top;font-size:15px"'


def variant_dims(v: Dict[str, Any]) -> tuple:
    row, idx = v["_row"], v["_idx"]
    dims = tuple(num(row_get(row, idx, c)) for c in
                 ("Assembled Length (cm)", "Assembled Width (cm)", "Assembled Height (cm)"))
    return dims, num(row_get(row, idx, "Product Weight (kg)"))


def spec_rows(variants: List[Dict[str, Any]], has_color: bool) -> List[tuple]:
    """Colour / material / size / weight, with per-size values when they differ."""
    first = variants[0]
    row, idx = first["_row"], first["_idx"]
    specs: List[tuple] = []

    colour = "Varios colores disponibles" if has_color else first["color"]
    if colour:
        specs.append(("Color", colour))

    material = tidy_copy(str(row_get(row, idx, "Main Material") or "")).strip(" .,;")
    if material and material.lower() != "none":
        specs.append(("Material", material))

    style = tidy_copy(str(row_get(row, idx, "Product Style") or "")).strip(" .,;")
    if style and style.lower() != "none":
        specs.append(("Estilo", style))

    measured = [variant_dims(v) for v in variants]
    unique_dims = {m[0] for m in measured}
    if unique_dims != {(0.0, 0.0, 0.0)}:
        if len(unique_dims) == 1:
            dims = measured[0][0]
            if all(d > 0 for d in dims):
                specs.append(("Medidas montado (L x An x Al)",
                              " x ".join(es_num(d) for d in dims) + " cm"))
        else:
            per_size = []
            for v, (dims, _) in zip(variants, measured):
                if all(d > 0 for d in dims):
                    label = v.get("size") or v.get("color") or ""
                    per_size.append(f"{label}: " + " x ".join(es_num(d) for d in dims) + " cm")
            if per_size:
                specs.append(("Medidas montado", " · ".join(per_size[:4])))

    weights = {m[1] for m in measured}
    if len(weights) == 1:
        weight = measured[0][1]
        if weight > 0:
            specs.append(("Peso", f"{es_num(weight)} kg"))
    else:
        per_size = [f"{v.get('size') or v.get('color') or ''}: {es_num(w)} kg"
                    for v, (_, w) in zip(variants, measured) if w > 0]
        if per_size:
            specs.append(("Peso", " · ".join(per_size[:4])))
    return specs


def build_body(desc: str, feats: List[str], specs: List[tuple], manual_url: str,
               link_manual: bool = False) -> str:
    """Mobile-first landing page: short intro, scannable benefits, specs, assembly."""
    parts: List[str] = []

    for para in paragraphs(desc):
        parts.append(f'<p style="margin:0 0 16px;line-height:1.65">{html.escape(para)}</p>')

    if feats:
        items = []
        for f in feats:
            head, tail = "", f
            if ":" in f and len(f.split(":", 1)[0]) < 70:
                head, tail = f.split(":", 1)
            if head.strip():
                items.append(f'<li style="margin:0 0 14px;line-height:1.6">'
                             f'<strong style="display:block;margin-bottom:2px">'
                             f'{html.escape(sentence_case(head))}</strong>{html.escape(tail.strip())}</li>')
            else:
                items.append(f'<li style="margin:0 0 14px;line-height:1.6">{html.escape(f)}</li>')
        parts.append(f"<h2 {H2}>Características destacadas</h2>"
                     '<ul style="list-style:none;margin:0;padding:0">' + "".join(items) + "</ul>")

    if specs:
        rows = "".join(f'<tr><td {TD_L}>{html.escape(k)}</td><td {TD_R}>{html.escape(v)}</td></tr>'
                       for k, v in specs)
        parts.append(f"<h2 {H2}>Medidas y detalles</h2>"
                     '<table style="width:100%;border-collapse:collapse;table-layout:fixed">'
                     f"<tbody>{rows}</tbody></table>")

    if manual_url:
        parts.append(f"<h2 {H2}>Montaje</h2>"
                     '<p style="margin:0 0 14px;line-height:1.65">Incluye instrucciones de '
                     'montaje ilustradas, paso a paso, para que puedas dejarlo listo sin dudas.</p>')
        if link_manual:
            parts.append(f'<p style="margin:0"><a href="{html.escape(manual_url, quote=True)}" '
                         'target="_blank" rel="noopener" '
                         'style="display:inline-block;padding:12px 22px;border:1px solid #111;'
                         'border-radius:4px;font-weight:600;text-decoration:none">'
                         'Descargar manual de montaje (PDF)</a></p>')

    return "\n".join(parts)


# ------------------------------------------------------------------ variants
def sku_base(sku: str) -> str:
    s = (sku or "").strip()
    if re.search(r"[A-Z]{2,4}$", s) and not re.search(r"[0-9]$", s):
        return re.sub(r"[A-Z]{2,4}$", "", s).rstrip("-")
    return s


def norm_token(tok: str) -> str:
    return re.sub(r"\s+", " ", tok.strip().lower()).replace(",", ".")


def title_tokens(pattern: re.Pattern, title: str) -> List[str]:
    return [re.sub(r"\s+", " ", m.group(0)).strip() for m in pattern.finditer(title or "")]


def size_labels(members: List[Dict[str, Any]], attr: str) -> tuple:
    """Tokens that differ between the members of one parent + the shared ones."""
    normed = [[norm_token(t) for t in m[attr]] for m in members]
    common = set.intersection(*[set(n) for n in normed]) if normed else set()
    labels = [" ".join(dict.fromkeys(t for t in m[attr] if norm_token(t) not in common))
              for m in members]
    return labels, common


def normalize_title(title: str) -> str:
    t = re.sub(r"\d+(?:[.,]\d+)?", "#", title or "")
    return re.sub(r"\s+", " ", t).strip().lower()


def strip_dims(title: str) -> str:
    return re.sub(r"\s+", " ", DIM.sub(" ", title or "")).strip(" -–,;")


def color_words(all_colors: List[str]) -> List[str]:
    words = sorted({(c or "").strip().lower() for c in all_colors if (c or "").strip()},
                   key=len, reverse=True)
    return [w for w in words if len(w) >= 3]


def strip_color(title: str, words: List[str]) -> str:
    low = (title or "").lower()
    for w in words:
        if w and low.endswith(w) and len(title) > len(w) + 1:
            return title[:len(title) - len(w)].rstrip(" \t-–,;").strip()
    return title


def iter_catalog(path: str):
    import openpyxl

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Product info"] if "Product info" in wb.sheetnames else wb.worksheets[0]
    it = ws.iter_rows(values_only=True)
    header = next(it)
    idx = {h: i for i, h in enumerate(header) if h}
    for row in it:
        if any(c not in (None, "") for c in row):
            yield row, idx
    wb.close()


def load_existing_handles(path: Optional[str]) -> Dict[str, str]:
    """SKU -> handle of products already in the store, so a re-import updates instead
    of creating a second listing under a new handle."""
    out: Dict[str, str] = {}
    if not path or not os.path.exists(path):
        return out
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            sku = (row.get("Variant SKU") or "").strip()
            handle = (row.get("Handle") or "").strip()
            if sku and handle:
                out.setdefault(sku.upper(), handle)
    return out


def make_variant(row, idx, repairs: Dict[str, int]) -> Optional[Dict[str, Any]]:
    sku = str(row_get(row, idx, "Seller SKU")).strip()
    raw_title = EXTRA_BRANDS.sub(" ", str(row_get(row, idx, "Product Name")).strip())
    raw_title = re.sub(r"\s{2,}", " ", raw_title).strip(" -–,;")
    if not sku or not raw_title:
        return None
    list_price = money(row_get(row, idx, "List Price (Excl. Tax)"))
    shipping = money(row_get(row, idx, "ES Shipping Fee"))
    desc_raw = str(row_get(row, idx, "Description") or "")
    images = row_images(row, idx)

    # ---- the whole cleansing/pricing/SKU/barcode job: whitewash_engine
    clean = W.transform({
        "sku": sku,
        "title": raw_title,
        "listPrice": list_price,
        "esShippingFee": shipping,
        "stock": num(row_get(row, idx, "Qty Available")),
        "description": desc_raw,
        "images": images,
    })

    desc = EXTRA_BRANDS.sub(" ", clean["description_html"])
    tidied = strip_brand_text(tidy_copy(desc))
    if tidied != desc.strip():
        repairs["description"] += 1

    manual = str(row_get(row, idx, "Assembly Instruction 1") or "").strip()
    if not re.match(r"^https?://", manual):
        manual = ""

    return {
        "orig_sku": sku,
        "sku": clean["sku"],
        "raw_title": raw_title,
        "title": strip_brand(clean["title"])[:255],
        "vendor": "",
        "price": clean["price"],
        "compare_at": clean["compare_at_price"],
        "barcode": clean["barcode"],
        "cost": round(list_price + shipping, 2),
        "list_price": round(list_price, 2),
        "shipping_fee": round(shipping, 2),
        "stock": clean["stock"],
        "raw_stock": clean["raw_stock"],
        "description": tidied,
        "features": [strip_brand_text(f) for f in
                     clean_lines(EXTRA_BRANDS.sub(" ", str(row_get(row, idx, "Features") or "")))],
        "manual": manual,
        "tags": clean["tags"],
        "images": images,
        "color": norm_color(row_get(row, idx, "Main Color")),
        "dim_tokens": title_tokens(DIM, raw_title),
        "num_tokens": title_tokens(NUM_CTX, raw_title),
        "category_en": str(row_get(row, idx, "Category") or "").strip(),
        "grams": int(num(row_get(row, idx, "Product Weight (kg)")) * 1000),
        "_row": row,
        "_idx": idx,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx", nargs="?", default=sorted(glob.glob(
        os.path.expanduser("~/Downloads/Aosom ESStore Products *.xlsx")))[-1])
    ap.add_argument("out_dir", nargs="?", default=os.path.join(HERE, "..", "shopify_import_ww"))
    ap.add_argument("--rows-per-file", type=int, default=20000)
    ap.add_argument("--max-images", type=int, default=MAX_IMAGES)
    ap.add_argument("--keep-out-of-stock", dest="keep_oos", action="store_true", default=True)
    ap.add_argument("--drop-out-of-stock", dest="keep_oos", action="store_false")
    ap.add_argument("--skip-placeholder-prices", action="store_true",
                    help="drop SKUs whose cost is the supplier's 888/888 placeholder")
    ap.add_argument("--manual-links", action="store_true",
                    help="link the PDF in 'Assembly Instruction 1' from the body; it sits on "
                         "the supplier CDN, so it exposes that host to customers")
    ap.add_argument("--reuse-handles", default=DEFAULT_REUSE_HANDLES,
                    help="CSV whose Variant SKU -> Handle mapping is kept (default: live 34 products)")
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    for stale in glob.glob(os.path.join(args.out_dir, "shopify_import_casalivo_ww_*.csv")):
        os.remove(stale)

    existing_handles = load_existing_handles(args.reuse_handles)
    repairs = collections.Counter()
    skipped: List[Dict[str, str]] = []

    # ---- load + cleanse every SKU
    catalog: List[Dict[str, Any]] = []
    sheet_rows = 0
    for row, idx in iter_catalog(args.xlsx):
        sheet_rows += 1
        v = make_variant(row, idx, repairs)
        if v is not None:
            catalog.append(v)
    if not catalog:
        raise SystemExit("no rows found in the workbook")
    assign_barcodes(catalog)
    cwords = color_words([v["color"] for v in catalog])

    def live_handle(v: Dict[str, Any]) -> str:
        """Handle of a product that is already in the store under this SKU."""
        return existing_handles.get(v["sku"].upper(), "")

    # ---- phase 1: colour merge by SKU family
    # a SKU already live keeps its own listing, so a re-import updates it instead of
    # merging it into another handle and leaving a duplicate behind
    families: "collections.OrderedDict[tuple, List[Dict[str, Any]]]" = collections.OrderedDict()
    for v in catalog:
        families.setdefault((sku_base(v["orig_sku"]), live_handle(v)), []).append(v)

    protos = []
    for (base, _), members in families.items():
        colors = {m["color"] for m in members}
        merged_title = ""
        if len(members) > 1 and len(colors) >= 2:
            merged_title = strip_color(members[0]["raw_title"], cwords) or members[0]["raw_title"]
        for m in members:
            m["proto_title"] = merged_title or m["raw_title"]
        if merged_title:
            protos.append({"raw_title": merged_title, "members": members})
        else:
            protos.extend({"raw_title": m["raw_title"], "members": [m]} for m in members)

    # ---- phase 2: size merge by normalised title
    size_groups: "collections.OrderedDict[tuple, List[Dict[str, Any]]]" = collections.OrderedDict()
    for p in protos:
        size_groups.setdefault((normalize_title(p["raw_title"]), live_handle(p["members"][0])),
                               []).append(p)

    parents: List[Dict[str, Any]] = []
    dedup_skipped = 0

    def make_parent(members: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        nonlocal dedup_skipped
        labels, common_dims = size_labels(members, "dim_tokens")
        if len(members) == 1 or not all(labels):
            # a size option only when every variant carries its own size; a half
            # labelled family would show a meaningless "Estándar" next to a size
            labels, common_dims = ["Estándar"] * len(members), set()
        for m, label in zip(members, labels):
            m["size"] = label

        # same (colour,size) listed twice (V## re-listing): keep the best stocked one
        best: Dict[tuple, Dict[str, Any]] = {}
        for m in members:
            combo = (m["color"], m["size"])
            if combo not in best:
                best[combo] = m
                continue
            dedup_skipped += 1
            if m["stock"] > best[combo]["stock"]:
                best[combo] = m
        variants = list(best.values())

        has_color = len({m["color"] for m in variants}) >= 2
        has_size = len({m["size"] for m in variants}) >= 2

        # parent title: drop only the size tokens that actually differ, so shared
        # specs ("6 Ventanas", "PE 140 g/m²") survive
        title_src = members[0]["proto_title"]
        if has_size:
            title_src = re.sub(
                DIM, lambda mo: " " if norm_token(mo.group(0)) not in common_dims else mo.group(0),
                title_src)
        parent_raw = (tidy_copy(re.sub(r"\s{2,}", " ", title_src)).strip(" -–,;")
                      or members[0]["raw_title"])
        title = (strip_brand(W.clean_title(parent_raw)) or strip_brand(parent_raw))[:255]

        base_key = sku_base(variants[0]["orig_sku"])
        reuse = next((live_handle(m) for m in variants if live_handle(m)), "")
        handle = reuse or f"{slug(base_key)}-{slug(BRAND_PREFIX.sub('', title))}".strip("-")

        # price 0 would be rejected by Shopify: report, don't emit
        for b in [m for m in variants if m["price"] <= 0]:
            skipped.append({"sku": b["sku"], "reason": "no cost/price in source"})
        variants = [v for v in variants if v["price"] > 0]
        if not args.keep_oos:
            for v in [m for m in variants if m["stock"] <= 0]:
                skipped.append({"sku": v["sku"], "reason": "out of stock"})
            variants = [v for v in variants if v["stock"] > 0]
        if args.skip_placeholder_prices:
            placeholders = [m for m in variants if m["list_price"] == m["shipping_fee"] > 100]
            for v in placeholders:
                skipped.append({"sku": v["sku"], "reason": "placeholder price (list == shipping)"})
            variants = [v for v in variants if v not in placeholders]
        if not variants:
            return None

        first = variants[0]
        body = build_body(
            first["description"], first["features"], spec_rows(variants, has_color),
            first["manual"], link_manual=args.manual_links)

        # storefront tags only: the engine's internal markers (Casalivo, Dropship,
        # AutoSync) are dropped, the category labels stay
        tags = list(dict.fromkeys(
            [t for t in (first["category_en"], spanish_group(first["category_en"])) if t]))

        # gallery: the first variant's photos first, then one photo per further
        # variant, so every variant image actually exists in the product gallery
        room = max(1, args.max_images - (len(variants) - 1))
        gallery = list(first["images"][:room])
        for v in variants[1:]:
            if v["images"] and v["images"][0] not in gallery:
                gallery.append(v["images"][0])
        gallery = gallery[:max(args.max_images, len(variants))]

        return {
            "handle": handle, "title": title, "body": body,
            "vendor": first["vendor"], "type": first["category_en"],
            "category": shopify_category(first["category_en"]),
            "tags": ", ".join(tags),
            "opt1": "Color" if has_color else "Title",
            "opt2": "Talla" if has_size else "",
            "variants": variants,
            "images": gallery,
            "manual": first["manual"],
        }

    for key, prs in size_groups.items():
        members = [m for pr in prs for m in pr["members"]]
        labels, _ = size_labels(members, "dim_tokens")
        sized = bool(members) and all(labels) and any(labels)
        colors = {m["color"] for m in members}
        if len(colors) >= 2:
            # colour family -> one parent (Option1=Color)
            buckets = [members]
            if not sized:
                by_color: "collections.OrderedDict[str, List[Dict[str, Any]]]" = collections.OrderedDict()
                for m in members:
                    by_color.setdefault(m["color"], []).append(m)
                # two different products sharing one colour would both land on
                # (colour, "Estándar"): keep them apart, colour back in the title
                if any(len({normalize_title(m["raw_title"]) for m in ms}) > 1
                       for ms in by_color.values()):
                    buckets = []
                    for colour, ms in by_color.items():
                        sub: "collections.OrderedDict[str, List[Dict[str, Any]]]" = collections.OrderedDict()
                        for m in ms:
                            m["proto_title"] = m["raw_title"]
                            sub.setdefault(normalize_title(m["raw_title"]), []).append(m)
                        buckets.extend(sub.values())
        elif sized or len(members) == 1:
            buckets = [members]
        else:
            # nothing sets these apart as sizes: keep them as separate products (a
            # "Talla" made of random numbers helps nobody) but still collapse the
            # exact duplicates a V## re-listing produces
            grouped: "collections.OrderedDict[tuple, List[Dict[str, Any]]]" = collections.OrderedDict()
            for m in members:
                grouped.setdefault((m["color"], normalize_title(m["raw_title"])), []).append(m)
            buckets = list(grouped.values())
        for bucket in buckets:
            parent = make_parent(bucket)
            if parent:
                parents.append(parent)

    # ---- handle uniqueness (Shopify merges products sharing a handle)
    used: Dict[str, int] = {}
    dup_handles = 0
    for p in parents:
        h = p["handle"] or "casalivo-product"
        if h in used:
            used[h] += 1
            dup_handles += 1
            p["handle"] = f"{h}-{used[h]}"
        else:
            used[h] = 1

    # ---- emit CSV rows
    out_rows: List[Dict[str, str]] = []
    costs, prices = [], []
    for p in parents:
        for i, v in enumerate(p["variants"]):
            first = i == 0
            opt1_value = v["color"] if p["opt1"] == "Color" else "Default Title"
            row = {
                "Title": p["title"] if first else "",
                "URL handle": p["handle"],
                "Description": p["body"] if first else "",
                "Vendor": p["vendor"] if first else "",
                "Product category": p["category"] if first else "",
                "Type": p["type"] if first else "",
                "Tags": p["tags"] if first else "",
                "Published on online store": "TRUE" if first else "",
                "Status": "active" if first else "",
                "SKU": v["sku"],
                "Variant Barcodes": v["barcode"],
                "Option1 name": p["opt1"] if first else "",
                "Option1 value": opt1_value,
                "Option2 name": p["opt2"] if first else "",
                "Option2 value": v["size"] if p["opt2"] else "",
                "Price": f"{v['price']:.2f}",
                "Compare-at price": "",  # 客户要求不设划线价（GMC 安全）
                "Cost per item": f"{v['cost']:.2f}",
                "Charge tax": "TRUE" if first else "",
                "Inventory tracker": "shopify" if first else "",
                "Inventory quantity": str(v["stock"]),
                "Continue selling when out of stock": "deny",
                "Weight value (grams)": str(v["grams"]),
                "Weight unit for display": "kg",
                "Requires shipping": "TRUE" if first else "",
                "Fulfillment service": "manual" if first else "",
                "Product image URL": (p["images"][0] if p["images"] else "") if first else "",
                "Image position": "1" if first else "",
                "Image alt text": p["title"] if first else "",
                "Variant image URL": v["images"][0] if v["images"] else "",
                "Gift card": "FALSE" if first else "",
                "SEO title": p["title"][:70] if first else "",
                "SEO description": seo_description(v["description"]) if first else "",
                "Google Shopping / Manufacturer part number (MPN)": v["sku"],
                "Google Shopping / Condition": "new" if first else "",
                "Google Shopping / Custom product": "FALSE" if first else "",
                "Google Shopping / Custom label 0": "",
                "Assembly manual (product.metafields.custom.assembly_manual)":
                    p["manual"] if first else "",
            }
            out_rows.append(row)
            costs.append(v["cost"])
            prices.append(v["price"])
        for n, url in enumerate(p["images"][1:], start=2):
            out_rows.append({"URL handle": p["handle"], "Product image URL": url,
                             "Image position": str(n), "Image alt text": f"{p['title']} - vista {n}"})

    # ---- write chunks: never cut a product in half. a file that opens with a
    # blank-Title variant/image row has no product to attach to, and Shopify
    # rejects the whole upload with "Title must be specified"
    blocks: List[List[Dict[str, str]]] = []
    for r in out_rows:
        if r.get("Title") or not blocks:
            blocks.append([r])
        else:
            blocks[-1].append(r)

    chunks: List[List[Dict[str, str]]] = []
    current: List[Dict[str, str]] = []
    for b in blocks:
        if current and len(current) + len(b) > args.rows_per_file:
            chunks.append(current)
            current = []
        current.extend(b)
    if current:
        chunks.append(current)

    files = []
    n_chunks = len(chunks)
    for c, chunk in enumerate(chunks):
        path = os.path.join(args.out_dir, f"shopify_import_casalivo_ww_{c + 1:02d}.csv")
        with open(path, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=FIELDNAMES)
            w.writeheader()
            for r in chunk:
                w.writerow({k: r.get(k, "") for k in FIELDNAMES})
        files.append({"file": os.path.basename(path), "rows": len(chunk) + 1,
                      "bytes": os.path.getsize(path)})

    # ---- QA: brand leakage on everything that reaches the storefront
    leaks = []
    banned = [b for b in W.BANNED_KEYWORDS] + ["aosom", "homcom", "outsunny", "pawhut", "vinsetto",
                                               "sobuy", "songmics", "arkswift", "spain aosom",
                                               "aiyaplay", "qaba", "kleankin", "vasagle", "feandrea"]
    for r in out_rows:
        if not r.get("Title") and not r.get("Description"):
            continue
        blob = " ".join(str(r.get(k, "")) for k in
                        ("Title", "Description", "Tags", "SEO title", "SEO description")).lower()
        for b in banned:
            if b.lower() in blob:
                leaks.append({"sku": r.get("SKU") or r.get("URL handle"), "leak": b})
                break

    # ---- QA: storefront-facing fields the store rules require
    bad_barcode = [r.get("SKU") for r in out_rows
                   if r.get("SKU") and not re.match(r"^ean:\d{13}$", r.get("Variant Barcodes", ""))]
    barcodes = [r["Variant Barcodes"] for r in out_rows if r.get("Variant Barcodes")]
    bad_check = [b for b in barcodes
                 if ean13_check(b[4:16]) != int(b[16:])] if barcodes else []
    titled = [r for r in out_rows if r.get("Title")]
    brand_in_title = [r.get("SKU") for r in titled if re.search(r"casalivo", r["Title"], re.I)]
    vendor_filled = [r.get("SKU") for r in titled if r.get("Vendor")]
    bodies = [r for r in titled if r.get("Description")]
    body_missing = []
    for r in bodies:
        blob = r["Description"]
        if "Características destacadas" not in blob and "Medidas y detalles" not in blob:
            body_missing.append(r.get("SKU"))
    with_manual = [r for r in bodies if "Montaje" in r["Description"]]
    with_manual_src = [r for r in out_rows if r.get("URL handle")
                       and "Descargar manual" in r.get("Description", "")]

    placeholders = [{"sku": v["sku"], "list_price": v["list_price"],
                     "shipping_fee": v["shipping_fee"], "stock": v["stock"]}
                    for v in catalog if v["list_price"] == v["shipping_fee"] > 100]

    report = {
        "source": args.xlsx,
        "engine": "whitewash_engine.WhitewashEngine",
        "rows_in_sheet": sheet_rows,
        "cleansed_skus": len(catalog),
        "parents": len(parents),
        "variants": sum(len(p["variants"]) for p in parents),
        "color_variant_parents": sum(1 for p in parents if p["opt1"] == "Color"),
        "size_variant_parents": sum(1 for p in parents if p["opt2"] == "Talla"),
        "single_products": sum(1 for p in parents if p["opt1"] == "Title" and not p["opt2"]),
        "in_stock_variants": sum(1 for p in parents for v in p["variants"] if v["stock"] > 0),
        "out_of_stock_variants": sum(1 for p in parents for v in p["variants"] if v["stock"] == 0),
        "duplicate_listings_merged": dedup_skipped,
        "handles_disambiguated": dup_handles,
        "handles_reused_from_store": sum(1 for p in parents if p["handle"] in existing_handles.values()),
        "descriptions_repaired": repairs["description"],
        "skipped": skipped,
        "placeholder_price_skus": placeholders,
        "placeholder_price_count": len(placeholders),
        "whitewash_leaks": leaks[:50],
        "whitewash_leak_count": len(leaks),
        "barcodes": len(barcodes),
        "barcodes_unique": len(set(barcodes)),
        "barcode_format_errors": bad_barcode[:20],
        "barcode_check_digit_errors": bad_check[:20],
        "brand_in_title": brand_in_title[:20],
        "vendor_filled": vendor_filled[:20],
        "bodies_without_sections": body_missing[:20],
        "bodies_with_assembly_section": len(with_manual),
        "bodies_with_manual_link": len(with_manual_src),
        "metafield_assembly_manual": sum(1 for p in parents if p["manual"]),
        "bodies_with_external_manual_url": sum(
            1 for r in with_manual_src if "arkswift" in r["Description"].lower()),
        "files_starting_mid_product": [f["file"] for f, ch in zip(files, chunks)
                                       if not ch[0].get("Title")],
        "compare_at_price": "empty" if not any(r.get("Compare-at price") for r in out_rows)
        else "filled",
        "price_min": min(prices) if prices else 0,
        "price_max": max(prices) if prices else 0,
        "cost_total": round(sum(costs), 2),
        "price_total": round(sum(prices), 2),
        "avg_margin_pct": round(sum((s - c) / s * 100 for c, s in zip(costs, prices)) / len(prices), 1)
        if prices else 0,
        "csv_rows": len(out_rows) + n_chunks,
        "files": files,
        "total_bytes": sum(f["bytes"] for f in files),
    }
    with open(os.path.join(args.out_dir, "qa_report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
    manifest = {k: report[k] for k in ("source", "parents", "variants", "csv_rows", "files",
                                       "total_bytes")}
    manifest["template"] = "shopify-current (Option1=Color, Option2=Talla)"
    manifest["engine"] = report["engine"]
    with open(os.path.join(args.out_dir, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)

    print(json.dumps({k: report[k] for k in
                      ("rows_in_sheet", "cleansed_skus", "parents", "variants", "single_products",
                       "color_variant_parents", "size_variant_parents", "in_stock_variants",
                       "out_of_stock_variants", "duplicate_listings_merged", "descriptions_repaired",
                       "whitewash_leak_count", "price_min", "price_max", "avg_margin_pct",
                       "csv_rows", "total_bytes", "files")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
