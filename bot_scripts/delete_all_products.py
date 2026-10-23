import os, sys, time, requests, threading
os.environ["NO_PROXY"] = "*"
for k in ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"]:
    os.environ.pop(k, None)
sys.path.insert(0, "bot_scripts")
from dotenv import load_dotenv
load_dotenv(dotenv_path=".env")
from shopify_auth import ShopifyToken

t = ShopifyToken(os.getenv("SHOPIFY_SHOP_DOMAIN"), os.getenv("SHOPIFY_CLIENT_ID"), os.getenv("SHOPIFY_CLIENT_SECRET"))
tok = t.get()
H = {"X-Shopify-Access-Token": tok, "Content-Type": "application/json"}
URL = f"https://{t.shop}/admin/api/2025-07/graphql.json"
P = {"http": None, "https": None}


def gql(q, v=None):
    for _ in range(4):
        try:
            r = requests.post(URL, headers=H, json={"query": q, "variables": v or {}}, timeout=40, proxies=P)
            d = r.json()
            if d.get("errors"):
                raise RuntimeError(d["errors"])
            return d["data"]
        except Exception:
            time.sleep(1.5)
    raise RuntimeError("gql failed")


# collect all product ids
ids, cur = [], None
while True:
    d = gql('''query($c:String){ products(first:250, after:$c){ pageInfo{hasNextPage endCursor}
        edges{ node{ id } } } }''', {"c": cur})["products"]
    ids += [e["node"]["id"] for e in d["edges"]]
    if not d["pageInfo"]["hasNextPage"]:
        break
    cur = d["pageInfo"]["endCursor"]

print(f"total to delete: {len(ids)}", flush=True)

MUT = '''mutation($input: ProductDeleteInput!){ productDelete(input:$input){ deletedProductId userErrors{field message} } }'''
lock = threading.Lock()
done = [0]
err = [0]


def worker(worker_ids):
    local_done = 0
    for pid in worker_ids:
        try:
            gql(MUT, {"input": {"id": pid}})
            local_done += 1
        except Exception as e:
            with lock:
                err[0] += 1
        with lock:
            done[0] += 1
        if done[0] % 500 == 0:
            print(f"  {done[0]}/{len(ids)}", flush=True)
    return local_done


workers = 6
chunks = [ids[i::workers] for i in range(workers)]
threads = [threading.Thread(target=worker, args=(c,)) for c in chunks]
for th in threads:
    th.start()
for th in threads:
    th.join()

print(f"done: {done[0]} deleted, {err[0]} errors", flush=True)
c = gql('{ productsCount{ count } }')["productsCount"]["count"]
print(f"remaining products: {c}", flush=True)
