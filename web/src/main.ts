import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

// index.html holds a prerendered copy of the splash screen and footer (for search engines and link
// previews; see src/prerender.ts). Swap it for the live app.
const target = document.getElementById('app')!;
target.replaceChildren();

export default mount(App, { target });
