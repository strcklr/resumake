/**
 * Build-time only (see `prerenderSplash` in vite.config.ts): the splash screen and footer as plain
 * HTML, put into index.html so search engines and link previews see the page's text without running
 * JavaScript. main.ts replaces it with the live app on load; the markup is the same, so nothing moves.
 */
import { render } from 'svelte/server';
import Footer from './Footer.svelte';
import Splash from './Splash.svelte';

export function prerender(): string {
  return render(Splash).body + render(Footer).body;
}
