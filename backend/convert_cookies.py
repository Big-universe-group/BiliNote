#!/usr/bin/env python3
"""
将 EditThisCookie 导出的 JSON 格式转换为 yt-dlp 所需的 Netscape 格式 cookies.txt
用法: python convert_cookies.py cookies.json
"""
import json
import sys
from pathlib import Path


def convert(json_path: str, output_path: str = "cookies.txt"):
    with open(json_path, "r", encoding="utf-8") as f:
        cookies = json.load(f)

    lines = ["# Netscape HTTP Cookie File", ""]
    for c in cookies:
        domain = c.get("domain", "")
        # domain 不带点前缀时补上，表示包含子域名
        if domain and not domain.startswith("."):
            domain = "." + domain
        include_subdomains = "TRUE" if domain.startswith(".") else "FALSE"
        path = c.get("path", "/")
        secure = "TRUE" if c.get("secure", False) else "FALSE"
        expiry = int(c.get("expirationDate", 0))
        name = c.get("name", "")
        value = c.get("value", "")
        lines.append(f"{domain}\t{include_subdomains}\t{path}\t{secure}\t{expiry}\t{name}\t{value}")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"转换完成: {output_path}（共 {len(cookies)} 条 cookie）")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python convert_cookies.py <json文件路径> [输出文件路径]")
        sys.exit(1)
    json_file = sys.argv[1]
    out_file = sys.argv[2] if len(sys.argv) > 2 else "cookies.txt"
    convert(json_file, out_file)
