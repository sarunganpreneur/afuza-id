import Image from "next/image";
import Link from "next/link";
import BusinessScanner from "@/components/homepage/BusinessScanner";
import AutonomyControl from "@/components/homepage/AutonomyControl";

export default function Home() {
  return (
    <main id="main-content" tabIndex={-1}>
      <a className="skip-link" href="#main-content">Lewati ke konten utama</a>
      <section className="home-hero" id="top">
        <div className="home-hero-background" aria-hidden="true">
          <Image
            src="/images/homepage/hero-business-brain-v2.png"
            alt=""
            fill
            priority
            quality={82}
            sizes="100vw"
          />
        </div>
        <div className="home-shell">
          <header className="home-header">
            <Link href="/" className="home-brand" aria-label="Afuza.id beranda">
              <span className="home-brand-symbol" aria-hidden="true">a</span>
              <span>afuza<span className="home-brand-id">.id</span></span>
            </Link>

            <nav className="home-nav" aria-label="Navigasi utama">
              <a href="#fitur">Platform</a>
              <a href="#cara-kerja">Solusi</a>
              <a href="#cara-kerja">Cara Kerja</a>
              <a href="#contoh">Ekosistem</a>
              <a href="#faq">Resources</a>
            </nav>

            <div className="home-header-actions">
              <Link href="/login" className="home-login">Masuk</Link>
              <Link href="/register" className="home-button home-button-small">
                Mulai dengan Afuza
              </Link>

              <details className="home-mobile-menu">
                <summary aria-label="Buka navigasi">
                  <span />
                  <span />
                  <span />
                </summary>
                <nav aria-label="Navigasi mobile">
                  <a href="#fitur">Platform</a>
                  <a href="#cara-kerja">Solusi</a>
                  <a href="#cara-kerja">Cara Kerja</a>
                  <a href="#contoh">Ekosistem</a>
                  <a href="#faq">Resources</a>
                  <Link href="/login">Masuk</Link>
                </nav>
              </details>
            </div>
          </header>

          <div className="home-hero-grid">
            <div className="home-hero-copy">
              <p className="home-eyebrow">
                <span />
                AI BUSINESS OPERATING SYSTEM
              </p>

              <h1 className="home-hero-title">
                Bangun Bisnis.
                <br />
                Dapatkan Customer.
                <br />
                <em>Tumbuh dengan AI.</em>
              </h1>

              <p className="home-hero-lede">
                Afuza membantu Anda menemukan peluang, membangun produk dan
                penawaran, membuat aset digital, mencari calon customer,
                menjalankan penjualan, dan mengembangkan bisnis dalam satu sistem.
              </p>

              <div className="home-hero-actions">
                <Link href="/register" className="home-button">
                  Mulai dengan Afuza
                  <span aria-hidden="true">→</span>
                </Link>

                <a href="#cara-kerja" className="home-secondary-link">
                  Lihat Cara Kerjanya
                  <span aria-hidden="true">↓</span>
                </a>
              </div>

              <p className="home-hero-note">
                <span aria-hidden="true">✓</span>
                Mulai dari bisnis yang sedang Anda jalankan, atau ide yang ingin
                Anda validasi.
              </p>
            </div>

          </div>

          <div className="home-hero-footer">
            <span>THINK</span>
            <i />
            <span>DECIDE</span>
            <i />
            <span>EXECUTE</span>
            <i />
            <span>LEARN</span>

            <strong>One connected business system.</strong>
          </div>
        </div>
      </section>

      <section className="os-problem" id="platform">
        <div className="home-shell">
          <div className="os-problem-heading">
            <p className="os-eyebrow">THE PROBLEM</p>
            <h2>
              Menjalankan bisnis seharusnya tidak membutuhkan
              <em> 15 aplikasi berbeda.</em>
            </h2>
            <p>
              Website ada di satu tempat. Customer di tempat lain. Data penjualan
              di spreadsheet. Prospek ada di WhatsApp. AI tidak mengetahui konteks
              bisnis Anda.
            </p>
          </div>

            <div className="tool-chaos" role="img" aria-label="Sistem bisnis yang tersebar dan Afuza sebagai sistem terhubung">
            {[
              "Website",
              "CRM",
              "Spreadsheet",
              "WhatsApp",
              "Email",
              "Ads",
              "Analytics",
              "Automation",
              "AI",
              "Documents",
              "Hosting",
              "Leads",
            ].map((tool, index) => (
              <span
                key={tool}
                className={`tool-chip tool-chip-${(index % 6) + 1}`}
              >
                {tool}
              </span>
            ))}

            <div className="tool-center">
              <small>ONE CONNECTED SYSTEM</small>
              <strong>AFUZA</strong>
            </div>
          </div>

          <div className="os-problem-summary">
            <span>Data tersebar.</span>
            <span>Keputusan terlambat.</span>
            <span>Customer tercecer.</span>
            <strong>Afuza menyatukannya.</strong>
          </div>
        </div>
      </section>

      <section className="os-brain" id="fitur">
        <div className="home-shell">
          <div className="os-section-heading os-section-heading-light">
            <p className="os-eyebrow">THE BUSINESS BRAIN</p>
            <h2>
              Bukan sekadar AI.
              <br />
              <em>Ini otak bisnis Anda.</em>
            </h2>
            <p>
              Afuza menghubungkan informasi, keputusan, dan eksekusi sehingga
              setiap aktivitas bisnis menjadi bagian dari satu sistem yang terus
              belajar.
            </p>
          </div>

          <div className="brain-pillars">
            <article className="brain-pillar">
              <div className="pillar-top">
                <span>01</span>
                <b>THINK</b>
              </div>
              <div className="pillar-icon" aria-hidden="true">◎</div>
              <h3>Memahami bisnis Anda.</h3>
              <p>
                Afuza menghubungkan data tentang pasar, produk, customer,
                eksperimen, project, dan knowledge menjadi konteks bisnis yang utuh.
              </p>
              <ul>
                <li>Market Intelligence</li>
                <li>Customer Intelligence</li>
                <li>Product Intelligence</li>
                <li>Business Knowledge</li>
              </ul>
            </article>

            <article className="brain-pillar brain-pillar-featured">
              <div className="pillar-top">
                <span>02</span>
                <b>DECIDE</b>
              </div>
              <div className="pillar-icon" aria-hidden="true">✦</div>
              <h3>Menentukan langkah berikutnya.</h3>
              <p>
                Sistem membantu memprioritaskan peluang, mendeteksi masalah,
                menyusun rekomendasi, dan menentukan tindakan yang paling relevan.
              </p>
              <ul>
                <li>Opportunity Detection</li>
                <li>Priority Scoring</li>
                <li>Next Best Action</li>
                <li>Business Recommendation</li>
              </ul>
            </article>

            <article className="brain-pillar">
              <div className="pillar-top">
                <span>03</span>
                <b>EXECUTE</b>
              </div>
              <div className="pillar-icon" aria-hidden="true">↗</div>
              <h3>Mengubah keputusan menjadi tindakan.</h3>
              <p>
                Dari website hingga acquisition, outreach, penjualan, automation,
                dan operasi bisnis.
              </p>
              <ul>
                <li>Build</li>
                <li>Acquire</li>
                <li>Sell</li>
                <li>Operate</li>
              </ul>
            </article>
          </div>

          <div className="brain-loop">
            <div className="brain-loop-track">
              <span className="loop-node loop-node-active">THINK</span>
              <i />
              <span className="loop-node">DECIDE</span>
              <i />
              <span className="loop-node">EXECUTE</span>
              <i />
              <span className="loop-node loop-node-learning">LEARN</span>
              <b aria-hidden="true">↺</b>
            </div>
            <p>
              Semakin banyak aktivitas yang dijalankan, semakin kaya konteks bisnis
              yang dimiliki Afuza.
            </p>
          </div>
        </div>
      </section>

      <section className="os-journey" id="cara-kerja">
        <div className="home-shell">
          <div className="os-section-heading">
            <p className="os-eyebrow">FROM IDEA TO GROWTH</p>
            <h2>Dari ide hingga pertumbuhan, dalam satu alur kerja.</h2>
            <p>
              Afuza membantu bisnis bergerak dari pertanyaan awal hingga eksekusi
              dan optimasi tanpa kehilangan konteks di setiap tahap.
            </p>
          </div>

          <div className="journey-board">
            <div className="journey-rail" aria-hidden="true" />

            {[
              ["01", "IDE", "Temukan peluang dan masalah yang layak diselesaikan."],
              ["02", "RESEARCH", "Pahami pasar, kompetitor, kebutuhan customer, dan potensi bisnis."],
              ["03", "VALIDATE", "Uji asumsi sebelum mengeluarkan biaya besar."],
              ["04", "PRODUCT", "Bangun produk, layanan, atau penawaran yang relevan."],
              ["05", "OFFER", "Susun value proposition, pricing, dan strategi penawaran."],
              ["06", "BUILD", "Buat landing page, website, sales asset, dan aset digital lainnya."],
              ["07", "LEADS", "Temukan calon customer yang sesuai dengan target bisnis."],
              ["08", "SELL", "Jalankan outreach, follow-up, dan proses penjualan."],
              ["09", "OPERATE", "Kelola project, customer, knowledge, dan aktivitas bisnis."],
              ["10", "SCALE", "Analisis hasil, temukan bottleneck, lalu ulangi proses yang terbukti bekerja."],
            ].map(([number, title, copy], index) => (
              <article
                className={`journey-step ${index === 6 ? "journey-step-active" : ""}`}
                key={title}
              >
                <div className="journey-number">{number}</div>
                <div className="journey-dot" />
                <div className="journey-content">
                  <h3>{title}</h3>
                  <p>{copy}</p>
                  {index === 6 && (
                    <span className="journey-active-label">
                      CURRENT EXAMPLE
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>

          <div className="journey-focus-card">
            <div>
              <small>AFUZA AT WORK · LEADS</small>
              <h3>
                Dari target market menjadi daftar calon customer yang diprioritaskan.
              </h3>
            </div>
            <p>
              Afuza dapat membantu menemukan, memperkaya, menilai, dan
              memprioritaskan prospect sehingga tim tidak memulai dari daftar
              kontak acak.
            </p>
            <a href="#contoh">
              Lihat Ekosistem
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </section>
      <BusinessScanner />

      <section className="business-graph-section" id="contoh">
        <div className="home-shell">
          <div className="graph-layout">
            <div className="os-section-heading">
              <p className="os-eyebrow">CONNECTED BUSINESS CONTEXT</p>
              <h2>
                Satu bisnis.
                <br />
                <em>Satu otak.</em>
              </h2>
              <p>
                Produk, customer, lead, project, eksperimen, dokumen, campaign,
                dan hasil penjualan tidak hidup sendiri-sendiri. Afuza
                menghubungkannya menjadi satu business graph.
              </p>

              <div className="graph-copy-points">
                <div>
                  <span>01</span>
                  <p>
                    Setiap aktivitas memperkaya konteks bisnis, bukan sekadar
                    menambah data.
                  </p>
                </div>
                <div>
                  <span>02</span>
                  <p>
                    Hubungan antar-data membantu sistem memahami apa yang terjadi
                    dan apa yang perlu dilakukan berikutnya.
                  </p>
                </div>
                <div>
                  <span>03</span>
                  <p>
                    Hasil eksperimen, campaign, dan penjualan menjadi business
                    memory untuk keputusan berikutnya.
                  </p>
                </div>
              </div>
            </div>

            <div className="homepage-illustration homepage-illustration-light">
              <Image
                src="/images/homepage/business-scanner-graph.png"
                alt="Business Graph Afuza yang menghubungkan customer, product, leads, sales, projects, dan knowledge"
                width={1448}
                height={1086}
                quality={80}
                sizes="(max-width: 1000px) 100vw, 55vw"
              />
            </div>
          </div>

          <div className="graph-memory-strip">
            <div>
              <small>LEAD → CUSTOMER</small>
              <strong>Relationship remembered</strong>
            </div>
            <i />
            <div>
              <small>CAMPAIGN → SALE</small>
              <strong>Outcome connected</strong>
            </div>
            <i />
            <div>
              <small>EXPERIMENT → RESULT</small>
              <strong>Learning retained</strong>
            </div>
            <i />
            <div className="graph-memory-highlight">
              <small>BUSINESS MEMORY</small>
              <strong>Context grows over time</strong>
            </div>
          </div>
        </div>
      </section>
      <section className="ai-workforce-section">
        <div className="home-shell">
          <div className="workforce-layout">
            <div className="os-section-heading os-section-heading-light">
              <p className="os-eyebrow">AI WORKFORCE</p>
              <h2>
                Jangan hanya gunakan AI.
                <br />
                <em>Bangun tim AI.</em>
              </h2>
              <p>
                Afuza dapat menjalankan agent-agent khusus untuk research,
                acquisition, sales, operation, knowledge, dan tugas bisnis lainnya.
              </p>

              <div className="workforce-notes">
                <div>
                  <span>01</span>
                  <p>Setiap agent memiliki tugas dan konteks yang berbeda.</p>
                </div>
                <div>
                  <span>02</span>
                  <p>Agent bekerja dalam satu business context yang terhubung.</p>
                </div>
                <div>
                  <span>03</span>
                  <p>Human approval tetap dapat ditempatkan pada titik kritis.</p>
                </div>
              </div>
            </div>

            <div className="homepage-illustration homepage-illustration-dark">
              <Image
                src="/images/homepage/ai-workforce-autonomy.png"
                alt="AI Workforce Afuza dengan AI CEO, specialist agents, human approval, dan autonomy control"
                width={1448}
                height={1086}
                quality={80}
                sizes="(max-width: 1000px) 100vw, 55vw"
              />
            </div>
          </div>

          <div className="workforce-strip">
            <span>Research</span>
            <i />
            <span>Acquire</span>
            <i />
            <span>Sell</span>
            <i />
            <span>Operate</span>
            <i />
            <span>Learn</span>
            <strong>One coordinated AI workforce.</strong>
          </div>
        </div>
      </section>

      <AutonomyControl />
      <section className="acquisition-section" id="acquisition-engine">
        <div className="home-shell">
          <div className="os-section-heading acquisition-heading">
            <p className="os-eyebrow">CUSTOMER ACQUISITION ENGINE</p>
            <h2>
              Bukan hanya membuat website.
              <br />
              <em>Afuza membantu mendapatkan customer.</em>
            </h2>
            <p>
              Afuza menghubungkan market research, buyer discovery, qualification,
              offer, outreach, follow-up, dan sales pipeline dalam satu acquisition
              engine yang dapat digunakan oleh berbagai jenis bisnis.
            </p>
          </div>

          <div className="acquisition-illustration">
            <span className="acquisition-demo-badge">ILLUSTRATIVE DATA</span>
            <div className="homepage-illustration homepage-illustration-dark">
              <Image
                src="/images/homepage/acquisition-engine-pilots.png"
                alt="Shared Customer Acquisition Engine Afuza dari market research hingga customer yang digunakan oleh lima internal revenue pilots"
                width={1448}
                height={1086}
                quality={80}
                sizes="(max-width: 1000px) 100vw, 80vw"
              />
            </div>
          </div>

          <div className="acquisition-capabilities">
            <article>
              <span>01</span>
              <h3>Find Buyers</h3>
              <p>Temukan calon pembeli yang sesuai dengan pasar dan penawaran bisnis.</p>
            </article>
            <article>
              <span>02</span>
              <h3>Qualify Leads</h3>
              <p>Fokuskan waktu pada prospek dengan kebutuhan dan potensi terbaik.</p>
            </article>
            <article>
              <span>03</span>
              <h3>Personalized Outreach</h3>
              <p>Sampaikan penawaran yang relevan dengan konteks setiap calon customer.</p>
            </article>
            <article>
              <span>04</span>
              <h3>Sales Follow-up</h3>
              <p>Jaga peluang tetap bergerak dengan tindak lanjut yang tepat waktu.</p>
            </article>
          </div>

          <p className="acquisition-callout"><span />One acquisition engine. Multiple businesses.</p>
        </div>
      </section>

      <section className="internal-pilots-section" id="internal-pilots">
        <div className="home-shell">
          <div className="os-section-heading pilots-heading">
            <p className="os-eyebrow">PROVING IT WITH OUR OWN BUSINESSES</p>
            <h2>
              Kami tidak hanya menjual sistemnya.
              <br />
              <em>Kami menggunakannya sendiri.</em>
            </h2>
            <p>
              Sebelum memperluas ke customer eksternal, Afuza menggunakan satu
              Shared Acquisition Engine pada beberapa bisnis internal untuk
              membuktikan bahwa sistem dapat bekerja lintas model bisnis.
            </p>
          </div>

          <div className="pilot-rollout">
            <div>
              <p className="os-eyebrow">ROLLOUT ORDER</p>
              <h3>Belajar lintas bisnis, bertahap.</h3>
            </div>
            <ol>
              <li><span>01</span>LP100K</li>
              <li><span>02</span>Packaging</li>
              <li><span>03</span>Fresh Supply</li>
              <li><span>04</span>Snack Supply</li>
              <li><span>05</span>Afuza Acquisition</li>
            </ol>
          </div>
        </div>
      </section>
      <section className="ecosystem-section" id="ecosystem">
        <div className="home-shell">
          <div className="os-section-heading ecosystem-heading">
            <p className="os-eyebrow">ONE CONNECTED ECOSYSTEM</p>
            <h2>
              Satu sistem.
              <br />
              <em>Banyak mesin bisnis.</em>
            </h2>
            <p>
              Afuza menjadi business brain yang menghubungkan aplikasi, agent,
              data, automation, acquisition engine, dan aset bisnis dalam satu
              konteks yang sama.
            </p>
          </div>

          <div className="homepage-illustration homepage-illustration-dark">
            <Image
              src="/images/homepage/ecosystem-business-models.png"
              alt="Afuza Business OS menghubungkan Build, Acquire, Sell, Operate, Learn, Next Best Action, dan berbagai model bisnis"
              width={1448}
              height={1086}
              quality={80}
              sizes="(max-width: 1000px) 100vw, 80vw"
            />
          </div>

          <p className="ecosystem-context-callout">
            <span aria-hidden="true">↗</span>
            Data tidak berhenti di satu aplikasi. Setiap aktivitas memperkaya business context.
          </p>
          <div className="ecosystem-loop-strip" role="group" aria-label="BUILD, ACQUIRE, SELL, OPERATE, LEARN">
            <span>BUILD</span><i />
            <span>ACQUIRE</span><i />
            <span>SELL</span><i />
            <span>OPERATE</span><i />
            <span>LEARN</span>
          </div>

          <div className="capabilities-block">
            <div className="capabilities-heading">
              <p className="os-eyebrow">WHAT AFUZA CAN HELP YOU DO</p>
              <h2>
                Mulai dari satu kebutuhan.
                <br />
                <em>Berkembang menjadi satu operating system.</em>
              </h2>
              <p>
                Pengguna tidak harus memakai semua kemampuan Afuza sejak hari
                pertama. Mereka dapat memulai dari masalah paling mendesak, lalu
                menambahkan capability ketika bisnis berkembang.
              </p>
            </div>

            <div className="capability-grid">
              <article><span>01</span><h3>Discover Opportunities</h3><p>Temukan market gap, kebutuhan customer, tren, dan peluang bisnis yang layak diuji.</p></article>
              <article><span>02</span><h3>Validate Business Ideas</h3><p>Uji demand, offer, positioning, dan asumsi bisnis sebelum mengeluarkan biaya besar.</p></article>
              <article><span>03</span><h3>Build Digital Assets</h3><p>Bangun landing page, website, product page, proposal, dan sales assets untuk mendukung penjualan.</p></article>
              <article><span>04</span><h3>Find Customers</h3><p>Temukan calon buyer yang relevan, kumpulkan signal, dan prioritaskan prospect terbaik.</p></article>
              <article><span>05</span><h3>Qualify Leads</h3><p>Pisahkan prospect prioritas tinggi dari daftar kontak biasa menggunakan business rules dan AI.</p></article>
              <article><span>06</span><h3>Run Outreach</h3><p>Siapkan komunikasi, follow-up, dan campaign yang lebih relevan berdasarkan konteks prospect.</p></article>
              <article><span>07</span><h3>Manage Sales Pipeline</h3><p>Hubungkan lead, opportunity, follow-up, dan outcome sehingga proses penjualan dapat dipantau.</p></article>
              <article><span>08</span><h3>Automate Operations</h3><p>Jalankan workflow berulang dengan approval, guardrail, dan automation yang terkontrol.</p></article>
              <article><span>09</span><h3>Deploy AI Workforce</h3><p>Gunakan agent khusus untuk research, growth, lead generation, sales, operation, dan knowledge.</p></article>
              <article><span>10</span><h3>Build Business Memory</h3><p>Simpan pembelajaran dari customer, campaign, project, eksperimen, dan keputusan bisnis.</p></article>
              <article><span>11</span><h3>Get Next Best Action</h3><p>Gunakan seluruh business context untuk menentukan prioritas dan tindakan berikutnya.</p></article>
              <article><span>12</span><h3>Scale What Works</h3><p>Identifikasi proses yang terbukti menghasilkan, lalu ulangi dan perluas dengan sistem yang sama.</p></article>
            </div>
          </div>

          <div className="ecosystem-extension">
            <div className="ecosystem-extension-heading">
              <p className="os-eyebrow">EXTEND THE ECOSYSTEM</p>
              <h2>Satu otak. Produk dapat berbeda.</h2>
              <p>
                Afuza dapat menjadi pusat dari berbagai produk dan mesin bisnis
                khusus. Setiap produk dapat memiliki interface dan fungsi sendiri,
                tetapi tetap memakai intelligence, business context, dan governance
                yang sama.
              </p>
            </div>

            <div className="ecosystem-products">
              <article className="ecosystem-product-core">
                <div className="ecosystem-product-top"><span>CORE</span><small>PLATFORM</small></div>
                <h3>afuza.id</h3><p>Business Brain / Operating System</p>
              </article>
              <article>
                <div className="ecosystem-product-top"><span>ACTIVE</span><small>ENGINE</small></div>
                <h3>Customer Acquisition Engine</h3><p>Lead discovery, qualification, outreach, sales</p>
              </article>
              <article>
                <div className="ecosystem-product-top"><span>PLANNED</span><small>ECOSYSTEM PRODUCT</small></div>
                <h3>mesinduit.id</h3><p>Business growth package untuk UMKM dan owner</p>
              </article>
              <article>
                <div className="ecosystem-product-top"><span>PLANNED</span><small>INFRASTRUCTURE</small></div>
                <h3>Hosting Management</h3><p>Infrastructure &amp; hosting operations</p>
              </article>
              <article>
                <div className="ecosystem-product-top"><span>DEVELOPMENT</span><small>PRODUCT ENGINE</small></div>
                <h3>Product Factory</h3><p>AI-assisted product &amp; creative development</p>
              </article>
              <article>
                <div className="ecosystem-product-top"><span>ACTIVE / INTERNAL</span><small>OPERATIONS</small></div>
                <h3>Operations Command Center</h3><p>Projects, tasks, approvals, agents, system control</p>
              </article>
            </div>
            <p className="ecosystem-extension-close">Produk boleh bertambah. Business context tetap satu.</p>
          </div>
        </div>
      </section>
      <section className="next-action-section" id="next-best-action">
        <div className="home-shell">
          <div className="os-section-heading next-action-heading">
            <p className="os-eyebrow">FROM DATA TO ACTION</p>
            <h2>
              Bisnis tidak kekurangan data.
              <br />
              <em>Bisnis kekurangan keputusan berikutnya.</em>
            </h2>
            <p>
              Afuza menggunakan business context dari market, customer, lead,
              sales, project, campaign, eksperimen, dan knowledge untuk membantu
              menentukan tindakan yang paling relevan berikutnya.
            </p>
          </div>

          <div className="decision-dashboard">
            <header className="decision-dashboard-header">
              <div>
                <span className="decision-status-dot" aria-hidden="true" />
                <small>DECISION INTELLIGENCE</small>
                <h3>NEXT BEST ACTION</h3>
              </div>
              <div className="decision-business-context">
                <small>BUSINESS CONTEXT</small>
                <strong>Packaging &amp; B2B Supply</strong>
              </div>
            </header>

            <div className="decision-demo-label">ILLUSTRATIVE DATA</div>
            <div className="decision-signal-grid">
              <article><small>Qualified Leads</small><strong>91</strong></article>
              <article><small>Priority A Prospects</small><strong>24</strong></article>
              <article><small>Active Opportunities</small><strong>7</strong></article>
              <article><small>Follow-ups Due</small><strong>11</strong></article>
              <article><small>Potential Pipeline</small><strong>Rp128.000.000</strong></article>
            </div>

            <div className="decision-content-grid">
              <article className="decision-primary-recommendation">
                <div className="decision-recommendation-top">
                  <span className="decision-priority-label">PRIORITY</span>
                  <strong>HIGH</strong>
                </div>
                <small className="decision-recommendation-label">RECOMMENDATION</small>
                <h4>Follow up 11 high-priority prospects before expanding prospecting.</h4>
                <div className="decision-reasoning">
                  <small>REASONING SIGNALS</small>
                  <ul>
                    <li>7 prospects recently engaged</li>
                    <li>4 quotations waiting for follow-up</li>
                    <li>Existing pipeline still under-activated</li>
                  </ul>
                </div>
                <div className="decision-opportunity">
                  <small>ESTIMATED OPPORTUNITY</small>
                  <strong>Rp42.000.000 potential pipeline</strong>
                </div>
                <button type="button" className="decision-prepare-button">
                  Prepare Action <span aria-hidden="true">→</span>
                </button>
              </article>

              <div className="decision-secondary-list">
                <p className="decision-secondary-heading">OTHER RECOMMENDATIONS</p>
                <article>
                  <span>ACQUISITION</span>
                  <h4>Expand buyer discovery in Food &amp; Beverage manufacturers</h4>
                  <small>BUYER DISCOVERY · MARKET SIGNAL</small>
                </article>
                <article>
                  <span>SALES</span>
                  <h4>Re-engage dormant opportunities with existing quotation</h4>
                  <small>PIPELINE · FOLLOW-UP</small>
                </article>
                <article>
                  <span>EXPERIMENT</span>
                  <h4>Test a simplified offer for smaller-volume buyers</h4>
                  <small>OFFER · VALIDATION</small>
                </article>
              </div>
            </div>
          </div>

          <p className="decision-insight-callout">
            Insight menjelaskan apa yang terjadi. Next Best Action membantu menentukan apa yang harus dilakukan.
          </p>
        </div>
      </section>

      <section className="business-models-section" id="business-models">
        <div className="home-shell">
          <div className="business-models-heading">
            <p className="os-eyebrow">BUILT FOR MULTIPLE BUSINESS MODELS</p>
            <h2>
              Satu business OS.
              <br />
              <em>Banyak cara menghasilkan revenue.</em>
            </h2>
            <p>
              Afuza dirancang untuk digunakan pada berbagai model bisnis, dari
              jasa sederhana hingga B2B supply, commerce, recurring service, dan
              digital products.
            </p>
          </div>

          <div className="business-model-grid">
            <article>
              <div className="business-model-card-top"><span>01</span><small>SERVICES</small></div>
              <div className="business-model-examples"><span>Consulting</span><span>Certification Services</span><span>Creative Services</span><span>Agency</span></div>
              <p>Kelola lead, proposal, follow-up, delivery, dan recurring opportunity.</p>
            </article>
            <article>
              <div className="business-model-card-top"><span>02</span><small>B2B SUPPLY</small></div>
              <div className="business-model-examples"><span>Packaging</span><span>Food Supply</span><span>Raw Materials</span><span>Industrial Supply</span></div>
              <p>Temukan buyer, prioritaskan prospect, kelola quotation, dan follow-up.</p>
            </article>
            <article>
              <div className="business-model-card-top"><span>03</span><small>COMMERCE</small></div>
              <div className="business-model-examples"><span>Physical Products</span><span>D2C</span><span>Marketplace</span><span>Wholesale</span></div>
              <p>Hubungkan product, customer acquisition, campaign, dan sales signals.</p>
            </article>
            <article>
              <div className="business-model-card-top"><span>04</span><small>DIGITAL BUSINESS</small></div>
              <div className="business-model-examples"><span>E-course</span><span>Template</span><span>Software</span><span>Digital Product</span></div>
              <p>Validasi demand, bangun offer, distribusikan aset digital, dan scale campaign.</p>
            </article>
            <article>
              <div className="business-model-card-top"><span>05</span><small>SUBSCRIPTION / RECURRING</small></div>
              <div className="business-model-examples"><span>SaaS</span><span>Hosting</span><span>Managed Service</span><span>Membership</span></div>
              <p>Kelola acquisition, onboarding, recurring relationship, usage, dan retention context.</p>
            </article>
            <article>
              <div className="business-model-card-top"><span>06</span><small>BUSINESS BUILDER</small></div>
              <div className="business-model-examples"><span>New Business</span><span>Market Validation</span><span>Venture Experiment</span><span>Product Launch</span></div>
              <p>Mulai dari ide, validasi market, bangun offer, cari customer, lalu scale yang terbukti bekerja.</p>
            </article>
          </div>

          <div className="business-model-flow">
            <div className="business-model-input">IDE / EXISTING BUSINESS</div>
            <span className="business-model-flow-arrow" aria-hidden="true">↓</span>
            <div className="business-model-os">AFUZA BUSINESS OS</div>
            <div className="business-model-branches">
              <span>SERVICES</span><span>B2B</span><span>COMMERCE</span>
              <span>DIGITAL</span><span>RECURRING</span><span>NEW VENTURE</span>
            </div>
            <span className="business-model-flow-arrow" aria-hidden="true">↓</span>
            <div className="business-model-loop">ACQUIRE <i>→</i> SELL <i>→</i> OPERATE <i>→</i> LEARN</div>
          </div>
          <p className="business-model-close">Model bisnis boleh berbeda. Operating intelligence tetap sama.</p>

          <div className="monetization-panel">
            <div className="monetization-heading">
              <p className="os-eyebrow">BUSINESS MODEL POTENTIAL</p>
              <h2>Satu platform dapat membuka beberapa lapisan pendapatan.</h2>
              <span className="monetization-status">POTENTIAL / PHASED MONETIZATION</span>
            </div>
            <div className="monetization-grid">
              <article><span>POTENTIAL</span><h3>Subscription</h3><p>Akses platform berdasarkan paket</p></article>
              <article><span>POTENTIAL</span><h3>AI Usage</h3><p>Token / usage based AI capability</p></article>
              <article><span>POTENTIAL</span><h3>Managed Acquisition</h3><p>Layanan customer acquisition terkelola</p></article>
              <article><span>POTENTIAL</span><h3>Website &amp; Digital Assets</h3><p>Landing page, website, sales assets</p></article>
              <article><span>POTENTIAL</span><h3>Hosting &amp; Infrastructure</h3><p>Hosting dan managed infrastructure</p></article>
              <article><span>POTENTIAL</span><h3>Marketplace / Ecosystem</h3><p>Add-on, template, agent, integration</p></article>
              <article><span>POTENTIAL</span><h3>Enterprise Implementation</h3><p>Setup, customization, integration</p></article>
              <article><span>POTENTIAL</span><h3>Transaction / Success Layer</h3><p>Opsional untuk model yang relevan</p></article>
            </div>
            <p className="monetization-close">
              Afuza tidak bergantung pada satu sumber pendapatan. Platform dapat
              berkembang bersama kebutuhan pengguna dan kedalaman penggunaan sistem.
            </p>
          </div>
        </div>
      </section>
      <section className="faq-section section-pad" id="faq">
        <div className="home-shell">
          <div className="faq-heading">
            <p className="os-eyebrow">FREQUENTLY ASKED QUESTIONS</p>
            <h2>Mulai sederhana.<br /><em>Berkembang sesuai kebutuhan bisnis.</em></h2>
          </div>
          <div className="faq-list">
            <details>
              <summary>Apa sebenarnya afuza.id?</summary>
              <p>Afuza adalah AI Business Operating System yang membantu bisnis menghubungkan data, keputusan, customer acquisition, operasi, automation, dan AI workforce dalam satu sistem.</p>
            </details>
            <details>
              <summary>Apakah Afuza hanya untuk bisnis besar?</summary>
              <p>Tidak. Pengguna dapat mulai dari satu kebutuhan sederhana seperti landing page, mencari customer, atau validasi bisnis, lalu menambahkan capability ketika bisnis berkembang.</p>
            </details>
            <details>
              <summary>Apakah semua proses dijalankan otomatis oleh AI?</summary>
              <p>Tidak harus. Afuza dirancang dengan mode Manual, Copilot, dan Autopilot sehingga pengguna dapat menentukan sendiri tingkat autonomi AI.</p>
            </details>
            <details>
              <summary>Apakah Afuza hanya membuat website?</summary>
              <p>Tidak. Website dan landing page adalah salah satu capability. Fokus utama Afuza adalah membantu bisnis menemukan peluang, mendapatkan customer, menjalankan penjualan, mengelola operasi, dan belajar dari hasilnya.</p>
            </details>
            <details>
              <summary>Bisakah Afuza digunakan untuk bisnis yang berbeda?</summary>
              <p>Ya. Arsitektur Afuza dirancang lintas model bisnis, termasuk jasa, B2B supply, commerce, digital product, recurring service, dan bisnis baru yang masih dalam tahap validasi.</p>
            </details>
            <details>
              <summary>Apakah semua fitur yang ditampilkan sudah tersedia?</summary>
              <p>Tidak semuanya. Homepage ini juga menggambarkan arah pengembangan dan potensi ekosistem Afuza. Capability yang masih direncanakan harus tetap dibedakan dari fitur yang sudah aktif.</p>
            </details>
          </div>
        </div>
      </section>

      <section className="final-cta" id="start-with-afuza">
        <div className="home-shell">
          <div className="final-cta-layout">
            <div className="final-cta-copy">
              <p className="os-eyebrow">START WITH YOUR BUSINESS</p>
              <h2>Jangan mulai dari AI.<br /><em>Mulai dari masalah bisnis Anda.</em></h2>
              <p className="final-cta-description">
                Ceritakan bisnis, target, atau tantangan yang sedang Anda hadapi.
                Afuza membantu memetakan peluang dan menentukan titik awal yang
                paling masuk akal.
              </p>
              <div className="final-cta-actions">
                <Link href="/register" className="final-cta-primary">Mulai dengan Afuza <span aria-hidden="true">→</span></Link>
                <Link href="/login" className="final-cta-secondary">Masuk ke Dashboard</Link>
              </div>
              <p className="final-cta-microcopy">Mulai dari satu kebutuhan. Bangun sistem seiring bisnis Anda tumbuh.</p>
            </div>

            <div className="final-cta-visual" role="group" aria-label="Alur business context menuju outcome dengan Afuza">
              <div className="final-flow">
                <span>YOUR BUSINESS</span><i>→</i><strong>AFUZA BUSINESS OS</strong><i>→</i><span>NEXT BEST ACTION</span>
              </div>
              <div className="final-context-grid">
                <article>
                  <small>BUSINESS CONTEXT</small>
                  <span>Market</span><span>Customer</span><span>Product</span><span>Sales</span><span>Operations</span>
                </article>
                <div className="final-afuza-loop">
                  <small>AFUZA</small>
                  <b>Think</b><i />
                  <b>Decide</b><i />
                  <b>Execute</b><i />
                  <b>Learn</b>
                </div>
                <article className="final-outcomes">
                  <small>OUTCOME</small>
                  <span>More clarity</span><span>Better decisions</span><span>More customers</span><span>Scalable operations</span>
                </article>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="home-shell">
          <div className="footer-platform">
            <div className="footer-brand-column">
              <Link href="/" className="home-brand" aria-label="afuza.id beranda">
                <span className="home-brand-symbol" aria-hidden="true">a</span>
                <span>afuza<span className="home-brand-id">.id</span></span>
              </Link>
              <strong>AI Business Operating System</strong>
              <p>Business intelligence, customer acquisition, AI workforce, automation, and operations in one connected system.</p>
            </div>
            <nav className="footer-column" aria-label="Platform">
              <h3>PLATFORM</h3>
              <a href="#platform">Business Brain</a>
              <a href="#fitur">Business Scanner</a>
              <a href="#ecosystem">Business Graph</a>
              <a href="#cara-kerja">AI Workforce</a>
              <a href="#acquisition-engine">Customer Acquisition</a>
              <a href="#next-best-action">Next Best Action</a>
            </nav>
            <nav className="footer-column" aria-label="Solutions">
              <h3>SOLUTIONS</h3>
              <a href="#ecosystem">Build</a>
              <a href="#acquisition-engine">Acquire</a>
              <a href="#business-models">Sell</a>
              <a href="#business-models">Operate</a>
              <a href="#ecosystem">Learn</a>
              <a href="#business-models">Scale</a>
            </nav>
            <nav className="footer-column" aria-label="Ecosystem">
              <h3>ECOSYSTEM</h3>
              <Link href="/">afuza.id</Link>
              <a href="#acquisition-engine">Customer Acquisition Engine</a>
              <a href="#ecosystem">mesinduit.id</a>
              <a href="#ecosystem">Product Factory</a>
              <a href="#ecosystem">Hosting Management</a>
            </nav>
            <nav className="footer-column" aria-label="Company">
              <h3>COMPANY</h3>
              <span className="footer-unavailable">Tentang Afuza</span>
              <a href="#faq">Resources</a>
              <span className="footer-unavailable">Privacy</span>
              <span className="footer-unavailable">Terms</span>
              <a href="mailto:hello@afuza.id">Contact</a>
            </nav>
          </div>
          <div className="footer-bottom">
            <span>© 2026 PT Afuza Digital Publishing. All rights reserved.</span>
            <span>Building the AI Business Operating System for growing businesses.</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
