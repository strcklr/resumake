from pathlib import Path

from resumake import themes
from resumake.renderers import _templates


def render_string(ctx: dict) -> str:
    theme = themes.for_context(ctx)
    template = _templates.environment(autoescape=True, theme=theme).get_template("resume.html.j2")
    return template.render(**ctx, css=_templates.read_theme(theme, "style.css"))


def render(ctx: dict, out: Path) -> None:
    out.write_text(render_string(ctx), encoding="utf-8")
