import React from 'react';
import {
  Film,
  Calendar,
  Layers,
  Youtube,
  Plus,
  Terminal,
  Cpu
} from 'lucide-react';
import { HealthInfo, Channel } from '../types';

interface SidebarProps {
  currentTab: 'home' | 'project' | 'schedule';
  onSelectTab: (tab: 'home' | 'project' | 'schedule') => void;
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
  return (
    <aside className="w-64 shrink-0 hidden lg:flex flex-col justify-between border-r border-white/[0.06] bg-[#090a0f] p-5 h-screen sticky top-0 z-40 select-none">
      {/* Top Branding & Main Navigation */}
      <div className="space-y-6">
        {/* Brand header */}
        <div
          onClick={() => onSelectTab('home')}
          className="flex items-start gap-3 cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-lg bg-[#141620] border border-white/[0.1] flex items-center justify-center text-white font-bold text-xs shadow-sm group-hover:border-white/20 transition-all">
            <Film className="w-4 h-4 text-zinc-300" />
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-white group-hover:text-zinc-200 transition-colors">
                ShortsForge
              </span>
              <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-white/[0.06] text-zinc-400 border border-white/[0.08]">
                v1.0
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-tight mt-0.5">
              Autonomous 9:16 Shorts Studio
            </p>
          </div>
        </div>

        {/* Primary Navigation */}
        <div className="space-y-1">
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-3 mb-2">
            Workspace
          </p>

          <button
            onClick={() => onSelectTab('home')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              currentTab === 'home'
                ? 'bg-zinc-800 text-white font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Projects & Feed</span>
          </button>

          {activeProjectId && (
            <button
              onClick={() => onSelectTab('project')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                currentTab === 'project'
                  ? 'bg-zinc-800 text-white font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Film className="w-4 h-4" />
              <span>Clips Studio</span>
            </button>
          )}

          <button
            onClick={() => onSelectTab('schedule')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              currentTab === 'schedule'
                ? 'bg-zinc-800 text-white font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Publishing & Queue</span>
          </button>
        </div>

        {/* Channels Section */}
        <div className="space-y-2 pt-2 border-t border-white/[0.05]">
          <div className="flex items-center justify-between px-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              YouTube Channels ({channels.length})
            </span>
            <button
              onClick={() => onSelectTab('schedule')}
              className="text-zinc-500 hover:text-white transition-colors"
              title="Add Channel"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {channels.length === 0 ? (
            <div className="px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
              <p className="text-[11px] text-zinc-500">No channels connected</p>
              <button
                onClick={() => onSelectTab('schedule')}
                className="text-[11px] text-blue-400 hover:text-blue-300 font-medium mt-1 inline-block"
              >
                + Connect channel
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {channels.map((ch) => (
                <div
                  key={ch.id}
                  onClick={() => onSelectTab('schedule')}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors cursor-pointer group"
                >
                  {ch.avatar_url ? (
                    <img
                      src={ch.avatar_url}
                      alt={ch.title}
                      className="w-4 h-4 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <Youtube className="w-4 h-4 text-zinc-500 shrink-0" />
                  )}
                  <span className="text-xs text-zinc-400 group-hover:text-zinc-200 truncate flex-1 font-medium">
                    {ch.title}
                  </span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      ch.status === 'active' ? 'bg-emerald-400 shadow-[0_0_6px_#10b981]' : 'bg-rose-400'
                    }`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Engine Status */}
      <div className="space-y-3 pt-4 border-t border-white/[0.05]">
        <div className="studio-card p-3 space-y-2 text-[11px] font-mono">
          <div className="text-zinc-500 uppercase text-[9px] tracking-wider">Engine Specs</div>
          <div className="flex items-center justify-between text-zinc-400">
            <span>Aspect Ratio:</span>
            <span className="text-zinc-200 font-medium">9:16 (1080x1920)</span>
          </div>
          <div className="flex items-center justify-between text-zinc-400">
            <span>Subtitles:</span>
            <span className="text-amber-400 font-medium">Hormozi ASS</span>
          </div>
          <div className="flex items-center justify-between text-zinc-400">
            <span>Downloader:</span>
            <span className="text-emerald-400 font-medium">Self-Hosted</span>
          </div>
          <div className="flex items-center justify-between text-zinc-400">
            <span>Groq Engine:</span>
            <span className="text-zinc-300">Whisper + 120B</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-zinc-600 font-mono px-1">
          <span>FFmpeg Native</span>
          <span className="text-emerald-500">● Online</span>
        </div>
      </div>
    </aside>
  );
};
