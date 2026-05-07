import { useRef, useState } from 'react';
import axios from 'axios';
import './App.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://voicebot-backend-1.onrender.com';

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function App() {
  const [messages, setMessages] = useState([]);
  const [liveText, setLiveText] = useState('Tap mic to speak');
  const finalTranscript = useRef('');
  const recognitionRef = useRef(null);

  function createRecognition() {
    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
      setLiveText('Voice recognition is not supported in this browser.');
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';

    recognition.onresult = (event) => {
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const text = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          finalTranscript.current += text;
        } else {
          interim += text;
        }
      }

      setLiveText(`${finalTranscript.current}${interim}` || 'Listening...');
    };

    recognition.onend = async () => {
      const userMsg = finalTranscript.current.trim();
      finalTranscript.current = '';

      if (!userMsg) {
        setLiveText('Tap mic to speak');
        return;
      }

      setMessages((prev) => [...prev, { text: userMsg, sender: 'user' }]);
      setLiveText('Processing...');

      try {
        const res = await axios.post(`${BACKEND_URL}/chat`, {
          message: userMsg,
        });

        const reply = res.data.reply || 'No reply received.';
        setMessages((prev) => [...prev, { text: reply, sender: 'bot' }]);
        speak(reply);
      } catch (err) {
        setMessages((prev) => [...prev, { text: 'Error connecting to server', sender: 'bot' }]);
        setLiveText('Tap mic to speak');
      }
    };

    return recognition;
  }

  function startListening() {
    window.speechSynthesis?.cancel();
    finalTranscript.current = '';
    setLiveText('Listening...');

    recognitionRef.current = createRecognition();
    recognitionRef.current?.start();
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) {
      setLiveText('Tap mic to speak');
      return;
    }

    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = 'en-IN';
    speech.onend = () => setLiveText('Tap mic to speak');
    window.speechSynthesis.speak(speech);
  }

  return (
    <div className="app">
      <h1>University VoiceBot</h1>

      <div className="chat">
        {messages.map((msg, index) => (
          <div key={`${msg.sender}-${index}`} className={`bubble ${msg.sender}`}>
            {msg.text}
          </div>
        ))}
      </div>

      <div className="live">{liveText}</div>

      <button className="mic" type="button" onClick={startListening}>
        Mic
      </button>
    </div>
  );
}

export default App;
