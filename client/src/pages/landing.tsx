import taskaDemo from '@assets/ChatGPT Image Sep 14, 2025, 10_29_54 PM_1758980230668.jpg';
import taskaLogo from '@assets/Taska_1755842483680.png';
import taskaVideoDemo from '@assets/WhatsApp Video 2025-08-24 at 15.58.50_1757909355458.mp4';
import { FacebookPixelEvents } from '@/components/tracking/FacebookPixel';
import { Head } from '@/components/seo/Head';

export default function Landing() {
  // Handler for CTA button clicks
  const handleCTAClick = (action: string) => {
    FacebookPixelEvents.trackLead(`landing_${action}`);
  };

  // FAQ structured data for Google rich snippets
  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is the best job scheduling app for tradies?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Taska is a top-rated job scheduling app designed specifically for Australian tradies. It includes mobile scheduling, drag-and-drop calendar, SMS confirmations, and integrates quotes and invoicing in one platform."
        }
      },
      {
        "@type": "Question",
        "name": "How can tradies send invoices without paperwork?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "With Taska's invoice app, tradies can convert completed jobs to invoices with one click, send them via email."
        }
      },
      {
        "@type": "Question",
        "name": "What is field service management software?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Field service management software like Taska helps service businesses manage their entire workflow - from job scheduling and customer management to equipment tracking, quotes, invoices, and payments - all in one centralized platform."
        }
      },
      {
        "@type": "Question",
        "name": "Does Taska work for Australian tradie businesses?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes, Taska is built specifically for Australian service businesses with local features including Xero integration, Australian phone number formatting, and pricing in AUD."
        }
      }
    ]
  };

  return (
    <main>
      <Head 
        title="Taska | Field Service Management App for Tradies – Job Scheduling, Quotes & Invoicing"
        description="Taska is the all-in-one tradie app for job scheduling, quotes, invoices & equipment tracking. Built in Australia for field service businesses."
        canonical="https://www.taska.info"
        ogTitle="Taska | Field Service Management App for Tradies"
        ogDescription="Job scheduling, quotes & invoices made simple. Try Taska – Aussie-built field service software for tradies."
        ogImage="https://www.taska.info/attached_assets/Taska_1755842483680.png"
        ogUrl="https://www.taska.info"
        structuredData={faqStructuredData}
      />
      <style>{`
        :root {
          --bg: #0b0c0f;
          --surface: #0f1116;
          --card: #131722;
          --muted: #9aa4b2;
          --text: #e6e9ef;
          --brand: #2563eb;
          --brand-2: #22c55e;
          --ring: rgba(37,99,235,.5);
          --border: #1f2430;
        }
        * { box-sizing: border-box; }
        html, body, main { margin: 0; padding: 0; background: var(--surface); color: var(--text); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; }
        a { color: inherit; text-decoration: none; }
        .container { max-width: 1100px; margin: 0 auto; padding: 0 20px; }
        .header { position: sticky; top: 0; z-index: 50; background: linear-gradient(180deg, rgba(15,17,22,.9), rgba(15,17,22,.6) 60%, rgba(15,17,22,0)); backdrop-filter: saturate(150%) blur(8px); border-bottom: 1px solid var(--border); }
        .nav { display: flex; align-items: center; justify-content: space-between; height: 64px; }
        .brand { display: flex; gap: 10px; align-items: center; font-weight: 800; letter-spacing: .2px; }
        .logo { width: 28px; height: 28px; object-fit: contain; }
        .nav-links { display: none; gap: 18px; color: var(--muted); }
        .cta-row { display: flex; gap: 10px; }
        .btn { display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--border); background: #111522; color: var(--text); height: 40px; padding: 0 14px; border-radius: 12px; font-weight: 600; transition: all .18s ease; }
        .btn:hover { border-color: #2a3242; transform: translateY(-1px); }
        .btn.primary { background: linear-gradient(180deg, #2b6be7, #1d4ed8); border: none; box-shadow: 0 8px 20px rgba(37,99,235,.35); }
        .btn.primary:hover { filter: brightness(1.05); box-shadow: 0 12px 28px rgba(37,99,235,.45); }
        .btn.ghost { background: transparent; }

        .hero { padding: 72px 0 40px; position: relative; overflow: hidden; }
        .glow { position: absolute; inset: -20% -10% auto -10%; height: 420px; background: radial-gradient(600px 220px at 50% 10%, rgba(37,99,235,.18), transparent 60%), radial-gradient(800px 240px at 40% 0%, rgba(34,197,94,.12), transparent 60%); pointer-events:none; }
        .hero-grid { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 28px; align-items: center; }
        .eyebrow { display:inline-flex; gap:8px; align-items:center; padding:6px 10px; border-radius:999px; font-size:12px; color:#b7c0ce; border:1px solid var(--border); background: #0c111a; }
        .h1 { margin: 14px 0 10px; font-size: clamp(28px, 5vw, 48px); line-height: 1.06; font-weight: 900; letter-spacing:-.02em; }
        .lead { color: var(--muted); font-size: clamp(15px, 2.2vw, 18px); line-height: 1.65; max-width: 54ch; }
        .hero-ctas { display:flex; gap:12px; margin-top: 18px; flex-wrap: wrap; }
        .tiny { font-size: 12px; color: #9aa4b2; margin-top: 8px; }

        .mock { border: 1px solid var(--border); background: linear-gradient(180deg, #0f1420, #0c111a); border-radius: 16px; box-shadow: 0 12px 40px rgba(0,0,0,.5); overflow: hidden; }
        .mock .bar { height: 38px; background: #0b0f18; display:flex; gap:8px; align-items:center; padding:0 10px; border-bottom:1px solid var(--border); }
        .dot { width: 10px; height: 10px; border-radius: 50%; background: #374151; }
        .mock img, .mock video { width: 100%; display:block; aspect-ratio: 16/10; object-fit: cover; }
        .demo-gif { object-fit: contain !important; background: #0f1420; }

        .strip { padding: 46px 0; border-top:1px solid var(--border); border-bottom:1px solid var(--border); color: var(--muted); text-align:center; }
        
        /* Trust badges */
        .trust-badges { display: flex; justify-content: center; gap: 32px; flex-wrap: wrap; margin-top: 20px; }
        .trust-badge { display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .trust-badge .icon { font-size: 28px; }
        .trust-badge .label { font-size: 13px; color: var(--muted); font-weight: 600; }
        
        /* Social proof */
        .social-proof { background: linear-gradient(180deg, #131a27, #101520); border: 1px solid var(--border); border-radius: 12px; padding: 16px 24px; display: inline-flex; align-items: center; gap: 12px; margin-top: 20px; }
        .social-proof-stars { color: #fbbf24; font-size: 16px; }
        .social-proof-text { font-size: 14px; color: var(--muted); }

        .features { padding: 60px 0 30px; }
        .section-title { font-size: 28px; font-weight: 800; margin-bottom: 18px; text-align:center; }
        .feature-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .card { background: linear-gradient(180deg, #121722, #0f131d); border: 1px solid var(--border); border-radius: 16px; padding: 18px; }
        .card h3 { margin:10px 0 6px; font-size: 18px; }
        .card p { color: var(--muted); font-size: 14px; line-height: 1.6; }
        .icon { width: 36px; height: 36px; border-radius: 10px; display:grid; place-items:center; background: #0b1220; border:1px solid #1a2233; }

        /* Comparison table */
        .comparison { padding: 60px 0; }
        .comparison-table { background: linear-gradient(180deg, #131a27, #101520); border: 1px solid var(--border); border-radius: 18px; overflow: hidden; }
        .comparison-row { display: grid; grid-template-columns: 2fr repeat(4, 1fr); gap: 16px; padding: 16px 20px; border-bottom: 1px solid var(--border); align-items: center; }
        .comparison-row:last-child { border-bottom: none; }
        .comparison-header { background: linear-gradient(180deg, #1a2333, #131a27); font-weight: 700; }
        .comparison-feature { font-weight: 600; }
        .comparison-check { text-align: center; font-size: 18px; }
        .check-yes { color: #22c55e; }
        .check-no { color: #94a3b8; opacity: 0.4; }
        .highlight-col { background: rgba(37, 99, 235, 0.05); }

        .demo { padding: 30px 0 20px; }
        .demo-inner { display:grid; grid-template-columns: 1fr 1fr; gap: 22px; align-items:center; }
        .demo .note { color: var(--muted); font-size: 14px; margin-top: 8px; }

        .pricing { padding: 60px 0; }
        .price-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .price { background: linear-gradient(180deg, #131a27, #101520); border: 1px solid var(--border); border-radius: 18px; padding: 20px; display:flex; flex-direction:column; justify-content:space-between; }
        .price .pill { display:inline-block; font-size:12px; padding:6px 10px; border:1px solid var(--border); border-radius:999px; color:#b7c0ce; }
        .price h4 { margin:10px 0 8px; font-size: 18px; }
        .price .amount { font-size: 36px; font-weight: 900; display:flex; gap: 6px; align-items:flex-end; }
        .price ul { list-style:none; padding:0; margin: 12px 0; display:grid; gap: 8px; }
        .price li { display:flex; gap: 8px; align-items:flex-start; color: var(--muted); font-size: 14px; }
        .tick { width: 18px; height: 18px; border:1px solid #1a2a1d; border-radius:6px; background: radial-gradient(120px 60px at -10% -10%, rgba(34,197,94,.25), transparent); display:grid; place-items:center; }
        .price .cta { margin-top: 6px; }
        .popular { outline: 2px solid rgba(37,99,235,.5); box-shadow: 0 0 0 6px rgba(37,99,235,.1); position:relative; }
        .popular .ribbon { position:absolute; top: -12px; left: 16px; background: #1d4ed8; color:white; font-size:12px; padding:4px 8px; border-radius:999px; }

        .faq { padding: 10px 0 60px; }
        .faq-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        details { background:#0f131d; border:1px solid var(--border); border-radius:14px; padding:14px 16px; }
        summary { cursor:pointer; font-weight:700; }
        details p { color: var(--muted); margin:10px 0 0; }

        .footer { border-top:1px solid var(--border); padding: 24px 0 40px; color:#a2adbb; }
        .foot { display:flex; align-items:center; justify-content:space-between; gap: 20px; flex-wrap: wrap; }
        .fine { color:#7c8797; font-size:13px; }

        @media (max-width: 980px) {
          .hero-grid { grid-template-columns: 1fr; }
          .feature-grid, .price-grid, .demo-inner, .faq-grid { grid-template-columns: 1fr; }
          .nav-links { display: none; }
          .packs-grid { grid-template-columns: 1fr !important; }
          .comparison-row { grid-template-columns: 1fr; }
          .comparison-row > *:not(:first-child) { display: none; }
          .trust-badges { gap: 16px; }
        }
        .packs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: start; }
        @media (min-width: 981px) {
          .nav-links { display: flex; }
        }
      `}</style>

      {/* Header */}
      <header className="header">
        <div className="container nav">
          <a href="/" className="brand" aria-label="Taska home">
            <img src={taskaLogo} alt="Taska field service management app logo" className="logo" /> <span>Taska</span>
          </a>
          <nav className="nav-links" aria-label="Primary">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="/blog">Blog</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="cta-row">
            <a className="btn ghost" href="/auth/login">Log in</a>
            <a className="btn primary" href="/auth/register">Start Free Trial</a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="hero">
        <div className="glow" aria-hidden />
        <div className="container hero-grid">
          <div>
            <span className="eyebrow">✨ Trusted by 50+ Australian tradies · 14‑day free trial</span>
            <h1 className="h1">Field Service Management App for Tradies</h1>
            <p className="lead">Taska is the fast, simple tradie software and job scheduling app for managing customers, equipment, quotes and invoices — all in one place, on desktop and mobile. Built for Australian service businesses.</p>
            
            {/* Trust badges */}
            <div className="trust-badges">
              <div className="trust-badge">
                <div className="icon">✓</div>
                <div className="label">14-Day Free Trial</div>
              </div>
              <div className="trust-badge">
                <div className="icon">💳</div>
                <div className="label">No Credit Card</div>
              </div>
              <div className="trust-badge">
                <div className="icon">🔒</div>
                <div className="label">Cancel Anytime</div>
              </div>
            </div>
            
            <div className="hero-ctas">
              <a className="btn primary" href="/auth/register" onClick={() => handleCTAClick('start_free')}>Start Free Trial →</a>
              <a className="btn" href="#pricing" onClick={() => handleCTAClick('see_pricing')}>See Pricing</a>
              <a className="btn ghost" href="#demo" onClick={() => handleCTAClick('watch_demo')}>Watch Demo</a>
            </div>
            
            <div style={{ marginTop: '16px' }}>
              <a 
                href="https://play.google.com/store/apps/details?id=info.taska.app" 
                target="_blank" 
                rel="noopener noreferrer"
                onClick={() => handleCTAClick('play_store')}
                data-testid="button-play-store"
                style={{
                  display: 'inline-block',
                  backgroundColor: '#000',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  border: '1px solid #333',
                  transition: 'all 0.2s ease',
                  textDecoration: 'none'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#1a1a1a';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#000';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M3 20.5v-17c0-.46.37-.83.83-.83.17 0 .33.05.47.14L20.5 12 4.3 21.36c-.14.09-.3.14-.47.14-.46 0-.83-.37-.83-.83v-.17z" fill="#34A853"/>
                    <path d="M20.5 12L15.6 7.1c-.39-.39-1.02-.39-1.41 0L4.3 2.64c.14-.09.3-.14.47-.14.46 0 .83.37.83.83v17c0 .46-.37.83-.83.83-.17 0-.33-.05-.47-.14L14.19 12.9c.39-.39 1.02-.39 1.41 0z" fill="#EA4335"/>
                    <path d="M20.5 12l-5.9 4.9c-.39.39-1.02.39-1.41 0L4.3 21.36c.14.09.3.14.47.14.46 0 .83-.37.83-.83v-17c0-.46-.37-.83-.83-.83-.17 0-.33.05-.47.14L13.19 11.1c.39.39 1.02.39 1.41 0z" fill="#FBBC04"/>
                    <path d="M13.19 11.1l-.9.9c-.39.39-1.02.39-1.41 0L4.3 2.64 4.3 21.36l6.58-9.46c.39-.39 1.02-.39 1.41 0l.9-.9z" fill="#4285F4"/>
                  </svg>
                  <div style={{ color: '#fff', fontSize: '14px', fontWeight: '600' }}>
                    <div style={{ fontSize: '10px', opacity: 0.7 }}>GET IT ON</div>
                    <div>Google Play</div>
                  </div>
                </div>
              </a>
            </div>
            <div className="tiny">Set up in minutes. Get paid faster. Less admin, more jobs done.</div>
          </div>

          <div className="mock" aria-label="App preview">
            <div className="bar">
              <span className="dot" /><span className="dot" /><span className="dot" />
            </div>
            <img 
              src={taskaDemo} 
              alt="Power up your workflow - Taska field service management dashboard"
              className="demo-gif"
              loading="eager"
              fetchPriority="high"
              decoding="async"
              width="1400"
              height="900"
            />
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <div className="strip">
        <div className="container">
          <div style={{marginBottom: '12px', fontSize: '18px', fontWeight: '700', color: '#e6e9ef'}}>Join 50+ Aussie tradies already using Taska</div>
          Built for crews in the field — forklift techs, sparkies, mobile mechanics & more.
        </div>
      </div>

      {/* Features */}
      <section id="features" className="features container">
        <h2 className="section-title">Job Scheduling, Quotes & Invoicing Made Simple</h2>
        <div className="feature-grid">
          <article className="card">
            <div className="icon">📋</div>
            <h3>Job Scheduling App</h3>
            <p>Schedule, track, and complete jobs with our powerful job scheduling app. Real‑time updates and photo attachments keep your team connected.</p>
          </article>
          <article className="card">
            <div className="icon">👤</div>
            <h3>Customer Management</h3>
            <p>Customer history, notes, and equipment tracking — everything in one place so you look professional and work efficiently.</p>
          </article>
          <article className="card">
            <div className="icon">💸</div>
            <h3>Invoice App Australia</h3>
            <p>Generate quotes and invoices in seconds with our invoice app. Convert completed jobs to invoices with one click and get paid faster.</p>
          </article>
          <article className="card">
            <div className="icon">🗓️</div>
            <h3>Tradie Software</h3>
            <p>Drag‑and‑drop calendar and clean mobile schedule designed specifically for Australian tradies and field service teams.</p>
          </article>
          <article className="card">
            <div className="icon">🛠️</div>
            <h3>Equipment Tracking</h3>
            <p>Track machines, serial numbers, and service history. Perfect for field service management across multiple job sites.</p>
          </article>
          <article className="card">
            <div className="icon">🧾</div>
            <h3>Payments & Xero Integration</h3>
            <p>Stripe payments and Xero integration built for Australian businesses. Get paid faster and reconcile your books without the hassle.</p>
          </article>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="comparison container">
        <h2 className="section-title">Taska vs Tradify, ServiceM8 & Spreadsheets</h2>
        <p style={{textAlign: 'center', color: 'var(--muted)', marginBottom: '24px'}}>See why Aussie tradies are switching to Taska</p>
        
        <div className="comparison-table">
          <div className="comparison-row comparison-header">
            <div className="comparison-feature">Feature</div>
            <div>Taska</div>
            <div>Tradify</div>
            <div>ServiceM8</div>
            <div>Spreadsheets</div>
          </div>
          <div className="comparison-row">
            <div className="comparison-feature">Mobile App</div>
            <div className="comparison-check check-yes highlight-col">✓</div>
            <div className="comparison-check check-yes">✓</div>
            <div className="comparison-check check-yes">✓</div>
            <div className="comparison-check check-no">—</div>
          </div>
          <div className="comparison-row">
            <div className="comparison-feature">Equipment Tracking</div>
            <div className="comparison-check check-yes highlight-col">✓</div>
            <div className="comparison-check check-no">—</div>
            <div className="comparison-check check-yes">✓</div>
            <div className="comparison-check check-no">—</div>
          </div>
          <div className="comparison-row">
            <div className="comparison-feature">Customer Portal</div>
            <div className="comparison-check check-yes highlight-col">✓</div>
            <div className="comparison-check check-no">—</div>
            <div className="comparison-check check-no">—</div>
            <div className="comparison-check check-no">—</div>
          </div>
          <div className="comparison-row">
            <div className="comparison-feature">Free Trial</div>
            <div className="comparison-check check-yes highlight-col">14 days</div>
            <div className="comparison-check check-yes">14 days</div>
            <div className="comparison-check check-yes">14 days</div>
            <div className="comparison-check check-yes">Free</div>
          </div>
          <div className="comparison-row">
            <div className="comparison-feature">Starting Price</div>
            <div className="comparison-check highlight-col" style={{color: '#22c55e', fontWeight: '700'}}>$29/mo</div>
            <div className="comparison-check">$49/mo</div>
            <div className="comparison-check">$39/mo</div>
            <div className="comparison-check">Free*</div>
          </div>
          <div className="comparison-row">
            <div className="comparison-feature">Setup Time</div>
            <div className="comparison-check check-yes highlight-col">5 min</div>
            <div className="comparison-check">30 min</div>
            <div className="comparison-check">45 min</div>
            <div className="comparison-check">Hours</div>
          </div>
        </div>
        <p style={{textAlign: 'center', fontSize: '13px', color: '#7c8797', marginTop: '16px'}}>* Spreadsheets are "free" but cost you time, errors, and lost revenue</p>
      </section>

      {/* Demo */}
      <section id="demo" className="demo container">
        <div className="demo-inner">
          <div className="mock">
            <div className="bar"><span className="dot" /><span className="dot" /><span className="dot" /></div>
            <video 
              src={taskaVideoDemo} 
              controls 
              muted 
              loop
              preload="none"
              style={{width: '100%', display: 'block', aspectRatio: '16/10', objectFit: 'cover'}}
              aria-label="Taska invoice app for Australian service businesses"
            >
              Your browser does not support the video tag.
            </video>
          </div>
          <div>
            <h2 className="section-title" style={{textAlign:'left'}}>See Taska in action</h2>
            <p className="lead">Create a job, assign a tech, capture photos, and turn it into an invoice — all in under a minute. Watch how our field service management software streamlines your entire tradie workflow from start to finish.</p>
            <div className="hero-ctas">
              <a className="btn primary" href="/auth/register" onClick={() => handleCTAClick('start_trial')}>Start Free Trial →</a>
              <a className="btn" href="/auth/login" onClick={() => handleCTAClick('login')}>Log in</a>
            </div>
            <div className="note">No credit card required · Cancel anytime</div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="pricing container">
        <h2 className="section-title">Simple, Transparent Pricing</h2>
        <p className="strip" style={{marginTop:12, marginBottom:22, background:'transparent', border:'none'}}>No hidden fees. No setup costs. Just simple pricing that grows with your business.</p>
        <div className="price-grid">
          <div className="price">
            <div>
              <span className="pill">Solo</span>
              <h4>Taska Solo</h4>
              <div className="amount"><span>$29</span><small>/month</small></div>
              <ul>
                <li><span className="tick">✓</span> 1 user</li>
                <li><span className="tick">✓</span> 100 SMS & emails monthly</li>
                <li><span className="tick">✓</span> Jobs, customers, equipment</li>
                <li><span className="tick">✓</span> Quotes & invoices</li>
                <li><span className="tick">✓</span> Mobile scheduling</li>
                <li><span className="tick">✓</span> Advanced scheduling</li>
                <li><span className="tick">✓</span> Email support</li>
                <li><span className="tick">✓</span> AI and Chat support</li>
                <li><span className="tick">✓</span> Xero integration</li>
                <li><span className="tick">✓</span> SMS job confirmations</li>
              </ul>
            </div>
            <a className="btn cta" href="/auth/register?plan=solo">Start Free Trial</a>
          </div>

          <div className="price popular">
            <div className="ribbon">Most Popular</div>
            <div>
              <span className="pill">Pro</span>
              <h4>Taska Pro</h4>
              <div className="amount"><span>$49</span><small>/month</small></div>
              <ul>
                <li><span className="tick">✓</span> Up to 5 users</li>
                <li><span className="tick">✓</span> 500 SMS & emails monthly</li>
                <li><span className="tick">✓</span> Jobs, customers, equipment</li>
                <li><span className="tick">✓</span> Quotes & invoices</li>
                <li><span className="tick">✓</span> Mobile scheduling</li>
                <li><span className="tick">✓</span> Advanced scheduling</li>
                <li><span className="tick">✓</span> Email support</li>
                <li><span className="tick">✓</span> AI and Chat support</li>
                <li><span className="tick">✓</span> Xero integration</li>
                <li><span className="tick">✓</span> SMS job confirmations</li>
              </ul>
            </div>
            <a className="btn primary cta" href="/auth/register?plan=pro">Start Free Trial →</a>
          </div>

          <div className="price">
            <div>
              <span className="pill">Enterprise</span>
              <h4>Taska Enterprise</h4>
              <div className="amount"><span>$99</span><small>/month</small></div>
              <ul>
                <li><span className="tick">✓</span> Up to 12 users</li>
                <li><span className="tick">✓</span> 2,000 SMS & emails monthly</li>
                <li><span className="tick">✓</span> Jobs, customers, equipment</li>
                <li><span className="tick">✓</span> Quotes & invoices</li>
                <li><span className="tick">✓</span> Mobile scheduling</li>
                <li><span className="tick">✓</span> Advanced scheduling</li>
                <li><span className="tick">✓</span> Email support</li>
                <li><span className="tick">✓</span> AI and Chat support</li>
                <li><span className="tick">✓</span> Xero integration</li>
                <li><span className="tick">✓</span> SMS job confirmations</li>
              </ul>
            </div>
            <a className="btn cta" href="/auth/register?plan=enterprise">Start Free Trial</a>
          </div>
        </div>
        <p className="tiny container" style={{textAlign:'center', marginTop:16}}>All plans include 14‑day free trial · No setup fees · Cancel anytime</p>
      </section>

      {/* Add-on Packs */}
      <section className="pricing container" style={{paddingTop: '30px'}}>
        <h2 className="section-title">Need more SMS & emails?</h2>
        <p className="strip" style={{marginTop:12, marginBottom:22, background:'transparent', border:'none'}}>Purchase add-on packs when you need extra credits</p>
        
        <div className="packs-grid">
          <div>
            <h3 style={{fontSize:'20px', fontWeight:'700', marginBottom:'16px', color:'#e6e9ef'}}>📱 SMS Packs</h3>
            <div style={{display:'grid', gap:'12px'}}>
              <div style={{background:'linear-gradient(180deg, #131a27, #101520)', border:'1px solid var(--border)', borderRadius:'12px', padding:'16px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:'600', color:'#e6e9ef'}}>100 SMS Credits</div>
                  <div style={{fontSize:'13px', color:'var(--muted)'}}>Perfect for small teams</div>
                </div>
                <div style={{fontSize:'20px', fontWeight:'700', color:'#e6e9ef'}}>$5</div>
              </div>
              <div style={{background:'linear-gradient(180deg, #131a27, #101520)', border:'1px solid var(--border)', borderRadius:'12px', padding:'16px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:'600', color:'#e6e9ef'}}>500 SMS Credits</div>
                  <div style={{fontSize:'13px', color:'var(--muted)'}}>Great value for growing teams</div>
                </div>
                <div style={{fontSize:'20px', fontWeight:'700', color:'#e6e9ef'}}>$20</div>
              </div>
              <div style={{background:'linear-gradient(180deg, #131a27, #101520)', border:'1px solid var(--border)', borderRadius:'12px', padding:'16px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:'600', color:'#e6e9ef'}}>1,000 SMS Credits</div>
                  <div style={{fontSize:'13px', color:'var(--muted)'}}>Best value for high volume</div>
                </div>
                <div style={{fontSize:'20px', fontWeight:'700', color:'#e6e9ef'}}>$35</div>
              </div>
            </div>
          </div>
          
          <div>
            <h3 style={{fontSize:'20px', fontWeight:'700', marginBottom:'16px', color:'#e6e9ef'}}>📧 Email Packs</h3>
            <div style={{display:'grid', gap:'12px'}}>
              <div style={{background:'linear-gradient(180deg, #131a27, #101520)', border:'1px solid var(--border)', borderRadius:'12px', padding:'16px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:'600', color:'#e6e9ef'}}>200 Email Credits</div>
                  <div style={{fontSize:'13px', color:'var(--muted)'}}>Perfect for small teams</div>
                </div>
                <div style={{fontSize:'20px', fontWeight:'700', color:'#e6e9ef'}}>$3</div>
              </div>
              <div style={{background:'linear-gradient(180deg, #131a27, #101520)', border:'1px solid var(--border)', borderRadius:'12px', padding:'16px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:'600', color:'#e6e9ef'}}>500 Email Credits</div>
                  <div style={{fontSize:'13px', color:'var(--muted)'}}>Great value for growing teams</div>
                </div>
                <div style={{fontSize:'20px', fontWeight:'700', color:'#e6e9ef'}}>$7</div>
              </div>
              <div style={{background:'linear-gradient(180deg, #131a27, #101520)', border:'1px solid var(--border)', borderRadius:'12px', padding:'16px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:'600', color:'#e6e9ef'}}>1,000 Email Credits</div>
                  <div style={{fontSize:'13px', color:'var(--muted)'}}>Best value for high volume</div>
                </div>
                <div style={{fontSize:'20px', fontWeight:'700', color:'#e6e9ef'}}>$12</div>
              </div>
            </div>
          </div>
        </div>
        
        <p className="tiny container" style={{textAlign:'center', marginTop:20}}>Add-on packs are available inside the app when you reach your monthly limits · Credits expire after 6 months</p>
      </section>

      {/* SEO FAQ for Tradies */}
      <section className="faq container" style={{paddingTop: '30px'}}>
        <h2 className="section-title">Taska vs Tradify, ServiceM8 & Other Job Scheduling Apps</h2>
        <div className="faq-grid">
          <details>
            <summary>What is the best <strong>job scheduling app</strong> for tradies?</summary>
            <p>Taska is a top-rated job scheduling app designed specifically for Australian tradies. It includes mobile scheduling, drag-and-drop calendar, SMS confirmations, and integrates quotes and invoicing in one platform - making it the complete field service management solution.</p>
          </details>
          <details>
            <summary>How can <strong>tradies send invoices</strong> without paperwork?</summary>
            <p>With Taska's invoice app, tradies can convert completed jobs to invoices with one click, send them via email. No more paper invoices or manual data entry required.</p>
          </details>
          <details>
            <summary>What is <strong>field service management software</strong>?</summary>
            <p>Field service management software like Taska helps service businesses manage their entire workflow - from job scheduling and customer management to equipment tracking, quotes, invoices, and payments - all in one centralized platform designed for mobile teams.</p>
          </details>
          <details>
            <summary>Does Taska work for Australian tradie businesses?</summary>
            <p>Yes, Taska is built specifically for Australian service businesses with local features including Xero integration, Australian phone number formatting, AUD pricing, and timezone support for Australia/Melbourne operations.</p>
          </details>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="faq container">
        <h2 className="section-title">Common questions</h2>
        <div className="faq-grid">
          <details>
            <summary>Do I need a credit card to start?</summary>
            <p>Nope. Start your 14‑day trial without a card. If Taska saves you time, upgrade in two clicks.</p>
          </details>
          <details>
            <summary>Is there a mobile app?</summary>
            <p>Yes — Taska runs beautifully on mobile. Your crew can see jobs, add notes, photos, and complete jobs on site.</p>
          </details>
          <details>
            <summary>Can I import my customers?</summary>
            <p>Absolutely. Upload a CSV and you're off. We'll guide you through it during onboarding.</p>
          </details>
          <details>
            <summary>Does Taska integrate with Xero?</summary>
            <p>Yes. Connect Xero to sync invoices and keep your books tight with minimal effort.</p>
          </details>
          <details>
            <summary>What happens when I run out of SMS or email credits?</summary>
            <p>When you reach your monthly limit, you can purchase add-on packs instantly inside the app. Credits are available immediately and expire after 6 months.</p>
          </details>
          <details>
            <summary>Can I change my plan anytime?</summary>
            <p>Absolutely. Upgrade or downgrade your plan anytime from your account settings. Changes take effect immediately with pro-rated billing.</p>
          </details>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container foot">
          <div className="brand"><span className="logo" /><span>Taska</span></div>
          <div className="fine">© {new Date().getFullYear()} Taska. All rights reserved.</div>
        </div>
      </footer>
    </main>
  );
}
