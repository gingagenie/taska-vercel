import { Link } from "wouter";
import { useEffect } from "react";

export default function Landing() {
  // Load Google Fonts
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500;600&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  return (
    <>
      <style>{`
        .lp * { box-sizing: border-box; margin: 0; padding: 0; }

        .lp {
          --blue1: #1AACE8;
          --blue2: #2563EB;
          --grad: linear-gradient(135deg, #1AACE8 0%, #2563EB 100%);
          --dark: #0D1117;
          --dark2: #161B27;
          --dark3: #1E2535;
          --text: #E8EDF8;
          --muted: #7B8BAE;
          --border: rgba(255,255,255,0.07);
          --border-blue: rgba(26,172,232,0.25);
          --font-display: 'Barlow Condensed', sans-serif;
          --font-body: 'Barlow', sans-serif;
          background: var(--dark);
          color: var(--text);
          font-family: var(--font-body);
          font-size: 16px;
          line-height: 1.6;
          overflow-x: hidden;
          scroll-behavior: smooth;
        }

        /* ── NAV ── */
        .lp-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 5%; height: 64px;
          background: rgba(13,17,23,0.94);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
        }
        .lp-nav-logo {
          display: flex; align-items: center; gap: 0.5rem;
          text-decoration: none;
        }
        .lp-nav-logo img {
          height: 36px; width: auto;
          filter: brightness(0) invert(1);
        }
        .lp-nav-logo-text {
          font-family: var(--font-display);
          font-size: 1.5rem; font-weight: 900;
          color: #fff; letter-spacing: 0.02em;
        }
        .lp-nav-links {
          display: flex; gap: 2rem; align-items: center;
        }
        .lp-nav-links a {
          color: var(--muted); text-decoration: none;
          font-size: 0.88rem; font-weight: 500;
          letter-spacing: 0.04em; text-transform: uppercase;
          transition: color 0.2s;
        }
        .lp-nav-links a:hover { color: #fff; }
        .lp-nav-cta {
          background: var(--grad) !important;
          color: #fff !important;
          padding: 0.5rem 1.2rem; border-radius: 8px;
          font-weight: 600 !important;
          box-shadow: 0 4px 14px rgba(26,172,232,0.3);
        }
        .lp-nav-cta:hover { opacity: 0.88 !important; }

        /* ── HERO ── */
        .lp-hero {
          min-height: 100vh;
          display: flex; flex-direction: column; justify-content: center;
          padding: 100px 5% 80px;
          position: relative; overflow: hidden;
        }
        .lp-hero::before {
          content: '';
          position: absolute; top: -300px; right: -300px;
          width: 800px; height: 800px;
          background: radial-gradient(circle, rgba(26,172,232,0.1) 0%, transparent 65%);
          pointer-events: none;
        }
        .lp-hero::after {
          content: '';
          position: absolute; bottom: -200px; left: -200px;
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(37,99,235,0.08) 0%, transparent 65%);
          pointer-events: none;
        }
        .lp-eyebrow {
          display: inline-flex; align-items: center; gap: 0.5rem;
          background: rgba(26,172,232,0.1);
          border: 1px solid rgba(26,172,232,0.25);
          border-radius: 100px;
          padding: 0.35rem 1rem;
          font-size: 0.78rem; font-weight: 600;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: #1AACE8; margin-bottom: 1.5rem;
          width: fit-content; position: relative;
          animation: lpFadeUp 0.5s ease both;
        }
        .lp-hero h1 {
          font-family: var(--font-display);
          font-size: clamp(3.2rem, 8vw, 7rem);
          font-weight: 900; line-height: 0.95;
          letter-spacing: -0.01em; text-transform: uppercase;
          margin-bottom: 1.5rem; max-width: 900px;
          position: relative;
          animation: lpFadeUp 0.5s 0.1s ease both;
        }
        .lp-hero h1 em {
          font-style: normal;
          background: var(--grad);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text; display: block;
        }
        .lp-hero-sub {
          font-size: clamp(1rem, 2vw, 1.15rem);
          color: var(--muted); max-width: 520px;
          margin-bottom: 2.5rem; line-height: 1.75;
          position: relative;
          animation: lpFadeUp 0.5s 0.2s ease both;
        }
        .lp-hero-sub strong { color: var(--text); }
        .lp-hero-actions {
          display: flex; gap: 1rem; flex-wrap: wrap; align-items: center;
          margin-bottom: 1rem; position: relative;
          animation: lpFadeUp 0.5s 0.3s ease both;
        }
        .lp-btn-primary {
          background: var(--grad); color: #fff;
          border: none; cursor: pointer;
          padding: 0.9rem 2rem;
          font-family: var(--font-display);
          font-size: 1.1rem; font-weight: 700;
          letter-spacing: 0.05em; text-transform: uppercase;
          border-radius: 8px; text-decoration: none;
          transition: opacity 0.2s, transform 0.15s;
          display: inline-block;
          box-shadow: 0 6px 20px rgba(26,172,232,0.35);
        }
        .lp-btn-primary:hover { opacity: 0.88; transform: translateY(-1px); }
        .lp-btn-secondary {
          background: transparent; color: var(--text);
          border: 1px solid var(--border); cursor: pointer;
          padding: 0.9rem 2rem;
          font-family: var(--font-display);
          font-size: 1.1rem; font-weight: 700;
          letter-spacing: 0.05em; text-transform: uppercase;
          border-radius: 8px; text-decoration: none;
          transition: border-color 0.2s, color 0.2s; display: inline-block;
        }
        .lp-btn-secondary:hover { border-color: #1AACE8; color: #1AACE8; }
        .lp-reassurance {
          font-size: 0.82rem; color: var(--muted);
          display: flex; align-items: center; gap: 0.4rem;
          position: relative;
          animation: lpFadeUp 0.5s 0.35s ease both;
        }
        .lp-hero-stats {
          display: flex; gap: 3rem; margin-top: 5rem;
          padding-top: 2.5rem; border-top: 1px solid var(--border);
          flex-wrap: wrap; position: relative;
          animation: lpFadeUp 0.5s 0.45s ease both;
        }
        .lp-stat-number {
          font-family: var(--font-display);
          font-size: 2.5rem; font-weight: 900; color: #fff; line-height: 1;
        }
        .lp-stat-number span {
          background: var(--grad);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .lp-stat-label { font-size: 0.85rem; color: var(--muted); margin-top: 0.25rem; }

        /* ── SECTION LABEL ── */
        .lp-label {
          font-size: 0.75rem; font-weight: 700;
          letter-spacing: 0.12em; text-transform: uppercase;
          color: #1AACE8; margin-bottom: 1rem;
        }

        /* ── STORY ── */
        .lp-story { padding: 100px 5%; background: var(--dark2); }
        .lp-story-inner {
          max-width: 960px; margin: 0 auto;
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 5rem; align-items: center;
        }
        .lp-story-text h2 {
          font-family: var(--font-display);
          font-size: clamp(2rem, 4vw, 3.2rem);
          font-weight: 900; text-transform: uppercase;
          line-height: 1; margin-bottom: 1.5rem;
        }
        .lp-story-text p { color: var(--muted); line-height: 1.8; margin-bottom: 1rem; }
        .lp-story-text p strong { color: var(--text); }
        .lp-story-quote {
          background: var(--dark3);
          border-left: 3px solid #1AACE8;
          border-radius: 0 12px 12px 0; padding: 2rem;
          box-shadow: 0 0 40px rgba(26,172,232,0.06);
        }
        .lp-story-quote p {
          font-family: var(--font-display);
          font-size: 1.4rem; font-weight: 700;
          color: #fff; line-height: 1.3;
          text-transform: uppercase; margin: 0;
        }
        .lp-story-quote cite {
          display: block; margin-top: 0.75rem;
          font-size: 0.82rem; color: var(--muted); font-style: normal;
        }

        /* ── LOGO IN STORY ── */
        .lp-story-logo {
          display: flex; align-items: center; gap: 0.75rem;
          margin-bottom: 1.5rem;
        }
        .lp-story-logo img {
          height: 48px; width: auto;
          filter: brightness(0) invert(1);
        }

        /* ── FLOW ── */
        .lp-flow { padding: 100px 5%; }
        .lp-flow-header { text-align: center; margin-bottom: 4rem; }
        .lp-flow-header h2 {
          font-family: var(--font-display);
          font-size: clamp(2rem, 4vw, 3.5rem);
          font-weight: 900; text-transform: uppercase; margin-bottom: 0.75rem;
        }
        .lp-flow-header p { color: var(--muted); max-width: 500px; margin: 0 auto; }
        .lp-flow-steps {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 0; max-width: 1000px; margin: 0 auto; position: relative;
        }
        .lp-flow-steps::before {
          content: '';
          position: absolute; top: 2rem; left: 4rem; right: 4rem; height: 2px;
          background: linear-gradient(90deg, #1AACE8, #2563EB, transparent);
          z-index: 0;
        }
        .lp-flow-step { position: relative; z-index: 1; padding: 0 1rem 2rem; text-align: center; }
        .lp-step-num {
          width: 64px; height: 64px;
          background: var(--grad); border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-display);
          font-size: 1.5rem; font-weight: 900; color: #fff;
          margin: 0 auto 1.25rem;
          box-shadow: 0 4px 16px rgba(26,172,232,0.3);
        }
        .lp-flow-step h3 {
          font-family: var(--font-display);
          font-size: 1.05rem; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 0.5rem;
        }
        .lp-flow-step p { font-size: 0.86rem; color: var(--muted); line-height: 1.6; }

        /* ── FEATURES ── */
        .lp-features { padding: 100px 5%; background: var(--dark2); }
        .lp-features-header { text-align: center; margin-bottom: 4rem; }
        .lp-features-header h2 {
          font-family: var(--font-display);
          font-size: clamp(2rem, 4vw, 3.5rem);
          font-weight: 900; text-transform: uppercase; margin-bottom: 0.75rem;
        }
        .lp-features-header p { color: var(--muted); max-width: 500px; margin: 0 auto; }
        .lp-features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.25rem; max-width: 1100px; margin: 0 auto;
        }
        .lp-feature-card {
          background: var(--dark3); border: 1px solid var(--border);
          border-radius: 12px; padding: 1.75rem;
          transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
        }
        .lp-feature-card:hover {
          border-color: rgba(26,172,232,0.25);
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(26,172,232,0.08);
        }
        .lp-feature-icon { font-size: 1.75rem; margin-bottom: 0.85rem; display: block; }
        .lp-feature-card h3 {
          font-family: var(--font-display);
          font-size: 1.15rem; font-weight: 800;
          text-transform: uppercase; margin-bottom: 0.4rem;
        }
        .lp-feature-card p { color: var(--muted); font-size: 0.88rem; line-height: 1.7; }

        /* ── PRICING ── */
        .lp-pricing { padding: 100px 5%; }
        .lp-pricing-header { text-align: center; margin-bottom: 3rem; }
        .lp-pricing-header h2 {
          font-family: var(--font-display);
          font-size: clamp(2rem, 4vw, 3.5rem);
          font-weight: 900; text-transform: uppercase; margin-bottom: 0.75rem;
        }
        .lp-pricing-header p { color: var(--muted); max-width: 480px; margin: 0 auto; }
        .lp-pricing-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.5rem; max-width: 700px; margin: 0 auto 2.5rem;
        }
        .lp-pricing-card {
          background: var(--dark3); border: 1px solid var(--border);
          border-radius: 16px; padding: 2.5rem 2rem; position: relative;
        }
        .lp-pricing-card.featured {
          border-color: #1AACE8;
          box-shadow: 0 0 40px rgba(26,172,232,0.12);
        }
        .lp-pricing-badge {
          position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
          background: var(--grad); color: #fff;
          font-size: 0.7rem; font-weight: 700;
          letter-spacing: 0.1em; text-transform: uppercase;
          padding: 0.3rem 1rem; border-radius: 100px; white-space: nowrap;
          box-shadow: 0 4px 12px rgba(26,172,232,0.35);
        }
        .lp-pricing-name {
          font-family: var(--font-display);
          font-size: 1.6rem; font-weight: 900;
          text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.2rem;
        }
        .lp-pricing-tagline { font-size: 0.84rem; color: var(--muted); margin-bottom: 1.5rem; }
        .lp-pricing-price { display: flex; align-items: baseline; gap: 0.2rem; margin-bottom: 0.4rem; }
        .lp-price-dollar { font-size: 1.1rem; font-weight: 600; color: var(--muted); }
        .lp-price-amount {
          font-family: var(--font-display);
          font-size: 3.8rem; font-weight: 900; color: #fff; line-height: 1;
        }
        .lp-price-period { font-size: 0.88rem; color: var(--muted); }
        .lp-pricing-users { font-size: 0.82rem; color: #1AACE8; margin-bottom: 1.75rem; font-weight: 600; }
        .lp-pricing-divider { height: 1px; background: var(--border); margin-bottom: 1.5rem; }
        .lp-pricing-features { list-style: none; margin-bottom: 2rem; }
        .lp-pricing-features li {
          display: flex; align-items: flex-start; gap: 0.6rem;
          font-size: 0.88rem; color: var(--muted); padding: 0.4rem 0;
        }
        .lp-pricing-features li::before {
          content: '✓'; color: #1AACE8; font-weight: 700;
          flex-shrink: 0; margin-top: 0.1rem;
        }
        .lp-pricing-features li strong { color: var(--text); }
        .lp-pricing-btn {
          display: block; width: 100%; text-align: center; padding: 0.9rem;
          font-family: var(--font-display);
          font-size: 1rem; font-weight: 700;
          letter-spacing: 0.05em; text-transform: uppercase;
          border-radius: 8px; text-decoration: none; transition: all 0.2s;
        }
        .lp-pricing-btn-primary {
          background: var(--grad); color: #fff;
          box-shadow: 0 4px 16px rgba(26,172,232,0.3);
        }
        .lp-pricing-btn-primary:hover { opacity: 0.88; }
        .lp-pricing-btn-outline { border: 1px solid var(--border); color: var(--text); }
        .lp-pricing-btn-outline:hover { border-color: #1AACE8; color: #1AACE8; }
        .lp-pricing-note {
          text-align: center; color: var(--muted); font-size: 0.84rem;
          display: flex; align-items: center; justify-content: center; gap: 0.4rem;
        }

        /* ── PACKS ── */
        .lp-packs { padding: 60px 5%; background: var(--dark2); }
        .lp-packs-inner { max-width: 860px; margin: 0 auto; text-align: center; }
        .lp-packs h3 {
          font-family: var(--font-display);
          font-size: 1.8rem; font-weight: 900; text-transform: uppercase; margin-bottom: 0.5rem;
        }
        .lp-packs-sub { color: var(--muted); margin-bottom: 2rem; font-size: 0.9rem; }
        .lp-packs-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 1rem;
        }
        .lp-pack-card {
          background: var(--dark3); border: 1px solid var(--border);
          border-radius: 10px; padding: 1.25rem; text-align: center;
          transition: border-color 0.2s;
        }
        .lp-pack-card:hover { border-color: rgba(26,172,232,0.25); }
        .lp-pack-icon { font-size: 1.4rem; margin-bottom: 0.4rem; }
        .lp-pack-name { font-size: 0.75rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.3rem; }
        .lp-pack-amount { font-family: var(--font-display); font-size: 1.2rem; font-weight: 900; color: #fff; }
        .lp-pack-price { font-size: 0.82rem; color: #1AACE8; margin-top: 0.2rem; font-weight: 600; }

        /* ── COMPARE ── */
        .lp-compare { padding: 100px 5%; }
        .lp-compare-header { text-align: center; margin-bottom: 3rem; }
        .lp-compare-header h2 {
          font-family: var(--font-display);
          font-size: clamp(2rem, 4vw, 3.2rem);
          font-weight: 900; text-transform: uppercase; margin-bottom: 0.5rem;
        }
        .lp-compare-header p { color: var(--muted); }
        .lp-compare-table {
          max-width: 820px; margin: 0 auto;
          border: 1px solid var(--border); border-radius: 12px; overflow: hidden;
        }
        .lp-compare-table table { width: 100%; border-collapse: collapse; }
        .lp-compare-table th {
          padding: 1rem 1.25rem;
          font-family: var(--font-display);
          font-size: 1rem; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.04em;
          background: var(--dark3); border-bottom: 1px solid var(--border); text-align: left;
        }
        .lp-compare-table th.tc { color: #1AACE8; }
        .lp-compare-table td {
          padding: 0.85rem 1.25rem; font-size: 0.88rem; color: var(--muted);
          border-bottom: 1px solid var(--border);
        }
        .lp-compare-table tr:last-child td { border-bottom: none; }
        .lp-compare-table tr:nth-child(even) td { background: rgba(255,255,255,0.02); }
        .lp-compare-table td.tc { color: var(--text); font-weight: 500; }
        .lp-tick { color: #4ADE80; font-weight: 700; }
        .lp-cross { color: #F87171; }

        /* ── FAQ ── */
        .lp-faq { padding: 100px 5%; background: var(--dark2); }
        .lp-faq-header { text-align: center; margin-bottom: 3rem; }
        .lp-faq-header h2 {
          font-family: var(--font-display);
          font-size: clamp(2rem, 4vw, 3rem);
          font-weight: 900; text-transform: uppercase; margin-bottom: 0.5rem;
        }
        .lp-faq-list { max-width: 700px; margin: 0 auto; }
        .lp-faq-item { border-bottom: 1px solid var(--border); padding: 1.5rem 0; }
        .lp-faq-item:last-child { border-bottom: none; }
        .lp-faq-q {
          font-family: var(--font-display);
          font-size: 1.1rem; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.02em;
          margin-bottom: 0.6rem; color: #fff;
        }
        .lp-faq-a { color: var(--muted); font-size: 0.92rem; line-height: 1.7; }
        .lp-faq-a strong { color: var(--text); }

        /* ── CTA ── */
        .lp-cta {
          padding: 100px 5%; text-align: center; position: relative; overflow: hidden;
        }
        .lp-cta::before {
          content: '';
          position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
          width: 700px; height: 400px;
          background: radial-gradient(ellipse, rgba(26,172,232,0.12) 0%, transparent 70%);
          pointer-events: none;
        }
        .lp-cta h2 {
          font-family: var(--font-display);
          font-size: clamp(2.5rem, 6vw, 5rem);
          font-weight: 900; text-transform: uppercase;
          line-height: 0.95; margin-bottom: 1.5rem; position: relative;
        }
        .lp-cta h2 em {
          font-style: normal;
          background: var(--grad);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text; display: block;
        }
        .lp-cta p {
          color: var(--muted); margin-bottom: 2.5rem; font-size: 1rem;
          max-width: 420px; margin-left: auto; margin-right: auto; position: relative;
        }
        .lp-cta .lp-btn-primary { font-size: 1.2rem; padding: 1.1rem 2.5rem; position: relative; }

        /* ── FOOTER ── */
        .lp-footer {
          padding: 2.5rem 5%; border-top: 1px solid var(--border);
          display: flex; justify-content: space-between; align-items: center;
          flex-wrap: wrap; gap: 1rem;
        }
        .lp-footer-logo { display: flex; align-items: center; gap: 0.5rem; }
        .lp-footer-logo img {
          height: 28px; width: auto;
          filter: brightness(0) invert(1);
        }
        .lp-footer-logo-text {
          font-family: var(--font-display);
          font-size: 1.2rem; font-weight: 900; color: #fff;
        }
        .lp-footer p { color: var(--muted); font-size: 0.82rem; }
        .lp-footer-links { display: flex; gap: 1.5rem; }
        .lp-footer-links a { color: var(--muted); text-decoration: none; font-size: 0.82rem; transition: color 0.2s; }
        .lp-footer-links a:hover { color: #fff; }

        /* ── ANIMATION ── */
        @keyframes lpFadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ── RESPONSIVE ── */
        @media (max-width: 768px) {
          .lp-story-inner { grid-template-columns: 1fr; gap: 3rem; }
          .lp-nav-links { display: none; }
          .lp-flow-steps::before { display: none; }
          .lp-hero-stats { gap: 2rem; }
          .lp-footer { flex-direction: column; text-align: center; }
        }
      `}</style>

      <div className="lp">

        {/* NAV */}
        <nav className="lp-nav">
          <Link href="/" className="lp-nav-logo">
            <img src="/taska-logo.png" alt="Taska" />
          </Link>
          <div className="lp-nav-links">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#compare">Compare</a>
            <a href="#faq">FAQ</a>
            <Link href="/auth/login">Log in</Link>
            <Link href="/auth/register" className="lp-nav-cta">Start Free Trial</Link>
          </div>
        </nav>

        {/* HERO */}
        <section className="lp-hero">
          <div className="lp-eyebrow">🔧 Built by a tradie, for tradies</div>
          <h1>Stop Paying For<br /><em>Software You Hate.</em></h1>
          <p className="lp-hero-sub">
            Taska does <strong>jobs, quotes, invoices and Xero sync</strong> without the bloat,
            the 400 features you'll never use, or the enterprise price tag.{" "}
            <strong>From $29/month AUD.</strong>
          </p>
          <div className="lp-hero-actions">
            <Link href="/auth/register" className="lp-btn-primary">Start 14-Day Free Trial</Link>
            <a href="#features" className="lp-btn-secondary">See How It Works</a>
          </div>
          <p className="lp-reassurance">🔒 14-day free trial. Cancel anytime before and you won't be charged.</p>
          <div className="lp-hero-stats">
            <div>
              <div className="lp-stat-number">$29<span>/mo</span></div>
              <div className="lp-stat-label">Solo tradie pricing</div>
            </div>
            <div>
              <div className="lp-stat-number">14<span>days</span></div>
              <div className="lp-stat-label">Free trial, no risk</div>
            </div>
            <div>
              <div className="lp-stat-number"><span>~</span>3min</div>
              <div className="lp-stat-label">Job to paid invoice</div>
            </div>
            <div>
              <div className="lp-stat-number">0<span>BS</span></div>
              <div className="lp-stat-label">No lock-in contracts</div>
            </div>
          </div>
        </section>

        {/* STORY */}
        <section className="lp-story">
          <div className="lp-story-inner">
            <div className="lp-story-text">
              <div className="lp-story-logo">
                <img src="/taska-logo.png" alt="Taska" />
              </div>
              <div className="lp-label">Why Taska exists</div>
              <h2>I Got Sick Of It Too.</h2>
              <p>I'm a forklift technician running my own business. I tried the big field service apps — they wanted <strong>$150–$200 a month</strong> for software built for companies with 50 staff.</p>
              <p>I just needed to schedule a job, write up what I did, and send an invoice. So I built it myself.</p>
              <p>Taska is what I use every single day in my own business. <strong>If it's in the app, it's because a real tradie needed it.</strong></p>
            </div>
            <div className="lp-story-quote">
              <p>"I built the tool I couldn't find. Simple job management without the enterprise price tag."</p>
              <cite>— Keith, Forklift Technician & Taska founder</cite>
            </div>
          </div>
        </section>

        {/* FLOW */}
        <section className="lp-flow" id="features">
          <div className="lp-flow-header">
            <div className="lp-label">The workflow</div>
            <h2>Job Done. Invoice Sent. Paid.</h2>
            <p>The whole flow in one straight line — no jumping between apps.</p>
          </div>
          <div className="lp-flow-steps">
            {[
              { n: 1, title: "Add Customer", desc: "Import from Excel or add manually. All their equipment lives under their profile." },
              { n: 2, title: "Create Job", desc: "Service, repair or install. Assign tech, date and equipment. Done in 30 seconds." },
              { n: 3, title: "Do The Work", desc: "Log hours, parts, notes and photos on site. SMS the customer you're on the way." },
              { n: 4, title: "Complete & Invoice", desc: "Hit complete. Invoice pre-populates from the job. Send with one tap." },
              { n: 5, title: "Get Paid", desc: "See when the customer views it. Mark paid. Syncs to Xero automatically." },
            ].map(s => (
              <div className="lp-flow-step" key={s.n}>
                <div className="lp-step-num">{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FEATURES */}
        <section className="lp-features">
          <div className="lp-features-header">
            <div className="lp-label">What's included</div>
            <h2>Everything You Need. Nothing You Don't.</h2>
            <p>Built for the jobs you actually do, not a corporate workflow.</p>
          </div>
          <div className="lp-features-grid">
            {[
              { icon: "📅", title: "Job Scheduling", desc: "Schedule jobs with date, time, customer and technician. Calendar view so you can see your whole week." },
              { icon: "🔧", title: "Equipment Tracking", desc: "Assign equipment to customers. Track service history. Auto-schedule next service at 6 or 12 months." },
              { icon: "📸", title: "Job Photos & Notes", desc: "Take photos on site, log parts and hours. Everything attached to the job for your records." },
              { icon: "💬", title: "SMS Notifications", desc: "Text the customer when you're on the way. Customise the message. Keeps them in the loop." },
              { icon: "🧾", title: "Quotes & Invoices", desc: "Invoice pre-populates from the job. Send via email with PDF attached. See when the customer opens it." },
              { icon: "🔗", title: "Xero Integration", desc: "Connect once. Invoices sync automatically when sent. Payments sync when marked paid." },
              { icon: "🗺️", title: "Job Navigation", desc: "Tap the map icon on any job to get directions straight to the customer's site." },
              { icon: "👀", title: "Invoice Viewed Tracking", desc: "Know exactly when a customer opens your invoice. Chase it up if they haven't — it might be in junk." },
              { icon: "📱", title: "Works On Your Phone", desc: "Full mobile experience. Run your whole business from the van. No laptop required." },
            ].map(f => (
              <div className="lp-feature-card" key={f.title}>
                <span className="lp-feature-icon">{f.icon}</span>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PRICING */}
        <section className="lp-pricing" id="pricing">
          <div className="lp-pricing-header">
            <div className="lp-label">Pricing</div>
            <h2>Simple. Transparent. Fair.</h2>
            <p>No lock-in contracts. Cancel anytime. Upgrade whenever you need.</p>
          </div>
          <div className="lp-pricing-grid">

            <div className="lp-pricing-card">
              <div className="lp-pricing-name">Taska Solo</div>
              <div className="lp-pricing-tagline">For the one-man operation</div>
              <div className="lp-pricing-price">
                <span className="lp-price-dollar">$</span>
                <span className="lp-price-amount">29</span>
                <span className="lp-price-period">/mo AUD</span>
              </div>
              <div className="lp-pricing-users">1 user</div>
              <div className="lp-pricing-divider" />
              <ul className="lp-pricing-features">
                <li>Unlimited jobs & invoices</li>
                <li>Customer & equipment management</li>
                <li>Job photos, notes & parts logging</li>
                <li>Quotes</li>
                <li>Xero integration</li>
                <li>Invoice viewed tracking</li>
                <li>Job navigation</li>
                <li><strong>100 emails/month included</strong></li>
                <li><strong>50 SMS/month included</strong></li>
              </ul>
              <Link href="/auth/register" className="lp-pricing-btn lp-pricing-btn-outline">Start Free Trial</Link>
            </div>

            <div className="lp-pricing-card featured">
              <div className="lp-pricing-badge">Most Popular</div>
              <div className="lp-pricing-name">Taska Team</div>
              <div className="lp-pricing-tagline">For small crews up to 5</div>
              <div className="lp-pricing-price">
                <span className="lp-price-dollar">$</span>
                <span className="lp-price-amount">49</span>
                <span className="lp-price-period">/mo AUD</span>
              </div>
              <div className="lp-pricing-users">Up to 5 users</div>
              <div className="lp-pricing-divider" />
              <ul className="lp-pricing-features">
                <li>Everything in Solo, plus:</li>
                <li><strong>Up to 5 technicians</strong></li>
                <li>Assign jobs to specific techs</li>
                <li>Full team schedule view</li>
                <li><strong>500 emails/month included</strong></li>
                <li><strong>200 SMS/month included</strong></li>
                <li>Customer portal</li>
                <li>Priority support</li>
              </ul>
              <Link href="/auth/register" className="lp-pricing-btn lp-pricing-btn-primary">Start Free Trial</Link>
            </div>

          </div>
          <p className="lp-pricing-note">🔒 14-day free trial on both plans. No charge until your trial ends. Cancel anytime.</p>
        </section>

        {/* PACKS */}
        <section className="lp-packs">
          <div className="lp-packs-inner">
            <h3>Need More SMS or Emails?</h3>
            <p className="lp-packs-sub">Top up anytime with add-on packs. No plan change needed. Packs never expire.</p>
            <div className="lp-packs-grid">
              {[
                { icon: "💬", name: "SMS", amount: "100 credits", price: "$5" },
                { icon: "💬", name: "SMS", amount: "500 credits", price: "$20" },
                { icon: "💬", name: "SMS", amount: "1,000 credits", price: "$35" },
                { icon: "📧", name: "Email", amount: "200 credits", price: "$3" },
                { icon: "📧", name: "Email", amount: "500 credits", price: "$7" },
                { icon: "📧", name: "Email", amount: "1,000 credits", price: "$12" },
              ].map((p, i) => (
                <div className="lp-pack-card" key={i}>
                  <div className="lp-pack-icon">{p.icon}</div>
                  <div className="lp-pack-name">{p.name}</div>
                  <div className="lp-pack-amount">{p.amount}</div>
                  <div className="lp-pack-price">{p.price}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* COMPARE */}
        <section className="lp-compare" id="compare">
          <div className="lp-compare-header">
            <div className="lp-label">How we stack up</div>
            <h2>Taska vs The Big Boys</h2>
            <p>We're not trying to beat ServiceTitan. We're built for tradies, not corporations.</p>
          </div>
          <div className="lp-compare-table">
            <table>
              <thead>
                <tr>
                  <th>Feature</th>
                  <th className="tc">Taska</th>
                  <th>ServiceM8</th>
                  <th>Tradify</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Starting price", "$29/mo", "$49/mo", "$35/mo"],
                  ["Built for solo tradies", "✓", "✗", "✗"],
                  ["Invoice viewed tracking", "✓", "✓", "✗"],
                  ["Xero integration", "✓", "✓", "✓"],
                  ["Equipment service scheduling", "✓", "✓", "✗"],
                  ["Auto-repeat service jobs", "✓", "✗", "✗"],
                  ["No bloat, no learning curve", "✓", "✗", "✗"],
                  ["Built by an actual tradie", "✓", "✗", "✗"],
                ].map((row, i) => (
                  <tr key={i}>
                    <td>{row[0]}</td>
                    <td className="tc">
                      {row[1] === "✓" ? <span className="lp-tick">✓</span>
                        : row[1] === "✗" ? <span className="lp-cross">✗</span>
                        : <strong>{row[1]}</strong>}
                    </td>
                    <td>{row[2] === "✓" ? <span className="lp-tick">✓</span> : row[2] === "✗" ? <span className="lp-cross">✗</span> : row[2]}</td>
                    <td>{row[3] === "✓" ? <span className="lp-tick">✓</span> : row[3] === "✗" ? <span className="lp-cross">✗</span> : row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
        <section className="lp-faq" id="faq">
          <div className="lp-faq-header">
            <div className="lp-label">Questions</div>
            <h2>Common Questions</h2>
          </div>
          <div className="lp-faq-list">
            {[
              { q: "Is there really a free trial?", a: <><strong>Yes — 14 days free on any plan.</strong> You won't be charged until your trial ends. Cancel any time before and you pay nothing.</> },
              { q: "Can I use it on my phone?", a: "Absolutely. Taska is designed mobile-first. Run your whole business from your phone in the van. Works on desktop too." },
              { q: "Do I need Xero?", a: "No. Xero is optional. If you use it, connect in settings and invoices sync automatically. If not, everything still works perfectly." },
              { q: "What trades is Taska for?", a: <>Any trade that does jobs and invoices — electricians, plumbers, mechanics, carpenters, landscapers, HVAC, forklift techs. <strong>If your work is job-based, Taska works for you.</strong></> },
              { q: "Can I import my existing customers?", a: "Yes. Import customers and equipment from Excel with one click. You don't have to start from scratch." },
              { q: "What if I need more SMS or emails?", a: "Buy a pack anytime from your account. No plan changes needed. Packs never expire." },
              { q: "Is there a lock-in contract?", a: <><strong>No.</strong> Month to month. Cancel whenever you want, no questions asked.</> },
            ].map((item, i) => (
              <div className="lp-faq-item" key={i}>
                <div className="lp-faq-q">{item.q}</div>
                <div className="lp-faq-a">{item.a}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="lp-cta">
          <h2>Ready To Get<br /><em>Your Time Back?</em></h2>
          <p>Join tradies already running their business on Taska. 14 days free, no lock-in.</p>
          <Link href="/auth/register" className="lp-btn-primary">Start Free Trial — It's $0 Today</Link>
        </section>

        {/* FOOTER */}
        <footer className="lp-footer">
          <div className="lp-footer-logo">
            <img src="/taska-logo.png" alt="Taska" />
          </div>
          <p>© 2026 Taska. Built in Australia for Australian tradies.</p>
          <div className="lp-footer-links">
            <Link href="/privacy">Privacy</Link>
            <a href="mailto:support@taska.info">Support</a>
          </div>
        </footer>

      </div>
    </>
  );
}
