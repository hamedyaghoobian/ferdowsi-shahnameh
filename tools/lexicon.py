"""Build data/lexicon.json from the Wiktionary (kaikki.org) Persian dump.

For each written form, the origins Wiktionary gives it: "ar" when an etymology says the word
was borrowed or derived from Arabic, "ir" when it says the word was inherited from an older
Iranian language (Middle Persian, Old Persian, Proto-Iranian ...). A form can have both, when
two different words share a spelling (دین: Arabic dīn, Middle Persian dēn).
"""
import json, re, sys
from collections import defaultdict

BORROW = {"bor", "bor+", "lbor", "der", "der+", "ubor", "borrowed", "unadapted borrowing", "uder"}
INHERIT = {"inh", "inh+", "der", "der+", "uder", "bor", "bor+"}
IRANIAN = {"pal", "peo", "ira-pro", "iir-pro", "ine-pro", "xpr", "ae", "sog", "xbc", "fa-cls", "ira"}
HARAKAT = re.compile("[ً-ٰٟ]")

def norm(w):
    w = HARAKAT.sub("", w).replace("‌", "").replace("ك", "ک").replace("ي", "ی").replace("ى", "ی")
    return w.replace("أ", "ا").replace("إ", "ا").replace("ٱ", "ا").replace("ة", "ه").replace("ۀ", "ه").strip()

def origins(e):
    o = set()
    for t in e.get("etymology_templates") or []:
        src = t.get("args", {}).get("2", "")
        if t["name"] in BORROW and src == "ar":
            o.add("ar")
        elif t["name"] in INHERIT and src in IRANIAN:
            o.add("ir")
    # only the first-listed source counts as the origin: "from Middle Persian ..., compare Arabic" is Iranian
    return o

lex = defaultdict(set)
gloss = {}   # an Arabic form: its romanization and first sense, for the page
for line in open(sys.argv[1]):
    e = json.loads(line)
    if e.get("pos") == "name":          # proper names are left out, as Moïnfar left them out
        continue
    o = origins(e)
    if not o:
        continue
    if "ar" in o and "ir" in o:      # one entry naming both: take the first template that decides
        for t in e["etymology_templates"]:
            src = t.get("args", {}).get("2", "")
            if src == "ar" and t["name"] in BORROW: o = {"ar"}; break
            if src in IRANIAN and t["name"] in INHERIT: o = {"ir"}; break
    forms = {e["word"]} | {f["form"] for f in e.get("forms") or [] if f.get("form") and not set(f.get("tags", [])) & {"romanization", "transliteration"}}
    rom = next((f["form"] for f in e.get("forms") or [] if "romanization" in f.get("tags", [])), "")
    sense = next((g for s in e.get("senses") or [] for g in s.get("glosses") or []), "")
    for f in forms:
        f = norm(f)
        if f and re.fullmatch("[؀-ۿ]+", f):
            lex[f] |= o
            if o == {"ar"} and f not in gloss:
                gloss[f] = [rom, sense]
json.dump({k: sorted(v) for k, v in sorted(lex.items())}, open(sys.argv[2], "w"), ensure_ascii=False, indent=0)
json.dump(gloss, open(sys.argv[2].replace("lexicon", "glosses"), "w"), ensure_ascii=False, indent=0)
ar = sum(v == {"ar"} for v in lex.values()); ir = sum(v == {"ir"} for v in lex.values()); both = sum(len(v) == 2 for v in lex.values())
print(f"{len(lex)} forms: {ar} Arabic, {ir} Iranian, {both} both", file=sys.stderr)
