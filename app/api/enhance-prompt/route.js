import { NextResponse } from 'next/server';
import { getBrand } from '@/lib/xaen-brands';

// Featherless-backed brief → on-brand render prompt.
//
// This is the ONE place Featherless (a text LLM) belongs inside Open Generative AI:
// the studio generates pixels via MuAPI, but the *prompt* that drives them can be
// authored by the same content brain the Xaen marketing tower uses. A short marketing
// brief + a brand becomes a vivid, production-ready generation prompt. Featherless
// writes; MuAPI (the studios) renders.
//
// Env:
//   FEATHERLESS_API_KEY  (required)  — the tower's Featherless key
//   FEATHERLESS_MODEL    (optional)  — default 'Qwen/Qwen2.5-72B-Instruct' (tower default)
//   FEATHERLESS_URL      (optional)  — default the OpenAI-compatible chat endpoint

const FEATHERLESS_URL = process.env.FEATHERLESS_URL || 'https://api.featherless.ai/v1/chat/completions';
const FEATHERLESS_MODEL = process.env.FEATHERLESS_MODEL || 'Qwen/Qwen2.5-72B-Instruct';

function extractJson(text) {
  if (!text) return null;
  const stripped = String(text).replace(/```[a-z]*/gi, '');
  const a = stripped.indexOf('{');
  const b = stripped.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(stripped.slice(a, b + 1)); } catch { return null; }
}

export async function POST(request) {
  const key = process.env.FEATHERLESS_API_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, error: 'FEATHERLESS_API_KEY is not set on the server.' }, { status: 501 });
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const brief = String(body.brief || body.prompt || '').trim();
  const assetType = ['image', 'video', 'audio'].includes(body.assetType) ? body.assetType : 'image';
  if (!brief) {
    return NextResponse.json({ ok: false, error: 'brief is required' }, { status: 400 });
  }

  const brand = getBrand(body.brand);
  const brandName = brand?.label || (body.brand ? String(body.brand) : null);
  const medium = assetType === 'image' ? 'still image' : assetType === 'audio' ? 'audio/voiceover' : 'short video';
  const brandBlock = brand
    ? `\nBrand: "${brand.label}"${brand.domain ? ` (${brand.domain})` : ''}.\nBrand voice & rules: ${brand.voice}\nBrand palette (use as dominant colors where natural): ${brand.palette.join(', ')}.`
    : brandName ? `\nBrand: "${brandName}".` : '';

  const sys =
    `You are a senior art director. Turn a short marketing brief into ONE vivid, production-ready ` +
    `${medium} generation prompt for a text-to-${assetType} model. Be concrete about subject, composition, ` +
    `lighting, style and mood; advertising-grade and on-brand. No text overlays unless asked, no camera brand ` +
    `names, and do NOT put the brand name inside the prompt (it is added separately).${brandBlock}\n\n` +
    `Reply with ONE JSON object only (no fences, no commentary): ` +
    `{"prompt": string, "negative_prompt"?: string, "aspect_ratio"?: "1:1"|"16:9"|"9:16"|"4:3"|"3:4"|"21:9"}`;

  try {
    const res = await fetch(FEATHERLESS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: FEATHERLESS_MODEL,
        max_tokens: 700,
        temperature: 0.6,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: `Marketing brief: ${brief}` },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return NextResponse.json({ ok: false, error: `Featherless ${res.status}: ${t.slice(0, 300)}` }, { status: 502 });
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    const parsed = extractJson(content) || {};
    const prompt = typeof parsed.prompt === 'string' && parsed.prompt.trim() ? parsed.prompt.trim() : String(content).trim();
    if (!prompt) return NextResponse.json({ ok: false, error: 'no prompt produced' }, { status: 502 });

    return NextResponse.json({
      ok: true,
      prompt,
      negative_prompt: typeof parsed.negative_prompt === 'string' ? parsed.negative_prompt.trim() : null,
      aspect_ratio: typeof parsed.aspect_ratio === 'string' ? parsed.aspect_ratio : null,
      brand: brand?.id || brandName || null,
      model: FEATHERLESS_MODEL,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
