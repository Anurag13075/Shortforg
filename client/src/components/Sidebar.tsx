import React from 'react';
import {
  Sparkles,
  Film,
  Calendar,
  Layers,
  Youtube,
  Settings,
  HardDrive,
  Cpu,
  Plus,
  Download
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
    <aside className="w-64 shrink-0 hidden lg:flex flex-col justify-between border-r border-white/[0.06] bg-[#090a0d] p-5 h-screen sticky top-0 z-40 select-none">
      {/* Top Branding & Main Navigation */}
      <div className="space-y-6">
        {/* Brand header matching designeer.xyz orb */}
        <div
          onClick={() => onSelectTab('home')}
          className="flex items-start gap-3 cursor-pointer group"
        >
          <div className="relative w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-500 to-rose-400 p-[1px] shadow-[0_0_15px_rgba(59,130,246,0.25)] group-hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] transition-all">
            <div className="w-full h-full rounded-full bg-[#090a0d] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-blue-400" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-white group-hover:text-zinc-200 transition-colors">
                ShortsForge
              </span>
              <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded-full bg-white/[0.06] text-zinc-400 border border-white/[0.08]">
                v1.0
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-tight mt-0.5">
              Autonomous 9:16 Shorts Engine
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
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              currentTab === 'home'
                ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Projects & Feed</span>
          </button>

          {activeProjectId && (
            <button
              onClick={() => onSelectTab('project')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                currentTab === 'project'
                  ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Film className="w-4 h-4" />
              <span>Clips Studio</span>
            </button>
          )}

          <button
            onClick={() => onSelectTab('schedule')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              currentTab === 'schedule'
                ? 'bg-white text-zinc-950 font-semibold shadow-sm'
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
              YouTube Channels
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
            <div className="px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
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
                      className="w-4 h-4 rounded-full object-cover"
                    />
                  ) : (
                    <Youtube className="w-4 h-4 text-rose-500" />
                  )}
                  <span className="text-xs text-zinc-400 group-hover:text-zinc-200 truncate flex-1">
                    {ch.title}
                  </span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      ch.status === 'active' ? 'bg-emerald-400 shadow-[0_0_6px_#10b981]' : 'bg-rose-400'
                    }`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Studio Presets Specs */}
        <div className="space-y-2 pt-2 border-t border-white/[0.05]">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-3">
            Render Config
          </span>
          <div className="px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-1.5 text-[11px] font-mono text-zinc-400">
            <div className="flex justify-between">
              <span className="text-zinc-500">Aspect Ratio:</span>
              <span className="text-zinc-300">9:16 (1080x1920)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Subtitles:</span>
              <span className="text-amber-400 font-sans font-semibold">Alex Hormozi ASS</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Audio Norm:</span>
              <span className="text-zinc-300">-16 LUFS (loudnorm)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Diagnostics Footer */}
      <div className="pt-4 border-t border-white/[0.05] space-y-2">
        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 px-1">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-zinc-600" />
            <span>FFmpeg:</span>
          </div>
          <span
            className={
              health?.ffmpeg.available ? 'text-emerald-400 font-semibold' : 'text-rose-400'
            }
          >
            {health?.ffmpeg.available ? 'Native Ready' : 'Missing'}
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 px-1">
          <div className="flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5 text-zinc-600" />
            <span>Downloader:</span>
          </div>
          <span className="text-emerald-400 font-semibold">Self-Hosted</span>
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 px-1">
          <div className="flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-zinc-600" />
            <span>Groq Engine:</span>
          </div>
          <span className="text-zinc-300">Whisper + 120B OSS</span>
        </div>
      </div>
    </aside>
  );
};
