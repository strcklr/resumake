"""Command line interface: `resumake build`, `validate`, `themes` and `schema`."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from importlib.resources import as_file
from pathlib import Path

from resumake import themes
from resumake.context import build_context
from resumake.errors import ResumeError
from resumake.loader import discover, load_resume, theme_dirs
from resumake.renderers import RENDERERS
from resumake.schema import SCHEMA


def _formats(value: str) -> list[str]:
    names = [f.strip().lower() for f in value.split(",") if f.strip()]
    if names == ["all"]:
        return list(RENDERERS)
    unknown = [n for n in names if n not in RENDERERS]
    if unknown:
        raise argparse.ArgumentTypeError(
            f"unknown format(s): {', '.join(unknown)} (choose from {', '.join(RENDERERS)}, all)"
        )
    return names


def build(targets: list[str], formats: list[str], out_dir: Path, theme: str | None = None) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for variant in discover(targets):
        data = load_resume(variant.path)
        dirs = theme_dirs(variant.path)
        if theme:  # --theme overrides the file's layout.theme for this build
            if theme not in themes.available(dirs):
                raise ResumeError(f"unknown theme {theme!r} (choose from {', '.join(themes.available(dirs))})")
            data["layout"] = {**data.get("layout", {}), "theme": theme}
        ctx = build_context(data, dirs)
        name = data.get("layout", {}).get("output_name", variant.name)
        for fmt in formats:
            ext, render = RENDERERS[fmt]
            out = out_dir / f"{name}.{ext}"
            render(ctx, out)
            written.append(out)
            print(f"  {variant.path} -> {out}")
    return written


def validate(targets: list[str]) -> int:
    failures = 0
    for variant in discover(targets):
        try:
            load_resume(variant.path)
            print(f"  ok   {variant.path}")
        except ResumeError as exc:
            failures += 1
            print(f"  FAIL {exc}", file=sys.stderr)
    return 1 if failures else 0


def list_themes() -> int:
    found = themes.find_dir(Path.cwd())
    dirs = (found,) if found else ()
    for name in themes.available(dirs):
        t = themes.load(name, dirs)
        default = " (default)" if name == themes.DEFAULT else ""
        accent = f" Default accent {t.accent}; set layout.accent to change it." if t.accent else ""
        where = f" [{t.folder}]" if t.custom else ""
        print(f"  {name:<10}{t.description}{accent}{default}{where}")
    return 0


def new_theme(name: str, base: str) -> Path:
    """Copy a theme into this repo's themes/ folder as a starting point for your own."""
    if not themes.NAME.match(name):
        raise ResumeError(f"theme names use letters, digits, - and _ (got {name!r})")
    found = themes.find_dir(Path.cwd())
    root = found or Path.cwd() / themes.REPO_FOLDER
    dirs = (found,) if found else ()
    if name in themes.available(dirs):
        raise ResumeError(f"there is already a theme called {name!r}")
    if base not in themes.available(dirs):
        raise ResumeError(f"unknown theme {base!r} (choose from {', '.join(themes.available(dirs))})")
    source = themes.load(base, dirs)
    target = root / name
    with as_file(source.folder) as folder:
        shutil.copytree(folder, target, ignore=shutil.ignore_patterns("__pycache__"))
    meta = json.loads((target / "theme.json").read_text(encoding="utf-8"))
    meta.update(title=name.replace("-", " ").replace("_", " ").title(), description=f"Based on {source.title}.")
    (target / "theme.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"  created {target} from {base}. Set `layout.theme: {name}` to use it.")
    return target


def schema_json() -> str:
    """The resume JSON Schema, as written to web/src/lib/schema.json."""
    return json.dumps(SCHEMA, indent=2, ensure_ascii=False) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="resumake", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    b = sub.add_parser("build", help="render resumes to output formats")
    b.add_argument("targets", nargs="*", default=["resumes"], help="resume files or directories (default: resumes/)")
    b.add_argument("-f", "--format", type=_formats, default=list(RENDERERS),
                   help=f"comma-separated formats: {', '.join(RENDERERS)} or all (default: all)")
    b.add_argument("-o", "--out", type=Path, default=Path("dist"), help="output directory (default: dist/)")
    b.add_argument("-t", "--theme",
                   help="theme for this build, overriding the files' layout.theme (see `resumake themes`)")

    v = sub.add_parser("validate", help="check resumes against the schema")
    v.add_argument("targets", nargs="*", default=["resumes"])

    t = sub.add_parser("themes", help="list the available themes (built-in and this repo's themes/)")
    t_sub = t.add_subparsers(dest="themes_command")
    n = t_sub.add_parser("new", help="copy a theme into this repo's themes/ folder to make your own")
    n.add_argument("name", help="the new theme's name (its folder name, and the value for layout.theme)")
    n.add_argument("--from", dest="base", default=themes.DEFAULT, help=f"the theme to copy (default: {themes.DEFAULT})")

    s = sub.add_parser("schema", help="print the resume JSON Schema (used by the web editor)")
    s.add_argument("-o", "--out", type=Path, help="write to this file instead of stdout")

    args = parser.parse_args(argv)
    try:
        if args.command == "schema":
            if args.out:
                args.out.write_text(schema_json(), encoding="utf-8")
            else:
                sys.stdout.write(schema_json())
            return 0
        if args.command == "themes":
            if args.themes_command == "new":
                new_theme(args.name, args.base)
                return 0
            return list_themes()
        if args.command == "build":
            build(args.targets, args.format, args.out, args.theme)
            return 0
        return validate(args.targets)
    except ResumeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
