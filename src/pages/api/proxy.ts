import type { APIRoute } from 'astro';
import { isValidUrl } from '../../lib/detect.js';

/** Block requests to private/loopback ranges (SSRF prevention) */
function isPrivateHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^::1$/.test(hostname) ||
    /^0\./.test(hostname) ||
    /^169\.254\./.test(hostname)
  );
}

/** Ensure the resolved CDN URL belongs to a known platform CDN domain */
const ALLOWED_CDN_SUFFIXES = [
  '.tiktokcdn.com',
  '.tiktokcdn-us.com',
  '.tiktokv.com',
  '.tiktok.com',
  '.bytegecko.com',
  '.ibyteimg.com',
  '.cdninstagram.com',
  '.fbcdn.net',
  '.facebook.com',
];

function isSafeCdnHost(hostname: string): boolean {
  if (isPrivateHostname(hostname)) return false;
  return ALLOWED_CDN_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

const PLATFORM_FETCH_HEADERS: Record<string, Record<string, string>> = {
  tiktok: {
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    Referer: 'https://www.tiktok.com/',
    Accept: 'video/mp4,video/*;q=0.9,*/*;q=0.8',
    'Accept-Encoding': 'identity',
    Origin: 'https://www.tiktok.com',
    Range: 'bytes=0-',
  },
  instagram: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    Referer: 'https://www.instagram.com/',
    Accept: 'video/mp4,video/*;q=0.9,*/*;q=0.8',
    'Accept-Encoding': 'identity',
  },
  facebook: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    Referer: 'https://www.facebook.com/',
    Accept: 'video/mp4,video/*;q=0.9,*/*;q=0.8',
    'Accept-Encoding': 'identity',
  },
};

export const GET: APIRoute = async ({ url: reqUrl }) => {
  const cdnUrl = reqUrl.searchParams.get('url');
  const platform = reqUrl.searchParams.get('platform') ?? 'tiktok';
  const filename = (reqUrl.searchParams.get('filename') ?? 'video')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);

  if (!cdnUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  if (!isValidUrl(cdnUrl)) {
    return new Response('Invalid URL', { status: 400 });
  }

  // Validate the resolved CDN URL — SSRF protection
  let cdnParsed: URL;
  try {
    cdnParsed = new URL(cdnUrl);
  } catch {
    return new Response('Invalid CDN URL resolved', { status: 502 });
  }

  if (!['http:', 'https:'].includes(cdnParsed.protocol)) {
    return new Response('Invalid CDN URL protocol', { status: 502 });
  }

  if (!isSafeCdnHost(cdnParsed.hostname)) {
    return new Response('CDN host not permitted', { status: 403 });
  }

  // Fetch and stream the video
  const fetchHeaders = PLATFORM_FETCH_HEADERS[platform] ?? PLATFORM_FETCH_HEADERS['tiktok']!;
  try {
    const upstream = await fetch(cdnUrl, { headers: fetchHeaders, redirect: 'follow' });

    if (!upstream.ok) {
      return new Response(
        `Upstream CDN returned ${upstream.status}. The video may be unavailable.`,
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get('content-type') ?? 'video/mp4';
    const contentLength = upstream.headers.get('content-length');
    const acceptRanges = upstream.headers.get('accept-ranges');

    const responseHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}.mp4"`,
      'Cache-Control': 'no-store',
    };
    if (contentLength) responseHeaders['Content-Length'] = contentLength;
    if (acceptRanges) responseHeaders['Accept-Ranges'] = acceptRanges;

    return new Response(upstream.body, { status: 200, headers: responseHeaders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Proxy stream failed';
    return new Response(msg, { status: 502 });
  }
};

