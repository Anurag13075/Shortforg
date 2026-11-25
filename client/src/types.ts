export interface Project {
  id: string;
  youtube_url: string;
  title: string | null;
  duration: number;
  source_video_path: string | null;
  status: 'pending' | 'downloading' | 'transcribing' | 'analyzing' | 'rendering' | 'completed' | 'failed';
  progress: number;
  stage_message: string;
  error_message: string | null;
  niche?: string | null;
  clip_count?: number;
  approved_count?: number;
  clips?: Clip[];
  created_at: string;
  updated_at: string;
}

export interface Clip {
  id: string;
  project_id: string;
  title: string;
  caption: string | null;
  hashtags: string | null;
  hook_line: string | null;
  virality_score: number;
  reason: string | null;
  start_time: number;
  end_time: number;
  crop_offset_x: number;
  video_path: string | null;
  thumbnail_path: string | null;
  status: 'draft' | 'approved' | 'rejected' | 'rendering' | 'failed';
  caption_preset?: 'hormozi_gold' | 'neon_green' | 'cyber_cyan' | 'sunset_punch' | 'electric_purple' | 'custom' | null;
  caption_active_color?: string | null;
  caption_base_color?: string | null;
  words_per_burst?: number | null;
  assigned_channel_id?: string | null;
  assigned_channel_title?: string | null;
  assigned_channel_avatar?: string | null;
  title_options?: string | null;
  caption_options?: string | null;
  layout?: 'blur_bg' | 'crop';
  hook_overlay?: number;
  error_message?: string | null;
  project_title?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Channel {
  id: string;
  title: string;
  avatar_url: string | null;
  status: 'active' | 'reconnect_needed';
  created_at: string;
  updated_at: string;
  total_posted?: number;
  total_scheduled?: number;
}

export interface QueueItem {
  id: string;
  clip_id: string;
  channel_id: string;
  scheduled_time: string;
  status: 'scheduled' | 'posting' | 'posted' | 'failed';
  youtube_video_id: string | null;
  retry_count: number;
  error_message: string | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
  clip_title?: string;
  virality_score?: number;
  hook_line?: string;
  thumbnail_path?: string;
  video_path?: string;
  channel_title?: string;
  channel_avatar?: string;
  channel_status?: string;
}

export interface HealthInfo {
  status: string;
  ffmpeg: {
    available: boolean;
    message: string;
    version?: string;
  };
  config: {
    hasVidKraken: boolean;
    hasGroq: boolean;
    hasGoogleOAuth: boolean;
    appUrl: string;
    googleRedirectUri: string;
  };
}

export interface CopilotAction {
  type: 'schedule' | 'approve' | 'reject' | 'reschedule' | 'delete_queue';
  clip_id?: string;
  clip_title?: string;
  channel_id?: string;
  channel_title?: string;
  scheduled_time?: string;
  queue_id?: string;
  virality_score?: number;
  reason?: string;
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: CopilotAction[];
  summary?: string;
  executed?: boolean;
  timestamp: string;
}

export interface LongformChapter {
  id: string;
  title: string;
  source_index: number;
  source_url: string;
  source_title: string;
  start_time: number;
  end_time: number;
  duration: number;
  hook_text?: string;
  summary?: string;
  order: number;
}

export interface LongformProject {
  id: string;
  title: string | null;
  topic: string;
  source_urls: string[] | string;
  target_duration: number;
  actual_duration: number;
  status: 'pending' | 'downloading' | 'transcribing' | 'scripting' | 'rendering' | 'completed' | 'failed';
  progress: number;
  stage_message: string;
  error_message: string | null;
  chapters?: LongformChapter[];
  chapter_count?: number;
  script_outline: string | null;
  video_path: string | null;
  thumbnail_path: string | null;
  assigned_channel_id: string | null;
  channel_title?: string;
  channel_avatar?: string;
  scheduled_time?: string | null;
  schedule_status?: 'none' | 'scheduled' | 'posting' | 'posted' | 'failed';
  youtube_video_id?: string | null;
  posted_at?: string | null;
  created_at: string;
  updated_at: string;
}
