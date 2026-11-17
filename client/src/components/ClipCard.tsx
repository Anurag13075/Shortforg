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
  CheckCircle2,
  Sparkles,
  Palette,
  Type,
  Scissors,
  Trash2,
  Layers,
  Crop,
  AlertCircle
} from 'lucide-react';
import { Clip, Channel } from '../types';
import { api } from '../api';

interface ClipCardProps {
  clip: Clip;
  channels: Channel[];
  onUpdate: (updatedClip: Clip) => void;
  onDelete?: (clipId: string) => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const CAPTION_PRESET_MAP: Record<string, { label: string; active: string; base: string }> = {
  hormozi_gold: { label: 'Hormozi Gold', active: '#FFE600', base: '#FFFFFF' },
  neon_green: { label: 'Neon Beast', active: '#00FF66', base: '#FFFFFF' },
  cyber_cyan: { label: 'Cyber Cyan', active: '#00F0FF', base: '#FFFFFF' },
  sunset_punch: { label: 'Sunset Punch', active: '#FF2E63', base: '#FFFFFF' },
  electric_purple: { label: 'Electric Purple', active: '#B026FF', base: '#FFFFFF' },
  custom: { label: 'Custom Colors', active: '#FFE600', base: '#FFFFFF' }
};

export const ClipCard: React.FC<ClipCardProps> = ({ clip, channels, onUpdate, onDelete, onToast }) => {
  const [activeTab, setActiveTab] = useState<'video' | 'thumbnail'>('video');
  const [showMetadata, setShowMetadata] = useState(false);
  const [showCaptionStudio, setShowCaptionStudio] = useState(false);
  const [showTrimStudio, setShowTrimStudio] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(clip.title);
  const [caption, setCaption] = useState(clip.caption || '');
  const [startTime, setStartTime] = useState<number>(clip.start_time);
  const [endTime, setEndTime] = useState<number>(clip.end_time);
  const [layout, setLayout] = useState<'blur_bg' | 'crop'>(clip.layout || 'blur_bg');
  const [hookOverlay, setHookOverlay] = useState<boolean>(clip.hook_overlay !== 0);

  const [titleOptions] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(clip.title_options || '[]');
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : [clip.title];
    } catch {
      return [clip.title];
    }
  });

  const [captionOptions] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(clip.caption_options || '[]');
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : [clip.caption || ''];
    } catch {
      return [clip.caption || ''];
    }
  });

  const [hashtags, setHashtags] = useState(() => {
    try {
      const parsed = JSON.parse(clip.hashtags || '[]');
      return Array.isArray(parsed) ? parsed.join(' ') : (clip.hashtags || '');
    } catch {
      return clip.hashtags || '';
    }
  });
  const [cropOffset, setCropOffset] = useState(clip.crop_offset_x || 0);

  // Caption Styling states
  const [captionPreset, setCaptionPreset] = useState<string>(clip.caption_preset || 'hormozi_gold');
  const [captionActiveColor, setCaptionActiveColor] = useState<string>(clip.caption_active_color || '#FFE600');
  const [captionBaseColor, setCaptionBaseColor] = useState<string>(clip.caption_base_color || '#FFFFFF');
  const [wordsPerBurst, setWordsPerBurst] = useState<number>(clip.words_per_burst || 2);

  const [isSaving, setIsSaving] = useState(false);
  const [isRendering, setIsRendering] = useState(clip.status === 'rendering');
  const [isRegeneratingMetadata, setIsRegeneratingMetadata] = useState(false);

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

  const clipDuration = Math.round(endTime - startTime);

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

  const handlePresetSelect = (presetKey: string) => {
    setCaptionPreset(presetKey);
    const cfg = CAPTION_PRESET_MAP[presetKey];
    if (cfg && presetKey !== 'custom') {
      setCaptionActiveColor(cfg.active);
      setCaptionBaseColor(cfg.base);
    }
    setIsEditing(true);
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
        assigned_channel_id: selectedChannelId || undefined,
        caption_preset: captionPreset,
        caption_active_color: captionActiveColor,
        caption_base_color: captionBaseColor,
        words_per_burst: wordsPerBurst
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
    onToast('Re-rendering 9:16 crop & kinetic subtitles with FFmpeg...', 'info');
    try {
      const updated = await api.renderClip(clip.id, {
        crop_offset_x: cropOffset,
        caption_preset: captionPreset,
        caption_active_color: captionActiveColor,
        caption_base_color: captionBaseColor,
        words_per_burst: wordsPerBurst
      });
      onUpdate(updated);
      onToast('Short and captions re-rendered successfully!', 'success');
    } catch (err: any) {
      onToast(`Re-render failed: ${err.message}`, 'error');
    } finally {
      setIsRendering(false);
    }
  };

  const handleTrimAndRender = async () => {
    setIsRendering(true);
    onToast(`Re-rendering clip (${Math.round(endTime - startTime)}s) with 1080p FFmpeg...`, 'info');
    try {
      const updated = await api.renderClip(clip.id, {
        start_time: startTime,
        end_time: endTime,
        layout,
        hook_overlay: hookOverlay,
        crop_offset_x: cropOffset,
        caption_preset: captionPreset,
        caption_active_color: captionActiveColor,
        caption_base_color: captionBaseColor,
        words_per_burst: wordsPerBurst
      });
      onUpdate(updated);
      setIsEditing(false);
      onToast('Short re-rendered with new trim and 1080p layout!', 'success');
    } catch (err: any) {
      onToast(`Trim render failed: ${err.message}`, 'error');
    } finally {
      setIsRendering(false);
    }
  };

  const handleDeleteClip = async () => {
    if (!window.confirm(`Delete "${clip.title}" from your studio?`)) return;
    try {
      await api.deleteClip(clip.id);
      onToast('Short deleted', 'info');
      onDelete?.(clip.id);
    } catch (err: any) {
      onToast(`Failed to delete: ${err.message}`, 'error');
    }
  };

  const handleRegenerateMetadata = async () => {
    setIsRegeneratingMetadata(true);
    onToast('Analyzing spoken transcript for exact quote match...', 'info');
    try {
      const updated = await api.regenerateClipMetadata(clip.id);
      setTitle(updated.title);
      setCaption(updated.caption || '');
      try {
        const parsed = JSON.parse(updated.hashtags || '[]');
        setHashtags(Array.isArray(parsed) ? parsed.join(' ') : (updated.hashtags || ''));
      } catch {
        setHashtags(updated.hashtags || '');
      }
      onUpdate(updated);
      onToast('Title & description updated from video speech!', 'success');
    } catch (err: any) {
      onToast(`Failed to regenerate metadata: ${err.message}`, 'error');
    } finally {
      setIsRegeneratingMetadata(false);
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
        {clip.status === 'failed' ? (
          <div className="flex flex-col items-center justify-center p-4 text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-rose-400" />
            <p className="text-xs font-semibold text-rose-300">Render Failed</p>
            <p className="text-[10px] text-zinc-400 font-mono line-clamp-3">
              {clip.error_message || 'Video processing encountered an error'}
            </p>
            <button
              onClick={handleTrimAndRender}
              disabled={isRendering}
              className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 rounded text-xs font-medium transition-colors cursor-pointer"
            >
              Retry Render
            </button>
          </div>
        ) : isRendering ? (
          <div className="flex flex-col items-center gap-2 text-center p-4">
            <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
            <p className="text-xs font-medium text-white">Re-rendering with FFmpeg...</p>
            <p className="text-[10px] text-zinc-500 font-mono">Applying 1080p layout & animated subtitles</p>
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

          {/* Title Editor with AI Exact Quote Match */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono mb-1">
              <span className="flex items-center gap-1.5">
                <span>TITLE</span>
                <span className="text-zinc-600">•</span>
                <button
                  type="button"
                  onClick={handleRegenerateMetadata}
                  disabled={isRegeneratingMetadata}
                  className="inline-flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 font-mono transition-colors disabled:opacity-40"
                  title="Generate exact title & description matching the video transcript"
                >
                  <Sparkles className={`w-3 h-3 ${isRegeneratingMetadata ? 'animate-spin' : ''}`} />
                  <span>{isRegeneratingMetadata ? 'Matching speech...' : 'Match Speech (AI)'}</span>
                </button>
              </span>
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
            {titleOptions.length > 1 && (
              <div className="mt-1.5 space-y-1">
                <span className="text-[9px] font-mono text-zinc-500 uppercase block">AI Title Variations (1-Click Switch):</span>
                <div className="flex flex-col gap-1">
                  {titleOptions.map((opt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setTitle(opt);
                        setIsEditing(true);
                      }}
                      className={`text-left px-2 py-1 rounded text-[11px] font-medium transition-all ${
                        title === opt
                          ? 'bg-amber-400/15 border border-amber-400/40 text-amber-200'
                          : 'bg-black/30 border border-white/[0.04] text-zinc-400 hover:text-zinc-200 hover:border-white/10'
                      }`}
                    >
                      <span className="text-zinc-500 font-mono text-[9px] mr-1.5">v{idx + 1}</span>
                      <span>{opt}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
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

                {captionOptions.length > 1 && (
                  <div className="space-y-1">
                    <span className="text-[9px] font-mono text-zinc-500 uppercase block">AI Caption Variations:</span>
                    <div className="flex flex-col gap-1">
                      {captionOptions.map((cOpt, cIdx) => (
                        <button
                          key={cIdx}
                          type="button"
                          onClick={() => {
                            setCaption(cOpt);
                            setIsEditing(true);
                          }}
                          className={`text-left px-2 py-1 rounded text-[10px] transition-all line-clamp-1 ${
                            caption === cOpt
                              ? 'bg-blue-400/15 border border-blue-400/40 text-blue-200'
                              : 'bg-black/30 border border-white/[0.04] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <span className="text-zinc-500 font-mono text-[9px] mr-1.5">Opt {cIdx + 1}:</span>
                          <span>{cOpt}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

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

          {/* Collapsible Caption Studio (Videocaptions.ai Kinetic Pop Style) */}
          <div className="mb-2">
            <button
              onClick={() => setShowCaptionStudio(!showCaptionStudio)}
              className="flex items-center justify-between w-full text-[10px] font-mono text-zinc-400 hover:text-white py-1 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-semibold text-zinc-300">CAPTIONS & PRESETS</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-300 border border-amber-400/20 font-mono font-medium">
                  POP STYLE
                </span>
              </span>
              {showCaptionStudio ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {showCaptionStudio && (
              <div className="space-y-2.5 mt-2 p-2.5 rounded-lg bg-black/50 border border-white/[0.08] animate-fade-in text-xs">
                {/* Presets Swatches */}
                <div>
                  <span className="text-[9px] font-mono text-zinc-500 uppercase block mb-1.5">
                    Viral Style Presets
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {Object.entries(CAPTION_PRESET_MAP).map(([key, cfg]) => {
                      const isSelected = captionPreset === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handlePresetSelect(key)}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono border transition-all ${
                            isSelected
                              ? 'bg-zinc-800 text-white border-white/30 shadow-sm'
                              : 'bg-zinc-950/60 text-zinc-400 border-white/[0.06] hover:text-zinc-200'
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/40"
                            style={{ backgroundColor: cfg.active }}
                          />
                          <span className="truncate">{cfg.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Color Pickers & Live Preview */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/[0.06]">
                  <div>
                    <label className="text-[9px] font-mono text-zinc-400 block mb-1">
                      Active Word Color
                    </label>
                    <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded px-2 py-1">
                      <input
                        type="color"
                        value={captionActiveColor}
                        onChange={(e) => {
                          setCaptionActiveColor(e.target.value);
                          setCaptionPreset('custom');
                          setIsEditing(true);
                        }}
                        className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
                      />
                      <span className="font-mono text-[10px] text-zinc-300 uppercase">
                        {captionActiveColor}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-mono text-zinc-400 block mb-1">
                      Base Text Color
                    </label>
                    <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded px-2 py-1">
                      <input
                        type="color"
                        value={captionBaseColor}
                        onChange={(e) => {
                          setCaptionBaseColor(e.target.value);
                          setCaptionPreset('custom');
                          setIsEditing(true);
                        }}
                        className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
                      />
                      <span className="font-mono text-[10px] text-zinc-300 uppercase">
                        {captionBaseColor}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Words Per Burst */}
                <div className="pt-1 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-mono text-zinc-400 uppercase">
                      Words Per Screen (Videocaptions Pace)
                    </span>
                    <span className="font-mono text-[10px] text-zinc-300 font-bold">
                      {wordsPerBurst} {wordsPerBurst === 1 ? 'word' : 'words'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[1, 2, 3].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          setWordsPerBurst(num);
                          setIsEditing(true);
                        }}
                        className={`py-1 text-[10px] font-mono rounded border transition-colors ${
                          wordsPerBurst === num
                            ? 'bg-amber-400/20 text-amber-300 border-amber-400/40 font-bold'
                            : 'bg-zinc-900 text-zinc-500 border-white/[0.06] hover:text-white'
                        }`}
                      >
                        {num === 1 ? '1 Word' : num === 2 ? '2 Words (Pop)' : '3 Words'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Caption Visual Preview */}
                <div className="p-2.5 rounded bg-black border border-white/10 text-center font-black uppercase tracking-wider text-sm flex items-center justify-center gap-1.5 shadow-inner">
                  <span style={{ color: captionActiveColor }} className="scale-110 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                    KINETIC
                  </span>
                  <span style={{ color: captionBaseColor }} className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                    CAPTIONS
                  </span>
                </div>

                {/* Quick Apply & Re-render button */}
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={isRendering}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-semibold border border-white/10 shadow transition-colors disabled:opacity-40"
                >
                  <RotateCw className={`w-3 h-3 ${isRendering ? 'animate-spin' : ''}`} />
                  <span>Re-render Captions with FFmpeg</span>
                </button>
              </div>
            )}
          </div>

          {/* Collapsible Trim & 1080p Layout Studio */}
          <div className="mb-2">
            <button
              onClick={() => setShowTrimStudio(!showTrimStudio)}
              className="flex items-center justify-between w-full text-[10px] font-mono text-zinc-400 hover:text-white py-1 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Scissors className="w-3.5 h-3.5 text-blue-400" />
                <span className="font-semibold text-zinc-300">TRIM & 1080P LAYOUT</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-300 border border-blue-400/20 font-mono font-medium">
                  {layout === 'blur_bg' ? 'BLUR BG 1080P' : '9:16 CROP'}
                </span>
              </span>
              {showTrimStudio ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {showTrimStudio && (
              <div className="space-y-2.5 mt-2 p-2.5 rounded-lg bg-black/50 border border-white/[0.08] animate-fade-in text-xs">
                {/* Layout Mode */}
                <div>
                  <span className="text-[9px] font-mono text-zinc-500 uppercase block mb-1">
                    Aspect Ratio & Layout Mode
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setLayout('blur_bg');
                        setIsEditing(true);
                      }}
                      className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-[10px] font-mono border transition-all ${
                        layout === 'blur_bg'
                          ? 'bg-blue-600/20 border-blue-500/50 text-blue-200 font-semibold'
                          : 'bg-zinc-950/60 text-zinc-400 border-white/[0.06] hover:text-zinc-200'
                      }`}
                    >
                      <Layers className="w-3 h-3 text-blue-400" />
                      <span>Canvas (Blur BG)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLayout('crop');
                        setIsEditing(true);
                      }}
                      className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-[10px] font-mono border transition-all ${
                        layout === 'crop'
                          ? 'bg-blue-600/20 border-blue-500/50 text-blue-200 font-semibold'
                          : 'bg-zinc-950/60 text-zinc-400 border-white/[0.06] hover:text-zinc-200'
                      }`}
                    >
                      <Crop className="w-3 h-3 text-blue-400" />
                      <span>Full Crop (9:16)</span>
                    </button>
                  </div>
                  <p className="text-[9px] text-zinc-500 mt-1 font-mono">
                    {layout === 'blur_bg'
                      ? '✓ Hero Canvas: 100% native resolution video centered with blurred top/bottom.'
                      : '✓ Center Crop: Fills entire 9:16 vertical frame (adjust horizontal crop below).'}
                  </p>
                </div>

                {/* Hook Overlay Banner */}
                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-semibold text-zinc-300 block">Burn Hook Banner</span>
                    <span className="text-[9px] text-zinc-500 font-mono">Shows hook headline at top (0-2.5s)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setHookOverlay(!hookOverlay);
                      setIsEditing(true);
                    }}
                    className={`w-9 h-5 rounded-full transition-colors relative ${
                      hookOverlay ? 'bg-amber-400' : 'bg-zinc-800'
                    }`}
                  >
                    <span
                      className={`block w-3.5 h-3.5 rounded-full bg-black absolute top-0.75 transition-transform ${
                        hookOverlay ? 'left-4.5' : 'left-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Precision Trim Handles */}
                <div className="pt-2 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-1.5">
                    <span>TIMESTAMPS (SECONDS)</span>
                    <span className="text-amber-400 font-bold">{Math.round(endTime - startTime)}s duration</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] font-mono text-zinc-500 block mb-0.5">Start Time (s)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={startTime}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setStartTime(val);
                          setIsEditing(true);
                        }}
                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-mono text-zinc-500 block mb-0.5">End Time (s)</label>
                      <input
                        type="number"
                        step="0.5"
                        min={startTime + 3}
                        value={endTime}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || startTime + 5;
                          setEndTime(val);
                          setIsEditing(true);
                        }}
                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Apply Trim & Re-render button */}
                <button
                  type="button"
                  onClick={handleTrimAndRender}
                  disabled={isRendering}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow transition-colors disabled:opacity-40 cursor-pointer"
                >
                  <RotateCw className={`w-3 h-3 ${isRendering ? 'animate-spin' : ''}`} />
                  <span>Apply Trim & Re-render (1080p)</span>
                </button>
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
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-white text-zinc-950 hover:bg-zinc-200 rounded-lg text-xs font-semibold transition-all cursor-pointer"
              >
                {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                <span>Save</span>
              </button>

              <button
                onClick={handleRegenerate}
                disabled={isRendering}
                className="flex items-center justify-center gap-1 py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium border border-white/10 transition-colors cursor-pointer"
                title="Re-render 9:16 with new crop offset"
              >
                <RotateCw className={`w-3 h-3 ${isRendering ? 'animate-spin' : ''}`} />
                <span>Re-render</span>
              </button>
            </div>
          )}

          {/* Workflow Action Grid */}
          <div className="grid grid-cols-5 gap-1.5">
            {/* Approve / Status */}
            <button
              onClick={() => handleStatusChange(clip.status === 'approved' ? 'draft' : 'approved')}
              className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
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
              className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
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
              className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
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
              className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/[0.06] transition-colors cursor-pointer"
              title="Download 9:16 MP4 to disk"
            >
              <Download className="w-3.5 h-3.5" />
              <span>MP4</span>
            </a>

            {/* Delete Clip */}
            <button
              onClick={handleDeleteClip}
              className="flex items-center justify-center p-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-rose-950/40 text-zinc-500 hover:text-rose-400 border border-white/[0.06] transition-colors cursor-pointer"
              title="Delete this short"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
