"""Word output built natively with python-docx, so it stays editable in Word.

Formatting mirrors the HTML/PDF stylesheet: Georgia, centered header,
uppercase section headings over a thin black rule, right-aligned dates.
"""

from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.opc.constants import RELATIONSHIP_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor, Twips

FONT = "Georgia"
INK = RGBColor(0x00, 0x00, 0x00)
TEXT = RGBColor(0x22, 0x22, 0x22)
MUTED = RGBColor(0x44, 0x44, 0x44)
BODY = Pt(9.5)
SEP = "  —  "


def _style_run(run, size=BODY, color=TEXT, bold=False, italic=False, underline=False):
    run.font.name = FONT
    run.font.size = size
    run.font.color.rgb = color
    run.bold, run.italic, run.underline = bold, italic, underline
    # East-Asian/complex-script slots too, so Word never substitutes another font.
    fonts = run._r.get_or_add_rPr().get_or_add_rFonts()
    for attr in ("w:eastAsia", "w:cs"):
        fonts.set(qn(attr), FONT)
    return run


def _text(paragraph, text, **style):
    return _style_run(paragraph.add_run(text), **style)


def _link(paragraph, text, url, **style):
    """python-docx has no hyperlink API: add a normal run, then wrap it in <w:hyperlink>."""
    run = _text(paragraph, text, **{"color": INK, "underline": True, **style})
    r_id = paragraph.part.relate_to(url, RELATIONSHIP_TYPE.HYPERLINK, is_external=True)
    link = OxmlElement("w:hyperlink")
    link.set(qn("r:id"), r_id)
    run._r.addprevious(link)
    link.append(run._r)


def _maybe_link(paragraph, text, url, **style):
    if url:
        _link(paragraph, text, url, **style)
    else:
        _text(paragraph, text, **style)


def _para(doc, before=0, after=0, align=None, style=None):
    p = doc.add_paragraph(style=style)
    fmt = p.paragraph_format
    fmt.space_before, fmt.space_after = Pt(before), Pt(after)
    if align is not None:
        p.alignment = align
    return p


def _bottom_border(paragraph):
    p_pr = paragraph._p.get_or_add_pPr()
    borders = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    for attr, val in (("val", "single"), ("sz", "4"), ("space", "1"), ("color", "000000")):
        bottom.set(qn(f"w:{attr}"), val)
    borders.append(bottom)
    p_pr.append(borders)


def _dated_heading(doc, text_width, before, after):
    p = _para(doc, before=before, after=after)
    p.paragraph_format.tab_stops.add_tab_stop(text_width, WD_TAB_ALIGNMENT.RIGHT)
    p.paragraph_format.keep_with_next = True
    return p


def _bullet(doc, text):
    p = _para(doc, before=1.5, after=1.5, style="List Bullet")
    p.paragraph_format.left_indent = Twips(440)
    p.paragraph_format.first_line_indent = Twips(-260)
    _text(p, text)


def _body(doc, text, before=2, after=2):
    _text(_para(doc, before=before, after=after), text)


def render(ctx: dict, out: Path) -> None:
    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Inches(8.5), Inches(11)
    for side in ("left_margin", "right_margin", "top_margin", "bottom_margin"):
        setattr(section, side, Inches(0.75))
    text_width = section.page_width - section.left_margin - section.right_margin

    normal = doc.styles["Normal"]
    normal.font.name = FONT
    normal.font.size = BODY
    normal.paragraph_format.space_after = Pt(0)
    normal.paragraph_format.line_spacing = 1.0
    doc.styles["List Bullet"].font.name = FONT

    basics = ctx["basics"]
    p = _para(doc, after=2, align=WD_ALIGN_PARAGRAPH.CENTER)
    _text(p, basics["name"], size=Pt(28), color=INK, bold=True)
    if basics.get("label"):
        p = _para(doc, after=2, align=WD_ALIGN_PARAGRAPH.CENTER)
        _text(p, basics["label"], size=Pt(11))
    if ctx["contact"]:
        p = _para(doc, after=9, align=WD_ALIGN_PARAGRAPH.CENTER)
        for i, c in enumerate(ctx["contact"]):
            if i:
                _text(p, "  •  ", color=MUTED)
            if c["url"]:
                _link(p, c["text"], c["url"])
            else:
                _text(p, c["text"], color=MUTED)

    for sec in ctx["sections"]:
        h = _para(doc, before=12, after=3)
        h.paragraph_format.keep_with_next = True
        _bottom_border(h)
        _text(h, sec["title"].upper(), size=Pt(10), color=INK, bold=True)

        if sec["key"] == "summary":
            _body(doc, sec["text"], before=4, after=4)
            continue
        if sec["key"] == "skills":
            for s in sec["entries"]:
                p = _para(doc, before=1.5, after=1.5)
                _text(p, f"{s['name']}: ", color=INK, bold=True)
                _text(p, s["text"])
            continue

        education = sec["key"] == "education"
        for item in sec["entries"]:
            title_size, org_size = (Pt(10), BODY) if education else (Pt(11), Pt(10))
            p = _dated_heading(doc, text_width, before=5 if education else 9, after=1)
            _maybe_link(p, item["title"], item["title_url"], size=title_size, color=INK, bold=True)
            if item["org"]:
                _text(p, SEP, size=org_size, color=MUTED)
                _maybe_link(p, item["org"], item["org_url"], size=org_size, color=MUTED)
            if item["dates"]:
                _text(p, f"\t{item['dates']}", color=MUTED, italic=True)
            if item["subtitle"]:
                _body(doc, item["subtitle"], before=0, after=4 if education else 1)
            if item["summary"]:
                _body(doc, item["summary"])
            for highlight in item["highlights"]:
                _bullet(doc, highlight)
            if item["keywords"]:
                _text(_para(doc, after=2), " · ".join(item["keywords"]), color=MUTED)

            for role in item["roles"]:
                p = _dated_heading(doc, text_width, before=3, after=2)
                _text(p, role["title"], size=Pt(10), bold=True, italic=True)
                if role["dates"]:
                    _text(p, f"\t{role['dates']}", color=MUTED, italic=True)
                if role["subtitle"]:
                    _body(doc, role["subtitle"], before=0, after=1)
                if role["summary"]:
                    _body(doc, role["summary"])
                for highlight in role["highlights"]:
                    _bullet(doc, highlight)

    doc.core_properties.title = f"{basics['name']} — Resume"
    doc.core_properties.author = basics["name"]
    doc.save(out)
