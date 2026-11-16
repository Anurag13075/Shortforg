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
  Layers
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
    <div className="space-y-10 animate-fade-in relative">
      {/* Studio Header & Ingestion Bar */}
      <section className="text-center pt-4 pb-2 space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111218] border border-white/[0.08]">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
          <span className="text-xs font-mono font-medium text-zinc-300">
            ShortsForge Studio v1.0
          </span>
          <span className="text-[10px] text-zinc-600">•</span>
          <span className="text-xs text-zinc-400 font-mono">9:16 Autonomous Pipeline</span>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-[-0.03em] text-white max-w-2xl mx-auto leading-tight">
          Turn long YouTube videos into viral 9:16 Shorts
        </h1>

        <p className="text-zinc-400 text-xs sm:text-sm max-w-lg mx-auto leading-relaxed">
          Word-level Groq Whisper timestamps, AI hook extraction, burned-in animated subtitles, and direct multi-channel YouTube scheduling.
        </p>

        {/* Command Bar Input */}
        <form onSubmit={handleGenerate} className="max-w-xl mx-auto pt-2">
          <div className="relative flex items-center p-1.5 rounded-xl bg-[#111218] border border-white/[0.08] shadow-lg focus-within:border-white/20 transition-all">
            <div className="flex items-center gap-2.5 px-3 flex-1 min-w-0">
              <LinkIcon className="w-4 h-4 text-zinc-500 shrink-0" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste YouTube video link (e.g. https://youtube.com/watch?v=...)"
                required
                className="w-full bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none py-1.5 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !url.trim()}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs rounded-lg shadow-sm transition-all disabled:opacity-40 cursor-pointer shrink-0"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>Forge Shorts</span>
              )}
            </button>
          </div>
        </form>

        {/* Sample link */}
        <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 font-mono">
          <span className="text-[11px] text-zinc-600">Sample:</span>
          <button
            type="button"
            onClick={() => setUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}
            className="px-2 py-0.5 rounded bg-[#111218] hover:bg-zinc-800 border border-white/[0.06] text-zinc-400 hover:text-white transition-colors"
          >
            Rick Astley - Never Gonna Give You Up
          </button>
        </div>
      </section>

      {/* Live Active Job Progress */}
      {activeProject && (
        <section className="animate-fade-in max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
              ACTIVE PROCESSING PIPELINE
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

      {/* Projects Grid Section */}
      <section className="space-y-4">
        {/* Filter Pills Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#111218] border border-white/[0.08] w-fit">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                statusFilter === 'all'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              All Projects ({projects.length})
            </button>

            <button
              onClick={() => setStatusFilter('completed')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                statusFilter === 'completed'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Ready ({projects.filter((p) => p.status === 'completed').length})
            </button>

            <button
              onClick={() => setStatusFilter('processing')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                statusFilter === 'processing'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Processing ({projects.filter((p) => !['completed', 'failed'].includes(p.status)).length})
            </button>

            <button
              onClick={() => setStatusFilter('failed')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                statusFilter === 'failed'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Failed ({projects.filter((p) => p.status === 'failed').length})
            </button>
          </div>

          {/* Search Input */}
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="bg-[#111218] border border-white/[0.08] rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/20 w-44 transition-all font-mono"
              />
            </div>

            <button
              onClick={fetchProjects}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Refresh projects"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Projects Cards */}
        {filteredProjects.length === 0 ? (
          <div className="studio-card p-12 text-center border-dashed">
            <Play className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-zinc-300">No projects found</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
              Paste a YouTube video link above to generate high-retention viral Shorts.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredProjects.map((proj) => {
              const isDone = proj.status === 'completed';
              const isFailed = proj.status === 'failed';
              const isRunning = !isDone && !isFailed;

              return (
                <div
                  key={proj.id}
                  onClick={() => onOpenProject(proj.id)}
                  className="studio-card-interactive p-4 flex flex-col justify-between gap-3 cursor-pointer group"
                >
                  <div>
                    {/* Status Pill Header */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-zinc-500">
                        {new Date(proj.created_at).toLocaleDateString()}
                      </span>

                      <div>
                        {isDone && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3 h-3" />
                            {proj.clip_count || 0} Shorts
                          </span>
                        )}
                        {isRunning && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {proj.status}
                          </span>
                        )}
                        {isFailed && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 font-medium">
                            Failed
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Title */}
                    <h3 className="text-xs font-semibold text-white group-hover:text-blue-400 transition-colors line-clamp-2 leading-snug">
                      {proj.title || proj.youtube_url}
                    </h3>

                    {/* Error Banner if Failed */}
                    {isFailed && proj.error_message && (
                      <div className="mt-2.5 space-y-2">
                        <p className="text-[11px] font-mono text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2 leading-relaxed">
                          ⚠️ {proj.error_message}
                        </p>
                        <button
                          onClick={(e) => handleRetry(proj.id, e)}
                          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 rounded-lg text-xs font-medium transition-all"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Retry Pipeline</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Metadata and Actions */}
                  <div className="pt-2.5 border-t border-white/[0.05] flex items-center justify-between text-xs text-zinc-500 font-mono">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-zinc-500" />
                      <span>{Math.round(proj.duration / 60)}m {Math.round(proj.duration % 60)}s</span>
                    </div>

                    <div className="flex items-center gap-1">
                      {isFailed && (
                        <button
                          onClick={(e) => handleRetry(proj.id, e)}
                          className="p-1 text-blue-400 hover:text-blue-300 rounded hover:bg-blue-500/10 transition-colors"
                          title="Retry pipeline"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDelete(proj.id, e)}
                        className="p-1 text-zinc-500 hover:text-rose-400 rounded hover:bg-white/[0.04] transition-colors"
                        title="Delete project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="p-1 text-zinc-400 group-hover:text-white group-hover:translate-x-0.5 transition-all">
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
