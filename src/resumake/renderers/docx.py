"""Word output built natively with python-docx, so it stays editable in Word."""

from pathlib import Path

from docx import Document
from docx.enum.text import WD_TAB_ALIGNMENT
from docx.opc.constants import RELATIONSHIP_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ACCENT = RGBColor(0x1A, 0x5F, 0xB4)
MUTED = RGBColor(0x5F, 0x63, 0x68)
FONT = "Calibri"


def _add_link(paragraph, text: str, url: str):
    """python-docx has no hyperlink API; build the run XML by hand."""
    r_id = paragraph.part.relate_to(url, RELATIONSHIP_TYPE.HYPERLINK, is_external=True)
    link = OxmlElement("w:hyperlink")
    link.set(qn("r:id"), r_id)
    run = OxmlElement("w:r")
    run_props = OxmlElement("w:rPr")
    color = OxmlElement("w:color")
    color.set(qn("w:val"), "1A5FB4")
    run_props.append(color)
    run.append(run_props)
    t = OxmlElement("w:t")
    t.text = text
    t.set(qn("xml:space"), "preserve")
    run.append(t)
    link.append(run)
    paragraph._p.append(link)


def _text(paragraph, text: str, url: str | None = None, **style):
    if url:
        _add_link(paragraph, text, url)
        return None
    run = paragraph.add_run(text)
    for key, value in style.items():
        if key == "color":
            run.font.color.rgb = value
        elif key == "size":
            run.font.size = value
        else:
            setattr(run, key, value)
    return run


def _bottom_border(paragraph):
    p_pr = paragraph._p.get_or_add_pPr()
    borders = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    for attr, val in (("val", "single"), ("sz", "6"), ("space", "1"), ("color", "D0D4DA")):
        bottom.set(qn(f"w:{attr}"), val)
    borders.append(bottom)
    p_pr.append(borders)


def _spacing(paragraph, before=0, after=0):
    fmt = paragraph.paragraph_format
    fmt.space_before, fmt.space_after = Pt(before), Pt(after)


def render(ctx: dict, out: Path) -> None:
    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Inches(8.5), Inches(11)
    section.left_margin = section.right_margin = Inches(0.7)
    section.top_margin = section.bottom_margin = Inches(0.6)
    text_width = section.page_width - section.left_margin - section.right_margin

    normal = doc.styles["Normal"]
    normal.font.name = FONT
    normal.font.size = Pt(10.5)
    normal.paragraph_format.space_after = Pt(0)
    bullet_style = doc.styles["List Bullet"]
    bullet_style.font.name = FONT

    basics = ctx["basics"]
    p = doc.add_paragraph()
    _text(p, basics["name"], bold=True, size=Pt(22))
    if basics.get("label"):
        p = doc.add_paragraph()
        _text(p, basics["label"], color=ACCENT, size=Pt(12))
    if ctx["contact"]:
        p = doc.add_paragraph()
        _spacing(p, after=4)
        for i, c in enumerate(ctx["contact"]):
            if i:
                _text(p, "  ·  ", color=MUTED)
            _text(p, c["text"], c["url"], color=MUTED)

    for sec in ctx["sections"]:
        h = doc.add_paragraph()
        _spacing(h, before=10, after=4)
        _bottom_border(h)
        _text(h, sec["title"].upper(), bold=True, color=ACCENT, size=Pt(9.5))

        if sec["key"] == "summary":
            doc.add_paragraph(sec["text"])
            continue
        if sec["key"] == "skills":
            for s in sec["entries"]:
                p = doc.add_paragraph()
                _spacing(p, after=1)
                _text(p, f"{s['name']}: ", bold=True)
                _text(p, ", ".join(s["keywords"]))
            continue

        for item in sec["entries"]:
            p = doc.add_paragraph()
            _spacing(p, before=4)
            p.paragraph_format.tab_stops.add_tab_stop(text_width, WD_TAB_ALIGNMENT.RIGHT)
            p.paragraph_format.keep_with_next = True
            if item["title_url"]:
                _add_link(p, item["title"], item["title_url"])
            else:
                _text(p, item["title"], bold=True)
            if item["org"]:
                _text(p, " · ")
                _text(p, item["org"], item["org_url"])
            if item["dates"]:
                _text(p, f"\t{item['dates']}", color=MUTED)
            if item["subtitle"]:
                p = doc.add_paragraph()
                p.paragraph_format.keep_with_next = True
                _text(p, item["subtitle"], italic=True, color=MUTED)
            if item["summary"]:
                doc.add_paragraph(item["summary"])
            for highlight in item["highlights"]:
                _spacing(doc.add_paragraph(highlight, style="List Bullet"))
            if item["keywords"]:
                p = doc.add_paragraph()
                _text(p, " · ".join(item["keywords"]), color=MUTED, size=Pt(9.5))

    doc.core_properties.title = f"{basics['name']} — Resume"
    doc.core_properties.author = basics["name"]
    doc.save(out)
