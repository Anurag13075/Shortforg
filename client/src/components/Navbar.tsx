import React from 'react';
import { Layers, Film, Calendar, Terminal, Search, Bot, KeyRound } from 'lucide-react';
import { HealthInfo } from '../types';

interface NavbarProps {
  currentTab: 'home' | 'project' | 'schedule' | 'copilot';
  onSelectTab: (tab: 'home' | 'project' | 'schedule' | 'copilot') => void;
  activeProjectId: string | null;
  health: HealthInfo | null;
  hasCookies?: boolean;
  onOpenCookiesModal?: () => void;
  onSearchFocus?: () => void;
  onToggleCopilot?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  activeProjectId,
  health,
  onSearchFocus,
  onToggleCopilot
}) => {
  const hasFfmpegIssue = health && !health.ffmpeg.available;

  return (
    <header className="sticky top-0 z-30 w-full border-b border-white/[0.06] bg-[#090a0f]/90 backdrop-blur-md px-4 sm:px-6 h-14 flex items-center justify-between">
      {/* Mobile Branding / Desktop Breadcrumb */}
      <div className="flex items-center gap-3">
        <div
          onClick={() => onSelectTab('home')}
          className="flex lg:hidden items-center gap-2 cursor-pointer"
        >
          <div className="w-6 h-6 rounded-md bg-[#141620] border border-white/10 flex items-center justify-center">
            <Film className="w-3.5 h-3.5 text-zinc-300" />
          </div>
          <span className="font-bold text-xs tracking-tight text-white">ShortsForge</span>
        </div>

        {/* Desktop Quick Command Search */}
        <div
          onClick={onSearchFocus}
          className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-[#111218] hover:bg-[#151722] border border-white/[0.06] cursor-pointer transition-colors text-zinc-400 w-64 group"
        >
          <Search className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
          <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors font-mono">
            Search projects...
          </span>
          <kbd className="ml-auto font-mono text-[9px] text-zinc-500 bg-white/[0.04] border border-white/[0.08] px-1.5 py-0.5 rounded">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Segmented Capsule Tabs (Visible on mobile & tablet) */}
      <nav className="flex lg:hidden items-center p-1 rounded-lg bg-[#111218] border border-white/[0.08]">
        <button
          onClick={() => onSelectTab('home')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
            currentTab === 'home'
              ? 'bg-zinc-800 text-white font-semibold shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Feed</span>
        </button>

        {activeProjectId && (
          <button
            onClick={() => onSelectTab('project')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              currentTab === 'project'
                ? 'bg-zinc-800 text-white font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Studio</span>
          </button>
        )}

        <button
          onClick={() => onSelectTab('schedule')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
            currentTab === 'schedule'
              ? 'bg-zinc-800 text-white font-semibold shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Queue</span>
        </button>

        <button
          onClick={() => onSelectTab('copilot')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
            currentTab === 'copilot'
              ? 'bg-zinc-800 text-white font-semibold shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Bot className="w-3.5 h-3.5 text-blue-400" />
          <span>Copilot</span>
        </button>
      </nav>

      {/* Right Action Bar: Copilot Toggle & Status */}
      <div className="flex items-center gap-2.5">
        {onOpenCookiesModal && (
          <button
            onClick={onOpenCookiesModal}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all shadow-sm cursor-pointer ${
              hasCookies
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
            }`}
            title="Configure YouTube Cookies Vault (bypasses bot challenges)"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-medium">YT Auth</span>
            <span className={`text-[9px] px-1 py-0.2 rounded border ${
              hasCookies
                ? 'bg-emerald-400/20 text-emerald-200 border-emerald-400/30'
                : 'bg-amber-400/20 text-amber-200 border-amber-400/30'
            }`}>
              {hasCookies ? 'ACTIVE' : 'SETUP'}
            </span>
          </button>
        )}

        <button
          onClick={onToggleCopilot || (() => onSelectTab('copilot'))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111218] hover:bg-[#161722] border border-white/[0.08] text-xs font-mono text-zinc-300 hover:text-white transition-all shadow-sm cursor-pointer group"
          title="Toggle Master Scheduling Copilot"
        >
          <Bot className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform" />
          <span className="hidden sm:inline font-medium">Copilot</span>
          <span className="text-[9px] px-1 py-0.2 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
            AI
          </span>
        </button>

        {hasFfmpegIssue ? (
          <div
            title={health?.ffmpeg.message}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/25 text-rose-400 text-[11px] font-medium"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            <span>FFmpeg Missing</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#111218] border border-white/[0.06] text-zinc-400 text-[11px] font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
            <span className="text-zinc-300">Studio Ready</span>
          </div>
        )}

        <div className="hidden md:flex items-center gap-1 text-[10px] font-mono text-zinc-500 px-2 py-1 rounded bg-[#111218] border border-white/[0.04]">
          <Terminal className="w-3 h-3 text-zinc-600" />
          <span>3001</span>
        </div>
      </div>
    </header>
  );
};
