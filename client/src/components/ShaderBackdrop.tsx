import React, { useEffect, useRef } from 'react';

interface ShaderBackdropProps {
  className?: string;
  intensity?: 'subtle' | 'hero';
}

/**
 * Living organic shader-style canvas backdrop inspired by OpenShaders & Designeer.
 * Renders smooth volumetric violet/cyan/amber wave fields with zero external WebGL deps.
 */
export const ShaderBackdrop: React.FC<ShaderBackdropProps> = ({
  className = '',
  intensity = 'hero'
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let t = 0;
    let mouseX = 0.5;
    let mouseY = 0.4;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(320, Math.floor(parent.clientWidth * 0.5 * dpr));
      canvas.height = Math.max(200, Math.floor(parent.clientHeight * 0.5 * dpr));
    };

    resize();
    window.addEventListener('resize', resize);

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX / Math.max(1, window.innerWidth);
      mouseY = e.clientY / Math.max(1, window.innerHeight);
    };
    window.addEventListener('mousemove', onMove, { passive: true });

    const alphaScale = intensity === 'hero' ? 1 : 0.45;

    const render = () => {
      t += 0.008;
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // Deep obsidian base
      ctx.fillStyle = '#060608';
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'screen';

      // Ribbon 1: Deep Violet Wave
      const x1 = w * (0.35 + Math.sin(t * 0.7) * 0.12 + (mouseX - 0.5) * 0.08);
      const y1 = h * (0.38 + Math.cos(t * 0.5) * 0.1 + (mouseY - 0.5) * 0.06);
      const g1 = ctx.createRadialGradient(x1, y1, w * 0.02, x1, y1, w * 0.55);
      g1.addColorStop(0, `rgba(139, 92, 246, ${0.26 * alphaScale})`);
      g1.addColorStop(0.45, `rgba(79, 70, 229, ${0.12 * alphaScale})`);
      g1.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);

      // Ribbon 2: Electric Cyan / Steel Arc
      const x2 = w * (0.68 + Math.cos(t * 0.6) * 0.14 - (mouseX - 0.5) * 0.08);
      const y2 = h * (0.48 + Math.sin(t * 0.8) * 0.12);
      const g2 = ctx.createRadialGradient(x2, y2, w * 0.02, x2, y2, w * 0.5);
      g2.addColorStop(0, `rgba(34, 211, 238, ${0.19 * alphaScale})`);
      g2.addColorStop(0.5, `rgba(59, 130, 246, ${0.09 * alphaScale})`);
      g2.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);

      // Ribbon 3: Warm Iridescent Core (Designeer voice glow)
      const x3 = w * (0.5 + Math.sin(t * 0.45) * 0.18);
      const y3 = h * (0.72 + Math.cos(t * 0.65) * 0.08);
      const g3 = ctx.createRadialGradient(x3, y3, w * 0.01, x3, y3, w * 0.42);
      g3.addColorStop(0, `rgba(251, 146, 60, ${0.11 * alphaScale})`);
      g3.addColorStop(0.55, `rgba(192, 132, 252, ${0.07 * alphaScale})`);
      g3.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g3;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'source-over';
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
    };
  }, [intensity]);

  return (
    <div className={`pointer-events-none overflow-hidden ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full object-cover"
        style={{ filter: 'blur(28px) saturate(1.25)' }}
      />
      <div className="absolute inset-0 grain-overlay" />
    </div>
  );
};
