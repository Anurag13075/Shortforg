import React, { useState, useEffect, useRef } from 'react';
import {
  Film,
  Play,
  Sparkles,
  Youtube,
  Download,
  RefreshCw,
  Trash2,
  Clock,
  Plus,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Video,
  Layers,
  ChevronRight,
  ExternalLink,
  Edit2,
  Calendar,
  Image as ImageIcon,
  Send
} from 'lucide-react';
import { LongformProject, LongformChapter, Channel } from '../types';
import { api } from '../api';

interface LongformPageProps {
  channels: Channel[];
  onToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

// Quick GTA 6 Topic & Duration Presets (user pastes their own real YouTube URLs)
const GTA6_PRESETS = [
  {
    title: 'GTA 6: The Secret Map & Real-World Scale Details',
    duration: 600
  },
  {
    title: 'GTA 6: Insane Graphics Physics & AI Secrets Revealed',
    duration: 600
  },
  {
    title: 'GTA 6: 15 Things You NEED TO DO on Day 1 (Full Guide)',
    duration: 720
  }
];

export const LongformPage: React.FC<LongformPageProps> = ({ channels, onToast }) => {
  const [projects, setProjects] = useState<LongformProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<LongformProject | null>(null);
  const [logs, setLogs] = useState<Array<{ timestamp: string; level: string; message: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReRendering, setIsReRendering] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Form State
  const [topic, setTopic] = useState('');
  const [sourceUrls, setSourceUrls] = useState<string[]>(['', '']);
  const [targetDuration, setTargetDuration] = useState<number>(600); // 10 min default

  // Editing state
  const [editedChapters, setEditedChapters] = useState<LongformChapter[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');

  // Video & Thumbnail Preview Switcher
  const [previewMode, setPreviewMode] = useState<'video' | 'thumbnail'>('video');

  // Custom Scheduling State
  const [scheduledDateTime, setScheduledDateTime] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(18, 0, 0, 0);
    // Format: YYYY-MM-DDTHH:mm
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${mins}`;
  });
  const [publishNow, setPublishNow] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Load all projects on mount
  useEffect(() => {
    loadProjects();
    const interval = setInterval(loadProjects, 12000);
    return () => clearInterval(interval);
  }, []);

  // When activeProjectId changes, fetch detailed project and subscribe to SSE
  useEffect(() => {
    if (!activeProjectId) {
      setActiveProject(null);
      return;
    }

    let unsubscribeSSE: (() => void) | null = null;

    const fetchDetail = async () => {
      try {
        const proj = await api.getLongformProject(activeProjectId);
        setActiveProject(proj);
        setEditedChapters(proj.chapters || []);
        setHasUnsavedChanges(false);
        if (proj.assigned_channel_id) {
          setSelectedChannelId(proj.assigned_channel_id);
        } else if (channels.length > 0) {
          setSelectedChannelId(channels[0].id);
        }

        // Fetch initial logs
        try {
          const initialLogs = await api.getLongformLogs(activeProjectId);
          setLogs(initialLogs || []);
        } catch {}

        // If project is still processing, subscribe to SSE
        if (['pending', 'downloading', 'transcribing', 'scripting', 'rendering'].includes(proj.status)) {
          unsubscribeSSE = api.subscribeLongformProgress(activeProjectId, (update) => {
            setActiveProject((prev) => (prev ? {
              ...prev,
              status: update.status as any,
              progress: update.progress,
              stage_message: update.stageMessage,
              error_message: update.errorMessage || null
            } : null));

            if (update.log) {
              setLogs((prev) => [...prev.slice(-200), update.log!]);
            }

            if (update.status === 'completed') {
              onToast('🏆 Long-form video synthesized successfully!', 'success');
              api.getLongformProject(activeProjectId).then((updated) => {
                setActiveProject(updated);
                setEditedChapters(updated.chapters || []);
              });
            } else if (update.status === 'failed') {
              onToast(`Synthesis failed: ${update.errorMessage}`, 'error');
            }
          });
        }
      } catch (err: any) {
        onToast(`Failed to load project: ${err.message}`, 'error');
      }
    };

    fetchDetail();

    return () => {
      if (unsubscribeSSE) unsubscribeSSE();
    };
  }, [activeProjectId]);

  const loadProjects = async () => {
    try {
      const data = await api.getLongformProjects();
      setProjects(data || []);
    } catch (err: any) {
      console.warn('Could not load longform projects:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSourceUrl = () => {
    if (sourceUrls.length < 5) {
      setSourceUrls([...sourceUrls, '']);
    } else {
      onToast('Maximum 5 source videos supported per long-form documentary', 'info');
    }
  };

  const handleRemoveSourceUrl = (index: number) => {
    if (sourceUrls.length <= 1) return;
    setSourceUrls(sourceUrls.filter((_, i) => i !== index));
  };

  const handleSourceUrlChange = (index: number, val: string) => {
    const updated = [...sourceUrls];
    updated[index] = val;
    setSourceUrls(updated);
  };

  const handleApplyPreset = (preset: typeof GTA6_PRESETS[0]) => {
    setTopic(preset.title);
    setTargetDuration(preset.duration);
    onToast(`Loaded preset: "${preset.title}" — now paste your YouTube URLs below`, 'success');
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrls = sourceUrls.map((u) => u.trim()).filter((u) => u.length > 0);
    if (cleanUrls.length === 0) {
      onToast('Please enter at least 1 valid YouTube URL', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const newProj = await api.createLongformProject(topic.trim(), cleanUrls, targetDuration);
      onToast('🚀 Long-Form Studio Engine started synthesizing!', 'success');
      setProjects([newProj, ...projects]);
      setActiveProjectId(newProj.id);
      // Reset form
      setTopic('');
      setSourceUrls(['', '']);
    } catch (err: any) {
      onToast(`Failed to start synthesis: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetry = async () => {
    if (!activeProjectId) return;
    try {
      await api.retryLongformProject(activeProjectId);
      onToast('Retrying synthesis pipeline...', 'info');
      setActiveProject((prev) => prev ? { ...prev, status: 'pending', progress: 0 } : null);
    } catch (err: any) {
      onToast(`Retry failed: ${err.message}`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this long-form documentary project and all rendered files?')) {
      return;
    }

    try {
      await api.deleteLongformProject(id);
      onToast('Project deleted', 'info');
      setProjects(projects.filter((p) => p.id !== id));
      if (activeProjectId === id) {
        setActiveProjectId(null);
      }
    } catch (err: any) {
      onToast(`Delete failed: ${err.message}`, 'error');
    }
  };

  // Chapter editing helpers
  const handleChapterTitleChange = (index: number, newTitle: string) => {
    const updated = [...editedChapters];
    updated[index].title = newTitle;
    setEditedChapters(updated);
    setHasUnsavedChanges(true);
  };

  const handleChapterHookChange = (index: number, newHook: string) => {
    const updated = [...editedChapters];
    updated[index].hook_text = newHook;
    setEditedChapters(updated);
    setHasUnsavedChanges(true);
  };

  const handleChapterTimeChange = (index: number, field: 'start_time' | 'end_time', val: number) => {
    const updated = [...editedChapters];
    updated[index][field] = Math.max(0, val);
    updated[index].duration = Math.max(1, updated[index].end_time - updated[index].start_time);
    setEditedChapters(updated);
    setHasUnsavedChanges(true);
  };

  const handleMoveChapter = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= editedChapters.length) return;

    const updated = [...editedChapters];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;

    // re-assign order numbers
    updated.forEach((c, idx) => { c.order = idx + 1; });
    setEditedChapters(updated);
    setHasUnsavedChanges(true);
  };

  const handleRemoveChapter = (index: number) => {
    if (editedChapters.length <= 1) {
      onToast('A video must have at least 1 chapter', 'info');
      return;
    }
    const updated = editedChapters.filter((_, i) => i !== index);
    updated.forEach((c, idx) => { c.order = idx + 1; });
    setEditedChapters(updated);
    setHasUnsavedChanges(true);
  };

  const handleReRender = async () => {
    if (!activeProjectId) return;
    setIsReRendering(true);
    try {
      await api.reRenderLongformProject(activeProjectId, editedChapters);
      onToast('⚡ Re-rendering master video with updated chapters...', 'info');
      setActiveProject((prev) => prev ? { ...prev, status: 'rendering', progress: 15 } : null);
      setHasUnsavedChanges(false);
    } catch (err: any) {
      onToast(`Re-render failed: ${err.message}`, 'error');
    } finally {
      setIsReRendering(false);
    }
  };

  const handleAssignChannel = async (channelId: string) => {
    if (!activeProjectId) return;
    setSelectedChannelId(channelId);
    try {
      await api.assignLongformChannel(activeProjectId, channelId);
      onToast('Assigned channel updated', 'success');
    } catch (err: any) {
      onToast(`Failed to update channel: ${err.message}`, 'error');
    }
  };

  const handleSchedule = async (isImmediate = false) => {
    if (!activeProjectId) return;
    if (!selectedChannelId) {
      onToast('Please select a target YouTube channel first', 'error');
      return;
    }
    setIsScheduling(true);
    try {
      const res = await api.scheduleLongformProject(
        activeProjectId,
        selectedChannelId,
        isImmediate ? undefined : new Date(scheduledDateTime).toISOString(),
        isImmediate
      );
      onToast(res.message, 'success');
      if (res.data) {
        setActiveProject(res.data);
      }
    } catch (err: any) {
      onToast(`Scheduling failed: ${err.message}`, 'error');
    } finally {
      setIsScheduling(false);
    }
  };

  const handleCancelSchedule = async () => {
    if (!activeProjectId) return;
    try {
      const res = await api.cancelLongformSchedule(activeProjectId);
      onToast('Scheduled upload cancelled', 'info');
      if (res.data) {
        setActiveProject(res.data);
      }
    } catch (err: any) {
      onToast(`Cancel failed: ${err.message}`, 'error');
    }
  };

  const applyTimePreset = (option: 'today_6pm' | 'tmrw_10am' | 'tmrw_6pm' | 'in_2d_6pm') => {
    const d = new Date();
    if (option === 'today_6pm') {
      d.setHours(18, 0, 0, 0);
    } else if (option === 'tmrw_10am') {
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
    } else if (option === 'tmrw_6pm') {
      d.setDate(d.getDate() + 1);
      d.setHours(18, 0, 0, 0);
    } else if (option === 'in_2d_6pm') {
      d.setDate(d.getDate() + 2);
      d.setHours(18, 0, 0, 0);
    }

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    setScheduledDateTime(`${year}-${month}-${day}T${hours}:${mins}`);
    setPublishNow(false);
  };

  const copyToClipboard = (text: string, fieldKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    onToast('Copied to clipboard!', 'success');
    setTimeout(() => setCopiedField(null), 2500);
  };

  // Helper to format timestamps for YouTube description: "00:00 Chapter 1..."
  const generateYouTubeDescription = () => {
    if (!activeProject || !activeProject.chapters) return '';

    let accumulatedSeconds = 0;
    const timestampLines = (activeProject.chapters || []).map((ch) => {
      const mins = Math.floor(accumulatedSeconds / 60);
      const secs = Math.floor(accumulatedSeconds % 60);
      const stamp = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      accumulatedSeconds += ch.duration;
      return `${stamp} - ${ch.title}`;
    });

    return `${activeProject.title || activeProject.topic}

In this comprehensive deep-dive documentary, we explore the most insane details, leaked gameplay mechanics, and map scale secrets of GTA 6. 

TIMESTAMPS:
${timestampLines.join('\n')}

Subscribe to VICECLIPS for the fastest, most detailed GTA 6 analysis and news on YouTube!
#GTA6 #GrandTheftAuto6 #RockstarGames #GamingNews`;
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="space-y-8 animate-fade-in pb-16">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.06] pb-6">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.12] flex items-center justify-center shadow-inner-light">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">Long-Form Studio</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.1] text-zinc-300">
                16:9 1080P
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-violet-500/10 border border-violet-400/25 text-violet-300">
                -14 LUFS
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Paste multiple YouTube links — AI discovers the unifying story arc and renders a cohesive 1080p documentary.
            </p>
          </div>
        </div>

        {activeProjectId && (
          <button
            onClick={() => setActiveProjectId(null)}
            className="btn-glass flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Projects
          </button>
        )}
      </div>

      {/* ==================================================================== */}
      {/* VIEW 1: ACTIVE PROJECT STUDIO VIEW                                  */}
      {/* ==================================================================== */}
      {activeProject ? (
        <div className="space-y-8">
          {/* Active Project Title & Metadata Bar */}
          <div className="studio-card p-6 border-white/[0.08] space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-bold tracking-wide ${
                    activeProject.status === 'completed'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : activeProject.status === 'failed'
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 animate-pulse'
                  }`}>
                    {activeProject.status}
                  </span>
                  <span className="text-[11px] font-mono text-zinc-400">
                    Target: {Math.round(activeProject.target_duration / 60)} min
                  </span>
                  {activeProject.actual_duration > 0 && (
                    <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                      • Actual: {formatDuration(activeProject.actual_duration)}
                    </span>
                  )}
                  <span className="text-[11px] font-mono text-zinc-500">
                    • Created {new Date(activeProject.created_at).toLocaleDateString()}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white tracking-tight">
                  {activeProject.title || activeProject.topic}
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Topic Angle: <span className="text-zinc-200">{activeProject.topic}</span>
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {activeProject.status === 'failed' && (
                  <button
                    onClick={handleRetry}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry Synthesis
                  </button>
                )}

                {activeProject.status === 'completed' && activeProject.video_path && (
                  <a
                    href={api.getLongformDownloadUrl(activeProject.id)}
                    download
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download 1080p Master
                  </a>
                )}

                <button
                  onClick={() => handleDelete(activeProject.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 border border-white/[0.08] transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </div>

            {/* Live Progress Bar if processing */}
            {['pending', 'downloading', 'transcribing', 'scripting', 'rendering'].includes(activeProject.status) && (
              <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-mono text-indigo-400 flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    {activeProject.stage_message || 'Processing...'}
                  </span>
                  <span className="font-mono text-zinc-400 font-bold">{Math.round(activeProject.progress)}%</span>
                </div>
                <div className="w-full bg-black/50 h-2 rounded-full overflow-hidden border border-white/[0.08]">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 transition-all duration-300"
                    style={{ width: `${Math.max(5, activeProject.progress)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Cinema 16:9 Video Player & Theater View */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Player Column */}
            <div className="lg:col-span-2 space-y-4">
              <div className="studio-card p-4 border-white/[0.08] relative overflow-hidden group">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-white/[0.06] mb-3 gap-2">
                  <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-black/40 border border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setPreviewMode('video')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                        previewMode === 'video'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5" />
                      1080p Video Player
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode('thumbnail')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                        previewMode === 'thumbnail'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      16:9 Thumbnail Preview
                    </button>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {previewMode === 'video' ? '1920x1080 • -14 LUFS Normalized' : '1920x1080 High CTR Cover'}
                  </span>
                </div>

                <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black flex items-center justify-center border border-white/[0.08]">
                  {activeProject.video_path && activeProject.status === 'completed' ? (
                    previewMode === 'video' ? (
                      <video
                        controls
                        playsInline
                        poster={api.getLongformThumbnailUrl(activeProject.id)}
                        src={api.getLongformVideoUrl(activeProject.id)}
                        className="w-full h-full object-contain"
                        preload="auto"
                      />
                    ) : (
                      <div className="relative w-full h-full group/thumb">
                        <img
                          src={api.getLongformThumbnailUrl(activeProject.id)}
                          alt="16:9 Thumbnail Preview"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-between p-4 opacity-90 group-hover/thumb:opacity-100 transition-opacity">
                          <div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold uppercase tracking-wide">
                              HIGH CTR 16:9 THUMBNAIL
                            </span>
                            <p className="text-xs font-bold text-white mt-1 truncate max-w-md">
                              {activeProject.title || activeProject.topic}
                            </p>
                          </div>
                          <a
                            href={api.getLongformThumbnailUrl(activeProject.id)}
                            download="thumbnail_1080p.jpg"
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download Cover
                          </a>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 text-center space-y-3">
                      {activeProject.status === 'failed' ? (
                        <>
                          <AlertCircle className="w-10 h-10 text-rose-500" />
                          <p className="text-xs text-rose-300 font-semibold">Video Synthesis Failed</p>
                          <p className="text-[11px] text-zinc-500 font-mono max-w-md">{activeProject.error_message}</p>
                        </>
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-full border-2 border-purple-500/20 border-t-purple-500 animate-spin" />
                          <p className="text-xs text-zinc-300 font-semibold tracking-wide">
                            {activeProject.stage_message || 'Documentary synthesis in progress...'}
                          </p>
                          <p className="text-[11px] text-zinc-500 font-mono">
                            Whisper Transcription → AI Story Director → 1080p Mastering
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Destination YouTube Channel & Direct Download Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-3 border-t border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <Youtube className="w-4 h-4 text-red-500" />
                    <span className="text-xs text-zinc-300 font-medium">Assigned Channel:</span>
                    <span className="text-xs font-bold text-white">
                      {channels.find((c) => c.id === selectedChannelId)?.title || activeProject.channel_title || 'None Selected'}
                    </span>
                    <span className="text-[11px] text-zinc-500 font-mono ml-2">
                      • {activeProject.chapters?.length || 0} Chapters
                    </span>
                  </div>

                  {activeProject.status === 'completed' && activeProject.video_path && (
                    <div className="flex items-center gap-2">
                      <a
                        href={api.getLongformThumbnailUrl(activeProject.id)}
                        download={`${(activeProject.title || 'thumbnail').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)}.jpg`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 border border-white/[0.1] transition-colors"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                        Download Thumbnail
                      </a>
                      <a
                        href={api.getLongformDownloadUrl(activeProject.id)}
                        download
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-sm shadow-emerald-500/20"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download 1080p Video
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* YouTube Automated Scheduling & Publishing Control Dock */}
              <div className="studio-card p-5 border-white/[0.08] space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                  <div className="flex items-center gap-2">
                    <Youtube className="w-4 h-4 text-red-500" />
                    <span className="text-xs font-bold text-white tracking-wide">YOUTUBE SCHEDULE & PUBLICATION DOCK</span>
                  </div>
                  {activeProject.schedule_status && activeProject.schedule_status !== 'none' && (
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                      activeProject.schedule_status === 'posted'
                        ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                        : activeProject.schedule_status === 'scheduled'
                        ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 animate-pulse'
                        : activeProject.schedule_status === 'posting'
                        ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 animate-pulse'
                        : 'bg-rose-500/20 border border-rose-500/40 text-rose-300'
                    }`}>
                      {activeProject.schedule_status === 'posted' ? '✓ PUBLISHED TO YOUTUBE' : activeProject.schedule_status.toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Case 1: Video Already Published */}
                {activeProject.schedule_status === 'posted' && (
                  <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Successfully Published to YouTube Channel!
                      </div>
                      <p className="text-[11px] font-mono text-zinc-400">
                        Published at {activeProject.posted_at ? new Date(activeProject.posted_at).toLocaleString('en-IN') : 'recently'}
                      </p>
                    </div>
                    {activeProject.youtube_video_id && (
                      <a
                        href={`https://youtube.com/watch?v=${activeProject.youtube_video_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-all shadow-sm"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Watch on YouTube
                      </a>
                    )}
                  </div>
                )}

                {/* Case 2: Video Currently Scheduled */}
                {activeProject.schedule_status === 'scheduled' && (
                  <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                        <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
                        Scheduled for Auto-Upload by 1-Minute Cron Worker
                      </div>
                      <button
                        onClick={handleCancelSchedule}
                        className="text-[11px] font-mono text-zinc-400 hover:text-rose-400 px-2.5 py-1 rounded-lg bg-black/40 border border-white/[0.08] transition-colors"
                      >
                        Cancel Schedule
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                      <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06]">
                        <span className="text-zinc-500 block mb-0.5">Scheduled Publish Time (IST):</span>
                        <span className="text-amber-200 font-bold text-xs">
                          {activeProject.scheduled_time ? new Date(activeProject.scheduled_time).toLocaleString('en-IN') : 'Pending'}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06]">
                        <span className="text-zinc-500 block mb-0.5">Target Destination Channel:</span>
                        <span className="text-white font-bold text-xs">
                          {channels.find((c) => c.id === activeProject.assigned_channel_id)?.title || activeProject.channel_title || 'VICECLIPS'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Case 3: Video Ready - Configure Date/Time or Instant Upload */}
                {activeProject.status === 'completed' && activeProject.schedule_status !== 'posted' && (
                  <div className="space-y-4">
                    {/* Switcher: Schedule vs Publish Now */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setPublishNow(false)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          !publishNow
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-zinc-400 hover:text-white bg-white/[0.04]'
                        }`}
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        Pick Custom Schedule Time
                      </button>
                      <button
                        type="button"
                        onClick={() => setPublishNow(true)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          publishNow
                            ? 'bg-red-600 text-white shadow-sm'
                            : 'text-zinc-400 hover:text-white bg-white/[0.04]'
                        }`}
                      >
                        <Send className="w-3.5 h-3.5" />
                        Publish Immediately (Now)
                      </button>
                    </div>

                    {!publishNow ? (
                      <div className="space-y-3">
                        {/* Quick Presets */}
                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-1.5">
                            Quick Peak IST Scheduling Presets
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <button
                              type="button"
                              onClick={() => applyTimePreset('today_6pm')}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-mono bg-white/[0.04] hover:bg-purple-600/20 text-zinc-300 hover:text-purple-200 border border-white/[0.08] hover:border-purple-500/30 transition-colors"
                            >
                              Today 6:00 PM
                            </button>
                            <button
                              type="button"
                              onClick={() => applyTimePreset('tmrw_10am')}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-mono bg-white/[0.04] hover:bg-purple-600/20 text-zinc-300 hover:text-purple-200 border border-white/[0.08] hover:border-purple-500/30 transition-colors"
                            >
                              Tomorrow 10:00 AM
                            </button>
                            <button
                              type="button"
                              onClick={() => applyTimePreset('tmrw_6pm')}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-mono bg-white/[0.04] hover:bg-purple-600/20 text-zinc-300 hover:text-purple-200 border border-white/[0.08] hover:border-purple-500/30 transition-colors"
                            >
                              Tomorrow 6:00 PM
                            </button>
                            <button
                              type="button"
                              onClick={() => applyTimePreset('in_2d_6pm')}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-mono bg-white/[0.04] hover:bg-purple-600/20 text-zinc-300 hover:text-purple-200 border border-white/[0.08] hover:border-purple-500/30 transition-colors"
                            >
                              +2 Days 6:00 PM
                            </button>
                          </div>
                        </div>

                        {/* Date & Time Picker + Channel Selector */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block mb-1">
                              Custom Publish Date & Time
                            </label>
                            <input
                              type="datetime-local"
                              value={scheduledDateTime}
                              onChange={(e) => setScheduledDateTime(e.target.value)}
                              className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-purple-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block mb-1">
                              Destination YouTube Channel
                            </label>
                            <select
                              value={selectedChannelId}
                              onChange={(e) => handleAssignChannel(e.target.value)}
                              className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                            >
                              <option value="">Select YouTube Channel</option>
                              {channels.map((ch) => (
                                <option key={ch.id} value={ch.id}>
                                  {ch.title} {ch.status === 'active' ? '✓' : '(Reconnect)'}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSchedule(false)}
                          disabled={isScheduling || !selectedChannelId}
                          className="w-full py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white transition-all shadow-md shadow-purple-500/20 flex items-center justify-center gap-2 disabled:opacity-40"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          {isScheduling ? 'Scheduling Upload...' : `Confirm Schedule for ${new Date(scheduledDateTime).toLocaleString('en-IN')}`}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-3 rounded-xl bg-red-950/20 border border-red-500/30 text-xs text-zinc-300 space-y-1">
                          <p className="font-semibold text-red-300">⚡ Immediate YouTube Upload</p>
                          <p className="text-[11px] text-zinc-400 font-mono">
                            The 1080p master video, custom 16:9 thumbnail, chapter descriptions, and tags will be uploaded directly to your channel right now.
                          </p>
                        </div>

                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block mb-1">
                            Destination YouTube Channel
                          </label>
                          <select
                            value={selectedChannelId}
                            onChange={(e) => handleAssignChannel(e.target.value)}
                            className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                          >
                            <option value="">Select YouTube Channel</option>
                            {channels.map((ch) => (
                              <option key={ch.id} value={ch.id}>
                                {ch.title} {ch.status === 'active' ? '✓' : '(Reconnect)'}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSchedule(true)}
                          disabled={isScheduling || !selectedChannelId}
                          className="w-full py-2.5 rounded-xl font-bold text-xs bg-red-600 hover:bg-red-500 text-white transition-all shadow-md shadow-red-500/20 flex items-center justify-center gap-2 disabled:opacity-40"
                        >
                          <Youtube className="w-4 h-4" />
                          {isScheduling ? 'Uploading to YouTube...' : 'Upload & Publish to YouTube Now'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Live Terminal Logs */}
              <div className="studio-card p-4 border-white/[0.08] space-y-2">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                  <span className="text-xs font-semibold text-white tracking-wide flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Documentary Synthesis Engine Logs
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">{logs.length} events</span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1 font-mono text-[11px] text-zinc-400 pr-2">
                  {logs.length === 0 ? (
                    <p className="text-zinc-600 italic">No logs recorded yet</p>
                  ) : (
                    logs.map((log, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-zinc-600 shrink-0">[{log.timestamp}]</span>
                        <span className={
                          log.level === 'error'
                            ? 'text-rose-400'
                            : log.level === 'warn'
                            ? 'text-amber-400'
                            : log.level === 'success'
                            ? 'text-emerald-400'
                            : 'text-zinc-300'
                        }>
                          {log.message}
                        </span>
                      </div>
                    ))
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>

            {/* Right Column: AI Narrative Script & YouTube Metadata */}
            <div className="space-y-4">
              {/* YouTube Metadata Box */}
              <div className="studio-card p-5 border-white/[0.08] space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
                  <div className="flex items-center gap-2">
                    <Youtube className="w-4 h-4 text-red-500" />
                    <h3 className="text-xs font-bold text-white tracking-wide">YOUTUBE SEO & CHAPTERS</h3>
                  </div>
                  <button
                    onClick={() => copyToClipboard(generateYouTubeDescription(), 'desc')}
                    className="flex items-center gap-1 text-[11px] font-mono text-purple-300 hover:text-purple-200 transition-colors"
                  >
                    {copiedField === 'desc' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    Copy Timestamps
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Video Title</label>
                    <div className="flex items-center justify-between mt-1 p-2 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-white">
                      <span className="font-medium truncate mr-2">{activeProject.title || activeProject.topic}</span>
                      <button
                        onClick={() => copyToClipboard(activeProject.title || activeProject.topic, 'title')}
                        className="text-zinc-400 hover:text-white shrink-0"
                      >
                        {copiedField === 'title' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Story Arc Narrative Outline</label>
                    <div className="mt-1 p-2.5 rounded-lg bg-black/40 border border-white/[0.08] text-[11px] text-zinc-300 max-h-36 overflow-y-auto leading-relaxed">
                      {activeProject.script_outline || 'AI Director synthesized narrative roadmap connecting all source clips.'}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">YouTube Ready Description & Chapters</label>
                    <textarea
                      readOnly
                      value={generateYouTubeDescription()}
                      className="w-full mt-1 p-2 rounded-lg bg-black/40 border border-white/[0.08] text-[11px] font-mono text-zinc-400 h-32 resize-none focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ================================================================ */}
          {/* INTERACTIVE CHAPTER STORYBOARD / TIMELINE EDITOR                */}
          {/* ================================================================ */}
          <div className="studio-card p-6 border-white/[0.08] space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-bold text-white tracking-wide">Interactive Chapter Storyboard</h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-zinc-400">
                    {editedChapters.length} segments
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Reorder, rename, or tweak chapter start/end trim points. Re-rendering assembles updated cuts in seconds.
                </p>
              </div>

              {hasUnsavedChanges && (
                <button
                  onClick={handleReRender}
                  disabled={isReRendering}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white transition-all shadow-md shadow-purple-500/20"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isReRendering ? 'animate-spin' : ''}`} />
                  Re-Render Master Video
                </button>
              )}
            </div>

            {/* Chapters List */}
            <div className="space-y-3">
              {editedChapters.map((chapter, index) => (
                <div
                  key={chapter.id || index}
                  className="p-4 rounded-xl bg-black/30 border border-white/[0.06] hover:border-purple-500/30 transition-all space-y-3"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    {/* Chapter Order & Title */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex flex-col items-center">
                        <button
                          onClick={() => handleMoveChapter(index, 'up')}
                          disabled={index === 0}
                          className="p-0.5 text-zinc-500 hover:text-white disabled:opacity-20"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-mono font-bold text-purple-400">#{index + 1}</span>
                        <button
                          onClick={() => handleMoveChapter(index, 'down')}
                          disabled={index === editedChapters.length - 1}
                          className="p-0.5 text-zinc-500 hover:text-white disabled:opacity-20"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={chapter.title}
                          onChange={(e) => handleChapterTitleChange(index, e.target.value)}
                          className="w-full bg-transparent border-b border-transparent hover:border-white/20 focus:border-purple-500 text-sm font-semibold text-white focus:outline-none transition-colors"
                        />
                        <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-zinc-500">
                          <span>Source #{chapter.source_index + 1}: {chapter.source_title?.slice(0, 30)}...</span>
                          <span>•</span>
                          <span className="text-emerald-400 font-medium">Duration: {Math.round(chapter.duration)}s</span>
                        </div>
                      </div>
                    </div>

                    {/* Hook Banner Input & Timestamps */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5 bg-black/40 border border-white/[0.08] px-2.5 py-1 rounded-lg">
                        <span className="text-[10px] font-mono text-amber-400 font-bold">HOOK BADGE:</span>
                        <input
                          type="text"
                          value={chapter.hook_text || ''}
                          onChange={(e) => handleChapterHookChange(index, e.target.value)}
                          placeholder="e.g. SECRET MAP REVEALED"
                          className="bg-transparent text-xs text-amber-300 focus:outline-none w-36 font-semibold"
                        />
                      </div>

                      {/* Trim Handles */}
                      <div className="flex items-center gap-1.5 bg-black/40 border border-white/[0.08] px-2.5 py-1 rounded-lg text-xs font-mono">
                        <span className="text-zinc-500">Start:</span>
                        <input
                          type="number"
                          value={Math.round(chapter.start_time)}
                          onChange={(e) => handleChapterTimeChange(index, 'start_time', parseFloat(e.target.value) || 0)}
                          className="w-12 bg-transparent text-white focus:outline-none"
                        />
                        <span className="text-zinc-500">End:</span>
                        <input
                          type="number"
                          value={Math.round(chapter.end_time)}
                          onChange={(e) => handleChapterTimeChange(index, 'end_time', parseFloat(e.target.value) || 0)}
                          className="w-12 bg-transparent text-white focus:outline-none"
                        />
                      </div>

                      <button
                        onClick={() => handleRemoveChapter(index)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Remove chapter"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {chapter.summary && (
                    <p className="text-[11px] text-zinc-400 pl-8 italic border-l-2 border-purple-500/30">
                      "{chapter.summary}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ==================================================================== */
        /* VIEW 2: NEW VIDEO SYNTHESIS CREATOR & ARCHIVE BENTO GALLERY         */
        /* ==================================================================== */
        <div className="space-y-10">
          {/* Creator Deck */}
          <div className="glass-deck rounded-3xl p-6 sm:p-8 relative overflow-hidden">
            <div className="aurora-glow-edge absolute -bottom-8 left-1/2 -translate-x-1/2 w-[85%] h-24 animate-aurora" />

            <div className="relative z-10 max-w-3xl space-y-6">
              <div>
                <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  Synthesize New Long-Form Video
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Just paste 2 to 5 YouTube URLs (even from different videos). Our AI automatically analyzes all transcripts, finds the best unifying story arc, and stitches them into one cohesive 1080p video from start to end.
                </p>
              </div>

              {/* GTA 6 Presets */}
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Quick GTA 6 Viral Topic Presets
                </label>
                <div className="flex flex-wrap gap-2">
                  {GTA6_PRESETS.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleApplyPreset(p)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] hover:bg-purple-600/20 text-zinc-300 hover:text-purple-200 border border-white/[0.08] hover:border-purple-500/40 transition-colors text-left"
                    >
                      ⚡ {p.title}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleCreateProject} className="space-y-5">
                {/* Topic Input */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                    Video Topic / Angle <span className="text-zinc-500">(Optional — leave blank for AI Auto-Discovery)</span>
                  </label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Leave blank to let AI auto-analyze your videos and invent the best unified story..."
                    className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>

                {/* Multi Source URLs */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                      Source YouTube Video Links (2 to 5 sources) <span className="text-red-400">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleAddSourceUrl}
                      disabled={sourceUrls.length >= 5}
                      className="text-[11px] font-mono text-purple-400 hover:text-purple-300 flex items-center gap-1 disabled:opacity-30"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Source URL ({sourceUrls.length}/5)
                    </button>
                  </div>

                  <div className="space-y-2">
                    {sourceUrls.map((url, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-zinc-500 w-6 text-center">#{idx + 1}</span>
                        <input
                          type="url"
                          value={url}
                          onChange={(e) => handleSourceUrlChange(idx, e.target.value)}
                          placeholder={`https://www.youtube.com/watch?v=... (Source ${idx + 1})`}
                          className="flex-1 bg-black/40 border border-white/[0.08] rounded-xl px-4 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 font-mono"
                        />
                        {sourceUrls.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSourceUrl(idx)}
                            className="p-2 text-zinc-500 hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Target Duration Selector */}
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                    Target Output Duration
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { sec: 480, label: '8 Minutes', note: 'Fast & Punchy' },
                      { sec: 600, label: '10 Minutes', note: 'Optimal Mid-rolls' },
                      { sec: 720, label: '12 Minutes', note: 'Deep Dive' },
                      { sec: 900, label: '15 Minutes', note: 'Full Documentary' }
                    ].map((opt) => (
                      <button
                        key={opt.sec}
                        type="button"
                        onClick={() => setTargetDuration(opt.sec)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          targetDuration === opt.sec
                            ? 'bg-purple-600/20 border-purple-500 text-white shadow-sm'
                            : 'bg-black/30 border-white/[0.06] text-zinc-400 hover:border-white/20'
                        }`}
                      >
                        <div className="text-xs font-bold text-white">{opt.label}</div>
                        <div className="text-[10px] text-zinc-500 font-mono">{opt.note}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary w-full py-3 rounded-xl text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  {isSubmitting ? 'Initializing Documentary Engine...' : 'Synthesize Long-Form Video'}
                </button>
              </form>
            </div>
          </div>

          {/* Synthesized Long-Form Projects Archive */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">Synthesized Long-Form Projects</h3>
                <p className="text-[11px] text-zinc-500 font-mono">Archive of multi-source 16:9 videos</p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-zinc-400">
                {projects.length} Total
              </span>
            </div>

            {projects.length === 0 ? (
              <div className="studio-card p-12 text-center space-y-3 border-dashed border-white/10">
                <Film className="w-10 h-10 text-zinc-600 mx-auto" />
                <h4 className="text-sm font-semibold text-zinc-300">No Long-Form Videos Synthesized Yet</h4>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Pick one of the GTA 6 presets above or paste your source links to create your first cohesive long-form video essay.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {projects.map((proj) => (
                  <div
                    key={proj.id}
                    className="studio-card-interactive p-5 border-white/[0.08] flex flex-col justify-between space-y-4 group cursor-pointer"
                    onClick={() => setActiveProjectId(proj.id)}
                  >
                    <div className="space-y-3">
                      {/* Thumbnail or Placeholder */}
                      <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-black/60 border border-white/[0.06]">
                        {proj.thumbnail_path && proj.status === 'completed' ? (
                          <img
                            src={api.getLongformThumbnailUrl(proj.id)}
                            alt={proj.title || 'Thumbnail'}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 space-y-1">
                            <Video className="w-8 h-8 opacity-40" />
                            <span className="text-[10px] font-mono uppercase">{proj.status}</span>
                          </div>
                        )}
                        <span className={`absolute top-2 left-2 text-[9px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                          proj.status === 'completed'
                            ? 'bg-emerald-950/90 border border-emerald-500/40 text-emerald-300'
                            : proj.status === 'failed'
                            ? 'bg-rose-950/90 border border-rose-500/40 text-rose-300'
                            : 'bg-indigo-950/90 border border-indigo-500/40 text-indigo-300'
                        }`}>
                          {proj.status}
                        </span>

                        {proj.actual_duration > 0 && (
                          <span className="absolute bottom-2 right-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/80 text-white font-semibold">
                            {formatDuration(proj.actual_duration)}
                          </span>
                        )}
                      </div>

                      <div>
                        <h4 className="text-xs font-bold text-white line-clamp-2 group-hover:text-purple-300 transition-colors">
                          {proj.title || proj.topic}
                        </h4>
                        <p className="text-[11px] text-zinc-500 font-mono mt-1">
                          {proj.chapter_count || 0} Chapters • {new Date(proj.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-white/[0.06] text-xs">
                      <span className="text-purple-400 font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                        Open Studio <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(proj.id);
                        }}
                        className="text-zinc-500 hover:text-rose-400 p-1 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
