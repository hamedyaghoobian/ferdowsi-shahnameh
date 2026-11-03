"""Propose the words of the Shahnameh that might be Arabic, for deciding by hand.

Three signals, any of which puts a word forward:
  a  Persian Wiktionary says the form was borrowed from Arabic
  b  the word has a letter Persian uses almost only for Arabic words: ث ح ص ض ط ظ ع
  c  the form (three letters or more) is an Arabic word in Arabic Wiktionary, and Persian
     Wiktionary does not record it as inherited from an older Iranian language
Writes data/candidates.tsv, most frequent first: form, count, signals, written variants, one line.
Forms already decided in data/decisions.tsv are marked, so a review can go on where it stopped.
"""
import json, re, sys, os
from collections import Counter, defaultdict
sys.path.insert(0, os.path.dirname(__file__))
from tag import candidates, norm

ODD = re.compile("[ثحصضطظع]")

def arabic_words(path):
    words = set()
    for line in open(path):
        e = json.loads(line)
        if e.get("lang_code") != "ar" or e.get("pos") == "name":
            continue
        for f in [e["word"]] + [f["form"] for f in e.get("forms") or [] if f.get("form")]:
            f = norm(f).replace("ئ", "ی").replace("ؤ", "و")
            if f.startswith("ال") and len(f) > 4: f = f[2:]
            if re.fullmatch("[ء-يپچژکگی]{3,}", f):
                words.add(f)
    return words

def load_decisions(path):
    d = {}
    if os.path.exists(path):
        for row in open(path):
            if row.startswith("#") or not row.strip(): continue
            form, decision = row.rstrip("\n").split("\t")[:2]
            d[form] = decision
    return d

if __name__ == "__main__":
    src, lexf, arf, decf, out = sys.argv[1:6]
    lex = json.load(open(lexf)); ar_words = arabic_words(arf); decided = load_decisions(decf)
    book = json.load(open(src))
    def verses(nodes):
        for n in nodes:
            for p in n["poems"]: yield from p["verses"]
            yield from verses(n["children"])
    count, flags, variants, sample = Counter(), defaultdict(set), defaultdict(Counter), {}
    for v in verses(book["books"]):
        for w in v["t"].split():
            w0 = norm(w.replace("‌", ""))
            key, sig = None, set()
            for form, rule in candidates(w0):
                o = lex.get(form)
                if o == ["ar"] or o == ["ar", "ir"]: key = key or form; sig.add("a")
                if len(form) >= 3 and form in ar_words and o != ["ir"]: key = key or form; sig.add("c")
                if key: break
            if ODD.search(w0):
                sig.add("b"); key = key or w0
            if not key: continue
            count[key] += 1; flags[key] |= sig; variants[key][w0] += 1
            sample.setdefault(key, v["t"])
    # which form each written word was put forward as, so the decisions apply to exactly these words
    json.dump({w: k for k in variants for w in variants[k]}, open(os.path.join(os.path.dirname(out), "keys.json"), "w"),
              ensure_ascii=False, separators=(",", ":"))
    with open(out, "w") as f:
        f.write("# form\tcount\tsignals\tdecided\tvariants\tline\n")
        for k, n in count.most_common():
            vs = " ".join(x for x, _ in variants[k].most_common(4))
            f.write(f"{k}\t{n}\t{''.join(sorted(flags[k]))}\t{decided.get(k, '')}\t{vs}\t{sample[k]}\n")
    print(f"{len(count):,} candidate forms, {sum(count.values()):,} words;",
          f"{sum(1 for k in count if count[k] >= 3):,} with 3 or more;",
          f"{sum(1 for k in count if k in decided):,} decided")
