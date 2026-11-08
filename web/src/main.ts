import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

// Always use https:// on the real site. GitHub sign-in returns to the https:// address, and the
// check value it relies on is stored per address, so a session started on http:// can't finish.
if (window.location.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
  window.location.replace(`https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`);
}

export default mount(App, { target: document.getElementById('app')! });
