"""Load resume YAML files, resolving `extends:` inheritance, and validate them."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import jsonschema
import yaml

from resumake import themes
from resumake.errors import ResumeError
from resumake.schema import SCHEMA

YAML_SUFFIXES = {".yml", ".yaml"}


def deep_merge(base: Any, override: Any) -> Any:
    """Merge `override` onto `base`.

    Mappings merge key by key; anything else (lists, scalars) in `override`
    replaces the base value. A key set to `null` in `override` removes it.
    """
    if not (isinstance(base, dict) and isinstance(override, dict)):
        return override
    merged = dict(base)
    for key, value in override.items():
        if value is None:
            merged.pop(key, None)
        elif key in merged:
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _normalize(value: Any) -> Any:
    """YAML parses `2021-03-01` into a date; turn those back into ISO strings."""
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()[:10]
    if isinstance(value, dict):
        return {k: _normalize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_normalize(v) for v in value]
    return value


def _load(path: Path, chain: tuple[Path, ...]) -> dict:
    if path in chain:
        cycle = " -> ".join(str(p) for p in (*chain, path))
        raise ResumeError(f"circular extends: {cycle}")
    if not path.is_file():
        raise ResumeError(f"file not found: {path}")
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        raise ResumeError(f"{path}: invalid YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise ResumeError(f"{path}: top level must be a mapping")

    parents = data.pop("extends", None)
    if parents:
        if isinstance(parents, str):
            parents = [parents]
        base: dict = {}
        for parent in parents:
            base = deep_merge(base, _load((path.parent / parent).resolve(), (*chain, path)))
        data = deep_merge(base, data)
    return _normalize(data)


def load_resume(path: str | Path, validate: bool = True) -> dict:
    """Load a resume, applying any `extends` chain, and validate the result."""
    path = Path(path).resolve()
    data = _load(path, ())
    if validate:
        validate_resume(data, source=path, theme_dirs=theme_dirs(path))
    return data


def theme_dirs(path: Path) -> tuple[Path, ...]:
    """Where the resumes repo holding `path` keeps its own themes, if it has any."""
    found = themes.find_dir(Path(path).resolve().parent)
    return (found,) if found else ()


def validate_resume(data: dict, source: Path | str = "<resume>", theme_dirs: tuple[Path, ...] = ()) -> None:
    validator = jsonschema.Draft202012Validator(SCHEMA)
    errors = sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path))
    lines = [f"  - {'.'.join(str(p) for p in e.absolute_path) or '<root>'}: {_message(e)}" for e in errors]
    # The schema can't list a repo's own themes, so the theme's existence is checked here.
    theme = (data.get("layout") or {}).get("theme")
    if isinstance(theme, str) and not any(e.absolute_path and list(e.absolute_path)[:2] == ["layout", "theme"] for e in errors):
        known = themes.available(theme_dirs)
        if theme not in known:
            lines.append(f"  - layout.theme: unknown theme {theme!r} (choose from {', '.join(known)})")
    if lines:
        raise ResumeError(f"{source}: invalid resume:\n" + "\n".join(lines))


def _message(error: jsonschema.ValidationError) -> str:
    """Make "requires one of these keys" schemas read better than jsonschema's default."""
    options = error.schema.get("anyOf", []) if error.validator == "anyOf" else []
    if options and all(set(o) == {"required"} for o in options):
        keys = " or ".join(repr(k) for o in options for k in o["required"])
        return f"needs {keys}"
    return error.message


@dataclass(frozen=True)
class Variant:
    """A buildable resume file and the name its outputs are written under."""

    path: Path
    name: str


def _is_partial(path: Path, root: Path) -> bool:
    """Files (or folders) starting with `_` are shared fragments, not resumes."""
    return any(part.startswith("_") for part in path.relative_to(root).parts)


def discover(targets: list[str | Path]) -> list[Variant]:
    """Expand files/directories into the list of resume variants to build.

    A variant's name is its path relative to the scanned directory with `/`
    replaced by `-`, e.g. `resumes/tailored/acme.yml` -> `tailored-acme`.
    """
    variants: list[Variant] = []
    for target in targets:
        target = Path(target)
        if target.is_dir():
            files = sorted(p for p in target.rglob("*") if p.suffix in YAML_SUFFIXES)
            for f in files:
                if not _is_partial(f, target):
                    rel = f.relative_to(target).with_suffix("")
                    variants.append(Variant(f, "-".join(rel.parts)))
        elif target.is_file():
            variants.append(Variant(target, target.stem))
        else:
            raise ResumeError(f"no such file or directory: {target}")

    seen: dict[str, Path] = {}
    for v in variants:
        if v.name in seen:
            raise ResumeError(f"two resumes map to output name {v.name!r}: {seen[v.name]}, {v.path}")
        seen[v.name] = v.path
    return variants
