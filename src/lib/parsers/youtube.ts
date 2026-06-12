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

/** Method 2: youtubei.js Innertube API — works when ytdl-core is blocked */
async function tryInnertube(rawUrl: string): Promise<VideoResult | null> {
  try {
    const videoId = extractVideoId(rawUrl);
    if (!videoId) return null;

    const yt = await Innertube.create({
      retrieve_player: true,
      generate_session_locally: true,
      cache: new UniversalCache(false),
    });

    const info = await yt.getBasicInfo(videoId, 'WEB');
    const title = info.basic_info.title ?? 'YouTube Video';
    const thumbnail =
      info.basic_info.thumbnail?.at(-1)?.url ??
      info.basic_info.thumbnail?.[0]?.url;

    const streamingData = info.streaming_data;
    if (!streamingData) return null;

    // Prefer adaptive (higher quality) then muxed (progressive with audio+video)
    const formats = [
      ...(streamingData.adaptive_formats ?? []),
      ...(streamingData.formats ?? []),
    ];

    // Find best mp4 format with both video+audio (muxed) first
    const muxed = formats
      .filter(
        (f) =>
          f.mime_type?.includes('video/mp4') &&
          (f as unknown as { has_audio?: boolean }).has_audio !== false,
      )
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

    const best = muxed[0] ?? formats[0];
    if (!best) return null;

    const url = await best.decipher(yt.session.player);
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
  // Try ytdl-core first (faster), fall back to Innertube
  const result = (await tryYtdl(rawUrl)) ?? (await tryInnertube(rawUrl));
  if (result) return result;
  throw new Error(
    'Could not extract YouTube video. The video may be age-restricted, private, or region-locked.',
  );
}

