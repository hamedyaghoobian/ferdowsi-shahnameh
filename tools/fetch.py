"""Download the Shahnameh from the Ganjoor API into data/shahnameh-ganjoor.json.

Walks the book's categories in order, fetches every poem with its verses, and keeps
the text, the section titles and the order. Polite: one request at a time, with a pause.
"""
import json, sys, time, urllib.request

API = "https://api.ganjoor.net/api/ganjoor"
ROOT = 33   # /ferdousi/shahname


def get(path):
    for attempt in range(5):
        try:
            with urllib.request.urlopen(f"{API}/{path}", timeout=60) as r:
                return json.load(r)
        except Exception as e:
            print("retry", path, e, file=sys.stderr)
            time.sleep(2 + attempt * 3)
    raise RuntimeError(path)


def walk(cid, out, depth=0):
    cat = get(f"cat/{cid}?poems=true")["cat"]
    node = {"id": cid, "title": cat["title"], "slug": cat["urlSlug"], "poems": [], "children": []}
    out.append(node)
    for p in cat.get("poems") or []:
        d = get(f"poem/{p['id']}?catInfo=false&rhymes=false&recitations=false&images=false&songs=false&comments=false&navigation=false")
        verses = [{"c": v["coupletIndex"], "p": v["versePosition"], "t": v["text"]} for v in d["verses"]]
        node["poems"].append({"id": p["id"], "title": d["title"], "url": d["fullUrl"], "verses": verses})
        time.sleep(.15)
    print("  " * depth + f"{cat['title']}: {len(node['poems'])} poems", file=sys.stderr, flush=True)
    for ch in cat.get("children") or []:
        walk(ch["id"], node["children"], depth + 1)


if __name__ == "__main__":
    books = []
    root = get(f"cat/{ROOT}?poems=true")["cat"]
    for ch in root["children"]:
        walk(ch["id"], books)
    json.dump({"source": "https://ganjoor.net/ferdousi/shahname", "books": books},
              open(sys.argv[1], "w"), ensure_ascii=False)
