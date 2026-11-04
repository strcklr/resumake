from pathlib import Path

from resumake.renderers import _templates


def render_string(ctx: dict) -> str:
    template = _templates.environment(autoescape=True).get_template("resume.html.j2")
    return template.render(**ctx, css=_templates.read("style.css"))


def render(ctx: dict, out: Path) -> None:
    out.write_text(render_string(ctx), encoding="utf-8")
