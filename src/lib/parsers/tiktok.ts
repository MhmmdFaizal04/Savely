import fetch from 'node-fetch';
import type { VideoResult } from './youtube.js';

// Mobile UA — TikTok returns lighter JSON with more accessible video data
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function decode(str: string): string {
  return str
    .replace(/\\u002F/g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/');
}

/** Resolve vt.tiktok.com / vm.tiktok.com short links to full URL */
async function resolveShortUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': MOBILE_UA },
    });
    return res.url || url;
  } catch {
    return url;
  }
}

/** Extract video URL from TikTok __UNIVERSAL_DATA_FOR_REHYDRATION__ (current format) */
function fromUniversalData(html: string): { videoUrl: string | null; title: string; thumbnail?: string } {
  const match = html.match(
    /<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match) return { videoUrl: null, title: 'TikTok Video' };

  try {
    const data = JSON.parse(match[1]);
    // Navigate: __DEFAULT_SCOPE__ -> webapp.video-detail -> itemInfo -> itemStruct
    const scope = data?.__DEFAULT_SCOPE__ ?? {};
    const detail =
      scope['webapp.video-detail'] ??
      scope['webapp.reflow-video-detail'] ??
      Object.values(scope).find(
        (v: unknown) => (v as Record<string, unknown>)?.itemInfo,
      );
    const item = (detail as Record<string, unknown>)?.itemInfo?.itemStruct as
      | Record<string, unknown>
      | undefined;
    if (!item) return { videoUrl: null, title: 'TikTok Video' };

    const video = item.video as Record<string, unknown> | undefined;
    const desc = (item.desc as string) || (item.title as string) || 'TikTok Video';
    const cover =
      (video?.cover as string) ||
      (video?.originCover as string) ||
      (video?.dynamicCover as string) ||
      undefined;

    const videoUrl =
      (video?.playAddr as string) ||
      (video?.downloadAddr as string) ||
      (video?.bitrateInfo as { PlayAddr?: { UrlList?: string[] } }[])?.[0]
        ?.PlayAddr?.UrlList?.[0] ||
      null;

    return { videoUrl: videoUrl ? decode(videoUrl) : null, title: desc, thumbnail: cover };
  } catch {
    return { videoUrl: null, title: 'TikTok Video' };
  }
}

/** Extract from older SIGI_STATE format */
function fromSigiState(html: string): { videoUrl: string | null; title: string; thumbnail?: string } {
  const match = html.match(/<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return { videoUrl: null, title: 'TikTok Video' };

  try {
    const data = JSON.parse(match[1]);
    const itemModule = data?.ItemModule ?? {};
    const firstItem = Object.values(itemModule)[0] as Record<string, unknown> | undefined;
    if (!firstItem) return { videoUrl: null, title: 'TikTok Video' };

    const video = firstItem.video as Record<string, unknown> | undefined;
    const title = (firstItem.desc as string) || 'TikTok Video';
    const thumbnail = (firstItem.cover as string) || undefined;
    const videoUrl =
      (video?.playAddr as string) ||
      (video?.downloadAddr as string) ||
      null;
    return { videoUrl: videoUrl ? decode(videoUrl) : null, title, thumbnail };
  } catch {
    return { videoUrl: null, title: 'TikTok Video' };
  }
}

/** Last-resort regex extraction from raw HTML */
function fromRegex(html: string): string | null {
  const patterns = [
    /"playAddr"\s*:\s*"([^"]+)"/,
    /"downloadAddr"\s*:\s*"([^"]+)"/,
    /"playUrl"\s*:\s*"([^"]+)"/,
    /\"url\"\s*:\s*\"(https:\\\/\\\/[^"]*\.mp4[^"]*)\"/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return decode(m[1]);
  }
  return null;
}

export async function parseTiktok(rawUrl: string): Promise<VideoResult> {
  // Step 1: resolve short URLs
  let url = rawUrl;
  if (/vm\.|vt\./.test(url)) {
    url = await resolveShortUrl(url);
  }

  // Step 2: fetch with desktop UA first (richer JSON)
  let html = '';
  const desktopResp = await fetch(url, {
    headers: {
      'User-Agent': DESKTOP_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      Referer: 'https://www.tiktok.com/',
    },
    redirect: 'follow',
  });
  if (desktopResp.ok) html = await desktopResp.text();

  // Step 3: try __UNIVERSAL_DATA_FOR_REHYDRATION__ (current TikTok format)
  let result = fromUniversalData(html);
  if (result.videoUrl) {
    return { title: result.title, url: result.videoUrl, quality: 'HD', platform: 'tiktok', thumbnail: result.thumbnail };
  }

  // Step 4: try SIGI_STATE (older format)
  result = fromSigiState(html);
  if (result.videoUrl) {
    return { title: result.title, url: result.videoUrl, quality: 'HD', platform: 'tiktok', thumbnail: result.thumbnail };
  }

  // Step 5: regex fallback on desktop HTML
  const regexUrl = fromRegex(html);
  if (regexUrl) {
    return { title: 'TikTok Video', url: regexUrl, quality: 'HD', platform: 'tiktok' };
  }

  // Step 6: retry with mobile UA (different page structure)
  const mobileResp = await fetch(url, {
    headers: {
      'User-Agent': MOBILE_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    redirect: 'follow',
  });
  if (mobileResp.ok) {
    const mobileHtml = await mobileResp.text();
    const mobileResult = fromUniversalData(mobileHtml);
    if (mobileResult.videoUrl) {
      return { title: mobileResult.title, url: mobileResult.videoUrl, quality: 'HD', platform: 'tiktok', thumbnail: mobileResult.thumbnail };
    }
    const mobileRegex = fromRegex(mobileHtml);
    if (mobileRegex) {
      return { title: 'TikTok Video', url: mobileRegex, quality: 'HD', platform: 'tiktok' };
    }
  }

  throw new Error(
    'Could not extract TikTok video. TikTok may be blocking the request — try a full tiktok.com URL instead of a short link, or try again in a moment.',
  );
}
