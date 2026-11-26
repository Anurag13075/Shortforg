import React from 'react';
import {
  Film,
  Calendar,
  Layers,
  Youtube,
  Plus,
  Bot,
  Video,
  Sparkles
} from 'lucide-react';
import { HealthInfo, Channel } from '../types';

interface SidebarProps {
  currentTab: 'home' | 'project' | 'schedule' | 'copilot' | 'longform';
  onSelectTab: (tab: 'home' | 'project' | 'schedule' | 'copilot' | 'longform') => void;
  activeProjectId: string | null;
  channels: Channel[];
  health: HealthInfo | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  activeProjectId,
  channels,
  health
}) => {
  const navItemClass = (active: boolean) =>
    `group relative w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13px] transition-all duration-150 ${
      active
        ? 'bg-white/[0.08] text-white font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] border border-white/[0.1]'
        : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.035] border border-transparent'
    }`;

  return (
    <aside className="w-64 shrink-0 hidden lg:flex flex-col justify-between border-r border-white/[0.06] bg-[#070709]/95 backdrop-blur-2xl p-4 h-screen sticky top-0 z-40 select-none">
      {/* Top Branding & Navigation */}
      <div className="space-y-6">
        {/* Brand Header */}
        <div
          onClick={() => onSelectTab('home')}
          className="flex items-center gap-3 px-2 py-1.5 cursor-pointer group"
        >
          <div className="relative w-8 h-8 rounded-xl bg-gradient-to-b from-white/15 to-white/[0.03] border border-white/[0.14] flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.5)] group-hover:border-white/30 transition-all">
            <Sparkles className="w-4 h-4 text-white" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-white">
                ShortsForge
              </span>
              <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded-md bg-white/[0.06] text-zinc-400 border border-white/[0.08]">
                2.0
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-tight mt-0.5 truncate">
              Autonomous Video Studio
            </p>
          </div>
        </div>

        {/* Workspace Navigation */}
        <div className="space-y-1">
          <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-500 px-3 mb-2">
            Studio
          </p>

          <button onClick={() => onSelectTab('home')} className={navItemClass(currentTab === 'home')}>
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
              <span>Projects & Feed</span>
            </div>
          </button>

          {activeProjectId && (
            <button onClick={() => onSelectTab('project')} className={navItemClass(currentTab === 'project')}>
              <div className="flex items-center gap-2.5">
                <Film className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
                <span>Clips Studio</span>
              </div>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300">
                9:16
              </span>
            </button>
          )}

          <button onClick={() => onSelectTab('longform')} className={navItemClass(currentTab === 'longform')}>
            <div className="flex items-center gap-2.5">
              <Video className={`w-4 h-4 transition-colors ${currentTab === 'longform' ? 'text-violet-300' : 'text-zinc-400 group-hover:text-violet-300'}`} />
              <span>Long-Form Studio</span>
            </div>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-violet-500/15 border border-violet-400/25 text-violet-300">
              16:9
            </span>
          </button>

          <button onClick={() => onSelectTab('schedule')} className={navItemClass(currentTab === 'schedule')}>
            <div className="flex items-center gap-2.5">
              <Calendar className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
              <span>Publishing & Queue</span>
            </div>
          </button>

          <button onClick={() => onSelectTab('copilot')} className={navItemClass(currentTab === 'copilot')}>
            <div className="flex items-center gap-2.5">
              <Bot className={`w-4 h-4 transition-colors ${currentTab === 'copilot' ? 'text-cyan-300' : 'text-zinc-400 group-hover:text-cyan-300'}`} />
              <span>Studio Copilot</span>
            </div>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-400/20 text-cyan-300">
              AI
            </span>
          </button>
        </div>

        {/* Channels Section */}
        <div className="space-y-2 pt-3 border-t border-white/[0.06]">
          <div className="flex items-center justify-between px-3">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-500">
              Channels ({channels.length})
            </span>
            <button
              onClick={() => onSelectTab('schedule')}
              className="p-1 rounded-md text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors"
              title="Add Channel"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {channels.length === 0 ? (
            <div className="px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <p className="text-[11px] text-zinc-500">No channels linked</p>
              <button
                onClick={() => onSelectTab('schedule')}
                className="text-[11px] text-white hover:text-zinc-300 font-medium mt-1 inline-block"
              >
                + Connect YouTube
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {channels.map((ch) => (
                <div
                  key={ch.id}
                  onClick={() => onSelectTab('schedule')}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-white/[0.04] transition-colors cursor-pointer group"
                >
                  {ch.avatar_url ? (
                    <img
                      src={ch.avatar_url}
                      alt={ch.title}
                      className="w-5 h-5 rounded-full object-cover ring-1 ring-white/15 shrink-0"
                    />
                  ) : (
                    <Youtube className="w-4 h-4 text-zinc-500 shrink-0" />
                  )}
                  <span className="text-xs text-zinc-300 group-hover:text-white truncate flex-1 font-medium">
                    {ch.title}
                  </span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      ch.status === 'active' ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' : 'bg-rose-400'
                    }`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Engine Telemetry */}
      <div className="space-y-3 pt-4 border-t border-white/[0.06]">
        <div className="rounded-xl bg-white/[0.025] border border-white/[0.06] p-3 space-y-2 text-[11px] font-mono">
          <div className="flex items-center justify-between text-zinc-500 uppercase text-[9px] tracking-[0.14em]">
            <span>Pipeline</span>
            <span className={health?.ffmpeg?.available !== false ? 'text-emerald-400' : 'text-rose-400'}>
              ● {health?.ffmpeg?.available !== false ? 'Online' : 'Offline'}
            </span>
          </div>
          <div className="flex items-center justify-between text-zinc-400">
            <span>Formats</span>
            <span className="text-zinc-200">9:16 + 16:9</span>
          </div>
          <div className="flex items-center justify-between text-zinc-400">
            <span>Mastering</span>
            <span className="text-zinc-200">-14 LUFS</span>
          </div>
          <div className="flex items-center justify-between text-zinc-400">
            <span>AI Core</span>
            <span className="text-zinc-200">Whisper + 120B</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
