#!/usr/bin/env python3
"""占星室的转发小脚本（可选）。

有的 AI 接口不让网页直接连（浏览器报 CORS）。把这个脚本跑在自己的机器 / 服务器上，
占星室设置里「转发地址」填它的地址，请求就由它替你发出去。
它不看内容、不存东西，只是把 {url, headers, body} 原样转出去，再把回复原样带回来。

用法：
    python3 relay.py                 # 监听 0.0.0.0:8787
    RELAY_PORT=9000 python3 relay.py
    RELAY_TOKEN=随便一串 python3 relay.py   # 设了的话，占星室转发地址写成 https://你的地址/?token=那串

只允许转到 https，只允许 POST。放公网上请务必设 RELAY_TOKEN，不然谁都能借你的口子发请求。
"""
import json
import os
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get("RELAY_PORT", "8787"))
TOKEN = os.environ.get("RELAY_TOKEN", "")


class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _reply(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if TOKEN:
            q = parse_qs(urlparse(self.path).query)
            if (q.get("token") or [""])[0] != TOKEN:
                return self._reply(403, {"error": {"message": "token 不对"}})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(n) or b"{}")
            url = str(req.get("url") or "")
            headers = {str(k): str(v) for k, v in (req.get("headers") or {}).items()}
            body = req.get("body")
        except Exception as e:
            return self._reply(400, {"error": {"message": f"请求格式不对: {e}"}})
        if not url.startswith("https://"):
            return self._reply(400, {"error": {"message": "只转 https"}})
        headers.setdefault("Content-Type", "application/json")
        data = json.dumps(body, ensure_ascii=False).encode()
        r = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(r, timeout=180) as resp:
                return self._reply(resp.status, resp.read(), resp.headers.get("Content-Type", "application/json"))
        except urllib.error.HTTPError as e:
            return self._reply(e.code, e.read(), e.headers.get("Content-Type", "application/json"))
        except Exception as e:
            return self._reply(502, {"error": {"message": f"转发失败: {type(e).__name__}: {e}"}})

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    print(f"占星室转发脚本在 0.0.0.0:{PORT}" + ("（带 token）" if TOKEN else "（没设 RELAY_TOKEN，别放公网）"))
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
