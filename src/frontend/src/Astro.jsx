import { useEffect, useMemo, useRef, useState } from "react";

// Astro, the virtual astronomer: a floating dock that knows what you're looking at.
//   context = { kind: "sky" | "planet" | "system", names: [planet names], label: "what we're talking about" }
//   onShow(name) is called when you click a planet Astro mentioned, so the 3D view can fly there.

const SUGGEST = {
  sky: [
    { label: "Most Earth-like worlds?", text: "What are the most Earth-like worlds known so far?" },
    { label: "Closest exoplanets?", text: "Which exoplanets are closest to us?" },
    { label: "What is the habitable zone?", text: "What does it mean for a planet to be in the habitable zone?" },
    { label: "Tell me about TRAPPIST-1", text: "Tell me about the TRAPPIST-1 system." },
  ],
  planet: [
    { label: "Could life exist here?", mode: "life" },
    { label: "How does it compare to Earth?", mode: "earth" },
    { label: "What makes it special?", mode: "special" },
  ],
  system: [
    { label: "Which planet is most Earth-like?", text: "Which planet in this system is most Earth-like, and why?" },
    { label: "Tell me about this star", text: "What kind of star is this, and how does it compare to the Sun?" },
    { label: "Which are in the habitable zone?", text: "Which planets here are in the habitable zone?" },
    { label: "What's the green ring?", text: "What does the green habitable zone ring mean?" },
  ],
};

export function AstroAvatar({ size = 34, busy = false }) {
  return (
    <svg className={`astro-avatar${busy ? " is-busy" : ""}`} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <radialGradient id="astro-core">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#dfe5ff" />
          <stop offset="1" stopColor="#8f9cf0" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill="rgba(160,172,255,0.08)" stroke="rgba(206,214,255,0.28)" />
      <circle cx="20" cy="20" r="9" fill="url(#astro-core)" />
      <g className="astro-orbit">
        <ellipse cx="20" cy="20" rx="14" ry="5.5" fill="none" stroke="rgba(214,222,255,0.55)" strokeWidth="0.8" transform="rotate(-24 20 20)" />
        <circle cx="32.8" cy="14.3" r="1.9" fill="#fff" />
      </g>
    </svg>
  );
}

function greeting(ctx) {
  if (ctx.kind === "planet")
    return `Ask me anything about ${ctx.label}. I answer only from NASA Exoplanet Archive data, and I'll tell you when something isn't known.`;
  if (ctx.kind === "system")
    return `We're looking at the ${ctx.label} system. Ask about its star, its planets, or which one is most Earth-like.`;
  return "Ask me about the whole catalogue: the most Earth-like worlds, the closest ones, or any planet by name. I'll point you to them on the map.";
}

// planets Astro was given facts about and actually named in its answer
function mentionedIn(text, names, skip) {
  const low = text.toLowerCase();
  const out = [];
  for (const n of names) {
    if (skip.includes(n)) continue;
    const i = low.indexOf(n.toLowerCase());
    if (i < 0) continue;
    const after = low[i + n.length];
    if (after && /[a-z0-9]/.test(after)) continue;
    out.push(n);
    if (out.length >= 4) break;
  }
  return out;
}

export default function Astro({ api, context, onShow, inset = 0 }) {
  const ctxKey = `${context.kind}:${context.names.join("|")}`;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [facts, setFacts] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const firstCtx = useRef(true);

  // when what you're looking at changes, start a new topic (old messages stay visible above a divider)
  useEffect(() => {
    abortRef.current?.abort();
    setBusy(false);
    setFacts(null);
    if (firstCtx.current) firstCtx.current = false;
    else setMessages((m) => (m.length && m[m.length - 1].role !== "divider" ? [...m, { role: "divider", content: context.label }] : m));
    if (context.kind === "planet" && context.names.length === 1) {
      const ctrl = new AbortController();
      fetch(`${api}/facts/${encodeURIComponent(context.names[0])}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setFacts(d))
        .catch(() => {});
      return () => ctrl.abort();
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, ctxKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  // "/" opens Astro from anywhere, Esc tucks it away
  useEffect(() => {
    const onKey = (e) => {
      const typing = /input|textarea/i.test(e.target.tagName);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      } else if (e.key === "Escape" && open && e.target === inputRef.current) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text, mode = "free") {
    const message = text.trim();
    if (!message || busy) return;
    setOpen(true);

    // only the current topic counts as history
    const lastDiv = messages.map((m) => m.role).lastIndexOf("divider");
    const history = messages
      .slice(lastDiv + 1)
      .filter((m) => !m.error && m.content && (m.role === "user" || m.role === "assistant"))
      .slice(-4)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((m) => [...m, { role: "user", content: message }, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const update = (patch) =>
      setMessages((m) => {
        const copy = m.slice();
        copy[copy.length - 1] = { ...copy[copy.length - 1], ...patch };
        return copy;
      });

    try {
      const res = await fetch(`${api}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, planets: context.names, history, mode }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }
      const header = res.headers.get("X-Astro-Context") || "";
      const grounded = header ? header.split("|").map(decodeURIComponent) : context.names;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        update({ content: acc });
      }
      update({ content: acc, links: mentionedIn(acc, grounded, context.kind === "planet" ? context.names : []) });
    } catch (err) {
      if (err.name !== "AbortError") update({ content: `I couldn't reach the AI model. (${err.message})`, error: true });
    }
    setBusy(false);
  }

  function stop() {
    abortRef.current?.abort();
    setBusy(false);
  }

  const suggestions = SUGGEST[context.kind] || SUGGEST.sky;
  const lastIndex = messages.length - 1;
  const topicEmpty = useMemo(() => {
    const lastDiv = messages.map((m) => m.role).lastIndexOf("divider");
    return messages.slice(lastDiv + 1).length === 0;
  }, [messages]);

  const style = { left: `calc((100% - ${inset}px) / 2)` };

  if (!open) {
    return (
      <button type="button" className="astro-pill" style={style} onClick={() => setOpen(true)} title="Ask Astro (press /)">
        <AstroAvatar size={30} busy={busy} />
        <span className="astro-pill-text">
          <b>Ask Astro</b>
          <span>about {context.label}</span>
        </span>
        <kbd>/</kbd>
      </button>
    );
  }

  return (
    <section className="astro" style={style} aria-label="Astro, virtual astronomer">
      <header className="astro-head">
        <AstroAvatar size={36} busy={busy} />
        <div className="astro-title">
          <b>Astro</b>
          <span>Virtual astronomer · answers from NASA data only</span>
        </div>
        {messages.length > 0 && (
          <button type="button" className="astro-ghost" onClick={() => (stop(), setMessages([]))} title="Clear the conversation">
            Clear
          </button>
        )}
        <button type="button" className="astro-ghost astro-min" onClick={() => setOpen(false)} title="Minimise (Esc)" aria-label="Minimise">
          ⌄
        </button>
      </header>

      <div className="astro-context">
        <span className="sx-eyebrow">Looking at</span>
        <span className="astro-context-name">{context.label}</span>
        {facts?.chips?.slice(0, 4).map((c) => (
          <span key={c} className="astro-fact">
            {c}
          </span>
        ))}
      </div>

      <div className="astro-list" ref={listRef}>
        {messages.map((m, i) => {
          if (m.role === "divider")
            return (
              <div key={i} className="astro-divider">
                <span>Now looking at {m.content}</span>
              </div>
            );
          const streaming = busy && i === lastIndex && m.role === "assistant";
          return (
            <div key={i} className={`astro-msg ${m.role}${m.error ? " is-error" : ""}`}>
              {m.content}
              {streaming && !m.content && (
                <span className="astro-thinking" aria-label="Astro is thinking">
                  <i />
                  <i />
                  <i />
                </span>
              )}
              {streaming && m.content && <span className="astro-caret" />}
              {!streaming && m.links?.length > 0 && (
                <div className="astro-links">
                  {m.links.map((n) => (
                    <button key={n} type="button" onClick={() => onShow?.(n)}>
                      Show {n} <span aria-hidden="true">→</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {topicEmpty && <div className="astro-msg assistant astro-hello">{greeting(context)}</div>}
      </div>

      <div className="astro-suggest">
        {suggestions.map((q) => (
          <button key={q.label} type="button" disabled={busy} onClick={() => send(q.text || q.label, q.mode || "free")}>
            {q.label}
          </button>
        ))}
      </div>

      <form
        className="astro-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input, "free");
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={context.kind === "sky" ? "Ask about any planet or star…" : `Ask about ${context.label}…`}
          autoFocus
        />
        {busy ? (
          <button type="button" className="astro-send is-stop" onClick={stop} aria-label="Stop">
            ■
          </button>
        ) : (
          <button type="submit" className="astro-send" disabled={!input.trim()} aria-label="Send">
            ↑
          </button>
        )}
      </form>
    </section>
  );
}
