import React, { useState, useEffect } from 'react';
import {
  Link as LinkIcon,
  Play,
  Film,
  Trash2,
  Clock,
  ArrowRight,
  Loader2,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Search,
  ExternalLink,
  Flame,
  CheckCircle2
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
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'processing' | 'failed'>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

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
      const newProj = await api.createProject(url.trim());
      setUrl('');
      setActiveJobId(newProj.id);
      onToast('Started pipeline: downloading & analyzing viral hooks...', 'info');
      await fetchProjects();
    } catch (err: any) {
      onToast(`Error creating project: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
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
    <div className="space-y-12 animate-fade-in relative">
      {/* Top Aurora Glow Filter */}
      <div className="aurora-glow" />

      {/* Hero Section matching BoardUI / Designeer */}
      <section className="text-center pt-8 pb-4 space-y-4 relative z-10">
        {/* Release Pill Tag */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] shadow-inner-light">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
          <span className="text-xs font-mono font-medium text-zinc-300">
            ShortsForge Studio v1.0
          </span>
          <span className="text-[10px] text-zinc-500">•</span>
          <span className="text-xs text-blue-400 font-medium">9:16 Viral AI</span>
        </div>

        {/* Display Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-[-0.035em] text-white max-w-3xl mx-auto leading-[1.08]">
          React Design System for{' '}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-zinc-400">
            Viral Shorts
          </span>
        </h1>

        <p className="text-zinc-400 text-sm sm:text-base max-w-xl mx-auto leading-relaxed font-normal">
          Word-level Groq Whisper timestamps, AI hook extraction, burned-in animated subtitles, and 1-click YouTube auto-posting.
        </p>

        {/* Command Bar Input Container */}
        <form onSubmit={handleGenerate} className="max-w-xl mx-auto pt-4">
          <div className="relative flex items-center p-1.5 rounded-2xl bg-[#0e0f14]/90 backdrop-blur-2xl border border-white/[0.09] shadow-2xl focus-within:border-white/25 focus-within:ring-1 focus-within:ring-white/20 transition-all duration-300">
            <div className="flex items-center gap-3 px-3 flex-1 min-w-0">
              <LinkIcon className="w-4 h-4 text-zinc-500 shrink-0" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste YouTube link (e.g. https://youtube.com/watch?v=...)"
                required
                className="w-full bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none py-2 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !url.trim()}
              className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs rounded-xl shadow-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
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
          </div>
        </form>

        {/* Demo Preset Links Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs text-zinc-500 font-mono">
          <span className="text-[11px] text-zinc-600">Try sample:</span>
          <button
            type="button"
            onClick={() => setUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}
            className="px-2.5 py-1 rounded-full bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-zinc-400 hover:text-white transition-colors"
          >
            Sample Video Link
          </button>
        </div>
      </section>

      {/* Live Pipeline Execution Progress */}
      {activeProject && (
        <section className="animate-fade-in">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
              ACTIVE PIPELINE JOB
            </span>
            <span className="text-[11px] font-mono text-zinc-500">
              ID: {activeProject.id.substring(0, 8)}
            </span>
          </div>
          <ProgressBar
            status={activeProject.status}
            progress={activeProject.progress}
            stageMessage={activeProject.stage_message}
            errorMessage={activeProject.error_message}
          />
        </section>
      )}

      {/* Projects Feed Section matching Designeer grid */}
      <section className="space-y-4">
        {/* Filter Pills Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
          <div className="flex items-center gap-1.5 p-1 rounded-full bg-white/[0.02] border border-white/[0.06] w-fit">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                statusFilter === 'all'
                  ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              All Projects ({projects.length})
            </button>

            <button
              onClick={() => setStatusFilter('completed')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                statusFilter === 'completed'
                  ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Ready ({projects.filter((p) => p.status === 'completed').length})
            </button>

            <button
              onClick={() => setStatusFilter('processing')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                statusFilter === 'processing'
                  ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Processing ({projects.filter((p) => !['completed', 'failed'].includes(p.status)).length})
            </button>
          </div>

          {/* Quick Search */}
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="bg-white/[0.02] border border-white/[0.06] rounded-full pl-8 pr-3 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/20 w-44 transition-all"
              />
            </div>

            <button
              onClick={fetchProjects}
              className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors"
              title="Refresh projects"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Bento Grid Projects Feed */}
        {filteredProjects.length === 0 ? (
          <div className="bento-card p-12 text-center border-dashed">
            <Play className="w-8 h-8 text-zinc-700 mx-auto mb-2.5" />
            <h3 className="text-sm font-semibold text-zinc-300">No projects found</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
              Paste a YouTube video link above to generate high-retention viral Shorts.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((proj) => {
              const isDone = proj.status === 'completed';
              const isFailed = proj.status === 'failed';
              const isRunning = !isDone && !isFailed;

              return (
                <div
                  key={proj.id}
                  onClick={() => onOpenProject(proj.id)}
                  className="bento-card bento-card-interactive p-5 flex flex-col justify-between gap-4 cursor-pointer group"
                >
                  <div>
                    {/* Top Browser Chrome Traffic Lights & Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5">
                        <span className="traffic-dot bg-rose-500/80" />
                        <span className="traffic-dot bg-amber-500/80" />
                        <span className="traffic-dot bg-emerald-500/80" />
                      </div>

                      <div>
                        {isDone && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            {proj.clip_count || 0} Shorts
                          </span>
                        )}
                        {isRunning && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            {proj.status}
                          </span>
                        )}
                        {isFailed && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400">
                            Failed
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors line-clamp-2 leading-snug">
                      {proj.title || proj.youtube_url}
                    </h3>
                  </div>

                  {/* Metadata and Actions */}
                  <div className="pt-3 border-t border-white/[0.05] flex items-center justify-between text-xs text-zinc-500 font-mono">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3 h-3 text-zinc-600" />
                      <span>{Math.round(proj.duration / 60)}m {Math.round(proj.duration % 60)}s</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleDelete(proj.id, e)}
                        className="p-1.5 text-zinc-600 hover:text-rose-400 rounded-lg hover:bg-white/[0.04] transition-colors"
                        title="Delete project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="p-1.5 text-zinc-400 group-hover:text-white group-hover:translate-x-0.5 transition-all">
                        <ArrowRight className="w-3.5 h-3.5" />
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
