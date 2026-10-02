# Open Generative AI × Xaen marketing tower

This fork is wired into **Xaen's marketing tower** two ways. This repo is the **studio
surface**; the tower-side engine lives in `xaen-core`.

```
                 ┌──────────────────────────────────────────────────────────┐
                 │  Featherless (text LLM)  — writes on-brand prompts         │
                 └──────────────────────────────────────────────────────────┘
                        │                                   │
        (A) tower pipeline                         (B) this studio
        xaen-core creative-generate                /api/enhance-prompt
                        │                                   │
                        ▼                                   ▼
                 ┌──────────────────────────────────────────────────────────┐
                 │  MuAPI (Open Generative AI engine) — renders image/video   │
                 └──────────────────────────────────────────────────────────┘
```

Featherless is a **text** model — it cannot render pixels and does not power MuAPI. In
both paths Featherless *writes the prompt* and MuAPI *renders it*.

## Two integration paths

**(A) Tower creative provider** — in `xaen-core`, `MuAPI` is a first-class creative
provider (`_shared/providers/muapi.ts`) behind the same `CreativeProvider` interface as
fal.ai. The tower's `creative-generate` can now render brand media through any of Open
Generative AI's 200+ MuAPI models, and its optional `brief` mode has Featherless author
the on-brand prompt first. See `xaen-core/docs/modules/creative-muapi.md`.

**(B) This studio** — the Next.js app here, deployed as an owner-facing brand-media
surface, **pre-wired** so nobody pastes a key:

- The `/api` proxy injects `MUAPI_API_KEY` **server-side** (`middleware.js` for
  `/api/v1/*`, and each `app/api/**/route.js` handler). The key is never shipped to the
  browser; the server key is authoritative in managed mode.
- `NEXT_PUBLIC_MUAPI_MANAGED=1` seeds a placeholder in `StandaloneShell` so the studio
  skips the key-entry modal.
- A floating **"Brief → Prompt"** panel (`components/BriefEnhancer.js`) calls
  `app/api/enhance-prompt/route.js`, which uses **Featherless** + the brand presets in
  `lib/xaen-brands.js` to turn a one-line brief into a vivid, on-brand render prompt to
  paste into any studio.

## Deploy (Vercel)

1. Import this repo into the Vercel project (framework auto-detected as Next.js;
   `vercel.json` pins it).
2. Set env vars (see `.env.example`) in **Project → Settings → Environment Variables**:
   - `MUAPI_API_KEY` — the tower's MuAPI key (required).
   - `NEXT_PUBLIC_MUAPI_MANAGED=1` — managed mode (skip the key modal).
   - `FEATHERLESS_API_KEY` — enables "Brief → Prompt" (the tower's Featherless key).
   - Optional: `FEATHERLESS_MODEL`, `FEATHERLESS_URL`, `MUAPI_BASE_URL`.
3. Deploy. Visit `/studio` for the studios; the "Brief → Prompt" button is bottom-right.

**Owner sign-in (2 Oct 2026).** The studio spends the group's MuAPI and Featherless credit,
so every page and every `/api` route needs a signed session: `middleware.js` refuses anything
else (401 for an API call, a redirect to `/login` for a page) before any key is injected. The
sign-in at `/login` asks Xaen Tower to check email, password and authenticator code, and only
the platform owner (`app_metadata.platform_owner`, the claim the Tower's `is_platform_owner()`
reads) gets the 4-hour cookie. The Tower session it opens is signed out again at once. Every
refusal reads the same; the sign-in and sign-out refuse requests started by another site; the
post-sign-in destination must resolve to the studio itself; each server instance caps sign-in at
five tries a minute per address. Without a signing key (`STUDIO_SESSION_SECRET`, or `MUAPI_API_KEY`
to derive one from) the studio stays locked. Recommended: set a dedicated `STUDIO_SESSION_SECRET`
(so the session key and the MuAPI key are not one secret), and add a Vercel Firewall rate-limit
rule on `POST /api/studio-auth/login`. Changing `STUDIO_SESSION_EPOCH` signs every session out.
Tests: `node --test tests/studioSession.test.mjs tests/studioLogin.test.mjs`.

**Security note:** with `MUAPI_API_KEY` set, the key stays server-side. Do not also expose
it via any `NEXT_PUBLIC_` variable. `NEXT_PUBLIC_MUAPI_MANAGED` is only a boolean flag.

## Local dev / BYO-key

Leave `MUAPI_API_KEY` and `NEXT_PUBLIC_MUAPI_MANAGED` unset to get the upstream behavior:
each user pastes their own MuAPI key, which the proxy forwards. `FEATHERLESS_API_KEY` can
still be set locally to try the "Brief → Prompt" helper.

## Brand presets

`lib/xaen-brands.js` is a curated starting set (Klaer, taech., Flower Corner, aiHealth,
Engiomed, Pantre, The Dental Store, Kyour Academy, QCare, BillCraft) with palette + voice.
Edit freely — for the automated tower pipeline, `creative_brand_kits` in `xaen-core`
remains the source of truth.
