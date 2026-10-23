# Casalivo · ArkSwift(ES) → Shopify 上架流水线

真实数据源（ArkSwift 后台导出，登录后在 `purchased/apis/ftp` 下载）：

| 文件 | 内容 |
|---|---|
| `~/Downloads/库存 - 工作表1.csv` | Aosom ES 库存表：49 个 SKU、含税外单价 `61,88€`、可售数量 |
| `~/Downloads/Aosom ESStore Products *.xlsx` | 西班牙站商品主数据：西语标题/描述/卖点、12 张图、重量尺寸 |

## 一键跑

```bash
cd D:/casalivo-sync-bot---arkswift-\&-shopify-automation
python bot_scripts/build_casalivo_import.py        # 清洗 + 定价 + 生成 CSV/JSON
python bot_scripts/push_to_shopify.py --dry-run     # 校验店铺连通
python bot_scripts/push_to_shopify.py               # 真正写入 Shopify
```

产出：

- `shopify_import_casalivo_es.csv` — Shopify 后台 *产品 → 导入* 直接吃的 CSV（340 行 = 34 商品 + 306 张附图）
- `shopify_import_casalivo_es.json` — Admin API 直推用的 payload（含成本、库存）
- `import_qa_report.json` — 质检：上架数、跳过原因、品牌泄漏扫描、价格/毛利
- `preview_es_products.html` — 上架效果预览

## 清洗规则（`whitewash_engine` 的落地版）

- **品牌**：Aosom / Homcom / Outsunny / PawHut / Vinsetto / SoBuy / Songmics → `Casalivo`（PawHut→Casalivo Pets，Vinsetto→Casalivo Office）
- **抹除痕迹**：供应商公司名 `SPANISH AOSOM SL`、URL、邮箱、`tienda oficial`/`garantía del fabricante` 等一律删除
- **SKU**：`CSL-` + 原始 SKU（大写）
- **定价**：成本 <€20 ×2.5，€20–50 ×2.0，>€50 ×1.8，取整 .99；划线价 ×1.35
- **库存**：可售 = 数量 − 3（安全缓冲）；≤3 直接跳过（本次 15 个缺货 SKU 被跳过）
- **文案**：西语描述 + 卖点列表 + 规格表 + 欧洲仓 3–5 天发货块 + 12 个月质保块

## ArkSwift 开放接口现状（2026-10 实测）

- `https://api.arkswift.com/*` 全 404，`.env` 里的 RSA 密钥对**没有可用端点**，签名规则未公开（需登录页文档）。
- 公开可用的只有：`GET https://www.arkswift.com/rest/v1/b2b/goods/search?pageNum=&pageSize=`
  - ✅ 商品列表（含 `countryCode`、`sellerSku`、图片、箱规重量）
  - ❌ **价格与库存返回 null**（登录态才给），且总量封顶 10,000 条 → 只能当辅助校验，不能代替库存表。
- 想要实时库存：① 登录后导出库存表；② 或让我用你浏览器登录态的 cookie 打同一个接口。

## Shopify 侧：Client Credentials Grant（服务端换票）

- 店铺：`td5kxa-2d.myshopify.com`，Admin API `2025-07`
- 鉴权方式：**OAuth 2.0 Client Credentials Grant**，不再使用手填 `shpat_`
  - 服务端 `POST /admin/oauth/access_token`，`grant_type=client_credentials`
  - token 只在服务端内存缓存（`expires_in≈86399`s），到期前 5 分钟自动续期，401 自动重换一次
  - 前端零密钥：`/api/credentials` 只回布尔状态，`/api/shopify/publish-product` 等接口**不接受**请求体里的 token
- 需要的环境变量：`SHOPIFY_CLIENT_ID`、`SHOPIFY_CLIENT_SECRET`（Dev Dashboard → 应用 → Client ID/Secret）
- 权限（应用版本里勾选）：`write_products, read_products, write_inventory, read_locations, write_publications`

### 鉴权自检

```bash
npm start                                  # 起服务
curl -s localhost:3000/api/shopify/auth-status     # 换票状态（不返回 token 本身）
curl -s -X POST localhost:3000/api/shopify/test-connection -d '{}' -H 'Content-Type: application/json'
./node_modules/.bin/tsx scripts/test_token_manager.ts   # 缓存/续期/401/错误透传 单测
```

### 推送

```bash
python bot_scripts/push_to_shopify.py --dry-run   # 只校验连接与数据
python bot_scripts/push_to_shopify.py             # 按 SKU 有则更新、无则新建 + 同步库存 + 发布
```

CLI 走同一套 grant（`bot_scripts/shopify_auth.py`），所以 Python 侧也不需要 `shpat_`。

## 当前状态（2026-10-19）

| 项 | 值 |
|---|---|
| 上架商品 | **34 个**（`CSL-*`），已发布到 Online Store + Casalivo Headless + Casalivo Headless 02 |
| Storefront API 读回 | 34 个、全部 `availableForSale`、价格/图片/SKU 正确 |
| 旧商品 | 17 个已改 `draft`（下架保留，可恢复） |
| 库存地点 | `Shop location`（`gid://shopify/Location/125774790993`） |
| 应用 scope | 含 `write_products/write_inventory/write_locations/write_publications`（缺 `read_publications`，但 `write_publications` 已够读渠道列表） |

注意：**Storefront API 是独立渠道**。只发布到 Online Store 时，Storefront `products()` 返回空数组（不报错）。跑 Astro/Headless 前端时必须同时发布到对应的 Headless publication。

缺的 scope：`unauthenticated_read_product_inventory`（Storefront 读 `quantityAvailable` 需要，不加也能正常展示商品）。


