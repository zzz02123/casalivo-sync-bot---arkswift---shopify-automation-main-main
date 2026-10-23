"""
Publish already-created Casalivo products to the Online Store channel.
Needs app scopes: read_publications + write_publications.

Usage: python publish_existing.py [--prefix CSL-] [--dry-run] [--unpublish]
"""
import os
import sys
import argparse

import requests
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shopify_auth import ShopifyToken  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "2025-07"


def main() -> None:
    load_dotenv(dotenv_path=os.path.join(ROOT, ".env"))
    ap = argparse.ArgumentParser()
    ap.add_argument("--prefix", default="CSL-", help="只处理该 SKU 前缀")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--unpublish", action="store_true", help="反向操作：取消发布")
    args = ap.parse_args()

    auth = ShopifyToken(os.getenv("SHOPIFY_SHOP_DOMAIN", ""),
                        os.getenv("SHOPIFY_CLIENT_ID", ""),
                        os.getenv("SHOPIFY_CLIENT_SECRET", ""))
    token = auth.get()
    url = f"https://{auth.shop}/admin/api/{API}/graphql.json"

    def gql(query, variables=None):
        r = requests.post(url, headers={"X-Shopify-Access-Token": token, "Content-Type": "application/json"},
                          json={"query": query, "variables": variables or {}}, timeout=40)
        data = r.json()
        if data.get("errors"):
            raise SystemExit(f"GraphQL: {data['errors']}")
        return data["data"]

    pubs = gql("{ publications(first: 20) { edges { node { id name } } } }")["publications"]["edges"]
    pubs = [e["node"] for e in pubs]
    target = next((p for p in pubs if p["name"].lower() in ("online store", "tienda online")), None)
    if not target:
        raise SystemExit(f"找不到 Online Store 渠道，现有渠道: {[p['name'] for p in pubs]}")
    print(f"channel: {target['name']} ({target['id']})")

    products, cursor = [], None
    while True:
        d = gql("""query($cursor: String) {
          products(first: 100, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            edges { node { id title publishedAt variants(first: 1) { edges { node { sku } } } } }
          } }""", {"cursor": cursor})["products"]
        for e in d["edges"]:
            n = e["node"]
            sku = n["variants"]["edges"][0]["node"].get("sku") or ""
            if sku.startswith(args.prefix):
                products.append(n)
        if not d["pageInfo"]["hasNextPage"]:
            break
        cursor = d["pageInfo"]["endCursor"]

    print(f"matched {len(products)} products with prefix {args.prefix}")
    mutation = "publishableUnpublish" if args.unpublish else "publishablePublish"
    m = f"""mutation($id: ID!, $input: [PublicationInput!]!) {{
             {mutation}(id: $id, input: $input) {{ userErrors {{ field message }} }} }}"""

    ok = err = 0
    for p in products:
        if args.dry_run:
            print(f"  would {'unpublish' if args.unpublish else 'publish'}: {p['title'][:55]}")
            continue
        try:
            res = gql(m, {"id": p["id"], "input": [{"publicationId": target["id"]}]})[mutation]
            if res["userErrors"]:
                err += 1
                print(f"  ERR {p['title'][:45]}: {res['userErrors']}")
            else:
                ok += 1
        except SystemExit as exc:
            print(f"  FATAL {exc}")
            break
    print(f"\ndone: ok={ok} err={err} total={len(products)}")


if __name__ == "__main__":
    main()
