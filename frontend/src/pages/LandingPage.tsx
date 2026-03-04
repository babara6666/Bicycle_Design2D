import { useNavigate } from "react-router-dom";
import { useLangStore } from "../stores/langStore";
import { useThemeStore } from "../stores/themeStore";
import "./LandingPage.css";

const LABELS = {
  zh: {
    badge: "開始設計",
    heroTitle: "選擇您的",
    heroAccent: "車架類型",
    heroSub: "選擇車種類別，從模板開始客製化您的 2D 自行車工程圖",
    directBtn: "開啟編輯器 →",
    company: "太宇工業有限公司",
  },
  en: {
    badge: "Start Design",
    heroTitle: "Choose Your ",
    heroAccent: "Frame Type",
    heroSub: "Pick a category and start customising your 2D bicycle engineering drawing.",
    directBtn: "Open Editor →",
    company: "TY Industrial Co., Ltd.",
  },
};

interface BikeCategory {
  code: string;
  zh: string;
  en: string;
  sub: string;
  icon: string;
  color: string;
}

const CATEGORIES: BikeCategory[] = [
  { code: "Male",     zh: "男車",   en: "Male Frame",     sub: "Male Frame",     icon: "🚴", color: "#1e6d90" },
  { code: "Female",   zh: "女車",   en: "Female Frame",   sub: "Female Frame",   icon: "🚲", color: "#a0522d" },
  { code: "Wave",     zh: "Wave",   en: "Wave Frame",     sub: "Wave Frame",     icon: "🏍", color: "#2a8a5f" },
  { code: "Mountain", zh: "登山車", en: "Mountain Bike",  sub: "Mountain Bike",  icon: "⛰️", color: "#6a4c2a" },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { lang, toggle: toggleLang } = useLangStore();
  const { theme, toggle: toggleTheme } = useThemeStore();
  const L = LABELS[lang];

  return (
    <div className="landing-shell">
      <div className="landing-bg" />
      <div className="landing-content">

        {/* Header */}
        <header className="landing-header">
          <div className="landing-brand">
            <img src="/company-logo.png" alt="IBDS" className="landing-logo" />
            <h1 className="landing-title">Bicycle 2D Design Studio</h1>
          </div>
          <div className="landing-header-right">
            <span className="landing-company">{L.company}</span>
            {/* Lang toggle */}
            <button className="landing-pill-btn" onClick={toggleLang} type="button" title="切換語言">
              {lang === "zh" ? "EN" : "中"}
            </button>
            {/* Dark/Light toggle */}
            <button className="landing-pill-btn" onClick={toggleTheme} type="button" title="切換主題">
              {theme === "light" ? "🌙" : "☀️"}
            </button>
          </div>
        </header>

        {/* Hero */}
        <section className="landing-hero">
          <div className="landing-hero-badge">{L.badge}</div>
          <h2 className="landing-hero-title">
            {L.heroTitle}<span className="landing-hero-accent">{L.heroAccent}</span>
          </h2>
          <p className="landing-hero-sub">{L.heroSub}</p>
        </section>

        {/* Category Grid */}
        <div className="landing-grid">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.code}
              className="landing-card"
              style={{ "--card-accent": cat.color } as React.CSSProperties}
              onClick={() => navigate(`/designs/${cat.code}`)}
              type="button"
            >
              <div className="landing-card-icon">{cat.icon}</div>
              <div className="landing-card-body">
                <h3 className="landing-card-name">{lang === "zh" ? cat.zh : cat.en}</h3>
                <p className="landing-card-en">{cat.sub}</p>
              </div>
              <div className="landing-card-arrow">→</div>
            </button>
          ))}
        </div>

        {/* Or go directly */}
        <div className="landing-direct">
          <button
            className="landing-direct-btn"
            onClick={() => navigate("/editor")}
            type="button"
          >
            {L.directBtn}
          </button>
        </div>

      </div>
    </div>
  );
}
