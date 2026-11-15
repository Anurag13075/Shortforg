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

  // Projects
  getProjects: () => request<Project[]>('/api/projects'),
  getProject: (id: string) => request<Project & { clips: Clip[] }>(`/api/projects/${id}`),
  createProject: (youtubeUrl: string) => request<Project>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ youtubeUrl })
  }),
  deleteProject: (id: string) => request<{ success: boolean; message: string }>(`/api/projects/${id}`, {
    method: 'DELETE'
  }),
  retryProject: (id: string) => request<Project>(`/api/projects/${id}/retry`, {
    method: 'POST'
  }),

  // Clips
  updateClip: (id: string, updates: Partial<Pick<Clip, 'title' | 'caption' | 'hashtags' | 'status' | 'crop_offset_x'>>) =>
    request<Clip>(`/api/clips/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    }),
  renderClip: (id: string, crop_offset_x?: number) =>
    request<Clip>(`/api/clips/${id}/render`, {
      method: 'POST',
      body: JSON.stringify({ crop_offset_x })
    }),
  getVideoUrl: (clipId: string) => `/api/clips/${clipId}/video`,
  getThumbnailUrl: (clipId: string) => `/api/clips/${clipId}/thumbnail`,
  getDownloadUrl: (clipId: string) => `/api/clips/${clipId}/download`,

  // Channels
  getChannels: () => request<Channel[]>('/api/channels'),
  deleteChannel: (id: string) => request<{ success: boolean; message: string }>(`/api/channels/${id}`, {
    method: 'DELETE'
  }),

  // Scheduling
  getSchedule: () => request<QueueItem[]>('/api/schedule'),
  scheduleClip: (clip_id: string, channel_id: string, scheduled_time: string) =>
    request<QueueItem>('/api/schedule', {
      method: 'POST',
      body: JSON.stringify({ clip_id, channel_id, scheduled_time })
    }),
  autoSchedule: (channel_id: string, clips_per_day: number = 2) =>
    request<{ success: boolean; message: string; scheduledCount: number }>('/api/schedule/auto', {
      method: 'POST',
      body: JSON.stringify({ channel_id, clips_per_day })
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
  }
};
