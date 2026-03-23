import re


def prepend_source_link(markdown: str | None, source_url: str) -> str | None:
    """
    在笔记开头添加来源链接；若首个非空行已包含来源链接，则更新该行并避免重复。
    """
    if markdown is None:
        return None

    source = (source_url or "").strip()
    if not source:
        return markdown

    header = f"> 来源链接：{source}"
    lines = markdown.splitlines()
    first_non_empty_idx = None
    for idx, line in enumerate(lines):
        if line.strip():
            first_non_empty_idx = idx
            break

    if first_non_empty_idx is not None:
        first_line = lines[first_non_empty_idx].strip()
        if first_line.startswith("> 来源链接：") or first_line.startswith("来源链接："):
            lines[first_non_empty_idx] = header
            return "\n".join(lines)

    if markdown.strip():
        return f"{header}\n\n{markdown}"
    return header


def replace_content_markers(
    markdown: str, video_id: str, platform: str = "bilibili"
) -> str:
    """
    替换 *Content-04:16*、Content-04:16 或 Content-[04:16] 为超链接，跳转到对应平台视频的时间位置
    """
    # 匹配三种形式：*Content-04:16*、Content-04:16、Content-[04:16]
    pattern = r"(?:\*?)Content-(?:\[(\d{2}):(\d{2})\]|(\d{2}):(\d{2}))"

    safe_video_id = video_id

    def replacer(match):
        mm = match.group(1) or match.group(3)
        ss = match.group(2) or match.group(4)
        total_seconds = int(mm) * 60 + int(ss)
        time_str = f"{mm}:{ss}"

        if platform == "bilibili":
            # 处理多 P 情况，如果是 BV123_p3 转换为 BV123?p=3
            actual_video_id = safe_video_id.replace("_p", "?p=")
            # 判断连接符是 ? 还是 &（如果 video_id 里已经有了 ?p=，则时间参数用 &t=）
            connector = "&t=" if "?" in actual_video_id else "?t="
            url = f"https://www.bilibili.com/video/{actual_video_id}{connector}{total_seconds}"
            return f"[原片 @ {time_str}]({url})"

        elif platform == "youtube":
            url = f"https://www.youtube.com/watch?v={safe_video_id}&t={total_seconds}s"
            return f"[原片 @ {time_str}]({url})"

        elif platform == "douyin":
            url = f"https://www.douyin.com/video/{safe_video_id}"
            return f"[原片 @ {time_str}]({url})"

        else:
            return f"({mm}:{ss})"

    return re.sub(pattern, replacer, markdown)
