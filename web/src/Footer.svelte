<script lang="ts">
  import { AUTHOR, GITHUB_ICON_PATH, SITE_LABEL, SITE_URL, SOURCE_URL } from './lib/links';
</script>

<footer class="site-footer">
  <a class="footer-brand" href="#top"><span class="logo" aria-hidden="true">r</span>resumake</a>
  <p class="footer-made">Made by {AUTHOR}</p>
  <nav class="footer-links" aria-label="Links">
    <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path fill="currentColor" d={GITHUB_ICON_PATH} /></svg>
      Source on GitHub
    </a>
    <a href={SITE_URL} target="_blank" rel="noopener noreferrer">{SITE_LABEL}</a>
  </nav>
</footer>

<style>
  .site-footer {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1.5rem;
    padding: 1.25rem clamp(1rem, 4vw, 3rem);
    border-top: 1px solid var(--border);
    background: var(--surface);
    font-size: 0.875rem; color: var(--muted);
  }
  .footer-brand {
    display: inline-flex; align-items: center; gap: 0.45rem;
    font: 700 0.95rem Georgia, serif; color: var(--text); text-decoration: none;
  }
  .footer-brand .logo { width: 1.4rem; height: 1.4rem; font-size: 0.85rem; }
  .footer-made { margin: 0; }
  .footer-links { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; margin-left: auto; }
  .footer-links a { color: var(--muted); text-decoration: none; display: inline-flex; align-items: center; gap: 0.35rem; }
  .footer-links a:hover { color: var(--text); text-decoration: underline; text-underline-offset: 3px; }
  a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 2px; }
  @media (max-width: 560px) { .footer-links { margin-left: 0; width: 100%; } }
</style>
