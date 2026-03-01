import { useEffect, useRef } from "react";

// Dot physics
const SPACING = 28;
const DOT_RADIUS = 1;
const REPEL_RADIUS = 100;
const REPEL_STRENGTH = 7;
const SPRING_K = 0.06;
const DAMPING = 0.78;

// Twinkle config
const TARGET_TWINKLE = 50; // ~dots twinkling at steady state
const TWINKLE_LIFETIME = 240; // frames each twinkle lasts (~1.3s at 60fps)
const TWINKLE_DECAY = Math.pow(0.01, 1 / TWINKLE_LIFETIME);

interface Dot {
  ox: number;
  oy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  twinkle: number; // 0–1 brightness boost
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
    let twinkleRate = 0;
    let W = 0,
      H = 0;
    let mx = -9999,
      my = -9999;
    let animId: number;

    function buildDots() {
      dots = [];
      const cols = Math.ceil(W / SPACING) + 1;
      const rows = Math.ceil(H / SPACING) + 1;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          dots.push({
            ox: c * SPACING,
            oy: r * SPACING,
            x: c * SPACING,
            y: r * SPACING,
            vx: 0,
            vy: 0,
            twinkle: 0,
          });
      twinkleRate =
        TARGET_TWINKLE / (TWINKLE_LIFETIME * Math.max(1, dots.length));
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

      // --- Base dots (single batched draw) ---
      ctx!.fillStyle = "hsl(260, 20%, 45%)";
      ctx!.globalAlpha = 0.45;
      ctx!.beginPath();

      for (const d of dots) {
        // Cursor repulsion
        const dx = d.x - mx;
        const dy = d.y - my;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < REPEL_RADIUS * REPEL_RADIUS && dist2 > 0) {
          const dist = Math.sqrt(dist2);
          const t = 1 - dist / REPEL_RADIUS;
          d.vx += (dx / dist) * t * t * REPEL_STRENGTH;
          d.vy += (dy / dist) * t * t * REPEL_STRENGTH;
        }

        // Spring + damping
        d.vx += (d.ox - d.x) * SPRING_K;
        d.vy += (d.oy - d.y) * SPRING_K;
        d.vx *= DAMPING;
        d.vy *= DAMPING;
        d.x += d.vx;
        d.y += d.vy;

        // Randomly trigger twinkle
        if (d.twinkle < 0.05 && Math.random() < twinkleRate)
          d.twinkle = 0.6 + Math.random() * 0.4;
        d.twinkle *= TWINKLE_DECAY;

        ctx!.moveTo(d.x + DOT_RADIUS, d.y);
        ctx!.arc(d.x, d.y, DOT_RADIUS, 0, Math.PI * 2);
      }

      ctx!.fill();

      // --- Twinkling dots (individual bright overlays) ---
      for (const d of dots) {
        if (d.twinkle < 0.02) continue;
        ctx!.globalAlpha = d.twinkle * 0.9;
        ctx!.fillStyle = "hsl(200, 100%, 88%)";
        ctx!.beginPath();
        ctx!.arc(d.x, d.y, DOT_RADIUS * (1 + d.twinkle * 0.9), 0, Math.PI * 2);
        ctx!.fill();
      }

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
