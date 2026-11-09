"""Themes: how a resume looks. Each is a folder in src/resumake/themes/.

A theme folder holds:

- ``theme.json``: its title, description, default accent colour (``null`` if it has no colour) and
  the style settings the Word renderer uses (``docx``).
- ``style.css``: the stylesheet for HTML and PDF, with ``url(fonts/...)`` for its bundled fonts.
- ``fonts/``: those fonts (openly licensed, so the PDF and the editor's preview match).
- optionally ``resume.html.j2``, to replace the shared HTML template in ``templates/``.

Every theme renders the same view model (context.py): a theme changes how a resume looks, never what
it says. Metadata is JSON rather than YAML so the web editor's in-browser Python needs no YAML library.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from importlib.resources import files

try:
    from importlib.resources.abc import Traversable
except ImportError:  # Python 3.10
    from importlib.abc import Traversable

DEFAULT = "classic"
THEMES_DIR = files("resumake") / "themes"


@dataclass(frozen=True)
class Theme:
    name: str
    title: str
    description: str
    #: Default accent colour (``#rrggbb``), or None if the theme has no colour.
    accent: str | None
    docx: dict
    folder: Traversable


def available() -> list[str]:
    """Theme names, ``classic`` first."""
    names = sorted(p.name for p in THEMES_DIR.iterdir() if p.is_dir() and (p / "theme.json").is_file())
    return sorted(names, key=lambda n: n != DEFAULT)


@lru_cache(maxsize=None)
def load(name: str) -> Theme:
    folder = THEMES_DIR / name
    if not (folder / "theme.json").is_file():
        raise KeyError(f"unknown theme {name!r} (choose from {', '.join(available())})")
    meta = json.loads((folder / "theme.json").read_text(encoding="utf-8"))
    return Theme(
        name=name,
        title=meta["title"],
        description=meta["description"],
        accent=meta.get("accent"),
        docx=meta["docx"],
        folder=folder,
    )
