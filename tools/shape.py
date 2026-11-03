"""What Ferdowsi Let In: shape every line of the Shahnameh, place every word, and keep the Arabic ones.

Each hemistich is shaped with HarfBuzz in Amiri, the font the page draws with, so each word's
place on the line is where the browser puts it. Every word is looked up (tools/tag.py); for
the Arabic ones the page gets the line, the word's left and right edge, and which word it is.
The deaths are the sections whose headings name a killing or a death, and in each of them the
couplets that say it.

  .venv/bin/python tools/shape.py data/shahnameh-ganjoor.json site/data
"""
import json, os, re, sys
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools import subset
sys.path.insert(0, os.path.dirname(__file__))
from tag import norm

FONT = "fonts/Amiri-Regular.ttf"
src, out = sys.argv[1:3]
os.makedirs(out, exist_ok=True)
book = json.load(open(src))
gloss = json.load(open("data/glosses.json"))
keys = json.load(open("data/keys.json"))            # a written word: the form it was put forward as
decided = {}                                        # a form: ar, name or no, decided by hand
for row in open("data/decisions.tsv"):
    if row.startswith("#") or not row.strip(): continue
    form, decision, *note = row.rstrip("\n").split("\t")
    decided[form] = decision
    if note and note[0] and not (gloss.get(form) or ["", ""])[1]:   # my note, where Wiktionary has no sense
        gloss[form] = [(gloss.get(form) or [""])[0], note[0]]

def classify(w):
    """ar, name or None, and the form that decided it"""
    k = keys.get(norm(w.replace("\u200c", "")))
    return decided.get(k), k

def clean(t):
    t = t.replace("ي", "ی").replace("ك", "ک").replace("‏", "").replace("‎", "")
    return re.sub(r"\s+", " ", t).strip()

# ---------- the lines, in reading order ----------

# a heading that names a killing or a death; mourning and news of a death are left to the verses around them
DEATH_TITLE = re.compile(r"کشته شدن|کشتن|قتل|بریدن سر|درگذشت|(?<!از )(?<!بر )(?<!در )مرگ|مردن|بکشت|هلاک|سر بریدن|بر دار|به دار")
DEATH_VERSE = re.compile(r"ببرید سر|جدا کرد سر|سرش را ز تن|برید سرش|بزد گردن|بیفگند خوار|بخستش|بینداختش|جان بپرداخت|جانش برآمد|روانش برآمد|بکشت|بکشتش|بکشتند|کشته شد|کشته گشت|کشته بر|بمرد|بمیرد|بمیرم|جان بداد|جان داد|جان بسپرد|جان سپرد|بپرداخت جای|سر آمد|سرآمد|تابوت|دخمه|بر دار|سرش را ببرید|سرش ببرید|ببرید سر|بریدش سر|تهی ماند جای|گذشته شد|زمانه بدو|روانش برفت")

sections, lines, deaths = [], [], []
def walk(node, sec):
    for p in node["poems"]:
        start = len(lines)
        vs = sorted((v for v in p["verses"] if v["p"] in (0, 1)), key=lambda v: (v["c"], v["p"]))
        for v in vs:
            lines.append(clean(v["t"]))
        title = clean(p["title"])
        sec["poems"].append({"title": title, "url": p["url"], "start": start, "end": len(lines)})
        if DEATH_TITLE.search(title):
            hits = [l for l in range(start, len(lines), 2)
                    if DEATH_VERSE.search(lines[l] + " " + (lines[l + 1] if l + 1 < len(lines) else ""))]
            deaths.append({"poem": [len(sections) - 1, len(sec["poems"]) - 1], "start": start, "end": len(lines), "lines": hits})
    for ch in node["children"]:
        walk(ch, sec)
for b in book["books"]:
    sec = {"title": clean(b["title"]), "slug": b["slug"], "poems": []}
    sections.append(sec)
    walk(b, sec)
print("hemistichs", len(lines), "sections", sum(len(s["poems"]) for s in sections),
      "death sections", len(deaths), "death couplets", sum(len(d["lines"]) for d in deaths))

# ---------- the font, cut down to the letters Ferdowsi uses ----------

text_all = "".join(lines) + "".join(s["title"] for s in sections) + "".join(p["title"] for s in sections for p in s["poems"])
opts = subset.Options(); opts.layout_features = ["*"]; opts.name_IDs = ["*"]; opts.notdef_outline = True
ft = TTFont(FONT); sub = subset.Subsetter(opts); sub.populate(text="".join(sorted(set(text_all + " ۰۱۲۳۴۵۶۷۸۹")))); sub.subset(ft)
ft.flavor = "woff2"; ft.save(os.path.join(out, "hand.woff2"))
ft = TTFont(FONT); upem = ft["head"].unitsPerEm; order = ft.getGlyphOrder(); gs = ft.getGlyphSet()
face = hb.Face(hb.Blob.from_file_path(FONT)); font = hb.Font(face)
bounds = {}
def glyph_bounds(n):
    if n not in bounds:
        bp = BoundsPen(gs); gs[n].draw(bp); bounds[n] = bp.bounds
    return bounds[n]

# ---------- shape, and place every word ----------

forms, form_ix = [], {}
arabic = []            # flat: line, word, left, right (font units from the line's left), form
widths, tops, bottoms, n_words, n_names = [], [], [], 0, 0
for li, text in enumerate(lines):
    b = hb.Buffer(); b.add_str(text); b.direction, b.script, b.language = "rtl", "Arab", "fa"
    hb.shape(font, b)
    spans, i = [], 0      # each word's character span
    for w in text.split(" "):
        spans.append((i, i + len(w), w)); i += len(w) + 1
    ext = [[1e9, -1e9] for _ in spans]
    x = 0; top = bottom = 0
    for info, pos in zip(b.glyph_infos, b.glyph_positions):
        n = order[info.codepoint]
        wi = next((k for k, (a, z, _) in enumerate(spans) if a <= info.cluster < z), None)
        gb = glyph_bounds(n)
        if wi is not None:   # by advance, so the page can set the word alone at its left edge
            ext[wi][0] = min(ext[wi][0], x)
            ext[wi][1] = max(ext[wi][1], x + pos.x_advance)
        if gb:
            top = max(top, gb[3] + pos.y_offset); bottom = min(bottom, gb[1] + pos.y_offset)
        x += pos.x_advance
    widths.append(x); tops.append(top); bottoms.append(bottom)
    for wi, ((a, z, w), (x0, x1)) in enumerate(zip(spans, ext)):
        n_words += 1
        kind, form = classify(w)
        if kind == "name": n_names += 1
        if kind != "ar" or x1 < x0:
            continue
        if form not in form_ix:
            form_ix[form] = len(forms)
            forms.append([form] + (gloss.get(form) or ["", ""]))
        arabic += [li, wi, round(x0), round(x1), form_ix[form]]
n_ar = len(arabic) // 5
print(f"words {n_words:,}, Arabic {n_ar:,} ({n_ar / n_words:.2%}), Arabic forms {len(forms):,}, names of Arabic shape {n_names:,}")

# ---------- write ----------

pct = lambda v, q: sorted(v)[int(len(v) * q)]
top, bottom = pct(tops, .995), pct(bottoms, .005)
page = {"colW": round(pct(widths, .99) / upem + .4, 2), "rowH": round((top - bottom) / upem + .25, 2),
        "base": round(top / upem + .12, 2)}
print("page", page)
json.dump({"upem": upem, "words": n_words, "lines": lines, "widths": widths, "sections": sections, "page": page,
           "arabic": arabic, "forms": forms, "names": n_names, "deaths": deaths},
          open(os.path.join(out, "text.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print("wrote", out)
