"""Loading templates: a theme's own files first, then the shared ones in templates/."""

from importlib.resources import files

from jinja2 import Environment, FunctionLoader

from resumake import themes

_TEMPLATES = files("resumake") / "templates"


def read(name: str) -> str:
    """A shared template (templates/)."""
    return (_TEMPLATES / name).read_text(encoding="utf-8")


def read_theme(theme: str, name: str) -> str:
    """A theme's file, e.g. its style.css."""
    return (themes.load(theme).folder / name).read_text(encoding="utf-8")


def environment(autoescape: bool, theme: str | None = None) -> Environment:
    """Templates come from the theme's folder when it has its own, otherwise from templates/."""

    def load(name: str) -> str:
        if theme is not None:
            own = themes.load(theme).folder / name
            if own.is_file():
                return own.read_text(encoding="utf-8")
        return read(name)

    return Environment(
        loader=FunctionLoader(load),
        autoescape=autoescape,
        trim_blocks=True,
        lstrip_blocks=True,
        keep_trailing_newline=True,
    )
