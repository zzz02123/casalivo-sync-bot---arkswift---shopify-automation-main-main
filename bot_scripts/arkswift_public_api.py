"""
ArkSwift public B2B catalog API -> live Spanish (ES) stock snapshot
-------------------------------------------------------------------
No signature needed. Public endpoint discovered via robots.txt:
    GET https://www.arkswift.com/rest/v1/b2b/goods/search?pageNum=&pageSize=

Returns live `productWarehouseStockVos[].qty` per warehouse (ES-SF / ES-PSJ / ES-Worten ...).
Prices are NULL without a logged-in B2B session - join them from the inventory export instead.

Usage: python arkswift_public_api.py [--out arkswift_es_live.json] [--country ES]
"""
import json
import os
import sys
import time
import argparse
from typing import Any, Dict, List

import requests

BASE = "https://www.arkswift.com/rest/v1/b2b/goods/search"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.arkswift.com/",
    "Origin": "https://www.arkswift.com",
}


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


def fetch_page(s: requests.Session, page: int, size: int = 200) -> Dict[str, Any]:
    last = None
    for attempt in range(5):
        try:
            r = s.get(BASE, params={"pageNum": page, "pageSize": size}, timeout=30)
            return r.json()
        except Exception as exc:  # SSL EOF / reset happens occasionally behind the WAF
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"page {page} failed: {last}")


def es_stock(item: Dict[str, Any]) -> int:
    total = 0
    for wh in item.get("productWarehouseStockVos") or []:
        total += int(wh.get("qty") or 0)
    return total


def crawl(country: str = "ES") -> List[Dict[str, Any]]:
    s = session()
    first = fetch_page(s, 1)
    pages = (first.get("data") or {}).get("pages") or 1
    out: List[Dict[str, Any]] = []
    for page in range(1, pages + 1):
        data = first if page == 1 else fetch_page(s, page)
        for item in (data.get("data") or {}).get("list") or []:
            if item.get("countryCode") != country:
                continue
            whs = [{"warehouse": w.get("warehouseNo"), "name": w.get("warehouseName"),
                    "qty": int(w.get("qty") or 0)} for w in item.get("productWarehouseStockVos") or []]
            boxes = item.get("boxes") or []
            weight = sum(float(b.get("weight") or 0) for b in boxes)
            out.append({
                "item_code": item.get("itemCode"),
                "sku": item.get("sellerSku"),
                "store": item.get("storeName"),
                "title": item.get("title"),
                "country": item.get("countryCode"),
                "status": item.get("status"),
                "stock": es_stock(item),
                "warehouses": whs,
                "weight_kg": round(weight, 2),
                "image": item.get("img"),
                "second_image": item.get("secondImg"),
                "url_key": item.get("urlKey"),
                "delivery_type": item.get("deliveryType"),
            })
        print(f"  page {page}/{pages}  ES items so far: {len(out)}", flush=True)
        time.sleep(0.35)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--country", default="ES")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                                                  "arkswift_es_live.json"))
    args = ap.parse_args()
    items = crawl(args.country)
    json.dump(items, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    in_stock = [i for i in items if i["stock"] > 0]
    print(json.dumps({
        "country": args.country,
        "items": len(items),
        "in_stock_skus": len(in_stock),
        "total_units": sum(i["stock"] for i in items),
        "warehouses": sorted({w["warehouse"] for i in items for w in i["warehouses"] if w.get("warehouse")}),
        "saved": args.out,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
