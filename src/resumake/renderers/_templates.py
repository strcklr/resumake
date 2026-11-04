from importlib.resources import files

from jinja2 import Environment, FunctionLoader

_TEMPLATES = files("resumake") / "templates"


def read(name: str) -> str:
    return (_TEMPLATES / name).read_text(encoding="utf-8")


def environment(autoescape: bool) -> Environment:
    return Environment(
        loader=FunctionLoader(read),
        autoescape=autoescape,
        trim_blocks=True,
        lstrip_blocks=True,
        keep_trailing_newline=True,
    )
