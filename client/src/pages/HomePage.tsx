import React, { useState, useEffect } from 'react';
import {
  Link as LinkIcon,
  Play,
  Trash2,
  Clock,
  ArrowRight,
  Loader2,
  RefreshCw,
  Search,
  CheckCircle2,
  Upload,
  FileVideo,
  Sparkles,
  Flame,
  Zap,
  Film,
  Layers,
  ChevronRight,
  ShieldCheck,
  Video,
  Eye
} from 'lucide-react';
import { Project } from '../types';
import { api } from '../api';
import { ProgressBar } from '../components/ProgressBar';

interface HomePageProps {
  onOpenProject: (projectId: string) => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onOpenProject, onToast }) => {
  const [url, setUrl] = useState('');
  const [inputMode, setInputMode] = useState<'url' | 'upload'>('url');
  const [niche, setNiche] = useState<string>('high_energy');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'processing' | 'failed'>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeShowcase, setActiveShowcase] = useState<'future' | 'studio'>('future');

  const NICHE_OPTIONS = [
    {
      id: 'high_energy',
      label: 'High Energy & Hooks',
      icon: '🔥',
      desc: 'Explosive curiosity gaps, confessions, plot twists',
      badge: 'TOP VIRAL'
    },
    {
      id: 'storytelling',
      label: 'Storytelling & Drama',
      icon: '📖',
      desc: 'Narrative arcs, personal struggles, transformational moments',
      badge: 'HIGH RETENTION'
    },
    {
      id: 'podcast',
      label: 'Podcast & Debates',
      icon: '🎙️',
      desc: 'Hard-hitting arguments, controversial takes, deep insights',
      badge: 'DISCOVERY'
    },
    {
      id: 'gaming',
      label: 'Gaming & Clutch',
      icon: '🎮',
      desc: 'Insane clutch plays, funny glitches, hype reactions',
      badge: 'EXPLOSIVE'
    },
    {
      id: 'comedy',
      label: 'Comedy & Roasts',
      icon: '😂',
      desc: 'Witty punchlines, sharp roasts, hilarious moments',
      badge: 'SHAREABLE'
    },
    {
      id: 'finance_tech',
      label: 'Tech & Business',
      icon: '💡',
      desc: 'Tactical secrets, teardowns, insider truth',
      badge: 'AUTHORITY'
    }
  ];

  const fetchProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);

      const running = data.find((p) =>
        ['pending', 'downloading', 'transcribing', 'analyzing', 'rendering'].includes(p.status)
      );
      if (running && !activeJobId) {
        setActiveJobId(running.id);
      }
    } catch (err: any) {
      onToast(`Failed to load projects: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
    const interval = setInterval(fetchProjects, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeJobId) return;

    const unsubscribe = api.subscribeProjectProgress(activeJobId, (update) => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id === update.projectId) {
            return {
              ...p,
              status: update.status,
              progress: update.progress,
              stage_message: update.stageMessage,
              error_message: update.errorMessage
            };
          }
          return p;
        })
      );

      if (update.status === 'completed') {
        onToast('Viral Shorts generation completed!', 'success');
        fetchProjects();
      } else if (update.status === 'failed') {
        onToast(`Generation failed: ${update.errorMessage || 'Unknown error'}`, 'error');
      }
    });

    return () => unsubscribe();
  }, [activeJobId]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsSubmitting(true);
    try {
      const newProj = await api.createProject(url.trim(), niche);
      setUrl('');
      setActiveJobId(newProj.id);
      onToast(`Started pipeline in ${NICHE_OPTIONS.find(n => n.id === niche)?.label || niche} tone...`, 'info');
      await fetchProjects();
    } catch (err: any) {
      onToast(`Error creating project: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('video') && !/\.(mp4|mov|webm|m4v)$/i.test(file.name)) {
      onToast('Please select a valid MP4 or MOV video file', 'error');
      return;
    }

    setIsSubmitting(true);
    onToast(`Uploading "${file.name}" directly to studio...`, 'info');
    try {
      const newProj = await api.uploadVideoFile(file);
      setActiveJobId(newProj.id);
      onToast('Video uploaded! Groq Whisper is transcribing hooks...', 'success');
      await fetchProjects();
    } catch (err: any) {
      onToast(`Upload failed: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this project and all generated clips?')) return;

    try {
      await api.deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (activeJobId === id) setActiveJobId(null);
      onToast('Project removed', 'info');
    } catch (err: any) {
      onToast(`Failed to delete: ${err.message}`, 'error');
    }
  };

  const handleRetry = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.retryProject(id);
      setActiveJobId(id);
      onToast('Retrying pipeline...', 'info');
      await fetchProjects();
    } catch (err: any) {
      onToast(`Failed to retry: ${err.message}`, 'error');
    }
  };

  const activeProject = projects.find(
    (p) =>
      p.id === activeJobId &&
      ['pending', 'downloading', 'transcribing', 'analyzing', 'rendering'].includes(p.status)
  );

  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      !searchQuery.trim() ||
      (p.title && p.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      p.youtube_url.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'all') return true;
    if (statusFilter === 'completed') return p.status === 'completed';
    if (statusFilter === 'failed') return p.status === 'failed';
    if (statusFilter === 'processing') {
      return ['pending', 'downloading', 'transcribing', 'analyzing', 'rendering'].includes(p.status);
    }
    return true;
  });

  return (
    <div className="space-y-16 animate-fade-in relative pb-16">
      {/* 1. Cinematic Hero Section */}
      <section className="text-center pt-2 sm:pt-6 pb-2 space-y-6 relative">
        {/* Glow badge pill */}
        <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full glass-pill border border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
          <span className="w-2 h-2 rounded-full bg-indigo-400 shadow-[0_0_10px_#818cf8] animate-pulse" />
          <span className="text-xs font-mono font-semibold text-zinc-200">
            ShortsForge 2.0 Studio Engine
          </span>
          <span className="text-[10px] text-zinc-500">•</span>
          <span className="text-xs text-indigo-300 font-mono flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" /> Autonomous 9:16 Virality
          </span>
        </div>

        {/* Hero Title */}
        <div className="space-y-4 max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-[-0.035em] text-white leading-[1.12]">
            Turn Any Long Video into{' '}
            <span className="text-gradient-brand drop-shadow-[0_0_35px_rgba(129,140,248,0.4)]">
              Viral 9:16 Shorts
            </span>
          </h1>

          <p className="text-zinc-400 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Groq Whisper word timestamps, high-retention AI hook extraction, burned-in Hormozi animated subtitles, and 1080p smart-blur canvas ready for IST peak posting.
          </p>
        </div>

        {/* 2. 3D Perspective Visual Showcase (User Assets) */}
        <div className="relative max-w-4xl mx-auto pt-4 px-2 sm:px-4">
          {/* Showcase Switcher Buttons */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <button
              type="button"
              onClick={() => setActiveShowcase('future')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono transition-all cursor-pointer ${
                activeShowcase === 'future'
                  ? 'bg-indigo-600 text-white font-semibold shadow-[0_0_15px_rgba(99,102,241,0.5)] border border-indigo-400/40'
                  : 'glass-pill text-zinc-400 hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>AI Video Creation Hub</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveShowcase('studio')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono transition-all cursor-pointer ${
                activeShowcase === 'studio'
                  ? 'bg-indigo-600 text-white font-semibold shadow-[0_0_15px_rgba(99,102,241,0.5)] border border-indigo-400/40'
                  : 'glass-pill text-zinc-400 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5 text-purple-300" />
              <span>Shorts Creator Studio</span>
            </button>
          </div>

          {/* 3D Glass Stage Container */}
          <div className="relative group perspective-1200">
            {/* Ambient Backlight Halo */}
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/30 via-purple-500/20 to-pink-500/30 rounded-3xl blur-2xl opacity-50 group-hover:opacity-75 transition duration-700" />

            <div className="relative rounded-2xl sm:rounded-3xl border border-white/[0.12] bg-[#0c0d16]/90 p-2 sm:p-3 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-xl overflow-hidden hero-tilt">
              {/* Window Header bar */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.08] mb-2 bg-[#0a0b12]/60 rounded-t-xl">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                  <span className="text-[10px] font-mono text-zinc-400 ml-2">ShortsForge Console • 1080x1920 60FPS</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>ONLINE PIPELINE</span>
                </div>
              </div>

              {/* Showcase Image */}
              <div className="relative aspect-[16/9] w-full rounded-xl overflow-hidden bg-black/60 border border-white/[0.05]">
                <img
                  src={activeShowcase === 'future' ? '/assets/future-hub.png' : '/assets/studio-creator.png'}
                  alt="ShortsForge AI Studio Showcase"
                  className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-[1.02]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#090a10] via-transparent to-transparent opacity-40" />
              </div>

              {/* Floating Satellites (Tactile Feature Badges) */}
              <div className="hidden md:flex absolute top-10 -left-6 glass-deck rounded-xl p-3 border border-indigo-500/30 shadow-2xl items-center gap-3 animate-float">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                  <Flame className="w-5 h-5 text-amber-400" />
                </div>
                <div className="text-left font-mono">
                  <div className="text-xs font-bold text-white">94/100 Virality Score</div>
                  <div className="text-[10px] text-zinc-400">Sentence-level hook extraction</div>
                </div>
              </div>

              <div className="hidden md:flex absolute bottom-8 -right-6 glass-deck rounded-xl p-3 border border-emerald-500/30 shadow-2xl items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="text-left font-mono">
                  <div className="text-xs font-bold text-white">1080p Smart Blur Canvas</div>
                  <div className="text-[10px] text-zinc-400">Full zero-crop dynamic framing</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Tactile Command Dock (Creation Hub) */}
        <div className="max-w-3xl mx-auto pt-6 px-2 sm:px-0">
          <div className="glass-deck rounded-2xl sm:rounded-3xl p-5 sm:p-7 border border-white/[0.12] shadow-[0_20px_50px_rgba(0,0,0,0.6)] space-y-6">
            {/* Mode Switcher Capsule */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                  INGESTION SOURCE:
                </span>
              </div>

              <div className="inline-flex p-1 rounded-xl bg-black/40 border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setInputMode('url')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                    inputMode === 'url'
                      ? 'bg-indigo-600 text-white font-semibold shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>YouTube URL</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('upload')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                    inputMode === 'upload'
                      ? 'bg-indigo-600 text-white font-semibold shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Direct Video Upload</span>
                </button>
              </div>
            </div>

            {/* Tactile Niche & Tone Grid */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 px-1">
                <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" /> CONTENT TONE & AUDIENCE HOOK
                </span>
                <span className="text-zinc-500">Adapts AI hook selection & title angles</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {NICHE_OPTIONS.map((n) => {
                  const isSelected = niche === n.id;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => setNiche(n.id)}
                      className={`p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer relative group ${
                        isSelected
                          ? 'bg-indigo-600/15 border-indigo-500/60 shadow-[0_0_15px_rgba(99,102,241,0.25)] ring-1 ring-indigo-500/30'
                          : 'bg-[#11131c]/70 border-white/[0.06] hover:border-white/20 hover:bg-[#151824]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-base">{n.icon}</span>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                            isSelected
                              ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-bold'
                              : 'bg-white/[0.03] text-zinc-500 border-white/[0.06]'
                          }`}
                        >
                          {n.badge}
                        </span>
                      </div>
                      <div className={`text-xs font-bold leading-tight ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                        {n.label}
                      </div>
                      <div className="text-[10px] text-zinc-500 leading-snug line-clamp-1 mt-0.5">
                        {n.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ingestion Input Bar */}
            {inputMode === 'url' ? (
              <form onSubmit={handleGenerate} className="space-y-3 pt-2">
                <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center p-2 rounded-2xl bg-[#090b12] border border-white/[0.12] shadow-inner focus-within:border-indigo-500/70 focus-within:ring-2 focus-within:ring-indigo-500/30 transition-all gap-2">
                  <div className="flex items-center gap-3 px-3 flex-1 min-w-0">
                    <LinkIcon className="w-5 h-5 text-indigo-400 shrink-0" />
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="Paste YouTube video link (e.g. https://youtube.com/watch?v=...)"
                      required
                      className="w-full bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none py-2 font-mono"
                    />
                    {url && (
                      <button
                        type="button"
                        onClick={() => setUrl('')}
                        className="text-xs text-zinc-500 hover:text-zinc-300 px-1 font-mono"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !url.trim()}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-400 hover:to-pink-400 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-[0_0_25px_rgba(99,102,241,0.4)] transition-all disabled:opacity-40 cursor-pointer shrink-0"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Extracting Hooks...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        <span>Forge 9:16 Shorts</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Sample Link Pill */}
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-500 font-mono pt-1">
                  <span className="text-[11px] text-zinc-500">Quick Test:</span>
                  <button
                    type="button"
                    onClick={() => setUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}
                    className="px-2.5 py-1 rounded-full glass-pill text-zinc-400 hover:text-white transition-colors cursor-pointer text-[11px]"
                  >
                    Rick Astley - Never Gonna Give You Up
                  </button>
                </div>
              </form>
            ) : (
              <div className="pt-2">
                <label className="flex flex-col items-center justify-center p-8 rounded-2xl bg-[#090b12] border-2 border-dashed border-white/12 hover:border-indigo-500/50 cursor-pointer transition-all group">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                    <FileVideo className="w-7 h-7 text-indigo-400" />
                  </div>
                  <p className="text-sm font-bold text-white mb-1">
                    {isSubmitting ? 'Uploading video to studio...' : 'Click or drop video file here'}
                  </p>
                  <p className="text-xs text-zinc-500 font-mono">
                    MP4, MOV, WebM • Bypasses YouTube downloader & processes directly with Whisper
                  </p>
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    onChange={handleFileUpload}
                    disabled={isSubmitting}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4. Live Active Pipeline Banner */}
      {activeProject && (
        <section className="animate-fade-in max-w-4xl mx-auto px-4">
          <div className="glass-deck rounded-2xl p-5 border border-indigo-500/30 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping" />
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  STUDIO ENGINE PROCESSING PIPELINE
                </span>
              </div>
              <button
                onClick={() => onOpenProject(activeProject.id)}
                className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-mono font-medium transition-all cursor-pointer shadow-sm"
              >
                <span>Open in Studio</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <ProgressBar
              status={activeProject.status}
              progress={activeProject.progress}
              stageMessage={activeProject.stage_message}
              errorMessage={activeProject.error_message}
            />
          </div>
        </section>
      )}

      {/* 5. Bento Projects Gallery */}
      <section className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4">
        {/* Controls Bar: Filter Pills & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0e1018] border border-white/[0.08] w-fit">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-zinc-800 text-white font-bold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              All Projects ({projects.length})
            </button>

            <button
              onClick={() => setStatusFilter('completed')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                statusFilter === 'completed'
                  ? 'bg-zinc-800 text-white font-bold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Ready ({projects.filter((p) => p.status === 'completed').length})
            </button>

            <button
              onClick={() => setStatusFilter('processing')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                statusFilter === 'processing'
                  ? 'bg-zinc-800 text-white font-bold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Processing ({projects.filter((p) => !['completed', 'failed'].includes(p.status)).length})
            </button>

            <button
              onClick={() => setStatusFilter('failed')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                statusFilter === 'failed'
                  ? 'bg-zinc-800 text-white font-bold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Failed ({projects.filter((p) => p.status === 'failed').length})
            </button>
          </div>

          {/* Search Input & Refresh Button */}
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects by title..."
                className="bg-[#0e1018] border border-white/[0.08] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 w-52 sm:w-64 transition-all font-mono"
              />
            </div>

            <button
              onClick={fetchProjects}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 border border-white/[0.08] transition-colors cursor-pointer"
              title="Refresh projects list"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Bento Grid */}
        {filteredProjects.length === 0 ? (
          <div className="glass-deck rounded-3xl p-16 text-center border-dashed border border-white/10 max-w-2xl mx-auto space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center mx-auto text-zinc-500">
              <Video className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">No studio projects found</h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto font-mono">
                Paste a YouTube URL or upload a video in the Creation Hub above to generate high-retention viral 9:16 Shorts.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredProjects.map((proj) => {
              const isDone = proj.status === 'completed';
              const isFailed = proj.status === 'failed';
              const isRunning = !isDone && !isFailed;

              return (
                <div
                  key={proj.id}
                  onClick={() => onOpenProject(proj.id)}
                  className="studio-card-interactive p-5 flex flex-col justify-between gap-4 cursor-pointer group relative overflow-hidden"
                >
                  <div className="space-y-3">
                    {/* Status Pill Header */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-zinc-500">
                        {new Date(proj.created_at).toLocaleDateString()}
                      </span>

                      <div>
                        {isDone && (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            {proj.clip_count || 0} Viral Shorts
                          </span>
                        )}
                        {isRunning && (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-bold">
                            <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                            {proj.status.toUpperCase()}
                          </span>
                        )}
                        {isFailed && (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 font-bold">
                            FAILED
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors line-clamp-2 leading-snug">
                      {proj.title || proj.youtube_url}
                    </h3>

                    {/* Error Banner if Failed */}
                    {isFailed && proj.error_message && (
                      <div className="mt-2 space-y-2">
                        <p className="text-[11px] font-mono text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-2.5 leading-relaxed">
                          ⚠️ {proj.error_message}
                        </p>
                        <button
                          onClick={(e) => handleRetry(proj.id, e)}
                          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 rounded-xl text-xs font-mono font-medium transition-all"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Retry Pipeline</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Metadata and Actions Bar */}
                  <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-zinc-400 font-mono">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{Math.round(proj.duration / 60)}m {Math.round(proj.duration % 60)}s</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isFailed && (
                        <button
                          onClick={(e) => handleRetry(proj.id, e)}
                          className="p-1.5 text-indigo-400 hover:text-indigo-300 rounded-lg hover:bg-indigo-500/10 transition-colors"
                          title="Retry pipeline"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDelete(proj.id, e)}
                        className="p-1.5 text-zinc-500 hover:text-rose-400 rounded-lg hover:bg-white/[0.04] transition-colors"
                        title="Delete project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] group-hover:bg-indigo-600 group-hover:text-white transition-all text-zinc-300 text-[11px]">
                        <span>Studio</span>
                        <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
