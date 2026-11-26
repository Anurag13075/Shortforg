import React, { useState, useEffect } from 'react';
import {
  Link as LinkIcon,
  Trash2,
  Clock,
  ArrowRight,
  Loader2,
  RefreshCw,
  Search,
  Upload,
  FileVideo,
  Sparkles,
  Film,
  Layers
} from 'lucide-react';
import { Project } from '../types';
import { api } from '../api';
import { ProgressBar } from '../components/ProgressBar';
import { ShaderBackdrop } from '../components/ShaderBackdrop';
import { SpotlightCard } from '../components/SpotlightCard';

interface HomePageProps {
  onOpenProject: (projectId: string) => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

/**
 * Custom generative timeline/waveform visual header for project cards
 * so every card feels like a tactile video-editing artifact.
 */
const TimelineVisualStrip: React.FC<{ seed: string; isProcessing?: boolean; isDone?: boolean; isFailed?: boolean }> = ({
  seed,
  isProcessing,
  isDone,
  isFailed
}) => {
  // Deterministic bar heights from project ID
  const bars = Array.from({ length: 28 }, (_, i) => {
    const charCode = seed.charCodeAt(i % seed.length) || 65;
    return 22 + ((charCode * (i + 3)) % 68);
  });

  return (
    <div className="relative h-20 w-full rounded-xl bg-[#070709] border border-white/[0.06] overflow-hidden px-3 py-2 flex flex-col justify-between">
      <div className="dot-matrix absolute inset-0 opacity-60" />

      {/* Top timecode ruler */}
      <div className="relative z-10 flex items-center justify-between text-[9px] font-mono text-zinc-600 tabular-nums">
        <span>00:00</span>
        <span className="w-px h-1.5 bg-zinc-700" />
        <span>03:30</span>
        <span className="w-px h-1.5 bg-zinc-700" />
        <span>07:00</span>
        <span className="w-px h-1.5 bg-zinc-700" />
        <span>10:30</span>
      </div>

      {/* Waveform bars */}
      <div className="relative z-10 flex items-end justify-between gap-[3px] h-9">
        {bars.map((h, i) => {
          const isHighlight = i % 7 === 2 || i % 9 === 4;
          return (
            <div
              key={i}
              style={{ height: `${h}%` }}
              className={`flex-1 rounded-full transition-all duration-300 ${
                isFailed
                  ? 'bg-rose-500/35'
                  : isProcessing
                  ? isHighlight
                    ? 'bg-cyan-400/80 animate-pulse'
                    : 'bg-white/20'
                  : isDone && isHighlight
                  ? 'bg-violet-400/80 group-hover/spot:bg-cyan-300'
                  : 'bg-white/[0.14] group-hover/spot:bg-white/[0.26]'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
};

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

  const NICHE_OPTIONS = [
    { id: 'high_energy', label: 'High Energy', icon: '🔥' },
    { id: 'storytelling', label: 'Storytelling', icon: '📖' },
    { id: 'gaming', label: 'Gaming', icon: '🎮' },
    { id: 'podcast', label: 'Podcast', icon: '🎙️' },
    { id: 'comedy', label: 'Comedy', icon: '😂' },
    { id: 'finance_tech', label: 'Tech', icon: '💡' }
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

  const totalClips = projects.reduce((acc, p) => acc + (p.clip_count || 0), 0);
  const completedProjectsCount = projects.filter((p) => p.status === 'completed').length;

  const formatDuration = (sec: number) => {
    if (!sec) return '0m 0s';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}m ${s}s`;
  };

  return (
    <div className="space-y-8 animate-fade-in relative pb-16">
      {/* 1. Focused Creator Workspace Header + Aurora Command Bar */}
      <section className="relative rounded-3xl border border-white/[0.08] overflow-hidden bg-[#060608] p-5 sm:p-7 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.9)]">
        <ShaderBackdrop intensity="hero" className="absolute inset-0 z-0 opacity-80" />

        <div className="relative z-10 space-y-6">
          {/* Top Workspace Telemetry Bar */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.1] text-[10px] font-mono text-zinc-300 mb-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
                <span>9:16 SHORTS WORKSPACE</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.035em] text-white">
                Create viral Shorts in one click.
              </h1>
            </div>

            {/* Live Studio Telemetry */}
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <div className="px-3 py-1.5 rounded-xl bg-black/45 border border-white/[0.08] backdrop-blur-md">
                <span className="text-zinc-500 mr-1.5">Projects</span>
                <span className="text-white font-semibold tabular-nums">{projects.length}</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-black/45 border border-white/[0.08] backdrop-blur-md">
                <span className="text-zinc-500 mr-1.5">Shorts</span>
                <span className="text-white font-semibold tabular-nums">{totalClips}</span>
              </div>
              <div className="hidden sm:block px-3 py-1.5 rounded-xl bg-black/45 border border-white/[0.08] backdrop-blur-md">
                <span className="text-zinc-500 mr-1.5">Ready</span>
                <span className="text-emerald-400 font-semibold tabular-nums">{completedProjectsCount}</span>
              </div>
            </div>
          </div>

          {/* Aurora Command Bar */}
          <div className="relative glass-deck rounded-2xl p-4 overflow-hidden space-y-3.5">
            <div className="aurora-glow-edge absolute -bottom-7 left-1/2 -translate-x-1/2 w-[90%] h-20 animate-aurora" />

            <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex p-0.5 rounded-xl bg-black/55 border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setInputMode('url')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    inputMode === 'url'
                      ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>YouTube URL</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('upload')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    inputMode === 'upload'
                      ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload MP4</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {NICHE_OPTIONS.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setNiche(n.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${
                      niche === n.id
                        ? 'bg-white/[0.12] border-white/[0.25] text-white'
                        : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="mr-1">{n.icon}</span>
                    {n.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative z-10">
              {inputMode === 'url' ? (
                <form onSubmit={handleGenerate} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-1.5 rounded-xl bg-black/60 border border-white/[0.1] focus-within:border-white/30 transition-colors">
                  <div className="flex items-center gap-2.5 px-3 flex-1 min-w-0">
                    <LinkIcon className="w-4 h-4 text-zinc-500 shrink-0" />
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="Paste YouTube video link (e.g. https://youtube.com/watch?v=...)"
                      required
                      className="w-full bg-transparent text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none py-2 font-mono"
                    />
                    {url && (
                      <button
                        type="button"
                        onClick={() => setUrl('')}
                        className="text-[11px] text-zinc-500 hover:text-white font-mono"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !url.trim()}
                    className="btn-primary flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs disabled:opacity-40 cursor-pointer shrink-0"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Forge Shorts</span>
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <label className="flex items-center justify-between gap-4 p-4 rounded-xl bg-black/50 border border-dashed border-white/[0.14] hover:border-white/35 cursor-pointer transition-all group">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center group-hover:scale-105 transition-transform">
                      <FileVideo className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white">
                        {isSubmitting ? 'Uploading video to studio...' : 'Drop or select MP4 / MOV / WebM file'}
                      </p>
                      <p className="text-[11px] text-zinc-500 font-mono">
                        Processes directly via Whisper + FFmpeg (zero YouTube bot checks)
                      </p>
                    </div>
                  </div>
                  <span className="btn-glass px-3 py-1.5 rounded-lg text-xs font-medium shrink-0">Browse</span>
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    onChange={handleFileUpload}
                    disabled={isSubmitting}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Live Active Pipeline Banner */}
      {activeProject && (
        <section className="animate-fade-in">
          <div className="studio-card p-5 space-y-3 border-white/[0.14]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                <span className="text-xs font-semibold text-white">
                  Synthesizing: {activeProject.title || activeProject.youtube_url}
                </span>
              </div>
              <button
                onClick={() => onOpenProject(activeProject.id)}
                className="text-xs font-mono text-zinc-300 hover:text-white flex items-center gap-1"
              >
                Open Studio <ArrowRight className="w-3.5 h-3.5" />
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

      {/* 3. Visual Projects Grid */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-3.5">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-white tracking-tight">Recent Projects</h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-white/[0.05] text-zinc-400 border border-white/[0.07]">
              {filteredProjects.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.07]">
              {(['all', 'completed', 'processing', 'failed'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all ${
                    statusFilter === tab
                      ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter..."
                className="bg-white/[0.03] border border-white/[0.07] rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/25 w-44"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="studio-card p-5 h-52 animate-pulse bg-white/[0.02]" />
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="studio-card dot-matrix p-14 text-center space-y-3 border-dashed border-white/[0.1]">
            <Layers className="w-8 h-8 text-zinc-600 mx-auto" />
            <h3 className="text-sm font-semibold text-zinc-200">No projects match</h3>
            <p className="text-xs text-zinc-500 max-w-xs mx-auto">
              Paste a YouTube link or upload an MP4 above to forge viral 9:16 Shorts.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project, idx) => {
              const isProcessing = ['pending', 'downloading', 'transcribing', 'analyzing', 'rendering'].includes(project.status);
              const isFailed = project.status === 'failed';
              const isDone = project.status === 'completed';

              return (
                <SpotlightCard
                  key={project.id}
                  onClick={() => onOpenProject(project.id)}
                  className="p-4 flex flex-col justify-between gap-3.5 cursor-pointer"
                >
                  <div className="space-y-3">
                    {/* Visual Waveform/Timeline Header */}
                    <TimelineVisualStrip
                      seed={project.id}
                      isProcessing={isProcessing}
                      isDone={isDone}
                      isFailed={isFailed}
                    />

                    {/* Meta + Status */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-zinc-500 tabular-nums">
                        {String(idx + 1).padStart(2, '0')} • {new Date(project.created_at).toLocaleDateString()}
                      </span>

                      <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full border font-medium ${
                        isDone
                          ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                          : isFailed
                          ? 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                          : 'bg-cyan-500/10 border-cyan-500/25 text-cyan-300'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          isDone ? 'bg-emerald-400' : isFailed ? 'bg-rose-400' : 'bg-cyan-400 animate-pulse'
                        }`} />
                        {isDone ? `${project.clip_count || 0} Shorts` : project.status.toUpperCase()}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-white line-clamp-2 leading-snug">
                      {project.title || project.youtube_url}
                    </h3>

                    {isFailed && project.error_message && (
                      <p className="text-[11px] font-mono text-rose-400/90 bg-rose-500/[0.06] border border-rose-500/15 rounded-lg p-2 line-clamp-2">
                        {project.error_message}
                      </p>
                    )}

                    {isProcessing && (
                      <div className="space-y-1.5 pt-0.5">
                        <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                          <span className="truncate pr-2">{project.stage_message || 'Processing...'}</span>
                          <span>{Math.round(project.progress)}%</span>
                        </div>
                        <div className="w-full h-1 rounded-full bg-white/[0.07] overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-violet-400 to-cyan-300 transition-all duration-300"
                            style={{ width: `${Math.max(8, project.progress)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer Telemetry */}
                  <div className="flex items-center justify-between pt-3 border-t border-white/[0.06] text-xs">
                    <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-500 tabular-nums">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(project.duration)}
                      </span>
                      {project.approved_count ? (
                        <span className="text-emerald-400">{project.approved_count} ready</span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-1">
                      {isFailed && (
                        <button
                          onClick={(e) => handleRetry(project.id, e)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors"
                          title="Retry"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDelete(project.id, e)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <span className="flex items-center gap-1 pl-1.5 text-xs font-medium text-zinc-300 group-hover/spot:text-white transition-colors">
                        <Film className="w-3.5 h-3.5" />
                        <span>Studio</span>
                        <ArrowRight className="w-3 h-3 group-hover/spot:translate-x-0.5 transition-transform" />
                      </span>
                    </div>
                  </div>
                </SpotlightCard>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
