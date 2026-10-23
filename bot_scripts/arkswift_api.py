"""
ArkSwift API Client & Signature Generator
Handles parameter ASCII sorting, MD5/SHA256 signature, and data extraction.
"""
import time
import hashlib
import hmac
import requests
from typing import Dict, Any, List, Optional

class ArkSwiftClient:
    def __init__(self, api_url: str, app_key: str, app_secret: str, algorithm: str = "md5"):
        self.api_url = api_url.rstrip("/")
        self.app_key = app_key
        self.app_secret = app_secret
        self.algorithm = algorithm.lower()

    def generate_signature(self, params: Dict[str, Any]) -> str:
        """
        1. 过滤空值和已存在的 sign 参数
        2. 按参数名 ASCII 升序字典排序
        3. 拼接 key=value 并追加 app_secret
        4. 计算 MD5 或 HMAC 哈希并转大写
        """
        filtered_items = [
            (k, v) for k, v in params.items() 
            if k != "sign" and v is not None and str(v).strip() != ""
        ]
        sorted_items = sorted(filtered_items, key=lambda x: x[0])
        query_string = "&".join(f"{k}={v}" for k, v in sorted_items)
        
        # 拼接签名原串
        sign_string = f"{query_string}&secret={self.app_secret}"

        if self.algorithm == "sha256":
            signature = hmac.new(
                self.app_secret.encode("utf-8"),
                sign_string.encode("utf-8"),
                hashlib.sha256
            ).hexdigest().upper()
        else:
            signature = hashlib.md5(sign_string.encode("utf-8")).hexdigest().upper()

        return signature

    def request(self, endpoint: str, extra_params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """向 ArkSwift 发送带有签名的 GET/POST 请求"""
        params = {
            "app_key": self.app_key,
            "timestamp": int(time.time()),
            "format": "json",
            "v": "1.0",
        }
        if extra_params:
            params.update(extra_params)

        params["sign"] = self.generate_signature(params)

        url = f"{self.api_url}/{endpoint.lstrip('/')}"
        headers = {"Content-Type": "application/json"}
        
        response = requests.get(url, params=params, headers=headers, timeout=30)
        response.raise_for_status()
        return response.json()

    def fetch_product_inventory(self, page: int = 1, page_size: int = 50) -> List[Dict[str, Any]]:
        """拉取商品库存与价格列表"""
        res = self.request("api/open/products/stock", {"page": page, "page_size": page_size})
        if isinstance(res, dict) and "data" in res:
            return res["data"].get("list", [])
        return []
