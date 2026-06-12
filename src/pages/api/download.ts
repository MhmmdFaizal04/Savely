import type { APIRoute } from 'astro';
import { detectPlatform, isValidUrl } from '../../lib/detect.js';
import { parseYoutube } from '../../lib/parsers/youtube.js';
import { parseTiktok } from '../../lib/parsers/tiktok.js';
import { parseInstagram } from '../../lib/parsers/instagram.js';
import { parseFacebook } from '../../lib/parsers/facebook.js';

export const POST: APIRoute = async ({ request }) => {
  // Only accept JSON
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return new Response(JSON.stringify({ error: 'Content-Type must be application/json' }), {
      status: 415,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { url } = body as { url?: unknown };

  if (typeof url !== 'string' || !url.trim()) {
    return new Response(JSON.stringify({ error: 'A valid URL is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rawUrl = url.trim();

  if (!isValidUrl(rawUrl)) {
    return new Response(JSON.stringify({ error: 'URL must start with http:// or https://' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const platform = detectPlatform(rawUrl);
  if (!platform) {
    return new Response(
      JSON.stringify({
        error: 'Unsupported platform. Paste a link from YouTube, TikTok, Instagram, or Facebook.',
      }),
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    let result;
    switch (platform) {
      case 'youtube':
        result = await parseYoutube(rawUrl);
        break;
      case 'tiktok':
        result = await parseTiktok(rawUrl);
        break;
      case 'instagram':
        result = await parseInstagram(rawUrl);
        break;
      case 'facebook':
        result = await parseFacebook(rawUrl);
        break;
    }

    // TikTok/Instagram/Facebook CDN URLs expire quickly.
    // Pass the ORIGINAL source URL to /api/proxy so it re-parses at download time
    // and always gets a fresh CDN URL.
    if (platform !== 'youtube' && result!.url) {
      const slug = (result!.title ?? 'video')
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 60) || 'video';
      result!.url =
        `/api/proxy?source=${encodeURIComponent(rawUrl)}&platform=${platform}&filename=${encodeURIComponent(slug)}`;
      result!.proxied = true;
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Prevent caching — download URLs are short-lived
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
