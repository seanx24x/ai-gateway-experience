#!/usr/bin/env python3
"""Generate Sean's editable one-page AI Gateway overview.

Usage: python generate.py [--font /path/to/Geist-Regular.ttf]
Requires: reportlab. Uses --font, local fonts/Geist-Regular.ttf, or Helvetica as a fallback.
Content and URLs are editable in content.json beside this script.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parent
BUNDLED_FONT = ROOT / 'fonts' / 'Geist-Regular.ttf'
parser = argparse.ArgumentParser()
parser.add_argument('--font', type=Path)
args = parser.parse_args()
font_path = args.font or BUNDLED_FONT
font = 'Helvetica'
if font_path.is_file():
    pdfmetrics.registerFont(TTFont('Geist', str(font_path)))
    font = 'Geist'
data = json.loads((ROOT / 'content.json').read_text())
output = ROOT / 'Sean_Lynch_AI_Gateway_Overview.pdf'
width, height = 612, 792
margin, inner = 46, 520
black, muted, line = HexColor('#171717'), HexColor('#666666'), HexColor('#e5e5e5')
c = canvas.Canvas(str(output), pagesize=(width, height), pageCompression=1)
c.setTitle('AI Gateway: from first request to a system you understand')
c.setAuthor('Sean Lynch')
c.setSubject('Independent AI Gateway design and engineering concept')


def text(x, y, value, size=10, color=black):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawString(x, y, value)


def paragraph(value, x, y, w, size=10.35, leading=14.9, color=black):
    style = ParagraphStyle('copy', fontName=font, fontSize=size, leading=leading,
                           textColor=color, alignment=TA_LEFT, spaceAfter=0,
                           allowWidows=0, allowOrphans=0)
    p = Paragraph(escape(value), style)
    _, h = p.wrap(w, height)
    p.drawOn(c, x, y - h)
    return y - h


def rule(y):
    c.setStrokeColor(line)
    c.setLineWidth(.6)
    c.line(margin, y, width-margin, y)

# One neutral editorial surface; intentional grid shared by every section.
text(margin, 750, data['product'], size=11)
c.setFillColor(muted)
c.setFont(font, 9)
c.drawRightString(width-margin, 750, data['category'])
rule(733)
y = 697
for title_line in data['title']:
    text(margin, y, title_line, size=30.5)
    y -= 35
text(margin, y + 8, data['author'], size=10.1, color=muted)
y = paragraph(data['intro'], margin, y - 14, inner, size=11.15, leading=16.1)
y -= 20

# Narrow label column creates scan points without repeated cards.
label_width, body_x = 114, margin + 138
for section in data['sections']:
    rule(y)
    y -= 14
    paragraph(section['label'], margin, y, label_width, size=9.6, leading=13.4)
    bottom = paragraph(section['body'], body_x, y, inner-138,
                       size=9.85, leading=14.15)
    y = bottom - 14

# Compact review invitation; links are explicit and clickable in every PDF viewer.
rule(y)
y -= 15
y = paragraph(data['walkthrough'], margin, y, inner, size=9.7, leading=14.1,
              color=muted)
y -= 20
if y < 50:
    raise RuntimeError(f'Content overruns the one-page composition: link baseline {y:.1f}')
text(margin, y, data['review_label'], size=10)
text(margin+306, y, data['repository_label'], size=10)
review_small = data['review_url'].replace('https://', '')
repo_small = data['repository_url'].replace('https://', '')
text(margin, y-14, review_small, size=7.6, color=muted)
text(margin+306, y-14, repo_small, size=7.1, color=muted)
c.linkURL(data['review_url'], (margin,y-18,margin+287,y+12), relative=0, thickness=0)
c.linkURL(data['repository_url'], (margin+306,y-18,width-margin,y+12), relative=0, thickness=0)
c.showPage()
c.save()
print(output)
print(f'Final link baseline: {y:.1f} pt')
print(f'Word count: {sum(len(str(v).split()) for v in [data["intro"], data["walkthrough"], *[s["body"] for s in data["sections"]]])}')
