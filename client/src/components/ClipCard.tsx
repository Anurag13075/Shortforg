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
  Calendar,
  Send,
  Sparkles,
  Palette,
  Scissors,
  Trash2,
  Layers,
  Crop,
  AlertCircle,
  Settings2,
  Flame
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
  const [showStudioModal, setShowStudioModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
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

  const handleTitleSwap = async (newTitle: string) => {
    setTitle(newTitle);
    try {
      const updated = await api.updateClip(clip.id, { title: newTitle });
      onUpdate(updated);
      onToast('Title updated', 'info');
    } catch (err: any) {
      onToast(`Failed to update title: ${err.message}`, 'error');
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
  };

  const handleSaveAndRerender = async () => {
    setIsRendering(true);
    onToast(`Re-rendering clip (${Math.round(endTime - startTime)}s) with 1080p FFmpeg...`, 'info');
    try {
      const tagsArray = hashtags
        .split(/\s+/)
        .map((t) => (t.startsWith('#') ? t : `#${t}`))
        .filter((t) => t.length > 1);

      await api.updateClip(clip.id, {
        title: title.trim(),
        caption: caption.trim(),
        hashtags: JSON.stringify(tagsArray)
      });

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
      setShowStudioModal(false);
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
      onUpdate(updated);
      onToast('Title updated from video speech!', 'success');
    } catch (err: any) {
      onToast(`Failed to match speech: ${err.message}`, 'error');
    } finally {
      setIsRegeneratingMetadata(false);
    }
  };

  const getPresetIso = (type: 'tomorrow_10am' | 'tomorrow_6pm' | 'today_6pm') => {
    const d = new Date();
    if (type === 'today_6pm') {
      d.setHours(18, 0, 0, 0);
      if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
    } else if (type === 'tomorrow_10am') {
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
    } else if (type === 'tomorrow_6pm') {
      d.setDate(d.getDate() + 1);
      d.setHours(18, 0, 0, 0);
    }
    return d.toISOString();
  };

  return (
    <>
      <div
        className={`rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col bg-[#10121a] hover:border-white/20 shadow-xl ${
          clip.status === 'scheduled'
            ? 'border-blue-500/50 ring-1 ring-blue-500/30'
            : clip.status === 'approved'
            ? 'border-emerald-500/50 ring-1 ring-emerald-500/30'
            : clip.status === 'rejected'
            ? 'opacity-40 grayscale-[40%] border-white/[0.04]'
            : 'border-white/[0.08]'
        }`}
      >
        {/* Card Header: Score, Duration, Media Switcher */}
        <div className="px-3.5 py-2.5 bg-[#141622] border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/25 text-[11px] font-mono font-bold text-amber-300">
              <Flame className="w-3 h-3 text-amber-400" />
              <span>{clip.virality_score}</span>
              <span className="text-zinc-500 font-normal">/100</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-zinc-400 font-mono">
              <Clock className="w-3 h-3 text-zinc-500" />
              <span>{clipDuration}s</span>
            </div>
          </div>

          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-black/40 border border-white/[0.06]">
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
        <div className="relative bg-black w-full aspect-[9/16] min-h-[440px] max-h-[520px] flex items-center justify-center overflow-hidden border-b border-white/[0.06] group/player">
          {clip.status === 'failed' ? (
            <div className="flex flex-col items-center justify-center p-6 text-center space-y-2">
              <AlertCircle className="w-8 h-8 text-rose-400" />
              <p className="text-xs font-semibold text-rose-300">Render Failed</p>
              <p className="text-[10px] text-zinc-400 font-mono line-clamp-2">
                {clip.error_message || 'Video processing error'}
              </p>
              <button
                onClick={handleSaveAndRerender}
                disabled={isRendering}
                className="px-3.5 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                Retry Render
              </button>
            </div>
          ) : isRendering ? (
            <div className="flex flex-col items-center gap-3 text-center p-6">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
              <div>
                <p className="text-xs font-semibold text-white">Re-rendering with FFmpeg...</p>
                <p className="text-[10px] text-zinc-400 font-mono mt-0.5">1080p layout & kinetic subtitles</p>
              </div>
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
              <div className="flex flex-col items-center gap-2 text-center p-6">
                <Film className="w-8 h-8 text-zinc-600" />
                <p className="text-xs text-zinc-400 font-mono">Video pending render</p>
                <button
                  onClick={handleSaveAndRerender}
                  className="px-3 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 rounded-lg text-xs font-mono"
                >
                  Render Now
                </button>
              </div>
            )
          ) : clip.thumbnail_path ? (
            <img
              src={api.getThumbnailUrl(clip.id)}
              alt={clip.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-xs text-zinc-600 font-mono">No thumbnail</div>
          )}

          {/* Quick Rerender Floating Button on hover */}
          {clip.video_path && !isRendering && (
            <button
              onClick={handleSaveAndRerender}
              className="absolute bottom-12 right-2.5 opacity-0 group-hover/player:opacity-100 transition-opacity px-2 py-1 rounded-md bg-black/80 hover:bg-black text-[10px] font-mono text-zinc-300 hover:text-white border border-white/20 shadow flex items-center gap-1 cursor-pointer"
              title="Force re-render with latest 1080p engine"
            >
              <RotateCw className="w-3 h-3 text-indigo-400" />
              <span>Fix/Rerender</span>
            </button>
          )}

          {/* Hook Pill Top Overlay */}
          {clip.hook_line && (
            <div className="absolute top-2.5 left-2.5 right-2.5 pointer-events-none">
              <span className="inline-block bg-black/85 text-amber-300 border border-white/15 text-[10px] font-bold px-2 py-0.5 rounded-md shadow tracking-wide uppercase line-clamp-1">
                HOOK: {clip.hook_line}
              </span>
            </div>
          )}
        </div>

        {/* Card Body */}
        <div className="p-3.5 flex-1 flex flex-col justify-between gap-3 bg-[#11131c]">
          <div className="space-y-2">
            {/* Title with AI Quote Match */}
            <div>
              <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono mb-1">
                <span className="font-semibold text-zinc-400">SHORT TITLE</span>
                <button
                  type="button"
                  onClick={handleRegenerateMetadata}
                  disabled={isRegeneratingMetadata}
                  className="inline-flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 font-mono transition-colors disabled:opacity-40"
                  title="Generate exact title from speech"
                >
                  <Sparkles className={`w-3 h-3 ${isRegeneratingMetadata ? 'animate-spin' : ''}`} />
                  <span>{isRegeneratingMetadata ? 'Matching...' : 'Match Speech'}</span>
                </button>
              </div>

              <input
                type="text"
                value={title}
                maxLength={70}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => handleTitleSwap(title)}
                className="w-full bg-black/40 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 transition-colors font-medium"
              />
            </div>

            {/* AI Title Variations (1-Click Switch) */}
            {titleOptions.length > 1 && (
              <div className="space-y-1">
                <span className="text-[9px] font-mono text-zinc-500 uppercase block">Variations:</span>
                <div className="flex flex-col gap-1">
                  {titleOptions.map((opt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleTitleSwap(opt)}
                      className={`text-left px-2 py-1 rounded text-[11px] font-medium transition-all truncate cursor-pointer ${
                        title === opt
                          ? 'bg-amber-400/15 border border-amber-400/40 text-amber-200'
                          : 'bg-black/25 border border-white/[0.04] text-zinc-400 hover:text-zinc-200 hover:border-white/10'
                      }`}
                      title={opt}
                    >
                      <span className="text-zinc-500 font-mono text-[9px] mr-1.5">v{idx + 1}</span>
                      <span>{opt}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Row */}
          <div className="pt-2 border-t border-white/[0.06] space-y-2">
            <div className="grid grid-cols-5 gap-1.5">
              {/* Approve */}
              <button
                onClick={() => handleStatusChange(clip.status === 'approved' ? 'draft' : 'approved')}
                className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  clip.status === 'approved'
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold shadow-sm'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/[0.06]'
                }`}
                title={clip.status === 'approved' ? 'Unapprove' : 'Approve'}
              >
                <Check className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{clip.status === 'approved' ? 'Done' : 'Approve'}</span>
              </button>

              {/* Schedule */}
              <button
                onClick={() => setShowScheduleModal(!showScheduleModal)}
                className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  clip.status === 'scheduled'
                    ? 'bg-blue-500/20 border border-blue-500/40 text-blue-300 font-semibold'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/[0.06]'
                }`}
                title="Post to YouTube Shorts"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Post</span>
              </button>

              {/* Studio Editor Modal Button */}
              <button
                onClick={() => setShowStudioModal(true)}
                className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/[0.06] transition-colors cursor-pointer"
                title="Open Trim, Layout & Caption Editor"
              >
                <Settings2 className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden sm:inline">Edit</span>
              </button>

              {/* Download MP4 */}
              <a
                href={api.getDownloadUrl(clip.id)}
                download
                className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/[0.06] transition-colors cursor-pointer"
                title="Download 1080p MP4"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">MP4</span>
              </a>

              {/* Delete */}
              <button
                onClick={handleDeleteClip}
                className="flex items-center justify-center p-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-rose-950/40 text-zinc-500 hover:text-rose-400 border border-white/[0.06] transition-colors cursor-pointer"
                title="Delete short"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Schedule Modal Popover */}
        {showScheduleModal && (
          <div className="p-3 bg-[#0d0e15] border-t border-blue-500/30 space-y-2.5 animate-fade-in text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-white uppercase font-mono flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                <span>Publish to YouTube</span>
              </span>
              <button onClick={() => setShowScheduleModal(false)} className="text-zinc-500 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <select
              value={selectedChannelId}
              onChange={(e) => setSelectedChannelId(e.target.value)}
              className="w-full bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleQuickSchedule(getPresetIso('tomorrow_10am'))}
                disabled={isScheduling || channels.length === 0}
                className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-mono rounded border border-white/10 truncate cursor-pointer"
              >
                Tomorrow 10 AM
              </button>
              <button
                type="button"
                onClick={() => handleQuickSchedule(getPresetIso('tomorrow_6pm'))}
                disabled={isScheduling || channels.length === 0}
                className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-mono rounded border border-white/10 truncate cursor-pointer"
              >
                Tomorrow 6 PM
              </button>
            </div>

            <button
              onClick={() => handleQuickSchedule()}
              disabled={isScheduling || channels.length === 0}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow transition-colors cursor-pointer disabled:opacity-40"
            >
              {isScheduling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Queue Upload</span>
            </button>
          </div>
        )}
      </div>

      {/* FULL STUDIO CLIP EDITOR MODAL (Dedicated High-End Workspace) */}
      {showStudioModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-2xl bg-[#0e1017] border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between bg-[#12141e]">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-white">Clip Studio & 1080p Engine</h3>
                <span className="text-[10px] font-mono bg-blue-500/10 text-blue-300 border border-blue-500/20 px-1.5 py-0.5 rounded">
                  {clipDuration}s
                </span>
              </div>
              <button
                onClick={() => setShowStudioModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              {/* Layout Mode */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono text-zinc-400 uppercase font-semibold block">
                  1080p Video Layout Mode:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLayout('blur_bg')}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                      layout === 'blur_bg'
                        ? 'bg-blue-600/20 border-blue-500/60 text-blue-200 font-semibold shadow-sm'
                        : 'bg-zinc-950/60 text-zinc-400 border-white/[0.08] hover:text-zinc-200'
                    }`}
                  >
                    <Layers className="w-4 h-4 text-blue-400" />
                    <span>Canvas (Blur BG 1080p)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayout('crop')}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                      layout === 'crop'
                        ? 'bg-blue-600/20 border-blue-500/60 text-blue-200 font-semibold shadow-sm'
                        : 'bg-zinc-950/60 text-zinc-400 border-white/[0.08] hover:text-zinc-200'
                    }`}
                  >
                    <Crop className="w-4 h-4 text-blue-400" />
                    <span>Full Crop (9:16)</span>
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500 font-mono">
                  {layout === 'blur_bg'
                    ? '✓ Hero Canvas keeps 100% original widescreen video centered against a box-blurred backdrop.'
                    : '✓ Full Crop expands the video to fill the vertical frame.'}
                </p>
              </div>

              {/* Trim Handles */}
              <div className="space-y-1.5 p-3.5 rounded-xl bg-black/40 border border-white/[0.06]">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                    <Scissors className="w-3.5 h-3.5 text-blue-400" />
                    <span>PRECISION TRIM HANDLES</span>
                  </span>
                  <span className="text-amber-400 font-bold">{Math.round(endTime - startTime)}s duration</span>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[10px] font-mono text-zinc-400 block mb-1">Start Time (seconds)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={startTime}
                      onChange={(e) => setStartTime(parseFloat(e.target.value) || 0)}
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-zinc-400 block mb-1">End Time (seconds)</label>
                    <input
                      type="number"
                      step="0.5"
                      min={startTime + 3}
                      value={endTime}
                      onChange={(e) => setEndTime(parseFloat(e.target.value) || startTime + 5)}
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                </div>
              </div>

              {/* Hook Banner Toggle */}
              <div className="p-3 rounded-xl bg-black/40 border border-white/[0.06] flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-white block">Burn Hook Headline (0–2.5s)</span>
                  <span className="text-[10px] text-zinc-400 font-mono">Shows impactful hook headline banner to stop scrollers</span>
                </div>
                <button
                  type="button"
                  onClick={() => setHookOverlay(!hookOverlay)}
                  className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${
                    hookOverlay ? 'bg-amber-400' : 'bg-zinc-800'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-black absolute top-1 transition-transform ${
                      hookOverlay ? 'left-5' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              {/* Caption Presets */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono text-zinc-400 uppercase font-semibold block">
                  Kinetic Caption Styling:
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {Object.entries(CAPTION_PRESET_MAP).map(([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handlePresetSelect(key)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono border transition-all cursor-pointer ${
                        captionPreset === key
                          ? 'bg-zinc-800 text-white border-white/30 shadow-sm'
                          : 'bg-zinc-950/60 text-zinc-400 border-white/[0.06] hover:text-zinc-200'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cfg.active }} />
                      <span className="truncate">{cfg.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Caption Colors & Words Per Screen */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[10px] font-mono text-zinc-400 block mb-1">Active Word Color</label>
                  <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5">
                    <input
                      type="color"
                      value={captionActiveColor}
                      onChange={(e) => {
                        setCaptionActiveColor(e.target.value);
                        setCaptionPreset('custom');
                      }}
                      className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
                    />
                    <span className="font-mono text-[10px] text-zinc-300 uppercase">{captionActiveColor}</span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-zinc-400 block mb-1">Words Per Pop</label>
                  <div className="grid grid-cols-3 gap-1">
                    {[1, 2, 3].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setWordsPerBurst(num)}
                        className={`py-1.5 text-[10px] font-mono rounded-lg border transition-colors cursor-pointer ${
                          wordsPerBurst === num
                            ? 'bg-amber-400/20 text-amber-300 border-amber-400/40 font-bold'
                            : 'bg-zinc-900 text-zinc-500 border-white/[0.06]'
                        }`}
                      >
                        {num}w
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Horizontal Crop Pan Slider (for crop mode) */}
              {layout === 'crop' && (
                <div className="pt-2 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-1">
                    <span>HORIZONTAL PAN OFFSET</span>
                    <span>{cropOffset > 0 ? `+${cropOffset}%` : `${cropOffset}%`}</span>
                  </div>
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    step={2}
                    value={cropOffset}
                    onChange={(e) => setCropOffset(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 border-t border-white/[0.08] flex items-center justify-end gap-2.5 bg-[#12141e]">
              <button
                type="button"
                onClick={() => setShowStudioModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAndRerender}
                disabled={isRendering}
                className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg transition-all cursor-pointer disabled:opacity-40"
              >
                {isRendering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
                <span>Apply & Re-render (1080p)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
