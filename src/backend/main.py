import json, os, re
from datetime import datetime, timezone
from urllib.parse import quote
from typing import Optional

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel

from facts import build_facts
from metrics import enrich

load_dotenv()

app = FastAPI(title="Exoplanet Explorer")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Astro-Context"],  # lets the browser read which planets an answer was grounded on
)

DATA_FILE = "exoplanets.json"
NASA_URL = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
NASA_QUERY = """
select pl_name, hostname, discoverymethod, disc_year, sy_dist,
       pl_rade, pl_bmasse, pl_orbper, pl_orbsmax, pl_eqt, pl_insol,
       st_teff, st_rad, st_mass, sy_pnum, ra, dec
from pscomppars
where pl_rade is not null and sy_dist is not null
"""

PLANETS: list = []
BY_NAME: dict = {}
INSIGHT_CACHE: dict = {}


HOSTS: dict = {}
NAME_INDEX: list = []


def load_planets(raw):
    global PLANETS, BY_NAME, HOSTS, NAME_INDEX
    PLANETS = [enrich(p) for p in raw]
    BY_NAME = {p["pl_name"].lower(): p for p in PLANETS}
    HOSTS = {}
    for p in PLANETS:
        if p.get("hostname"):
            HOSTS.setdefault(p["hostname"].lower(), []).append(p)
    # every planet and star name, longest first, so "TRAPPIST-1 e" wins over "TRAPPIST-1"
    NAME_INDEX = sorted(
        [(n, "planet") for n in BY_NAME] + [(h, "host") for h in HOSTS if h not in BY_NAME],
        key=lambda x: -len(x[0]),
    )
    INSIGHT_CACHE.clear()


with open(DATA_FILE) as f:
    load_planets(json.load(f))


def file_time():
    """When exoplanets.json was last written, i.e. when we last synced with NASA."""
    return datetime.fromtimestamp(os.path.getmtime(DATA_FILE), tz=timezone.utc).isoformat()


DATA_META = {"updated_at": file_time(), "last_added": None}

# Any OpenAI-compatible provider works. Defaults to local Ollama.
client = OpenAI(
    base_url=os.getenv("LLM_BASE_URL", "http://localhost:11434/v1"),
    api_key=os.getenv("LLM_API_KEY", "ollama"),
)
MODEL = os.getenv("LLM_MODEL", "llama3.2")

from glossary import glossary_hits, definitions_block, DEFINE_Q

# ---------- the astronomer ----------

BASE_RULES = """You are Astro, a friendly virtual astronomer inside a 3D exoplanet explorer. Your audience is curious non-experts.

STRICT RULES
1. Use ONLY the FACTS (and DEFINITIONS, if given) provided below. Never add numbers, names or details that are not in them.
2. Answer every part the facts DO cover first. Only for the parts they don't cover, say "NASA's data doesn't tell us" that part. Never answer with only a refusal when some facts are relevant.
3. Never say life is likely, promising or possible. Never speculate about atmosphere, oceans, surface, weather or aliens. The honest conclusion is that the data cannot show whether life exists.
4. Equilibrium temperature is not surface temperature. ESI measures similarity to Earth in size, density and temperature; it is not a chance of life.
5. Describe stars exactly as the facts do. Never call a cool red dwarf hot.
6. Plain text only: no markdown, no asterisks, no bullet points, no headings.
7. Be concise: at most 80 words unless the user asks for more."""

MODE_PROMPTS = {
    "life": (
        "Task: answer 'Could life exist here?'. Write exactly three sentences. "
        "Sentence 1: what the facts say about size, starlight and temperature compared with Earth. "
        "Sentence 2: what the data does not tell us (for example atmosphere or water). "
        "Sentence 3, word for word: So the data cannot tell us whether life exists here."
    ),
    "earth": (
        "Task: compare with Earth in three short sentences covering size, starlight received and temperature. "
        "Use the numbers from the facts."
    ),
    "special": (
        "Task: in three sentences, say what is most distinctive or interesting about this world or system, "
        "using only the facts."
    ),
    "insight": (
        "Task: write 3 short sentences: what kind of world this is, what stands out, "
        "and how Earth-like it is (explain the ESI and habitable-zone result)."
    ),
    "explore": (
        "Task: the user is browsing the whole catalogue, not one planet. Answer using the CATALOGUE facts "
        "and any planet facts given. When you recommend or mention worlds, write their names exactly as in the facts "
        "so the user can click them. If the facts don't cover the question, say so."
    ),
    "system": (
        "Task: the user is looking at a whole planetary system. Answer using the facts for its planets. "
        "Write planet names exactly as in the facts."
    ),
    "define": (
        "Task: the user is asking what a term or concept means. Explain it in 2 or 3 simple sentences using the "
        "DEFINITIONS. If the planet or star facts show how it applies to what the user is looking at, add one sentence "
        "about that using those facts. The definitions answer the question, so do not say NASA's data doesn't tell us."
    ),
    "free": (
        "Task: answer the user's question using only the facts. "
        "If the question cannot be answered from the facts, say so plainly."
    ),
}


def get_or_404(name: str):
    p = BY_NAME.get(name.lower())
    if not p:
        raise HTTPException(404, f"Planet not found: {name}")
    return p


def facts_block(records):
    parts = []
    for p in records:
        f = build_facts(p)
        parts.append(f"## {p['pl_name']}\n" + "\n".join("- " + line for line in f["lines"]))
    return "\n\n".join(parts)


def mentioned(message, limit=4):
    """Planets the user names in their question (by planet name or by star name)."""
    text = " " + message.lower() + " "
    found = []
    for name, kind in NAME_INDEX:
        i = text.find(name)
        # whole names only: "K2-18 b" should not match inside "K2-18 bc"
        while i >= 0 and (text[i - 1].isalnum() or text[i + len(name)].isalnum()):
            i = text.find(name, i + 1)
        if i < 0:
            continue
        text = text[:i] + " " * len(name) + text[i + len(name):]
        if kind == "planet":
            found.append(BY_NAME[name])
        else:
            found.extend(sorted(HOSTS[name], key=lambda p: p.get("pl_orbper") or 1e9)[:limit])
        if len(found) >= limit:
            break
    # people often type names without spaces: "trappist-1e", "kepler452b"
    if len(found) < limit:
        squashed = text  # the message with already-matched names blanked out
        for name, kind in NAME_INDEX:
            if kind != "planet" or " " not in name or len(name) < 6:
                continue
            key = name.replace(" ", "")
            i = squashed.find(key)
            while i >= 0 and (squashed[i - 1].isalnum() or squashed[i + len(key)].isalnum()):
                i = squashed.find(key, i + 1)
            if i >= 0:
                found.append(BY_NAME[name])
                squashed = squashed[:i] + " " * len(key) + squashed[i + len(key):]
            if len(found) >= limit:
                break
    unique = list({p["pl_name"]: p for p in found}.values())
    return unique[:limit]


def one_line(p):
    ly = p["sy_dist"] * 3.2616 if p.get("sy_dist") is not None else None
    bits = [p.get("type") or "Unknown type"]
    if p.get("esi") is not None:
        bits.append(f"ESI {p['esi']:.2f}")
    bits.append(p.get("hz_status") or "habitable zone unknown")
    if ly is not None:
        bits.append(f"{ly:.1f} light-years away" if ly < 100 else f"{round(ly):,} light-years away")
    return f"- {p['pl_name']}: " + ", ".join(bits)


# typed questions that mean the same as the quick-question buttons get the same, more reliable template
INTENTS = [
    ("life", re.compile(r"\b(life|alive|living|live (on|there|here)|habitable|habitability|aliens?|inhabit\w*|survive|liquid water|water)\b", re.I)),
    ("earth", re.compile(r"\b(compare[sd]?|comparison|versus|vs\.?|like earth|similar to earth|earth-like|than earth|to earth)\b", re.I)),
    ("special", re.compile(r"\b(special|interesting|unique|unusual|notable|cool|stand out|stands out|fun fact)\b", re.I)),
]


def intent_of(message):
    for mode, rx in INTENTS:
        if rx.search(message):
            return mode
    return "free"


# questions about the catalogue as a whole, asked from any view ("closest", "most Earth-like", "how many"...)
GLOBAL_Q = re.compile(
    r"\b(closest|nearest|farthest|furthest|most earth|earth-like|earthlike|habitable worlds|best|top|largest|biggest|"
    r"smallest|hottest|coldest|how many|which (exo)?planets|which worlds|list|catalog(ue)?|all (the )?planets|"
    r"other planets|other worlds|similar worlds|recommend)\b",
    re.I,
)


def catalogue_block():
    full = sorted([p for p in PLANETS if p["esi"] is not None and p["esi_factors"] == 4], key=lambda p: -p["esi"])[:8]
    nearest = sorted([p for p in PLANETS if p.get("sy_dist") is not None], key=lambda p: p["sy_dist"])[:6]
    near_hz = sorted([p for p in PLANETS if p.get("sy_dist") is not None and p["hz_status"] == "In habitable zone"], key=lambda p: p["sy_dist"])[:4]
    sized = [p for p in PLANETS if p.get("pl_rade")]
    largest = sorted(sized, key=lambda p: -p["pl_rade"])[:3]
    smallest = sorted(sized, key=lambda p: p["pl_rade"])[:3]
    by_type = {}
    for p in PLANETS:
        by_type[p["type"]] = by_type.get(p["type"], 0) + 1
    hz = sum(1 for p in PLANETS if p["hz_status"] == "In habitable zone")
    types = ", ".join(f"{k}: {v}" for k, v in sorted(by_type.items(), key=lambda kv: -kv[1]))
    text = (
        f"## CATALOGUE (NASA Exoplanet Archive)\n"
        f"- {len(PLANETS):,} confirmed planets with a known size and distance. {hz:,} are in their star's habitable zone.\n"
        f"- By size class: {types}.\n"
        f"Most Earth-like by ESI (all 4 factors measured):\n" + "\n".join(one_line(p) for p in full) + "\n"
        f"Nearest to Earth:\n" + "\n".join(one_line(p) for p in nearest) + "\n"
        f"Nearest in a habitable zone:\n" + "\n".join(one_line(p) for p in near_hz) + "\n"
        f"Largest (radius, x Earth):\n" + "\n".join(f"- {p['pl_name']}: {p['pl_rade']:.1f}" for p in largest) + "\n"
        f"Smallest (radius, x Earth):\n" + "\n".join(f"- {p['pl_name']}: {p['pl_rade']:.2f}" for p in smallest)
    )
    names = [p["pl_name"] for p in full + nearest + near_hz + largest + smallest]
    return text, list(dict.fromkeys(names))


def build_messages(message, names, history, mode):
    """Returns (messages, context_names). context_names = planets whose facts the model was given."""
    records = [BY_NAME[n.lower()] for n in names if n.lower() in BY_NAME][:8]
    seen = {p["pl_name"] for p in records}
    for p in mentioned(message):
        if p["pl_name"] not in seen and len(records) < 10:
            records.append(p)
            seen.add(p["pl_name"])
    # "what is an M-type star?", "what does the green ring mean?": answer from the vetted glossary
    hits = glossary_hits(message) if DEFINE_Q.search(message) else []
    if hits and mode == "free" and not GLOBAL_Q.search(message):
        mode = "define"
    # a typed question about one planet that matches a quick question uses that question's template
    if mode == "free" and len(names) == 1 and not GLOBAL_Q.search(message) and not mentioned(message):
        mode = intent_of(message)
    if mode != "define" and (not names or (mode == "free" and GLOBAL_Q.search(message))):
        mode = "explore"  # a catalogue-wide question: give the model the catalogue facts too
    elif len(names) > 1 and mode == "free":
        mode = "system"
    parts = []
    context = [p["pl_name"] for p in records]
    if mode == "explore":
        text, cat_names = catalogue_block()
        parts.append(text)
        context += cat_names
    if records:
        parts.append(facts_block(records))
    if hits:
        parts.append(definitions_block(hits))
    facts = "\n\n".join(parts) or "No planet selected."
    system = f"{BASE_RULES}\n\n{MODE_PROMPTS.get(mode, MODE_PROMPTS['free'])}\n\nFACTS\n{facts}"
    msgs = [{"role": "system", "content": system}]
    for h in history[-4:]:
        if h.get("role") in ("user", "assistant") and h.get("content"):
            msgs.append({"role": h["role"], "content": h["content"]})
    msgs.append({"role": "user", "content": message})
    return msgs, list(dict.fromkeys(context))


def ask_llm(messages):
    try:
        resp = client.chat.completions.create(
            model=MODEL, messages=messages, temperature=0.3, max_tokens=260
        )
    except Exception as e:
        raise HTTPException(502, f"LLM error: {e}")
    return resp.choices[0].message.content


def stream_llm(messages):
    try:
        stream = client.chat.completions.create(
            model=MODEL, messages=messages, temperature=0.3, max_tokens=260, stream=True
        )
        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    except Exception as e:
        yield f"\n[AI model error: {e}]"


# ---------- data endpoints ----------

CARD_KEYS = [
    "pl_name", "hostname", "sy_dist", "pl_rade", "pl_bmasse", "pl_orbper", "pl_orbsmax",
    "pl_eqt", "flux", "st_teff", "st_rad", "sy_pnum", "ra", "dec", "type", "esi",
    "esi_factors", "hz_status", "discoverymethod", "disc_year",
]


def card(p):
    return {k: p.get(k) for k in CARD_KEYS}


@app.get("/planets")
def list_planets(
    q: Optional[str] = None,
    type: Optional[str] = None,
    habitable: bool = False,
    min_esi: Optional[float] = None,
    max_dist: Optional[float] = None,
    sort: str = "name",
    limit: int = 0,
):
    res = PLANETS
    if q:
        ql = q.lower()
        res = [p for p in res if ql in p["pl_name"].lower() or ql in (p.get("hostname") or "").lower()]
    if type:
        res = [p for p in res if p["type"].lower() == type.lower()]
    if habitable:
        res = [p for p in res if p["hz_status"] == "In habitable zone"]
    if min_esi is not None:
        res = [p for p in res if p["esi"] is not None and p["esi"] >= min_esi]
    if max_dist is not None:
        res = [p for p in res if p["sy_dist"] is not None and p["sy_dist"] <= max_dist]
    if sort == "esi":
        res = sorted(res, key=lambda p: p["esi"] if p["esi"] is not None else -1, reverse=True)
    elif sort == "distance":
        res = sorted(res, key=lambda p: p["sy_dist"])
    else:
        res = sorted(res, key=lambda p: p["pl_name"])
    if limit:
        res = res[:limit]
    return [card(p) for p in res]


@app.get("/planets/{name}")
def get_planet(name: str):
    return get_or_404(name)


@app.get("/facts/{name}")
def get_facts(name: str):
    return build_facts(get_or_404(name))


@app.get("/compare")
def compare(a: str, b: str):
    pa, pb = get_or_404(a), get_or_404(b)
    fields = ["pl_rade", "pl_bmasse", "pl_orbper", "pl_orbsmax", "pl_eqt", "flux", "sy_dist", "esi"]
    rows = [{"field": f, "a": pa.get(f), "b": pb.get(f)} for f in fields]
    more_earthlike = None
    if pa["esi"] is not None and pb["esi"] is not None:
        more_earthlike = pa["pl_name"] if pa["esi"] >= pb["esi"] else pb["pl_name"]
    return {"a": pa, "b": pb, "rows": rows, "more_earthlike": more_earthlike}


@app.get("/featured")
def featured(n: int = 10):
    full = [p for p in PLANETS if p["esi"] is not None and p["esi_factors"] == 4]
    top = sorted(full, key=lambda p: p["esi"], reverse=True)[:n]
    return [card(p) for p in top]


@app.get("/stats")
def stats():
    by_type = {}
    for p in PLANETS:
        by_type[p["type"]] = by_type.get(p["type"], 0) + 1
    return {
        "total": len(PLANETS),
        "habitable_zone": sum(1 for p in PLANETS if p["hz_status"] == "In habitable zone"),
        "by_type": by_type,
        "nearest": card(min(PLANETS, key=lambda p: p["sy_dist"])),
    }


@app.post("/refresh")
def refresh():
    """Re-download the latest data from NASA and reload it."""
    try:
        r = requests.get(NASA_URL, params={"query": NASA_QUERY, "format": "json"}, timeout=60)
        r.raise_for_status()
        raw = r.json()
    except Exception as e:
        raise HTTPException(502, f"NASA fetch failed: {e}")
    before = set(BY_NAME)
    with open(DATA_FILE, "w") as f:
        json.dump(raw, f)
    load_planets(raw)
    added = sorted(p["pl_name"] for p in PLANETS if p["pl_name"].lower() not in before)
    DATA_META["updated_at"] = file_time()
    DATA_META["last_added"] = len(added)
    return {"planets": len(PLANETS), "added": len(added), "new_planets": added[:12], "updated_at": DATA_META["updated_at"]}


@app.get("/meta")
def meta():
    """Where the data comes from and how fresh it is (shown as the NASA badge in the app)."""
    return {
        "source": "NASA Exoplanet Archive",
        "table": "pscomppars",
        "url": "https://exoplanetarchive.ipac.caltech.edu/",
        "planets": len(PLANETS),
        "habitable_zone": sum(1 for p in PLANETS if p["hz_status"] == "In habitable zone"),
        "updated_at": DATA_META["updated_at"],
        "last_added": DATA_META["last_added"],
    }


# ---------- AI endpoints ----------

@app.get("/insight/{name}")
def insight(name: str):
    p = get_or_404(name)
    key = p["pl_name"]
    if key not in INSIGHT_CACHE:
        msgs, _ = build_messages("Give me the summary.", [key], [], "insight")
        INSIGHT_CACHE[key] = ask_llm(msgs)
    return {"planet": key, "insight": INSIGHT_CACHE[key]}


class ChatRequest(BaseModel):
    message: str
    planets: list[str] = []      # 1 name = explain, 2+ = compare / whole system
    history: list[dict] = []
    mode: str = "free"           # life | earth | special | free


@app.post("/chat")
def chat(req: ChatRequest):
    msgs, context = build_messages(req.message, req.planets, req.history, req.mode)
    return {"reply": ask_llm(msgs), "context": context}


@app.post("/chat/stream")
def chat_stream(req: ChatRequest):
    msgs, context = build_messages(req.message, req.planets, req.history, req.mode)
    return StreamingResponse(
        stream_llm(msgs),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            # planets the answer was grounded on, so the UI can turn their names into "show me" links
            "X-Astro-Context": "|".join(quote(n) for n in context),
        },
    )