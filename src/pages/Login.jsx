import { useState } from "react";
import axios from "axios";
import "../auth.css";

const API_BASE = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");
const AUTH_LOGIN_URL = API_BASE ? `${API_BASE}/api/auth/login` : "/api/auth/login";
const AUTH_REGISTER_URL = API_BASE ? `${API_BASE}/api/auth/register` : "/api/auth/register";

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async () => {
    try {
      const url = isLogin ? AUTH_LOGIN_URL : AUTH_REGISTER_URL;

      const payload = isLogin
        ? { email, password }
        : { name, email, password };

      const res = await axios.post(url, payload);

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      window.location.href = "/";
    } catch (err) {
      alert(err.response?.data?.message || "Authentication failed");
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>🎓 University VoiceBot</h1>
        <p>Your AI Assistant for University Information</p>

        <div className="auth-tabs">
          <button
            className={isLogin ? "active-tab" : ""}
            onClick={() => setIsLogin(true)}
          >
            Login
          </button>

          <button
            className={!isLogin ? "active-tab" : ""}
            onClick={() => setIsLogin(false)}
          >
            Sign Up
          </button>
        </div>

        {!isLogin && (
          <input
            type="text"
            placeholder="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button className="auth-btn" onClick={handleSubmit}>
          {isLogin ? "Login" : "Create Account"}
        </button>
      </div>
    </div>
  );
}


