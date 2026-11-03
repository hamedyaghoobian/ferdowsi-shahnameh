# What Ferdowsi Let In

Readings, Otherwise, No. 3. Ferdowsi's *Shahnameh* with every Persian word taken out: the 6,409
words he let in from Arabic, each set where it falls on its line, scattered across a dark field.
A second layer marks the deaths.

- `data/shahnameh-ganjoor.json`: the text from the [Ganjoor](https://ganjoor.net/ferdousi/shahname) API, 61 books, 857 sections, 49,610 couplets, written by `tools/fetch.py`.
- `tools/lexicon.py`: reads the Persian Wiktionary dump and writes `data/lexicon.json` (each written form: borrowed from Arabic, inherited from an older Iranian language, or both) and `data/glosses.json`.
- `tools/candidates.py`: puts forward every word that might be Arabic, by three signals (Persian Wiktionary says so; it has a letter Persian keeps almost only for Arabic words, ث ح ص ض ط ظ ع; it is an Arabic word in Arabic Wiktionary), and writes `data/candidates.tsv` and `data/keys.json`.
- `data/decisions.tsv`: **the list that decides.** Each form put forward was decided by hand, by Claude, a language model, under the rules at the top of the file. Anything not listed is Persian. Corrections are welcome: change a line and run `shape.py` again.
- `tools/shape.py`: shapes every half-line with HarfBuzz in Amiri, places each word, keeps the Arabic ones, finds the deaths, and writes `site/data/` (the text, the Arabic words and their positions, and a subset of the font).
- `site/`: the page (canvas, no build step). Serve it with `python3 -m http.server -d site`.

```
uv venv .venv && uv pip install --python .venv/bin/python uharfbuzz fonttools brotli
python3 -I tools/fetch.py data/shahnameh-ganjoor.json
curl -sL https://kaikki.org/dictionary/Persian/kaikki.org-dictionary-Persian.jsonl -o data/wiktionary/persian.jsonl
curl -sL https://kaikki.org/dictionary/Arabic/kaikki.org-dictionary-Arabic.jsonl -o data/wiktionary/arabic.jsonl
python3 -I tools/lexicon.py data/wiktionary/persian.jsonl data/lexicon.json
.venv/bin/python -I tools/candidates.py data/shahnameh-ganjoor.json data/lexicon.json data/wiktionary/arabic.jsonl data/decisions.tsv data/candidates.tsv
.venv/bin/python -I tools/shape.py data/shahnameh-ganjoor.json site/data
```

## The count

6,409 Arabic words in 568,479, 1.13 per cent; 671 Arabic forms (inflected and compound forms
counted apart); 1,146 names of Arabic shape left out. رای, judgement (1,026 times), is left out
as well: Wiktionary gives it both an Arabic and an Iranian origin. For comparison, M. D. Moïnfar, *Le
vocabulaire arabe dans le Livre des rois de Firdausī* (Wiesbaden, 1970), the one full count,
found 706 Arabic words occurring 8,938 times, in another edition and by his own rules (as given
in the *Encyclopaedia Iranica*, "Šāh-nāma iii. Arabic words").

## The deaths

The sections whose Ganjoor headings name a killing or a death (166), and in them the couplets
whose verse names the killing, the dying or the tomb (282), found by the patterns at the top of `tools/shape.py`. Headings that
name only mourning, news of a death, or a meditation on death are left out.

## Licences

The *Shahnameh* is in the public domain; the text and headings are Ganjoor's. `data/lexicon.json`,
`data/glosses.json` and the glosses in `site/data/text.json` come from Wiktionary, under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Amiri is by Khaled Hosny, under
the SIL Open Font License 1.1 (`fonts/OFL.txt`); `site/data/hand.woff2` is a subset of it.
