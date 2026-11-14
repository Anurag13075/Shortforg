import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Calendar,
  Layers
} from 'lucide-react';
import { Project, Clip } from '../types';
import { api } from '../api';
import { ClipCard } from '../components/ClipCard';
import { ProgressBar } from '../components/ProgressBar';

interface ProjectPageProps {
  projectId: string;
  onBack: () => void;
  onNavigateToSchedule: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ProjectPage: React.FC<ProjectPageProps> = ({
  projectId,
  onBack,
  onNavigateToSchedule,
  onToast
}) => {
  const [project, setProject] = useState<Project | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [filter, setFilter] = useState<'all' | 'approved' | 'draft' | 'rejected'>('all');
  const [isLoading, setIsLoading] = useState(true);

  const fetchProjectDetails = async () => {
    try {
      const data = await api.getProject(projectId);
      setProject(data);
      setClips(data.clips || []);
    } catch (err: any) {
      onToast(`Failed to load project: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectDetails();
  }, [projectId]);

  useEffect(() => {
    if (!project || ['completed', 'failed'].includes(project.status)) return;

    const unsubscribe = api.subscribeProjectProgress(projectId, (update) => {
      setProject((prev) =>
        prev
          ? {
              ...prev,
              status: update.status,
              progress: update.progress,
              stage_message: update.stageMessage,
              error_message: update.errorMessage
            }
          : null
      );

      if (update.status === 'completed') {
        fetchProjectDetails();
        onToast('All clips rendered successfully!', 'success');
      }
    });

    return () => unsubscribe();
  }, [projectId, project?.status]);

  const handleClipUpdate = (updatedClip: Clip) => {
    setClips((prev) => prev.map((c) => (c.id === updatedClip.id ? updatedClip : c)));
  };

  const filteredClips = clips.filter((c) => {
    if (filter === 'all') return true;
    return c.status === filter;
  });

  const approvedCount = clips.filter((c) => c.status === 'approved').length;
  const avgVirality =
    clips.length > 0
      ? Math.round(clips.reduce((acc, c) => acc + c.virality_score, 0) / clips.length)
      : 0;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-zinc-500 animate-fade-in">
        <RefreshCw className="w-6 h-6 animate-spin mb-3 text-white" />
        <p className="text-xs font-mono">Loading studio workspace...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20 space-y-3">
        <p className="text-zinc-400 text-sm">Project was removed or not found.</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-xs font-medium"
        >
          Return Home
        </button>
      </div>
    );
  }

  const isStillProcessing = ['pending', 'downloading', 'transcribing', 'analyzing', 'rendering'].includes(
    project.status
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/[0.06] transition-colors"
            title="Back to Projects"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight line-clamp-1">
                {project.title || 'Untitled YouTube Video'}
              </h1>
              <a
                href={project.youtube_url}
                target="_blank"
                rel="noreferrer"
                className="text-zinc-500 hover:text-blue-400 transition-colors p-0.5"
                title="View original YouTube video"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
              Source: {Math.round(project.duration / 60)}m {Math.round(project.duration % 60)}s • Created{' '}
              {new Date(project.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Quick Metrics & Actions */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-white/[0.06] px-3 py-1.5 rounded-full text-xs font-mono">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-zinc-500">AVG:</span>
            <span className="font-bold text-white">{avgVirality}/100</span>
          </div>

          <div className="flex items-center gap-1.5 bg-zinc-900 border border-white/[0.06] px-3 py-1.5 rounded-full text-xs font-mono">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-zinc-500">APPROVED:</span>
            <span className="font-bold text-emerald-400">
              {approvedCount}/{clips.length}
            </span>
          </div>

          {approvedCount > 0 && (
            <button
              onClick={onNavigateToSchedule}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-white hover:bg-zinc-200 text-zinc-950 rounded-full text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Schedule ({approvedCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Live Pipeline Progress banner if active */}
      {isStillProcessing && (
        <ProgressBar
          status={project.status}
          progress={project.progress}
          stageMessage={project.stage_message}
          errorMessage={project.error_message}
        />
      )}

      {/* Designeer-style Filter Pills */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 p-1 rounded-full bg-zinc-900/60 border border-white/[0.06]">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              filter === 'all'
                ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            All ({clips.length})
          </button>

          <button
            onClick={() => setFilter('approved')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              filter === 'approved'
                ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Approved ({approvedCount})
          </button>

          <button
            onClick={() => setFilter('draft')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              filter === 'draft'
                ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Drafts ({clips.filter((c) => c.status === 'draft').length})
          </button>

          <button
            onClick={() => setFilter('rejected')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              filter === 'rejected'
                ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Rejected ({clips.filter((c) => c.status === 'rejected').length})
          </button>
        </div>

        <button
          onClick={fetchProjectDetails}
          className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition-colors"
          title="Refresh studio clips"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Clips Grid */}
      {filteredClips.length === 0 ? (
        <div className="craft-card rounded-2xl p-12 text-center border-dashed">
          <p className="text-zinc-500 text-xs font-mono">
            {isStillProcessing
              ? 'Rendering vertical 9:16 video cuts with FFmpeg... clips will populate automatically.'
              : `No clips in '${filter}' filter.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredClips.map((clip) => (
            <ClipCard key={clip.id} clip={clip} onUpdate={handleClipUpdate} onToast={onToast} />
          ))}
        </div>
      )}
    </div>
  );
};
