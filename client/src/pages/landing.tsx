import taskaDemo from '@assets/ChatGPT Image Sep 14, 2025, 10_29_54 PM_1758980230668.jpg';
import taskaVideoDemo from '@assets/WhatsApp Video 2025-08-24 at 15.58.50_1757909355458.mp4';
import { FacebookPixelEvents } from '@/components/tracking/FacebookPixel';
import { Head } from '@/components/seo/Head';

export default function Landing() {
  const handleCTAClick = (action: string) => {
    FacebookPixelEvents.trackLead(`landing_${action}`);
  };

  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is the best job scheduling app for tradies?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Taska is a top-rated job scheduling app designed specifically for Australian tradies. It includes mobile scheduling, SMS confirmations, and integrates quotes and invoicing in one platform."
        }
      },
      {
        "@type": "Question",
        "name": "How can tradies send invoices without paperwork?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "With Taska, tradies can convert completed jobs to invoices with one click and send them via email instantly."
        }
      },
      {
        "@type": "Question",
        "name": "Does Taska work for Australian tradie businesses?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes, Taska is built specifically for Australian service businesses with Xero integration, AUD pricing, and Australian phone number support."
        }
      }
    ]
  };

  return (
    <main>
      <Head
        title="Taska | Job Scheduling, Quotes & Invoicing for Tradies"
        description="Built by a tradie, for tradies. Job scheduling, quotes, invoices and Xero sync without the enterprise price tag. From $29/month AUD."
        canonical="https://www.taska.info"
        ogTitle="Taska | Field Service Management for Tradies"
        ogDescription="Built by a tradie, for tradies. $29/month. 14-day free trial."
        ogImage="https://www.taska.info/attached_assets/Taska_1755842483680.png"
        ogUrl="https://www.taska.info"
        structuredData={faqStructuredData}
      />
      <style>{`
        :root {
          --surface: #0D1117;
          --dark2: #161B27;
          --dark3: #1E2535;
          --muted: #7B8BAE;
          --text: #E8EDF8;
          --blue1: #1AACE8;
          --blue2: #2563EB;
          --grad: linear-gradient(135deg, #1AACE8 0%, #2563EB 100%);
          --border: rgba(255,255,255,0.07);
          --border-blue: rgba(26,172,232,0.25);
        }
        * { box-sizing: border-box; }
        html, body, main { margin: 0; padding: 0; background: var(--surface); color: var(--text); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
        a { color: inherit; text-decoration: none; }
        .container { max-width: 1100px; margin: 0 auto; padding: 0 20px; }

        /* NAV */
        .header { position: sticky; top: 0; z-index: 50; background: rgba(13,17,23,0.94); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); }
        .nav { display: flex; align-items: center; justify-content: space-between; height: 64px; }
        .brand { display: flex; gap: 10px; align-items: center; font-weight: 800; }
        .logo { height: 36px; width: auto; }
        .nav-links { display: none; gap: 20px; color: var(--muted); font-size: 14px; }
        .nav-links a:hover { color: var(--text); }
        .cta-row { display: flex; gap: 10px; }
        .btn { display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--border); background: rgba(255,255,255,0.05); color: var(--text); height: 40px; padding: 0 16px; border-radius: 10px; font-weight: 600; font-size: 14px; transition: all .18s ease; cursor: pointer; }
        .btn:hover { border-color: var(--border-blue); }
        .btn.primary { background: var(--grad); border: none; box-shadow: 0 6px 20px rgba(26,172,232,.35); color: #fff; }
        .btn.primary:hover { opacity: 0.88; transform: translateY(-1px); }
        .btn.ghost { background: transparent; }

        /* HERO */
        .hero { padding: 80px 0 50px; position: relative; overflow: hidden; }
        .glow { position: absolute; inset: -20% -10% auto -10%; height: 420px; background: radial-gradient(600px 220px at 50% 10%, rgba(26,172,232,.15), transparent 60%), radial-gradient(800px 240px at 40% 0%, rgba(37,99,235,.1), transparent 60%); pointer-events:none; }
        .hero-grid { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 32px; align-items: center; }
        .eyebrow { display:inline-flex; gap:8px; align-items:center; padding:6px 12px; border-radius:999px; font-size:12px; color: var(--blue1); border:1px solid var(--border-blue); background: rgba(26,172,232,0.08); margin-bottom: 16px; }
        .h1 { margin: 0 0 16px; font-size: clamp(28px, 5vw, 50px); line-height: 1.05; font-weight: 900; letter-spacing:-.02em; }
        .h1 em { font-style: normal; background: var(--grad); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .lead { color: var(--muted); font-size: clamp(15px, 2vw, 17px); line-height: 1.7; max-width: 52ch; margin-bottom: 8px; }
        .hero-ctas { display:flex; gap:12px; margin-top: 24px; flex-wrap: wrap; }
        .reassurance { font-size: 12px; color: var(--muted); margin-top: 10px; }
        .tiny { font-size: 12px; color: var(--muted); margin-top: 8px; }

        /* MOCK BROWSER */
        .mock { border: 1px solid var(--border); background: linear-gradient(180deg, #0f1420, #0c111a); border-radius: 16px; box-shadow: 0 12px 40px rgba(0,0,0,.5); overflow: hidden; }
        .mock .bar { height: 38px; background: #0b0f18; display:flex; gap:8px; align-items:center; padding:0 10px; border-bottom:1px solid var(--border); }
        .dot { width: 10px; height: 10px; border-radius: 50%; background: #374151; }
        .mock img, .mock video { width: 100%; display:block; aspect-ratio: 16/10; object-fit: cover; }
        .demo-gif { object-fit: contain !important; background: #0f1420; }

        /* STRIP */
        .strip { padding: 40px 0; border-top:1px solid var(--border); border-bottom:1px solid var(--border); color: var(--muted); text-align:center; }

        /* STORY */
        .story { padding: 80px 0; background: var(--dark2); }
        .story-inner { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: center; max-width: 960px; margin: 0 auto; padding: 0 20px; }
        .story-label { font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--blue1); margin-bottom: 12px; }
        .story h2 { font-size: clamp(24px, 4vw, 36px); font-weight: 900; margin: 0 0 16px; line-height: 1.1; }
        .story p { color: var(--muted); line-height: 1.8; margin-bottom: 12px; font-size: 15px; }
        .story p strong { color: var(--text); }
        .story-quote { background: var(--dark3); border-left: 3px solid var(--blue1); border-radius: 0 12px 12px 0; padding: 24px; box-shadow: 0 0 40px rgba(26,172,232,0.06); }
        .story-quote p { font-size: 18px; font-weight: 700; color: #fff; line-height: 1.4; margin: 0; font-style: italic; }
        .story-quote cite { display: block; margin-top: 12px; font-size: 13px; color: var(--muted); font-style: normal; }

        /* FEATURES */
        .section-label { font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--blue1); margin-bottom: 12px; text-align: center; }
        .features { padding: 80px 0; }
        .section-title { font-size: clamp(22px, 4vw, 32px); font-weight: 800; margin-bottom: 8px; text-align:center; }
        .section-sub { color: var(--muted); text-align: center; margin-bottom: 40px; font-size: 15px; }
        .feature-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .card { background: var(--dark3); border: 1px solid var(--border); border-radius: 14px; padding: 20px; transition: border-color 0.2s, transform 0.2s; }
        .card:hover { border-color: var(--border-blue); transform: translateY(-2px); }
        .card h3 { margin:10px 0 6px; font-size: 16px; font-weight: 700; }
        .card p { color: var(--muted); font-size: 13px; line-height: 1.65; margin: 0; }
        .icon { font-size: 24px; margin-bottom: 4px; display: block; }

        /* COMPARISON */
        .comparison { padding: 80px 0; background: var(--dark2); }
        .comparison-table { background: var(--dark3); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
        .comparison-row { display: grid; grid-template-columns: 2fr repeat(4, 1fr); gap: 16px; padding: 14px 20px; border-bottom: 1px solid var(--border); align-items: center; }
        .comparison-row:last-child { border-bottom: none; }
        .comparison-header { background: rgba(26,172,232,0.06); font-weight: 700; font-size: 13px; color: var(--muted); }
        .comparison-feature { font-weight: 600; font-size: 14px; }
        .comparison-check { text-align: center; font-size: 16px; }
        .check-yes { color: #4ADE80; }
        .check-no { color: #94a3b8; opacity: 0.4; }
        .highlight-col { color: var(--blue1) !important; font-weight: 700; }

        /* DEMO */
        .demo { padding: 80px 0; }
        .demo-inner { display:grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items:center; }
        .demo .note { color: var(--muted); font-size: 13px; margin-top: 10px; }

        /* PRICING */
        .pricing { padding: 80px 0; background: var(--dark2); }
        .price-grid { display:grid; grid-template-columns: repeat(2, 1fr); gap: 20px; max-width: 720px; margin: 0 auto; }
        .price { background: var(--dark3); border: 1px solid var(--border); border-radius: 16px; padding: 24px; display:flex; flex-direction:column; justify-content:space-between; }
        .price.popular { border-color: var(--blue1); box-shadow: 0 0 40px rgba(26,172,232,0.12); position: relative; }
        .ribbon { position:absolute; top: -12px; left: 16px; background: var(--grad); color:white; font-size:11px; padding:4px 10px; border-radius:999px; font-weight: 700; box-shadow: 0 4px 12px rgba(26,172,232,.35); }
        .pill { display:inline-block; font-size:11px; padding:4px 10px; border:1px solid var(--border); border-radius:999px; color: var(--muted); margin-bottom: 8px; }
        .price h4 { margin:0 0 8px; font-size: 20px; font-weight: 800; }
        .price .amount { font-size: 40px; font-weight: 900; display:flex; gap: 4px; align-items:flex-end; margin-bottom: 4px; }
        .price .amount small { font-size: 14px; font-weight: 400; color: var(--muted); margin-bottom: 6px; }
        .price ul { list-style:none; padding:0; margin: 16px 0; display:grid; gap: 10px; }
        .price li { display:flex; gap: 8px; align-items:flex-start; color: var(--muted); font-size: 14px; }
        .price li strong { color: var(--text); }
        .tick { color: var(--blue1); font-weight: 700; flex-shrink: 0; }
        .price .cta { margin-top: 8px; width: 100%; justify-content: center; }

        /* PACKS */
        .packs { padding: 60px 0; }
        .packs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: start; }
        .pack-item { background: var(--dark3); border: 1px solid var(--border); border-radius: 12px; padding: 16px; display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px; }
        .pack-item:last-child { margin-bottom: 0; }
        .pack-name { font-weight: 600; color: var(--text); font-size: 14px; }
        .pack-desc { font-size: 12px; color: var(--muted); margin-top: 2px; }
        .pack-price { font-size: 18px; font-weight: 700; color: var(--blue1); }

        /* FAQ */
        .faq { padding: 80px 0; background: var(--dark2); }
        .faq-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; max-width: 860px; margin: 0 auto; }
        details { background: var(--dark3); border:1px solid var(--border); border-radius:12px; padding:14px 16px; }
        details[open] { border-color: var(--border-blue); }
        summary { cursor:pointer; font-weight:700; font-size: 14px; list-style: none; }
        summary::-webkit-details-marker { display: none; }
        details p { color: var(--muted); margin:10px 0 0; font-size: 14px; line-height: 1.65; }

        /* CTA BANNER */
        .cta-banner { padding: 80px 20px; text-align: center; position: relative; overflow: hidden; }
        .cta-banner::before { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 600px; height: 400px; background: radial-gradient(ellipse, rgba(26,172,232,0.1) 0%, transparent 70%); pointer-events: none; }
        .cta-banner h2 { font-size: clamp(28px, 5vw, 48px); font-weight: 900; margin-bottom: 16px; position: relative; }
        .cta-banner h2 em { font-style: normal; background: var(--grad); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .cta-banner p { color: var(--muted); margin-bottom: 28px; font-size: 16px; position: relative; }

        /* FOOTER */
        .footer { border-top:1px solid var(--border); padding: 28px 0; color: var(--muted); }
        .foot { display:flex; align-items:center; justify-content:space-between; gap: 20px; flex-wrap: wrap; }
        .brand { display: flex; gap: 10px; align-items: center; font-weight: 800; color: var(--text); }
        .fine { color:#7c8797; font-size:13px; }

        @media (max-width: 980px) {
          .hero-grid, .story-inner, .feature-grid, .price-grid, .demo-inner, .faq-grid, .packs-grid { grid-template-columns: 1fr; }
          .nav-links { display: none !important; }
          .comparison-row { grid-template-columns: 1fr; }
          .comparison-row > *:not(:first-child) { display: none; }
          .foot { flex-direction: column; text-align: center; }
        }
        @media (min-width: 981px) {
          .nav-links { display: flex; }
        }
      `}</style>

      {/* HEADER */}
      <header className="header">
        <div className="container nav">
          <a href="/" className="brand" aria-label="Taska home">
            <img src="/assets/taska-logo.png" alt="Taska" className="logo" />
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

      {/* HERO */}
      <section className="hero">
        <div className="glow" aria-hidden />
        <div className="container hero-grid">
          <div>
            <div className="eyebrow">🔧 Built by a tradie, for tradies · 14‑day free trial</div>
            <h1 className="h1">Stop Paying For<br /><em>Software You Hate.</em></h1>
            <p className="lead">Taska does jobs, quotes, invoices and Xero sync — without the bloat, the 400 features you'll never use, or the enterprise price tag.</p>
            <p className="lead"><strong style={{color: 'var(--text)'}}>From $29/month AUD.</strong></p>
            <div className="hero-ctas">
              <a className="btn primary" href="/auth/register" onClick={() => handleCTAClick('start_free')}>Start Free Trial →</a>
              <a className="btn" href="#pricing" onClick={() => handleCTAClick('see_pricing')}>See Pricing</a>
              <a className="btn ghost" href="#demo" onClick={() => handleCTAClick('watch_demo')}>Watch Demo</a>
            </div>
            <p className="reassurance">🔒 14-day free trial. Cancel anytime before and you won't be charged.</p>
          </div>
          <div className="mock" aria-label="App preview">
            <div className="bar">
              <span className="dot" /><span className="dot" /><span className="dot" />
            </div>
            <img
              src={taskaDemo}
              alt="Taska field service management dashboard"
              className="demo-gif"
              loading="eager"
              width="1400"
              height="900"
            />
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <div className="strip">
        <div className="container">
          <div style={{marginBottom: '8px', fontSize: '17px', fontWeight: '700', color: '#e6e9ef'}}>Join 50+ Aussie tradies already running their business on Taska</div>
          <div>Forklift techs, sparkies, plumbers, mobile mechanics & more.</div>
        </div>
      </div>

      {/* STORY */}
      <section className="story">
        <div className="story-inner">
          <div>
            <div className="story-label">Why Taska exists</div>
            <h2>I Got Sick Of It Too.</h2>
            <p>I'm a forklift technician running my own business. I tried the big field service apps — they wanted <strong>$150–$200 a month</strong> for software built for companies with 50 staff.</p>
            <p>I just needed to schedule a job, write up what I did, and send an invoice. So I built my own app.</p>
            <p>Taska is what I use every single day in my own business. <strong>If it's in the app, it's because a real tradie needed it. If it's not, it's because we didn't.</strong></p>
            <div style={{marginTop: '24px'}}>
              <a className="btn primary" href="/auth/register" onClick={() => handleCTAClick('story_cta')}>Try It Free →</a>
            </div>
          </div>
          <div className="story-quote">
            <p>"I built the tool I couldn't find. Simple job management without the enterprise price tag."</p>
            <cite>— Keith, Forklift Technician & Taska founder</cite>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="features container">
        <div className="section-label">What's included</div>
        <h2 className="section-title">Everything You Need. Nothing You Don't.</h2>
        <p className="section-sub">Built for the jobs you actually do, not a corporate workflow.</p>
        <div className="feature-grid">
          <article className="card">
            <span className="icon">📅</span>
            <h3>Job Scheduling</h3>
            <p>Schedule jobs with date, time, customer and technician. Calendar view so you can see your whole week at a glance.</p>
          </article>
          <article className="card">
            <span className="icon">🔧</span>
            <h3>Equipment Tracking</h3>
            <p>Assign equipment to customers. Track service history. Auto-schedule the next service at 6 or 12 months.</p>
          </article>
          <article className="card">
            <span className="icon">📸</span>
            <h3>Job Photos & Notes</h3>
            <p>Take photos on site, log parts and hours. Everything attached to the job for your records.</p>
          </article>
          <article className="card">
            <span className="icon">💬</span>
            <h3>SMS Notifications</h3>
            <p>Text the customer when you're on the way. Customise the message. Keeps everyone in the loop.</p>
          </article>
          <article className="card">
            <span className="icon">🧾</span>
            <h3>Quotes & Invoices</h3>
            <p>Invoice pre-populates from the job. Send via email with PDF attached. See when the customer opens it.</p>
          </article>
          <article className="card">
            <span className="icon">🔗</span>
            <h3>Xero Integration</h3>
            <p>Connect once. Invoices sync automatically when sent. Payments sync when marked paid. No double entry.</p>
          </article>
        </div>
      </section>

      {/* COMPARISON */}
      <section className="comparison container" style={{padding: '80px 20px'}}>
        <div className="section-label" style={{textAlign:'center'}}>How we stack up</div>
        <h2 className="section-title">Taska vs The Big Boys</h2>
        <p className="section-sub">We're not trying to beat ServiceTitan. We're built for tradies, not corporations.</p>
        <div className="comparison-table">
          <div className="comparison-row comparison-header">
            <div>Feature</div>
            <div style={{color: 'var(--blue1)'}}>Taska</div>
            <div>Tradify</div>
            <div>ServiceM8</div>
            <div>Spreadsheets</div>
          </div>
          <div className="comparison-row">
            <div className="comparison-feature">Starting Price</div>
            <div className="comparison-check highlight-col">$29/mo</div>
            <div className="comparison-check">$49/mo</div>
            <div className="comparison-check">$39/mo</div>
            <div className="comparison-check">Free*</div>
          </div>
          <div className="comparison-row">
            <div className="comparison-feature">Equipment Tracking</div>
            <div className="comparison-check check-yes highlight-col">✓</div>
            <div className="comparison-check check-no">—</div>
            <div className="comparison-check check-yes">✓</div>
            <div className="comparison-check check-no">—</div>
          </div>
          <div className="comparison-row">
            <div className="comparison-feature">Invoice Viewed Tracking</div>
            <div className="comparison-check check-yes highlight-col">✓</div>
            <div className="comparison-check check-no">—</div>
            <div className="comparison-check check-yes">✓</div>
            <div className="comparison-check check-no">—</div>
          </div>
          <div className="comparison-row">
            <div className="comparison-feature">Auto-repeat Service Jobs</div>
            <div className="comparison-check check-yes highlight-col">✓</div>
            <div className="comparison-check check-no">—</div>
            <div className="comparison-check check-no">—</div>
            <div className="comparison-check check-no">—</div>
          </div>
          <div className="comparison-row">
            <div className="comparison-feature">Xero Integration</div>
            <div className="comparison-check check-yes highlight-col">✓</div>
            <div className="comparison-check check-yes">✓</div>
            <div className="comparison-check check-yes">✓</div>
            <div className="comparison-check check-no">—</div>
          </div>
          <div className="comparison-row">
            <div className="comparison-feature">Built by an actual tradie</div>
            <div className="comparison-check check-yes highlight-col">✓</div>
            <div className="comparison-check check-no">—</div>
            <div className="comparison-check check-no">—</div>
            <div className="comparison-check check-no">—</div>
          </div>
        </div>
        <p style={{textAlign: 'center', fontSize: '12px', color: '#7c8797', marginTop: '14px'}}>* Spreadsheets are "free" but cost you time, errors, and lost jobs</p>
      </section>

      {/* DEMO */}
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
            >
              Your browser does not support the video tag.
            </video>
          </div>
          <div>
            <div className="section-label">See it in action</div>
            <h2 className="section-title" style={{textAlign:'left'}}>Job to invoice in under 3 minutes.</h2>
            <p className="lead">Create a job, log hours and parts, take photos on site, complete it, send the invoice. All on your phone. All in Taska.</p>
            <div className="hero-ctas">
              <a className="btn primary" href="/auth/register" onClick={() => handleCTAClick('start_trial')}>Start Free Trial →</a>
              <a className="btn" href="/auth/login" onClick={() => handleCTAClick('login')}>Log in</a>
            </div>
            <div className="note">14-day free trial · No lock-in · Cancel anytime</div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="pricing container" style={{padding: '80px 20px'}}>
        <div className="section-label" style={{textAlign:'center'}}>Pricing</div>
        <h2 className="section-title">Simple. Transparent. Fair.</h2>
        <p className="section-sub">No lock-in contracts. No setup fees. Cancel anytime.</p>
        <div className="price-grid">
          <div className="price">
            <div>
              <span className="pill">Solo</span>
              <h4>Taska Solo</h4>
              <div className="amount"><span>$29</span><small>/month AUD</small></div>
              <ul>
                <li><span className="tick">✓</span> 1 user</li>
                <li><span className="tick">✓</span> <strong>50 SMS</strong> & <strong>100 emails</strong>/month</li>
                <li><span className="tick">✓</span> Unlimited jobs & invoices</li>
                <li><span className="tick">✓</span> Customer & equipment management</li>
                <li><span className="tick">✓</span> Quotes</li>
                <li><span className="tick">✓</span> Xero integration</li>
                <li><span className="tick">✓</span> Invoice viewed tracking</li>
                <li><span className="tick">✓</span> Job navigation & photos</li>
              </ul>
            </div>
            <a className="btn cta" href="/auth/register?plan=solo" onClick={() => handleCTAClick('solo')}>Start Free Trial</a>
          </div>
          <div className="price popular">
            <div className="ribbon">Most Popular</div>
            <div>
              <span className="pill">Team</span>
              <h4>Taska Team</h4>
              <div className="amount"><span>$49</span><small>/month AUD</small></div>
              <ul>
                <li><span className="tick">✓</span> Up to 5 users</li>
                <li><span className="tick">✓</span> <strong>200 SMS</strong> & <strong>500 emails</strong>/month</li>
                <li><span className="tick">✓</span> Everything in Solo, plus:</li>
                <li><span className="tick">✓</span> Assign jobs to specific techs</li>
                <li><span className="tick">✓</span> Full team schedule view</li>
                <li><span className="tick">✓</span> Customer portal</li>
                <li><span className="tick">✓</span> Priority support</li>
              </ul>
            </div>
            <a className="btn primary cta" href="/auth/register?plan=pro" onClick={() => handleCTAClick('team')}>Start Free Trial →</a>
          </div>
        </div>
        <p className="tiny" style={{textAlign:'center', marginTop:16}}>Both plans include a 14‑day free trial · No charge until day 15 · Cancel anytime before</p>
      </section>

      {/* PACKS */}
      <section className="packs container">
        <div className="section-label" style={{textAlign:'center'}}>Add-on packs</div>
        <h2 className="section-title">Need More SMS or Emails?</h2>
        <p className="section-sub">Top up anytime from inside the app. No plan changes needed. Packs never expire.</p>
        <div className="packs-grid">
          <div>
            <h3 style={{fontSize:'16px', fontWeight:'700', marginBottom:'14px', color:'var(--text)'}}>📱 SMS Packs</h3>
            {[['100 SMS Credits','$5'],['500 SMS Credits','$20'],['1,000 SMS Credits','$35']].map(([name,price]) => (
              <div className="pack-item" key={name}>
                <div>
                  <div className="pack-name">{name}</div>
                </div>
                <div className="pack-price">{price}</div>
              </div>
            ))}
          </div>
          <div>
            <h3 style={{fontSize:'16px', fontWeight:'700', marginBottom:'14px', color:'var(--text)'}}>📧 Email Packs</h3>
            {[['200 Email Credits','$3'],['500 Email Credits','$7'],['1,000 Email Credits','$12']].map(([name,price]) => (
              <div className="pack-item" key={name}>
                <div>
                  <div className="pack-name">{name}</div>
                </div>
                <div className="pack-price">{price}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="faq container" style={{padding: '80px 20px'}}>
        <div className="section-label" style={{textAlign:'center'}}>Questions</div>
        <h2 className="section-title">Common Questions</h2>
        <div className="faq-grid" style={{marginTop: '32px'}}>
          <details>
            <summary>Do I need a credit card to start?</summary>
            <p>No. Start your 14‑day trial without a card. You won't be charged until day 15. Cancel anytime before and you pay nothing.</p>
          </details>
          <details>
            <summary>Can I use it on my phone?</summary>
            <p>Absolutely. Taska is designed mobile-first. Run your whole business from your phone in the van. Works on desktop too.</p>
          </details>
          <details>
            <summary>Can I import my existing customers?</summary>
            <p>Yes. Import customers and equipment from Excel with one click. You don't have to start from scratch.</p>
          </details>
          <details>
            <summary>Does Taska integrate with Xero?</summary>
            <p>Yes. Connect Xero once in settings and invoices sync automatically when sent. Payments sync when marked paid. Zero double entry.</p>
          </details>
          <details>
            <summary>What if I need more SMS or emails?</summary>
            <p>Buy a pack anytime from inside the app. No plan changes needed. Credits are available immediately and never expire.</p>
          </details>
          <details>
            <summary>Is there a lock-in contract?</summary>
            <p>No. Month to month. Cancel whenever you want, no questions asked.</p>
          </details>
          <details>
            <summary>What trades is Taska for?</summary>
            <p>Any trade that does jobs and invoices — electricians, plumbers, mechanics, carpenters, landscapers, HVAC, forklift techs. If your work is job-based, Taska works for you.</p>
          </details>
          <details>
            <summary>Can I change my plan anytime?</summary>
            <p>Yes. Upgrade or downgrade anytime from your account settings. Changes take effect immediately.</p>
          </details>
        </div>
      </section>

      {/* CTA BANNER */}
      <section className="cta-banner">
        <h2>Ready To Get Your<br /><em>Time Back?</em></h2>
        <p>14 days free. No lock-in. Cancel anytime.</p>
        <a className="btn primary" href="/auth/register" onClick={() => handleCTAClick('final_cta')} style={{fontSize:'16px', padding:'0 28px', height:'48px'}}>
          Start Free Trial — It's $0 Today
        </a>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="container foot">
          <div className="brand">
            <img src="/assets/taska-logo.png" alt="Taska" className="logo" style={{height:'28px'}} />
          </div>
          <div className="fine">© {new Date().getFullYear()} Taska. Built in Australia for Australian tradies.</div>
          <div className="fine">
            <a href="/privacy" style={{color:'#7c8797'}}>Privacy</a>
            {' · '}
            <a href="mailto:support@taska.info" style={{color:'#7c8797'}}>Support</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
