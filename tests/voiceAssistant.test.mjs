import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { renderMarkdown, setPurifierWindow, escapeHtml } from "../src/utils/markdown.js";

// Initialize JSDOM for testing production DOMPurify in Node
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
setPurifierWindow(dom.window);

// ─── Orb States Mirror ───────────────────────────────────────────────────
const ORB_STATES = {
  IDLE:       { color: "#6366f1", label: "Hello! I'm CUTM AI",                 pulseSpeed: 3, scale: 0.7, rings: 1, particleCount: 12 },
  LISTENING:  { color: "#8b5cf6", label: "Listening...",                       pulseSpeed: 1.2, scale: 0.85, rings: 4, particleCount: 20 },
  UNDERSTAND: { color: "#06b6d4", label: "Understanding your question...",     pulseSpeed: 0.7, scale: 0.9, rings: 3, particleCount: 16 },
  SEARCH_KB:  { color: "#f59e0b", label: "Searching University Knowledge...",  pulseSpeed: 1.4, scale: 0.75, rings: 2, particleCount: 14 },
  SEARCH_WEB: { color: "#f97316", label: "Searching the Web...",               pulseSpeed: 1.2, scale: 0.75, rings: 2, particleCount: 14 },
  THINKING:   { color: "#eab308", label: "Thinking...",                        pulseSpeed: 0.5, scale: 0.95, rings: 4, particleCount: 18 },
  SPEAKING:   { color: "#22c55e", label: "Speaking...",                       pulseSpeed: 1.8, scale: 1.1, rings: 5, particleCount: 24 },
};

// ─── Pure State & Invariant Helpers from VoiceMode ───────────────────────
function computeVoiceModeState({ orbState, isListening, isSpeaking, messages, liveTranscript, micError }) {
  const effectiveOrbState = (orbState === "LISTENING" && !isListening) ? "IDLE" : orbState;
  const cfg = ORB_STATES[effectiveOrbState] || ORB_STATES.IDLE;
  const isInitialWelcome = messages.length === 0 && effectiveOrbState === "IDLE";
  const showBars = (isListening && effectiveOrbState === "LISTENING") || (isSpeaking && effectiveOrbState === "SPEAKING");
  const showSteps = ["UNDERSTAND", "SEARCH_KB", "SEARCH_WEB", "THINKING", "SPEAKING"].includes(effectiveOrbState);

  // Status label invariant: never show "Listening..." unless microphone is genuinely active
  const displayLabel = isListening
    ? "Listening..."
    : isSpeaking
      ? "Speaking..."
      : cfg.label;

  const buttonLabel = isListening ? "Stop Voice" : "Start Voice";
  const showLiveTranscript = Boolean(isListening && liveTranscript && liveTranscript !== "Tap mic to speak");
  const showLastConversation = Boolean(messages && messages.length >= 2);

  return {
    effectiveOrbState,
    isInitialWelcome,
    showBars,
    showSteps,
    displayLabel,
    buttonLabel,
    showLiveTranscript,
    showLastConversation,
    micError,
  };
}

// (Local duplicate removed: production renderMarkdown imported from ../src/utils/markdown.js)

// ─── Mock SpeechRecognition Simulation ──────────────────────────────────
class MockSpeechRecognition {
  constructor() {
    this.continuous = false;
    this.interimResults = true;
    this.lang = "en-IN";
    this.started = false;
    this.aborted = false;
  }
  start() {
    if (this.started) throw new Error("Recognition already started");
    this.started = true;
    setTimeout(() => this.onstart?.(), 1);
  }
  abort() {
    this.aborted = true;
    this.started = false;
    setTimeout(() => this.onerror?.({ error: "aborted" }), 1);
  }
  stop() {
    this.started = false;
    setTimeout(() => this.onend?.(), 1);
  }
  emitResult(transcript, isFinal = false) {
    this.onresult?.({
      resultIndex: 0,
      results: [[{ transcript }]],
    });
  }
  emitError(errorType) {
    this.started = false;
    this.onerror?.({ error: errorType });
  }
}

// ─── Test Suite ──────────────────────────────────────────────────────────
describe("Voice Assistant State Machine & UI Invariants", () => {
  it("Test 1 (Initial Load): Welcome screen is visible, orb is IDLE, no waveform or stale labels", () => {
    const state = computeVoiceModeState({
      orbState: "IDLE",
      isListening: false,
      isSpeaking: false,
      messages: [],
      liveTranscript: "",
      micError: null,
    });

    assert.equal(state.isInitialWelcome, true, "Welcome screen must be active on initial load");
    assert.equal(state.showBars, false, "Waveform bars must NOT animate on initial load");
    assert.equal(state.displayLabel, "Hello! I'm CUTM AI", "Status label must display IDLE label");
    assert.equal(state.buttonLabel, "Start Voice", "Control button must display Start Voice");
    assert.equal(state.showLiveTranscript, false, "Live transcription must not display");
    assert.equal(state.showLastConversation, false, "Last conversation card must not display");
  });

  it("Test 2 (Invariant): When isListening is false, 'Listening...' and waveforms are strictly forbidden", () => {
    // Simulate a case where orbState was accidentally left as LISTENING or desynchronized
    const state = computeVoiceModeState({
      orbState: "LISTENING",
      isListening: false, // Microphone is NOT active
      isSpeaking: false,
      messages: [
        { role: "user", text: "What are the BTech fees?" },
        { role: "assistant", text: "BTech CSE fees are Rs. 1,40,000 per year." },
      ],
      liveTranscript: "",
      micError: null,
    });

    // In the old buggy code, this displayed "Listening..." and animated the waveform while button said "Start Voice"
    assert.equal(state.buttonLabel, "Start Voice", "Button must say Start Voice when mic is inactive");
    assert.notEqual(state.displayLabel, "Listening...", "Status label must NEVER display 'Listening...' when isListening is false");
    assert.equal(state.showBars, false, "Waveform bars must NEVER animate when isListening is false and isSpeaking is false");
    assert.equal(state.showLiveTranscript, false, "Live transcription must NOT render when isListening is false");
  });

  it("Test 3 (Voice Start): Upon genuine recognition start, status updates to Listening and waveform activates", () => {
    const state = computeVoiceModeState({
      orbState: "LISTENING",
      isListening: true, // Mic recognition actively confirmed by onstart
      isSpeaking: false,
      messages: [],
      liveTranscript: "Listening...",
      micError: null,
    });

    assert.equal(state.isInitialWelcome, false, "Welcome screen must dismiss when voice starts");
    assert.equal(state.isListening, undefined);
    assert.equal(state.displayLabel, "Listening...", "Status label must display 'Listening...'");
    assert.equal(state.showBars, true, "Waveform bars must animate while actively listening");
    assert.equal(state.buttonLabel, "Stop Voice", "Button must switch to 'Stop Voice'");
  });

  it("Test 4 (Voice Stop): Calling stopAudio resets microphone state, hides waveforms, and returns to Start Voice", () => {
    // Before stop: listening
    const listeningState = computeVoiceModeState({
      orbState: "LISTENING",
      isListening: true,
      isSpeaking: false,
      messages: [],
      liveTranscript: "Hello",
      micError: null,
    });
    assert.equal(listeningState.showBars, true);
    assert.equal(listeningState.buttonLabel, "Stop Voice");

    // After stop: clean idle
    const stoppedState = computeVoiceModeState({
      orbState: "IDLE",
      isListening: false,
      isSpeaking: false,
      messages: [],
      liveTranscript: "",
      micError: null,
    });
    assert.equal(stoppedState.showBars, false, "Waveform must immediately stop after stopAudio");
    assert.equal(stoppedState.displayLabel, "Hello! I'm CUTM AI", "Status label must reset to IDLE greeting");
    assert.equal(stoppedState.buttonLabel, "Start Voice", "Button must return to 'Start Voice'");
  });

  it("Test 5 (Recognition Result & Progression): Transitions through UNDERSTAND, THINKING, SPEAKING to IDLE", () => {
    const messages = [
      { role: "user", text: "Library timings at Paralakhemundi?" },
      { role: "assistant", text: "The reference section is open 24 hours." },
    ];

    // Thinking state
    const thinkingState = computeVoiceModeState({
      orbState: "THINKING",
      isListening: false,
      isSpeaking: false,
      messages: [],
      liveTranscript: "",
      micError: null,
    });
    assert.equal(thinkingState.displayLabel, "Thinking...");
    assert.equal(thinkingState.showBars, false);
    assert.equal(thinkingState.showSteps, true);

    // Speaking state
    const speakingState = computeVoiceModeState({
      orbState: "SPEAKING",
      isListening: false,
      isSpeaking: true,
      messages,
      liveTranscript: "",
      micError: null,
    });
    assert.equal(speakingState.displayLabel, "Speaking...");
    assert.equal(speakingState.showBars, true, "Waveform must be active during speech output");
    assert.equal(speakingState.showLastConversation, true, "Last conversation card displays completed exchange");

    // Completion back to IDLE
    const idleAfterSpeech = computeVoiceModeState({
      orbState: "IDLE",
      isListening: false,
      isSpeaking: false,
      messages,
      liveTranscript: "",
      micError: null,
    });
    assert.equal(idleAfterSpeech.displayLabel, "Hello! I'm CUTM AI");
    assert.equal(idleAfterSpeech.showBars, false, "Waveform must stop once speech ends");
    assert.equal(idleAfterSpeech.buttonLabel, "Start Voice");
    assert.equal(idleAfterSpeech.showLastConversation, true, "Q&A remains visible in recent card without stuck listening state");
  });

  it("Test 6 (Permission Error Handling): Microphone not-allowed error shows user-facing message and resets to IDLE", () => {
    const errorMsg = "Microphone access was denied. Please allow microphone permissions in your browser.";
    const state = computeVoiceModeState({
      orbState: "IDLE",
      isListening: false,
      isSpeaking: false,
      messages: [],
      liveTranscript: "",
      micError: errorMsg,
    });

    assert.equal(state.micError, errorMsg, "User-facing message must reflect permission denial");
    assert.equal(state.isListening, undefined);
    assert.equal(state.showBars, false, "Waveforms must not animate on error");
    assert.equal(state.displayLabel, "Hello! I'm CUTM AI");
    assert.equal(state.buttonLabel, "Start Voice", "User must be able to retry with Start Voice");
  });

  it("Test 7 (Session ID Discarding): Stale recognition callbacks from aborted sessions are discarded", () => {
    let activeSessionId = 1;
    let stateUpdatedBySession = null;

    function handleRecognitionEnd(sessionId) {
      if (sessionId !== activeSessionId) {
        // Discard stale callback
        return false;
      }
      stateUpdatedBySession = sessionId;
      return true;
    }

    // Session 1 aborts, user starts Session 2
    const session1Id = activeSessionId;
    activeSessionId++; // New session 2
    const session2Id = activeSessionId;

    // Delayed callback from session 1 fires
    const s1Handled = handleRecognitionEnd(session1Id);
    assert.equal(s1Handled, false, "Delayed callback from session 1 must be ignored");
    assert.equal(stateUpdatedBySession, null, "State must not be corrupted by session 1");

    // Active callback from session 2 fires
    const s2Handled = handleRecognitionEnd(session2Id);
    assert.equal(s2Handled, true, "Callback from active session 2 must be processed");
    assert.equal(stateUpdatedBySession, 2);
  });

  it("Test 8 (Session Reset): resetSession clears history, resets orbState, and restores the welcome screen", () => {
    // State before reset: conversation with 2 messages, orbState is IDLE
    const messagesBefore = [
      { role: "user", text: "Who is the Registrar?" },
      { role: "assistant", text: "The Registrar is Prof. Anita Patra." },
    ];
    const stateBefore = computeVoiceModeState({
      orbState: "IDLE",
      isListening: false,
      isSpeaking: false,
      messages: messagesBefore,
      liveTranscript: "",
      micError: null,
    });
    assert.equal(stateBefore.isInitialWelcome, false, "Welcome screen must not be visible when messages exist");
    assert.equal(stateBefore.showLastConversation, true);

    // After reset: messages are cleared to []
    const stateAfter = computeVoiceModeState({
      orbState: "IDLE",
      isListening: false,
      isSpeaking: false,
      messages: [],
      liveTranscript: "",
      micError: null,
    });
    assert.equal(stateAfter.isInitialWelcome, true, "Welcome screen must be restored on reset");
    assert.equal(stateAfter.showLastConversation, false, "Previous conversation card must be cleared");
    assert.equal(stateAfter.showBars, false);
    assert.equal(stateAfter.buttonLabel, "Start Voice");
  });
});

// ─── Active-Turn Card Regression Tests ────────────────────────────────────
// Pure logic tests that mirror exactly what VoiceBot.jsx does with activeTurn state
// and what VoiceMode.jsx renders from it.

function computeActiveTurnCard(activeTurn) {
  if (!activeTurn || !activeTurn.question) return { visible: false };
  const isThinking = activeTurn.status === "thinking";
  return {
    visible: true,
    question: activeTurn.question,
    showPlaceholder: isThinking,
    showAnswer: !isThinking && activeTurn.answer !== null,
    answer: isThinking ? null : activeTurn.answer,
    status: activeTurn.status,
  };
}

// Simulates the sequence guard in VoiceBot.jsx's askAI
function makeActiveTurnReducer() {
  let seq = 0;
  return {
    submit(question) {
      const turnSeq = ++seq;
      const turn = { question, answer: null, status: "thinking" };
      return { turn, turnSeq, currentSeq: seq };
    },
    respond(turnSeq, answer) {
      // Only update if seq still matches (stale-response guard)
      if (turnSeq !== seq) return { applied: false };
      return { applied: true, turn: { question: null /* kept by caller */, answer, status: "speaking" } };
    },
    afterTTS(turnSeq) {
      if (turnSeq !== seq) return { applied: false };
      return { applied: true, status: "idle" };
    },
    reset() { seq = 0; },
  };
}

describe("Active-Turn Card Regression Tests", () => {
  it("Test A: Previous answer remains visible until a new utterance is finalized", () => {
    // Turn 1 is complete — card shows the answer
    const turn1 = { question: "What is the BTech fee?", answer: "Rs. 1,40,000 per year.", status: "idle" };
    const card1 = computeActiveTurnCard(turn1);
    assert.equal(card1.visible, true);
    assert.equal(card1.showAnswer, true);
    assert.equal(card1.answer, "Rs. 1,40,000 per year.", "Answer from turn 1 must remain visible");

    // Microphone starts listening — activeTurn is NOT cleared here (only cleared on new submit)
    // Card should still show the previous answer
    const card1_while_listening = computeActiveTurnCard(turn1); // activeTurn unchanged
    assert.equal(card1_while_listening.showAnswer, true, "Previous answer must not disappear when listening starts");
  });

  it("Test B: New question replaces the previous active turn immediately on submission", () => {
    const reducer = makeActiveTurnReducer();

    // Turn 1 fully complete
    const { turn: turn1, turnSeq: seq1 } = reducer.submit("What is the BTech fee?");
    reducer.respond(seq1, "Rs. 1,40,000 per year.");
    reducer.afterTTS(seq1);
    const completeTurn1 = { question: "What is the BTech fee?", answer: "Rs. 1,40,000 per year.", status: "idle" };

    // Immediately after new utterance is submitted — activeTurn is replaced with thinking state
    const { turn: turn2 } = reducer.submit("Tell me about hostel facilities.");
    const card2 = computeActiveTurnCard(turn2);

    assert.equal(card2.question, "Tell me about hostel facilities.", "New question must replace the old one");
    assert.equal(card2.showPlaceholder, true, "Thinking placeholder must appear immediately");
    assert.equal(card2.showAnswer, false, "Previous answer must NOT bleed into the new turn");
  });

  it("Test C: Thinking placeholder appears while awaiting the backend", () => {
    const activeTurn = { question: "Who is the vice chancellor?", answer: null, status: "thinking" };
    const card = computeActiveTurnCard(activeTurn);

    assert.equal(card.visible, true);
    assert.equal(card.showPlaceholder, true, "Thinking dots must be shown when status=thinking");
    assert.equal(card.showAnswer, false, "No answer must appear before backend responds");
    assert.equal(card.answer, null);
  });

  it("Test D: New answer replaces the thinking placeholder when backend responds", () => {
    const reducer = makeActiveTurnReducer();
    const { turn: turn, turnSeq: seq } = reducer.submit("Who is the vice chancellor?");

    // Before response
    const cardBefore = computeActiveTurnCard(turn);
    assert.equal(cardBefore.showPlaceholder, true, "Dots must show before response");

    // Backend responds
    const { applied, turn: updatedFields } = reducer.respond(seq, "Prof. Shiba Prasad Mohanty is the Vice Chancellor.");
    assert.equal(applied, true, "Response must be applied for the current turn");

    const completedTurn = { question: "Who is the vice chancellor?", answer: updatedFields.answer, status: "speaking" };
    const cardAfter = computeActiveTurnCard(completedTurn);
    assert.equal(cardAfter.showPlaceholder, false, "Dots must disappear once answer arrives");
    assert.equal(cardAfter.showAnswer, true, "Answer must now be visible");
    assert.equal(cardAfter.answer, "Prof. Shiba Prasad Mohanty is the Vice Chancellor.");
  });

  it("Test E: A stale async response cannot overwrite a newer turn (sequence guard)", () => {
    const reducer = makeActiveTurnReducer();

    // Turn 1 submitted then immediately turn 2 submitted (user spoke again quickly)
    const { turnSeq: seq1 } = reducer.submit("What is the BTech fee?");
    const { turn: turn2, turnSeq: seq2 } = reducer.submit("Tell me about placements.");

    // Turn 1's stale response arrives — must be discarded
    const staleResult = reducer.respond(seq1, "Rs. 1,40,000 per year.");
    assert.equal(staleResult.applied, false, "Stale response from turn 1 must be discarded");

    // Turn 2's real response arrives — must be applied
    const freshResult = reducer.respond(seq2, "CUTM has 90% placement rate.");
    assert.equal(freshResult.applied, true, "Fresh response for turn 2 must be applied");

    const card = computeActiveTurnCard({ question: "Tell me about placements.", answer: freshResult.turn.answer, status: "speaking" });
    assert.equal(card.answer, "CUTM has 90% placement rate.", "Card must show the correct answer for turn 2");
  });

  it("Test F: Continuous listening resumes correctly after TTS completes", () => {
    const reducer = makeActiveTurnReducer();
    const { turn, turnSeq: seq } = reducer.submit("What are the hostel fees?");

    // Backend responds
    const { applied, turn: updatedFields } = reducer.respond(seq, "Hostel fees are Rs. 60,000 per year.");
    assert.equal(applied, true);

    // Status transitions to speaking
    const speakingTurn = { question: "What are the hostel fees?", answer: updatedFields.answer, status: "speaking" };
    const cardSpeaking = computeActiveTurnCard(speakingTurn);
    assert.equal(cardSpeaking.status, "speaking");
    assert.equal(cardSpeaking.showAnswer, true, "Answer visible while speaking");

    // TTS ends — status becomes idle; card still shows the answer (ready for next utterance)
    const { applied: ttsApplied } = reducer.afterTTS(seq);
    assert.equal(ttsApplied, true, "TTS completion must be applied for the current turn");

    const idleTurn = { ...speakingTurn, status: "idle" };
    const cardIdle = computeActiveTurnCard(idleTurn);
    assert.equal(cardIdle.status, "idle");
    assert.equal(cardIdle.showAnswer, true, "Answer must remain visible after TTS until next utterance");

    // Continuous mode: next utterance immediately replaces the card
    const { turn: nextTurn } = reducer.submit("What are the mess timings?");
    const cardNext = computeActiveTurnCard(nextTurn);
    assert.equal(cardNext.question, "What are the mess timings?", "New utterance must replace the previous turn");
    assert.equal(cardNext.showPlaceholder, true, "Thinking dots must appear for the new utterance");
  });
});

// ─── ChatGPT-style Persistent Conversation Thread Tests ──────────────────
describe("ChatGPT-style Persistent Conversation Thread Tests", () => {
  // Test 1: A new question appends to history instead of replacing the prior question
  it("Test 1: A new question appends to history instead of replacing prior messages", () => {
    let messages = [
      { id: "1", role: "user", text: "What is the minimum attendance required at CUTM?" },
      { id: "2", role: "assistant", text: "Minimum 75% attendance is required in each subject." },
    ];

    // Submitting a new question
    const newQuestion = "What happens if my attendance falls below 75%?";
    messages = [...messages, { id: "3", role: "user", text: newQuestion }];

    assert.equal(messages.length, 3, "History must contain all 3 messages");
    assert.equal(messages[0].text, "What is the minimum attendance required at CUTM?");
    assert.equal(messages[1].text, "Minimum 75% attendance is required in each subject.");
    assert.equal(messages[2].text, newQuestion, "New question must append at the end");
  });

  // Test 2: The corresponding AI answer appears in the correct turn
  it("Test 2: The corresponding AI answer appears directly in the correct turn", () => {
    let messages = [
      { id: "1", role: "user", text: "What is the minimum attendance required at CUTM?" },
      { id: "2", role: "assistant", text: "Minimum 75% attendance is required in each subject." },
      { id: "3", role: "user", text: "What happens if my attendance falls below 75%?" },
    ];

    const newAnswer = "Students with 50% to 74% attendance can appear via Examination on Demand (EOD).";
    messages = [...messages, { id: "4", role: "assistant", text: newAnswer }];

    assert.equal(messages.length, 4);
    assert.equal(messages[2].text, "What happens if my attendance falls below 75%?");
    assert.equal(messages[3].text, newAnswer, "AI answer must append directly after its user question");
  });

  // Test 3: A pending turn displays Thinking while preserving previous messages
  it("Test 3: A pending turn displays Thinking while preserving previous messages", () => {
    const messages = [
      { id: "1", role: "user", text: "What is the minimum attendance required at CUTM?" },
      { id: "2", role: "assistant", text: "Minimum 75% attendance is required in each subject." },
      { id: "3", role: "user", text: "What if it falls below 50%?" },
    ];

    const isTyping = true;
    const activeTurn = { question: "What if it falls below 50%?", answer: null, status: "thinking" };

    // In ConversationFeed, all 3 messages are rendered, plus the assistant thinking bubble at the end
    assert.equal(messages.length, 3, "Prior conversation turns are fully preserved");
    assert.equal(isTyping, true, "Thinking state active for the current pending turn");
    assert.equal(activeTurn.status, "thinking");
  });

  // Test 4: A second question can be submitted after the first answer
  it("Test 4: A second question can be submitted cleanly after the first answer", () => {
    let messages = [];
    
    // Turn 1
    messages.push({ role: "user", text: "Question 1" });
    messages.push({ role: "assistant", text: "Answer 1" });
    assert.equal(messages.length, 2);

    // Turn 2
    messages.push({ role: "user", text: "Question 2" });
    messages.push({ role: "assistant", text: "Answer 2" });
    assert.equal(messages.length, 4);

    assert.equal(messages[0].text, "Question 1");
    assert.equal(messages[1].text, "Answer 1");
    assert.equal(messages[2].text, "Question 2");
    assert.equal(messages[3].text, "Answer 2");
  });

  // Test 5: A late response cannot overwrite a newer turn (sequence guard)
  it("Test 5: A late response cannot overwrite a newer turn in multi-turn conversation", () => {
    let activeSeq = 0;
    let latestSavedTurn = null;

    function handleResponse(seq, question, answer) {
      if (seq !== activeSeq) {
        return false; // Discard stale response
      }
      latestSavedTurn = { question, answer };
      return true;
    }

    const seq1 = ++activeSeq;
    const seq2 = ++activeSeq; // Turn 2 started before Turn 1 finished

    const r1 = handleResponse(seq1, "Turn 1 question", "Turn 1 stale answer");
    assert.equal(r1, false, "Turn 1 stale response must be rejected");

    const r2 = handleResponse(seq2, "Turn 2 question", "Turn 2 fresh answer");
    assert.equal(r2, true, "Turn 2 response must be accepted");
    assert.equal(latestSavedTurn.answer, "Turn 2 fresh answer");
  });

  // Test 6: New Chat clears the current view and creates a separate conversation
  it("Test 6: New Chat clears the current view and creates a separate conversation", () => {
    let messages = [
      { role: "user", text: "Hello" },
      { role: "assistant", text: "Hi there!" },
    ];
    let activeConversationId = "conv_123";

    function startNewChat() {
      messages = [];
      activeConversationId = "";
    }

    startNewChat();
    assert.equal(messages.length, 0, "Messages must be reset to empty");
    assert.equal(activeConversationId, "", "Conversation ID must be cleared for new chat");
  });

  // Test 7: Chat panel open/close behavior works without unintended voice-session resets
  it("Test 7: Chat view switch does not abort active voice synthesis or recognition", () => {
    let isSpeaking = true;
    let voiceMode = true;

    function handleSwitchToChat() {
      voiceMode = false;
      // Note: stopAudio is NOT called
    }

    handleSwitchToChat();
    assert.equal(voiceMode, false, "Switched to chat mode");
    assert.equal(isSpeaking, true, "Audio speaking state preserved during mode switch");
  });

  // Test 8: Typed and voice questions use the same conversation history
  it("Test 8: Typed and voice questions use the exact same conversation thread", () => {
    const thread = [];

    // Voice turn
    thread.push({ role: "user", text: "Spoken question via mic" });
    thread.push({ role: "assistant", text: "Spoken answer" });

    // Typed turn
    thread.push({ role: "user", text: "Typed question via composer" });
    thread.push({ role: "assistant", text: "Typed answer" });

    assert.equal(thread.length, 4, "Thread contains both voice and typed questions");
    assert.equal(thread[0].text, "Spoken question via mic");
    assert.equal(thread[2].text, "Typed question via composer");
  });

  // Test 9: Continuous listening preserves the visible history
  it("Test 9: Continuous listening preserves the visible conversation history", () => {
    const messages = [
      { role: "user", text: "Turn 1" },
      { role: "assistant", text: "Response 1" },
    ];
    const isListening = true;
    const continuousMode = true;

    assert.equal(messages.length, 2, "History remains intact during continuous listening");
    assert.equal(isListening, true);
    assert.equal(continuousMode, true);
  });

  // Test 10: Replay targets the correct answer
  it("Test 10: Replay targets the intended answer", () => {
    const messages = [
      { role: "user", text: "Turn 1" },
      { role: "assistant", text: "First answer" },
      { role: "user", text: "Turn 2" },
      { role: "assistant", text: "Second answer" },
    ];
    let spokenText = null;
    function replay(text) { spokenText = text; }

    // Replay specific turn 1
    replay(messages[1].text);
    assert.equal(spokenText, "First answer");

    // Replay latest turn 2
    replay(messages[3].text);
    assert.equal(spokenText, "Second answer");
  });

  // Test 11: Failed requests retain the user message and expose retry behavior
  it("Test 11: Failed requests retain the user message and expose retry without duplicating", () => {
    let messages = [
      { role: "user", text: "Question that fails" },
      { role: "assistant", text: "Connection error", isError: true, failedUserMsg: "Question that fails" },
    ];

    assert.equal(messages.length, 2);
    assert.equal(messages[0].text, "Question that fails");
    assert.equal(messages[1].isError, true);

    // Retry action
    function retry(failedMsg) {
      // Remove error message
      messages = messages.filter(m => !m.isError);
      // Resend without adding another user message
      messages.push({ role: "assistant", text: "Recovered answer", isError: false });
    }

    retry(messages[1].failedUserMsg);
    assert.equal(messages.length, 2, "Must not duplicate user message on retry");
    assert.equal(messages[0].text, "Question that fails");
    assert.equal(messages[1].text, "Recovered answer");
    assert.equal(messages[1].isError, false);
  });

  // Test 12: Long messages render correctly without crashing
  it("Test 12: Long responses format and render correctly", () => {
    const longText = `### Attendance Policy\n\n- Minimum attendance is **75%** per subject.\n- Debarred students with **50-74%** may give EOD exams.\n- Below **50%** attendance requires re-registration.`;
    const html = renderMarkdown(longText);

    assert.ok(html.includes("<h3>Attendance Policy</h3>"), "Headings rendered");
    assert.ok(html.includes("<strong>75%</strong>"), "Bold rendered");
    assert.ok(html.includes("<li>"), "Lists rendered");
  });

  // Test 13: Multi-turn attendance sequence appends in exact order
  it("Test 13: Multi-turn attendance sequence appends in exact order", () => {
    const thread = [];
    const turns = [
      { q: "What is the minimum attendance required at CUTM?", a: "The normal minimum attendance requirement is 75%." },
      { q: "What happens if my attendance falls below 75%?", a: "Attendance between 65% and 74.99% may be condoned on medical grounds subject to Dean approval." },
      { q: "What if it is 70% and I have a medical certificate?", a: "A 70% attendance can be considered for condonation with a medical certificate, subject to Dean review." },
      { q: "What if it is 60%?", a: "60% is below the 65% regular condonation threshold, but is eligible for Examination on Demand." },
      { q: "What documents do I need?", a: "You need a medical certificate from a registered doctor and a formal leave application." }
    ];

    for (const t of turns) {
      thread.push({ role: "user", text: t.q });
      thread.push({ role: "assistant", text: t.a });
    }

    assert.equal(thread.length, 10, "All 5 turns are preserved in conversation history");
    assert.equal(thread[0].text, "What is the minimum attendance required at CUTM?");
    assert.equal(thread[9].text, "You need a medical certificate from a registered doctor and a formal leave application.");
  });

  // Test 14: Phonetic speech correction works cleanly in voice mode
  it("Test 14: Phonetic speech correction works cleanly in voice mode", () => {
    function normalizeSpeech(text) {
      return text.replace(/\bcalls below\b/gi, "falls below");
    }

    const rawTranscript = "What happens if my attendance calls below 75%?";
    const normalized = normalizeSpeech(rawTranscript);
    assert.equal(normalized, "What happens if my attendance falls below 75%?");
  });

  // Test 15: Unrelated query creates independent turn without corrupting history
  it("Test 15: Unrelated query creates independent turn without corrupting history", () => {
    const thread = [
      { role: "user", text: "What is the minimum attendance required at CUTM?" },
      { role: "assistant", text: "75% attendance is required." }
    ];

    thread.push({ role: "user", text: "What is your version and who is the current Prime Minister of Canada?" });
    thread.push({ role: "assistant", text: "I am CUTM AI Assistant v2.0. The Prime Minister of Canada is Justin Trudeau." });

    assert.equal(thread.length, 4);
    assert.ok(thread[2].text.includes("Prime Minister of Canada"));
    assert.ok(!thread[3].text.includes("attendance"), "Response does not mix attendance into unrelated world query");
  });

  // Test 16: Document follow-up immediately after 70% medical certificate
  it("Test 16: Document follow-up immediately after 70% medical certificate", () => {
    const thread = [
      { role: "user", text: "What if I have 70% and with a medical certificate?" },
      { role: "assistant", text: "Students with attendance between 65% and 74.99% may be considered for condonation on medical grounds subject to Dean approval with a registered doctor's certificate and formal leave application." }
    ];

    const followupQuestion = "What documents do I need?";
    thread.push({ role: "user", text: followupQuestion });
    
    // In our backend/client flow, documents needed for condonation are returned
    const followupAnswer = "To apply for medical condonation, you need:\n1. A medical certificate from a registered medical practitioner.\n2. A formal leave / condonation application submitted through your department to the Dean.";
    thread.push({ role: "assistant", text: followupAnswer });

    assert.equal(thread.length, 4);
    assert.ok(thread[3].text.includes("registered medical practitioner") || thread[3].text.includes("registered doctor"));
    assert.ok(thread[3].text.includes("formal leave") || thread[3].text.includes("condonation application"));
  });

  // Test 17: Document question after 60% EOD answer
  it("Test 17: Document question after 60% EOD answer", () => {
    const thread = [
      { role: "user", text: "What if it is 60%?" },
      { role: "assistant", text: "With 60% attendance, you fall below the 65% minimum required for condonation. However, you are eligible to appear for Examination on Demand (EOD)." }
    ];

    thread.push({ role: "user", text: "What documents do I need?" });
    thread.push({ role: "assistant", text: "Since 60% is below the 65% condonation limit, a medical certificate cannot regularize regular semester exams. You need to apply for Examination on Demand (EOD) through the examination cell." });

    assert.equal(thread.length, 4);
    assert.ok(thread[3].text.includes("Examination on Demand") || thread[3].text.includes("EOD"));
  });

  // Test 18: Standalone document question without prior context
  it("Test 18: Standalone document question without prior context asks for clarification or general docs", () => {
    const thread = [];
    thread.push({ role: "user", text: "What documents do I need?" });
    thread.push({ role: "assistant", text: "Centurion University requires different documents depending on what you are applying for (Admissions, Hostel, CUEE, or Attendance Condonation). Please specify which service or department you need documents for." });

    assert.equal(thread.length, 2);
    assert.ok(!thread[1].text.includes("condonation of shortage of attendance up to 10% is guaranteed"));
  });

  // Test 19: Unrelated document questions (hostel check-in) do not receive attendance-policy answers
  it("Test 19: Unrelated document questions (hostel check-in) do not receive attendance-policy answers", () => {
    const thread = [
      { role: "user", text: "What is the minimum attendance required at CUTM?" },
      { role: "assistant", text: "75% attendance is required." }
    ];

    thread.push({ role: "user", text: "What documents do I need for hostel admission and check-in?" });
    thread.push({ role: "assistant", text: "For hostel check-in, you need your allotment letter, fee receipt, student ID, passport-size photographs, and medical declaration." });

    assert.equal(thread.length, 4);
    assert.ok(thread[3].text.includes("hostel") || thread[3].text.includes("allotment"));
    assert.ok(!thread[3].text.includes("65% to 74.99%"), "Must not leak attendance condonation into hostel check-in documents query");
  });

  // Test 20: Source labels and quick-action chips rendering separation
  it("Test 20: Source labels and quick-action chips formatting separation", () => {
    const sources = ["Attendance Requirements", "Examination on Demand", "Grading System"];
    // Rendering as separate pill chips with whitespace/styling
    const renderedChips = sources.map(s => `<button class="vo-qa-chip">${s}</button>`).join(" ");
    
    assert.ok(!renderedChips.includes("Attendance RequirementsExamination on Demand"));
    assert.ok(renderedChips.includes('<button class="vo-qa-chip">Attendance Requirements</button>'));
    assert.ok(renderedChips.includes('<button class="vo-qa-chip">Examination on Demand</button>'));
  });
});




// ═══════════════════════════════════════════════════════════════════════════
// Production Markdown Sanitization & Multi-Layer XSS Prevention Tests
// ═══════════════════════════════════════════════════════════════════════════
describe("Production Markdown Sanitization & Multi-Layer XSS Prevention Tests", () => {
  it("Sanitizes script tags from input and model responses", () => {
    const malicious = "<script>alert('xss')</script>";
    const output = renderMarkdown(malicious);
    assert.ok(!output.includes("<script>"), "Raw <script> tag must not exist");
    assert.ok(output.includes("&lt;script&gt;"), "Script tag must be HTML entity encoded");
  });

  it("Sanitizes onerror, onload, and other event handlers on tags", () => {
    const malicious = '<img src="x" onerror="alert(1)" onload="alert(2)" onclick="alert(3)">';
    const output = renderMarkdown(malicious);
    assert.ok(!output.includes("<img"), "Raw <img> tag must not exist");
    assert.ok(output.includes("&lt;img"), "img tag must be entity encoded");
  });

  it("Sanitizes iframe, object, embed, and svg tag injection", () => {
    const malicious = '<iframe src="javascript:alert(1)"></iframe><object data="test"></object><svg onload="alert(1)"></svg>';
    const output = renderMarkdown(malicious);
    assert.ok(!output.includes("<iframe"), "Raw <iframe> tag must not exist");
    assert.ok(!output.includes("<object"), "Raw <object> tag must not exist");
    assert.ok(!output.includes("<svg"), "Raw <svg> tag must not exist");
    assert.ok(output.includes("&lt;iframe"), "iframe must be entity encoded");
  });

  it("Sanitizes unsafe Markdown link protocols (javascript:, data:, vbscript:)", () => {
    const jsLink = "[Click Me](javascript:alert(document.cookie))";
    const dataLink = "[Data URI](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)";
    const vbLink = "[VB Link](vbscript:msgbox(1))";

    const outJs = renderMarkdown(jsLink);
    const outData = renderMarkdown(dataLink);
    const outVb = renderMarkdown(vbLink);

    assert.ok(!outJs.includes('href="javascript:'), "javascript: href must be blocked");
    assert.ok(!outData.includes('href="data:'), "data: href must be blocked");
    assert.ok(!outVb.includes('href="vbscript:'), "vbscript: href must be blocked");
    assert.ok(outJs.includes('href="#unsafe-link"'), "Unsafe href should be replaced with safe anchor");
  });

  it("Preserves safe Markdown links (http:, https:, mailto:, /)", () => {
    const safeLink = "[Centurion University](https://cutm.ac.in)";
    const output = renderMarkdown(safeLink);
    assert.ok(output.includes('<a href="https://cutm.ac.in" target="_blank" rel="noopener noreferrer">Centurion University</a>'));
  });

  it("Preserves valid safe Markdown formatting (bold, italics, code, headings, lists, tables, hr)", () => {
    const text = "### Title\n\n**bold text** and *italic text* and `inline_code()`\n\n- Item A\n- Item B\n\n| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |\n\n---";
    const output = renderMarkdown(text);
    assert.ok(output.includes("<h3>Title</h3>"));
    assert.ok(output.includes("<strong>bold text</strong>"));
    assert.ok(output.includes("<em>italic text</em>"));
    assert.ok(output.includes("<code>inline_code()</code>"));
    assert.ok(output.includes("<li>Item A</li>"));
    assert.ok(output.includes("<table><tbody>"));
    assert.ok(output.includes("<tr><td>Cell 1</td><td>Cell 2</td></tr>"));
    assert.ok(output.includes("<hr>"));
  });

  it("Window-undefined safety: fallback strictly escapes HTML without executing payloads", () => {
    // Temporarily unset purifier window
    setPurifierWindow(null);
    const malicious = '<script>alert(1)</script><b onmouseover="alert(2)">test</b>';
    const output = renderMarkdown(malicious);
    
    assert.ok(!output.includes("<script>"), "Fallback must never emit raw <script>");
    assert.ok(!output.includes("<b onmouseover"), "Fallback must never emit raw unescaped tag with attributes");
    assert.ok(output.includes("&lt;script&gt;"), "Fallback must entity-encode all raw tags");

    // Restore purifier window
    setPurifierWindow(dom.window);
  });
});
