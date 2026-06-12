import ytdl from '@distube/ytdl-core';
import { Innertube, UniversalCache, Platform } from 'youtubei.js';
import vm from 'node:vm';

// youtubei.js requires a custom JS evaluator in server environments.
// Override the platform shim's eval with Node.js vm so player scripts can run.
// The player script uses a top-level 'return', so wrap in an IIFE.
(Platform.shim as unknown as Record<string, unknown>).eval = (
  data: { output: string },
  _env: unknown,
): unknown => vm.runInNewContext(`(function(){\n${data.output}\n})()`, Object.create(null));

export interface VideoResult {
  title: string;
  url: string;
  quality: string;
  platform: string;
  thumbnail?: string;
  proxied?: boolean;
}

/** Extract YouTube video ID from any YT URL format */
function extractVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /\/shorts\/([a-zA-Z0-9_-]{11})/,
    /\/embed\/([a-zA-Z0-9_-]{11})/,
    /\/v\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Method 1: ytdl-core — progressive streams (video+audio in one file) */
async function tryYtdl(rawUrl: string): Promise<VideoResult | null> {
  try {
    const info = await ytdl.getInfo(rawUrl);
    const title = info.videoDetails.title;
    const thumbnail = info.videoDetails.thumbnails.at(-1)?.url;

    // Try progressive first (video+audio), then any video format
    let formats = ytdl.filterFormats(info.formats, 'videoandaudio');
    if (!formats.length) formats = ytdl.filterFormats(info.formats, 'video');

    const sorted = formats
      .filter((f) => !!f.url)
      .sort((a, b) => {
        const qa = parseInt(a.qualityLabel ?? '0', 10);
        const qb = parseInt(b.qualityLabel ?? '0', 10);
        return qb - qa;
      });

    const best = sorted[0];
    if (!best?.url) return null;

    return {
      title,
      url: best.url,
      quality: best.qualityLabel ?? 'SD',
      platform: 'youtube',
      thumbnail,
    };
  } catch {
    return null;
  }
}

/** Pick best muxed (video+audio) mp4 format from a list, sorted by quality */
function pickBestFormat(formats: Array<{ mime_type?: string; bitrate?: number }>): (typeof formats)[0] | null {
  const mp4 = formats.filter((f) => f.mime_type?.startsWith('video/mp4'));
  // streamingData.formats are muxed; adaptive_formats are separate video/audio
  // Prefer higher bitrate
  const sorted = mp4.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  return sorted[0] ?? formats.find((f) => f.mime_type?.startsWith('video/')) ?? null;
}

/** Method 2a: Innertube ANDROID client — returns direct URLs, no decipher needed */
async function tryInnertubeAndroid(videoId: string): Promise<VideoResult | null> {
  try {
    const yt = await Innertube.create({
      // ANDROID client gets direct streaming URLs — no JS eval/decipher required
      retrieve_player: false,
      generate_session_locally: true,
      cache: new UniversalCache(false),
    });

    const info = await yt.getBasicInfo(videoId, 'ANDROID');
    const title = info.basic_info.title ?? 'YouTube Video';
    const thumbnail =
      info.basic_info.thumbnail?.at(-1)?.url ?? info.basic_info.thumbnail?.[0]?.url;

    const streamingData = info.streaming_data;
    if (!streamingData) return null;

    const allFormats = [
      ...(streamingData.formats ?? []),
      ...(streamingData.adaptive_formats ?? []),
    ];
    if (!allFormats.length) return null;

    const best = pickBestFormat(allFormats);
    if (!best) return null;

    // ANDROID client URLs are plain — decipher is a no-op (no player needed)
    const url = await (best as { decipher: (p: null) => Promise<string> }).decipher(null);
    if (!url) return null;

    const qualityLabel =
      (best as unknown as { quality_label?: string }).quality_label ??
      (best as unknown as { quality?: string }).quality ??
      'HD';

    return { title, url, quality: String(qualityLabel), platform: 'youtube', thumbnail };
  } catch {
    return null;
  }
}

/** Method 2b: Innertube WEB client — needs vm-based JS eval for decipher */
async function tryInnertubeWeb(videoId: string): Promise<VideoResult | null> {
  try {
    const yt = await Innertube.create({
      retrieve_player: true,
      generate_session_locally: true,
      cache: new UniversalCache(false),
    });

    const info = await yt.getBasicInfo(videoId, 'WEB');
    const title = info.basic_info.title ?? 'YouTube Video';
    const thumbnail =
      info.basic_info.thumbnail?.at(-1)?.url ?? info.basic_info.thumbnail?.[0]?.url;

    const streamingData = info.streaming_data;
    if (!streamingData) return null;

    const allFormats = [
      ...(streamingData.formats ?? []),
      ...(streamingData.adaptive_formats ?? []),
    ];
    if (!allFormats.length) return null;

    const best = pickBestFormat(allFormats);
    if (!best) return null;

    const url = await (best as { decipher: (p: unknown) => Promise<string> }).decipher(
      yt.session.player,
    );
    if (!url) return null;

    const qualityLabel =
      (best as unknown as { quality_label?: string }).quality_label ??
      (best as unknown as { quality?: string }).quality ??
      'HD';

    return { title, url, quality: String(qualityLabel), platform: 'youtube', thumbnail };
  } catch {
    return null;
  }
}

export async function parseYoutube(rawUrl: string): Promise<VideoResult> {
  const videoId = extractVideoId(rawUrl);
  if (!videoId) {
    throw new Error('Could not find a YouTube video ID in that URL.');
  }

  // Try methods in order — first success wins
  const result =
    (await tryYtdl(rawUrl)) ??
    (await tryInnertubeAndroid(videoId)) ??
    (await tryInnertubeWeb(videoId));

  if (result) return result;

  throw new Error(
    'Could not extract this YouTube video. It may be age-restricted, private, or unavailable.',
  );
}

