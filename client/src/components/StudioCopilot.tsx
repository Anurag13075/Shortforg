import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Calendar,
  Clock,
  CheckCircle2,
  Trash2,
  RotateCw,
  Loader2,
  Terminal,
  ExternalLink,
  ChevronRight,
  Bot,
  SlidersHorizontal,
  X
} from 'lucide-react';
import { Channel, CopilotAction, CopilotMessage } from '../types';
import { api } from '../api';

interface StudioCopilotProps {
  channels: Channel[];
  onNavigateToSchedule?: () => void;
  onRefreshChannels?: () => Promise<void>;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  isOpenDrawer?: boolean;
  onCloseDrawer?: () => void;
  isFullPage?: boolean;
}

const DEFAULT_SUGGESTIONS = [
  'Schedule all approved clips for next 4 days at 10:00 AM & 6:00 PM',
  'Schedule top 3 viral clips to VICECLIPS tomorrow',
  'Approve all draft clips with virality score ≥ 85',
  'Show what is currently queued in the calendar',
  'Schedule 1 clip per day for next week at 8:00 PM'
];

export const StudioCopilot: React.FC<StudioCopilotProps> = ({
  channels,
  onNavigateToSchedule,
  onRefreshChannels,
  onToast,
  isOpenDrawer,
  onCloseDrawer,
  isFullPage = false
}) => {
  const [messages, setMessages] = useState<CopilotMessage[]>(() => {
    try {
      const cached = localStorage.getItem('shortsforge_copilot_messages');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {}
    return [
      {
        id: 'intro',
        role: 'assistant',
        content:
          'Master Scheduling Copilot active. You can approve clips, define any posting schedule (e.g. "schedule all approved clips for next 4 days at 10 AM and 6 PM to VICECLIPS"), inspect slots, or reschedule queued Shorts in natural language.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];
  });

  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [executingMessageId, setExecutingMessageId] = useState<string | null>(null);
  const [autoExecute, setAutoExecute] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem('shortsforge_copilot_messages', JSON.stringify(messages));
    } catch {}
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isProcessing) return;

    const userMsg: CopilotMessage = {
      id: `${Date.now()}_user`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsProcessing(true);

    try {
      const history = messages
        .filter((m) => m.id !== 'intro')
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await api.sendCopilotMessage(text, history, autoExecute);

      const assistantMsg: CopilotMessage = {
        id: `${Date.now()}_assistant`,
        role: 'assistant',
        content: res?.reply || res?.summary || 'I have analyzed your request and prepared the scheduling actions.',
        actions: res?.actions || [],
        summary: res?.summary,
        executed: res?.executed,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (res.executed) {
        onToast(res.executionMessage || 'Actions automatically executed!', 'success');
        if (onRefreshChannels) onRefreshChannels();
      }
    } catch (err: any) {
      onToast(`Copilot error: ${err.message}`, 'error');
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}_error`,
          role: 'assistant',
          content: `Command could not be completed: ${err.message}. Please verify your parameters or try again.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmActions = async (messageId: string, actions: CopilotAction[]) => {
    if (!actions || actions.length === 0) return;
    setExecutingMessageId(messageId);

    try {
      const res = await api.executeCopilotActions(actions);
      onToast(res.message, 'success');

      // Update message state as executed
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, executed: true } : m))
      );

      if (onRefreshChannels) onRefreshChannels();
    } catch (err: any) {
      onToast(`Execution failed: ${err.message}`, 'error');
    } finally {
      setExecutingMessageId(null);
    }
  };

  const handleClearHistory = () => {
    if (!confirm('Reset Copilot chat history?')) return;
    const initial: CopilotMessage[] = [
      {
        id: 'intro',
        role: 'assistant',
        content:
          'Master Scheduling Copilot active. Give me any instruction to batch-schedule, approve, or route clips to your YouTube channels.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];
    setMessages(initial);
    localStorage.removeItem('shortsforge_copilot_messages');
  };

  return (
    <div
      className={`flex flex-col bg-[#090a0f] text-zinc-100 ${
        isFullPage
          ? 'max-w-5xl mx-auto h-[calc(100vh-140px)] rounded-2xl border border-white/[0.08] overflow-hidden'
          : 'h-full flex-1'
      }`}
    >
      {/* Header */}
      <div className="p-4 bg-[#111218] border-b border-white/[0.08] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#161722] border border-white/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-zinc-200" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Master Scheduling Copilot
              </h2>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                120B Studio
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 font-mono">
              Autonomous calendar scheduling, clip routing & queue automation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onNavigateToSchedule && (
            <button
              onClick={onNavigateToSchedule}
              className="px-2.5 py-1 rounded bg-[#161722] hover:bg-[#1a1c2a] border border-white/[0.08] text-[11px] text-zinc-300 font-mono transition-colors flex items-center gap-1.5"
            >
              <Calendar className="w-3 h-3 text-blue-400" />
              <span>Queue View</span>
            </button>
          )}

          <button
            onClick={handleClearHistory}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-rose-400 transition-colors"
            title="Clear Chat History"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {onCloseDrawer && (
            <button
              onClick={onCloseDrawer}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Quick Suggestion Pills */}
      <div className="px-4 py-2.5 bg-[#0c0d12] border-b border-white/[0.06] flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
        <span className="text-[10px] font-mono uppercase text-zinc-600 shrink-0">
          Suggestions:
        </span>
        {DEFAULT_SUGGESTIONS.map((sugg, i) => (
          <button
            key={i}
            onClick={() => handleSendMessage(sugg)}
            disabled={isProcessing}
            className="px-2.5 py-1 rounded-full bg-[#111218] hover:bg-[#161722] border border-white/[0.06] text-[11px] text-zinc-400 hover:text-zinc-200 whitespace-nowrap transition-colors cursor-pointer shrink-0 disabled:opacity-40"
          >
            {sugg}
          </button>
        ))}
      </div>

      {/* Messages Viewport */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.role === 'user' ? 'items-end' : 'items-start'
            } animate-fade-in`}
          >
            {/* Sender Label & Timestamp */}
            <div className="flex items-center gap-1.5 mb-1 text-[10px] font-mono text-zinc-500 px-1">
              <span>{msg.role === 'user' ? 'YOU' : 'COPILOT'}</span>
              <span>•</span>
              <span>{msg.timestamp}</span>
            </div>

            {/* Bubble */}
            <div
              className={`max-w-2xl rounded-xl p-3.5 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#181a24] text-white border border-white/[0.1] font-medium'
                  : 'bg-[#111218] text-zinc-300 border border-white/[0.08]'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>

              {/* Proposed Actions Card */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-3.5 pt-3 border-t border-white/[0.08] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3 h-3 text-blue-400" />
                      <span>Proposed Schedule Batch ({msg.actions.length} Shorts)</span>
                    </span>

                    {msg.executed && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Executed & Queued
                      </span>
                    )}
                  </div>

                  {/* Actions List */}
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {msg.actions.map((act, idx) => {
                      const d = act.scheduled_time ? new Date(act.scheduled_time) : null;
                      return (
                        <div
                          key={idx}
                          className="p-2.5 rounded-lg bg-[#0c0d12] border border-white/[0.06] flex items-center justify-between gap-3 text-[11px]"
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            {act.virality_score && (
                              <span className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-amber-400 font-mono font-bold text-[10px] shrink-0">
                                ★ {act.virality_score}
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-white truncate">
                                {act.clip_title || act.type}
                              </p>
                              <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 mt-0.5">
                                {act.channel_title && (
                                  <span className="text-zinc-400">
                                    Target: {act.channel_title}
                                  </span>
                                )}
                                {d && (
                                  <span className="text-blue-400 flex items-center gap-1">
                                    <Clock className="w-2.5 h-2.5" />
                                    {d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at{' '}
                                    {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {act.reason && (
                            <span className="text-[10px] text-zinc-500 hidden sm:inline max-w-[140px] truncate">
                              {act.reason}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Action Confirm Button */}
                  {!msg.executed && (
                    <div className="pt-2 flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleConfirmActions(msg.id, msg.actions!)}
                        disabled={executingMessageId === msg.id}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow transition-all cursor-pointer disabled:opacity-50"
                      >
                        {executingMessageId === msg.id ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Executing Schedule...</span>
                          </>
                        ) : (
                          <>
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Confirm & Schedule All ({msg.actions.length})</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex flex-col items-start animate-fade-in">
            <div className="flex items-center gap-1.5 mb-1 text-[10px] font-mono text-zinc-500 px-1">
              <span>COPILOT</span>
              <span>•</span>
              <span>Thinking...</span>
            </div>
            <div className="bg-[#111218] border border-white/[0.08] rounded-xl px-4 py-3 flex items-center gap-2.5 text-xs text-zinc-400">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
              <span>Analyzing studio clips, channels & peak viral engagement windows...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="p-3 sm:p-4 bg-[#111218] border-t border-white/[0.08] shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="space-y-2"
        >
          <div className="relative flex items-center bg-[#0c0d12] border border-white/[0.08] rounded-xl p-1.5 focus-within:border-white/20 transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. 'Schedule all approved clips for next 4 days at 10 AM & 6 PM to VICECLIPS'..."
              disabled={isProcessing}
              className="flex-1 bg-transparent px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
            />

            <button
              type="submit"
              disabled={isProcessing || !input.trim()}
              className="flex items-center justify-center p-2 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 font-semibold transition-all disabled:opacity-40 cursor-pointer shrink-0"
              title="Send Command"
            >
              {isProcessing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 px-1">
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-zinc-400 transition-colors">
              <input
                type="checkbox"
                checked={autoExecute}
                onChange={(e) => setAutoExecute(e.target.checked)}
                className="rounded bg-black border-white/20 text-blue-500 focus:ring-0 w-3 h-3"
              />
              <span>Auto-execute actions without preview prompt</span>
            </label>

            <span>Press Enter to dispatch</span>
          </div>
        </form>
      </div>
    </div>
  );
};
