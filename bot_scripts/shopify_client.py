"""
Shopify Admin API Client for Casalivo
Handles product push and inventory levels update.
"""
import requests
from typing import Dict, Any, List, Optional

class ShopifyClient:
    def __init__(self, shop_domain: str, access_token: str, api_version: str = "2024-04"):
        clean_domain = shop_domain.replace("https://", "").replace("http://", "").rstrip("/")
        if "." not in clean_domain:
            clean_domain = f"{clean_domain}.myshopify.com"
        self.base_url = f"https://{clean_domain}/admin/api/{api_version}"
        self.headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json"
        }

    def verify_connection(self) -> Dict[str, Any]:
        url = f"{self.base_url}/shop.json"
        res = requests.get(url, headers=self.headers, timeout=15)
        res.raise_for_status()
        return res.json().get("shop", {})

    def get_locations(self) -> List[Dict[str, Any]]:
        url = f"{self.base_url}/locations.json"
        res = requests.get(url, headers=self.headers, timeout=15)
        res.raise_for_status()
        return res.json().get("locations", [])

    def find_product_by_sku(self, sku: str) -> Optional[Dict[str, Any]]:
        url = f"{self.base_url}/products.json?limit=50&fields=id,title,variants"
        res = requests.get(url, headers=self.headers, timeout=20)
        if not res.ok:
            return None
        products = res.json().get("products", [])
        for p in products:
            for v in p.get("variants", []):
                if v.get("sku", "").lower() == sku.lower():
                    return {"product_id": p["id"], "variant_id": v["id"], "inventory_item_id": v["inventory_item_id"]}
        return None

    def publish_or_update_product(self, product_data: Dict[str, Any], location_id: Optional[str] = None) -> Dict[str, Any]:
        sku = product_data["sku"]
        existing = self.find_product_by_sku(sku)

        payload = {
            "product": {
                "title": product_data["title"],
                "body_html": product_data["description_html"],
                "vendor": product_data["vendor"],
                "tags": ", ".join(product_data.get("tags", ["Casalivo"])),
                "images": [{"src": url} for url in product_data.get("images", [])],
                "variants": [
                    {
                        "sku": sku,
                        "price": str(product_data["price"]),
                        "compare_at_price": str(product_data["compare_at_price"]),
                        "inventory_management": "shopify",
                        "inventory_policy": "deny",
                    }
                ]
            }
        }

        if existing:
            pid = existing["product_id"]
            payload["product"]["id"] = pid
            payload["product"]["variants"][0]["id"] = existing["variant_id"]
            url = f"{self.base_url}/products/{pid}.json"
            res = requests.put(url, json=payload, headers=self.headers, timeout=30)
            res.raise_for_status()
            prod_res = res.json().get("product", {})
            action = "updated"
        else:
            url = f"{self.base_url}/products.json"
            res = requests.post(url, json=payload, headers=self.headers, timeout=30)
            res.raise_for_status()
            prod_res = res.json().get("product", {})
            action = "created"

        if location_id and prod_res.get("variants"):
            inv_item_id = prod_res["variants"][0]["inventory_item_id"]
            self.set_inventory_level(location_id, inv_item_id, product_data["stock"])

        return {"action": action, "sku": sku, "id": prod_res.get("id")}

    def set_inventory_level(self, location_id: str, inventory_item_id: int, available: int):
        url = f"{self.base_url}/inventory_levels/set.json"
        body = {
            "location_id": location_id,
            "inventory_item_id": inventory_item_id,
            "available": available
        }
        res = requests.post(url, json=body, headers=self.headers, timeout=15)
        res.raise_for_status()
        return res.json()
