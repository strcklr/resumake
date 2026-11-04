from pathlib import Path

from resumake.renderers import html


def render(ctx: dict, out: Path) -> None:
    # Imported lazily: WeasyPrint needs system libraries (Pango) that other
    # formats don't, so `--format html,docx,md` works without them.
    from weasyprint import HTML

    HTML(string=html.render_string(ctx)).write_pdf(out)
