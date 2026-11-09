"""Word output built natively with python-docx, so it stays editable in Word.

The look follows the theme's ``docx`` settings in its theme.json (font, colours, sizes, header
alignment, heading style), approximating its HTML/PDF stylesheet. Word uses fonts installed on the
reader's computer, so themes name a widely installed font here rather than their bundled web font.
"""

from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.opc.constants import RELATIONSHIP_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor, Twips

from resumake import themes

SEP = "  —  "

# The theme's settings for the document being built (set by render()).
_style: dict = {}


def _rgb(hex6: str) -> RGBColor:
    return RGBColor.from_string(hex6.lstrip("#").upper())


def _color(name: str) -> RGBColor:
    """A theme colour by role: ink, text, muted or accent."""
    return _style["colors"][name]


def _style_run(run, size=None, color=None, bold=False, italic=False, underline=False, spacing=0):
    font = _style["font"]
    run.font.name = font
    run.font.size = size or _style["body"]
    run.font.color.rgb = color or _color("text")
    run.bold, run.italic, run.underline = bold, italic, underline
    # East-Asian/complex-script slots too, so Word never substitutes another font.
    r_pr = run._r.get_or_add_rPr()
    fonts = r_pr.get_or_add_rFonts()
    for attr in ("w:eastAsia", "w:cs"):
        fonts.set(qn(attr), font)
    if spacing:
        sp = OxmlElement("w:spacing")
        sp.set(qn("w:val"), str(round(spacing * 20)))  # twentieths of a point
        r_pr.append(sp)
    return run


def _text(paragraph, text, **style):
    return _style_run(paragraph.add_run(text), **style)


def _link(paragraph, text, url, **style):
    """python-docx has no hyperlink API: add a normal run, then wrap it in <w:hyperlink>."""
    run = _text(paragraph, text, **{"color": _color("ink"), "underline": True, **style})
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


def _bottom_border(paragraph, color="000000"):
    p_pr = paragraph._p.get_or_add_pPr()
    borders = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    for attr, val in (("val", "single"), ("sz", "4"), ("space", "1"), ("color", color.lstrip("#").upper())):
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


def _load_style(ctx: dict) -> dict:
    """The theme's docx settings, with colours as RGBColor and the accent filled in."""
    settings = themes.load(ctx["theme"]).docx
    colors = {k: _rgb(v) for k, v in settings["colors"].items()}
    colors["accent"] = _rgb(ctx["accent"]) if ctx.get("accent") else colors["ink"]
    return {**settings, "colors": colors, "body": Pt(settings["body_size"])}


def render(ctx: dict, out: Path) -> None:
    global _style
    _style = _load_style(ctx)
    st = _style
    head, heading, role_style = st["header"], st["heading"], st["role"]
    align = WD_ALIGN_PARAGRAPH.CENTER if head["align"] == "center" else WD_ALIGN_PARAGRAPH.LEFT
    INK, MUTED = _color("ink"), _color("muted")

    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Inches(8.5), Inches(11)
    for side in ("left_margin", "right_margin", "top_margin", "bottom_margin"):
        setattr(section, side, Inches(st["margin"]))
    text_width = section.page_width - section.left_margin - section.right_margin

    normal = doc.styles["Normal"]
    normal.font.name = st["font"]
    normal.font.size = st["body"]
    normal.paragraph_format.space_after = Pt(0)
    normal.paragraph_format.line_spacing = 1.0
    doc.styles["List Bullet"].font.name = st["font"]

    basics = ctx["basics"]
    p = _para(doc, after=2, align=align)
    _text(p, basics["name"], size=Pt(head["name_size"]), color=INK, bold=True)
    if basics.get("label"):
        p = _para(doc, after=2, align=align)
        _text(p, basics["label"], size=Pt(head["label_size"]), color=_color(head["label_color"]))
    if ctx["contact"]:
        p = _para(doc, after=9, align=align)
        for i, c in enumerate(ctx["contact"]):
            if i:
                _text(p, head["contact_separator"], color=MUTED)
            if c["url"]:
                _link(p, c["text"], c["url"])
            else:
                _text(p, c["text"], color=MUTED)

    for sec in ctx["sections"]:
        h = _para(doc, before=12, after=3)
        h.paragraph_format.keep_with_next = True
        if heading.get("rule"):
            _bottom_border(h, heading["rule"])
        _text(h, sec["title"].upper(), size=Pt(heading["size"]), color=_color(heading["color"]), bold=True, spacing=heading["spacing"])

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
            title_size, org_size = (Pt(10), st["body"]) if education else (Pt(11), Pt(10))
            p = _dated_heading(doc, text_width, before=5 if education else 9, after=1)
            _maybe_link(p, item["title"], item["title_url"], size=title_size, color=INK, bold=True)
            if item["org"]:
                _text(p, SEP, size=org_size, color=MUTED)
                _maybe_link(p, item["org"], item["org_url"], size=org_size, color=MUTED)
            if item["dates"]:
                _text(p, f"\t{item['dates']}", color=MUTED, italic=st["dates_italic"])
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
                _text(p, role["title"], size=Pt(10), bold=True, italic=role_style["italic"], color=_color(role_style["color"]))
                if role["dates"]:
                    _text(p, f"\t{role['dates']}", color=MUTED, italic=st["dates_italic"])
                if role["subtitle"]:
                    _body(doc, role["subtitle"], before=0, after=1)
                if role["summary"]:
                    _body(doc, role["summary"])
                for highlight in role["highlights"]:
                    _bullet(doc, highlight)

    doc.core_properties.title = f"{basics['name']} — Resume"
    doc.core_properties.author = basics["name"]
    doc.save(out)
