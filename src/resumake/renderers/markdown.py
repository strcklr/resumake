import re
from pathlib import Path

from resumake.renderers import _templates


def render_string(ctx: dict) -> str:
    text = _templates.environment(autoescape=False).get_template("resume.md.j2").render(**ctx)
    return re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"


def render(ctx: dict, out: Path) -> None:
    out.write_text(render_string(ctx), encoding="utf-8")
