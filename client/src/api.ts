import { Project, Clip, Channel, QueueItem, HealthInfo } from './types';

const BASE_URL = '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    },
    ...options
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `HTTP ${res.status}: ${res.statusText}`);
  }
  return json.data !== undefined ? json.data : json;
}

export const api = {
  // System Health
  getHealth: () => request<HealthInfo>('/api/health'),

  // Projects (with automated client vault persistence across redeployments)
  getProjects: async () => {
    try {
      const projects = await request<Project[]>('/api/projects');
      if (Array.isArray(projects) && projects.length > 0) {
        try {
          localStorage.setItem('sf_projects_vault', JSON.stringify(projects));
        } catch {}
        return projects;
      }
      // If server returned 0 projects, check if client vault has backup
      const cached = localStorage.getItem('sf_projects_vault');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          let cachedClips: any[] = [];
          try {
            const allClipsStr = localStorage.getItem('sf_clips_vault_all');
            if (allClipsStr) cachedClips = JSON.parse(allClipsStr);
          } catch {}

          await request<{ success: boolean; synced: number }>('/api/projects/sync', {
            method: 'POST',
            body: JSON.stringify({ projects: parsed, clips: cachedClips })
          });
          return await request<Project[]>('/api/projects');
        }
      }
      return projects;
    } catch (e) {
      const cached = localStorage.getItem('sf_projects_vault');
      if (cached) {
        try { return JSON.parse(cached); } catch {}
      }
      throw e;
    }
  },
  getProject: async (id: string) => {
    try {
      const data = await request<Project & { clips: Clip[] }>(`/api/projects/${id}`);
      if (data) {
        try {
          localStorage.setItem(`sf_project_${id}`, JSON.stringify(data));
          if (Array.isArray(data.clips)) {
            localStorage.setItem(`sf_clips_${id}`, JSON.stringify(data.clips));

            // Merge into sf_clips_vault_all
            let existing: Clip[] = [];
            try {
              const allStr = localStorage.getItem('sf_clips_vault_all');
              if (allStr) existing = JSON.parse(allStr);
            } catch {}
            const filtered = existing.filter((c) => c.project_id !== id);
            localStorage.setItem('sf_clips_vault_all', JSON.stringify([...filtered, ...data.clips]));
          }
        } catch {}
      }
      return data;
    } catch (err: any) {
      // Fallback to cache if server DB restarted
      const cached = localStorage.getItem(`sf_project_${id}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          const cachedClips = localStorage.getItem(`sf_clips_${id}`);
          if (cachedClips) parsed.clips = JSON.parse(cachedClips);
          return parsed;
        } catch {}
      }
      throw err;
    }
  },
  getProjectLogs: (id: string) => request<any[]>(`/api/projects/${id}/logs`),
  createProject: (youtubeUrl: string, niche?: string) => request<Project>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ youtubeUrl, niche: niche || 'high_energy' })
  }),
  uploadVideoFile: async (file: File): Promise<Project> => {
    const res = await fetch(`/api/projects/upload?filename=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'video/mp4'
      },
      body: file
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error || `Upload failed: ${res.statusText}`);
    }
    return json.data !== undefined ? json.data : json;
  },
  deleteProject: (id: string) => request<{ success: boolean; message: string }>(`/api/projects/${id}`, {
    method: 'DELETE'
  }),
  retryProject: (id: string) => request<Project>(`/api/projects/${id}/retry`, {
    method: 'POST'
  }),

  // Cookies Vault API
  getCookiesStatus: async () => {
    try {
      const res = await request<{ hasCookies: boolean; cookieCount: number; cookiePath: string }>('/api/cookies');
      // If server does not have cookies but client has cached cookies, auto sync!
      if (!res.hasCookies) {
        const cached = localStorage.getItem('sf_youtube_cookies');
        if (cached && cached.trim().length > 20) {
          await request('/api/cookies', {
            method: 'POST',
            body: JSON.stringify({ cookiesText: cached })
          });
          return await request<{ hasCookies: boolean; cookieCount: number; cookiePath: string }>('/api/cookies');
        }
      }
      return res;
    } catch (e: any) {
      return { hasCookies: false, cookieCount: 0, cookiePath: '' };
    }
  },
  saveCookies: async (cookiesText: string) => {
    const res = await request<{ success: boolean; message: string }>('/api/cookies', {
      method: 'POST',
      body: JSON.stringify({ cookiesText })
    });
    try {
      localStorage.setItem('sf_youtube_cookies', cookiesText.trim());
    } catch {}
    return res;
  },
  deleteCookies: async () => {
    const res = await request<{ success: boolean; message: string }>('/api/cookies', {
      method: 'DELETE'
    });
    try {
      localStorage.removeItem('sf_youtube_cookies');
    } catch {}
    return res;
  },

  // Clips
  getClips: (params?: { status?: string; project_id?: string }) => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set('status', params.status);
    if (params?.project_id) sp.set('project_id', params.project_id);
    const qs = sp.toString();
    return request<Clip[]>(`/api/clips${qs ? `?${qs}` : ''}`);
  },
  updateClip: (id: string, updates: Partial<Clip>) =>
    request<Clip>(`/api/clips/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    }),
  deleteClip: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/clips/${id}`, {
      method: 'DELETE'
    }),
  scheduleClipDirect: (id: string, channel_id: string, scheduled_time?: string) =>
    request<QueueItem>(`/api/clips/${id}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ channel_id, scheduled_time })
    }),
  renderClip: (
    id: string,
    options?: number | {
      crop_offset_x?: number;
      start_time?: number;
      end_time?: number;
      layout?: 'blur_bg' | 'crop';
      hook_overlay?: boolean;
      caption_preset?: string;
      caption_active_color?: string;
      caption_base_color?: string;
      words_per_burst?: number;
    }
  ) => {
    const payload = typeof options === 'number' ? { crop_offset_x: options } : (options || {});
    return request<Clip>(`/api/clips/${id}/render`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  regenerateClipMetadata: (id: string) =>
    request<Clip>(`/api/clips/${id}/regenerate-metadata`, {
      method: 'POST'
    }),
  getVideoUrl: (clipId: string) => `/api/clips/${clipId}/video`,
  getThumbnailUrl: (clipId: string) => `/api/clips/${clipId}/thumbnail`,
  getDownloadUrl: (clipId: string) => `/api/clips/${clipId}/download`,

  // Channels (with automated client vault persistence across redeployments)
  getChannels: async () => {
    try {
      const channels = await request<Channel[]>('/api/channels');
      if (Array.isArray(channels) && channels.length > 0) {
        try {
          localStorage.setItem('sf_channels_vault', JSON.stringify(channels));
        } catch {}
        return channels;
      }
      // If server returned 0 channels (e.g. after a fresh container deploy), auto-sync from client vault
      const cached = localStorage.getItem('sf_channels_vault');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          await request<{ success: boolean; synced: number }>('/api/channels/sync', {
            method: 'POST',
            body: JSON.stringify({ channels: parsed })
          });
          return await request<Channel[]>('/api/channels');
        }
      }
      return channels;
    } catch (e) {
      const cached = localStorage.getItem('sf_channels_vault');
      if (cached) {
        try { return JSON.parse(cached); } catch {}
      }
      throw e;
    }
  },
  deleteChannel: async (id: string) => {
    try {
      const res = await request<{ success: boolean; message: string }>(`/api/channels/${id}`, {
        method: 'DELETE'
      });
      // Also update local vault
      try {
        const cached = localStorage.getItem('sf_channels_vault');
        if (cached) {
          const parsed = JSON.parse(cached);
          const filtered = parsed.filter((c: any) => c.id !== id);
          localStorage.setItem('sf_channels_vault', JSON.stringify(filtered));
        }
      } catch {}
      return res;
    } catch (e) {
      throw e;
    }
  },

  // Scheduling
  getSchedule: () => request<QueueItem[]>('/api/schedule'),
  scheduleClip: (clip_id: string, channel_id: string, scheduled_time: string) =>
    request<QueueItem>('/api/schedule', {
      method: 'POST',
      body: JSON.stringify({ clip_id, channel_id, scheduled_time })
    }),
  autoSchedule: (channel_id: string, clips_per_day: number = 2, project_id?: string) =>
    request<{ success: boolean; message: string; scheduledCount: number }>('/api/schedule/auto', {
      method: 'POST',
      body: JSON.stringify({ channel_id, clips_per_day, project_id })
    }),
  retryQueueItem: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/schedule/${id}/retry`, {
      method: 'POST'
    }),
  deleteQueueItem: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/schedule/${id}`, {
      method: 'DELETE'
    }),

  // SSE Live Progress Listener
  subscribeProjectProgress: (projectId: string, onUpdate: (update: any) => void): (() => void) => {
    const eventSource = new EventSource(`/api/projects/${projectId}/progress`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onUpdate(data);
      } catch (err) {
        console.error('Error parsing SSE data:', err);
      }
    };

    eventSource.onerror = () => {
      // Automatic browser reconnect is handled, or closed on completion
    };

    return () => {
      eventSource.close();
    };
  },

  // Copilot API
  sendCopilotMessage: async (
    message: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>,
    autoExecute?: boolean
  ): Promise<{
    reply: string;
    actions: import('./types').CopilotAction[];
    summary?: string;
    executed?: boolean;
    executionMessage?: string;
  }> => {
    const res = await request<{
      reply: string;
      actions: import('./types').CopilotAction[];
      summary?: string;
      executed?: boolean;
      executionMessage?: string;
    }>('/api/copilot/message', {
      method: 'POST',
      body: JSON.stringify({ message, history, autoExecute })
    });
    return (res as any)?.data !== undefined ? (res as any).data : res;
  },

  executeCopilotActions: async (
    actions: import('./types').CopilotAction[]
  ): Promise<{
    success: boolean;
    executedCount: number;
    message: string;
  }> => {
    const res = await request<{
      success: boolean;
      executedCount: number;
      message: string;
    }>('/api/copilot/execute', {
      method: 'POST',
      body: JSON.stringify({ actions })
    });
    return (res as any)?.data !== undefined ? (res as any).data : res;
  }
};
