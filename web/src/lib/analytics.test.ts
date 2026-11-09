import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyticsConfig, scriptTag, themeLabel, track } from './analytics';

describe('analytics', () => {
  afterEach(() => {
    delete (globalThis as { umami?: unknown }).umami;
  });

  it('is off unless both the script and website id are set', () => {
    expect(analyticsConfig({})).toBeNull();
    expect(analyticsConfig({ VITE_UMAMI_SRC: 'https://a.example/script.js' })).toBeNull();
    expect(analyticsConfig({ VITE_UMAMI_WEBSITE_ID: 'abc' })).toBeNull();
  });

  it('requires an https script URL', () => {
    expect(() => analyticsConfig({ VITE_UMAMI_SRC: 'http://a.example/s.js', VITE_UMAMI_WEBSITE_ID: 'x' })).toThrow(/https/);
    expect(() => analyticsConfig({ VITE_UMAMI_SRC: 'not a url', VITE_UMAMI_WEBSITE_ID: 'x' })).toThrow();
  });

  it('writes a tag that sends no query string or hash and honours Do Not Track', () => {
    const cfg = analyticsConfig({
      VITE_UMAMI_SRC: 'https://a.example/script.js',
      VITE_UMAMI_WEBSITE_ID: 'abc-123',
      VITE_UMAMI_DOMAINS: 'resumake.chasestrickler.com',
    })!;
    const tag = scriptTag(cfg);
    expect(tag).toMatch(/^<script defer src="https:\/\/a\.example\/script\.js"/);
    for (const attr of ['data-website-id="abc-123"', 'data-do-not-track="true"', 'data-exclude-search="true"', 'data-exclude-hash="true"', 'data-domains="resumake.chasestrickler.com"']) {
      expect(tag).toContain(attr);
    }
  });

  it('escapes attribute values', () => {
    expect(scriptTag({ src: 'https://a.example/s.js', websiteId: 'a"b' })).toContain('data-website-id="a&quot;b"');
  });

  it('tracks through Umami when it has loaded, and quietly does nothing otherwise', () => {
    expect(() => track('load-sample')).not.toThrow();
    const umami = { track: vi.fn() };
    (globalThis as { umami?: unknown }).umami = umami;
    track('theme-pick', { theme: 'modern', via: 'gallery' });
    expect(umami.track).toHaveBeenCalledWith('theme-pick', { theme: 'modern', via: 'gallery' });
    umami.track.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => track('print-pdf')).not.toThrow();
  });

  it('never sends the name of a repo’s own theme', () => {
    expect(themeLabel({ name: 'modern' })).toBe('modern');
    expect(themeLabel({ name: 'acme-brand', custom: true })).toBe('custom');
  });
});
