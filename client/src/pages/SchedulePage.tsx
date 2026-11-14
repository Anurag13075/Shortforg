import React, { useState, useEffect } from 'react';
import {
  Youtube,
  Plus,
  Trash2,
  Calendar,
  Clock,
  Sparkles,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  CalendarDays,
  Send
} from 'lucide-react';
import { Channel, QueueItem, Clip } from '../types';
import { api } from '../api';

interface SchedulePageProps {
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const SchedulePage: React.FC<SchedulePageProps> = ({ onToast }) => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [approvedClips, setApprovedClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Manual scheduling state
  const [selectedClipId, setSelectedClipId] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [scheduledDateTime, setScheduledDateTime] = useState('');
  const [isSubmittingSchedule, setIsSubmittingSchedule] = useState(false);

  // Auto-schedule options
  const [autoChannelId, setAutoChannelId] = useState('');
  const [clipsPerDay, setClipsPerDay] = useState(2);
  const [isAutoScheduling, setIsAutoScheduling] = useState(false);

  const fetchData = async () => {
    try {
      const [channelsData, queueData, projectsData] = await Promise.all([
        api.getChannels(),
        api.getSchedule(),
        api.getProjects()
      ]);

      setChannels(channelsData);
      setQueue(queueData);

      if (channelsData.length > 0 && !selectedChannelId) {
        setSelectedChannelId(channelsData[0].id);
        setAutoChannelId(channelsData[0].id);
      }

      const allApproved: Clip[] = [];
      for (const p of projectsData) {
        try {
          const detail = await api.getProject(p.id);
          const approved = (detail.clips || []).filter((c) => c.status === 'approved');
          allApproved.push(...approved);
        } catch {}
      }
      setApprovedClips(allApproved);
      if (allApproved.length > 0 && !selectedClipId) {
        setSelectedClipId(allApproved[0].id);
      }
    } catch (err: any) {
      onToast(`Failed to load scheduling data: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);

    const params = new URLSearchParams(window.location.search);
    const authStatus = params.get('auth');
    if (authStatus === 'success') {
      const channel = params.get('channel') || 'YouTube Channel';
      onToast(`Connected channel: "${channel}"`, 'success');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (authStatus === 'error') {
      const message = params.get('message') || 'Unknown error';
      onToast(`Channel connection failed: ${message}`, 'error');
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const localIso = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setScheduledDateTime(localIso);

    return () => clearInterval(interval);
  }, []);

  const handleConnectChannel = () => {
    window.location.href = '/auth/google';
  };

  const handleDisconnectChannel = async (id: string, title: string) => {
    if (!confirm(`Disconnect channel "${title}"?`)) return;
    try {
      await api.deleteChannel(id);
      setChannels((prev) => prev.filter((c) => c.id !== id));
      onToast(`Channel "${title}" disconnected`, 'info');
    } catch (err: any) {
      onToast(`Failed to disconnect: ${err.message}`, 'error');
    }
  };

  const handleManualSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClipId || !selectedChannelId || !scheduledDateTime) {
      onToast('Select a clip, channel, and scheduled date/time', 'error');
      return;
    }

    setIsSubmittingSchedule(true);
    try {
      const isoTime = new Date(scheduledDateTime).toISOString();
      await api.scheduleClip(selectedClipId, selectedChannelId, isoTime);
      onToast('Clip queued for YouTube Shorts upload', 'success');
      await fetchData();
    } catch (err: any) {
      onToast(`Scheduling failed: ${err.message}`, 'error');
    } finally {
      setIsSubmittingSchedule(false);
    }
  };

  const handleAutoSchedule = async () => {
    if (!autoChannelId) {
      onToast('Select a channel for auto-scheduling', 'error');
      return;
    }

    setIsAutoScheduling(true);
    try {
      const res = await api.autoSchedule(autoChannelId, clipsPerDay);
      onToast(res.message, 'success');
      await fetchData();
    } catch (err: any) {
      onToast(`Auto-schedule failed: ${err.message}`, 'error');
    } finally {
      setIsAutoScheduling(false);
    }
  };

  const handleRetry = async (queueId: string) => {
    try {
      await api.retryQueueItem(queueId);
      onToast('Upload retry initiated', 'info');
      await fetchData();
    } catch (err: any) {
      onToast(`Retry failed: ${err.message}`, 'error');
    }
  };

  const handleDeleteQueue = async (queueId: string) => {
    try {
      await api.deleteQueueItem(queueId);
      setQueue((prev) => prev.filter((q) => q.id !== queueId));
      onToast('Queue entry removed', 'info');
    } catch (err: any) {
      onToast(`Delete failed: ${err.message}`, 'error');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-fade-in">
      {/* SECTION 1: CONNECTED CHANNELS */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-white">YouTube Channels</h2>
            <p className="text-[11px] text-zinc-500 font-mono">
              Authorized OAuth destinations for auto-uploading Shorts
            </p>
          </div>

          <button
            onClick={handleConnectChannel}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-zinc-200 text-zinc-950 rounded-full text-xs font-semibold transition-all shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Connect Channel</span>
          </button>
        </div>

        {channels.length === 0 ? (
          <div className="craft-card p-8 rounded-2xl border-dashed text-center">
            <Youtube className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
            <p className="text-xs font-semibold text-zinc-300">No YouTube channels connected</p>
            <p className="text-[11px] text-zinc-500 max-w-sm mx-auto mt-1 mb-4">
              Authenticate via Google OAuth to upload approved clips directly to your channel.
            </p>
            <button
              onClick={handleConnectChannel}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium border border-white/10 transition-colors cursor-pointer"
            >
              Sign In with Google
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {channels.map((ch) => (
              <div
                key={ch.id}
                className="craft-card p-3.5 rounded-xl flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {ch.avatar_url ? (
                    <img
                      src={ch.avatar_url}
                      alt={ch.title}
                      className="w-9 h-9 rounded-full border border-white/10 object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-zinc-800 text-white flex items-center justify-center font-bold text-xs shrink-0 border border-white/10">
                      {ch.title.charAt(0)}
                    </div>
                  )}

                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-white truncate">{ch.title}</h4>
                    {ch.status === 'reconnect_needed' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-rose-400">
                        <AlertCircle className="w-3 h-3" />
                        Reconnect needed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" />
                        Active • {ch.total_posted || 0} posted
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {ch.status === 'reconnect_needed' && (
                    <button
                      onClick={handleConnectChannel}
                      className="p-1.5 text-xs text-rose-400 hover:text-white bg-rose-500/10 rounded-md"
                      title="Reconnect Channel"
                    >
                      <RotateCw className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDisconnectChannel(ch.id, ch.title)}
                    className="p-1.5 text-zinc-500 hover:text-rose-400 rounded-md hover:bg-white/[0.04] transition-colors"
                    title="Disconnect Channel"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 2: SMART SCHEDULING CONTROLS */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Auto-Scheduler */}
        <div className="craft-card p-5 rounded-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-white tracking-tight uppercase font-mono">
                Smart Auto-Scheduler
              </h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Distributes approved clips across your calendar at peak viral engagement windows (10:00 AM & 6:00 PM).
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase block mb-1">
                  Channel
                </label>
                <select
                  value={autoChannelId}
                  onChange={(e) => setAutoChannelId(e.target.value)}
                  disabled={channels.length === 0}
                  className="w-full bg-zinc-900 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-white/20"
                >
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase block mb-1">
                  Cadence
                </label>
                <select
                  value={clipsPerDay}
                  onChange={(e) => setClipsPerDay(parseInt(e.target.value, 10))}
                  className="w-full bg-zinc-900 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-white/20"
                >
                  <option value={1}>1 Short per day (2:00 PM)</option>
                  <option value={2}>2 Shorts per day (10:00 AM & 6:00 PM) [Optimal]</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-white/[0.05]">
            <button
              onClick={handleAutoSchedule}
              disabled={isAutoScheduling || channels.length === 0}
              className="w-full flex items-center justify-center gap-2 py-2 bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs rounded-xl shadow-sm transition-all disabled:opacity-40 cursor-pointer"
            >
              {isAutoScheduling ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Distributing...</span>
                </>
              ) : (
                <>
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>Auto-Schedule All Approved Clips</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Manual Queue Form */}
        <div className="craft-card p-5 rounded-2xl flex flex-col justify-between">
          <form onSubmit={handleManualSchedule} className="flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Calendar className="w-4 h-4 text-blue-400" />
                <h3 className="text-xs font-bold text-white tracking-tight uppercase font-mono">
                  Manual Slot Reservation
                </h3>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                Schedule a specific approved Short for publication at a custom date and time.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-mono text-zinc-500 uppercase block mb-1">
                    Select Clip
                  </label>
                  <select
                    value={selectedClipId}
                    onChange={(e) => setSelectedClipId(e.target.value)}
                    disabled={approvedClips.length === 0}
                    className="w-full bg-zinc-900 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-white/20"
                  >
                    {approvedClips.length === 0 ? (
                      <option value="">No approved clips available</option>
                    ) : (
                      approvedClips.map((c) => (
                        <option key={c.id} value={c.id}>
                          ★ {c.virality_score} — {c.title.substring(0, 45)}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-mono text-zinc-500 uppercase block mb-1">
                      Channel
                    </label>
                    <select
                      value={selectedChannelId}
                      onChange={(e) => setSelectedChannelId(e.target.value)}
                      disabled={channels.length === 0}
                      className="w-full bg-zinc-900 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-white/20"
                    >
                      {channels.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          {ch.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-zinc-500 uppercase block mb-1">
                      Publish Date/Time
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledDateTime}
                      onChange={(e) => setScheduledDateTime(e.target.value)}
                      required
                      className="w-full bg-zinc-900 border border-white/[0.08] rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-white/20 font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-white/[0.05]">
              <button
                type="submit"
                disabled={isSubmittingSchedule || channels.length === 0 || approvedClips.length === 0}
                className="w-full flex items-center justify-center gap-2 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs rounded-xl border border-white/10 transition-all disabled:opacity-40 cursor-pointer"
              >
                {isSubmittingSchedule ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Enqueue for Upload</span>
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* SECTION 3: PUBLISHING TIMELINE QUEUE */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-white">Upload Queue</h2>
            <p className="text-[11px] text-zinc-500 font-mono">
              Auto-processed every minute by the background cron worker
            </p>
          </div>

          <button
            onClick={fetchData}
            className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition-colors"
            title="Refresh queue"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {queue.length === 0 ? (
          <div className="craft-card p-10 rounded-2xl text-center border-dashed">
            <Clock className="w-7 h-7 text-zinc-700 mx-auto mb-2" />
            <p className="text-xs font-semibold text-zinc-300">Upload queue is currently empty</p>
            <p className="text-[11px] text-zinc-500 max-w-sm mx-auto mt-1">
              Approve clips in your Projects and click "Auto-Schedule" to queue them for publication.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {queue.map((item) => {
              const scheduledDate = new Date(item.scheduled_time);
              const isPast = scheduledDate <= new Date();

              return (
                <div
                  key={item.id}
                  className="craft-card craft-card-interactive p-3 rounded-xl flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* 9:16 Miniature Thumbnail Preview */}
                    <div className="w-10 h-14 bg-black rounded-lg overflow-hidden shrink-0 border border-white/10 flex items-center justify-center">
                      {item.thumbnail_path ? (
                        <img
                          src={api.getThumbnailUrl(item.clip_id)}
                          alt={item.clip_title || ''}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Youtube className="w-4 h-4 text-zinc-700" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold text-white truncate">
                        {item.clip_title || 'Untitled Short'}
                      </h4>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 mt-0.5">
                        <span className="text-zinc-300 font-medium">{item.channel_title}</span>

                        <span className="flex items-center gap-1 font-mono text-zinc-500">
                          <Calendar className="w-3 h-3 text-zinc-600" />
                          {scheduledDate.toLocaleDateString()} at{' '}
                          {scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>

                        {item.status === 'failed' && item.error_message && (
                          <span className="text-rose-400 text-[10px] font-mono truncate max-w-md">
                            ⚠️ {item.error_message} ({item.retry_count}/3)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status & Controls */}
                  <div className="flex items-center gap-2.5 shrink-0">
                    {item.status === 'scheduled' && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
                        {isPast ? 'Due' : 'Scheduled'}
                      </span>
                    )}

                    {item.status === 'posting' && (
                      <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Uploading</span>
                      </span>
                    )}

                    {item.status === 'posted' && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                          Published
                        </span>
                        {item.youtube_video_id && (
                          <a
                            href={`https://youtube.com/shorts/${item.youtube_video_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 text-zinc-400 hover:text-white rounded-md transition-colors"
                            title="View Short on YouTube"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    )}

                    {item.status === 'failed' && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400">
                          Failed
                        </span>
                        <button
                          onClick={() => handleRetry(item.id)}
                          className="flex items-center gap-1 px-2 py-0.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-md text-[10px] font-mono transition-colors"
                          title="Retry Upload Now"
                        >
                          <RotateCw className="w-2.5 h-2.5" />
                          <span>Retry</span>
                        </button>
                      </div>
                    )}

                    {item.status !== 'posting' && (
                      <button
                        onClick={() => handleDeleteQueue(item.id)}
                        className="p-1 text-zinc-600 hover:text-rose-400 transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
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
