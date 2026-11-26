import React from 'react';
import { Layers, Film, Calendar, Search, Bot, KeyRound, Video, Sparkles } from 'lucide-react';
import { HealthInfo } from '../types';

interface NavbarProps {
  currentTab: 'home' | 'project' | 'schedule' | 'copilot' | 'longform';
  onSelectTab: (tab: 'home' | 'project' | 'schedule' | 'copilot' | 'longform') => void;
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
  hasCookies,
  onOpenCookiesModal,
  onSearchFocus,
  onToggleCopilot
}) => {
  const hasFfmpegIssue = health && !health.ffmpeg.available;

  return (
    <header className="sticky top-0 z-30 w-full border-b border-white/[0.06] bg-[#060608]/80 backdrop-blur-2xl px-4 sm:px-6 h-14 flex items-center justify-between">
      {/* Left: Mobile Brand + Quick Search Pill */}
      <div className="flex items-center gap-3">
        <div
          onClick={() => onSelectTab('home')}
          className="flex lg:hidden items-center gap-2 cursor-pointer"
        >
          <div className="w-7 h-7 rounded-lg bg-white/[0.08] border border-white/[0.12] flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-xs tracking-tight text-white">ShortsForge</span>
        </div>

        <button
          type="button"
          onClick={onSearchFocus}
          className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] hover:border-white/[0.14] cursor-pointer transition-all text-zinc-400 w-64 group"
        >
          <Search className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-200 transition-colors" />
          <span className="text-xs text-zinc-500 group-hover:text-zinc-300 transition-colors">
            Search studio...
          </span>
          <kbd className="ml-auto font-mono text-[10px] text-zinc-500 bg-white/[0.04] border border-white/[0.08] px-1.5 py-0.5 rounded-md">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Mobile & Tablet Segmented Pill Nav */}
      <nav className="flex lg:hidden items-center p-1 rounded-xl bg-white/[0.03] border border-white/[0.07]">
        <button
          onClick={() => onSelectTab('home')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
            currentTab === 'home' ? 'bg-white text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Feed</span>
        </button>

        {activeProjectId && (
          <button
            onClick={() => onSelectTab('project')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              currentTab === 'project' ? 'bg-white text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Clips</span>
          </button>
        )}

        <button
          onClick={() => onSelectTab('longform')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
            currentTab === 'longform' ? 'bg-white text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Video className="w-3.5 h-3.5" />
          <span>Long</span>
        </button>

        <button
          onClick={() => onSelectTab('schedule')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
            currentTab === 'schedule' ? 'bg-white text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Queue</span>
        </button>

        <button
          onClick={() => onSelectTab('copilot')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
            currentTab === 'copilot' ? 'bg-white text-zinc-950 font-semibold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
        </button>
      </nav>

      {/* Right Action Bar */}
      <div className="flex items-center gap-2">
        {onOpenCookiesModal && (
          <button
            onClick={onOpenCookiesModal}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs transition-all cursor-pointer ${
              hasCookies
                ? 'bg-emerald-500/[0.08] border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/15'
                : 'bg-amber-500/[0.08] border-amber-500/25 text-amber-300 hover:bg-amber-500/15'
            }`}
            title="Configure YouTube Cookies Vault"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-medium">YT Auth</span>
            <span className={`w-1.5 h-1.5 rounded-full ${hasCookies ? 'bg-emerald-400 shadow-[0_0_6px_#10b981]' : 'bg-amber-400 animate-pulse'}`} />
          </button>
        )}

        <button
          onClick={onToggleCopilot || (() => onSelectTab('copilot'))}
          className="btn-glass flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer group"
          title="Toggle Studio Copilot"
        >
          <Bot className="w-3.5 h-3.5 text-cyan-300 group-hover:scale-110 transition-transform" />
          <span className="hidden sm:inline">Copilot</span>
        </button>

        {hasFfmpegIssue ? (
          <div
            title={health?.ffmpeg.message}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[11px] font-mono"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            <span className="hidden md:inline">FFmpeg Off</span>
          </div>
        ) : (
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.07] text-zinc-400 text-[11px] font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
            <span>Ready</span>
          </div>
        )}
      </div>
    </header>
  );
};
