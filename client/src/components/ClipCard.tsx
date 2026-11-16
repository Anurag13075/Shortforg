import React, { useState } from 'react';
import {
  Check,
  X,
  Download,
  RotateCw,
  Sliders,
  Image as ImageIcon,
  Film,
  Save,
  Loader2,
  Clock,
  ChevronDown,
  ChevronUp,
  Calendar,
  Send,
  Youtube,
  CheckCircle2
} from 'lucide-react';
import { Clip, Channel } from '../types';
import { api } from '../api';

interface ClipCardProps {
  clip: Clip;
  channels: Channel[];
  onUpdate: (updatedClip: Clip) => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ClipCard: React.FC<ClipCardProps> = ({ clip, channels, onUpdate, onToast }) => {
  const [activeTab, setActiveTab] = useState<'video' | 'thumbnail'>('video');
  const [showMetadata, setShowMetadata] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(clip.title);
  const [caption, setCaption] = useState(clip.caption || '');
  const [hashtags, setHashtags] = useState(() => {
    try {
      const parsed = JSON.parse(clip.hashtags || '[]');
      return Array.isArray(parsed) ? parsed.join(' ') : (clip.hashtags || '');
    } catch {
      return clip.hashtags || '';
    }
  });
  const [cropOffset, setCropOffset] = useState(clip.crop_offset_x || 0);
  const [isSaving, setIsSaving] = useState(false);
  const [isRendering, setIsRendering] = useState(clip.status === 'rendering');

  // Channel & scheduling states
  const [selectedChannelId, setSelectedChannelId] = useState<string>(
    clip.assigned_channel_id || (channels[0]?.id || '')
  );
  const [scheduledDateTime, setScheduledDateTime] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    return new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  const [isScheduling, setIsScheduling] = useState(false);

  const clipDuration = Math.round(clip.end_time - clip.start_time);

  const handleStatusChange = async (newStatus: 'approved' | 'rejected' | 'draft') => {
    try {
      const payload: Partial<Clip> = { status: newStatus };
      if (newStatus === 'approved' && !clip.assigned_channel_id && selectedChannelId) {
        payload.assigned_channel_id = selectedChannelId;
      }
      const updated = await api.updateClip(clip.id, payload);
      onUpdate(updated);
      onToast(`Short marked as ${newStatus}`, 'success');
    } catch (err: any) {
      onToast(`Failed to update status: ${err.message}`, 'error');
    }
  };

  const handleAssignChannel = async (channelId: string) => {
    setSelectedChannelId(channelId);
    try {
      const updated = await api.updateClip(clip.id, { assigned_channel_id: channelId });
      onUpdate(updated);
      const ch = channels.find((c) => c.id === channelId);
      onToast(`Assigned to ${ch?.title || 'channel'}`, 'info');
    } catch (err: any) {
      onToast(`Failed to assign channel: ${err.message}`, 'error');
    }
  };

  const handleQuickSchedule = async (presetTimeIso?: string) => {
    if (!selectedChannelId) {
      onToast('Please connect and select a YouTube channel first', 'error');
      return;
    }

    setIsScheduling(true);
    try {
      const timeToSchedule = presetTimeIso || new Date(scheduledDateTime).toISOString();
      const updated = await api.scheduleClipDirect(clip.id, selectedChannelId, timeToSchedule);
      onUpdate(updated);
      setShowScheduleModal(false);
      const ch = channels.find((c) => c.id === selectedChannelId);
      onToast(`Queued for upload to ${ch?.title || 'YouTube'}!`, 'success');
    } catch (err: any) {
      onToast(`Scheduling failed: ${err.message}`, 'error');
    } finally {
      setIsScheduling(false);
    }
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      const tagsArray = hashtags
        .split(/\s+/)
        .map((t) => (t.startsWith('#') ? t : `#${t}`))
        .filter((t) => t.length > 1);

      const updated = await api.updateClip(clip.id, {
        title: title.trim(),
        caption: caption.trim(),
        hashtags: JSON.stringify(tagsArray),
        crop_offset_x: cropOffset,
        assigned_channel_id: selectedChannelId || undefined
      });

      onUpdate(updated);
      setIsEditing(false);
      onToast('Changes saved', 'success');
    } catch (err: any) {
      onToast(`Save failed: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerate = async () => {
    setIsRendering(true);
    onToast('Re-rendering vertical crop with FFmpeg...', 'info');
    try {
      const updated = await api.renderClip(clip.id, cropOffset);
      onUpdate(updated);
      onToast('Short re-rendered successfully!', 'success');
    } catch (err: any) {
      onToast(`Re-render failed: ${err.message}`, 'error');
    } finally {
      setIsRendering(false);
    }
  };

  // Preset time builders
  const getPresetIso = (type: 'tomorrow_10am' | 'tomorrow_6pm' | 'today_6pm') => {
    const d = new Date();
    if (type === 'today_6pm') {
      d.setHours(18, 0, 0, 0);
      if (d.getTime() < Date.now()) {
        d.setDate(d.getDate() + 1);
      }
    } else if (type === 'tomorrow_10am') {
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
    } else if (type === 'tomorrow_6pm') {
      d.setDate(d.getDate() + 1);
      d.setHours(18, 0, 0, 0);
    }
    return d.toISOString();
  };

  const currentChannel = channels.find((c) => c.id === (clip.assigned_channel_id || selectedChannelId));

  return (
    <div
      className={`studio-card overflow-hidden flex flex-col transition-all duration-200 ${
        clip.status === 'scheduled'
          ? 'ring-1 ring-blue-500/50 border-blue-500/40'
          : clip.status === 'approved'
          ? 'ring-1 ring-emerald-500/40 border-emerald-500/30'
          : clip.status === 'rejected'
          ? 'opacity-40 grayscale-[40%]'
          : ''
      }`}
    >
      {/* Top Header: Score, Duration & Media Switcher */}
      <div className="p-3 bg-[#0c0d12] border-b border-white/[0.06] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Virality score badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs font-mono font-medium">
            <span className="text-amber-400 font-bold">{clip.virality_score}</span>
            <span className="text-zinc-500 text-[10px]">/100</span>
          </div>

          <div className="flex items-center gap-1 text-[11px] text-zinc-400 font-mono">
            <Clock className="w-3 h-3 text-zinc-500" />
            <span>{clipDuration}s</span>
          </div>
        </div>

        {/* Media Switcher Capsule */}
        <div className="flex items-center p-0.5 rounded-lg bg-black/40 border border-white/[0.06]">
          <button
            onClick={() => setActiveTab('video')}
            className={`p-1 rounded text-xs transition-colors ${
              activeTab === 'video' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-white'
            }`}
            title="Video Preview"
          >
            <Film className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setActiveTab('thumbnail')}
            className={`p-1 rounded text-xs transition-colors ${
              activeTab === 'thumbnail' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-white'
            }`}
            title="Thumbnail Preview"
          >
            <ImageIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 9:16 Video Player Frame */}
      <div className="relative bg-black w-full aspect-[9/16] max-h-[380px] flex items-center justify-center overflow-hidden border-b border-white/[0.06]">
        {isRendering ? (
          <div className="flex flex-col items-center gap-2 text-center p-4">
            <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
            <p className="text-xs font-medium text-white">Re-rendering with FFmpeg...</p>
            <p className="text-[10px] text-zinc-500 font-mono">Applying 9:16 crop & animated subtitles</p>
          </div>
        ) : activeTab === 'video' ? (
          clip.video_path ? (
            <video
              src={api.getVideoUrl(clip.id)}
              controls
              playsInline
              preload="metadata"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="text-xs text-zinc-600 font-mono">Video pending render</div>
          )
        ) : clip.thumbnail_path ? (
          <img
            src={api.getThumbnailUrl(clip.id)}
            alt={clip.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-xs text-zinc-600 font-mono">No thumbnail generated</div>
        )}

        {/* Hook Capsule */}
        {clip.hook_line && (
          <div className="absolute top-2.5 left-2.5 right-2.5 pointer-events-none">
            <span className="inline-block bg-black/85 text-amber-300 border border-white/10 text-[10px] font-bold px-2 py-0.5 rounded shadow tracking-wide uppercase line-clamp-1">
              HOOK: {clip.hook_line}
            </span>
          </div>
        )}

        {/* Assigned Channel Status Pill */}
        {clip.status === 'scheduled' ? (
          <div className="absolute bottom-2.5 left-2.5 right-2.5 pointer-events-none">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-950/90 border border-blue-500/40 text-[10px] font-mono text-blue-300 shadow">
              <Clock className="w-3 h-3 text-blue-400 shrink-0" />
              <span className="truncate">
                Scheduled for {clip.assigned_channel_title || currentChannel?.title || 'Channel'}
              </span>
            </div>
          </div>
        ) : clip.status === 'approved' && (
          <div className="absolute bottom-2.5 left-2.5 right-2.5 pointer-events-none">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-950/90 border border-emerald-500/40 text-[10px] font-mono text-emerald-300 shadow">
              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className="truncate">
                Approved • {clip.assigned_channel_title || currentChannel?.title || 'Ready to schedule'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Card Body & Controls */}
      <div className="p-3.5 flex-1 flex flex-col justify-between gap-3 bg-[#111218]">
        <div>
          {/* Virality Reason */}
          {clip.reason && (
            <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed mb-2.5 px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/[0.04]">
              {clip.reason}
            </p>
          )}

          {/* Title Editor */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono mb-1">
              <span>TITLE</span>
              <span>{title.length}/70</span>
            </div>
            <input
              type="text"
              value={title}
              maxLength={70}
              onChange={(e) => {
                setTitle(e.target.value);
                setIsEditing(true);
              }}
              className="w-full bg-black/40 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/30 transition-colors font-medium"
            />
          </div>

          {/* Channel Selector Pill */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono mb-1">
              <span>DESTINATION CHANNEL</span>
            </div>
            {channels.length === 0 ? (
              <div className="px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/[0.06] text-[11px] text-zinc-500 flex items-center justify-between">
                <span>No channels connected</span>
                <span className="text-zinc-400 text-[10px]">Add in Schedule</span>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedChannelId}
                  onChange={(e) => handleAssignChannel(e.target.value)}
                  className="w-full bg-black/40 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-white/30 transition-colors appearance-none pr-8 cursor-pointer font-medium"
                >
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.title} ({ch.total_posted || 0} posted)
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}
          </div>

          {/* Collapsible Caption & Hashtags */}
          <div className="mb-2">
            <button
              onClick={() => setShowMetadata(!showMetadata)}
              className="flex items-center justify-between w-full text-[10px] font-mono text-zinc-500 hover:text-zinc-300 py-1 transition-colors"
            >
              <span>CAPTION & HASHTAGS</span>
              {showMetadata ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {showMetadata && (
              <div className="space-y-2 mt-1.5 animate-fade-in">
                <textarea
                  rows={2}
                  value={caption}
                  onChange={(e) => {
                    setCaption(e.target.value);
                    setIsEditing(true);
                  }}
                  placeholder="Shorts caption..."
                  className="w-full bg-black/40 border border-white/[0.06] rounded-lg p-2 text-xs text-zinc-300 focus:outline-none focus:border-white/20 resize-none leading-relaxed"
                />

                <input
                  type="text"
                  value={hashtags}
                  onChange={(e) => {
                    setHashtags(e.target.value);
                    setIsEditing(true);
                  }}
                  placeholder="#shorts #viral..."
                  className="w-full bg-black/40 border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs text-blue-400 font-mono focus:outline-none focus:border-white/20"
                />
              </div>
            )}
          </div>

          {/* Crop Offset Slider */}
          <div className="pt-2 border-t border-white/[0.05]">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="flex items-center gap-1 text-zinc-400">
                <Sliders className="w-3 h-3 text-zinc-500" />
                <span className="text-[10px] font-mono text-zinc-500">HORIZONTAL CROP</span>
              </span>
              <span className="font-mono text-[11px] text-zinc-300">
                {cropOffset > 0 ? `+${cropOffset}%` : `${cropOffset}%`}
              </span>
            </div>

            <input
              type="range"
              min={-50}
              max={50}
              step={2}
              value={cropOffset}
              onChange={(e) => {
                setCropOffset(parseFloat(e.target.value));
                setIsEditing(true);
              }}
              className="w-full"
            />
            <div className="flex justify-between text-[9px] font-mono text-zinc-600 mt-0.5">
              <span>LEFT</span>
              <span>CENTER (0)</span>
              <span>RIGHT</span>
            </div>
          </div>
        </div>

        {/* Inline Schedule Popover Modal */}
        {showScheduleModal && (
          <div className="p-3 bg-black/70 border border-blue-500/30 rounded-xl space-y-2.5 animate-fade-in my-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                <span>Schedule Short</span>
              </span>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="text-zinc-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Channel Selection */}
            <div>
              <label className="text-[9px] font-mono text-zinc-400 uppercase block mb-1">
                Upload Target Channel
              </label>
              <select
                value={selectedChannelId}
                onChange={(e) => setSelectedChannelId(e.target.value)}
                disabled={channels.length === 0}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
              >
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Presets */}
            <div>
              <label className="text-[9px] font-mono text-zinc-400 uppercase block mb-1">
                Peak Window Presets
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickSchedule(getPresetIso('tomorrow_10am'))}
                  disabled={isScheduling || channels.length === 0}
                  className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-mono rounded border border-white/10 text-left truncate transition-colors"
                >
                  Tomorrow 10:00 AM
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickSchedule(getPresetIso('tomorrow_6pm'))}
                  disabled={isScheduling || channels.length === 0}
                  className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-mono rounded border border-white/10 text-left truncate transition-colors"
                >
                  Tomorrow 6:00 PM
                </button>
              </div>
            </div>

            {/* Custom Date/Time */}
            <div>
              <label className="text-[9px] font-mono text-zinc-400 uppercase block mb-1">
                Custom Publish Time
              </label>
              <input
                type="datetime-local"
                value={scheduledDateTime}
                onChange={(e) => setScheduledDateTime(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-white font-mono focus:outline-none"
              />
            </div>

            <button
              onClick={() => handleQuickSchedule()}
              disabled={isScheduling || channels.length === 0}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow transition-colors disabled:opacity-40"
            >
              {isScheduling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Confirm & Enqueue</span>
            </button>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-2 border-t border-white/[0.05] space-y-2">
          {isEditing && (
            <div className="flex items-center gap-1.5 animate-fade-in">
              <button
                onClick={handleSaveChanges}
                disabled={isSaving}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-white text-zinc-950 hover:bg-zinc-200 rounded-lg text-xs font-semibold transition-all"
              >
                {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                <span>Save</span>
              </button>

              <button
                onClick={handleRegenerate}
                disabled={isRendering}
                className="flex items-center justify-center gap-1 py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium border border-white/10 transition-colors"
                title="Re-render 9:16 with new crop offset"
              >
                <RotateCw className={`w-3 h-3 ${isRendering ? 'animate-spin' : ''}`} />
                <span>Re-render</span>
              </button>
            </div>
          )}

          {/* Workflow Action Grid */}
          <div className="grid grid-cols-4 gap-1.5">
            {/* Approve / Status */}
            <button
              onClick={() => handleStatusChange(clip.status === 'approved' ? 'draft' : 'approved')}
              className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                clip.status === 'approved'
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold shadow-sm'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/[0.06]'
              }`}
              title={clip.status === 'approved' ? 'Unapprove' : 'Approve Short'}
            >
              <Check className="w-3.5 h-3.5" />
              <span>{clip.status === 'approved' ? 'Done' : 'Approve'}</span>
            </button>

            {/* Schedule 1-Click / Modal */}
            <button
              onClick={() => setShowScheduleModal(!showScheduleModal)}
              className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                clip.status === 'scheduled'
                  ? 'bg-blue-500/20 border border-blue-500/40 text-blue-300 font-semibold'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/[0.06]'
              }`}
              title="Schedule to YouTube Shorts"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Post</span>
            </button>

            {/* Reject */}
            <button
              onClick={() => handleStatusChange(clip.status === 'rejected' ? 'draft' : 'rejected')}
              className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                clip.status === 'rejected'
                  ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300 font-semibold'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-white/[0.06]'
              }`}
              title="Reject Short"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reject</span>
            </button>

            {/* Download MP4 */}
            <a
              href={api.getDownloadUrl(clip.id)}
              download
              className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/[0.06] transition-colors"
              title="Download 9:16 MP4 to disk"
            >
              <Download className="w-3.5 h-3.5" />
              <span>MP4</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
