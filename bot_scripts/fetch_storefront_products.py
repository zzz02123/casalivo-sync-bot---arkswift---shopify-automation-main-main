"""
Shopify Storefront API Product Fetcher
Pulls products using Storefront GraphQL API with public access token,
cleanses them with Casalivo whitewash engine, and exports to Shopify CSV.
"""

import os
import sys
import json
import requests
from dotenv import load_dotenv

load_dotenv()

STOREFRONT_TOKEN = os.getenv("SHOPIFY_STOREFRONT_TOKEN", "be6e23cb56197bcd396972bd3e72ab5e")
SHOP_DOMAIN = os.getenv("SHOPIFY_SHOP_DOMAIN", "casalivo.myshopify.com")

GRAPHQL_QUERY = """
query getProducts($first: Int!, $after: String) {
  products(first: $first, after: $after) {
    pageInfo {
      hasNextPage
      endCursor
    }
    edges {
      node {
        id
        title
        descriptionHtml
        vendor
        productType
        tags
        images(first: 10) {
          edges {
            node {
              url
              altText
            }
          }
        }
        variants(first: 20) {
          edges {
            node {
              id
              title
              sku
              availableForSale
              price {
                amount
                currencyCode
              }
              compareAtPrice {
                amount
                currencyCode
              }
              barcode
              weight
              weightUnit
            }
          }
        }
      }
    }
  }
}
"""

def fetch_products_via_storefront(shop_domain: str, token: str, limit: int = 50):
    clean_domain = shop_domain.replace("https://", "").replace("http://", "").rstrip("/")
    if "." not in clean_domain:
        clean_domain = f"{clean_domain}.myshopify.com"

    endpoint = f"https://{clean_domain}/api/2024-04/graphql.json"
    headers = {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": token
    }

    all_products = []
    has_next_page = True
    after_cursor = None

    print(f"Connecting to Storefront API: {endpoint}")

    while has_next_page and len(all_products) < limit:
        variables = {"first": min(50, limit - len(all_products)), "after": after_cursor}
        response = requests.post(
            endpoint,
            headers=headers,
            json={"query": GRAPHQL_QUERY, "variables": variables},
            timeout=20
        )

        if not response.ok:
            print(f"Error {response.status_code}: {response.text}")
            break

        data = response.json()
        if "errors" in data:
            print(f"GraphQL Errors: {data['errors']}")
            break

        products_data = data.get("data", {}).get("products", {})
        edges = products_data.get("edges", [])

        for edge in edges:
            node = edge["node"]
            images = [img_edge["node"]["url"] for img_edge in node.get("images", {}).get("edges", [])]
            first_variant = node.get("variants", {}).get("edges", [{}])[0].get("node", {})
            
            product_dict = {
                "id": node["id"],
                "title": node["title"],
                "description": node.get("descriptionHtml", ""),
                "vendor": node.get("vendor", ""),
                "category": node.get("productType", "Home & Living"),
                "tags": node.get("tags", []),
                "images": images,
                "sku": first_variant.get("sku", ""),
                "costPrice": float(first_variant.get("price", {}).get("amount", 0.0)),
                "barcode": first_variant.get("barcode", ""),
                "weight": float(first_variant.get("weight", 1.0))
            }
            all_products.append(product_dict)

        page_info = products_data.get("pageInfo", {})
        has_next_page = page_info.get("hasNextPage", False)
        after_cursor = page_info.get("endCursor")

    print(f"Successfully fetched {len(all_products)} products via Storefront API.")
    return all_products

if __name__ == "__main__":
    domain = sys.argv[1] if len(sys.argv) > 1 else SHOP_DOMAIN
    token = sys.argv[2] if len(sys.argv) > 2 else STOREFRONT_TOKEN
    prods = fetch_products_via_storefront(domain, token)
    if prods:
        with open("storefront_raw_products.json", "w", encoding="utf-8") as f:
            json.dump(prods, f, ensure_ascii=False, indent=2)
        print("Saved raw products to storefront_raw_products.json")
