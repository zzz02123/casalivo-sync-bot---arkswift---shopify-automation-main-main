"""
Casalivo Data Cleansing & Pricing Engine (洗白与加价模块)
- 品牌替换为 Casalivo
- 敏感词与原供应商黑名单过滤
- 阶梯定价规则计算与利润率核算
- SKU 编码规范化 (CSL- 前缀)
"""
import re
import math
from typing import Dict, Any, List

class WhitewashEngine:
    BRAND_NAME = "Casalivo"
    SKU_PREFIX = "CSL-"
    SAFETY_BUFFER = 3
    ROUNDING = "99"
    COMPARE_AT_MULTIPLIER = 1.35

    REPLACEMENTS = {
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
        "Aosom",
        "Homcom",
        "Outsunny",
        "Pawhut",
        "Vinsetto",
        "SoBuy",
        "official store",
        "distributor warranty",
        "manufacturer warranty",
        "garantía del fabricante",
        "tienda oficial",
        "distribuidor oficial",
        "Aosom.es",
        "aosom.es",
        "spanish warehouse",
        "almacén españa",
    ]

    PRICING_TIERS = [
        {"id": "tier-1", "name": "≤ €100 (1.55x)", "minCost": 0, "maxCost": 100, "multiplier": 1.55, "flatFee": 0},
        {"id": "tier-2", "name": "€100 - €200 (1.50x)", "minCost": 100, "maxCost": 200, "multiplier": 1.50, "flatFee": 0},
        {"id": "tier-3", "name": "> €200 (1.45x)", "minCost": 200, "maxCost": 999999, "multiplier": 1.45, "flatFee": 0},
    ]

    @classmethod
    def calculate_price(cls, cost: float) -> Dict[str, float]:
        """核算售价规则：Aosom list price + ES shipping fee，<=100 乘 1.55，100~200 乘 1.50，>200 乘 1.45"""
        if cost <= 0:
            return {"price": 0.0, "compare_at_price": 0.0, "profit": 0.0, "margin": 0.0}

        if cost <= 100:
            tier = cls.PRICING_TIERS[0]
        elif cost <= 200:
            tier = cls.PRICING_TIERS[1]
        else:
            tier = cls.PRICING_TIERS[2]

        raw_price = cost * tier["multiplier"] + tier.get("flatFee", 0)

        if cls.ROUNDING == "99":
            price = math.floor(raw_price) + 0.99
            if price < raw_price:
                price += 1.0
        elif cls.ROUNDING == "95":
            price = math.floor(raw_price) + 0.95
            if price < raw_price:
                price += 1.0
        else:
            price = round(raw_price, 2)

        compare_at = math.floor(price * cls.COMPARE_AT_MULTIPLIER) + 0.99
        profit = round(price - cost, 2)
        margin = round((profit / price) * 100, 1) if price > 0 else 0.0

        return {
            "price": round(price, 2),
            "compare_at_price": round(compare_at, 2),
            "profit": profit,
            "margin": margin,
            "applied_tier": tier["name"]
        }

    @classmethod
    def clean_title(cls, raw_title: str) -> str:
        if not raw_title:
            return f"{cls.BRAND_NAME} Collection Item"

        title = raw_title.strip()
        for old_w, new_w in cls.REPLACEMENTS.items():
            title = re.sub(rf"\b{re.escape(old_w)}\b", new_w, title, flags=re.IGNORECASE)

        for banned in cls.BANNED_KEYWORDS:
            title = re.sub(rf"\b{re.escape(banned)}\b", "", title, flags=re.IGNORECASE)

        title = re.sub(r"\s+", " ", title).strip()
        title = re.sub(r"^[-–|,\s]+|[-–|,\s]+$", "", title)

        if cls.BRAND_NAME.lower() not in title.lower():
            title = f"{cls.BRAND_NAME} - {title}"

        return title

    @classmethod
    def clean_description(cls, raw_desc: str) -> str:
        desc = raw_desc or ""
        for old_w, new_w in cls.REPLACEMENTS.items():
            desc = re.sub(rf"\b{re.escape(old_w)}\b", new_w, desc, flags=re.IGNORECASE)

        for banned in cls.BANNED_KEYWORDS:
            desc = re.sub(rf"\b{re.escape(banned)}\b", "", desc, flags=re.IGNORECASE)

        desc = re.sub(r"https?://[^\s<>\"']+", "", desc)
        desc = re.sub(r"[\w.-]+@[\w.-]+\.\w+", "", desc)

        # 纯净商品描述：运输与售后政策不写入描述中
        desc = re.sub(r'<div[^>]*class="[^"]*(?:casalivo-guarantee|casalivo-shipping|casalivo-warranty)[^"]*"[^>]*>[\s\S]*?</div>', '', desc, flags=re.IGNORECASE)
        desc = re.sub(r'[^.!?<>\n\r]*(?:garant[íi]a|warranty|devoluci[óo]n|posventa|postventa)[^.!?<>\n\r]*[.!?]?', '', desc, flags=re.IGNORECASE)
        desc = re.sub(r'[^.!?<>\n\r]*(?:env[íi]o desde almac[ée]n|env[íi]o r[áa]pido|env[íi]o en 3-5|almac[ée]n espa[ñn]a)[^.!?<>\n\r]*[.!?]?', '', desc, flags=re.IGNORECASE)
        return desc.strip()

    @classmethod
    def format_sku(cls, raw_sku: str) -> str:
        clean_sku = str(raw_sku).strip().replace(" ", "-").upper()
        if clean_sku.startswith(cls.SKU_PREFIX.upper()):
            return clean_sku
        return f"{cls.SKU_PREFIX}{clean_sku}"

    @classmethod
    def generate_ean13_barcode(cls, seed: str = None) -> str:
        """
        生成13位EAN码条形码，前缀为 ean:
        国家码为 841, 厂商代码为 57926, 4位商品代码根据seed随机/哈希生成, 最后1位为GS1 Modulo 10校验码
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
        
        # GS1 Modulo 10 check digit:
        s = 0
        for i, ch in enumerate(raw12):
            w = 1 if i % 2 == 0 else 3
            s += int(ch) * w
        check_digit = (10 - (s % 10)) % 10
        return f"ean:{raw12}{check_digit}"

    @classmethod
    def transform(cls, raw_item: Dict[str, Any]) -> Dict[str, Any]:
        orig_sku = str(raw_item.get("sku") or raw_item.get("originalSku") or "")
        orig_title = str(raw_item.get("title") or raw_item.get("originalTitle") or "")
        
        # Cost is listPrice + esShippingFee if provided, else costPrice / price
        list_price = float(raw_item.get("listPrice") or 0.0)
        shipping_fee = float(raw_item.get("esShippingFee") or 0.0)
        if list_price > 0 or shipping_fee > 0:
            cost = list_price + shipping_fee
        else:
            cost = float(raw_item.get("costPrice") or raw_item.get("price") or 0.0)

        stock = int(raw_item.get("stock") or 0)
        
        pricing = cls.calculate_price(cost)
        avail_stock = max(0, stock - cls.SAFETY_BUFFER)
        barcode = raw_item.get("barcode") or cls.generate_ean13_barcode(orig_sku)

        return {
            "sku": cls.format_sku(orig_sku),
            "originalSku": orig_sku,
            "title": cls.clean_title(orig_title),
            "vendor": cls.BRAND_NAME,
            "price": pricing["price"],
            "compare_at_price": pricing["compare_at_price"],
            "barcode": barcode,
            "listPrice": list_price,
            "esShippingFee": shipping_fee,
            "stock": avail_stock,
            "raw_stock": stock,
            "description_html": cls.clean_description(raw_item.get("description", "")),
            "images": raw_item.get("images", []),
            "tags": ["Casalivo", "Dropship", "AutoSync"],
        }

