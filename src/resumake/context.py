"""Turn validated resume data into a display-ready view model shared by all renderers."""

from __future__ import annotations

import re
from typing import Any

DEFAULT_SECTIONS = ["summary", "work", "projects", "skills", "education", "certifications"]
DEFAULT_TITLES = {
    "summary": "Summary",
    "work": "Experience",
    "projects": "Projects",
    "skills": "Skills",
    "education": "Education",
    "certifications": "Certifications",
}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def format_date(value: Any) -> str:
    """'2021-03' / '2021-03-15' -> 'Mar 2021'; '2021' -> '2021'; anything else verbatim."""
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() in {"present", "current", "now"}:
        return "Present"
    m = re.fullmatch(r"(\d{4})-(\d{1,2})(?:-\d{1,2})?", text)
    if m and 1 <= int(m.group(2)) <= 12:
        return f"{MONTHS[int(m.group(2)) - 1]} {m.group(1)}"
    return text


def date_range(item: dict) -> str:
    start, end = format_date(item.get("start")), format_date(item.get("end"))
    if start and "end" not in item:
        end = "Present"
    if start and end:
        return start if start == end else f"{start} – {end}"
    return start or end


def _contact(basics: dict) -> list[dict]:
    items = []
    if basics.get("location"):
        items.append({"text": basics["location"], "url": None})
    if basics.get("email"):
        items.append({"text": basics["email"], "url": f"mailto:{basics['email']}"})
    if basics.get("phone"):
        tel = re.sub(r"[^\d+]", "", basics["phone"])
        items.append({"text": basics["phone"], "url": f"tel:{tel}"})
    if basics.get("website"):
        items.append({"text": _strip_scheme(basics["website"]), "url": basics["website"]})
    for p in basics.get("profiles", []):
        url = p.get("url")
        text = _strip_scheme(url) if url else f"{p['network']}: {p.get('username', '')}".strip()
        items.append({"text": text, "url": url})
    return items


def _strip_scheme(url: str) -> str:
    return re.sub(r"^https?://(www\.)?", "", url).rstrip("/")


def _join(*parts: Any, sep: str = " · ") -> str:
    return sep.join(str(p) for p in parts if p)


def _skill_text(skill: dict) -> str:
    groups = [k if isinstance(k, list) else [k] for k in skill.get("keywords", [])]
    if groups and all(len(g) == 1 for g in groups):
        text = ", ".join(g[0] for g in groups)
    else:
        # Two spaces either side, like the Word original; NBSPs keep HTML from collapsing them.
        text = "\u00a0 |\u00a0 ".join(", ".join(g) for g in groups)
    return _join(text, skill.get("note"), sep=" — ")


def _role(item: dict) -> dict:
    return {
        "title": item["position"],
        "subtitle": item.get("location", ""),
        "dates": date_range(item),
        "summary": (item.get("summary") or "").strip(),
        "highlights": item.get("highlights", []),
    }


def _entry(key: str, item: dict) -> dict:
    """Normalize work/projects/education/certifications into one entry shape.

    title/title_url: the bold heading; org/org_url: shown after it;
    subtitle: the muted second line; dates: formatted date range.
    """
    entry = {
        "title": "",
        "title_url": None,
        "org": "",
        "org_url": None,
        "subtitle": item.get("location", ""),
        "dates": format_date(item["date"]) if "date" in item else date_range(item),
        "summary": (item.get("summary") or "").strip(),
        "highlights": item.get("highlights", []),
        "keywords": item.get("keywords", []),
        "roles": [],
    }
    if key == "work" and "roles" in item:
        # Company as the heading, each role listed beneath it.
        entry.update(
            title=item["company"],
            title_url=item.get("url"),
            org=item.get("location", ""),
            subtitle="",
            dates=date_range(item) if ("start" in item or "end" in item) else "",
            roles=[_role(r) for r in item["roles"]],
        )
    elif key == "work":
        entry.update(title=item["position"], org=item["company"], org_url=item.get("url"))
    elif key == "education":
        # "State University — Columbus, OH" / "B.S. in Computer Science, 2016"
        entry.update(
            title=item["institution"],
            org=item.get("location", ""),
            subtitle=_join(
                item.get("degree"), item.get("area"), entry["dates"], item.get("score"), sep=", "
            ),
            dates="",
        )
    elif key == "projects":
        # Tech stack goes under the project name: "Go, DynamoDB, Docker".
        entry.update(
            title=item["name"],
            title_url=item.get("url"),
            subtitle=_join(item.get("location"), ", ".join(item.get("keywords", []))),
            keywords=[],
        )
    else:  # certifications
        entry.update(title=item["name"], title_url=item.get("url"), org=item.get("issuer", ""))
    return entry


def build_context(data: dict) -> dict:
    basics = data["basics"]
    layout = data.get("layout", {})
    titles = {**DEFAULT_TITLES, **layout.get("titles", {})}

    sections = []
    for key in layout.get("sections", DEFAULT_SECTIONS):
        if key == "summary":
            if basics.get("summary"):
                sections.append({"key": key, "title": titles[key], "text": basics["summary"].strip()})
            continue
        items = data.get(key) or []
        if not items:
            continue
        if key == "skills":
            entries = [{"name": s["name"], "text": _skill_text(s)} for s in items]
        else:
            entries = [_entry(key, item) for item in items]
        sections.append({"key": key, "title": titles[key], "entries": entries})

    return {"basics": basics, "contact": _contact(basics), "sections": sections}
