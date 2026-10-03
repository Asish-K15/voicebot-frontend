/**
 * VoiceMode — Persistent ChatGPT-style Conversation with Voice Assistant
 *
 * Layout:
 *   Top:    CUTM AI branding + New Chat + Continuous toggle + Chat toggle
 *   Center: Holographic animated orb
 *           Status label (Listening / Speaking / etc.)
 *           Live transcription / audio waveforms
 *           Backend stage indicators
 *           Persistent scrollable conversation feed (all turns + thinking indicator)
 *   Bottom: Voice control buttons (Start/Stop Voice, Replay, New)
 *           Compact chat composer (text input + send)
 */

import { useRef, useEffect } from "react";
import { renderMarkdown } from "../utils/markdown.js";

// ─── Six Orb States ─────────────────────────────────────────────────────
const ORB_STATES = {
  IDLE:       { color: "#6366f1", label: "Hello! I'm CUTM AI",                 pulseSpeed: 3, scale: 0.7, rings: 1, particleCount: 12 },
  LISTENING:  { color: "#8b5cf6", label: "Listening...",                       pulseSpeed: 1.2, scale: 0.85, rings: 4, particleCount: 20 },
  UNDERSTAND: { color: "#06b6d4", label: "Understanding your question...",     pulseSpeed: 0.7, scale: 0.9, rings: 3, particleCount: 16 },
  SEARCH_KB:  { color: "#f59e0b", label: "Searching University Knowledge...",  pulseSpeed: 1.4, scale: 0.75, rings: 2, particleCount: 14 },
  SEARCH_WEB: { color: "#f97316", label: "Searching the Web...",               pulseSpeed: 1.2, scale: 0.75, rings: 2, particleCount: 14 },
  THINKING:   { color: "#eab308", label: "Thinking...",                        pulseSpeed: 0.5, scale: 0.95, rings: 4, particleCount: 18 },
  SPEAKING:   { color: "#22c55e", label: "Speaking...",                       pulseSpeed: 1.8, scale: 1.1, rings: 5, particleCount: 24 },
};

// ─── Holographic AI Orb ─────────────────────────────────────────────────
function AIOrb({ state, compact = false }) {
  const cfg = ORB_STATES[state] || ORB_STATES.IDLE;
  const baseScale = compact ? cfg.scale * 0.75 : cfg.scale;

  const particles = [];
  const count = compact ? 8 : (cfg.particleCount || 12);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 360;
    const radius = (compact ? 45 : 70) + Math.random() * (compact ? 20 : 40);
    const size = 2 + Math.random() * 2.5;
    const delay = Math.random() * 3;
    particles.push(
      <div
        key={i}
        className="ho-particle"
        style={{
          width: size,
          height: size,
          background: cfg.color,
          left: `calc(50% + ${Math.cos(angle * Math.PI / 180) * radius}px)`,
          top: `calc(50% + ${Math.sin(angle * Math.PI / 180) * radius}px)`,
          animationDelay: `${delay}s`,
          animationDuration: `${2 + Math.random() * 2}s`,
        }}
      />
    );
  }

  return (
    <div className={`ho-wrapper ${compact ? "compact" : ""}`} style={{ transform: `scale(${baseScale})` }}>
      {particles}

      {Array.from({ length: cfg.rings }).map((_, i) => (
        <div
          key={i}
          className="ho-ring"
          style={{
            borderColor: cfg.color,
            animationDuration: `${cfg.pulseSpeed * 1.5}s`,
            animationDelay: `${i * 0.25}s`,
            width: `${(compact ? 70 : 100) + (i + 1) * (compact ? 30 : 50)}px`,
            height: `${(compact ? 70 : 100) + (i + 1) * (compact ? 30 : 50)}px`,
            boxShadow: `0 0 ${10 + i * 8}px ${cfg.color}33`,
          }}
        />
      ))}

      <div
        className="ho-glow-outer"
        style={{
          background: `radial-gradient(circle, ${cfg.color}33 0%, ${cfg.color}11 40%, transparent 65%)`,
          animationDuration: `${cfg.pulseSpeed * 2}s`,
        }}
      />

      <div
        className="ho-glow-inner"
        style={{
          background: `radial-gradient(circle, ${cfg.color}55 0%, ${cfg.color}22 50%, transparent 70%)`,
          animationDuration: `${cfg.pulseSpeed}s`,
        }}
      />

      <div
        className="ho-core"
        style={{
          background: `radial-gradient(circle at 35% 30%, #ffffff, ${cfg.color} 50%, ${cfg.color}dd 80%, ${cfg.color}88)`,
          boxShadow: `0 0 30px ${cfg.color}88, 0 0 60px ${cfg.color}44, 0 0 100px ${cfg.color}22`,
          animationDuration: `${cfg.pulseSpeed}s`,
        }}
      >
        <div className="ho-highlight" />
      </div>
    </div>
  );
}

// ─── Status Steps ───────────────────────────────────────────────────────
const STATUS_STEPS = {
  UNDERSTAND: [
    { done: true, text: "Voice captured" },
    { active: true, text: "Understanding" },
  ],
  SEARCH_KB: [
    { done: true, text: "Intent detected" },
    { done: true, text: "Question understood" },
    { active: true, text: "Searching University Knowledge" },
  ],
  SEARCH_WEB: [
    { done: true, text: "Intent detected" },
    { done: true, text: "Local knowledge retrieved" },
    { active: true, text: "Searching the Web" },
  ],
  THINKING: [
    { done: true, text: "Knowledge retrieved" },
    { active: true, text: "Generating answer" },
  ],
  SPEAKING: [
    { done: true, text: "Knowledge retrieved" },
    { done: true, text: "Answer generated" },
    { active: true, text: "Speaking" },
  ],
};

function StatusSteps({ state }) {
  const steps = STATUS_STEPS[state] || [];
  if (steps.length === 0) return null;

  return (
    <div className="ho-steps">
      {steps.map((step, i) => (
        <div key={i} className={`ho-step ${step.done ? "done" : ""} ${step.active ? "active" : ""}`}>
          <span className="ho-step-icon">{step.done ? "✓" : "○"}</span>
          <span className="ho-step-text">{step.text}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Live Transcription ─────────────────────────────────────────────────
function LiveTranscription({ text }) {
  if (!text || text === "Tap mic to speak") return null;
  return (
    <div className="ho-live-transcript">
      <div className="ho-live-dots">
        {[1,2,3].map(i => <span key={i} className="ho-dot" style={{ animationDelay: `${i * 0.2}s` }} />)}
      </div>
      <p className="ho-live-text">{text}</p>
    </div>
  );
}

// ─── Voice Visualizer Bars ──────────────────────────────────────────────
function VoiceBars({ active, color }) {
  if (!active) return null;
  return (
    <div className="ho-bars">
      {[1,2,3,4,5,6,7,8,9,10].map(i => (
        <div key={i} className="ho-bar" style={{
          height: `${15 + Math.random() * 35}px`,
          animationDelay: `${i * 0.06}s`,
          background: color,
        }} />
      ))}
    </div>
  );
}

// ─── Persistent Conversation Feed ───────────────────────────────────────
function ConversationFeed({
  messages = [],
  activeTurn = null,
  isTyping = false,
  onReplayTurn,
  onRetry,
  onSuggestionClick,
}) {
  const endRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, activeTurn, isTyping]);

  // Check if activeTurn represents an in-flight question not yet reflected in messages
  const lastMessage = messages[messages.length - 1];
  const isPendingThinking = isTyping || activeTurn?.status === "thinking";

  return (
    <div className="vo-feed-container" ref={containerRef}>
      <div className="vo-feed-messages">
        {messages.map((msg, idx) => {
          const isUser = msg.role === "user";
          return (
            <div key={msg.id || idx} className={`vo-msg-bubble ${isUser ? "user" : "assistant"} ${msg.isError ? "error" : ""}`}>
              <div className="vo-msg-header">
                <span className="vo-msg-badge">{isUser ? "You" : "CUTM AI"}</span>
                {!isUser && !msg.isError && msg.text && onReplayTurn && (
                  <button
                    className="vo-msg-replay-btn"
                    type="button"
                    title="Replay this answer"
                    onClick={() => onReplayTurn(msg.speak || msg.text)}
                  >
                    🔊
                  </button>
                )}
              </div>

              <div className="vo-msg-body">
                {isUser ? (
                  <p className="vo-msg-text">{msg.text}</p>
                ) : msg.isError ? (
                  <div className="vo-msg-error-box">
                    <p className="vo-msg-text">{msg.text}</p>
                    {onRetry && (
                      <button
                        className="vo-msg-retry-btn"
                        type="button"
                        onClick={() => onRetry(msg.failedUserMsg || msg.text)}
                      >
                        🔄 Retry
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    className="vo-msg-markdown"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
                  />
                )}
              </div>

              {!isUser && Array.isArray(msg.quickActions) && msg.quickActions.length > 0 && (
                <div className="vo-quick-actions">
                  {msg.quickActions.map((qa, i) => (
                    <button
                      key={i}
                      className="vo-qa-chip"
                      type="button"
                      onClick={() => onSuggestionClick?.(qa)}
                    >
                      {qa}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Live Pending Turn Indicator */}
        {isPendingThinking && lastMessage?.role === "user" && (
          <div className="vo-msg-bubble assistant thinking">
            <div className="vo-msg-header">
              <span className="vo-msg-badge">CUTM AI</span>
            </div>
            <div className="vo-msg-body">
              <div className="ho-last-placeholder" aria-label="Thinking">
                <span className="ho-thinking-dot" />
                <span className="ho-thinking-dot" />
                <span className="ho-thinking-dot" />
                <span className="ho-thinking-text">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
}

// ─── Welcome Suggestions ─────────────────────────────────────────────────
const SUGGESTED_VOICE_PROMPTS = [
  { icon: "🎓", text: "What is the minimum attendance required at CUTM?" },
  { icon: "📝", text: "What are the BTech CSE eligibility criteria?" },
  { icon: "💰", text: "How much is the hostel fee?" },
  { icon: "💼", text: "What were the highest placement packages?" },
];

// ─── Main VoiceMode Component ───────────────────────────────────────────
export default function VoiceMode({
  orbState = "IDLE",
  onStartListening,
  onStopListening,
  isListening = false,
  isSpeaking = false,
  liveTranscript = "",
  messages = [],
  activeTurn = null,
  isTyping = false,
  continuousMode = false,
  onToggleContinuous,
  inputText = "",
  setInputText,
  onSendText,
  onReplay,
  onReplayTurn,
  onRetry,
  lastReply = "",
  onSwitchToChat,
  onResetSession,
  micError = null,
  onSuggestionClick,
}) {
  const effectiveOrbState = (orbState === "LISTENING" && !isListening) ? "IDLE" : orbState;
  const cfg = ORB_STATES[effectiveOrbState] || ORB_STATES.IDLE;

  const isInitialWelcome = messages.length === 0 && !activeTurn?.question && effectiveOrbState === "IDLE";
  const showBars = (isListening && effectiveOrbState === "LISTENING") || (isSpeaking && effectiveOrbState === "SPEAKING");
  const showSteps = effectiveOrbState === "UNDERSTAND" || effectiveOrbState === "SEARCH_KB" || effectiveOrbState === "SEARCH_WEB" || effectiveOrbState === "THINKING" || effectiveOrbState === "SPEAKING";

  const displayLabel = isListening
    ? "Listening..."
    : isSpeaking
      ? "Speaking..."
      : cfg.label;

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSendText();
    }
  };

  return (
    <div className="vo-container">
      {/* Background decorations */}
      <div className="vo-bg-wave" />
      <div className="vo-bg-wave vo-bg-wave-2" />
      <div className="vo-bg-dots" />

      {/* Top bar */}
      <div className="vo-topbar">
        <div className="vo-brand">
          <div className="vo-brand-icon">🎓</div>
          <div className="vo-brand-name">CUTM AI</div>
          <div className="vo-brand-subtitle">Voice Assistant</div>
        </div>
        <div className="vo-topbar-actions">
          {onResetSession && (
            <button className="vo-reset-btn" type="button" onClick={onResetSession} title="Start new conversation">
              🔄 New
            </button>
          )}
          <label className="vo-toggle-label" title="Continuous voice listening">
            <span className="vo-toggle-text">Continuous</span>
            <input type="checkbox" checked={continuousMode} onChange={onToggleContinuous} />
            <span className="vo-toggle-track"><span className="vo-toggle-thumb" /></span>
          </label>
          <button className="vo-chat-btn" type="button" onClick={onSwitchToChat} title="Switch to Full Chat View">
            💬 Chat
          </button>
        </div>
      </div>

      {/* Center area */}
      <div className="vo-center">
        {isInitialWelcome ? (
          <div className="vo-welcome">
            <div className="vo-welcome-icon">👋</div>
            <h2 className="vo-welcome-title">I'm CUTM AI</h2>
            <p className="vo-welcome-subtitle">Your University Voice & Conversation Assistant</p>

            {micError && (
              <div className="ho-error-banner" role="alert">
                <span className="ho-error-icon">⚠️</span>
                <span className="ho-error-text">{micError}</span>
              </div>
            )}

            <div className="vo-welcome-actions">
              <button className="vo-start-btn" type="button" onClick={onStartListening}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2" />
                </svg>
                Start Voice
              </button>
              <span className="vo-welcome-or">or</span>
              <span className="vo-welcome-type">Type below</span>
            </div>

            <div className="ho-suggestions">
              {SUGGESTED_VOICE_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  className="ho-suggestion-chip"
                  type="button"
                  onClick={() => onSuggestionClick ? onSuggestionClick(p.text) : onSendText(p.text)}
                >
                  <span className="ho-chip-icon">{p.icon}</span>
                  <span className="ho-chip-text">{p.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Top Compact Orb & Status */}
            <div className="vo-top-hero">
              <AIOrb state={effectiveOrbState} compact={messages.length > 0} />

              <div className="ho-status-label" style={{ color: cfg.color }}>
                {displayLabel}
              </div>

              {micError && (
                <div className="ho-error-banner" role="alert">
                  <span className="ho-error-icon">⚠️</span>
                  <span className="ho-error-text">{micError}</span>
                </div>
              )}

              {isListening && liveTranscript && liveTranscript !== "Tap mic to speak" && (
                <LiveTranscription text={liveTranscript} />
              )}

              {showBars && <VoiceBars active={true} color={cfg.color} />}
              {showSteps && <StatusSteps state={effectiveOrbState} />}
            </div>

            {/* Persistent Conversation Feed */}
            <ConversationFeed
              messages={messages}
              activeTurn={activeTurn}
              isTyping={isTyping}
              onReplayTurn={onReplayTurn}
              onRetry={onRetry}
              onSuggestionClick={onSuggestionClick}
            />
          </>
        )}
      </div>

      {/* Bottom area — Controls + Chat Composer */}
      <div className="vo-bottom">
        {!isInitialWelcome && (
          <div className="vo-controls">
            {isListening ? (
              <button className="vo-ctl-btn stop" type="button" onClick={onStopListening}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Stop Voice
              </button>
            ) : (
              <button className="vo-ctl-btn start" type="button" onClick={onStartListening}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2" />
                </svg>
                Start Voice
              </button>
            )}

            {lastReply && (
              <button className="vo-ctl-btn replay" type="button" onClick={onReplay} title="Replay last spoken answer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Replay
              </button>
            )}

            {onResetSession && (
              <button className="vo-ctl-btn reset" type="button" onClick={onResetSession} title="Start new conversation">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16" />
                  <path d="M3 21v-5h5" />
                </svg>
                New
              </button>
            )}
          </div>
        )}

        {/* Compact chat composer */}
        <div className="vo-composer">
          <input
            className="vo-composer-input"
            type="text"
            placeholder="Ask a question..."
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
          <button className="vo-composer-send" type="button" onClick={onSendText} disabled={!inputText.trim() || isTyping} aria-label="Send question">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}