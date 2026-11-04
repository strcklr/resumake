from importlib.resources import as_file, files
from pathlib import Path

from resumake.renderers import html


def render(ctx: dict, out: Path) -> None:
    # Imported lazily: WeasyPrint needs system libraries (Pango) that other
    # formats don't, so `--format html,docx,md` works without them.
    from weasyprint import HTML

    # base_url lets the stylesheet's url(fonts/...) resolve to the bundled fonts.
    with as_file(files("resumake") / "templates") as templates:
        HTML(string=html.render_string(ctx), base_url=f"{templates}/").write_pdf(out)
