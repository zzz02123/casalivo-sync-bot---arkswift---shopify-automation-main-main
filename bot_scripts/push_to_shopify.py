"""
Push cleaned Casalivo products to Shopify Admin API (GraphQL)
------------------------------------------------------------
Auth: Client Credentials Grant — no shpat_ token needed (see bot_scripts/shopify_auth.py).
Reads shopify_import_casalivo_es.json (built by build_casalivo_import.py), then for every product:
  * looks up existing variant by SKU -> create or update
  * sets inventory at the primary location
  * publishes to the Online Store channel
  * appends the result to push_log.json

Usage:
  python push_to_shopify.py [--dry-run] [--limit N]
Env: SHOPIFY_SHOP_DOMAIN / SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET
"""
import os
import sys
import json
import time
import argparse
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shopify_auth import ShopifyToken  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_VERSION = "2025-07"


class Shopify:
    def __init__(self, auth: ShopifyToken, version: str = API_VERSION):
        self.auth = auth
        self.url = f"https://{auth.shop}/admin/api/{version}/graphql.json"

    def gql(self, query: str, variables: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        for attempt in range(4):
            headers = {"X-Shopify-Access-Token": self.auth.get(force=attempt > 0), "Content-Type": "application/json"}
            r = requests.post(self.url, headers=headers,
                              json={"query": query, "variables": variables or {}}, timeout=45)
            if r.status_code == 401 and attempt == 0:
                continue
            if r.status_code in (429, 502, 503):
                time.sleep(2 * (attempt + 1))
                continue
            r.raise_for_status()
            data = r.json()
            if data.get("errors"):
                raise RuntimeError(json.dumps(data["errors"], ensure_ascii=False)[:600])
            return data["data"]
        raise RuntimeError("Shopify API rate-limited after retries")

    # ---------------------------------------------------------------- queries
    def shop(self) -> Dict[str, Any]:
        return self.gql("{ shop { name myshopifyDomain currencyCode } }")["shop"]

    def primary_location(self) -> Optional[Dict[str, Any]]:
        q = """{ locations(first: 10) { edges { node { id name isPrimary } } } }"""
        locs = [e["node"] for e in self.gql(q)["locations"]["edges"]]
        return next((l for l in locs if l.get("isPrimary")), locs[0] if locs else None)

    def variant_by_sku(self, sku: str) -> Optional[Dict[str, Any]]:
        q = """query($q: String!){ productVariants(first: 1, query: $q) { edges { node {
                 id sku inventoryItem { id } product { id } } } } }"""
        edges = self.gql(q, {"q": f"sku:{sku}"})["productVariants"]["edges"]
        return edges[0]["node"] if edges else None

    # ---------------------------------------------------------------- mutations
    def _product_input(self, p: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "title": p["title"],
            "descriptionHtml": p["body_html"],
            "vendor": p["vendor"],
            "productType": p["product_type"],
            "tags": p["tags"],
            "status": p["status"].upper(),
        }

    def create_product(self, p: Dict[str, Any]) -> Dict[str, Any]:
        q = """mutation($input: ProductInput!) { productCreate(input: $input) {
                 product { id title variants(first: 1) { edges { node { id sku } } } }
                 userErrors { field message } } }"""
        res = self.gql(q, {"input": self._product_input(p)})["productCreate"]
        if res["userErrors"]:
            raise RuntimeError(res["userErrors"])
        return res["product"]

    def update_product(self, product_id: str, p: Dict[str, Any]) -> None:
        q = """mutation($input: ProductInput!) { productUpdate(input: $input) {
                 product { id } userErrors { field message } } }"""
        payload = self._product_input(p)
        payload["id"] = product_id
        res = self.gql(q, {"input": payload})["productUpdate"]
        if res["userErrors"]:
            raise RuntimeError(res["userErrors"])

    def update_variant(self, product_id: str, variant_id: str, v: Dict[str, Any]) -> Dict[str, Any]:
        q = """mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
                 productVariantsBulkUpdate(productId: $productId, variants: $variants) {
                   productVariants { id sku price }
                   userErrors { field message } } }"""
        var = {
            "id": variant_id,
            "price": v["price"],
            "compareAtPrice": v["compare_at_price"],
            "inventoryItem": {
                "sku": v["sku"],
                "tracked": True,
                "measurement": {"weight": {"value": v["weight"], "unit": "KILOGRAMS"}},
            },
            "inventoryPolicy": "DENY",
            "taxable": v.get("taxable", True),
        }
        res = self.gql(q, {"productId": product_id, "variants": [var]})["productVariantsBulkUpdate"]
        if res["userErrors"]:
            raise RuntimeError(res["userErrors"])
        return res["productVariants"][0]

    def add_images(self, product_id: str, urls: List[str]) -> None:
        q = """mutation($productId: ID!, $media: [CreateMediaInput!]!) {
                 productCreateMedia(productId: $productId, media: $media) {
                   mediaUserErrors { field message } } }"""
        self.gql(q, {"productId": product_id,
                     "media": [{"originalSource": u, "mediaContentType": "IMAGE"} for u in urls]})

    def set_inventory(self, inventory_item_id: str, location_id: str, qty: int) -> None:
        q = """mutation($input: InventorySetQuantitiesInput!) {
                 inventorySetQuantities(input: $input) { userErrors { field message } } }"""
        inp = {
            "name": "available",
            "reason": "correction",
            "ignoreCompareQuantity": True,
            "quantities": [{"inventoryItemId": inventory_item_id,
                            "locationId": location_id,
                            "quantity": max(0, int(qty))}],
        }
        res = self.gql(q, {"input": inp})["inventorySetQuantities"]
        if res["userErrors"]:
            raise RuntimeError(res["userErrors"])

    def publish(self, product_id: str) -> None:
        q = """{ publications(first: 10) { edges { node { id name } } } }"""
        pubs = [e["node"] for e in self.gql(q)["publications"]["edges"]]
        target = next((p for p in pubs if p["name"].lower() in ("online store", "tienda online")),
                      pubs[0] if pubs else None)
        if not target:
            return
        m = """mutation($id: ID!, $input: [PublicationInput!]!) {
                 publishablePublish(id: $id, input: $input) { userErrors { field message } } }"""
        self.gql(m, {"id": product_id, "input": [{"publicationId": target["id"]}]})


def main() -> None:
    load_dotenv(dotenv_path=os.path.join(ROOT, ".env"))
    ap = argparse.ArgumentParser()
    ap.add_argument("--domain", default=os.getenv("SHOPIFY_SHOP_DOMAIN", ""))
    ap.add_argument("--client-id", default=os.getenv("SHOPIFY_CLIENT_ID", ""))
    ap.add_argument("--client-secret", default=os.getenv("SHOPIFY_CLIENT_SECRET", ""))
    ap.add_argument("--token", default=os.getenv("SHOPIFY_ACCESS_TOKEN", ""), help="已废弃，仅调试兜底")
    ap.add_argument("--file", default=os.path.join(ROOT, "shopify_import_casalivo_es.json"))
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    auth = ShopifyToken(args.domain, args.client_id, args.client_secret, args.token)
    if not auth.configured:
        raise SystemExit("缺少 SHOPIFY_SHOP_DOMAIN / SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET")

    products = json.load(open(args.file, encoding="utf-8"))
    if args.limit:
        products = products[: args.limit]

    print(f"payloads: {len(products)}  shop: {auth.shop}  dry_run={args.dry_run}")
    auth.get()
    print(f"换取 Admin token 成功 (source={auth.source} scope={auth.scope} ttl={auth.status()['expires_in']}s)")

    s = Shopify(auth)
    info = s.shop()
    print(f"店铺: {info['name']} ({info['myshopifyDomain']}) 货币 {info['currencyCode']}")
    loc = s.primary_location()
    print(f"库存地点: {loc['name'] if loc else '无'}")

    log = []
    for p in products:
        entry = {"sku": p["sku"], "title": p["title"][:70]}
        try:
            if args.dry_run:
                entry["action"] = "dry_run"
            else:
                existing = s.variant_by_sku(p["sku"])
                if existing:
                    pid = existing["product"]["id"]
                    s.update_product(pid, p)
                    s.update_variant(pid, existing["id"], p["variants"][0])
                    entry["action"] = "updated"
                else:
                    prod = s.create_product(p)
                    pid = prod["id"]
                    variant_id = prod["variants"]["edges"][0]["node"]["id"]
                    s.update_variant(pid, variant_id, p["variants"][0])
                    entry["action"] = "created"
                entry["product_id"] = pid

                if p.get("images"):
                    try:
                        s.add_images(pid, [i["src"] for i in p["images"]])
                    except Exception as exc:  # noqa: BLE001
                        entry["image_warning"] = str(exc)[:200]

                if loc:
                    node = s.variant_by_sku(p["sku"])
                    if node:
                        s.set_inventory(node["inventoryItem"]["id"], loc["id"], p.get("stock", 0))
                s.publish(pid)
        except Exception as exc:  # noqa: BLE001
            entry["action"] = "error"
            entry["error"] = str(exc)[:400]
        log.append(entry)
        print(f"  [{entry['action']:8}] {p['sku']:18} {entry.get('error', '')}")
        time.sleep(0.5)

    out = os.path.join(ROOT, "push_log.json")
    json.dump(log, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    ok = sum(1 for e in log if e["action"] in ("created", "updated", "dry_run"))
    print(f"\n完成: {ok}/{len(products)}，日志 -> {out}")


if __name__ == "__main__":
    main()
