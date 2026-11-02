import { useEffect, useRef, useState } from "react";
import { IntroEngine, TL, CAPTIONS } from "./intro/IntroEngine";
import Wordmark from "./Wordmark";
import "./intro/intro.css";

// Cinematic opening. The 3D journey runs in IntroEngine; this component only adds the text and buttons on top.
//   onLeaving: called when the exit flight starts fading, so the explorer can mount underneath
//   onDone:    called when the intro has fully finished
export default function Intro({ onLeaving, onDone }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const stageRef = useRef(-1);
  const capRef = useRef(-1);
  const doneRef = useRef(false);
  const lastCapRef = useRef(null);
  const [stage, setStage] = useState(0); // 0 journey · 1 title · 2 tagline · 3 button
  const [caption, setCaption] = useState(-1);
  const [exiting, setExiting] = useState(false);
  const [fading, setFading] = useState(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone?.();
  };

  useEffect(() => {
    let engine;
    try {
      engine = new IntroEngine(canvasRef.current, {
        onTime: (t, exitT) => {
          const s = t >= TL.button ? 3 : t >= TL.tagline ? 2 : t >= TL.title ? 1 : 0;
          if (s !== stageRef.current) {
            stageRef.current = s;
            setStage(s);
          }
          const c = exitT == null ? CAPTIONS.findIndex((x) => t >= x.from && t < x.to) : -1;
          if (c !== capRef.current) {
            capRef.current = c;
            setCaption(c);
          }
        },
        onExitFade: () => {
          setFading(true);
          onLeaving?.();
        },
        onExitDone: finish,
        onContextLost: () => {
          onLeaving?.();
          finish();
        },
      });
    } catch (err) {
      // no WebGL: skip straight to the app
      console.warn("Intro disabled:", err);
      onLeaving?.();
      finish();
      return undefined;
    }
    engineRef.current = engine;
    return () => engine.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function enter() {
    if (exiting) return;
    setExiting(true);
    engineRef.current?.enter();
  }

  function skip() {
    // jump to the moment the Solar System is in full view, with the title drawing in
    engineRef.current?.jumpTo(TL.wide - 0.4);
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (stageRef.current >= 1) enter();
        else skip();
      } else if (e.key === "Escape") {
        skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const ui = !exiting;
  const cap = caption >= 0 ? CAPTIONS[caption] : null;
  if (cap) lastCapRef.current = cap;
  const shownCap = cap || lastCapRef.current;

  return (
    <div className={`solice-intro${fading ? " is-fading" : ""}`}>
      <canvas ref={canvasRef} className="solice-canvas" />
      <div className="solice-vignette" />

      {/* location tag, bottom left, like a documentary lower third. It fades in and out instead of popping. */}
      <div className={`solice-caption${cap ? " is-on" : ""}`}>
        {shownCap && (
          <>
            <span className="solice-caption-line" />
            <div className="solice-caption-title">{shownCap.text}</div>
            <div className="solice-caption-sub">{shownCap.sub}</div>
          </>
        )}
      </div>

      <div className={`solice-title${stage >= 1 && ui ? " is-on" : ""}`}>
        <Wordmark on={stage >= 1} />
        <div className={`solice-tagline${stage >= 2 && ui ? " is-on" : ""}`}>Explore the worlds beyond our Sun</div>
      </div>

      <button
        type="button"
        className={`solice-enter${stage >= 3 && ui ? " is-on" : ""}`}
        onClick={enter}
        tabIndex={stage >= 3 ? 0 : -1}
      >
        <span>Enter the Universe</span>
      </button>

      {stage < 1 && !exiting && (
        <button type="button" className="solice-skip" onClick={skip}>
          Skip intro
        </button>
      )}
    </div>
  );
}
