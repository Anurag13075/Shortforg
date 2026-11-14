import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { HomePage } from './pages/HomePage';
import { ProjectPage } from './pages/ProjectPage';
import { SchedulePage } from './pages/SchedulePage';
import { ToastContainer, ToastMessage } from './components/Toast';
import { HealthInfo } from './types';
import { api } from './api';

export function App() {
  const [currentTab, setCurrentTab] = useState<'home' | 'project' | 'schedule'>('home');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
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

    if (window.location.pathname.includes('/schedule') || window.location.search.includes('auth=')) {
      setCurrentTab('schedule');
    }
  }, []);

  const handleOpenProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setCurrentTab('project');
  };

  return (
    <div className="min-h-screen bg-[#07080a] text-zinc-100 flex flex-col font-sans selection:bg-blue-500/25 selection:text-white relative overflow-x-hidden">
      {/* Subtle ambient lighting effect */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-gradient-to-b from-blue-600/10 via-indigo-600/5 to-transparent blur-[120px] pointer-events-none -z-10" />

      {/* Top Studio Navbar */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        activeProjectId={activeProjectId}
        health={health}
      />

      {/* Main Viewport */}
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto w-full">
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

      {/* Minimalist Studio Footer */}
      <footer className="border-t border-white/[0.05] py-6 text-center bg-[#07080a]">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-zinc-500 text-[11px] font-mono">
          <p>© ShortsForge Studio • Local-first autonomous video pipeline</p>
          <p>Powered by Groq Whisper & LLM • Local FFmpeg Engine</p>
        </div>
      </footer>

      {/* Floating Island Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
