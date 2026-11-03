"""How a written word of the Shahnameh is read: its spelling evened out (norm), and the forms
it might be once Persian endings and an attached preposition are taken off (candidates)."""
import re

HARAKAT = re.compile("[ً-ٰٟ]")
SUFFIXES = sorted("ها های هایی هاش هاشان ان انی ای ی یی ئی ش ت م مان تان شان ست اند ام ایم اید یم ید یش یت یم".split(), key=len, reverse=True)
PREFIXES = ["همی", "می", "ب", "ن", "بی"]

def norm(w):
    w = HARAKAT.sub("", w).replace("ك", "ک").replace("ي", "ی").replace("ى", "ی")
    return w.replace("أ", "ا").replace("إ", "ا").replace("ٱ", "ا").replace("ة", "ه").replace("ۀ", "ه")

def candidates(w):
    """the forms a written word might be, most literal first"""
    yield w, "as written"
    for s in SUFFIXES:
        if w.endswith(s) and len(w) - len(s) >= 2:
            yield w[:-len(s)], "-" + s
    for p in PREFIXES:
        if w.startswith(p) and len(w) - len(p) >= 3:
            r = w[len(p):]
            yield r, p + "-"
            for s in SUFFIXES:
                if r.endswith(s) and len(r) - len(s) >= 2:
                    yield r[:-len(s)], p + "- -" + s
