export type Platform = 'youtube' | 'tiktok' | 'instagram' | 'facebook';

const PATTERNS: Record<Platform, RegExp> = {
  youtube:
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  tiktok:
    /(?:https?:\/\/)?(?:www\.|vm\.|vt\.)?tiktok\.com\//,
  instagram:
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|tv)\/[A-Za-z0-9_-]+/,
  facebook:
    /(?:https?:\/\/)?(?:www\.|m\.)?(?:facebook\.com|fb\.watch)\//,
};

export function detectPlatform(url: string): Platform | null {
  for (const [platform, pattern] of Object.entries(PATTERNS) as [Platform, RegExp][]) {
    if (pattern.test(url)) return platform;
  }
  return null;
}

export function isValidUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}
