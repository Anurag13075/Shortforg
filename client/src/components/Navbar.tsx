import React from 'react';
import { Layers, Film, Calendar, Terminal, Search, Sparkles } from 'lucide-react';
import { HealthInfo } from '../types';

interface NavbarProps {
  currentTab: 'home' | 'project' | 'schedule';
  onSelectTab: (tab: 'home' | 'project' | 'schedule') => void;
  activeProjectId: string | null;
  health: HealthInfo | null;
  onSearchFocus?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  activeProjectId,
  health,
  onSearchFocus
}) => {
  const hasFfmpegIssue = health && !health.ffmpeg.available;

  return (
    <header className="sticky top-0 z-30 w-full border-b border-white/[0.06] bg-[#090a0d]/85 backdrop-blur-xl px-4 sm:px-6 h-14 flex items-center justify-between">
      {/* Mobile Branding / Desktop Breadcrumb */}
      <div className="flex items-center gap-3">
        <div
          onClick={() => onSelectTab('home')}
          className="flex lg:hidden items-center gap-2 cursor-pointer"
        >
          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-xs tracking-tight text-white">ShortsForge</span>
        </div>

        {/* Desktop Quick Command Search Capsule */}
        <div
          onClick={onSearchFocus}
          className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] cursor-pointer transition-colors text-zinc-400 w-64 group"
        >
          <Search className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
          <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">
            Quick command...
          </span>
          <kbd className="ml-auto font-mono text-[9px] text-zinc-500 bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Segmented Capsule Tabs (Visible on mobile & tablet) */}
      <nav className="flex lg:hidden items-center p-1 rounded-full bg-zinc-900/90 border border-white/[0.08]">
        <button
          onClick={() => onSelectTab('home')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
            currentTab === 'home'
              ? 'bg-white text-zinc-950 font-semibold shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Feed</span>
        </button>

        {activeProjectId && (
          <button
            onClick={() => onSelectTab('project')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
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
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
            currentTab === 'schedule'
              ? 'bg-white text-zinc-950 font-semibold shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Queue</span>
        </button>
      </nav>

      {/* System Status Pill */}
      <div className="flex items-center gap-3">
        {hasFfmpegIssue ? (
          <div
            title={health?.ffmpeg.message}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/25 text-rose-400 text-[11px] font-medium"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            <span>FFmpeg Missing</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.02] border border-white/[0.06] text-zinc-400 text-[11px] font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
            <span className="text-zinc-300">Studio Ready</span>
          </div>
        )}

        <div className="hidden md:flex items-center gap-1 text-[10px] font-mono text-zinc-500 px-2 py-1 rounded-md bg-white/[0.02] border border-white/[0.04]">
          <Terminal className="w-3 h-3 text-zinc-600" />
          <span>3001</span>
        </div>
      </div>
    </header>
  );
};
