import React from 'react';
import { Film, Calendar, Layers, Terminal } from 'lucide-react';
import { HealthInfo } from '../types';

interface NavbarProps {
  currentTab: 'home' | 'project' | 'schedule';
  onSelectTab: (tab: 'home' | 'project' | 'schedule') => void;
  activeProjectId: string | null;
  health: HealthInfo | null;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  activeProjectId,
  health
}) => {
  const hasFfmpegIssue = health && !health.ffmpeg.available;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-[#07080a]/85 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Left: Brand Identity */}
        <div
          onClick={() => onSelectTab('home')}
          className="flex items-center gap-3 cursor-pointer group"
        >
          {/* Minimalist studio logo mark */}
          <div className="relative w-7 h-7 rounded-lg bg-gradient-to-b from-zinc-700 to-zinc-900 border border-white/10 flex items-center justify-center shadow-sm group-hover:border-white/20 transition-all">
            <span className="text-[12px] font-black text-white tracking-tighter">SF</span>
            <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-brand-500 shadow-[0_0_8px_#3b82f6]" />
          </div>

          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm tracking-tight text-white group-hover:text-zinc-200 transition-colors">
              ShortsForge
            </span>
            <span className="text-[10px] font-mono text-zinc-500 border border-white/[0.07] px-1.5 py-0.5 rounded-md bg-white/[0.02]">
              v1.0
            </span>
          </div>
        </div>

        {/* Center: Designeer-style Capsule Segmented Navigation */}
        <nav className="flex items-center p-1 rounded-full bg-zinc-900/90 border border-white/[0.08] shadow-inner-light">
          <button
            onClick={() => onSelectTab('home')}
            className={`flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
              currentTab === 'home'
                ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Projects</span>
          </button>

          {activeProjectId && (
            <button
              onClick={() => onSelectTab('project')}
              className={`flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                currentTab === 'project'
                  ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Studio</span>
            </button>
          )}

          <button
            onClick={() => onSelectTab('schedule')}
            className={`flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
              currentTab === 'schedule'
                ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Publishing</span>
          </button>
        </nav>

        {/* Right: Status Pill & System Diagnostics */}
        <div className="flex items-center gap-2.5">
          {hasFfmpegIssue ? (
            <div
              title={health?.ffmpeg.message}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/25 text-red-400 text-[11px] font-medium"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span>FFmpeg Missing</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-white/[0.06] text-zinc-400 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
              <span className="font-mono text-[10px] text-zinc-300">Local Studio</span>
            </div>
          )}

          <div className="hidden md:flex items-center gap-1 text-[10px] font-mono text-zinc-500 px-2 py-1 rounded-md bg-zinc-900/60 border border-white/[0.04]">
            <Terminal className="w-3 h-3 text-zinc-600" />
            <span>3001</span>
          </div>
        </div>
      </div>
    </header>
  );
};
