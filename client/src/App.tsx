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
  const [currentTab, setCurrentTab] = useState<'home' | 'project' | 'schedule'>('home');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
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

  useEffect(() => {
    api.getHealth()
      .then((data) => setHealth(data))
      .catch((err) => {
        console.warn('Backend unreachable:', err);
      });

    api.getChannels()
      .then((data) => setChannels(data))
      .catch(() => {});

    if (window.location.pathname.includes('/schedule') || window.location.search.includes('auth=')) {
      setCurrentTab('schedule');
    }
  }, []);

  const handleOpenProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setCurrentTab('project');
  };

  return (
    <div className="min-h-screen bg-[#090a0d] text-zinc-100 flex flex-row font-sans selection:bg-blue-500/25 selection:text-white relative overflow-x-hidden">
      {/* Designeer-Style Persistent Left Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        activeProjectId={activeProjectId}
        channels={channels}
        health={health}
      />

      {/* Main Studio Viewport */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Navbar */}
        <Navbar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
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

          {currentTab === 'project' && activeProjectId && (
            <ProjectPage
              projectId={activeProjectId}
              onBack={() => setCurrentTab('home')}
              onNavigateToSchedule={() => setCurrentTab('schedule')}
              onToast={addToast}
            />
          )}

          {currentTab === 'schedule' && (
            <SchedulePage
              onToast={addToast}
            />
          )}
        </main>

        {/* Studio Footer */}
        <footer className="border-t border-white/[0.05] py-6 px-8 text-center bg-[#090a0d]">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-zinc-500 text-[11px] font-mono">
            <p>© ShortsForge Studio • Designed for high-retention vertical content</p>
            <p>Groq Whisper & LLM • Native FFmpeg Studio</p>
          </div>
        </footer>
      </div>

      {/* Floating Island Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
