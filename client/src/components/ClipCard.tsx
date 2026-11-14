import React, { useState } from 'react';
import {
  Check,
  X,
  Download,
  RotateCw,
  Sparkles,
  Sliders,
  Image as ImageIcon,
  Film,
  Save,
  Loader2,
  Clock,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Clip } from '../types';
import { api } from '../api';

interface ClipCardProps {
  clip: Clip;
  onUpdate: (updatedClip: Clip) => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ClipCard: React.FC<ClipCardProps> = ({ clip, onUpdate, onToast }) => {
  const [activeTab, setActiveTab] = useState<'video' | 'thumbnail'>('video');
  const [showMetadata, setShowMetadata] = useState(false);
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

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const clipDuration = Math.round(clip.end_time - clip.start_time);

  const handleStatusChange = async (newStatus: 'approved' | 'rejected' | 'draft') => {
    try {
      const updated = await api.updateClip(clip.id, { status: newStatus });
      onUpdate(updated);
      onToast(`Clip marked as ${newStatus}`, 'success');
    } catch (err: any) {
      onToast(`Failed to update status: ${err.message}`, 'error');
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
        crop_offset_x: cropOffset
      });

      onUpdate(updated);
      setIsEditing(false);
      onToast('Clip edits saved', 'success');
    } catch (err: any) {
      onToast(`Save failed: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerate = async () => {
    setIsRendering(true);
    onToast('Re-rendering 9:16 clip with new crop offset...', 'info');
    try {
      const updated = await api.renderClip(clip.id, cropOffset);
      onUpdate(updated);
      onToast('Clip re-rendered successfully!', 'success');
    } catch (err: any) {
      onToast(`Re-render failed: ${err.message}`, 'error');
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <div
      className={`craft-card rounded-2xl overflow-hidden flex flex-col transition-all duration-300 ${
        clip.status === 'approved'
          ? 'ring-1 ring-emerald-500/40 border-emerald-500/30'
          : clip.status === 'rejected'
          ? 'opacity-40 grayscale-[40%]'
          : ''
      }`}
    >
      {/* Top Header: Score & Media Switcher */}
      <div className="p-3 bg-zinc-950/60 border-b border-white/[0.05] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Virality score badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs font-mono font-medium">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span className="text-zinc-200 font-bold">{clip.virality_score}</span>
            <span className="text-zinc-500 text-[10px]">/100</span>
          </div>

          <div className="flex items-center gap-1 text-[11px] text-zinc-400 font-mono">
            <Clock className="w-3 h-3 text-zinc-500" />
            <span>{clipDuration}s</span>
          </div>
        </div>

        {/* Media Mode Pill */}
        <div className="flex items-center p-0.5 rounded-lg bg-zinc-900 border border-white/[0.06]">
          <button
            onClick={() => setActiveTab('video')}
            className={`p-1 rounded text-xs transition-colors ${
              activeTab === 'video'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
            title="Video Preview"
          >
            <Film className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setActiveTab('thumbnail')}
            className={`p-1 rounded text-xs transition-colors ${
              activeTab === 'thumbnail'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
            title="Thumbnail Preview"
          >
            <ImageIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 9:16 Video Canvas Player Frame */}
      <div className="relative bg-black w-full aspect-[9/16] max-h-[380px] flex items-center justify-center overflow-hidden border-b border-white/[0.05]">
        {isRendering ? (
          <div className="flex flex-col items-center gap-2 text-center p-4">
            <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
            <p className="text-xs font-medium text-white">Re-rendering clip...</p>
            <p className="text-[10px] text-zinc-500 font-mono">Applying crop & subtitles</p>
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
            <div className="text-xs text-zinc-600">Video pending render</div>
          )
        ) : (
          clip.thumbnail_path ? (
            <img
              src={api.getThumbnailUrl(clip.id)}
              alt={clip.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-xs text-zinc-600">No thumbnail generated</div>
          )
        )}

        {/* Minimalist Floating Hook Glass Badge */}
        {clip.hook_line && (
          <div className="absolute top-2.5 left-2.5 right-2.5 pointer-events-none">
            <span className="inline-block bg-black/70 backdrop-blur-md text-amber-300 border border-white/10 text-[10px] font-bold px-2 py-0.5 rounded-md shadow-md tracking-wide uppercase">
              {clip.hook_line}
            </span>
          </div>
        )}
      </div>

      {/* Card Body & Controls */}
      <div className="p-3.5 flex-1 flex flex-col justify-between gap-3 bg-zinc-950/40">
        <div>
          {/* Virality Reason */}
          {clip.reason && (
            <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed mb-2.5 px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
              {clip.reason}
            </p>
          )}

          {/* Editable Title */}
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
              className="w-full bg-zinc-900/80 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/30 transition-colors font-medium"
            />
          </div>

          {/* Collapsible Metadata (Caption & Hashtags) */}
          <div className="mb-2">
            <button
              onClick={() => setShowMetadata(!showMetadata)}
              className="flex items-center justify-between w-full text-[10px] font-mono text-zinc-500 hover:text-zinc-300 py-1 transition-colors"
            >
              <span>CAPTION & TAGS</span>
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
                  className="w-full bg-zinc-900 border border-white/[0.06] rounded-lg p-2 text-xs text-zinc-300 focus:outline-none focus:border-white/20 resize-none leading-relaxed"
                />

                <input
                  type="text"
                  value={hashtags}
                  onChange={(e) => {
                    setHashtags(e.target.value);
                    setIsEditing(true);
                  }}
                  placeholder="#shorts #viral..."
                  className="w-full bg-zinc-900 border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs text-blue-400 font-mono focus:outline-none focus:border-white/20"
                />
              </div>
            )}
          </div>

          {/* Crop Offset Slider */}
          <div className="pt-2 border-t border-white/[0.05]">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="flex items-center gap-1 text-zinc-400">
                <Sliders className="w-3 h-3 text-zinc-500" />
                <span className="text-[10px] font-mono text-zinc-500">CROP OFFSET</span>
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
              <span>L</span>
              <span>CENTER</span>
              <span>R</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-2 border-t border-white/[0.05] space-y-2">
          {/* Save & Re-render Bar if modified */}
          {isEditing && (
            <div className="flex items-center gap-1.5 animate-fade-in">
              <button
                onClick={handleSaveChanges}
                disabled={isSaving}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-white text-zinc-950 hover:bg-zinc-200 rounded-lg text-xs font-semibold shadow-sm transition-all"
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

          {/* Workflow Buttons: Approve / Reject / Download */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => handleStatusChange(clip.status === 'approved' ? 'draft' : 'approved')}
              className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                clip.status === 'approved'
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold shadow-sm'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/[0.06]'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>{clip.status === 'approved' ? 'Approved' : 'Approve'}</span>
            </button>

            <button
              onClick={() => handleStatusChange(clip.status === 'rejected' ? 'draft' : 'rejected')}
              className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                clip.status === 'rejected'
                  ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300 font-semibold'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-white/[0.06]'
              }`}
            >
              <X className="w-3.5 h-3.5" />
              <span>{clip.status === 'rejected' ? 'Rejected' : 'Reject'}</span>
            </button>

            <a
              href={api.getDownloadUrl(clip.id)}
              download
              className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/[0.06] transition-colors"
              title="Download MP4"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
