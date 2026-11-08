<script lang="ts">
  // The landing screen above the editor. Its links are plain anchors, so "Open the editor" scrolls
  // even before scripts load; the smooth scroll comes from CSS and respects reduced motion.
  const SOURCE = 'https://github.com/strcklr/resumake';
  const SITE = 'https://chasestrickler.com';
</script>

<section id="top" class="splash">
  <nav class="splash-nav" aria-label="Site">
    <span class="wordmark"><span class="logo" aria-hidden="true">r</span>resumake</span>
    <div class="splash-links">
      <a href={SOURCE} target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        Source
      </a>
      <a href={SITE} target="_blank" rel="noopener noreferrer">chasestrickler.com</a>
    </div>
  </nav>

  <div class="splash-body">
    <div class="pitch">
      <p class="eyebrow">Open source · runs entirely in your browser</p>
      <h1>Your resume, written once.</h1>
      <p class="lede">
        Write your resume once in YAML and export it to PDF, HTML, Word, and Markdown. The editor
        renders a live preview that you can export, all in your browser.
      </p>
      <div class="cta">
        <a class="button primary" href="#editor">
          Open the editor
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 2v11M3 8.5 8 13.5l5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
        <a class="button" href={SOURCE} target="_blank" rel="noopener noreferrer">View the source</a>
      </div>
      <ul class="points">
        <li><strong>Checks as you type.</strong> Errors are underlined on the exact line.</li>
        <li><strong>Live preview.</strong> The YAML is rendered right in the page.</li>
        <li><strong>Stays on your machine.</strong> Nothing you type is sent anywhere.</li>
      </ul>
    </div>

    <!-- A picture of the idea: YAML in, a formatted page out. Decorative, so hidden from screen readers. -->
    <div class="visual" aria-hidden="true">
      <div class="yaml">
        <div class="yaml-bar"><span></span><span></span><span></span><em>resume.yml</em></div>
<pre><span class="k">basics</span>:
  <span class="k">name</span>: Jordan Example
  <span class="k">label</span>: Senior Software Engineer
<span class="k">work</span>:
  - <span class="k">company</span>: Acme Analytics
    <span class="k">position</span>: Senior Engineer
    <span class="k">start</span>: <span class="n">2023-02</span>
    <span class="k">highlights</span>:
      - Cut p99 latency by <span class="n">60%</span></pre>
      </div>
      <div class="paper">
        <p class="paper-name">Jordan Example</p>
        <p class="paper-label">Senior Software Engineer</p>
        <p class="paper-h">Experience</p>
        <p class="paper-row"><b>Acme Analytics</b><i>Feb 2023 – Present</i></p>
        <p class="paper-sub">Senior Engineer</p>
        <span class="line w90"></span><span class="line w70"></span>
        <p class="paper-h">Skills</p>
        <span class="line w80"></span><span class="line w60"></span>
      </div>
      <ul class="formats"><li>PDF</li><li>Word</li><li>HTML</li><li>Markdown</li></ul>
    </div>
  </div>

  <a class="scroll-cue" href="#editor" aria-label="Scroll to the editor">
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </a>
</section>

<style>
  .splash {
    position: relative;
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    padding: 1.25rem clamp(1rem, 4vw, 3rem) 3.5rem;
    background:
      radial-gradient(1200px 600px at 85% 10%, var(--splash-glow), transparent 60%),
      var(--bg);
    border-bottom: 1px solid var(--border);
  }

  .splash-nav { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .wordmark { display: inline-flex; align-items: center; gap: 0.5rem; font: 700 1.05rem Georgia, serif; }
  .wordmark .logo { width: 1.75rem; height: 1.75rem; font-size: 1rem; }
  .splash-links { display: flex; gap: 1.25rem; font-size: 0.9rem; }
  .splash-links a { color: var(--muted); text-decoration: none; display: inline-flex; align-items: center; gap: 0.35rem; }
  .splash-links a:hover { color: var(--text); }

  .splash-body {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
    gap: clamp(2rem, 5vw, 4.5rem);
    align-items: center;
    max-width: 1180px;
    width: 100%;
    margin: 0 auto;
    padding: 2rem 0;
  }

  .eyebrow {
    margin: 0 0 1rem; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--accent);
  }
  h1 {
    margin: 0;
    font: 700 clamp(2.4rem, 5.5vw, 4.25rem) / 1.05 Georgia, 'Times New Roman', serif;
    letter-spacing: -0.02em;
    text-wrap: balance;
  }
  .lede { margin: 1.25rem 0 0; font-size: clamp(1rem, 1.6vw, 1.15rem); line-height: 1.6; color: var(--muted); max-width: 36rem; }

  .cta { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 2rem; }
  .button {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 0.75rem 1.25rem; border-radius: 8px; font-weight: 600; text-decoration: none;
    border: 1px solid var(--border); background: var(--surface); color: var(--text);
  }
  .button:hover { border-color: var(--accent); }
  .button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
  .button.primary:hover { filter: brightness(1.08); }
  .button:focus-visible, .splash-links a:focus-visible, .scroll-cue:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

  .points { list-style: none; padding: 0; margin: 2.25rem 0 0; display: grid; gap: 0.6rem; font-size: 0.92rem; color: var(--muted); }
  .points li { padding-left: 1.4rem; position: relative; }
  .points li::before {
    content: ''; position: absolute; left: 0; top: 0.5em; width: 0.55rem; height: 0.55rem; border-radius: 2px;
    background: var(--accent);
  }
  .points strong { color: var(--text); }

  /* --- the picture --- */
  .visual { position: relative; display: grid; gap: 1rem; justify-items: center; }
  .yaml {
    width: min(100%, 25rem);
    background: #1f242b; color: #d6dde6;
    border-radius: 10px; overflow: hidden;
    border: 1px solid rgb(255 255 255 / 0.08); /* keeps its edge against a dark page */
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.18);
    transform: rotate(-2deg) translateX(-8%);
  }
  .yaml-bar { display: flex; align-items: center; gap: 0.35rem; padding: 0.5rem 0.75rem; background: #2a3038; }
  .yaml-bar span { width: 0.6rem; height: 0.6rem; border-radius: 50%; background: #4a5360; }
  .yaml-bar em { margin-left: 0.5rem; font: 0.75rem ui-monospace, Menlo, Consolas, monospace; color: #9aa5b3; font-style: normal; }
  .yaml pre { margin: 0; padding: 0.9rem 1rem 1rem; font: 0.8rem/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow: hidden; }
  .yaml .k { color: #7fb4ea; }
  .yaml .n { color: #e5b567; }

  .paper {
    width: min(92%, 22rem);
    margin-top: -4.5rem;
    transform: rotate(1.5deg) translateX(14%);
    background: #fff; color: #222;
    padding: 1.4rem 1.5rem 1.5rem;
    border-radius: 3px;
    box-shadow: 0 2px 4px rgb(0 0 0 / 0.08), 0 16px 40px rgb(0 0 0 / 0.16);
    font-family: Georgia, serif;
  }
  .paper p { margin: 0; }
  .paper-name { text-align: center; font-weight: 700; font-size: 1.35rem; color: #000; }
  .paper-label { text-align: center; font-size: 0.75rem; margin-bottom: 0.5rem; }
  .paper-h {
    font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
    border-bottom: 1px solid #000; margin: 0.6rem 0 0.35rem !important; color: #000;
  }
  .paper-row { display: flex; justify-content: space-between; font-size: 0.7rem; }
  .paper-row i { color: #444; }
  .paper-sub { font-size: 0.68rem; font-style: italic; margin-bottom: 0.3rem !important; }
  .line { display: block; height: 0.32rem; border-radius: 2px; background: #e3e6ea; margin: 0.28rem 0 0 0.6rem; }
  .w90 { width: 88%; } .w80 { width: 78%; } .w70 { width: 66%; } .w60 { width: 55%; }

  .formats { list-style: none; padding: 0; margin: 0.25rem 0 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem; }
  .formats li {
    font-size: 0.78rem; font-weight: 600; padding: 0.25rem 0.7rem; border-radius: 999px;
    background: var(--surface); border: 1px solid var(--border); color: var(--muted);
  }

  .scroll-cue {
    position: absolute; left: 50%; bottom: 1rem; transform: translateX(-50%);
    color: var(--muted); padding: 0.25rem; border-radius: 50%;
    animation: nudge 2s ease-in-out infinite;
  }
  .scroll-cue:hover { color: var(--text); }
  @keyframes nudge { 0%, 100% { translate: 0 0; } 50% { translate: 0 5px; } }
  @media (prefers-reduced-motion: reduce) { .scroll-cue { animation: none; } }

  @media (max-width: 900px) {
    .splash-body { grid-template-columns: 1fr; padding-top: 2.5rem; }
    .visual { max-width: 30rem; margin: 0 auto; width: 100%; }
    .yaml { transform: rotate(-1.5deg); }
    .paper { transform: rotate(1deg) translateX(6%); }
  }
  @media (max-width: 420px) {
    .splash-links { gap: 0.9rem; font-size: 0.85rem; }
    .yaml pre { font-size: 0.72rem; }
  }
</style>
