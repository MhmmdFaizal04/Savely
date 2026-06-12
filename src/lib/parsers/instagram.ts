import fetch from 'node-fetch';
import type { VideoResult } from './youtube.js';

function decode(str: string): string {
  return str
    .replace(/\\u002F/g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/\\u0025/g, '%')
    .replace(/\\\//g, '/');
}

const IG_HEADERS_DESKTOP = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
};

const IG_HEADERS_MOBILE = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** Extract shortcode from Instagram URL (/p/, /reel/, /tv/) */
function extractShortcode(url: string): string | null {
  const m = url.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return m?.[1] ?? null;
}

export async function parseInstagram(rawUrl: string): Promise<VideoResult> {
  const parsed = new URL(rawUrl);
  const cleanUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/$/, '')}`;
  const shortcode = extractShortcode(cleanUrl);

  let title = 'Instagram Video';
  let thumbnail: string | undefined;

  // --- Method 1: Instagram embed page (public, no login required) ---
  // The /embed/ endpoint is publicly accessible and contains full video URL
  if (shortcode) {
    for (const embedPath of [
      `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
      `https://www.instagram.com/reel/${shortcode}/embed/captioned/`,
      `https://www.instagram.com/p/${shortcode}/embed/`,
    ]) {
      try {
        const embedResp = await fetch(embedPath, {
          headers: {
            ...IG_HEADERS_DESKTOP,
            Referer: 'https://www.instagram.com/',
          },
        });
        if (!embedResp.ok) continue;
        const embedHtml = await embedResp.text();

        // Multiple patterns for the video URL in embed HTML
        const videoMatch =
          embedHtml.match(/"video_url"\s*:\s*"([^"]+)"/) ||
          embedHtml.match(/"videoUrl"\s*:\s*"([^"]+)"/) ||
          embedHtml.match(/property="og:video"\s+content="([^"]+)"/) ||
          embedHtml.match(/content="([^"]+)"\s+property="og:video"/) ||
          embedHtml.match(/<video[^>]+src="(https?:[^"]+)"/) ||
          embedHtml.match(/"contentUrl"\s*:\s*"([^"]+)"/) ||
          embedHtml.match(/playable_url"\s*:\s*"([^"]+)"/);

        if (videoMatch?.[1]) {
          const videoUrl = decode(videoMatch[1]);
          if (!videoUrl.startsWith('http')) continue;

          const titleMatch =
            embedHtml.match(/property="og:title"\s+content="([^"]+)"/) ||
            embedHtml.match(/content="([^"]+)"\s+property="og:title"/) ||
            embedHtml.match(/<title[^>]*>([^<]+)<\/title>/);
          if (titleMatch) title = titleMatch[1].replace(/[•·]\s*Instagram.*$/i, '').trim();

          const thumbMatch =
            embedHtml.match(/property="og:image"\s+content="([^"]+)"/) ||
            embedHtml.match(/content="([^"]+)"\s+property="og:image"/) ||
            embedHtml.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/);
          thumbnail = thumbMatch ? decode(thumbMatch[1]) : undefined;

          return { title, url: videoUrl, quality: 'HD', platform: 'instagram', thumbnail };
        }
      } catch {
        continue;
      }
    }
  }

  // --- Method 2: Fetch page with desktop UA, extract from JSON blobs ---
  try {
    const desktopResp = await fetch(cleanUrl, { headers: IG_HEADERS_DESKTOP });
    if (desktopResp.ok) {
      const html = await desktopResp.text();
      const videoMatch =
        html.match(/"video_url"\s*:\s*"([^"]+)"/) ||
        html.match(/property="og:video:secure_url"\s+content="([^"]+)"/) ||
        html.match(/property="og:video"\s+content="([^"]+)"/) ||
        html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:video/);
      if (videoMatch?.[1]) {
        const titleMatch = html.match(/property="og:title"\s+content="([^"]+)"/);
        if (titleMatch) title = titleMatch[1].replace(/[•·]\s*Instagram.*$/i, '').trim();
        const thumbMatch = html.match(/property="og:image"\s+content="([^"]+)"/);
        thumbnail = thumbMatch ? decode(thumbMatch[1]) : undefined;
        return { title, url: decode(videoMatch[1]), quality: 'HD', platform: 'instagram', thumbnail };
      }
    }
  } catch {
    // fall through
  }

  // --- Method 3: Mobile UA scrape ---
  try {
    const mobileResp = await fetch(cleanUrl, { headers: IG_HEADERS_MOBILE });
    if (mobileResp.ok) {
      const html = await mobileResp.text();
      const videoMatch =
        html.match(/"video_url"\s*:\s*"([^"]+)"/) ||
        html.match(/"playable_url"\s*:\s*"([^"]+)"/) ||
        html.match(/property="og:video"\s+content="([^"]+)"/) ||
        html.match(/<video[^>]+src="(https?:[^"]+)"/);
      if (videoMatch?.[1]) {
        const titleMatch = html.match(/property="og:title"\s+content="([^"]+)"/);
        if (titleMatch) title = titleMatch[1].replace(/[•·]\s*Instagram.*$/i, '').trim();
        const thumbMatch = html.match(/property="og:image"\s+content="([^"]+)"/);
        thumbnail = thumbMatch ? decode(thumbMatch[1]) : undefined;
        return { title, url: decode(videoMatch[1]), quality: 'HD', platform: 'instagram', thumbnail };
      }
    }
  } catch {
    // fall through
  }

  throw new Error(
    'Could not extract Instagram video. Only public posts are supported. Try logging in to Instagram in the same browser first, then retry.',
  );
}
