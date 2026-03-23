"""
B站 UP 主空间视频列表接口（带服务端过滤）
"""
import hashlib
import logging
import os
import re
import time
from datetime import datetime
from functools import reduce
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.utils.response import ResponseWrapper as R

logger = logging.getLogger(__name__)
router = APIRouter()

BILIBILI_COOKIES_FILE = os.getenv("BILIBILI_COOKIES_FILE", "cookies.txt")

# ── wbi 签名 ─────────────────────────────────────────────────────────────────
_MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
    26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
    20, 34, 44, 52,
]
_wbi_cache: dict = {"img_key": "", "sub_key": "", "ts": 0.0}
_WBI_TTL = 600


def _get_mixin_key(orig: str) -> str:
    return reduce(lambda s, i: s + orig[i], _MIXIN_KEY_ENC_TAB, "")[:32]


def _sign(params: dict, img_key: str, sub_key: str) -> dict:
    mixin_key = _get_mixin_key(img_key + sub_key)
    params = {**params, "wts": round(time.time())}
    params = dict(sorted(params.items()))
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    w_rid = hashlib.md5((qs + mixin_key).encode()).hexdigest()
    return {**params, "w_rid": w_rid}


def _get_wbi_keys(client: httpx.Client) -> tuple[str, str]:
    global _wbi_cache
    if time.time() - _wbi_cache["ts"] < _WBI_TTL and _wbi_cache["img_key"]:
        return _wbi_cache["img_key"], _wbi_cache["sub_key"]
    resp = client.get("https://api.bilibili.com/x/web-interface/nav", timeout=10)
    data = resp.json()
    img_url = data["data"]["wbi_img"]["img_url"]
    sub_url = data["data"]["wbi_img"]["sub_url"]
    img_key = img_url.rsplit("/", 1)[-1].split(".")[0]
    sub_key = sub_url.rsplit("/", 1)[-1].split(".")[0]
    _wbi_cache = {"img_key": img_key, "sub_key": sub_key, "ts": time.time()}
    return img_key, sub_key


# ── Cookie 解析 ──────────────────────────────────────────────────────────────
def _load_cookies() -> dict:
    p = Path(BILIBILI_COOKIES_FILE)
    if not p.is_absolute():
        p = Path(__file__).parent.parent.parent / BILIBILI_COOKIES_FILE
    if not p.exists():
        return {}
    cookies: dict = {}
    with open(p, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) >= 7:
                cookies[parts[5]] = parts[6]
    return cookies


def _ensure_https(url: str) -> str:
    return "https:" + url if url.startswith("//") else url


def _extract_bvid(s: str) -> str:
    m = re.search(r"BV[a-zA-Z0-9]+", s)
    return m.group() if m else s.strip()


# ── 核心获取+过滤逻辑 ────────────────────────────────────────────────────────
def _fetch_videos(
    uid: str,
    max_videos: int,
    keywords: list[str],
    date_from_ts: float | None,
    date_to_ts: float | None,
    exclude_bvids: set[str],
) -> list[dict]:
    cookies = _load_cookies()
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Referer": f"https://space.bilibili.com/{uid}/video",
    }

    videos: list[dict] = []
    ps = 50
    pn = 1

    with httpx.Client(headers=headers, cookies=cookies, timeout=15) as client:
        try:
            img_key, sub_key = _get_wbi_keys(client)
        except Exception as e:
            logger.warning(f"获取 wbi key 失败: {e}")
            img_key, sub_key = "", ""

        while True:
            params: dict = {"mid": uid, "pn": pn, "ps": ps, "order": "pubdate", "tid": 0}
            if img_key:
                params = _sign(params, img_key, sub_key)

            try:
                resp = client.get(
                    "https://api.bilibili.com/x/space/wbi/arc/search",
                    params=params,
                    timeout=15,
                )
                data = resp.json()
            except Exception as e:
                logger.error(f"请求B站API失败 (pn={pn}): {e}")
                break

            if data.get("code") != 0:
                logger.warning(f"B站API错误: code={data.get('code')} msg={data.get('message')}")
                break

            vlist: list = data.get("data", {}).get("list", {}).get("vlist", [])
            if not vlist:
                break

            stop_early = False
            for v in vlist:
                bvid = v.get("bvid", "")
                title = v.get("title", "")
                created = v.get("created")  # unix timestamp，B站按发布时间倒序

                # 日期下界优化：视频已比 date_from 更早，后续全部更早，直接停止
                if date_from_ts and created and created < date_from_ts:
                    stop_early = True
                    break

                # 跳过上界之外的（太新的视频）
                if date_to_ts and created and created > date_to_ts:
                    continue

                # 关键词过滤
                if keywords and not any(k in title.lower() for k in keywords):
                    continue

                # 排除指定链接
                if bvid in exclude_bvids:
                    continue

                videos.append({
                    "bvid": bvid,
                    "title": title,
                    "cover": _ensure_https(v.get("pic", "")),
                    "url": f"https://www.bilibili.com/video/{bvid}",
                    "duration_str": v.get("length", ""),
                    "view_count": v.get("play"),
                    "created": created,
                })

                if len(videos) >= max_videos:
                    stop_early = True
                    break

            if stop_early:
                break

            page_info = data.get("data", {}).get("page", {})
            total = page_info.get("count", 0)
            if pn * ps >= total or len(vlist) < ps:
                break
            pn += 1

    return videos


# ── 路由 ─────────────────────────────────────────────────────────────────────
@router.get("/space_videos")
def get_space_videos(
    url: str = Query(...),
    max_videos: int = Query(default=100, ge=1, le=500),
    keywords: str = Query(default="", description="分号分隔的标题关键词"),
    date_from: str = Query(default="", description="起始日期 YYYY-MM-DD"),
    date_to: str = Query(default="", description="结束日期 YYYY-MM-DD"),
    exclude_urls: str = Query(default="", description="换行分隔的排除链接/BV号"),
):
    match = re.search(r"space\.bilibili\.com/(\d+)", url)
    if not match:
        raise HTTPException(status_code=400, detail="无效的B站空间链接")

    uid = match.group(1)

    # 解析过滤参数
    kws = [k.strip().lower() for k in keywords.split(";") if k.strip()]

    date_from_ts: float | None = None
    date_to_ts: float | None = None
    if date_from:
        try:
            date_from_ts = datetime.strptime(date_from, "%Y-%m-%d").timestamp()
        except ValueError:
            pass
    if date_to:
        try:
            date_to_ts = datetime.strptime(date_to, "%Y-%m-%d").timestamp() + 86399
        except ValueError:
            pass

    exclude_bvids: set[str] = set()
    if exclude_urls:
        for line in exclude_urls.split("\n"):
            bvid = _extract_bvid(line.strip())
            if bvid:
                exclude_bvids.add(bvid)

    logger.info(
        f"获取UP {uid} 视频列表: max={max_videos} kws={kws} "
        f"date=[{date_from}~{date_to}] exclude={len(exclude_bvids)}条"
    )

    try:
        videos = _fetch_videos(uid, max_videos, kws, date_from_ts, date_to_ts, exclude_bvids)
    except Exception as e:
        logger.error(f"获取视频列表异常: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取视频列表失败：{str(e)}")

    return R.success(data={"videos": videos, "total": len(videos), "uid": uid})
