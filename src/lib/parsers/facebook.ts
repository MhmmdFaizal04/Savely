import fetch from 'node-fetch';
import type { VideoResult } from './youtube.js';

const FB_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
};

function decode(str: string): string {
  return str
    .replace(/\\u002F/g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/\\\//g, '/');
}

/** Resolve fb.watch and facebook.com/share/* short links to a canonical video URL */
async function resolveUrl(rawUrl: string): Promise<string> {
  const needsResolve =
    rawUrl.includes('fb.watch') ||
    rawUrl.includes('/share/') ||
    rawUrl.includes('m.facebook.com');

  if (!needsResolve) return rawUrl;

  try {
    const resp = await fetch(rawUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: FB_HEADERS,
    });
    // After redirect the final URL should be a canonical /videos/ or /reel/ URL
    const finalUrl = resp.url || rawUrl;
    return finalUrl;
  } catch {
    return rawUrl;
  }
}

export async function parseFacebook(rawUrl: string): Promise<VideoResult> {
  // Step 1: resolve share/short links to canonical URL
  const resolvedUrl = await resolveUrl(
    rawUrl.replace('m.facebook.com', 'www.facebook.com'),
  );

  const url = resolvedUrl.replace('m.facebook.com', 'www.facebook.com');

  const resp = await fetch(url, { headers: FB_HEADERS, redirect: 'follow' });
  if (!resp.ok) throw new Error(`Facebook fetch failed: ${resp.status}`);
  const html = await resp.text();

  // Extract title
  const titleMatch =
    html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/) ||
    html.match(/<title[^>]*>([^<]+)<\/title>/);
  const title = titleMatch ? titleMatch[1].trim().replace(' | Facebook', '').replace(' - Facebook', '') : 'Facebook Video';

  // Extract thumbnail
  const thumbMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
  const thumbnail = thumbMatch ? decode(thumbMatch[1]) : undefined;

  // Pattern list — FB changes structure often, try all
  const patterns: Array<[RegExp, string]> = [
    [/"hd_src":\s*"([^"]+)"/, 'HD'],
    [/"playable_url_quality_hd":\s*"([^"]+)"/, 'HD'],
    [/"playable_url":\s*"([^"]+)"/, 'HD'],
    [/"sd_src":\s*"([^"]+)"/, 'SD'],
    [/"playable_url_quality_sd":\s*"([^"]+)"/, 'SD'],
    [/"browser_native_hd_url":\s*"([^"]+)"/, 'HD'],
    [/"browser_native_sd_url":\s*"([^"]+)"/, 'SD'],
    // Newer inline JSON format
    [/"videoUrl":\s*"([^"]+\.mp4[^"]*?)"/, 'HD'],
    [/"src":\s*"(https:\/\/[^"]*\.mp4[^"]*?)"/, 'HD'],
  ];

  for (const [pattern, quality] of patterns) {
    const m = html.match(pattern);
    if (m?.[1]) {
      const videoUrl = decode(m[1]);
      if (videoUrl.startsWith('http') && videoUrl.includes('.mp4')) {
        return { title, url: videoUrl, quality, platform: 'facebook', thumbnail };
      }
    }
  }

  // Last resort: look for any fbcdn.net mp4 URL
  const fbcdnMatch = html.match(/https:\/\/[^"'\s]*fbcdn\.net[^"'\s]*\.mp4[^"'\s]*/g);
  if (fbcdnMatch?.[0]) {
    return { title, url: decode(fbcdnMatch[0]), quality: 'HD', platform: 'facebook', thumbnail };
  }

  throw new Error(
    'Could not extract Facebook video. Only public videos are supported. Private videos and Stories cannot be downloaded.',
  );
}
