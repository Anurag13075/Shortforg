import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { HomePage } from './pages/HomePage';
import { ProjectPage } from './pages/ProjectPage';
import { SchedulePage } from './pages/SchedulePage';
import { StudioCopilot } from './components/StudioCopilot';
import { CookieModal } from './components/CookieModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { HealthInfo, Channel } from './types';
import { api } from './api';

export function App() {
  // Initialize tab and project from URL query or localStorage
  const [currentTab, setCurrentTab] = useState<'home' | 'project' | 'schedule' | 'copilot'>(() => {
    const params = new URLSearchParams(window.location.search);
    if (window.location.pathname.includes('/schedule') || params.has('auth')) {
      return 'schedule';
    }
    const tabParam = params.get('tab');
    if (tabParam === 'home' || tabParam === 'project' || tabParam === 'schedule' || tabParam === 'copilot') {
      return tabParam;
    }
    const cached = localStorage.getItem('shortsforge_tab');
    if (cached === 'project' || cached === 'schedule' || cached === 'copilot') {
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

  // Slide-over Copilot drawer state
  const [isCopilotDrawerOpen, setIsCopilotDrawerOpen] = useState(false);
  const [isCookieModalOpen, setIsCookieModalOpen] = useState(false);
  const [hasCookies, setHasCookies] = useState(false);

  const checkCookies = async () => {
    try {
      const res = await api.getCookiesStatus();
      setHasCookies(res.hasCookies);
    } catch {}
  };

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
  const handleSelectTab = (tab: 'home' | 'project' | 'schedule' | 'copilot') => {
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
    checkCookies();

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
    <div className="min-h-screen bg-[#07080e] text-zinc-100 flex flex-row font-sans selection:bg-indigo-500/30 selection:text-white relative overflow-x-hidden">
      {/* Ambient background studio lighting */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-[250px] left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-gradient-to-b from-indigo-600/12 via-purple-600/6 to-transparent blur-[140px] rounded-full" />
        <div className="absolute top-[35%] -left-[180px] w-[450px] h-[450px] bg-blue-600/6 blur-[130px] rounded-full" />
        <div className="absolute top-[65%] -right-[180px] w-[450px] h-[450px] bg-amber-500/5 blur-[130px] rounded-full" />
      </div>

      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        activeProjectId={activeProjectId}
        channels={channels}
        health={health}
      />

      {/* Main Studio Viewport */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen relative z-10">
        {/* Top Navbar */}
        <Navbar
          currentTab={currentTab}
          onSelectTab={handleSelectTab}
          activeProjectId={activeProjectId}
          health={health}
          hasCookies={hasCookies}
          onOpenCookiesModal={() => setIsCookieModalOpen(true)}
          onToggleCopilot={() => setIsCopilotDrawerOpen((prev) => !prev)}
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
              onNavigateToCopilot={() => handleSelectTab('copilot')}
              onToast={addToast}
            />
          )}

          {currentTab === 'copilot' && (
            <StudioCopilot
              channels={channels}
              onNavigateToSchedule={() => handleSelectTab('schedule')}
              onRefreshChannels={refreshChannels}
              onToast={addToast}
              isFullPage={true}
            />
          )}
        </main>

        {/* Studio Footer */}
        <footer className="border-t border-white/[0.05] py-5 px-8 text-center bg-[#090a0f]">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-zinc-500 text-[11px] font-mono">
            <p>© ShortsForge Studio • Designed for high-retention vertical content</p>
            <p>Groq Whisper & 120B Copilot • Native FFmpeg Engine</p>
          </div>
        </footer>
      </div>

      {/* Slide-over Copilot Drawer (Accessible from ANY page) */}
      {isCopilotDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end animate-fade-in">
          <div
            onClick={() => setIsCopilotDrawerOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          />
          <div className="relative w-full max-w-xl bg-[#090a0f] border-l border-white/[0.1] h-full shadow-2xl flex flex-col z-10 animate-slide-left">
            <StudioCopilot
              channels={channels}
              onNavigateToSchedule={() => {
                setIsCopilotDrawerOpen(false);
                handleSelectTab('schedule');
              }}
              onRefreshChannels={refreshChannels}
              onToast={addToast}
              isOpenDrawer={true}
              onCloseDrawer={() => setIsCopilotDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Floating Island Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* YouTube Cookie Vault Modal */}
      <CookieModal
        isOpen={isCookieModalOpen}
        onClose={() => {
          setIsCookieModalOpen(false);
          checkCookies();
        }}
        onToast={addToast}
      />
    </div>
  );
}

export default App;
