"""
Pick N parent products out of a built Casalivo import package into one sample CSV.

The sample is copied byte-for-byte out of shopify_import_casalivo_ww_*.csv (same
header, same variant + image rows), so a trial import updates the very same
handles when the full package follows.

  python make_sample_import.py <package_dir> [count]

Selection is deterministic: one product per category first, cycling through
single / colour / size / colour+size structures, in package order.
"""
import csv
import glob
import os
import sys
import collections

STRUCTURES = ("single", "color", "size", "color+size")


def structure(row):
    color = row.get("Option1 name") == "Color"
    size = row.get("Option2 name") == "Talla"
    if color and size:
        return "color+size"
    if color:
        return "color"
    if size:
        return "size"
    return "single"


def load(package_dir):
    files = sorted(glob.glob(os.path.join(package_dir, "shopify_import_casalivo_ww_*.csv")))
    if not files:
        raise SystemExit(f"no import csv in {package_dir}")
    header, rows = None, []
    for path in files:
        with open(path, encoding="utf-8-sig", newline="") as fh:
            reader = csv.DictReader(fh)
            header = header or reader.fieldnames
            rows.extend(reader)
    return header, rows


def main():
    package_dir = sys.argv[1] if len(sys.argv) > 1 else "shopify_import_ww_20261023"
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    header, rows = load(package_dir)

    # index: handle -> its rows (parent row first, then variants + images)
    blocks = collections.OrderedDict()
    for row in rows:
        handle = row.get("URL handle")
        if handle:
            blocks.setdefault(handle, []).append(row)

    candidates = []
    for handle, block in blocks.items():
        head = block[0]
        if not head.get("Title"):
            continue
        skus = [r["SKU"] for r in block if r.get("SKU")]
        stock = [int(r["Inventory quantity"] or 0) for r in block if r.get("SKU")]
        if not skus or not any(s > 0 for s in stock):
            continue
        candidates.append({
            "handle": handle,
            "rows": block,
            "structure": structure(head),
            "category": head.get("Product category"),
            "type": head.get("Type"),
        })

    # split the slots evenly over the four structures, then fill whatever is left
    buckets = collections.OrderedDict((s, []) for s in STRUCTURES)
    for c in candidates:
        buckets.setdefault(c["structure"], []).append(c)

    picked, seen_cat, seen_handle = [], set(), set()

    def take(bucket, limit):
        taken = 0
        for c in bucket:
            if taken >= limit or len(picked) >= count:
                break
            if c["handle"] in seen_handle or c["category"] in seen_cat:
                continue
            picked.append(c)
            seen_handle.add(c["handle"])
            seen_cat.add(c["category"])
            taken += 1

    quota = max(1, count // len(STRUCTURES))
    for s, bucket in buckets.items():
        take(bucket, quota)
    for s, bucket in buckets.items():          # a structure short of products
        take(bucket, count)
    for c in candidates:                       # one per category, any structure
        if len(picked) >= count:
            break
        if c["handle"] in seen_handle or c["category"] in seen_cat:
            continue
        picked.append(c)
        seen_handle.add(c["handle"])
        seen_cat.add(c["category"])
    for c in candidates:                       # still short: repeat categories
        if len(picked) >= count:
            break
        if c["handle"] in seen_handle:
            continue
        picked.append(c)
        seen_handle.add(c["handle"])

    out_rows = [row for p in picked for row in p["rows"]]

    out = os.path.join(package_dir, f"sample_{count}_import.csv")
    with open(out, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=header)
        w.writeheader()
        for row in out_rows:
            w.writerow({k: row.get(k, "") for k in header})

    by_struct = collections.Counter(p["structure"] for p in picked)
    print(f"products: {len(picked)}  rows: {len(out_rows)}  -> {out}")
    print("structures:", dict(by_struct))
    print("categories:", len({p['category'] for p in picked}))
    print("variants:", sum(1 for r in out_rows if r.get('SKU')),
          "images:", sum(1 for r in out_rows if r.get('Image position')))


if __name__ == "__main__":
    main()
