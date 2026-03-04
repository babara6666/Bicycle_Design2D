import { useNavigate } from "react-router-dom";
import "./LandingPage.css";

interface BikeCategory {
  code: string;
  name: string;
  nameEn: string;
  photo: string;
  desc: string;
  color: string;
}

const CATEGORIES: BikeCategory[] = [
  {
    code: "Male",
    name: "男車",
    nameEn: "Male Frame",
    photo: "/ASBGF-500.png",
    desc: "鑽石形車架，適合城市通勤與運動騎乘",
    color: "#1e6d90",
  },
  {
    code: "Female",
    name: "女車",
    nameEn: "Female Frame",
    photo: "/RESLA-450.png",
    desc: "低跨管設計，便於上下車，優雅舒適",
    color: "#a0522d",
  },
  {
    code: "Wave",
    name: "Wave",
    nameEn: "Wave Frame",
    photo: "/WB4GI8A_48.png",
    desc: "流線弧形車架，兼顧時尚與實用",
    color: "#2a8a5f",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-shell">
      {/* Background */}
      <div className="landing-bg" />

      <div className="landing-content">
        {/* Header */}
        <header className="landing-header">
          <div className="landing-brand">
            <img
              src="/company-logo.png"
              alt="IBDS"
              className="landing-logo"
            />
            <div>
              <span className="landing-kicker">IBDS</span>
              <h1 className="landing-title">Bicycle 2D Design Studio</h1>
            </div>
          </div>
          <div className="landing-header-sub">
            <span>太宇工業有限公司</span>
          </div>
        </header>

        {/* Hero */}
        <section className="landing-hero">
          <div className="landing-hero-badge">開始設計</div>
          <h2 className="landing-hero-title">
            選擇您的<span className="landing-hero-accent">車架類型</span>
          </h2>
          <p className="landing-hero-sub">
            選擇車種類別，從模板開始客製化您的 2D 自行車工程圖
          </p>
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
              <div className="landing-card-photo-wrap">
                <img
                  src={cat.photo}
                  alt={cat.name}
                  className="landing-card-photo"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
              <div className="landing-card-body">
                <h3 className="landing-card-name">{cat.name}</h3>
                <p className="landing-card-en">{cat.nameEn}</p>
                <p className="landing-card-desc">{cat.desc}</p>
              </div>
              <div className="landing-card-arrow">→</div>
            </button>
          ))}
        </div>

        {/* Or go directly */}
        <div className="landing-direct">
          <span>或直接</span>
          <button
            className="landing-direct-btn"
            onClick={() => navigate("/editor")}
            type="button"
          >
            開啟編輯器 →
          </button>
        </div>
      </div>
    </div>
  );
}
