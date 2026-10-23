"""
Casalivo - Export Spanish Cleansed Products to Shopify Standard CSV
Generates a complete, ready-to-import Shopify Product CSV spreadsheet
with brand whitewashing, tiered pricing, and SEO formatting.
"""

import os
import re
import csv
import sys
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Casalivo Whitewash Rules
BRAND_NAME = "Casalivo"
SKU_PREFIX = "CSL-"
SAFETY_BUFFER = 3

VENDOR_REPLACEMENTS = {
    "SPANISH AOSOM SL": "Casalivo",
    "AOSOM": "Casalivo",
    "Aosom": "Casalivo",
    "HOMCOM": "Casalivo",
    "Homcom": "Casalivo",
    "OUTSUNNY": "Casalivo",
    "Outsunny": "Casalivo",
    "PAWHUT": "Casalivo Pets",
    "PawHut": "Casalivo Pets",
    "VINSETTO": "Casalivo Office",
    "Vinsetto": "Casalivo Office",
}

BANNED_KEYWORDS = [
    "Aosom", "Homcom", "Outsunny", "Pawhut", "Vinsetto", "SoBuy",
    "garantía del fabricante", "tienda oficial", "distribuidor oficial",
    "Aosom.es", "aosom.es", "www.aosom", "almacén españa", "spanish warehouse"
]

def calculate_price(cost: float) -> dict:
    cost = float(cost)
    if cost <= 0:
        return {"price": 0.0, "compare_at_price": 0.0}
    if cost <= 100:
        multiplier = 1.55
    elif cost <= 200:
        multiplier = 1.50
    else:
        multiplier = 1.45

    selling_price = round(cost * multiplier, 2)
    compare_at = round(selling_price * 1.35, 2)

    return {
        "price": selling_price,
        "compare_at_price": compare_at
    }

def clean_text(text: str) -> str:
    if not text:
        return ""
    result = text
    for old_w, new_w in VENDOR_REPLACEMENTS.items():
        result = re.sub(rf"\b{re.escape(old_w)}\b", new_w, result, flags=re.IGNORECASE)
    for banned in BANNED_KEYWORDS:
        result = re.sub(rf"\b{re.escape(banned)}\b", "", result, flags=re.IGNORECASE)
    result = re.sub(r"\s+", " ", result).strip()
    return result

def clean_description(desc: str) -> str:
    raw = desc or ""
    # 纯净描述：彻底剔除整句的售后质保、官方店铺、发货运输条款
    raw = re.sub(r'<div[^>]*class="[^"]*(?:casalivo-guarantee|casalivo-shipping|casalivo-warranty|guarantee)[^"]*"[^>]*>[\s\S]*?</div>', '', raw, flags=re.IGNORECASE)
    raw = re.sub(r'[^.!?<>\n\r]*(?:garant[íi]a|warranty|devoluci[óo]n|posventa|postventa|fabricante oficial|tienda oficial)[^.!?<>\n\r]*[.!?]?', '', raw, flags=re.IGNORECASE)
    raw = re.sub(r'[^.!?<>\n\r]*(?:env[íi]o|almac[ée]n espa[ñn]a|almac[ée]n europeo|plazo de entrega)[^.!?<>\n\r]*[.!?]?', '', raw, flags=re.IGNORECASE)
    cleaned = clean_text(raw)
    cleaned = re.sub(r'\s+([.,;:!?])', r'\1', cleaned)
    cleaned = re.sub(r'\b(de|en|con|para)\s*\.', '.', cleaned)
    return cleaned.strip()

def generate_handle(title: str, sku: str) -> str:
    import unicodedata
    norm = unicodedata.normalize('NFKD', title.lower()).encode('ASCII', 'ignore').decode('utf-8')
    clean_t = re.sub(r'[^a-z0-9]+', '-', norm).strip('-')[:50]
    clean_s = re.sub(r'[^a-z0-9]+', '-', sku.lower()).strip('-')
    return f"{clean_s}-{clean_t}".strip('-')

def generate_ean13_barcode(seed: str = None) -> str:
    """
    生成13位EAN码，国家码841，厂商代码57926，前缀加上 ean:
    例如: ean:8415792615295
    """
    import hashlib, random
    if seed:
        h = int(hashlib.md5(str(seed).encode("utf-8")).hexdigest()[:8], 16)
        item_code_num = h % 10000
    else:
        item_code_num = random.randint(0, 9999)
    item_code = f"{item_code_num:04d}"
    raw12 = f"84157926{item_code}"
    
    # GS1 Modulo 10:
    s = 0
    for i, ch in enumerate(raw12):
        w = 1 if i % 2 == 0 else 3
        s += int(ch) * w
    check_digit = (10 - (s % 10)) % 10
    return f"ean:{raw12}{check_digit}"

# Spanish catalog demo data
SPANISH_PRODUCTS = [
    {
        "sku": "01-0340",
        "title": "HOMCOM Mesa de Comedor Plegable con Ruedas y Estantes de Almacenaje 140x80x74cm",
        "vendor": "SPANISH AOSOM SL",
        "cost": 42.50,
        "stock": 28,
        "category": "Muebles de Comedor",
        "barcode": "8435428710340",
        "weight_kg": 26.5,
        "images": [
            "https://images.unsplash.com/photo-1615066390971-03e4e1c36ddf?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=800&q=80"
        ],
        "description": "HOMCOM mesa de comedor moderna ideal para cocinas y pisos pequeños. Cuenta con dos alas abatibles y ruedas giratorias con freno. Medidas: 140x80x74cm."
    },
    {
        "sku": "833-855",
        "title": "VINSETTO Silla de Oficina Ergonómica de Malla Transpirable con Reposabrazos y Soporte Lumbar",
        "vendor": "SPANISH AOSOM SL",
        "cost": 38.00,
        "stock": 45,
        "category": "Oficina y Despacho",
        "barcode": "8435428718552",
        "weight_kg": 12.0,
        "images": [
            "https://images.unsplash.com/photo-1580481077195-c3a821a58875?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1505797149-43b0069ec26b?auto=format&fit=crop&w=800&q=80"
        ],
        "description": "Silla de escritorio giratoria VINSETTO con pistón de gas clase 3 y base cromada. Alta resistencia para jornadas laborales de 8 horas."
    },
    {
        "sku": "845-667",
        "title": "OUTSUNNY Cenador de Jardín Pergola Exterior de Metal con Toldo Retráctil 3x3m Crema",
        "vendor": "SPANISH AOSOM SL",
        "cost": 89.90,
        "stock": 14,
        "category": "Jardín y Terraza",
        "barcode": "8435428716671",
        "weight_kg": 35.0,
        "images": [
            "https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80"
        ],
        "description": "Cenador OUTSUNNY para jardín con estructura de acero con recubrimiento en polvo y tejido de poliéster resistente a los rayos UV."
    },
    {
        "sku": "D02-045V01",
        "title": "PAWHUT Cama para Perros Grandes Sofá Acolchado con Funda Lavable Terciopelo Gris",
        "vendor": "SPANISH AOSOM SL",
        "cost": 16.80,
        "stock": 62,
        "category": "Mascotas",
        "barcode": "8435428710459",
        "weight_kg": 4.2,
        "images": [
            "https://images.unsplash.com/photo-1541599540903-216a46ca1dc0?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=800&q=80"
        ],
        "description": "Sofá ortopédico para perros PAWHUT fabricado en espuma de alta densidad y tejido ultra suave lavable a máquina."
    },
    {
        "sku": "835-112",
        "title": "HOMCOM Mueble de TV Nórdico Soporte para Televisión hasta 55 Pulgadas con 2 Puertas y Estantes",
        "vendor": "SPANISH AOSOM SL",
        "cost": 54.00,
        "stock": 19,
        "category": "Muebles de Salón",
        "barcode": "8435428711124",
        "weight_kg": 21.0,
        "images": [
            "https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80"
        ],
        "description": "Mueble de televisión HOMCOM acabado en tono roble y blanco con patas de madera maciza inclinadas. Pasacables trasero integrado."
    },
    {
        "sku": "838-230V01",
        "title": "HOMCOM Estantería para Libros con 5 Niveles y Estructura Geométrica Moderna Blanca",
        "vendor": "SPANISH AOSOM SL",
        "cost": 29.50,
        "stock": 33,
        "category": "Almacenaje y Organización",
        "barcode": "8435428723013",
        "weight_kg": 18.5,
        "images": [
            "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1589834390005-5d4fb9bf3d32?auto=format&fit=crop&w=800&q=80"
        ],
        "description": "Estantería en zigzag HOMCOM para separar ambientes en el salón o dormitorio. Fácil montaje con anclaje antivuelco incluido."
    },
    {
        "sku": "834-398",
        "title": "HOMCOM Juego de 2 Taburetes Altos de Bar de Terciopelo con Respaldo y Patas Doradas",
        "vendor": "SPANISH AOSOM SL",
        "cost": 65.00,
        "stock": 2,
        "category": "Muebles de Cocina",
        "barcode": "8435428734398",
        "weight_kg": 14.8,
        "images": [
            "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&w=800&q=80"
        ],
        "description": "Juego de dos taburetes de isla de cocina HOMCOM tapizados en terciopelo suave con costuras en rombos y reposapiés metálico."
    },
    {
        "sku": "837-142",
        "title": "HOMCOM Zapatero Recibidor Estrecho de 3 Trampones Abatibles para 18 Pares Blanco",
        "vendor": "SPANISH AOSOM SL",
        "cost": 34.00,
        "stock": 41,
        "category": "Entrada y Recibidor",
        "barcode": "8435428714201",
        "weight_kg": 19.2,
        "images": [
            "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1595515106969-1ce29566ff1c?auto=format&fit=crop&w=800&q=80"
        ],
        "description": "Armario zapatero compacto HOMCOM para pasillos estrechos con tiradores integrados y divisiones interiores ajustables."
    }
]

def export_shopify_csv(output_filepath: str = "shopify_cleansed_spanish_products.csv"):
    fieldnames = [
        "Handle", "Title", "Body (HTML)", "Vendor", "Product Category", "Type", "Tags",
        "Published", "Option1 Name", "Option1 Value", "Option2 Name", "Option2 Value",
        "Option3 Name", "Option3 Value", "Variant SKU", "Variant Grams",
        "Variant Inventory Tracker", "Variant Inventory Qty", "Variant Inventory Policy",
        "Variant Fulfillment Service", "Variant Price", "Variant Compare At Price",
        "Variant Requires Shipping", "Variant Taxable", "Variant Barcode",
        "Image Src", "Image Position", "Image Alt Text", "Gift Card",
        "SEO Title", "SEO Description", "Google Shopping / Google Product Category",
        "Google Shopping / Gender", "Google Shopping / Age Group", "Google Shopping / MPN",
        "Google Shopping / Condition", "Google Shopping / Custom Product",
        "Google Shopping / Custom Label 0", "Variant Image", "Variant Weight Unit",
        "Cost per item", "Status"
    ]

    with open(output_filepath, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for item in SPANISH_PRODUCTS:
            brand_sku = f"{SKU_PREFIX}{item['sku']}"
            title = clean_text(item["title"])
            if not title.lower().startswith(BRAND_NAME.lower()):
                title = f"{BRAND_NAME} {title}"
            
            handle = generate_handle(title, brand_sku)
            pricing = calculate_price(item["cost"])
            avail_stock = max(0, item["stock"] - SAFETY_BUFFER)
            grams = int(item["weight_kg"] * 1000)
            desc_html = clean_description(item["description"])
            images = item.get("images", [])

            # Main row
            main_row = {
                "Handle": handle,
                "Title": title,
                "Body (HTML)": desc_html,
                "Vendor": BRAND_NAME,
                "Product Category": "",
                "Type": item.get("category", "Home & Living"),
                "Tags": f"{BRAND_NAME}, HomeLiving, FreeShipping, VerifiedStock, {item.get('category', '')}",
                "Published": "TRUE",
                "Option1 Name": "Title",
                "Option1 Value": "Default Title",
                "Variant SKU": brand_sku,
                "Variant Grams": str(grams),
                "Variant Inventory Tracker": "shopify",
                "Variant Inventory Qty": str(avail_stock),
                "Variant Inventory Policy": "deny",
                "Variant Fulfillment Service": "manual",
                "Variant Price": f"{pricing['price']:.2f}",
                "Variant Compare At Price": f"{pricing['compare_at_price']:.2f}",
                "Variant Requires Shipping": "TRUE",
                "Variant Taxable": "FALSE",
                "Variant Barcode": generate_ean13_barcode(item['sku']),
                "Image Src": images[0] if images else "",
                "Image Position": "1" if images else "",
                "Image Alt Text": title,
                "Gift Card": "FALSE",
                "SEO Title": title[:70],
                "SEO Description": (title + " - Colección oficial Casalivo.").strip()[:160],
                "Google Shopping / MPN": brand_sku,
                "Google Shopping / Condition": "new",
                "Google Shopping / Custom Product": "FALSE",
                "Google Shopping / Custom Label 0": BRAND_NAME,
                "Variant Image": images[0] if images else "",
                "Variant Weight Unit": "kg",
                "Cost per item": f"{item['cost']:.2f}",
                "Status": "active"
            }
            writer.writerow(main_row)

            # Additional image rows
            for idx, img_url in enumerate(images[1:], start=2):
                extra_row = {
                    "Handle": handle,
                    "Image Src": img_url,
                    "Image Position": str(idx),
                    "Image Alt Text": f"{title} - Vista {idx}"
                }
                writer.writerow(extra_row)

    print(f"✅ 成功清洗并导出 {len(SPANISH_PRODUCTS)} 件西班牙商品到 Shopify CSV 表格: {output_filepath}")

if __name__ == "__main__":
    out_file = sys.argv[1] if len(sys.argv) > 1 else "shopify_cleansed_spanish_products.csv"
    export_shopify_csv(out_file)
