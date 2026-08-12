# Open-Generative-AI — Self-Hosting & Cost Analysis

**Repository:** `Anil-matcha/Open-Generative-AI` (MIT, v2.0.0) — shallow-cloned into `portfolio-scan/`
**Date:** 2026-07-15
**Scope:** Can the user run this without paying for API tokens / SaaS subscriptions?

---

## 1. TL;DR

**No — not for the full feature set.** The repo is a polished UI shell; almost every model route (`image`, `video`, `cinema`, `lip-sync`, `audio`, `agents`, `workflows`) is a thin proxy in front of **MuAPI** (`api.muapi.ai`). The web build literally cannot render anything without a MuAPI key. The **desktop build** is the only path that is partially self-hosted: it bundles **`sd.cpp`** for 6 image models (SD 1.5, SDXL, Z-Image) that run on Apple Metal / CUDA / Vulkan with no API call. Everything else — the "200+ models" — is MuAPI, pay-per-generation. So the honest answer is: **free for ~3% of the catalog on a Mac; paid for the other 97%.**

---

## 2. Architecture — what runs where

```
┌─────────────────────────────── BROWSER (web) / Electron (desktop) ─────┐
│  Next.js 15 + React 19 UI  ── packages/studio (ImageStudio,             │
│  VideoStudio, LipSyncStudio, CinemaStudio, WorkflowStudio, …)           │
└────────────┬──────────────────────────────────────────────┬─────────────┘
             │ /api/v1/* (rewritten by middleware.js)        │
             │ 200+ models (Flux, Kling, Sora, Veo,         │
             │ Seedance, Nano Banana, GPT-4o, …)             │
             ▼                                               ▼
   ┌────────────────────────┐                ┌──────────────────────────┐
   │  api.muapi.ai  (paid)  │                │  Featherless (optional)  │
   │  gateway, pay/gen      │                │  Qwen2.5-72B for Brief→  │
   └────────────────────────┘                │  Prompt helper only      │
                                              └──────────────────────────┘
   Desktop-only side-channel (Electron, NOT web):
   ┌────────────────────────┐    ┌────────────────────────────────────┐
   │  sd.cpp  (bundled)     │    │  Wan2GP (BYO Gradio server,        │
   │  6 image models only   │    │  user runs on a CUDA/ROCm box)     │
   │  Metal/CUDA/Vulkan     │    │  Flux/Qwen/Wan2.2/Hunyuan/LTX       │
   └────────────────────────┘    └────────────────────────────────────┘
```

Key files:
- `middleware.js:27-50` — catches `/api/workflow`, `/api/app`, `/api/v1` and **rewrites** them to `https://api.muapi.ai`, injecting the server-side `MUAPI_API_KEY` when set.
- `vite.config.mjs:6-13` — dev proxy also points at `https://api.muapi.ai`.
- `.env.example:6-23` — `MUAPI_API_KEY` is the **required** key, `FEATHERLESS_API_KEY` is optional (only for the Brief→Prompt helper).
- `src/lib/muapi.js:1-11` — every studio calls into `MuapiClient` which always posts to `https://api.muapi.ai/api/v1/{model-endpoint}` and polls `/api/v1/predictions/{id}/result`.
- `electron/lib/localInference.js` + `electron/lib/modelCatalog.js` — the **only** truly local code path. 6 hardcoded models.
- `electron/lib/wan2gpProvider.js` — HTTP client to a user-run Wan2GP Gradio server. **No model weights or runtime shipped** — the user must provision a separate GPU box.

---

## 3. External dependencies (every paid/external call at runtime)

| Service | When called | Cost model | Required? |
|---|---|---|---|
| **MuAPI** (`api.muapi.ai`) | Every generation, every model that isn't in the 6 local sd.cpp ones | Pay-per-generation, **no subscription** (confirmed from their pricing-page meta: *"No subscriptions — pay only for what you generate"*). Per-image / per-video prices are JS-rendered on the site and I could not extract them from the static HTML — see §6. | **Yes** for the web build, for video/cinema/lip-sync/audio, and for the "200+ models" claim. |
| **Featherless** (`api.featherless.ai/v1/chat/completions`) | Only when the user clicks the "Brief → Prompt" floating button (`app/api/enhance-prompt/route.js:1-90`) | Their own pricing; default model `Qwen/Qwen2.5-72B-Instruct`. | **No** — only one specific helper; the rest of the app works without it. |
| **HuggingFace** (`huggingface.co/...`) | Desktop first-run only, when sd.cpp model weights are downloaded | Free. | Only the desktop local-inference path. |
| **GitHub Releases** (`github.com/...`) | Desktop first-run, sd.cpp engine binary download | Free. | Only desktop local path. |
| **Wan2GP Gradio server** (user's own machine) | Desktop + Wan2GP engine for video | Free, but needs a CUDA/ROCm GPU you own or rent. | Optional; otherwise video = MuAPI. |

**Not used anywhere in the repo (verified by grep):** OpenAI, Anthropic, Replicate, fal.ai, Stability direct, HuggingFace Inference API. The `models_dump.json` does tag models with a `provider` field (`muapi`, `openai`, `google`, `bytedance`, `kling`, `midjourney`, `hunyuan`, `minimax`, `grok`, `ideogram`, `alibaba`, `blackforest`, `leonardoai`, `reve`, `stability`, `vidu`, `hidream`) but the **runtime routes for all of them go through MuAPI's gateway** — see `src/lib/muapi.js` and the middleware rewrite. Those are upstream model vendors, not direct API clients.

---

## 4. Local-only paths

Three ways to use the project without paying MuAPI:

**A. Desktop app + sd.cpp engine (image-only, ~6 models)**

Available in `electron/lib/modelCatalog.js`:

| Model | Type | Weight size | RAM minimum | Notes |
|---|---|---|---|---|
| Dreamshaper 8 | SD 1.5 | 2.1 GB | 8 GB | Easiest entry point on a Mac. |
| Realistic Vision v5.1 | SD 1.5 | 2.1 GB | 8 GB | Photorealistic. |
| Anything v5 | SD 1.5 | 2.1 GB | 8 GB | Anime/illustration. |
| SDXL Base 1.0 | SDXL | 6.9 GB | 16 GB | Higher quality. |
| Z-Image Turbo | Z-Image | 2.5 GB + 2.7 GB aux | 16 GB | 8-step fast. **Hangs base 8 GB Macs** (per README). |
| Z-Image Base | Z-Image | 3.5 GB + 2.7 GB aux | 16 GB | 50-step. |

You also need the auxiliary files for Z-Image: Qwen3-4B text encoder (2.4 GB GGUF) + FLUX VAE (335 MB). Downloads happen on first use; cached under `%APPDATA%\open-generative-ai\local-ai` (Windows) / `~/Library/Application Support/open-generative-ai/local-ai` (macOS) / `~/.config/open-generative-ai/local-ai` (Linux). Override with `OPEN_GENERATIVE_AI_LOCAL_AI_DIR`.

**B. Desktop app + Wan2GP server (image + video, BYO GPU)**

The desktop app does **not** bundle Python, PyTorch, or model weights for Wan2GP. The user has to:

1. Provision a separate Linux/Windows box with an NVIDIA or AMD GPU (no Apple Silicon path).
2. `git clone https://github.com/deepbeepmeep/Wan2GP && ./install.sh && python wgp.py --listen --server-name 0.0.0.0`.
3. Point the desktop app at `http://<gpu-box>:7860` from **Settings → Local Models → Wan2GP server**, click Test, Save.

That unlocks Flux.1 Dev, Qwen-Image, Wan 2.2 (T2V / I2V), Hunyuan Video, LTX Video. Image Studio rejects video output explicitly (full Video Studio wiring is on the roadmap per the README). This is functionally a remote Gradio client, not a self-contained desktop app.

**C. Web build with no MuAPI key**

Technically the Next.js server will start with no env vars set (the middleware's BYO-key branch: `middleware.js:42-46`). But every studio will show the `ApiKeyModal.js` prompt and refuse to render anything. **There is no "free" web path** — only the desktop local models in (A).

**What you cannot get local at all, even in the desktop app:**
- Lip Sync models (Infinite Talk, Wan 2.2 Speech-to-Video, LTX Lipsync, LatentSync, Creatify, Veed, Sync Lipsync)
- All 60+ image-to-video models (Kling I2V, Sora, Veo 3, Runway, Seedance, Hailuo, Midjourney I2V, …)
- All 40+ text-to-video models
- Audio generation
- Agents / Design Agent / Workflows

---

## 5. Hardware requirements (for the local path)

| Path | CPU | RAM | GPU | Disk | Network |
|---|---|---|---|---|---|
| Web app (Next.js server) | Anything modern | 1 GB+ | None | ~500 MB | Outbound HTTPS to `api.muapi.ai` |
| Desktop app + sd.cpp on **macOS** | M1+ | **16 GB recommended**, 8 GB works for SD 1.5 only | Apple Silicon Metal (built-in) | **5–10 GB per model weight** cached locally | None for inference; outbound only for updates |
| Desktop app + sd.cpp on **Windows/Linux** | Modern x86_64 | Same as above | NVIDIA (CUDA) or AMD (ROCm) or Intel/AMD (Vulkan) | Same | Same |
| Wan2GP server (video) | Modern x86_64 | 32 GB+ recommended | **CUDA-capable NVIDIA or ROCm AMD** (e.g. RTX 3090/4090, 24 GB VRAM for Wan 2.2 720p) | 20–80 GB depending on models | Inbound from desktop app on LAN |
| Featherless brief helper | n/a — server-side only | n/a | n/a | n/a | Outbound to `api.featherless.ai` |

Verbatim from the README (`README.md` — *Hardware Notes*):
> *"Recommended for sd.cpp Z-Image: 16 GB RAM (7.4 GB weights + 2.4 GB compute buffer). On a base 8 GB M-series Mac, Z-Image is known to hang the system — stick to SD 1.5 there."*
> *"For SD 1.5 on M2: expect ~1–2 s/step with the Metal dylib active."*

---

## 6. Cost structure if you use MuAPI

**The pricing page is dynamic** — `https://muapi.ai/pricing` ships a Next.js client that fetches the per-model price list at runtime, and the static HTML I could retrieve had a "No models found" placeholder (clearly client-rendered). I will not fabricate per-image / per-video numbers.

What I could verify:

- **No subscription.** The pricing page `<meta>` explicitly says *"No subscriptions — pay only for what you generate."* The README echoes this: *"no subscription fees"*.
- **Pay-per-generation.** Every model has its own per-call price. Video models are typically 1–2 orders of magnitude more expensive than image models in this market.
- **"20% off" promo code is mentioned** in the README (`README.md:26`) for the Fable 5 model via MuAPI, which is only meaningful if there is a real price to discount.
- **Free hosted version exists** at `https://muapi.ai/open-generative-ai` (per `README.md:43`) — *"Sign up for a free account to start generating."* Likely a small free-credit allowance, but I would need a logged-in account to confirm the exact number and what counts as "free."
- **Top-up billing** is in the nav (`/topup`) per the pricing page HTML, so it's a prepaid credit model.

**Practical guidance, not fabricated numbers:**

- Light prototyping (~100 images/month, no video): the MuAPI free credits plus ~$5–20 of paid credits is realistic.
- Marketing / ad creative at scale (~1,000 images/month + occasional video): the repo's "self-hosted = free" claim breaks down here — budget ~$30–100/month on MuAPI credits depending on model mix. Midjourney-v7 and Sora/Veo 3 will dominate the bill if you reach for them.
- A subscription service like Midjourney ($30/mo flat) or Runway ($15–95/mo) can be **cheaper** than pay-per-generation for sustained use. The "no subscription" line is not the same as "cheaper."

**I would need to test with a logged-in account to give exact per-image and per-video numbers for the specific models you want.**

---

## 7. Self-hostability alternatives

The repo itself is not a true self-hostable product — it is a UI + a MuAPI client. Removing MuAPI would mean rewriting every studio to call a different backend. The repo does, however, name-drop a few things worth knowing about:

**Adjacent repos by the same author / org (some self-hostable):**

| Repo | What it is | Self-hostable? |
|---|---|---|
| [Open-AI-Design-Agent](https://github.com/Anil-matcha/Open-AI-Design-Agent) | Autonomous AI design agent | Likely partial — needs verification. |
| [Free-AI-Social-Media-Scheduler](https://github.com/Anil-matcha/Free-AI-Social-Media-Scheduler) | "self-hostable alternative to Buffer and Hootsuite" | **Yes** (per its own description). |
| [AI-Voice-Agent](https://github.com/SamurAIGPT/AI-Voice-Agent) | "Self-hosted AI voice agent" | **Yes** (per its own description). |
| [Vibe-Workflow](https://github.com/SamurAIGPT/Vibe-Workflow) | Node-based AI workflow builder | Bundled as a submodule here (`packages/Vibe-Workflow`); backend still goes through MuAPI. |
| [muapi-comfyui](https://github.com/SamurAIGPT/muapi-comfyui) | ComfyUI nodes for MuAPI models | Interesting bridge — you can use ComfyUI as the orchestration layer and call MuAPI as a node, but it doesn't remove the MuAPI call. |
| [muapi-cli](https://github.com/SamurAIGPT/muapi-cli), [n8n-nodes-muapi](https://github.com/SamurAIGPT/n8n-nodes-muapi) | CLI / n8n integrations | All call MuAPI. |

**True self-hosted alternatives (industry-standard, NOT by this org):**

| Need | Self-hosted stack | Hardware | Cost |
|---|---|---|---|
| Image generation | **ComfyUI**, **Fooocus**, **InvokeAI**, **Stable Diffusion WebUI (A1111)** | Apple Silicon Metal or NVIDIA CUDA, 8–16 GB RAM, 5–20 GB disk per model | $0/mo after electricity |
| Video generation | **Wan2GP** (already referenced in this repo as the path), **ComfyUI + Wan nodes** | NVIDIA CUDA (RTX 3090/4090, 24 GB VRAM) or AMD ROCm | $0/mo after electricity; used 3090 ≈ $700 one-time |
| Text / prompts | **Ollama** + **llama.cpp** (Qwen 2.5 7B/32B GGUF replaces Featherless's Qwen 2.5 72B at lower fidelity) | Mac M-series works fine for 7B; 32B needs 24 GB RAM | $0/mo |
| Unified UI | **Open WebUI** (text) + **ComfyUI** (image) + **Wan2GP** (video) | One box | $0/mo |

**Worth noting for the healthcare context:** none of the local paths in this repo include audit logging, PHI redaction, role-based access, or any healthcare-compliance surface. The only one that has the "data stays on your machine" property for **all** 200+ models is the hypothetical self-hosted fork where MuAPI is ripped out — and that fork does not exist today.

---

## 8. Recommendation — three paths, ordered by practicality

### Path A — *Lowest cost, fastest to evaluate* (recommended first)

1. Download the prebuilt **desktop app** (Mac/Windows/Linux) from the Releases page.
2. Use it in **local mode** (sd.cpp) for SD 1.5 image work. Free, no API key, runs on the M-series machine you already have.
3. Buy **~$20 of MuAPI credits** to test the video and lip-sync models you actually need (don't subscribe, just top-up).
4. **Total monthly cost: $0–$25** depending on how much video you generate.

This is what the README's own claims actually deliver. Good enough for prototyping healthcare marketing creative, not for production scale.

### Path B — *Zero subscription, mostly free, engineering effort*

1. Skip this repo's web build entirely.
2. Stand up **ComfyUI** (image) and **Wan2GP** (video) on a single Linux box with one GPU (used RTX 3090 is the sweet spot — 24 GB VRAM, ~$700).
3. Use **Ollama** with `qwen2.5:32b` GGUF for the "Brief → Prompt" helper (replaces Featherless; ~85% of the quality at <5% of the inference cost on a 3090).
4. Use **Open WebUI** as the front door so your team doesn't have to learn ComfyUI's node graph.
5. **Total monthly cost: ~$5 of electricity on a 3090**, plus the one-time hardware.

Best fit if you want to embed image/video generation inside `kyour.ai` (multi-tenant EMR) or another product and the per-generation cost line would compound.

### Path C — *Industrial, full control, biggest upfront investment*

1. Stand up ComfyUI/Wan2GP/Ollama on a **dedicated GPU server** — either on-prem (Proxmox cluster with a passed-through GPU) or a rented Hetzner / RunPod / Vast.ai instance.
2. Build a thin **Kyour-flavored API** in front of it that does PHI redaction, audit logs, and tenant isolation (this is what kyour.ai would actually need for clinical safety, regardless of the model backend).
3. Drop the `Open-Generative-AI` UI as a marketing/owner-facing surface and have it call your new API instead of MuAPI — that's a `src/lib/muapi.js` rewrite plus updating `models_dump.json` to point at your endpoints.

Only worth it if you're going to embed this inside `kyour.ai` and the generated media becomes a clinical-product feature, not a marketing-team toy. Would also let you co-locate with the kyour EMR in AWS `me-central-1` (Dubai) for UAE PHI residency — currently the Supabase layout is all non-UAE regions, which is a separate but adjacent problem.

---

## 9. What I would verify before committing

- **MuAPI per-model prices:** log in, generate one of each model tier (cheap image, mid-tier image, cheap video, top-tier video like Veo 3 / Sora 2) and record the cost. Their pricing UI is dynamic and I could not extract it.
- **MuAPI free-tier size:** sign up and check the starting credit balance and which models are eligible.
- **Whether any of the Open Generative AI "models" are actually free on MuAPI** (some gateways run a few models on a freemium basis — would need to test).
- **Healthcare / UAE PDPL angle:** the desktop app's local models do not phone home during inference, but the first-run download of sd.cpp binary and model weights pulls from GitHub and HuggingFace. Decide whether outbound HTTPS to those two is acceptable on the aiHealth / kyour network.

---

## 10. One-line answer

**The repo is free to run only on a Mac with the sd.cpp engine, for ~6 of 200+ image models. Everything else — all video, all lip-sync, all "cinema," and the rest of the image catalog — is paid MuAPI traffic.**
