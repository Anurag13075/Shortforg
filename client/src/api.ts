import { Project, Clip, Channel, QueueItem, HealthInfo, LongformProject, LongformChapter } from './types';

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
  deleteProject: async (id: string) => {
    const res = await request<{ success: boolean; message: string }>(`/api/projects/${id}`, {
      method: 'DELETE'
    });
    try {
      localStorage.removeItem(`sf_project_${id}`);
      localStorage.removeItem(`sf_clips_${id}`);
      const pVault = localStorage.getItem('sf_projects_vault');
      if (pVault) {
        localStorage.setItem('sf_projects_vault', JSON.stringify(JSON.parse(pVault).filter((p: any) => p.id !== id)));
      }
      const cVault = localStorage.getItem('sf_clips_vault_all');
      if (cVault) {
        localStorage.setItem('sf_clips_vault_all', JSON.stringify(JSON.parse(cVault).filter((c: any) => c.project_id !== id)));
      }
    } catch {}
    return res;
  },
  retryProject: (id: string) => request<Project>(`/api/projects/${id}/retry`, {
    method: 'POST'
  }),


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
  deleteClip: async (id: string) => {
    const res = await request<{ success: boolean; message: string }>(`/api/clips/${id}`, {
      method: 'DELETE'
    });
    try {
      const cVault = localStorage.getItem('sf_clips_vault_all');
      if (cVault) {
        localStorage.setItem('sf_clips_vault_all', JSON.stringify(JSON.parse(cVault).filter((c: any) => c.id !== id)));
      }
      const qVault = localStorage.getItem('sf_queue_vault');
      if (qVault) {
        localStorage.setItem('sf_queue_vault', JSON.stringify(JSON.parse(qVault).filter((q: any) => q.clip_id !== id)));
      }
    } catch {}
    return res;
  },
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

  // Scheduling (with automated client vault persistence across redeployments)
  getSchedule: async () => {
    try {
      const queue = await request<QueueItem[]>('/api/schedule');
      if (Array.isArray(queue) && queue.length > 0) {
        try {
          localStorage.setItem('sf_queue_vault', JSON.stringify(queue));
        } catch {}
        return queue;
      }
      // If server returned 0 queue items (e.g. after container redeploy), sync channels + projects/clips FIRST, then queue!
      const cached = localStorage.getItem('sf_queue_vault');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          await Promise.all([
            api.getChannels().catch(() => []),
            api.getProjects().catch(() => [])
          ]);
          await request<{ success: boolean; synced: number }>('/api/schedule/sync', {
            method: 'POST',
            body: JSON.stringify({ queue: parsed })
          });
          return await request<QueueItem[]>('/api/schedule');
        }
      }
      return queue;
    } catch (e) {
      const cached = localStorage.getItem('sf_queue_vault');
      if (cached) {
        try { return JSON.parse(cached); } catch {}
      }
      throw e;
    }
  },
  scheduleClip: async (clip_id: string, channel_id: string, scheduled_time: string) => {
    const res = await request<QueueItem>('/api/schedule', {
      method: 'POST',
      body: JSON.stringify({ clip_id, channel_id, scheduled_time })
    });
    try {
      const cached = localStorage.getItem('sf_queue_vault');
      const existing = cached ? JSON.parse(cached) : [];
      localStorage.setItem('sf_queue_vault', JSON.stringify([...existing, res]));
    } catch {}
    return res;
  },
  autoSchedule: async (channel_id: string, clips_per_day: number = 2, project_id?: string) => {
    const res = await request<{ success: boolean; message: string; scheduledCount: number }>('/api/schedule/auto', {
      method: 'POST',
      body: JSON.stringify({ channel_id, clips_per_day, project_id })
    });
    // Immediately refresh and store full queue
    try {
      const fullQueue = await request<QueueItem[]>('/api/schedule');
      localStorage.setItem('sf_queue_vault', JSON.stringify(fullQueue));
    } catch {}
    return res;
  },
  retryQueueItem: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/schedule/${id}/retry`, {
      method: 'POST'
    }),
  deleteQueueItem: async (id: string) => {
    const res = await request<{ success: boolean; message: string }>(`/api/schedule/${id}`, {
      method: 'DELETE'
    });
    try {
      const cached = localStorage.getItem('sf_queue_vault');
      if (cached) {
        const parsed = JSON.parse(cached);
        const filtered = parsed.filter((q: any) => q.id !== id);
        localStorage.setItem('sf_queue_vault', JSON.stringify(filtered));
      }
    } catch {}
    return res;
  },

  // SSE Live Progress Listener
  subscribeProjectProgress: (projectId: string, onUpdate: (update: any) => void): (() => void) => {
    const eventSource = new EventSource(`/api/projects/${projectId}/progress`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onUpdate(data);
        if (data.status === 'completed' || data.status === 'failed') {
          eventSource.close();
        }
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
  },

  // Long-Form Video Studio API
  getLongformProjects: async (): Promise<LongformProject[]> => {
    try {
      const projects = await request<LongformProject[]>('/api/longform');
      if (Array.isArray(projects) && projects.length > 0) {
        try {
          localStorage.setItem('sf_longform_vault', JSON.stringify(projects));
        } catch {}
        return projects;
      }
      const cached = localStorage.getItem('sf_longform_vault');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          await request<{ success: boolean; synced: number }>('/api/longform/sync', {
            method: 'POST',
            body: JSON.stringify({ projects: parsed })
          });
          return await request<LongformProject[]>('/api/longform');
        }
      }
      return projects || [];
    } catch (e) {
      const cached = localStorage.getItem('sf_longform_vault');
      if (cached) {
        try { return JSON.parse(cached); } catch {}
      }
      throw e;
    }
  },

  getLongformProject: async (id: string): Promise<LongformProject> => {
    try {
      const data = await request<LongformProject>(`/api/longform/${id}`);
      if (data) {
        try {
          localStorage.setItem(`sf_lf_proj_${id}`, JSON.stringify(data));
        } catch {}
      }
      return data;
    } catch (err: any) {
      const cached = localStorage.getItem(`sf_lf_proj_${id}`);
      if (cached) {
        try { return JSON.parse(cached); } catch {}
      }
      throw err;
    }
  },

  getLongformLogs: (id: string) => request<any[]>(`/api/longform/${id}/logs`),

  createLongformProject: (
    topic: string,
    sourceUrls: string[],
    targetDuration: number = 600,
    narratorEnabled: boolean = true,
    narratorVoice: string = 'en-US-AndrewMultilingualNeural'
  ) =>
    request<LongformProject>('/api/longform', {
      method: 'POST',
      body: JSON.stringify({ topic, sourceUrls, targetDuration, narratorEnabled, narratorVoice })
    }),

  retryLongformProject: (id: string) =>
    request<LongformProject>(`/api/longform/${id}/retry`, { method: 'POST' }),

  reRenderLongformProject: (id: string, chapters: LongformChapter[]) =>
    request<{ success: boolean; message: string }>(`/api/longform/${id}/render`, {
      method: 'POST',
      body: JSON.stringify({ chapters })
    }),

  deleteLongformProject: async (id: string) => {
    const res = await request<{ success: boolean; message: string }>(`/api/longform/${id}`, { method: 'DELETE' });
    try {
      localStorage.removeItem(`sf_lf_proj_${id}`);
      const cached = localStorage.getItem('sf_longform_vault');
      if (cached) {
        localStorage.setItem('sf_longform_vault', JSON.stringify(JSON.parse(cached).filter((p: any) => p.id !== id)));
      }
    } catch {}
    return res;
  },

  assignLongformChannel: (id: string, channel_id: string | null) =>
    request<{ success: boolean; message: string }>(`/api/longform/${id}/assign-channel`, {
      method: 'POST',
      body: JSON.stringify({ channel_id })
    }),

  scheduleLongformProject: (id: string, channelId: string, scheduledTime?: string, publishNow: boolean = false) =>
    request<LongformProject>(`/api/longform/${id}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ channel_id: channelId, scheduled_time: scheduledTime, publish_now: publishNow })
    }),

  cancelLongformSchedule: (id: string) =>
    request<LongformProject>(`/api/longform/${id}/cancel-schedule`, {
      method: 'POST'
    }),

  updateLongformMetadata: (id: string, payload: { title?: string; description?: string }) =>
    request<LongformProject>(`/api/longform/${id}/metadata`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  uploadLongformThumbnail: (id: string, imageDataUrl: string) =>
    request<LongformProject>(`/api/longform/${id}/thumbnail`, {
      method: 'POST',
      body: JSON.stringify({ imageDataUrl })
    }),

  getLongformVideoUrl: (id: string) => `/api/longform/${id}/video`,
  getLongformThumbnailUrl: (id: string) => `/api/longform/${id}/thumbnail`,
  getLongformDownloadUrl: (id: string) => `/api/longform/${id}/download`,

  subscribeLongformProgress: (
    projectId: string,
    callback: (data: {
      projectId: string;
      status: string;
      progress: number;
      stageMessage: string;
      errorMessage?: string | null;
      log?: { timestamp: string; level: 'info' | 'warn' | 'error' | 'success'; message: string };
    }) => void
  ): (() => void) => {
    const eventSource = new EventSource(`/api/longform/${projectId}/progress`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        callback(data);
        if (data.status === 'completed' || data.status === 'failed') {
          eventSource.close();
        }
      } catch (err) {
        console.error('Failed to parse longform SSE message:', err);
      }
    };

    eventSource.onerror = () => {
      // Browser handles reconnect
    };

    return () => {
      eventSource.close();
    };
  }
};


