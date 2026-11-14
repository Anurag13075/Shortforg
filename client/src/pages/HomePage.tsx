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
  Search
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

  // Live SSE listener
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
        onToast('Shorts generation completed!', 'success');
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
    <div className="max-w-5xl mx-auto space-y-12">
      {/* Hero Section: Centered, quiet elegance (matching designeer.xyz) */}
      <section className="text-center pt-8 space-y-3 animate-fade-in">
        {/* Subtle status tag */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-zinc-300 text-[11px] font-mono tracking-tight mb-2">
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span>Autonomous 9:16 Shorts Engine</span>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-[-0.03em] text-white max-w-2xl mx-auto leading-tight">
          Turn long YouTube videos into viral Shorts.
        </h1>

        <p className="text-zinc-400 text-sm max-w-lg mx-auto leading-relaxed">
          AI transcription with word-level timestamps, viral hook extraction, burned-in animated captions, and automated channel scheduling.
        </p>

        {/* Command Input Bar */}
        <form onSubmit={handleGenerate} className="max-w-xl mx-auto pt-4">
          <div className="relative flex items-center p-1.5 rounded-2xl bg-zinc-900/90 border border-white/10 shadow-2xl focus-within:border-white/25 focus-within:ring-1 focus-within:ring-white/20 transition-all duration-300">
            <div className="flex items-center gap-2.5 px-3 flex-1 min-w-0">
              <LinkIcon className="w-4 h-4 text-zinc-500 shrink-0" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste YouTube video link (e.g. https://youtube.com/watch?v=...)"
                required
                className="w-full bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none py-2"
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
                  <span>Generate</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* Live Pipeline Progress Display */}
      {activeProject && (
        <section className="animate-fade-in">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
              ACTIVE PIPELINE
            </span>
            <span className="text-[11px] font-mono text-zinc-500">
              Job ID: {activeProject.id.substring(0, 8)}
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

      {/* Projects List & Filter Bar */}
      <section className="space-y-4">
        {/* Designeer-style Capsule Filter Pills */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
          <div className="flex items-center gap-1.5 p-1 rounded-full bg-zinc-900/60 border border-white/[0.06] w-fit">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                statusFilter === 'all'
                  ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              All ({projects.length})
            </button>

            <button
              onClick={() => setStatusFilter('completed')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                statusFilter === 'completed'
                  ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Completed ({projects.filter((p) => p.status === 'completed').length})
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

          {/* Search Filter Pill */}
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter projects..."
                className="bg-zinc-900 border border-white/[0.06] rounded-full pl-8 pr-3 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/20 w-44 transition-all font-sans"
              />
            </div>

            <button
              onClick={fetchProjects}
              className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Refresh list"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Project Cards Grid */}
        {filteredProjects.length === 0 ? (
          <div className="craft-card rounded-2xl p-12 text-center border-dashed">
            <Play className="w-8 h-8 text-zinc-700 mx-auto mb-2.5" />
            <h3 className="text-sm font-semibold text-zinc-300">No projects found</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
              Paste a YouTube video URL above to generate your first set of viral Shorts.
            </p>
          </div>
        ) : (
          <div className="grid gap-2.5">
            {filteredProjects.map((proj) => {
              const isDone = proj.status === 'completed';
              const isFailed = proj.status === 'failed';
              const isRunning = !isDone && !isFailed;

              return (
                <div
                  key={proj.id}
                  onClick={() => onOpenProject(proj.id)}
                  className="craft-card craft-card-interactive p-4 rounded-xl flex items-center justify-between gap-4 cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        isDone
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : isFailed
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                          : 'bg-blue-500/10 border-blue-500/30 text-blue-400 animate-pulse'
                      }`}
                    >
                      {isDone ? (
                        <Film className="w-4 h-4" />
                      ) : isFailed ? (
                        <AlertCircle className="w-4 h-4" />
                      ) : (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
                        {proj.title || proj.youtube_url}
                      </h4>

                      <div className="flex items-center gap-3 text-[11px] text-zinc-400 mt-0.5 font-mono">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-zinc-500" />
                          {new Date(proj.created_at).toLocaleDateString()}
                        </span>

                        {proj.duration > 0 && (
                          <span>
                            {Math.round(proj.duration / 60)}m {Math.round(proj.duration % 60)}s
                          </span>
                        )}

                        {proj.clip_count !== undefined && proj.clip_count > 0 && (
                          <span className="text-zinc-300 font-sans">
                            {proj.clip_count} clips{' '}
                            <span className="text-emerald-400">({proj.approved_count || 0} approved)</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side actions */}
                  <div className="flex items-center gap-3 shrink-0">
                    {isRunning && (
                      <div className="text-right hidden sm:block">
                        <span className="text-[11px] font-mono text-blue-400 capitalize">
                          {proj.status}...
                        </span>
                        <div className="w-20 bg-zinc-800 rounded-full h-1 mt-1 overflow-hidden">
                          <div
                            className="bg-blue-500 h-full rounded-full"
                            style={{ width: `${proj.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {isDone && (
                      <span className="text-[10px] font-mono text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 hidden sm:inline-block">
                        Ready
                      </span>
                    )}

                    <button
                      onClick={(e) => handleDelete(proj.id, e)}
                      className="p-1.5 text-zinc-500 hover:text-rose-400 rounded-lg hover:bg-white/[0.04] transition-colors"
                      title="Delete project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <div className="p-1 text-zinc-500 group-hover:text-white group-hover:translate-x-0.5 transition-all">
                      <ArrowRight className="w-4 h-4" />
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
