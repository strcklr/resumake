from importlib.resources import as_file
from pathlib import Path

from resumake import themes
from resumake.renderers import html


def render(ctx: dict, out: Path) -> None:
    # Imported lazily: WeasyPrint needs system libraries (Pango) that other
    # formats don't, so `--format html,docx,md` works without them.
    from weasyprint import HTML

    # base_url lets the theme's stylesheet find its bundled fonts (url(fonts/...)).
    with as_file(themes.load(ctx["theme"]).folder) as folder:
        HTML(string=html.render_string(ctx), base_url=f"{folder}/").write_pdf(out)
