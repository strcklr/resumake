"""Command line interface: `resumake build`, `resumake validate` and `resumake schema`."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from resumake.context import build_context
from resumake.errors import ResumeError
from resumake.loader import discover, load_resume
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


def build(targets: list[str], formats: list[str], out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for variant in discover(targets):
        data = load_resume(variant.path)
        ctx = build_context(data)
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

    v = sub.add_parser("validate", help="check resumes against the schema")
    v.add_argument("targets", nargs="*", default=["resumes"])

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
        if args.command == "build":
            build(args.targets, args.format, args.out)
            return 0
        return validate(args.targets)
    except ResumeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
