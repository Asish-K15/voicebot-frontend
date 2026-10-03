import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import VoiceBot from "./pages/VoiceBot";

function App() {
  return (
    <Routes>
      {/* Guest can access VoiceBot immediately */}
      <Route path="/" element={<VoiceBot />} />
      <Route path="/login" element={<Login />} />
    </Routes>
  );
}

export default App;


