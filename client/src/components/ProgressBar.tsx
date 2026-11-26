import React from 'react';
import { Loader2, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';

interface ProgressBarProps {
  status: 'pending' | 'downloading' | 'transcribing' | 'analyzing' | 'rendering' | 'completed' | 'failed';
  progress: number;
  stageMessage: string;
  errorMessage?: string | null;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  status,
  progress,
  stageMessage,
  errorMessage
}) => {
  const stages = [
    { key: 'downloading', label: 'Download', minProgress: 0 },
    { key: 'transcribing', label: 'Whisper AI', minProgress: 35 },
    { key: 'analyzing', label: 'Moments', minProgress: 50 },
    { key: 'rendering', label: 'Render 9:16', minProgress: 65 },
    { key: 'completed', label: 'Ready', minProgress: 100 }
  ];

  return (
    <div className="craft-card rounded-2xl p-5 mb-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center">
            {status === 'failed' ? (
              <AlertCircle className="w-4 h-4 text-rose-500" />
            ) : status === 'completed' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : (
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-white tracking-tight">
                {stageMessage || 'Processing Pipeline...'}
              </h4>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-400 border border-white/[0.06] uppercase">
                {status}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-0.5 font-mono">
              Background job running via Groq & local FFmpeg
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xl font-bold font-mono tracking-tight text-white">
            {Math.round(progress)}%
          </span>
        </div>
      </div>

      {/* Progress Track */}
      <div className="w-full bg-white/[0.05] rounded-full h-1.5 overflow-hidden mb-4 border border-white/[0.06]">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            status === 'failed'
              ? 'bg-rose-500'
              : status === 'completed'
              ? 'bg-emerald-400'
              : 'bg-gradient-to-r from-violet-400 via-cyan-300 to-white shadow-[0_0_14px_rgba(167,139,250,0.55)]'
          }`}
          style={{ width: `${Math.min(100, Math.max(3, progress))}%` }}
        />
      </div>

      {/* Pipeline Steps Minimalist Breadcrumb */}
      <div className="flex items-center justify-between gap-1 pt-1 border-t border-white/[0.04]">
        {stages.map((stage, idx) => {
          const isPassed = progress >= stage.minProgress;
          const isCurrent = status === stage.key;

          return (
            <React.Fragment key={stage.key}>
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full transition-all ${
                    status === 'failed'
                      ? 'bg-rose-900'
                      : isCurrent
                      ? 'bg-blue-400 shadow-[0_0_8px_#60a5fa]'
                      : isPassed
                      ? 'bg-zinc-300'
                      : 'bg-zinc-800'
                  }`}
                />
                <span
                  className={`text-[11px] font-medium tracking-tight ${
                    isCurrent
                      ? 'text-white font-semibold'
                      : isPassed
                      ? 'text-zinc-400'
                      : 'text-zinc-600'
                  }`}
                >
                  {stage.label}
                </span>
              </div>
              {idx < stages.length - 1 && (
                <ArrowRight className="w-2.5 h-2.5 text-zinc-700 hidden sm:block shrink-0" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Error Output Container */}
      {status === 'failed' && errorMessage && (
        <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-mono leading-relaxed">
          <span className="font-semibold text-rose-200">Execution Error: </span>
          {errorMessage}
        </div>
      )}
    </div>
  );
};
