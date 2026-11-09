"""Themes: how a resume looks. Built-in themes are folders in src/resumake/themes/; a resumes repo
can add its own in a ``themes/`` folder (see ``find_dir``).

A theme folder holds:

- ``theme.json``: its title, description, default accent colour (``null`` if it has no colour) and
  the style settings the Word renderer uses (``docx``). In a repo's own theme every field is
  optional: ``docx`` settings it leaves out come from classic.
- ``style.css``: the stylesheet for HTML and PDF, with ``url(fonts/...)`` for its bundled fonts.
- ``fonts/``: those fonts (openly licensed, so the PDF and the editor's preview match).
- optionally ``resume.html.j2``, to replace the shared HTML template in ``templates/``.

Every theme renders the same view model (context.py): a theme changes how a resume looks, never what
it says. Metadata is JSON rather than YAML so the web editor's in-browser Python needs no YAML library.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable
from dataclasses import dataclass
from functools import lru_cache
from importlib.resources import files
from pathlib import Path

try:
    from importlib.resources.abc import Traversable
except ImportError:  # Python 3.10
    from importlib.abc import Traversable

DEFAULT = "classic"
BUILT_IN = files("resumake") / "themes"
#: The folder name a resumes repo keeps its own themes in.
REPO_FOLDER = "themes"
#: Theme names: folder names, used in `layout.theme`.
NAME = re.compile(r"^[A-Za-z0-9][\w-]*$")


@dataclass(frozen=True)
class Theme:
    name: str
    title: str
    description: str
    #: Default accent colour (``#rrggbb``), or None if the theme has no colour.
    accent: str | None
    docx: dict
    folder: Traversable
    #: True for a theme from a resumes repo's ``themes/`` folder.
    custom: bool = False


def find_dir(start: Path) -> Path | None:
    """The ``themes/`` folder for resumes in ``start``: the nearest one in ``start`` or a folder
    above it, not looking past the repo root (the folder holding ``.git``)."""
    for folder in (start, *start.parents):
        candidate = folder / REPO_FOLDER
        if candidate.is_dir() and any((p / "theme.json").is_file() for p in candidate.iterdir() if p.is_dir()):
            return candidate
        if (folder / ".git").exists():
            return None
    return None


def _names(folder: Traversable) -> list[str]:
    return [p.name for p in folder.iterdir() if p.is_dir() and NAME.match(p.name) and (p / "theme.json").is_file()]


def available(dirs: Iterable[Path] = ()) -> list[str]:
    """Theme names, ``classic`` first: the built-in themes and any in ``dirs``."""
    names = set(_names(BUILT_IN))
    for d in dirs:
        names.update(_names(d))
    return sorted(sorted(names), key=lambda n: n != DEFAULT)


def load(name: str, dirs: Iterable[Path] = ()) -> Theme:
    """A theme by name, looking in ``dirs`` (a repo's own themes) before the built-in ones."""
    return _load(name, tuple(dirs))


@lru_cache(maxsize=None)
def _load(name: str, dirs: tuple[Path, ...]) -> Theme:
    for d in dirs:
        if NAME.match(name) and (d / name / "theme.json").is_file():
            return _read(name, d / name, custom=True)
    folder = BUILT_IN / name
    if not NAME.match(name) or not (folder / "theme.json").is_file():
        raise KeyError(f"unknown theme {name!r} (choose from {', '.join(available(dirs))})")
    return _read(name, folder, custom=False)


def _read(name: str, folder: Traversable, custom: bool) -> Theme:
    try:
        meta = json.loads((folder / "theme.json").read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{folder / 'theme.json'}: invalid JSON: {exc}") from exc
    if not (folder / "style.css").is_file():
        raise ValueError(f"theme {name!r} has no style.css in {folder}")
    docx = meta.get("docx", {})
    if custom:  # Word settings a repo's theme leaves out come from classic.
        docx = _merge(_load(DEFAULT, ()).docx, docx)
    return Theme(
        name=name,
        title=meta.get("title", name),
        description=meta.get("description", ""),
        accent=meta.get("accent"),
        docx=docx,
        folder=folder,
        custom=custom,
    )


def _merge(base: dict, over: dict) -> dict:
    out = dict(base)
    for key, value in over.items():
        out[key] = _merge(out[key], value) if isinstance(value, dict) and isinstance(out.get(key), dict) else value
    return out


def for_context(ctx: dict) -> Theme:
    """The theme a view model (context.build_context) was built for."""
    return load(ctx["theme"], ctx.get("theme_dirs", ()))
