import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, AlertCircle, Copy, Check, Upload, Trash2, KeyRound, ExternalLink, Loader2 } from 'lucide-react';
import { api } from '../api';

interface CookieModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const CookieModal: React.FC<CookieModalProps> = ({ isOpen, onClose, onToast }) => {
  const [cookiesText, setCookiesText] = useState('');
  const [cookieStatus, setCookieStatus] = useState<{ hasCookies: boolean; cookieCount: number }>({
    hasCookies: false,
    cookieCount: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const status = await api.getCookiesStatus();
      setCookieStatus(status);
      const cached = localStorage.getItem('sf_youtube_cookies');
      if (cached && !cookiesText) {
        setCookiesText(cached);
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!cookiesText.trim() || cookiesText.trim().length < 20) {
      onToast('Please paste valid Netscape-format cookies from YouTube', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await api.saveCookies(cookiesText);
      await fetchStatus();
      onToast('YouTube cookies saved! Cloud downloads are now authenticated.', 'success');
      onClose();
    } catch (err: any) {
      onToast(`Failed to save cookies: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsSaving(true);
    try {
      await api.deleteCookies();
      setCookiesText('');
      setCookieStatus({ hasCookies: false, cookieCount: 0 });
      onToast('Cookies cleared', 'info');
    } catch (err: any) {
      onToast(`Error clearing cookies: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setCookiesText(content);
        onToast('cookies.txt loaded from file', 'info');
      }
    };
    reader.readAsText(file);
  };

  const isYoutubeCookies = cookiesText.includes('youtube.com') || cookiesText.includes('LOGIN_INFO') || cookiesText.includes('VISITOR_INFO1_LIVE');
  const hasNonYoutubeDomain = cookiesText.trim().length > 30 && !isYoutubeCookies && (cookiesText.includes('.bolt.new') || cookiesText.includes('google.com') || cookiesText.includes('.') && !cookiesText.includes('youtube'));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-[#0e1017] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#12141e]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
              <KeyRound className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white tracking-tight">YouTube Cookie Vault</h3>
              <p className="text-[11px] text-zinc-400 font-mono">Bypasses datacenter bot walls on Zerops</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Status banner */}
          <div
            className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
              cookieStatus.hasCookies
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/25 text-amber-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {cookieStatus.hasCookies ? (
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span className="font-mono">
                {cookieStatus.hasCookies
                  ? `Active: ${cookieStatus.cookieCount} authenticated YouTube cookies loaded`
                  : 'No active cookies in vault. Cloud IPs will encounter bot challenges.'}
              </span>
            </div>
          </div>

          {/* Realtime Detection Banner */}
          {hasNonYoutubeDomain && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Wrong Website Cookies Detected!</p>
                <p className="text-[11px] text-rose-200/90 leading-relaxed">
                  These cookies appear to be from another tab (e.g. bolt.new). The extension exports cookies for whichever tab you are currently looking at.
                </p>
                <p className="text-[11px] text-amber-300 font-medium">
                  👉 Switch to your <b>YouTube.com</b> tab first, THEN click the "Get cookies.txt" extension icon!
                </p>
              </div>
            </div>
          )}

          {isYoutubeCookies && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-mono font-medium">
                Valid YouTube cookies detected! Click the yellow "Save to Vault" button below.
              </span>
            </div>
          )}

          {/* 3-Step Quick Guide */}
          <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.06] space-y-2 text-xs">
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block font-semibold">
              How to Export in 30 Seconds:
            </span>
            <ol className="list-decimal list-inside space-y-1.5 text-zinc-300 leading-relaxed text-[11px]">
              <li>
                Open a new browser tab and navigate to{' '}
                <a
                  href="https://youtube.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-400 font-mono font-bold hover:underline inline-flex items-center gap-1"
                >
                  youtube.com <ExternalLink className="w-2.5 h-2.5" />
                </a>{' '}
                (make sure you are signed in).
              </li>
              <li>
                While on the <span className="text-white font-mono font-semibold">youtube.com</span> tab, click the extension icon{' '}
                <span className="text-zinc-200 font-mono text-[10px] bg-white/10 px-1 py-0.5 rounded">Get cookies.txt LOCALLY</span>.
              </li>
              <li>
                Copy the text from the popup, come back here, paste it below, and click <span className="text-amber-300 font-bold">"Save to Vault"</span>.
              </li>
            </ol>
          </div>

          {/* Text Area */}
          <div>
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-1.5">
              <span>NETSCAPE COOKIES FORMAT</span>
              <label className="text-blue-400 hover:text-blue-300 cursor-pointer flex items-center gap-1">
                <Upload className="w-3 h-3" />
                <span>Upload cookies.txt</span>
                <input type="file" accept=".txt" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
            <textarea
              rows={6}
              value={cookiesText}
              onChange={(e) => setCookiesText(e.target.value)}
              placeholder="# Netscape HTTP Cookie File&#10;.youtube.com	TRUE	/	TRUE	...	LOGIN_INFO	..."
              className={`w-full p-2.5 rounded-xl bg-black/60 border text-xs font-mono focus:outline-none resize-none leading-relaxed ${
                hasNonYoutubeDomain
                  ? 'border-rose-500/50 text-rose-200'
                  : isYoutubeCookies
                  ? 'border-emerald-500/50 text-emerald-200'
                  : 'border-white/10 text-zinc-300 focus:border-amber-400/50'
              }`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.08] bg-[#12141e] flex items-center justify-between gap-2">
          {cookieStatus.hasCookies && (
            <button
              onClick={handleClear}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-mono transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !cookiesText.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-semibold shadow transition-all disabled:opacity-40"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              <span>Save to Vault</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
