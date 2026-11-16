import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { HomePage } from './pages/HomePage';
import { ProjectPage } from './pages/ProjectPage';
import { SchedulePage } from './pages/SchedulePage';
import { ToastContainer, ToastMessage } from './components/Toast';
import { HealthInfo, Channel } from './types';
import { api } from './api';

export function App() {
  // Initialize tab and project from URL query or localStorage
  const [currentTab, setCurrentTab] = useState<'home' | 'project' | 'schedule'>(() => {
    const params = new URLSearchParams(window.location.search);
    if (window.location.pathname.includes('/schedule') || params.has('auth')) {
      return 'schedule';
    }
    const tabParam = params.get('tab');
    if (tabParam === 'home' || tabParam === 'project' || tabParam === 'schedule') {
      return tabParam;
    }
    const cached = localStorage.getItem('shortsforge_tab');
    if (cached === 'project' || cached === 'schedule') {
      return cached;
    }
    return 'home';
  });

  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const pParam = params.get('project');
    if (pParam) return pParam;
    return localStorage.getItem('shortsforge_active_project_id');
  });

  // Initialize channels from localStorage cache to prevent empty flicker across tabs
  const [channels, setChannels] = useState<Channel[]>(() => {
    try {
      const cached = localStorage.getItem('shortsforge_channels_cache');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const refreshChannels = async () => {
    try {
      const data = await api.getChannels();
      setChannels(data);
      localStorage.setItem('shortsforge_channels_cache', JSON.stringify(data));
    } catch (err) {
      console.warn('Failed to refresh channels:', err);
    }
  };

  // Sync tab and project state to localStorage and history URL
  const handleSelectTab = (tab: 'home' | 'project' | 'schedule') => {
    setCurrentTab(tab);
    localStorage.setItem('shortsforge_tab', tab);

    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    if (tab === 'project' && activeProjectId) {
      url.searchParams.set('project', activeProjectId);
    } else if (tab !== 'project') {
      url.searchParams.delete('project');
    }
    window.history.replaceState({}, '', url.toString());
  };

  const handleOpenProject = (projectId: string) => {
    setActiveProjectId(projectId);
    localStorage.setItem('shortsforge_active_project_id', projectId);
    handleSelectTab('project');
  };

  useEffect(() => {
    api.getHealth()
      .then((data) => setHealth(data))
      .catch((err) => {
        console.warn('Backend unreachable:', err);
      });

    refreshChannels();

    // Cross-tab synchronization via focus and storage events
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'shortsforge_channels_cache' && e.newValue) {
        try {
          setChannels(JSON.parse(e.newValue));
        } catch {}
      }
      if (e.key === 'shortsforge_active_project_id' && e.newValue) {
        setActiveProjectId(e.newValue);
      }
    };

    window.addEventListener('focus', refreshChannels);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('focus', refreshChannels);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#090a0f] text-zinc-100 flex flex-row font-sans selection:bg-blue-500/25 selection:text-white relative overflow-x-hidden">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        activeProjectId={activeProjectId}
        channels={channels}
        health={health}
      />

      {/* Main Studio Viewport */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Navbar */}
        <Navbar
          currentTab={currentTab}
          onSelectTab={handleSelectTab}
          activeProjectId={activeProjectId}
          health={health}
        />

        {/* Content Viewport */}
        <main className="flex-1 px-4 sm:px-8 py-8 max-w-7xl mx-auto w-full">
          {currentTab === 'home' && (
            <HomePage
              onOpenProject={handleOpenProject}
              onToast={addToast}
            />
          )}

          {currentTab === 'project' && (
            activeProjectId ? (
              <ProjectPage
                projectId={activeProjectId}
                channels={channels}
                onBack={() => handleSelectTab('home')}
                onNavigateToSchedule={() => handleSelectTab('schedule')}
                onToast={addToast}
              />
            ) : (
              <div className="studio-card p-12 text-center max-w-md mx-auto space-y-3">
                <p className="text-xs font-mono text-zinc-400">No project selected in Clips Studio.</p>
                <button
                  onClick={() => handleSelectTab('home')}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium"
                >
                  Browse Projects
                </button>
              </div>
            )
          )}

          {currentTab === 'schedule' && (
            <SchedulePage
              channels={channels}
              onRefreshChannels={refreshChannels}
              onToast={addToast}
            />
          )}
        </main>

        {/* Studio Footer */}
        <footer className="border-t border-white/[0.05] py-5 px-8 text-center bg-[#090a0f]">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-zinc-500 text-[11px] font-mono">
            <p>© ShortsForge Studio • Designed for high-retention vertical content</p>
            <p>Groq Whisper & LLM • Native FFmpeg Engine</p>
          </div>
        </footer>
      </div>

      {/* Floating Island Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
