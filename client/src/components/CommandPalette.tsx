import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Layers,
  Video,
  Calendar,
  Bot,
  KeyRound,
  ArrowRight,
  Film,
  X
} from 'lucide-react';
import { Project } from '../types';
import { api } from '../api';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: 'home' | 'project' | 'schedule' | 'copilot' | 'longform') => void;
  onOpenProject: (projectId: string) => void;
  onOpenCookiesModal: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectTab,
  onOpenProject,
  onOpenCookiesModal
}) => {
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 30);
    api.getProjects().then(setProjects).catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const navActions = [
    { id: 'home', label: 'Projects & Feed', hint: '9:16 Shorts Studio', icon: Layers, run: () => onSelectTab('home') },
    { id: 'longform', label: 'Long-Form Studio', hint: '16:9 Documentary Engine', icon: Video, run: () => onSelectTab('longform') },
    { id: 'schedule', label: 'Publishing & Queue', hint: 'Schedule & Channels', icon: Calendar, run: () => onSelectTab('schedule') },
    { id: 'copilot', label: 'Studio Copilot', hint: 'AI Batch Scheduler', icon: Bot, run: () => onSelectTab('copilot') },
    { id: 'cookies', label: 'YouTube Cookie Vault', hint: 'Configure YT Auth', icon: KeyRound, run: () => onOpenCookiesModal() }
  ].filter((a) => !query.trim() || a.label.toLowerCase().includes(query.toLowerCase()));

  const matchingProjects = projects
    .filter((p) =>
      !query.trim() ||
      (p.title || '').toLowerCase().includes(query.toLowerCase()) ||
      p.youtube_url.toLowerCase().includes(query.toLowerCase())
    )
    .slice(0, 6);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] px-4 animate-fade-in">
      <div onClick={onClose} className="fixed inset-0 bg-black/75 backdrop-blur-md" />

      <div className="relative w-full max-w-xl rounded-2xl bg-[#0c0c10]/95 border border-white/[0.14] shadow-[0_30px_90px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.08)] overflow-hidden">
        {/* Search Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.08]">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to project, studio view, or action..."
            className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[55vh] overflow-y-auto p-2 space-y-3">
          {navActions.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-500">
                Workspaces & Tools
              </div>
              {navActions.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      item.run();
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left hover:bg-white/[0.06] transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
                        <Icon className="w-3.5 h-3.5 text-zinc-300 group-hover:text-white" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-zinc-100">{item.label}</div>
                        <div className="text-[11px] text-zinc-500">{item.hint}</div>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-white transition-colors" />
                  </button>
                );
              })}
            </div>
          )}

          {matchingProjects.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-500">
                Recent Projects
              </div>
              {matchingProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onOpenProject(p.id);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-white/[0.06] transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Film className="w-4 h-4 text-zinc-500 group-hover:text-white shrink-0" />
                    <span className="text-xs text-zinc-200 truncate">{p.title || p.youtube_url}</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500 shrink-0 ml-2">
                    {p.clip_count || 0} clips
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-white/[0.06] bg-white/[0.02] flex items-center justify-between text-[10px] font-mono text-zinc-500">
          <span>Press ESC to close</span>
          <span>⌘K Command Bar</span>
        </div>
      </div>
    </div>
  );
};
