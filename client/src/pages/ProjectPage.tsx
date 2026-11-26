import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Calendar,
  Layers,
  Clock,
  Send,
  Loader2,
  Youtube
} from 'lucide-react';
import { Project, Clip, Channel } from '../types';
import { api } from '../api';
import { ClipCard } from '../components/ClipCard';
import { ProgressBar } from '../components/ProgressBar';

interface ProjectPageProps {
  projectId: string;
  channels: Channel[];
  onBack: () => void;
  onNavigateToSchedule: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ProjectPage: React.FC<ProjectPageProps> = ({
  projectId,
  channels,
  onBack,
  onNavigateToSchedule,
  onToast
}) => {
  const [project, setProject] = useState<Project | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [logs, setLogs] = useState<Array<{ timestamp: string; level: string; message: string }>>([]);
  const [showLogs, setShowLogs] = useState(true);
  const [filter, setFilter] = useState<'all' | 'approved' | 'scheduled' | 'draft' | 'rejected'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isBulkScheduling, setIsBulkScheduling] = useState(false);
  const [bulkChannelId, setBulkChannelId] = useState<string>(channels[0]?.id || '');

  // Keep bulkChannelId up to date when channels load
  useEffect(() => {
    if (channels.length > 0 && !bulkChannelId) {
      setBulkChannelId(channels[0].id);
    }
  }, [channels, bulkChannelId]);

  const fetchProjectDetails = async () => {
    try {
      const data = await api.getProject(projectId);
      setProject(data);
      setClips(data.clips || []);
      const fetchedLogs = await api.getProjectLogs(projectId).catch(() => []);
      if (Array.isArray(fetchedLogs)) setLogs(fetchedLogs);
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

      if (update.log) {
        setLogs((prev) => [...prev, update.log]);
      }

      if (update.status === 'completed' || update.status === 'failed') {
        fetchProjectDetails();
        if (update.status === 'completed') {
          onToast('All clips rendered successfully!', 'success');
        }
      }
    });

    // Dynamic clip population polling while rendering
    const pollTimer = setInterval(() => {
      if (project?.status === 'processing') {
        fetchProjectDetails();
      }
    }, 4500);

    return () => {
      unsubscribe();
      clearInterval(pollTimer);
    };
  }, [projectId, project?.status]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await api.retryProject(projectId);
      onToast('Retrying pipeline...', 'info');
      await fetchProjectDetails();
    } catch (err: any) {
      onToast(`Failed to retry: ${err.message}`, 'error');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleClipUpdate = (updatedClip: Clip) => {
    setClips((prev) => prev.map((c) => (c.id === updatedClip.id ? updatedClip : c)));
  };

  const handleClipDelete = (clipId: string) => {
    setClips((prev) => prev.filter((c) => c.id !== clipId));
  };

  const handleApproveAll = async () => {
    const readyClips = clips.filter((c) => c.status !== 'approved');
    if (readyClips.length === 0) return;
    try {
      await Promise.all(
        readyClips.map((c) => api.updateClip(c.id, { status: 'approved' }))
      );
      setClips((prev) =>
        prev.map((c) => ({ ...c, status: 'approved' }))
      );
      onToast(`Approved all ${readyClips.length} clips! Ready for 1-click scheduling.`, 'success');
    } catch (err: any) {
      onToast(`Failed to approve clips: ${err.message}`, 'error');
    }
  };

  const handleBulkSchedule = async () => {
    if (!bulkChannelId) {
      onToast('Select a destination YouTube channel first', 'error');
      return;
    }

    const approvedOnly = clips.filter((c) => c.status === 'approved');
    if (approvedOnly.length === 0) {
      onToast('No approved clips to schedule. Click "Approve" on clips first.', 'info');
      return;
    }

    setIsBulkScheduling(true);
    try {
      const res = await api.autoSchedule(bulkChannelId, 2, projectId);
      onToast(res.message, 'success');
      await fetchProjectDetails();
    } catch (err: any) {
      onToast(`Bulk schedule failed: ${err.message}`, 'error');
    } finally {
      setIsBulkScheduling(false);
    }
  };

  const filteredClips = clips.filter((c) => {
    if (filter === 'all') return true;
    return c.status === filter;
  });

  const approvedCount = clips.filter((c) => c.status === 'approved').length;
  const scheduledCount = clips.filter((c) => c.status === 'scheduled').length;
  const draftCount = clips.filter((c) => c.status === 'draft').length;
  const rejectedCount = clips.filter((c) => c.status === 'rejected').length;

  const avgVirality =
    clips.length > 0
      ? Math.round(clips.reduce((acc, c) => acc + c.virality_score, 0) / clips.length)
      : 0;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-28 text-zinc-500 animate-fade-in">
        <RefreshCw className="w-6 h-6 animate-spin mb-3 text-white" />
        <p className="text-xs font-mono">Loading studio workspace...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="studio-card p-12 text-center max-w-md mx-auto space-y-4">
        <p className="text-zinc-400 text-xs font-mono">Project was removed or not found.</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium transition-colors"
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
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-[#111218] hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/[0.08] transition-colors shrink-0"
            title="Back to Projects"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                {project.title || 'Untitled YouTube Video'}
              </h1>
              <a
                href={project.youtube_url}
                target="_blank"
                rel="noreferrer"
                className="text-zinc-500 hover:text-blue-400 transition-colors p-0.5 shrink-0"
                title="View original YouTube video"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
              Duration: {Math.round(project.duration / 60)}m {Math.round(project.duration % 60)}s • Created{' '}
              {new Date(project.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Quick Studio Metrics & Bulk Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-[#111218] border border-white/[0.08] px-3 py-1.5 rounded-full text-xs font-mono">
            <span className="text-zinc-500">AVG:</span>
            <span className="font-bold text-amber-400">{avgVirality}/100</span>
          </div>

          <div className="flex items-center gap-1.5 bg-[#111218] border border-white/[0.08] px-3 py-1.5 rounded-full text-xs font-mono">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-zinc-500">APPROVED:</span>
            <span className="font-bold text-emerald-400">
              {approvedCount}/{clips.length}
            </span>
          </div>

          {scheduledCount > 0 && (
            <div className="flex items-center gap-1.5 bg-[#111218] border border-blue-500/30 px-3 py-1.5 rounded-full text-xs font-mono">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-zinc-500">SCHEDULED:</span>
              <span className="font-bold text-blue-400">{scheduledCount}</span>
            </div>
          )}

          {/* 1-Click Approve All Button */}
          {clips.length > 0 && approvedCount < clips.length && (
            <button
              onClick={handleApproveAll}
              className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Approve All ({clips.length - approvedCount} remaining)</span>
            </button>
          )}

          {/* Bulk Schedule to Channel Button */}
          {approvedCount > 0 && (
            <div className="flex items-center gap-1.5 bg-[#111218] border border-white/[0.08] p-1 rounded-full">
              {channels.length > 0 && (
                <select
                  value={bulkChannelId}
                  onChange={(e) => setBulkChannelId(e.target.value)}
                  className="bg-transparent text-xs text-zinc-300 font-medium px-2 py-0.5 focus:outline-none cursor-pointer"
                >
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id} className="bg-zinc-900 text-white">
                      {ch.title}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={handleBulkSchedule}
                disabled={isBulkScheduling || channels.length === 0}
                className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-zinc-200 text-zinc-950 rounded-full text-xs font-semibold shadow-sm transition-all disabled:opacity-40 cursor-pointer"
              >
                {isBulkScheduling ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Calendar className="w-3.5 h-3.5" />
                )}
                <span>Schedule All ({approvedCount})</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Live Pipeline Progress or Error Banner */}
      {(isStillProcessing || project.status === 'failed') && (
        <div className="space-y-3">
          <ProgressBar
            status={project.status}
            progress={project.progress}
            stageMessage={project.stage_message}
            errorMessage={project.error_message}
          />
          {project.status === 'failed' && (
            <div className="flex items-center justify-end">
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>{isRetrying ? 'Retrying...' : 'Retry Pipeline Now'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Live Studio Terminal / Pipeline Logs */}
      {logs.length > 0 && (
        <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a0e]/95 overflow-hidden shadow-lg">
          <div
            onClick={() => setShowLogs(!showLogs)}
            className="px-4 py-2.5 bg-white/[0.03] border-b border-white/[0.06] flex items-center justify-between cursor-pointer hover:bg-white/[0.05] transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono font-semibold text-zinc-200">Studio Engine Logs</span>
              <span className="text-[10px] font-mono text-zinc-500">({logs.length})</span>
            </div>
            <span className="text-[11px] font-mono text-zinc-400 hover:text-white">
              {showLogs ? 'Hide ▲' : 'Show ▼'}
            </span>
          </div>
          {showLogs && (
            <div className="p-3 max-h-48 overflow-y-auto space-y-1 font-mono text-[11px] leading-relaxed">
              {logs.map((log, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="text-zinc-600 shrink-0 select-none">[{log.timestamp}]</span>
                  <span
                    className={
                      log.level === 'error'
                        ? 'text-rose-400 font-semibold'
                        : log.level === 'warn'
                        ? 'text-amber-300'
                        : log.level === 'success'
                        ? 'text-emerald-300'
                        : 'text-zinc-300'
                    }
                  >
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.07]">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              filter === 'all'
                ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            All ({clips.length})
          </button>

          <button
            onClick={() => setFilter('approved')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              filter === 'approved'
                ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Approved ({approvedCount})
          </button>

          <button
            onClick={() => setFilter('scheduled')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              filter === 'scheduled'
                ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Scheduled ({scheduledCount})
          </button>

          <button
            onClick={() => setFilter('draft')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              filter === 'draft'
                ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Drafts ({draftCount})
          </button>

          <button
            onClick={() => setFilter('rejected')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
              filter === 'rejected'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Rejected ({rejectedCount})
          </button>
        </div>

        <button
          onClick={fetchProjectDetails}
          className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          title="Refresh studio clips"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Clips Grid */}
      {filteredClips.length === 0 ? (
        <div className="glass-deck rounded-3xl p-12 sm:p-16 text-center border-dashed border border-white/10 max-w-2xl mx-auto space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto text-indigo-400">
            <Layers className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">
              {isStillProcessing ? 'Rendering Viral 9:16 Shorts...' : 'No clips currently available in this project'}
            </h3>
            <p className="text-zinc-400 text-xs font-mono max-w-md mx-auto">
              {isStillProcessing
                ? 'Groq Whisper timestamps and FFmpeg 1080p rendering in progress... clips will populate automatically.'
                : 'Run the autonomous AI extraction to generate 8 high-retention clips with Hormozi captions ready for scheduling.'}
            </p>
          </div>

          {!isStillProcessing && (
            <div className="pt-2">
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>{isRetrying ? 'Starting Pipeline...' : 'Generate 8 Viral Clips Now'}</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto justify-center">
          {filteredClips.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              channels={channels}
              onUpdate={handleClipUpdate}
              onDelete={handleClipDelete}
              onToast={onToast}
            />
          ))}
        </div>
      )}
    </div>
  );
};
