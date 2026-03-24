"use client";

import { useState, useRef, useEffect, useCallback } from "react";


const Home = () => (
  <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3L3 9v12h6v-6h6v6h6V9L12 3z" />
  </svg>
);
const casino = () => (
  <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18M3 12h18" />
  </svg>
);
const sport = () => (
  <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2v20" />
  </svg>
);
const bets = () => (
  <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6h16v4H4V6zm0 8h16v4H4v-4z" />
  </svg>
);
const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const tabs = [
  { id: "home", Icon: Home, text: "Home", },
  { id: "casino", Icon: casino, text: "Casino", },
  { id: "sport", Icon: sport, text: "Sport", },
  { id: "bets", Icon: bets, text: "Bets", },
  // { id: "search", Icon: SearchIcon, text: "Search" },
] as const;
type TabId = (typeof tabs)[number]["id"];

/* ── Easing ── */
const leadE = (t: number) => 1 - Math.pow(1 - t, 2.2);
const trailE = (t: number) => 1 - Math.pow(1 - t, 6.0);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// ── SCALE = 1.40 (was 1.80) ──────────────────────────────────────
const PEAK_SY = 1.40;

function pillYCurveFresh(t: number): number {
  if (t < 0.18) return 1 + (PEAK_SY - 1) * (t / 0.18);
  if (t < 0.55) return PEAK_SY - 0.14 * ((t - 0.18) / 0.37);
  if (t < 0.82) return (PEAK_SY - 0.14) - 0.20 * ((t - 0.55) / 0.27);
  return 1.06 - 0.06 * ((t - 0.82) / 0.18);
}

// Release curve: startSy → 1 smoothly, no snap
function pillYCurveRelease(t: number, startSy: number): number {
  if (t < 0.40) {
    const p = easeOut(t / 0.40);
    return startSy + (1.05 - startSy) * p;
  }
  return 1.05 - 0.05 * easeOut((t - 0.40) / 0.60);
}

function navScaleCurve(t: number): number {
  if (t < 0.18) return 1 + 0.022 * (t / 0.18);
  if (t < 0.60) return 1.022 - 0.008 * ((t - 0.18) / 0.42);
  return 1.014 - 0.014 * ((t - 0.60) / 0.40);
}

function overlapToScaleY(r: number): number {
  if (r <= 0) return 1;
  if (r < 0.4) { const p = r / 0.4; return 1 - 0.22 * p * p; }
  if (r < 0.72) { const p = (r - 0.4) / 0.32; return 0.78 + 0.38 * (1 - Math.pow(1 - p, 1.8)); }
  const p = (r - 0.72) / 0.28; return 1.16 - 0.16 * (1 - Math.pow(1 - p, 2));
}
const scaleYtoX = (sy: number) => 1 + (1 - sy) * 0.18;

function overlapRatio(pLeft: number, pWidth: number, tLeft: number, tWidth: number): number {
  const inter = Math.max(0, Math.min(pLeft + pWidth, tLeft + tWidth) - Math.max(pLeft, tLeft));
  return Math.min(inter / tWidth, 1);
}

type IconTf = { sy: number; sx: number };
const DEFAULT_TF: IconTf = { sy: 1, sx: 1 };

interface PillState { left: number; width: number; sy: number; sx: number; shimmer: number; }
interface DragRef {
  startX: number; startCX: number; pointerId: number;
  tapped: TabId | null; mode: "pending" | "drag" | "longpress";
  nearest: TabId; done: boolean; timer: ReturnType<typeof setTimeout>;
}

export default function BottomNav() {
  const [active, setActive] = useState<TabId>("home");
  const [searchScale, setSearchScale] = useState({ sy: 1, sx: 1 });
  const [pill, setPill] = useState<PillState>({ left: 0, width: 0, sy: 1, sx: 1, shimmer: 0 });
  const [navScale, setNavScale] = useState(1);
  const [iconTf, setIconTf] = useState<Record<string, IconTf>>({
    home: DEFAULT_TF, dms: DEFAULT_TF, activity: DEFAULT_TF, more: DEFAULT_TF,
  });

  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const animRaf = useRef(0);
  const shimRaf = useRef(0);
  const dragRef = useRef<DragRef | null>(null);
  const pillRef = useRef<PillState>({ left: 0, width: 0, sy: 1, sx: 1, shimmer: 0 });
  const activeRef = useRef<TabId>("home");


  const [clicked, setClicked] = useState(false);
  const [stretchX, setStretchX] = useState(0);
  const [stretchY, setStretchY] = useState(0);

  const searchDragRef = useRef<{
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);



  const getRect = useCallback((id: string) => {
    const el = tabRefs.current[id];
    const cnt = containerRef.current;
    if (!el || !cnt) return null;
    const a = el.getBoundingClientRect(), b = cnt.getBoundingClientRect();
    return { left: a.left - b.left, width: a.width };
  }, []);

  const allRects = useCallback(() => {
    const r: Record<string, { left: number; width: number }> = {};
    tabs.forEach(t => { const x = getRect(t.id); if (x) r[t.id] = x; });
    return r;
  }, [getRect]);

  const setPillDirect = useCallback((p: Partial<PillState>) => {
    pillRef.current = { ...pillRef.current, ...p };
    setPill(prev => ({ ...prev, ...p }));
  }, []);


  const animShimmer = useCallback((from: number, to: number, dur: number) => {
    cancelAnimationFrame(shimRaf.current);
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      setPillDirect({ shimmer: from + (to - from) * e });
      if (p < 1) shimRaf.current = requestAnimationFrame(step);
    };
    shimRaf.current = requestAnimationFrame(step);
  }, [setPillDirect]);

  /* ── Core animation ── */
  const runAnim = useCallback((
    sL: number, sW: number,
    eL: number, eW: number,          // always the EXACT tab rect — pill always lands here
    targetId: TabId, dur: number,
    startSy = 1,
    onDone?: () => void
  ) => {
    const rects = allRects();
    const goRight = eL >= sL;
    cancelAnimationFrame(animRaf.current);
    animShimmer(0, 1, 200);
    const t0 = performance.now();
    let fadeDone = false;
    const isRelease = startSy > 1.05;

    const step = (now: number) => {
      const t = Math.min((now - t0) / dur, 1);

      // Pill position — always converges to exact eL/eW
      let l: number, w: number;
      if (goRight) {
        const rEdge = (sL + sW) + ((eL + eW) - (sL + sW)) * leadE(t);
        l = sL + (eL - sL) * trailE(t); w = rEdge - l;
      } else {
        l = sL + (eL - sL) * leadE(t);
        const rEdge = (sL + sW) + ((eL + eW) - (sL + sW)) * trailE(t);
        w = rEdge - l;
      }
      w = Math.max(w, Math.min(sW, eW) * 0.72);

      // Scale — smooth from wherever it started
      const sy = isRelease ? pillYCurveRelease(t, startSy) : pillYCurveFresh(t);
      const sx = 1 + (sy - 1) * 0.30;
      setPillDirect({ left: l, width: w, sy, sx });

      setNavScale(navScaleCurve(t));

      const newTf: Record<string, IconTf> = {};
      tabs.forEach(tb => {
        const r = rects[tb.id];
        if (!r) { newTf[tb.id] = DEFAULT_TF; return; }
        const ratio = overlapRatio(l, w, r.left, r.width);
        if (tb.id === targetId) {
          const s = overlapToScaleY(ratio); newTf[tb.id] = { sy: s, sx: scaleYtoX(s) };
        } else if (ratio > 0.02) {
          const s = 1 - ratio * 0.10; newTf[tb.id] = { sy: s, sx: scaleYtoX(s) };
        } else {
          newTf[tb.id] = DEFAULT_TF;
        }
      });
      setIconTf({ ...newTf });

      if (!fadeDone && t >= 0.62) { fadeDone = true; animShimmer(1, 0, 300); }
      if (t < 1) {
        animRaf.current = requestAnimationFrame(step);
      } else {
        // Hard-set to exact tab position — pill can NEVER rest off-center
        setPillDirect({ left: eL, width: eW, sy: 1, sx: 1, shimmer: 0 });
        setNavScale(1);
        const final: Record<string, IconTf> = {};
        tabs.forEach(tb => { final[tb.id] = DEFAULT_TF; });
        setIconTf(final);
        onDone?.();
      }
    };
    animRaf.current = requestAnimationFrame(step);
  }, [allRects, animShimmer, setPillDirect]);

  const goToTab = useCallback((id: TabId) => {
    if (id === activeRef.current) return;
    const from = getRect(activeRef.current), to = getRect(id);
    if (!from || !to) return;
    activeRef.current = id;
    setActive(id);
    runAnim(from.left, from.width, to.left, to.width, id, 240, 1);
  }, [getRect, runAnim]);

  useEffect(() => {
    const r = getRect("home");
    if (r) setPillDirect({ left: r.left, width: r.width });
  }, [getRect, setPillDirect]);

  /* ── Pointer handlers ── */

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {

    if (e.button > 0) return; // only left click / touch

    const nb = containerRef.current!.getBoundingClientRect();
    const x = e.clientX - nb.left;

    let tapped: TabId | null = null;

    tabs.forEach(({ id }) => {
      const r = getRect(id);
      if (r && x >= r.left - 4 && x <= r.left + r.width + 4) {
        tapped = id;
      }
    });

    const timer = setTimeout(() => {
      const d = dragRef.current;
      if (!d || d.done) return;

      d.mode = "longpress";

      setPillDirect({
        sy: PEAK_SY,
        sx: 1 + (PEAK_SY - 1) * 0.30,
      });

      setNavScale(1.022);

      try {
        containerRef.current?.setPointerCapture(d.pointerId);
      } catch (_) { }
    }, 200);

    dragRef.current = {
      startX: x,
      startCX: e.clientX,
      pointerId: e.pointerId,
      tapped,
      mode: "pending",
      nearest: tapped ?? activeRef.current,
      done: false,
      timer,
    };

    e.preventDefault();
  }, [getRect, setPillDirect]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.done) return;

    const nb = containerRef.current!.getBoundingClientRect();
    const x = e.clientX - nb.left;
    const dx = x - d.startX;

    // Start drag if moved enough
    if (d.mode === "pending" && Math.abs(dx) > 7) {
      clearTimeout(d.timer);
      d.mode = "drag";

      setPillDirect({
        sy: PEAK_SY,
        sx: 1 + (PEAK_SY - 1) * 0.30,
      });

      setNavScale(1.022);

      try {
        containerRef.current?.setPointerCapture(d.pointerId);
      } catch (_) { }
    }

    if (d.mode !== "drag" && d.mode !== "longpress") return;

    cancelAnimationFrame(animRaf.current);
    cancelAnimationFrame(shimRaf.current);

    // 🔥 Find nearest tab
    let nearest: TabId = d.nearest;
    let nearestDist = Infinity;

    tabs.forEach(({ id }) => {
      const r = getRect(id);
      if (!r) return;

      const dist = Math.abs(x - (r.left + r.width / 2));
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = id;
      }
    });

    d.nearest = nearest;

    // 🔥 Pill follow pointer
    const tr = getRect(nearest);
    if (!tr) return;

    const pw = tr.width;
    const maxL = nb.width - 12 - pw;
    const newL = Math.max(0, Math.min(x - pw / 2, maxL));

    setPillDirect({
      left: newL,
      width: pw,
      sy: PEAK_SY,
      sx: 1 + (PEAK_SY - 1) * 0.30,
      shimmer: 0.25,
    });

    setNavScale(1.022);

    // Reset icons
    const newTf: Record<string, IconTf> = {};
    tabs.forEach(({ id }) => {
      newTf[id] = DEFAULT_TF;
    });

    setIconTf(newTf);
    setActive(nearest);

  }, [getRect, setPillDirect]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;

    clearTimeout(d.timer);
    d.done = true;
    dragRef.current = null;

    const dx = e.clientX - d.startCX;

    if (d.mode === "drag" || d.mode === "longpress") {
      const targetId = d.nearest;
      const { left: sL, width: sW, sy: currentSy } = pillRef.current;

      const to = getRect(targetId);
      if (!to) {
        setPillDirect({ sy: 1, sx: 1 });
        setNavScale(1);
        return;
      }

      activeRef.current = targetId;
      setActive(targetId);

      runAnim(sL, sW, to.left, to.width, targetId, 520, currentSy);

    } else if (Math.abs(dx) < 8 && d.tapped) {
      // 🔥 Tap case
      goToTab(d.tapped);

    } else {
      // 🔥 Fallback snap
      const to = getRect(activeRef.current);
      if (to) {
        setPillDirect({
          left: to.left,
          width: to.width,
          sy: 1,
          sx: 1,
        });
      }
      setNavScale(1);
    }
  }, [getRect, setPillDirect, runAnim, goToTab]);

  const handlePointerCancel = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;

    clearTimeout(d.timer);
    d.done = true;
    dragRef.current = null;

    const to = getRect(activeRef.current);
    const { left: sL, width: sW, sy: currentSy } = pillRef.current;

    if (to) {
      runAnim(sL, sW, to.left, to.width, activeRef.current, 420, currentSy);
    } else {
      setPillDirect({ sy: 1, sx: 1 });
      setNavScale(1);
    }
  }, [getRect, setPillDirect, runAnim]);

  /* ── Pointer handlers ── */
  useEffect(() => () => {
    cancelAnimationFrame(animRaf.current);
    cancelAnimationFrame(shimRaf.current);
  }, []);

  /* ── Pill styles ── */
  const s = pill.shimmer;
  const pillBg = `rgba(255,255,255,${0.18 + s * 0.08})`;
  const pillBoxShadow = [
    `inset 0 1px 0 rgba(255,255,255,${0.55 + s * 0.35})`,
    `inset 0 -1px 0 rgba(255,255,255,${0.08 + s * 0.10})`,
    `inset 1px 0 0 rgba(255,255,255,${0.12 + s * 0.15})`,
    `inset -1px 0 0 rgba(255,255,255,${0.10 + s * 0.10})`,
    `0 8px 32px rgba(0,0,0,${0.28 + s * 0.12})`,
    `0 2px 8px rgba(0,0,0,0.20)`,
  ].join(",");

  // 🔥 static values (component ke andar top pe define karo)
  const searchBg = "rgba(255,255,255,0.18)";
  const searchBorder = "0.5px solid rgba(255,255,255,0.22)";
  const searchShadow = [
    "inset 0 1px 0 rgba(255,255,255,0.65)",
    "inset 0 -1px 0 rgba(255,255,255,0.12)",
    "inset 1px 0 0 rgba(255,255,255,0.18)",
    "inset -1px 0 0 rgba(255,255,255,0.14)",
    "0 8px 32px rgba(0,0,0,0.35)",
    "0 2px 8px rgba(0,0,0,0.20)"
  ].join(",");


  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(145deg, #020617 0%, #0f172a 40%, #1e3a8a 75%, #2563eb 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
      fontFamily: "'SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif",
      paddingBottom: 48, userSelect: "none", WebkitUserSelect: "none",
      position: "relative", overflow: "hidden",
    }}>
      {/* Bokeh blobs */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <div style={{ position: "absolute", width: 340, height: 340, borderRadius: "50%", background: "radial-gradient(circle,rgba(88,86,214,.35) 0%,transparent 70%)", top: -80, left: -60, filter: "blur(40px)" }} />
        <div style={{ position: "absolute", width: 280, height: 280, borderRadius: "50%", background: "radial-gradient(circle,rgba(52,199,89,.18) 0%,transparent 70%)", top: 40, right: -40, filter: "blur(50px)" }} />
        <div style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,rgba(10,132,255,.22) 0%,transparent 70%)", bottom: 60, left: "20%", filter: "blur(60px)" }} />
        <div style={{ position: "absolute", width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,55,95,.16) 0%,transparent 70%)", bottom: 100, right: 30, filter: "blur(45px)" }} />
        <div style={{ position: "absolute", width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,214,10,.10) 0%,transparent 70%)", top: "35%", left: "40%", filter: "blur(35px)" }} />
      </div>

      {/* Page content */}
      <div style={{ flex: 1, position: "relative", zIndex: 1, width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {tabs.map(t => (
          <div key={t.id} style={{
            position: "absolute", display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
            opacity: active === t.id ? 1 : 0,
            transform: active === t.id ? "translateY(0) scale(1)" : "translateY(16px) scale(0.95)",
            transition: "opacity 0.45s ease, transform 0.55s cubic-bezier(0.34,1.4,0.64,1)",
          }}>
            <p style={{ fontSize: 28, fontWeight: 600, color: "rgba(255,255,255,.92)", margin: 0, letterSpacing: "-.5px", textShadow: "0 2px 12px rgba(0,0,0,.4)" }}>{t.text}</p>
          </div>
        ))}
      </div>

      {/* Nav row */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: "10px", padding: "0 6px", }}>
        <div
          ref={containerRef}
          style={{
            position: "relative", display: "flex", alignItems: "center", width: "100%",
            justifyContent: "space-between",
            background: "rgba(255,255,255,.10)",
            backdropFilter: "blur(40px) saturate(180%)",
            WebkitBackdropFilter: "blur(40px) saturate(180%)",
            borderRadius: 100, padding: "5px 6px",
            boxShadow: [
              "inset 0 1px 0 rgba(255,255,255,.30)",
              "inset 0 -1px 0 rgba(255,255,255,.04)",
              "inset 1px 0 0 rgba(255,255,255,.08)",
              "inset -1px 0 0 rgba(255,255,255,.06)",
              "0 20px 60px rgba(0,0,0,.45)",
              "0 4px 16px rgba(0,0,0,.30)",
            ].join(","),
            border: ".5px solid rgba(255,255,255,.14)",
            touchAction: "none", cursor: "pointer",
            overflow: "visible",
            transform: `scale(${navScale})`,
            transformOrigin: "center center",
            willChange: "transform",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {/* Pill */}
          <div style={{
            position: "absolute",
            top: 5,
            bottom: 5,
            left: pill.left,
            width: pill.width,
            borderRadius: 100,
            background: pillBg,
            backdropFilter: "blur(20px) saturate(200%)",
            WebkitBackdropFilter: "blur(20px) saturate(200%)",
            boxShadow: pillBoxShadow,
            border: `0.5px solid rgba(255,255,255,${0.20 + s * 0.15})`,
            transform: `scaleY(${pill.sy > 1 ? pill.sy * 1.08 : pill.sy}) scaleX(${pill.sy > 1 ? pill.sx * 1.06 : pill.sx})`,
            transformOrigin: "center center",
            willChange: "left,width,transform",
            overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: 0, left: "8%", right: "8%", height: 1.5, borderRadius: 10, background: `rgba(255,255,255,${0.60 + s * 0.35})` }} />
            <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 0%,rgba(255,255,255,${0.12 + s * 0.10}) 0%,transparent 70%)` }} />
            <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 1, borderRadius: 10, background: `rgba(0,0,0,${0.12 - s * 0.08})` }} />
          </div>

          {/* Tabs */}
          {tabs.map(tab => {
            const isActive = active === tab.id;
            const tf = iconTf[tab.id] ?? DEFAULT_TF;
            return (
              <button key={tab.id} ref={el => { tabRefs.current[tab.id] = el; }} style={{
                position: "relative", zIndex: 1,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                padding: "8px 0px", border: "none", background: "transparent",
                cursor: "pointer", borderRadius: 100, minWidth: 68,
                color: isActive ? "rgba(255,255,255,.96)" : "rgba(255,255,255,.42)",
                WebkitTapHighlightColor: "transparent", outline: "none",
                transition: "color .35s ease",
              }}>
                <div style={{
                  transform: `scaleY(${tf.sy}) scaleX(${tf.sx})`,
                  transformOrigin: "center bottom",
                  willChange: "transform", lineHeight: 1,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  filter: isActive ? "drop-shadow(0 0 8px rgba(255,255,255,0.5))" : "none",
                  transition: "filter .35s ease",
                }}>
                  <tab.Icon />
                </div>
                <span style={{
                  fontSize: 11, fontWeight: isActive ? 600 : 400, lineHeight: 1,
                  letterSpacing: isActive ? "-.2px" : ".1px",
                  transition: "font-weight .3s, letter-spacing .3s, color .35s ease",
                  display: "inline-block", transform: `scaleX(${tf.sx})`, willChange: "transform",
                }}>
                  {tab.text}
                </span>
              </button>
            );
          })}
        </div>
        {/* Search Button */}
        <div
          style={{
            width: 52,
            height: 52,
            position: "relative",
            flexShrink: 0,
          }}
        >
          <button
            data-search
            style={{
              position: "absolute", 
              inset: 0,             
              borderRadius: "50%",
              background: searchBg,
              backdropFilter: "blur(20px) saturate(200%)",
              WebkitBackdropFilter: "blur(20px) saturate(200%)",
              boxShadow: searchShadow,
              border: searchBorder,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "rgba(255,255,255,.65)",
              outline: "none",
              overflow: "hidden",
              zIndex: 10,
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
              willChange: "transform",
              transformOrigin: "center center",
              transition: searchDragRef.current?.dragging
                ? "none"
                : "transform 0.25s cubic-bezier(0.34,1.56,0.64,1)",

              transform: (() => {
                const dx = stretchX;
                const dy = stretchY;

                const absX = Math.abs(dx);
                const absY = Math.abs(dy);

                const nx = Math.min(absX / 40, 1);
                const ny = Math.min(absY / 40, 1);

                const easeX = 1 - Math.pow(1 - nx, 2);
                const easeY = 1 - Math.pow(1 - ny, 2);

                const scaleX = 1 + easeX * 0.4 - easeY * 0.15;
                const scaleY = 1 + easeY * 0.4 - easeX * 0.15;

                const tx = dx * 0.4;
                const ty = dy * 0.4;

                return `
          scaleX(${scaleX})
          scaleY(${scaleY})
          scale(${clicked ? 1.2307 : 1})
        `;
              })(),
            }}

            onPointerDown={(e) => {
              e.stopPropagation();

              setClicked(true);

              searchDragRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                dragging: false,
              };

              e.currentTarget.setPointerCapture(e.pointerId);
            }}

            onPointerMove={(e) => {
              const d = searchDragRef.current;
              if (!d) return;

              e.preventDefault();

              const dx = e.clientX - d.startX;
              const dy = e.clientY - d.startY;

              if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                d.dragging = true;
              }

              if (d.dragging) {
                const clampX = Math.max(-40, Math.min(40, dx));
                const clampY = Math.max(-40, Math.min(40, dy));

                setStretchX(clampX);
                setStretchY(clampY);
              }
            }}

            onPointerUp={(e) => {
              e.stopPropagation();

              const d = searchDragRef.current;

              if (!d?.dragging) {
                console.log("Search clicked!");
              }

              setTimeout(() => {
                setClicked(false);
                setStretchX(0);
                setStretchY(0);
              }, 120);

              searchDragRef.current = null;
            }}

            onPointerLeave={(e) => {
              e.stopPropagation();

              setClicked(false);
              setStretchX(0);
              setStretchY(0);
              searchDragRef.current = null;
            }}

            onTouchMove={(e) => {
              e.preventDefault();
            }}
          >
            <SearchIcon />
          </button>
        </div>
      </div>
    </div>
  );
}