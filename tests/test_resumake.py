from pathlib import Path

import pytest
import yaml
from docx import Document

from resumake.cli import main
from resumake.context import build_context, date_range, format_date
from resumake.errors import ResumeError
from resumake.loader import deep_merge, discover, load_resume
from resumake.renderers import html, markdown

ROOT = Path(__file__).resolve().parents[1]
RESUMES = ROOT / "resumes"


def write(path: Path, data: dict) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data), encoding="utf-8")
    return path


# --- merging & inheritance -------------------------------------------------

def test_deep_merge_rules():
    base = {"a": {"x": 1, "y": 2}, "list": [1, 2], "gone": True}
    over = {"a": {"y": 3}, "list": [9], "gone": None}
    assert deep_merge(base, over) == {"a": {"x": 1, "y": 3}, "list": [9]}


def test_extends_chain(tmp_path):
    write(tmp_path / "_base.yml", {"basics": {"name": "A", "label": "Base"}, "skills": [{"name": "S"}]})
    write(tmp_path / "mid.yml", {"extends": "_base.yml", "basics": {"label": "Mid"}})
    leaf = write(tmp_path / "sub" / "leaf.yml", {"extends": "../mid.yml", "skills": None})
    data = load_resume(leaf)
    assert data == {"basics": {"name": "A", "label": "Mid"}}


def test_circular_extends(tmp_path):
    write(tmp_path / "a.yml", {"extends": "b.yml", "basics": {"name": "A"}})
    write(tmp_path / "b.yml", {"extends": "a.yml"})
    with pytest.raises(ResumeError, match="circular"):
        load_resume(tmp_path / "a.yml")


def test_validation_reports_path(tmp_path):
    f = write(tmp_path / "bad.yml", {"basics": {"name": "A"}, "work": [{"company": "X"}]})
    with pytest.raises(ResumeError, match="work.0: needs 'position' or 'roles'"):
        load_resume(f)


def test_yaml_dates_are_normalized(tmp_path):
    f = tmp_path / "r.yml"
    f.write_text("basics: {name: A}\nwork: [{company: C, position: P, start: 2020-02-01}]\n")
    assert load_resume(f)["work"][0]["start"] == "2020-02-01"


def test_discover_skips_partials_and_names_variants(tmp_path):
    write(tmp_path / "default.yml", {})
    write(tmp_path / "_shared.yml", {})
    write(tmp_path / "_fragments" / "x.yml", {})
    write(tmp_path / "tailored" / "acme.yml", {})
    assert [v.name for v in discover([tmp_path])] == ["default", "tailored-acme"]


# --- view model ------------------------------------------------------------

@pytest.mark.parametrize(
    "value, expected",
    [("2021-03", "Mar 2021"), ("2021-03-15", "Mar 2021"), (2019, "2019"), ("present", "Present"), (None, "")],
)
def test_format_date(value, expected):
    assert format_date(value) == expected


def test_date_range_open_ended():
    assert date_range({"start": "2021-06"}) == "Jun 2021 – Present"
    assert date_range({"start": "2020", "end": "2020"}) == "2020"
    assert date_range({}) == ""


def test_layout_controls_order_and_titles():
    data = {
        "basics": {"name": "A", "summary": "Hi"},
        "skills": [{"name": "Go"}],
        "work": [{"company": "C", "position": "P"}],
        "layout": {"sections": ["skills", "work"], "titles": {"work": "Career"}},
    }
    ctx = build_context(data)
    assert [(s["key"], s["title"]) for s in ctx["sections"]] == [("skills", "Skills"), ("work", "Career")]


# --- renderers -------------------------------------------------------------

def test_html_escapes_content():
    ctx = build_context({"basics": {"name": "<script>x</script>"}})
    assert "<script>x" not in html.render_string(ctx)


def test_tailored_variant_overrides_default():
    data = load_resume(RESUMES / "tailored" / "example-platform.yml")
    md = markdown.render_string(build_context(data))
    assert "**Backend & Platform Engineer**" in md
    assert "## Projects" not in md
    assert md.index("## Professional Experience") < md.index("## Skills")
    assert "Example Co" not in md  # the job block is never rendered


def test_grouped_roles_and_skill_groups():
    data = {
        "basics": {"name": "A"},
        "work": [{"company": "Co", "location": "MN", "roles": [
            {"position": "Senior", "start": "2022-08"},
            {"position": "Junior", "start": "2021-06", "end": "2022-08", "highlights": ["Did x"]},
        ]}],
        "skills": [{"name": "Lang", "keywords": [["Kotlin", "Java"], ["C++"]], "note": "mostly backend"}],
    }
    ctx = build_context(data)
    work = ctx["sections"][0]["entries"][0]
    assert (work["title"], work["org"]) == ("Co", "MN")
    assert [(r["title"], r["dates"]) for r in work["roles"]] == [
        ("Senior", "Aug 2022 – Present"), ("Junior", "Jun 2021 – Aug 2022")]
    assert ctx["sections"][1]["entries"][0]["text"] == "Kotlin, Java\u00a0 |\u00a0 C++ — mostly backend"


def test_work_and_role_keywords_validate_but_are_not_rendered(tmp_path):
    f = write(tmp_path / "r.yml", {
        "basics": {"name": "A"},
        "work": [
            {"company": "Solo", "position": "Dev", "keywords": ["Zigzag"]},
            {"company": "Co", "roles": [{"position": "Senior", "keywords": ["Quokka", "Flurb"]}]},
        ],
    })
    ctx = build_context(load_resume(f))
    for out in (html.render_string(ctx), markdown.render_string(ctx)):
        for value in ("Zigzag", "Quokka", "Flurb"):
            assert value not in out
    assert main(["build", str(f), "-f", "docx", "-o", str(tmp_path / "out")]) == 0
    text = "\n".join(p.text for p in Document(tmp_path / "out" / "r.docx").paragraphs)
    assert "Quokka" not in text


def test_build_all_formats(tmp_path):
    assert main(["build", str(RESUMES), "-o", str(tmp_path)]) == 0
    for name in ("default", "tailored-example-platform"):
        for ext in ("pdf", "docx", "html", "md"):
            assert (tmp_path / f"{name}.{ext}").stat().st_size > 0
    assert (tmp_path / "default.pdf").read_bytes().startswith(b"%PDF")
    text = "\n".join(p.text for p in Document(tmp_path / "default.docx").paragraphs)
    assert "Acme Analytics" in text


def test_sample_resumes_validate():
    assert main(["validate", str(RESUMES)]) == 0


def test_job_block_is_never_rendered(tmp_path):
    f = write(tmp_path / "r.yml", {
        "basics": {"name": "A"},
        "job": {"title": "Secret Role", "url": "https://jobs.example/123",
                "description": "Posting text", "notes": "private"},
    })
    ctx = build_context(load_resume(f))
    for out in (html.render_string(ctx), markdown.render_string(ctx)):
        for value in ("Secret Role", "jobs.example", "Posting text", "private"):
            assert value not in out
    assert main(["build", str(f), "-f", "docx", "-o", str(tmp_path / "out")]) == 0
    text = "\n".join(p.text for p in Document(tmp_path / "out" / "r.docx").paragraphs)
    assert "Secret Role" not in text


def test_job_block_rejects_unknown_keys(tmp_path):
    f = write(tmp_path / "r.yml", {"basics": {"name": "A"}, "job": {"link": "x"}})
    with pytest.raises(ResumeError, match="job"):
        load_resume(f)


def test_project_tech_stack_is_subtitle():
    ctx = build_context({"basics": {"name": "A"}, "projects": [
        {"name": "P", "url": "https://x.dev", "keywords": ["Go", "DynamoDB"], "start": 2020, "end": 2021}]})
    entry = ctx["sections"][0]["entries"][0]
    assert (entry["subtitle"], entry["keywords"], entry["dates"]) == ("Go, DynamoDB", [], "2020 – 2021")


# --- web editor schema -----------------------------------------------------

def test_web_schema_is_in_sync():
    """The web editor validates against a copy of SCHEMA; regenerate it if this fails:
    `resumake schema -o web/src/lib/schema.json`."""
    from resumake.cli import schema_json

    committed = (ROOT / "web" / "src" / "lib" / "schema.json").read_text(encoding="utf-8")
    assert committed == schema_json()


# --- extends cases shared with the web editor --------------------------------

EXTENDS_CASES = sorted(p for p in (ROOT / "tests" / "fixtures" / "extends").iterdir() if p.is_dir())


@pytest.mark.parametrize("case", EXTENDS_CASES, ids=lambda p: p.name)
def test_shared_extends_cases(case):
    import json

    expected = json.loads((case / "expected.json").read_text(encoding="utf-8"))
    entry = case / expected["entry"]
    if "error" in expected:
        pattern = {"circular": "circular extends", "not found": "file not found"}[expected["error"]]
        with pytest.raises(ResumeError, match=pattern):
            load_resume(entry, validate=False)
    else:
        assert load_resume(entry, validate=False) == expected["data"]


# --- themes ------------------------------------------------------------------

from resumake import themes  # noqa: E402
from resumake.context import build_context as _ctx  # noqa: E402


def _with_layout(**layout):
    data = load_resume(RESUMES / "default.yml")
    return {**data, "layout": {**data.get("layout", {}), **layout}}


def test_themes_are_listed_classic_first():
    assert themes.available() == ["classic", "compact", "modern"]
    for name in themes.available():
        t = themes.load(name)
        assert t.title and t.description and t.docx["font"]


def test_classic_is_the_default():
    assert _ctx(load_resume(RESUMES / "default.yml"))["theme"] == "classic"
    assert "Georgia" in html.render_string(_ctx(load_resume(RESUMES / "default.yml")))


def test_theme_and_accent_are_validated(tmp_path):
    bad_theme = write(tmp_path / "a.yml", {"basics": {"name": "A"}, "layout": {"theme": "fancy"}})
    with pytest.raises(ResumeError, match="layout.theme"):
        load_resume(bad_theme)
    bad_accent = write(tmp_path / "b.yml", {"basics": {"name": "A"}, "layout": {"accent": "teal"}})
    with pytest.raises(ResumeError, match="layout.accent"):
        load_resume(bad_accent)


def test_accent_applies_only_to_themes_with_colour():
    modern = _ctx(_with_layout(theme="modern"))
    assert modern["accent"] == "#0f766e"  # the theme's default
    assert "--accent: #4338ca" in html.render_string(_ctx(_with_layout(theme="modern", accent="#4338ca")))
    compact = _ctx(_with_layout(theme="compact", accent="#4338ca"))
    assert compact["accent"] is None
    assert "#4338ca" not in html.render_string(compact)


def test_theme_is_inherited_through_extends(tmp_path):
    write(tmp_path / "default.yml", {"basics": {"name": "A"}, "layout": {"theme": "modern", "accent": "#123456"}})
    leaf = write(tmp_path / "tailored" / "x.yml", {"extends": "../default.yml", "layout": {"accent": "#abcdef"}})
    ctx = _ctx(load_resume(leaf))
    assert (ctx["theme"], ctx["accent"]) == ("modern", "#abcdef")


@pytest.mark.parametrize("theme", ["classic", "modern", "compact"])
def test_every_theme_builds_every_format(tmp_path, theme):
    assert main(["build", str(RESUMES / "default.yml"), "-t", theme, "-o", str(tmp_path)]) == 0
    assert (tmp_path / "default.pdf").read_bytes().startswith(b"%PDF")
    page = (tmp_path / "default.html").read_text(encoding="utf-8")
    assert {"classic": "Georgia", "modern": "Inter", "compact": "Source Sans 3"}[theme] in page
    docx_font = Document(tmp_path / "default.docx").styles["Normal"].font.name
    assert docx_font == themes.load(theme).docx["font"]


def test_cli_lists_themes(capsys):
    assert main(["themes"]) == 0
    out = capsys.readouterr().out
    assert "classic" in out and "modern" in out and "compact" in out and "(default)" in out
