"""Find the Arabic words in the Shahnameh.

Every word of every hemistich is looked up in data/lexicon.json (from Wiktionary), first as
written, then with Persian endings taken off, then without an attached preposition. A word is
Arabic when the form that matches is recorded only as borrowed from Arabic. Words in
data/supplement.json are decided by hand: Arabic words Wiktionary lacks, and native words it
gets wrong. Writes data/tagged.json and prints what it found, for checking.
"""
import json, re, sys, random
from collections import Counter

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

def classify(word, lex, sup):
    parts = [p for p in word.split("‌") if p] or [word]
    for part in [word.replace("‌", "")] + (parts if len(parts) > 1 else []):
        for form, rule in candidates(norm(part)):
            if form in sup:
                return sup[form], form, "by hand"
            o = lex.get(form)
            if o:
                return ("ar" if o == ["ar"] else "ir" if o == ["ir"] else "both"), form, rule
    return None, None, None

if __name__ == "__main__":
    src, lexf, supf, out = sys.argv[1:5]
    book = json.load(open(src)); lex = json.load(open(lexf))
    try: sup = json.load(open(supf))
    except FileNotFoundError: sup = {}
    sup = {norm(k): v for k, v in sup.items() if not k.startswith("_")}
    tokens = 0; ar = Counter(); rules = Counter(); unknown = Counter(); both = Counter(); lines = []
    def poems(nodes):
        for n in nodes:
            yield from ((n, p) for p in n["poems"])
            yield from poems(n["children"])
    for n, p in poems(book["books"]):
        for v in p["verses"]:
            words = v["t"].split()
            tags = []
            for w in words:
                tokens += 1
                k, form, rule = classify(w, lex, sup)
                if k == "ar": ar[form] += 1; rules[rule] += 1
                elif k == "both": both[form] += 1
                elif k is None: unknown[norm(w)] += 1
                tags.append([w, k == "ar", form if k == "ar" else None])
            lines.append(tags)
    json.dump(lines, open(out, "w"), ensure_ascii=False)
    n_ar = sum(ar.values())
    print(f"{tokens:,} words, {n_ar:,} Arabic ({n_ar / tokens:.2%}), {len(ar):,} Arabic types")
    print("by rule:", rules.most_common())
    print("\nmost frequent Arabic:", " ".join(f"{w}:{c}" for w, c in ar.most_common(80)))
    random.seed(1)
    print("\nrandom Arabic:", " ".join(random.sample(sorted(ar), min(60, len(ar)))))
    print("\nhomographs left out:", " ".join(f"{w}:{c}" for w, c in both.most_common(40)))
    odd = re.compile("[ثحصضطظع]")
    print("\nunknown with Arabic-only letters:", " ".join(f"{w}:{c}" for w, c in unknown.most_common() if odd.search(w))[:3000])
    print("\nmost frequent unknown:", " ".join(f"{w}:{c}" for w, c in unknown.most_common(120)))
