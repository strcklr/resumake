"""Output renderers. Each takes the view-model context and writes one file."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from resumake.renderers import docx, html, markdown, pdf

Renderer = Callable[[dict, Path], None]

# format name -> (file extension, render function)
RENDERERS: dict[str, tuple[str, Renderer]] = {
    "pdf": ("pdf", pdf.render),
    "docx": ("docx", docx.render),
    "html": ("html", html.render),
    "md": ("md", markdown.render),
}
