import { useEffect, useRef } from "react";

// Dot physics
const SPACING = 28;
const DOT_RADIUS = 1;
const REPEL_RADIUS = 100;
const REPEL_STRENGTH = 7;
const SPRING_K = 0.06;
const DAMPING = 0.78;

// Synapse config
const MAX_CONN_DIST = 300; // max px between connected dots
const KEEP_RATIO = 0.4; // fraction of eligible pairs to keep
const TARGET_ACTIVE = 30; // target steady-state active synapse count
const SYNAPSE_LIFETIME = 120; // frames a synapse is visible (~1.5s at 60fps)
const DECAY = Math.pow(0.01, 1 / SYNAPSE_LIFETIME); // opacity multiplier per frame
const CURSOR_FIRE_MULT = 6; // how much faster synapses near cursor fire
const CURSOR_FIRE_RADIUS = 130;

interface Dot {
  ox: number;
  oy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Synapse {
  ai: number;
  bi: number;
  opacity: number;
  hue: number; // slight cyan-to-blue variation per synapse
}

export default function DotGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let dots: Dot[] = [];
    let synapses: Synapse[] = [];
    let fireRate = 0;
    let W = 0,
      H = 0;
    let mx = -9999,
      my = -9999;
    let animId: number;

    function buildDots() {
      dots = [];
      synapses = [];
      const cols = Math.ceil(W / SPACING) + 1;
      const rows = Math.ceil(H / SPACING) + 1;
      const maxDist2 = MAX_CONN_DIST * MAX_CONN_DIST;

      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          dots.push({
            ox: c * SPACING,
            oy: r * SPACING,
            x: c * SPACING,
            y: r * SPACING,
            vx: 0,
            vy: 0,
          });

      // Build sparse synapses from nearby pairs (forward-only to avoid duplicates)
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          for (let dr = 0; dr <= 2; dr++) {
            for (let dc = dr === 0 ? 1 : -2; dc <= 2; dc++) {
              const nr = r + dr,
                nc = c + dc;
              if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
              const j = nr * cols + nc;
              const ddx = dots[i].ox - dots[j].ox;
              const ddy = dots[i].oy - dots[j].oy;
              if (
                ddx * ddx + ddy * ddy < maxDist2 &&
                Math.random() < KEEP_RATIO
              )
                synapses.push({
                  ai: i,
                  bi: j,
                  opacity: 0,
                  hue: 185 + Math.random() * 25,
                });
            }
          }
        }
      }

      // Scale fire rate so ~TARGET_ACTIVE synapses are lit at steady state
      fireRate =
        TARGET_ACTIVE / (SYNAPSE_LIFETIME * Math.max(1, synapses.length));
    }

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width = W + "px";
      canvas!.style.height = H + "px";
      ctx!.scale(dpr, dpr);
      buildDots();
    }

    function tick() {
      ctx!.clearRect(0, 0, W, H);

      // --- Synapses (drawn under dots) ---
      ctx!.lineWidth = 0.6;
      for (const s of synapses) {
        const da = dots[s.ai];
        const db = dots[s.bi];

        // Boost fire rate near cursor
        const midX = (da.x + db.x) * 0.5;
        const midY = (da.y + db.y) * 0.5;
        const cdx = midX - mx,
          cdy = midY - my;
        const nearCursor =
          cdx * cdx + cdy * cdy < CURSOR_FIRE_RADIUS * CURSOR_FIRE_RADIUS;
        const rate = nearCursor ? fireRate * CURSOR_FIRE_MULT : fireRate;

        if (s.opacity < 0.02 && Math.random() < rate)
          s.opacity = 0.35 + Math.random() * 0.55;

        s.opacity *= DECAY;
        if (s.opacity < 0.01) continue;

        ctx!.globalAlpha = s.opacity;
        ctx!.strokeStyle = `hsl(${s.hue}, 100%, 68%)`;
        ctx!.beginPath();
        ctx!.moveTo(da.x, da.y);
        ctx!.lineTo(db.x, db.y);
        ctx!.stroke();
      }

      // --- Dots (drawn on top of synapses) ---
      ctx!.fillStyle = "hsl(260, 20%, 45%)";
      ctx!.globalAlpha = 0.45;
      ctx!.beginPath();

      for (const d of dots) {
        const dx = d.x - mx;
        const dy = d.y - my;
        const dist2 = dx * dx + dy * dy;

        if (dist2 < REPEL_RADIUS * REPEL_RADIUS && dist2 > 0) {
          const dist = Math.sqrt(dist2);
          const t = 1 - dist / REPEL_RADIUS;
          d.vx += (dx / dist) * t * t * REPEL_STRENGTH;
          d.vy += (dy / dist) * t * t * REPEL_STRENGTH;
        }

        d.vx += (d.ox - d.x) * SPRING_K;
        d.vy += (d.oy - d.y) * SPRING_K;
        d.vx *= DAMPING;
        d.vy *= DAMPING;
        d.x += d.vx;
        d.y += d.vy;

        ctx!.moveTo(d.x + DOT_RADIUS, d.y);
        ctx!.arc(d.x, d.y, DOT_RADIUS, 0, Math.PI * 2);
      }

      ctx!.fill();
      animId = requestAnimationFrame(tick);
    }

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
    };
    const onLeave = () => {
      mx = -9999;
      my = -9999;
    };

    resize();
    tick();

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas ref={canvasRef} className="pointer-events-none fixed inset-0" />
  );
}
