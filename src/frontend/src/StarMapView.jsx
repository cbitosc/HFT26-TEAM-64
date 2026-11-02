import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import { StarMapEngine } from "./space/StarMapEngine";

// React wrapper for the star map. Everything visual lives in StarMapEngine; this only passes data in and events out.
const StarMapView = forwardRef(function StarMapView(
  { planets, selected, mode, initialView, onSelect, onHover, onContextLost },
  ref
) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const cbRef = useRef({});
  cbRef.current = { onSelect, onHover, onContextLost };

  useEffect(() => {
    const e = new StarMapEngine(canvasRef.current, wrapRef.current, {
      onSelect: (p) => cbRef.current.onSelect?.(p),
      onHover: (p, ev) => cbRef.current.onHover?.(p, ev),
      onContextLost: () => cbRef.current.onContextLost?.(),
    });
    if (initialView) {
      e.yaw = initialView.yaw;
      e.pitch = initialView.pitch;
      e.fov = e.fovTarget = initialView.fov;
    }
    engineRef.current = e;
    if (new URLSearchParams(location.search).has("debug")) (window.__solice ??= {}).starmap = e; // for testing
    return () => e.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setPlanets(planets);
  }, [planets]);

  useEffect(() => {
    engineRef.current?.setSelected(selected);
  }, [selected]);

  useEffect(() => {
    engineRef.current?.setMode(mode);
  }, [mode]);

  useImperativeHandle(ref, () => ({
    zoomBy: (f) => engineRef.current?.zoomBy(f),
    reset: () => engineRef.current?.resetView(),
    flyTo: (p, fov) => engineRef.current?.flyTo(p, fov),
    lookAtRaDec: (ra, dec, fov) => engineRef.current?.lookAtRaDec(ra, dec, fov),
    dive: (p, done) => (engineRef.current ? engineRef.current.dive(p, done) : done()),
    getView: () => {
      const e = engineRef.current;
      return e ? { yaw: e.yaw, pitch: e.pitch, fov: e.fovTarget } : null;
    },
  }));

  return (
    <div ref={wrapRef} className="sx-stage">
      <canvas ref={canvasRef} className="sx-canvas" />
    </div>
  );
});

export default StarMapView;
