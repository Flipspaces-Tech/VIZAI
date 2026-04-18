import React, { useEffect, useMemo, useState } from "react";

const IconMonitor = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8" />
    <path d="M12 16v4" />
  </svg>
);

const IconMouse = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect x="8" y="2" width="8" height="20" rx="4" />
    <path d="M12 6v4" />
  </svg>
);

const IconGear = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
    <path d="M19.4 15a7.8 7.8 0 0 0 .1-2l2-1.2-2-3.4-2.3.7a7.3 7.3 0 0 0-1.7-1l-.3-2.4H10.8l-.3 2.4a7.3 7.3 0 0 0-1.7 1l-2.3-.7-2 3.4 2 1.2a7.8 7.8 0 0 0 .1 2l-2 1.2 2 3.4 2.3-.7a7.3 7.3 0 0 0 1.7 1l.3 2.4h4.4l.3-2.4a7.3 7.3 0 0 0 1.7-1l2.3.7 2-3.4-2-1.2Z" />
  </svg>
);

// ---------- Keyboard Controls ----------
function Keycap({ children, size = "md" }) {
  return <span className={`cloc-key cloc-key--${size}`}>{children}</span>;
}

function Pair({ a, b }) {
  return (
    <div className="cloc-pair">
      <Keycap size="sm">{a}</Keycap>
      <span className="cloc-or">or</span>
      <Keycap size="sm">{b}</Keycap>
    </div>
  );
}

export function ControlsLearnOneCard() {
  return (
    <section className="navC-wrap">
      {/* Heading */}
      <div className="navC-head">
        <div className="navC-headIcon">⌨</div>
        <div className="navC-headTitle">NAVIGATION &amp; CAMERA CONTROLS</div>
      </div>

      {/* Card */}
      <div className="cloc-card cloc-card--hover" tabIndex={0}>
        {/* LEFT: WASD */}
        <div className="cloc-left">
          <div className="cloc-topLabel">MOVE FORWARD</div>
          <div className="cloc-center">
            <Keycap>W</Keycap>
          </div>

          <div className="cloc-bottom3">
            <div className="cloc-col">
              <div className="cloc-miniLabel">MOVE LEFT</div>
              <Keycap>A</Keycap>
            </div>
            <div className="cloc-col">
              <div className="cloc-miniLabel">BACKWARDS</div>
              <Keycap>S</Keycap>
            </div>
            <div className="cloc-col">
              <div className="cloc-miniLabel">MOVE RIGHT</div>
              <Keycap>D</Keycap>
            </div>
          </div>
        </div>

        {/* MIDDLE: ARROWS */}
        <div className="cloc-mid">
          <div className="cloc-altLabel">Or use the arrow keys</div>
          <div className="cloc-center">
            <Keycap>↑</Keycap>
          </div>

          <div className="cloc-bottom3 cloc-bottom3--arrows">
            <div className="cloc-col">
              <Keycap>←</Keycap>
            </div>
            <div className="cloc-col">
              <Keycap>↓</Keycap>
            </div>
            <div className="cloc-col">
              <Keycap>→</Keycap>
            </div>
          </div>
        </div>

        {/* RIGHT: LIST */}
        <div className="cloc-right">
          <div className="cloc-row">
            <div className="cloc-rowTitle">Move Forward</div>
            <Pair a="W" b="↑" />
          </div>
          <div className="cloc-row">
            <div className="cloc-rowTitle">Move Backward</div>
            <Pair a="S" b="↓" />
          </div>
          <div className="cloc-row">
            <div className="cloc-rowTitle">Move Left</div>
            <Pair a="A" b="←" />
          </div>
          <div className="cloc-row">
            <div className="cloc-rowTitle">Move Right</div>
            <Pair a="D" b="→" />
          </div>
        </div>
      </div>
    </section>
  );
}


// ---------- Mouse Controls ----------
export function MouseControlsSection() {
  return (
    <section className="mcS-wrap">
      <div className="mcS-head">
        <div className="mcS-headBadge">ⓘ</div>
        <div className="mcS-headTitle">MOUSE CONTROLS</div>
      </div>

      <div className="mcS-grid">
        <div className="mcS-card" tabIndex={0} role="article">
          <div className="mcS-iconCircle">
            <IconMonitor className="mcS-icon" />
          </div>
          <div className="mcS-title">Look Around</div>
          <div className="mcS-desc">Move mouse or Trackpad to turn your camera</div>
        </div>

        <div className="mcS-card" tabIndex={0} role="article">
          <div className="mcS-iconCircle">
            <IconMouse className="mcS-icon" />
          </div>
          <div className="mcS-title">Click to Select</div>
          <div className="mcS-desc">
            Left-click the mouse or trackpad to select the surface to change
          </div>
        </div>

        <div className="mcS-card" tabIndex={0} role="article">
          <div className="mcS-iconCircle">
            <IconGear className="mcS-icon" />
          </div>
          <div className="mcS-title">Right-Click Context Menu</div>
          <div className="mcS-desc">
            Right-click any surface for options related to the particular surface
          </div>
        </div>
      </div>
    </section>
  );
}

export function QuickActionsSection() {
  return (
    <section className="qa-wrap">
      <div className="qa-head">QUICK ACTIONS</div>

      <div className="qa-grid">
        <div className="qa-card" tabIndex={0} role="article">
          <div className="qa-top">
            <div className="qa-title">Quick Navigate</div>
            <span className="qa-key">N</span>
          </div>
          <div className="qa-desc">
            Teleport between spaces.<br />
            Click N again to escape
          </div>
        </div>

        <div className="qa-card" tabIndex={0} role="article">
          <div className="qa-top">
            <div className="qa-title">Screenshot</div>
            <span className="qa-key">Z</span>
          </div>
          <div className="qa-desc">Save the current view to the system</div>
        </div>

        <div className="qa-card" tabIndex={0} role="article">
          <div className="qa-top">
            <div className="qa-title">Exit / Menu</div>
            <span className="qa-key">1</span>
          </div>
          <div className="qa-desc">Exit any UI element on screen</div>
        </div>

        <div className="qa-card" tabIndex={0} role="article">
          <div className="qa-top">
            <div className="qa-title">Switch to Top Cam</div>
            <span className="qa-key">T</span>
          </div>
          <div className="qa-desc">
            Toggle between bird’s-eye<br />
            view and first-person view
          </div>
        </div>
      </div>
    </section>
  );
}
export function AdvancedControlsSection() {
  const Key = ({ children }) => <span className="ac-key">{children}</span>;

  const KeyGroup = ({ keys }) => (
    <div className="ac-keys">
      {keys.map((k, i) => (
        <Key key={`${k}-${i}`}>{k}</Key>
      ))}
    </div>
  );

  return (
    <section className="ac-wrap">
      <div className="ac-head">
        <div className="ac-headIcon">⚙</div>
        <div className="ac-headTitle">ADVANCED CONTROLS</div>
      </div>

      <div className="ac-table">
        <div className="ac-tr ac-th">
          <div className="ac-td">Action</div>
          <div className="ac-td">Keys</div>
          <div className="ac-td">Description</div>
        </div>

        <div className="ac-tr">
          <div className="ac-td ac-action">Adjust Cam Speed</div>
          <div className="ac-td">
            <KeyGroup keys={["PgUp", "PgDn"]} />
          </div>
          <div className="ac-td ac-desc">Increase or decrease camera movement speed</div>
        </div>

        <div className="ac-tr">
          <div className="ac-td ac-action">Copy Material</div>
          <div className="ac-td">
            <KeyGroup keys={["Ctrl", "C"]} />
          </div>
          <div className="ac-td ac-desc">Copy a material from the selected surface</div>
        </div>

        <div className="ac-tr">
          <div className="ac-td ac-action">Paste Material</div>
          <div className="ac-td">
            <KeyGroup keys={["Ctrl", "V"]} />
          </div>
          <div className="ac-td ac-desc">Paste copied material to another surface</div>
        </div>

        <div className="ac-tr">
          <div className="ac-td ac-action">Material Menu</div>
          <div className="ac-td">
            <KeyGroup keys={["M"]} />
          </div>
          <div className="ac-td ac-desc">Change the Tile Size and Rotation of the finish</div>
        </div>
      </div>
    </section>
  );
}
export function ProTipsSection() {
  const tips = [
    "Use the quick navigation (N) to instantly move between pre-defined viewpoints",
    "Adjust camera speed with PgUp/PgDn for more precise movements in detailed areas",
    "Take screenshots (Z) to save your progress and share with clients",
    "Use the material menu (M) to fine-tune tile sizes and rotations for perfect alignment",
    "Switch to top camera (T) for better spatial awareness when planning layouts",
  ];

  return (
    <section className="pt-wrap">
      <div className="pt-head">
        <div className="pt-headIcon">💡</div>
        <div className="pt-headTitle">PRO TIPS</div>
      </div>

      <div className="pt-card">
        {tips.map((tip, i) => (
          <div className="pt-row" key={i}>
            <div className="pt-num">{i + 1}</div>
            <div className="pt-text">{tip}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LearnHero() {
  const PDF_URL =
    "https://drive.google.com/file/d/1AT_Y3v2IQytEn2MOCFH9hnT6nFHdMUmC/view";

  const handleDownloadPDF = () => {
    window.open(PDF_URL, "_blank", "noopener,noreferrer");
  };
  return (
    <section className="learnHero">
      <div className="learnHeroInner">
        
        <div>
          <h1 className="learnHeroH1">
            <span className="learnHeroBrand">VIZWALK</span>{" "}
            <span className="learnHeroAccent">KeyBind Guide</span>
          </h1>

          <p className="learnHeroSub">
            Master Vizwalk with these keyboard shortcuts and controls for faster,
            more efficient design workflows.
          </p>
        </div>

        <div className="learnHeroActions">
          <button className="learnHeroBtnOutline" onClick={handleDownloadPDF} type="button">
            Download PDF
          </button>

          <a
            className="learnHeroBtnPrimary"
            href="https://youtu.be/mszU9D8S1NE"
            target="_blank"
            rel="noopener noreferrer"
          >
            Video Tutorial
          </a>
        </div>
      </div>
    </section>
  );
}

function ContentsNav() {
  const items = useMemo(
  () => [
    { id: "nav-controls", label: "Navigation Controls", icon: "⌨" },
    { id: "quick-actions", label: "Quick Actions", icon: "✈" },
    { id: "advanced-controls", label: "Advanced Controls", icon: "⚙" },
    { id: "mouse-controls", label: "Mouse Controls", icon: "🖱" },
    { id: "pro-tips", label: "Pro Tips", icon: "💡" },
  ],
  []
);


  const [activeId, setActiveId] = useState(items[0].id);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY + 220; // same behavior as figma-like sidebar
      for (let i = items.length - 1; i >= 0; i--) {
        const el = document.getElementById(items[i].id);
        if (el && el.offsetTop <= y) {
          setActiveId(items[i].id);
          break;
        }
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [items]);

  const scrollTo = (id) => {
    setActiveId(id);
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <aside className="learnToc">
      <div className="learnTocCard">
        <div className="learnTocTitle">CONTENTS</div>

        <div className="learnTocList">
         {items.map((it) => {
  const isActive = activeId === it.id;

  return (
    <button
  key={it.id}
  type="button"
  className={`learnTocBtn ${activeId === it.id ? "active" : ""}`}
  onClick={() => scrollTo(it.id)}
>
  <span className="learnTocBtnIcon">{it.icon}</span>
  <span className="learnTocBtnText">{it.label}</span>
</button>


  );
})}

        </div>
      </div>
    </aside>
  );
}

export default function LearnControls() {
  return (
    <div className="learnPage">
      <LearnHero />
      <div className="learnShell">
        <ContentsNav />

        <main className="learnMain">
          <section id="nav-controls">
            <ControlsLearnOneCard />
          </section>

          <div className="learnGap" />

          <section id="mouse-controls">
            <MouseControlsSection />
          </section>

          <div className="learnGap" />

          <section id="quick-actions">
            <QuickActionsSection />
          </section>

          <div className="learnGap" />

          <section id="advanced-controls">
            <AdvancedControlsSection />
          </section>

          <div className="learnGap" />

          <section id="pro-tips">
            <ProTipsSection />
          </section>
        </main>
      </div>
    </div>
  );
}






