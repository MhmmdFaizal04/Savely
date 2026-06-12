# Savely

A fast, free video downloader for YouTube, TikTok, Instagram, and Facebook. Built with Astro.js SSR and deployed on Vercel — no paid APIs, no sign-up required.

![Astro](https://img.shields.io/badge/Astro-6.4.6-orange?style=flat-square&logo=astro) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=flat-square&logo=tailwind-css) ![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-black?style=flat-square&logo=vercel)

---

## Features

- Download videos from **YouTube**, **TikTok**, **Instagram**, and **Facebook**
- No API keys required — uses custom parsers
- Server-side proxy for CDN-protected platforms (TikTok, Instagram, Facebook)
- YouTube extraction via `@distube/ytdl-core` with `youtubei.js` Innertube API fallback
- Supports short URLs: `youtu.be/`, `vm.tiktok.com`, `fb.watch`, `instagram.com/reel/`
- Clean, minimal dark UI — no ads, no trackers

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Astro.js 6](https://astro.build) — SSR server mode |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) via `@tailwindcss/vite` |
| Animations | [GSAP 3](https://gsap.com) + ScrollTrigger |
| YouTube | `@distube/ytdl-core` + `youtubei.js` (Innertube fallback) |
| TikTok / Instagram / Facebook | Custom `node-fetch` parsers |
| Adapter | `@astrojs/vercel` (serverless) |
| Fonts | Newsreader · Bricolage Grotesque · DM Mono |

---

## Getting Started

### Prerequisites

- Node.js >= 22.12.0
- npm

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/savely.git
cd savely
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:4321](http://localhost:4321).

### Build

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

---

## Environment Variables

Create a `.env` file in the root:

```env
# Optional: Instagram cookie for authenticated scraping (improves success rate)
# IG_COOKIE=your_instagram_session_cookie

# Required for absolute URL generation in production
SITE_URL=https://your-deployment-url.vercel.app
```

See `.env.example` for reference.

---

## Project Structure

```
savely/
├── src/
│   ├── components/
│   │   ├── Header.astro
│   │   ├── Hero.astro
│   │   ├── DownloadForm.astro
│   │   ├── PlatformBadges.astro
│   │   ├── HowItWorks.astro
│   │   ├── Features.astro
│   │   ├── FaqAccordion.astro
│   │   └── Footer.astro
│   ├── layouts/
│   │   └── Layout.astro
│   ├── lib/
│   │   ├── detect.ts           # URL platform detection
│   │   └── parsers/
│   │       ├── youtube.ts
│   │       ├── tiktok.ts
│   │       ├── instagram.ts
│   │       └── facebook.ts
│   ├── pages/
│   │   ├── index.astro
│   │   ├── download.astro
│   │   ├── faq.astro
│   │   ├── 404.astro
│   │   └── api/
│   │       ├── download.ts     # POST endpoint — parses URL, returns video info
│   │       └── proxy.ts        # Server-side proxy — streams CDN video
│   └── styles/
│       └── global.css
├── astro.config.mjs
├── vercel.json
├── .env.example
└── package.json
```

---

## How It Works

1. User pastes a video URL into the input field
2. The frontend detects the platform in real time (YouTube / TikTok / Instagram / Facebook)
3. On submit, a `POST /api/download` request is sent with the URL
4. The server calls the appropriate parser to extract a direct video URL
5. For TikTok, Instagram, and Facebook the server returns a `/api/proxy` URL instead of the raw CDN URL — the proxy re-parses the original link at download time to always get a fresh signed CDN URL (avoiding expiry issues)
6. The browser triggers a download via the returned URL

---

## Deployment (Vercel)

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import the repo
3. Framework preset: **Astro** (auto-detected)
4. Add environment variable: `SITE_URL=https://your-project.vercel.app`
5. Click **Deploy**

The `vercel.json` is already configured with a 30-second function timeout for the API routes.

---

## API Reference

### `POST /api/download`

**Request body:**
```json
{ "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
```

**Response:**
```json
{
  "title": "Video Title",
  "url": "https://...",
  "quality": "720p",
  "platform": "youtube",
  "thumbnail": "https://...",
  "proxied": false
}
```

### `GET /api/proxy`

| Query param | Description |
|---|---|
| `source` | Original platform page URL (re-parsed server-side) |
| `platform` | `tiktok` \| `instagram` \| `facebook` |
| `filename` | Suggested download filename (without extension) |

Returns the video stream with `Content-Disposition: attachment`.

---

## Known Limitations

- **Instagram**: Heavily rate-limits scraping from residential IPs. Works best on Vercel production (server IP).
- **YouTube age-restricted / private videos**: Not supported.
- **Facebook**: Only works on public posts and share links.
- **TikTok**: CDN URLs are signed and expire quickly — the proxy handles this automatically.

---

## License

MIT

---

## Disclaimer

This project is intended for personal use and downloading publicly available content you have the right to download. Respect copyright and each platform's terms of service.

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
