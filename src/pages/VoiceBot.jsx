function getStoredGuestSessionId() {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage.getItem("cutm_guest_session_id") || null : null;
  } catch {
    return null;
  }
}

function setStoredGuestSessionId(id) {
  try {
    if (typeof sessionStorage !== "undefined") {
      if (id) {
        sessionStorage.setItem("cutm_guest_session_id", id);
      } else {
        sessionStorage.removeItem("cutm_guest_session_id");
      }
    }
  } catch {}
}

import { useEffect, useRef, useState, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "../App.css";
import VoiceMode from "../components/VoiceMode.jsx";
import { renderMarkdown } from "../utils/markdown.js";
export { renderMarkdown };

const API_BASE = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");
const CHAT_URL = API_BASE ? `${API_BASE}/chat` : "/chat";
const CONVERSATIONS_URL = API_BASE ? `${API_BASE}/api/chat/conversations` : "/api/chat/conversations";
const PROFILE_URL = API_BASE ? `${API_BASE}/api/user/profile` : "/api/user/profile";

const SUGGESTED_PROMPTS = [
  { label: "Admissions", text: "Help me get admission" },
  { label: "Courses", text: "Tell me about courses" },
  { label: "Fees", text: "What are the fees?" },
  { label: "Hostel", text: "Tell me about hostel" },
  { label: "Placements", text: "Tell me about placements" },
  { label: "Contact", text: "Contact information" },
  { label: "Events", text: "Upcoming events" },
  { label: "Ask Anything", text: "What can you do?" },
];

const FOLLOW_UP_SUGGESTIONS = {
  admissions: ["BTech CSE", "MBA", "BSc", "Diploma", "Eligibility"],
  fees: ["BTech Fees", "MBA Fees", "Hostel Fees", "Scholarships", "Payment"],
  courses: ["CSE", "AI/ML", "MBA", "BBA", "Diploma"],
  hostel: ["Facilities", "Fees", "Rules", "Application"],
  placements: ["Highest Package", "Average Package", "Top Recruiters", "Training"],
  contact: ["Phone", "Email", "Address", "Helpline"],
  general: ["Admissions", "Fees", "Courses", "Hostel", "Placements"],
};

// ─── Helpers ─────────────────────────────────────────────────────────────
function getSpeechRecognition() { return window.SpeechRecognition || window.webkitSpeechRecognition || null; }

function formatDate(value) { if (!value) return "-"; return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }

function formatDateTime(value) { if (!value) return "-"; return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }

function getStoredUser() { try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; } }

function getMessageId() { if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID(); return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function getDayGroup(dateValue) {
  const date = new Date(dateValue);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  const key = (d) => d.toDateString();
  if (key(date) === key(today)) return "Today";
  if (key(date) === key(yesterday)) return "Yesterday";
  return "Previous";
}

function normalizeMessage(msg) {
  const role = msg.role ? msg.role : msg.sender === "bot" ? "assistant" : "user";
  const stableId = msg?.id ?? (msg?._id ? String(msg._id) : undefined);
  return { id: stableId ?? getMessageId(), role, sender: msg.sender || (role === "assistant" ? "bot" : "user"), text: msg.text || "", speak: msg.speak || msg.text || "", intent: msg.intent || "GENERAL_CHAT", quickActions: Array.isArray(msg.quickActions) ? msg.quickActions : [], buttons: Array.isArray(msg.buttons) ? msg.buttons : [], map: msg.map ?? null, links: Array.isArray(msg.links) ? msg.links : [], metadata: msg.metadata ?? {}, conversationState: msg.conversationState ?? {} };
}

function createUserMessage(text) { return normalizeMessage({ role: "user", text }); }

function createAssistantMessage({ text, speak, intent, quickActions, buttons, map, links, metadata, conversationState }) { return normalizeMessage({ role: "assistant", text, speak, intent, quickActions, buttons, map, links, metadata, conversationState }); }

// Markdown rendering handled by utils/markdown.js

// ─── Rich Cards (from backend metadata only) ──────────────────────────
function RichCardRenderer({ card }) {
  if (!card) return null;
  const d = card.data || {};

  if (card.type === "fee") {
    const rows = Object.entries(d);
    return rows.length > 0 ? (
      <div className="rich-card fee-card">
        <div className="rich-card-title">{card.title}</div>
        <div className="rich-card-body">{rows.map(([k, v]) => <div key={k} className="fee-row"><span className="fee-campus">{k}</span><span className="fee-amount">{v}</span></div>)}</div>
      </div>
    ) : null;
  }

  if (card.type === "contact") {
    const entries = Object.entries(d).slice(0, 6);
    return entries.length > 0 ? (
      <div className="rich-card contact-card">
        <div className="rich-card-title">{card.title}</div>
        <div className="rich-card-body">{entries.map(([k, v]) => <div key={k} className="contact-row">{v}</div>)}</div>
      </div>
    ) : null;
  }

  if (card.type === "placement") {
    return (
      <div className="rich-card placement-card">
        <div className="rich-card-title">{card.title}</div>
        <div className="rich-card-body">
          <div className="placement-grid">
            <div className="placement-stat"><span className="stat-value">{d.highestPackage}</span><span className="stat-label">Highest</span></div>
            <div className="placement-stat"><span className="stat-value">{d.averagePackage}</span><span className="stat-label">Average</span></div>
            <div className="placement-stat"><span className="stat-value">{d.placementRate}</span><span className="stat-label">Rate</span></div>
            <div className="placement-stat"><span className="stat-value">{d.totalRecruiters}</span><span className="stat-label">Recruiters</span></div>
          </div>
          <p className="placement-summary">{d.summary}</p>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Rich Card detection from message metadata ─────────────────────────
function getRichCard(text) {
  if (!text) return null;
  // Cards come from backend metadata, not text.
  // This function detects if a message contains card-worthy content
  // by checking for markdown patterns that indicate structured data.
  // Currently unused placeholder for future backend-driven cards.
  return null;
}

// ─── Smart Follow-up Suggestions ─────────────────────────────────────────
function getFollowUpSuggestions(text, intent) {
  const q = (text || "").toLowerCase();
  
  if (intent === "ADMISSION" || intent === "admission" || /\b(admission|apply|cuee)\b/.test(q))
    return FOLLOW_UP_SUGGESTIONS.admissions;
  if (/\b(fee|fees|tuition|cost|payment)\b/.test(q))
    return FOLLOW_UP_SUGGESTIONS.fees;
  if (/\b(course|program|subject|syllabus|btech|mba|bsc|bca|bba)\b/.test(q))
    return FOLLOW_UP_SUGGESTIONS.courses;
  if (/\b(hostel|accommodation|room)\b/.test(q))
    return FOLLOW_UP_SUGGESTIONS.hostel;
  if (/\b(placement|job|recruiter|package|hire)\b/.test(q))
    return FOLLOW_UP_SUGGESTIONS.placements;
  if (/\b(contact|phone|email|helpline|call)\b/.test(q))
    return FOLLOW_UP_SUGGESTIONS.contact;
  return FOLLOW_UP_SUGGESTIONS.general;
}

// ─── ChatMessage Component (memoized) ────────────────────────────────────
const ChatMessage = memo(function ChatMessage({ msg, expandedMapId, setExpandedMapId, onSuggestionClick }) {
  const isUser = msg.role === "user";
  const isBot = !isUser;
  const showMap = isBot && (msg.intent === "NAVIGATION" || msg.intent === "navigation") && msg.map;
  const followUps = isBot ? getFollowUpSuggestions(msg.text, msg.intent) : [];

  const richCard = isBot ? getRichCard(msg.text) : null;

  return (
    <div className={`chat-message ${isUser ? "user" : "assistant"}`}>
      <div className="message-avatar">
        {isUser ? <div className="user-avatar">U</div> : (
          <div className="bot-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" />
            </svg>
          </div>
        )}
      </div>
      <div className={`message-content ${isUser ? "user" : "assistant"}`}>
        <div className={`message-bubble ${isUser ? "user" : "assistant"}`}>
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }} />
          {richCard && <RichCardRenderer card={richCard} />}
        </div>
        {showMap && (
          <div className="map-actions">
            <button className="map-btn" type="button" onClick={() => setExpandedMapId(expandedMapId === msg.id ? null : msg.id)}>
              📍 {expandedMapId === msg.id ? "Hide Map" : "View Map"}
            </button>
            {expandedMapId === msg.id && msg.map?.query && (
              <div className="map-embed">
                <iframe title="Campus Map" src={`https://maps.google.com/maps?q=${encodeURIComponent(msg.map.query)}&output=embed`} width="100%" height="200" loading="lazy" style={{ border: 0, borderRadius: 12 }} />
              </div>
            )}
          </div>
        )}
        {followUps.length > 0 && (
          <div className="follow-up-chips">
            {followUps.map((chip, i) => (
              <button key={i} className="follow-up-chip" type="button" onClick={() => onSuggestionClick?.(chip)}>{chip}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

// ─── TypingIndicator ─────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="chat-message assistant">
      <div className="message-avatar">
        <div className="bot-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" />
          </svg>
        </div>
      </div>
      <div className="message-content assistant">
        <div className="typing-indicator">
          <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
        </div>
      </div>
    </div>
  );
}

// ─── VoiceVisualizer ─────────────────────────────────────────────────────
function VoiceVisualizer({ active, type }) {
  if (!active) return null;
  return (
    <div className={`voice-visualizer ${type}`}>
      {[1,2,3,4,5].map(i => <div key={i} className="voice-bar" style={{ animationDelay: `${i * 0.1}s` }} />)}
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────
function Sidebar({ conversations, activeConversationId, isLoggedIn, profile, collapsed, onToggleCollapse, onNewChat, onSelectChat, onRenameChat, onDeleteChat, onProfile, onLogout, navigate }) {
  const [menuOpenId, setMenuOpenId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [renamingId, setRenamingId] = useState("");
  const [renameText, setRenameText] = useState("");

  const sorted = [...conversations].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const filtered = sorted.filter(c => (c.title || "").toLowerCase().includes(searchTerm.toLowerCase()));
  
  const groups = { Today: [], Yesterday: [], Previous: [] };
  filtered.forEach(c => { const g = getDayGroup(c.updatedAt); if (groups[g]) groups[g].push(c); });

  const handleRename = (chat) => {
    setRenamingId(chat._id);
    setRenameText(chat.title || "");
    setMenuOpenId("");
  };

  const submitRename = async (id) => {
    if (renameText.trim()) await onRenameChat({ _id: id, title: renameText.trim() });
    setRenamingId("");
  };

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        <button className="sidebar-toggle" type="button" onClick={onToggleCollapse}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {collapsed ? <path d="M9 18l6-6-6-6" /> : <path d="M15 18l-6-6 6-6" />}
          </svg>
        </button>
        {!collapsed && <button className="new-chat-btn" type="button" onClick={onNewChat}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          New Chat
        </button>}
      </div>
      {!collapsed && (
        <>
          <div className="sidebar-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="search-icon"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" placeholder="Search conversations..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="sidebar-conversations">
            {Object.entries(groups).map(([label, items]) => items.length > 0 && (
              <div key={label} className="sidebar-group">
                <div className="sidebar-group-label">{label}</div>
                {items.map(c => (
                  <div key={c._id} className={`sidebar-chat-item ${activeConversationId === c._id ? "active" : ""}`}>
                    {renamingId === c._id ? (
                      <div className="chat-rename-input">
                        <input type="text" value={renameText} onChange={e => setRenameText(e.target.value)} onKeyDown={e => e.key === "Enter" && submitRename(c._id)} autoFocus onBlur={() => submitRename(c._id)} />
                      </div>
                    ) : (
                      <button className="chat-item-btn" type="button" onClick={() => onSelectChat(c._id)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                        <span className="chat-item-title">{c.title || "New Chat"}</span>
                      </button>
                    )}
                    <div className="chat-item-actions">
                      <button className="chat-item-menu-btn" type="button" onClick={() => setMenuOpenId(menuOpenId === c._id ? "" : c._id)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
                      </button>
                      {menuOpenId === c._id && (
                        <div className="chat-item-menu">
                          <button type="button" onClick={() => { handleRename(c); }}>✏️ Rename</button>
                          <button type="button" onClick={() => { onDeleteChat(c._id); setMenuOpenId(""); }} className="danger">🗑️ Delete</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {filtered.length === 0 && <div className="sidebar-empty">{searchTerm ? "No matching chats" : "No conversations yet"}</div>}
          </div>
          <div className="sidebar-footer">
            <button className="sidebar-profile-btn" type="button" onClick={onProfile}>
              <div className="profile-mini-avatar">{(isLoggedIn ? profile.name || "U" : "G").charAt(0).toUpperCase()}</div>
              <div className="profile-mini-info">
                <span className="profile-mini-name">{isLoggedIn ? profile.name || "User" : "Guest"}</span>
                <span className="profile-mini-email">{isLoggedIn ? profile.email || "" : "Sign in"}</span>
              </div>
            </button>
            {isLoggedIn ? (
              <button className="logout-btn" type="button" onClick={onLogout}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              </button>
            ) : (
              <button className="login-btn" type="button" onClick={() => navigate("/login")}>Sign In</button>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

// ─── Main VoiceBot Component ─────────────────────────────────────────────

export default function VoiceBot() {
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [activePage, setActivePage] = useState("home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profile, setProfile] = useState(getStoredUser());
  const [inputText, setInputText] = useState("");
  const [liveText, setLiveText] = useState("Tap mic to speak");
  const [activity, setActivity] = useState("Ready");
  const [isTyping, setIsTyping] = useState(false);
  const [expandedMapId, setExpandedMapId] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceType, setVoiceType] = useState(localStorage.getItem("voiceType") || "male");
  const [autoSpeak, setAutoSpeak] = useState(localStorage.getItem("autoSpeak") ? localStorage.getItem("autoSpeak") === "true" : true);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastReply, setLastReply] = useState("");
  const [errorState, setErrorState] = useState(null);
  const [micError, setMicError] = useState(null);

  const [voiceMode, setVoiceMode] = useState(() => {
    const saved = localStorage.getItem("voiceMode");
    return saved !== null ? saved === "true" : true;
  });
  const [orbState, setOrbState] = useState("IDLE");
  const [continuousVoice, setContinuousVoice] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [internetEnabled, setInternetEnabled] = useState(true);
  const [voiceSpeed, setVoiceSpeed] = useState(1.1);
  const [personality, setPersonality] = useState("Friendly");
  const [themeMode, setThemeMode] = useState("Dark");
  const [quickActions, setQuickActions] = useState([]);

  const finalTranscript = useRef("");
  const interimTranscript = useRef("");
  const recognitionRef = useRef(null);
  const chatRef = useRef(null);
  const messagesEndRef = useRef(null);
  const pendingAutoScrollRef = useRef(false);
  const inputRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const isSpeakingRef = useRef(false);
  const utteranceRef = useRef(null);
  const isManualStopRef = useRef(false);
  const activeSessionIdRef = useRef(0);
  const guestSessionIdRef = useRef(getStoredGuestSessionId());
  // Guard against stale async responses overwriting a newer active turn
  const activeTurnSeqRef = useRef(0);

  // ─── Active-turn card state (voice mode live card) ──────────────────────
  // question: the recognized/typed query for the current turn
  // answer:   null while thinking, string once the backend replies
  // status:   'idle' | 'thinking' | 'speaking'
  const [activeTurn, setActiveTurn] = useState({ question: null, answer: null, status: 'idle' });

  const token = localStorage.getItem("token");
  const isLoggedIn = !!token;
  const authToken = token || "";
  const authHeaders = isLoggedIn ? { Authorization: `Bearer ${authToken}` } : {};
  const navigate = useNavigate();

  // Expose askAI for external scripts/testing
  useEffect(() => { window.__askAI = askAI; return () => { delete window.__askAI; }; }, [messages, isTyping, activeConversationId]);

  useEffect(() => { if (authToken) { loadProfile(); loadConversations(); } }, [authToken]);

  async function loadProfile() {
    try { const res = await axios.get(PROFILE_URL, { headers: authHeaders }); setProfile(res.data); localStorage.setItem("user", JSON.stringify({ id: res.data._id, name: res.data.name, email: res.data.email })); } catch (err) { console.error(err); }
  }

  async function loadConversations() {
    try { const res = await axios.get(CONVERSATIONS_URL, { headers: authHeaders }); setConversations(res.data); } catch (err) { console.error(err); }
  }

  // ─── Centralized Audio Cleanup ──────────────────────────────────────────
  const stopAudio = useCallback(() => {
    isManualStopRef.current = true;
    activeSessionIdRef.current++;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }

    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }

    isSpeakingRef.current = false;
    utteranceRef.current = null;
    setIsListening(false);
    setIsSpeaking(false);
    setOrbState("IDLE");
    setActivity("Ready");
    setLiveText("Tap mic to speak");
    setActiveTurn({ question: null, answer: null, status: 'idle' });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  const startNewChat = useCallback(() => {
    stopAudio();
    setMessages([]);
    setQuickActions([]);
    setErrorState(null);
    setMicError(null);
    setLastReply("");
    pendingAutoScrollRef.current = true;
    setActiveConversationId("");
    guestSessionIdRef.current = null;
    setStoredGuestSessionId(null);
    setInputText("");
    setLiveText("Tap mic to speak");
    setActivity("Ready");
    setOrbState("IDLE");
    setIsTyping(false);
    setActiveTurn({ question: null, answer: null, status: 'idle' });
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [stopAudio]);

  const confirmAndStartNewChat = useCallback(() => {
    if (messages.length > 0) {
      if (typeof window !== "undefined" && !window.confirm("Start a new chat? This will begin a fresh conversation.")) {
        return;
      }
    }
    startNewChat();
  }, [messages.length, startNewChat]);

  const resetSession = useCallback(() => {
    stopAudio();
    setMessages([]);
    setQuickActions([]);
    guestSessionIdRef.current = null;
    setStoredGuestSessionId(null);
    setErrorState(null);
    setMicError(null);
    setLastReply("");
    pendingAutoScrollRef.current = true;
    setActiveConversationId("");
    setInputText("");
    setLiveText("Tap mic to speak");
    setActivity("Ready");
    setOrbState("IDLE");
    setIsTyping(false);
    setActiveTurn({ question: null, answer: null, status: 'idle' });
    if (isLoggedIn) {
      loadConversations();
    }
  }, [stopAudio, isLoggedIn]);

  const confirmAndResetSession = useCallback(() => {
    if (messages.length > 0) {
      if (typeof window !== "undefined" && !window.confirm("Start a new chat? This will begin a fresh conversation.")) {
        return;
      }
    }
    resetSession();
  }, [messages.length, resetSession]);

  async function loadConversation(conversationId) {
    try {
      stopAudio();
      const res = await axios.get(`${CONVERSATIONS_URL}/${conversationId}`, { headers: authHeaders });
      setQuickActions([]); setErrorState(null);
      pendingAutoScrollRef.current = true;
      setMessages((res.data.messages || []).map(normalizeMessage));
      setActiveConversationId(res.data._id);
      setLiveText("Continue this chat"); setActivity("Ready");
      setActivePage("chat");
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch (err) { console.error(err); }
  }

  async function renameConversation(conversation) {
    try {
      const res = await axios.patch(`${CONVERSATIONS_URL}/${conversation._id}`, { title: conversation.title }, { headers: authHeaders });
      setConversations(prev => prev.map(item => item._id === res.data._id ? { ...item, ...res.data } : item));
    } catch (err) { console.error(err); }
  }

  async function deleteConversation(conversationId) {
    try {
      await axios.delete(`${CONVERSATIONS_URL}/${conversationId}`, { headers: authHeaders });
      setConversations(prev => prev.filter(item => item._id !== conversationId));
      if (activeConversationId === conversationId) startNewChat();
      loadProfile();
    } catch (err) { console.error(err); }
  }

  const handleLogout = () => { stopAudio(); guestSessionIdRef.current = null; setStoredGuestSessionId(null); localStorage.removeItem("token"); localStorage.removeItem("user"); window.location.href = "/"; };

  const scrollToBottom = useCallback(() => {
    if (isAtBottomRef.current || pendingAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      pendingAutoScrollRef.current = false;
    }
  }, []);

  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 80;
    if (isAtBottomRef.current || pendingAutoScrollRef.current) scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => { if (activeConversationId) { pendingAutoScrollRef.current = true; scrollToBottom(); } }, [activeConversationId, scrollToBottom]);

  // ─── Speech Synthesis (TTS) ─────────────────────────────────────────────
  const speak = useCallback((text, onComplete) => {
    if (!voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
      setActivity("Ready");
      setOrbState("IDLE");
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      onComplete?.();
      return;
    }

    try {
      window.speechSynthesis.cancel();
    } catch (e) {}

    const speech = new SpeechSynthesisUtterance(text);
    try {
      const voices = window.speechSynthesis.getVoices();
      if (Array.isArray(voices) && voices.length && voiceType === "female") {
        const fv = voices.find(v => v.name?.toLowerCase().includes("female") || v.name?.toLowerCase().includes("zira"));
        if (fv) speech.voice = fv;
      }
    } catch (e) {}

    utteranceRef.current = speech;
    isSpeakingRef.current = true;
    setIsSpeaking(true);
    setOrbState("SPEAKING");
    setActivity("Speaking");
    speech.lang = "en-IN";
    speech.rate = voiceSpeed;

    speech.onstart = () => {
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      setOrbState("SPEAKING");
      setActivity("Speaking");
    };

    speech.onend = () => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      utteranceRef.current = null;
      setActivity("Ready");
      if (onComplete) {
        onComplete();
      } else {
        setOrbState("IDLE");
      }
    };

    speech.onerror = () => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      utteranceRef.current = null;
      setActivity("Ready");
      setOrbState("IDLE");
      onComplete?.();
    };

    try {
      window.speechSynthesis.speak(speech);
    } catch (e) {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      setOrbState("IDLE");
      setActivity("Ready");
      onComplete?.();
    }
  }, [voiceEnabled, voiceType, voiceSpeed]);

  // ─── Unified askAI Pipeline ─────────────────────────────────────────────
  const askAI = useCallback(async (message, options = {}) => {
    const userMsg = (message ?? inputText ?? "").trim();
    if (!userMsg || isTyping) return;
    setErrorState(null);
    setMicError(null);

    const isVoiceCall = options.isVoice ?? false;
    const isRetry = options.isRetry ?? false;

    // Claim a new sequence slot — any in-flight response with an older seq is discarded
    const turnSeq = ++activeTurnSeqRef.current;

    // Immediately update the live active-turn card with the new question
    setActiveTurn({ question: userMsg, answer: null, status: 'thinking' });

    // Visual feedback transition
    if (voiceMode || isVoiceCall) {
      setOrbState("UNDERSTAND");
      setActivity("Understanding");
      setLiveText(`"${userMsg}"`);
    }

    pendingAutoScrollRef.current = true;
    if (!isRetry) {
      setMessages(prev => [...prev, createUserMessage(userMsg)]);
    }
    setInputText("");
    if (!isVoiceCall) {
      setLiveText("Thinking...");
      setActivity("Thinking");
    }
    setIsTyping(true);

    try {
      if (voiceMode || isVoiceCall) {
        setOrbState("SEARCH_KB");
        setActivity("Searching");
        // Auto-advance to THINKING after 2 s so the UI doesn't appear frozen
        // during long LLM calls (Groq rate limit → Gemini fallback can take 10–30 s)
        const thinkTimer = setTimeout(() => {
          setOrbState(prev => prev === "SEARCH_KB" ? "THINKING" : prev);
          setActivity(prev => prev === "Searching" ? "Thinking" : prev);
        }, 2000);
        // Store timer ref so it can be cleared if response arrives early
        askAI._thinkTimer = thinkTimer;
      }

      const guestSessionId = !isLoggedIn ? (guestSessionIdRef.current || getStoredGuestSessionId()) : null;

      const res = await axios.post(CHAT_URL, {
        message: userMsg,
        conversationId: activeConversationId,
        ...(isLoggedIn ? {} : {
          messages: messages.filter(m => m && (m.role === "user" || m.role === "assistant")).slice(-8).map(m => ({ role: m.role, content: m.text })),
          ...(guestSessionId ? { guestSessionId } : {}),
        }),
        options: { memoryEnabled, internetEnabled, personality, voiceMode: isVoiceCall },
      }, {
        headers: {
          ...authHeaders,
          ...(guestSessionId ? { "x-guest-session-id": guestSessionId } : {}),
        },
      });

      if (!isLoggedIn && res.data?.guestSessionId) {
        guestSessionIdRef.current = res.data.guestSessionId;
        setStoredGuestSessionId(res.data.guestSessionId);
      }

      // Clear the think timer if still pending (response arrived before 2 s)
      if (askAI._thinkTimer) { clearTimeout(askAI._thinkTimer); askAI._thinkTimer = null; }

      if (voiceMode || isVoiceCall) {
        setOrbState("THINKING");
      }

      const conversation = res.data.conversation;
      const structured = res.data?.structured;
      const botText = structured?.text ?? res.data.reply ?? "No reply received.";
      const botSpeak = structured?.speak ?? botText;
      const intent = structured?.intent ?? "GENERAL_CHAT";

      if (conversation?._id) {
        setActiveConversationId(conversation._id);
        pendingAutoScrollRef.current = true;
        setMessages((conversation.messages || []).map(normalizeMessage));
        setQuickActions((intent === "ADMISSION" || intent === "admission") && Array.isArray(structured?.quickActions) ? structured.quickActions.slice(0, 4) : []);
      } else {
        pendingAutoScrollRef.current = true;
        setMessages(prev => [...prev, createAssistantMessage({
          text: botText,
          speak: botSpeak,
          intent,
          quickActions: structured?.quickActions,
          buttons: structured?.buttons,
          map: structured?.map,
          links: structured?.links,
          metadata: structured?.metadata,
          conversationState: structured?.conversationState,
        })]);
      }

      setLastReply(botSpeak);
      setIsTyping(false);
      setLiveText("Tap mic to speak");

      // Only update activeTurn if this response belongs to the latest turn (stale-response guard)
      if (turnSeq === activeTurnSeqRef.current) {
        setActiveTurn({ question: userMsg, answer: botText, status: 'speaking' });
      }

      const shouldSpeak = autoSpeak || isVoiceCall;
      if (shouldSpeak && voiceEnabled) {
        speak(botSpeak, () => {
          if (turnSeq === activeTurnSeqRef.current) {
            setActiveTurn(prev => prev.question === userMsg ? { ...prev, status: 'idle' } : prev);
          }
          if (continuousVoice && (voiceMode || isVoiceCall) && !isManualStopRef.current) {
            startListening();
          } else {
            setOrbState("IDLE");
            setActivity("Ready");
          }
        });
      } else {
        setOrbState("IDLE");
        setActivity("Ready");
        if (continuousVoice && (voiceMode || isVoiceCall) && !isManualStopRef.current) {
          startListening();
        }
      }

      if (isLoggedIn) {
        loadConversations();
        loadProfile();
      }
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch (err) {
      // Clear the auto-advance timer if request failed
      if (askAI._thinkTimer) { clearTimeout(askAI._thinkTimer); askAI._thinkTimer = null; }
      setIsTyping(false);
      const errorText = err?.response?.data?.reply || "Sorry, the service is temporarily unavailable. Please try again later.";
      setErrorState(errorText);
      setMessages(prev => [...prev, createAssistantMessage({
        text: errorText,
        isError: true,
        failedUserMsg: userMsg,
      })]);
      // Clear the active-turn card on failure so stale question isn't left with empty answer
      if (turnSeq === activeTurnSeqRef.current) {
        setActiveTurn({ question: null, answer: null, status: 'idle' });
      }
      setOrbState("IDLE");
      setActivity("Ready");
      setLiveText("Tap mic to speak");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [messages, isTyping, inputText, activeConversationId, isLoggedIn, authHeaders, memoryEnabled, internetEnabled, personality, voiceEnabled, autoSpeak, continuousVoice, voiceMode, speak]);

  // ─── Speech Recognition Lifecycle ───────────────────────────────────────
  const startListening = useCallback(() => {
    stopAudio();
    setMicError(null);

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      const msg = "Voice recognition is not supported in this browser. Please use Chrome, Edge, or Safari.";
      setMicError(msg);
      setLiveText(msg);
      setActivity("Error");
      setOrbState("IDLE");
      setIsListening(false);
      return;
    }

    isManualStopRef.current = false;
    const sessionId = ++activeSessionIdRef.current;
    // Silence watchdog: if recognition ends with no final speech in 8 s,
    // show a gentle prompt instead of silently resetting.
    const silenceWatchdog = setTimeout(() => {
      if (activeSessionIdRef.current === sessionId && !finalTranscript.current.trim()) {
        setLiveText("No speech heard. Tap Start Voice to try again.");
        setActivity("Ready");
      }
    }, 8000);
    finalTranscript.current = "";
    interimTranscript.current = "";

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-IN";

      recognition.onstart = () => {
        if (activeSessionIdRef.current !== sessionId) return;
        setIsListening(true);
        setOrbState("LISTENING");
        setActivity("Listening");
        setLiveText("Listening...");
        setMicError(null);
      };

      recognition.onresult = (event) => {
        if (activeSessionIdRef.current !== sessionId) return;
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript.current += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        interimTranscript.current = interim;
        const currentText = (finalTranscript.current + " " + interim).trim();
        setLiveText(currentText || "Listening...");
      };

      recognition.onerror = (event) => {
        clearTimeout(silenceWatchdog);
        if (activeSessionIdRef.current !== sessionId) return;
        setIsListening(false);
        setOrbState("IDLE");

        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          const msg = "Microphone access was denied. Please allow microphone permissions in your browser.";
          setMicError(msg);
          setLiveText(msg);
          setActivity("Error");
        } else if (event.error === "no-speech") {
          setLiveText("No speech detected. Tap Start Voice to speak.");
          setActivity("Ready");
        } else if (event.error === "aborted") {
          setActivity("Ready");
          setLiveText("Tap mic to speak");
        } else {
          const msg = `Voice error: ${event.error}`;
          setMicError(msg);
          setLiveText(msg);
          setActivity("Error");
        }
      };

      recognition.onend = () => {
        clearTimeout(silenceWatchdog);
        if (activeSessionIdRef.current !== sessionId) return;
        setIsListening(false);

        if (isManualStopRef.current) {
          setActivity("Ready");
          setLiveText("Tap mic to speak");
          setOrbState("IDLE");
          return;
        }

        const userMsg = (finalTranscript.current + " " + interimTranscript.current).trim();
        finalTranscript.current = "";
        interimTranscript.current = "";

        if (!userMsg) {
          setActivity("Ready");
          setLiveText("Tap mic to speak");
          setOrbState("IDLE");
          return;
        }

        askAI(userMsg, { isVoice: true });
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error("Speech recognition startup error:", err);
      setIsListening(false);
      setOrbState("IDLE");
      setActivity("Error");
      setMicError("Failed to start voice recognition. Please try again.");
    }
  }, [askAI, stopAudio]);

  const replayLast = () => { if (lastReply) speak(lastReply); };

  const handleReplayTurn = useCallback((text) => {
    if (text) speak(text);
  }, [speak]);

  const handleRetry = useCallback((failedUserMsg) => {
    setMessages(prev => prev.filter(m => !m.isError));
    askAI(failedUserMsg, { isRetry: true });
  }, [askAI]);

  function handleInputKeyDown(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askAI(); } }

  useEffect(() => { if (activePage === "chat") inputRef.current?.focus(); }, [activePage]);

  const handleSuggestionClick = useCallback((text) => { setInputText(text); setTimeout(() => askAI(text), 50); }, [askAI]);

  const handleSwitchToChat = useCallback(() => {
    setVoiceMode(false);
    localStorage.setItem("voiceMode", "false");
    setActivePage("chat");
  }, []);

  const handleSwitchToVoice = useCallback(() => {
    setVoiceMode(true);
    localStorage.setItem("voiceMode", "true");
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────
  if (voiceMode) {
    return (
      <div className="app">
        <VoiceMode
          orbState={orbState}
          onStartListening={startListening}
          onStopListening={stopAudio}
          isListening={isListening}
          isSpeaking={isSpeaking}
          liveTranscript={liveText}
          messages={messages}
          activeTurn={activeTurn}
          isTyping={isTyping}
          continuousMode={continuousVoice}
          onToggleContinuous={() => setContinuousVoice(!continuousVoice)}
          inputText={inputText}
          setInputText={setInputText}
          onSendText={() => askAI(inputText)}
          onReplay={replayLast}
          onReplayTurn={handleReplayTurn}
          onRetry={handleRetry}
          lastReply={lastReply}
          onSwitchToChat={handleSwitchToChat}
          onResetSession={confirmAndResetSession}
          micError={micError}
          onSuggestionClick={handleSuggestionClick}
        />
      </div>
    );
  }

  return (
    <div className={`app ${themeMode === "Light" ? "light-mode" : ""}`}>
      <div className="app-layout">
        <Sidebar conversations={conversations} activeConversationId={activeConversationId} isLoggedIn={isLoggedIn} profile={profile}
          collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)} onNewChat={confirmAndStartNewChat}
          onSelectChat={loadConversation} onRenameChat={renameConversation} onDeleteChat={deleteConversation}
          onProfile={() => setActivePage("profile")} onLogout={handleLogout} navigate={navigate} />

        <main className="main-content">
          {activePage === "home" && (
            <div className="welcome-screen">
              <div className="welcome-header">
                <div className="welcome-logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32"><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /></svg></div>
                <h1 className="welcome-title"><span className="gradient-text">VoiceBot</span> AI</h1>
                <p className="welcome-subtitle">Your AI assistant for Centurion University</p>
              </div>
              <div className="welcome-suggestions">
                {SUGGESTED_PROMPTS.filter((_, i) => i < 8).map(p => (
                  <button key={p.label} className="suggestion-chip" type="button" onClick={() => askAI(p.text)}>{p.label}</button>
                ))}
              </div>
              {isLoggedIn && conversations.length > 0 && (
                <div className="recent-chats">
                  <div className="recent-chats-title">Recent conversations</div>
                  {[...conversations].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 5).map(c => (
                    <button key={c._id} className="recent-chat-item" type="button" onClick={() => loadConversation(c._id)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                      <span>{c.title || "New Chat"}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="welcome-footer">
                {isLoggedIn ? <span>Signed in as {profile.name || "User"}</span> : <button className="text-link" type="button" onClick={() => navigate("/login")}>Sign in to save conversations</button>}
              </div>
            </div>
          )}

          {activePage === "chat" && (
            <div className="chat-interface">
              <div className="chat-messages-area" ref={chatRef}>
                {messages.length === 0 && !isTyping && (
                  <div className="chat-empty">
                    <div className="chat-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="40" height="40"><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /></svg></div>
                    <p>Ask me anything about Centurion University</p>
                    <div className="chat-empty-chips">
                      {SUGGESTED_PROMPTS.filter((_, i) => i < 4).map(p => (
                        <button key={p.label} className="suggestion-chip small" type="button" onClick={() => askAI(p.text)}>{p.label}</button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <ChatMessage key={msg.id || i} msg={msg} expandedMapId={expandedMapId} setExpandedMapId={setExpandedMapId} onSuggestionClick={handleSuggestionClick} />
                ))}
                {isTyping && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </div>

              <div className="input-area">
                <div className="voice-status-bar">
                  {(isListening || isSpeaking) && <VoiceVisualizer active={true} type={isListening ? "listening" : "speaking"} />}
                  {activity !== "Ready" && <div className="activity-status">{activity === "Listening" ? "🎤 Listening..." : activity === "Speaking" ? "🔊 Speaking..." : activity}</div>}
                </div>
                <div className="input-wrapper">
                  <button className="input-action-btn attachment-btn" type="button" title="Attach file"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg></button>
                  <input ref={inputRef} className="chat-input-field" type="text" placeholder="Ask a question..." value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={handleInputKeyDown} autoComplete="off" />
                  {lastReply && <button className="input-action-btn replay-btn" type="button" onClick={replayLast} title="Replay last answer"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg></button>}
                  <button className={`input-action-btn voice-btn ${isListening ? "active" : ""}`} type="button" onClick={isListening ? stopAudio : startListening} title={isListening ? "Stop" : "Voice input"}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </button>
                  <button className={`input-action-btn vm-toggle-btn ${voiceMode ? "active" : ""}`} type="button" onClick={handleSwitchToVoice} title="Switch to Voice Mode">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                      <path d="M19 10v2a7 7 0 01-14 0v-2" />
                    </svg>
                  </button>
                  <button className="send-btn" type="button" onClick={() => askAI(inputText)} disabled={isTyping || !inputText.trim()}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activePage === "profile" && (
            <div className="page-center">
              <div className="profile-panel">
                <div className="profile-avatar-large">{(profile.name || "U").charAt(0).toUpperCase()}</div>
                <h2>{profile.name || "User"}</h2>
                <div className="profile-info">
                  <div className="profile-row"><span>Email</span><span>{profile.email || "-"}</span></div>
                  <div className="profile-row"><span>Joined</span><span>{formatDate(profile.createdAt)}</span></div>
                  <div className="profile-row"><span>Conversations</span><span>{profile.totalConversations ?? conversations.length}</span></div>
                  <div className="profile-row"><span>Last Login</span><span>{formatDateTime(profile.lastLogin)}</span></div>
                </div>
                <button className="profile-logout-btn" type="button" onClick={handleLogout}>Sign Out</button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}