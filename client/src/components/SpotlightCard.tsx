import React, { useRef } from 'react';

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  interactive?: boolean;
}

/**
 * Raycast / Linear-style obsidian card with cursor-tracking radial border & surface sheen.
 */
export const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  interactive = true,
  className = '',
  onMouseMove,
  ...rest
}) => {
  const ref = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      ref.current.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      ref.current.style.setProperty('--my', `${e.clientY - rect.top}px`);
    }
    onMouseMove?.(e);
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      className={`group/spot relative rounded-2xl bg-[#0b0b0f]/90 border border-white/[0.08] shadow-[0_12px_36px_-12px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-200 ${
        interactive ? 'hover:-translate-y-0.5 hover:border-white/[0.18]' : ''
      } ${className}`}
      {...rest}
    >
      {/* Cursor spotlight sheen */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover/spot:opacity-100 transition-opacity duration-300"
        style={{
          background:
            'radial-gradient(380px circle at var(--mx, 50%) var(--my, 50%), rgba(255, 255, 255, 0.065), transparent 65%)'
        }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
};
