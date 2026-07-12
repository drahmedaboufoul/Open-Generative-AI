'use client';

import { useState } from 'react';
import { XAEN_BRANDS } from '@/lib/xaen-brands';

// Floating "Brief → Prompt" helper for the Xaen tower deployment.
//
// The studios render pixels through MuAPI; this panel is where the *prompt* is authored
// by Featherless (the same content brain the marketing tower uses). Pick a brand, type a
// one-line brief, and get a vivid, on-brand render prompt to paste into any studio.
// Fully self-contained: it writes nothing into the studio DOM, so it can't break it.
export default function BriefEnhancer() {
  const [open, setOpen] = useState(false);
  const [brand, setBrand] = useState(XAEN_BRANDS[0]?.id || '');
  const [assetType, setAssetType] = useState('image');
  const [brief, setBrief] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    if (!brief.trim() || loading) return;
    setLoading(true); setError(''); setResult(null); setCopied(false);
    try {
      const res = await fetch('/api/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: brief.trim(), brand, assetType }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setResult(data);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!result?.prompt) return;
    try { await navigator.clipboard.writeText(result.prompt); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  const field = 'w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#22d3ee]/60';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[90] flex items-center gap-2 bg-[#22d3ee] hover:bg-[#22d3ee]/90 text-black font-bold text-sm px-4 py-2.5 rounded-full shadow-lg shadow-[#22d3ee]/20 transition-colors"
        title="Write an on-brand prompt with Featherless"
      >
        ✨ Brief → Prompt
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-[90] w-[360px] max-w-[calc(100vw-2.5rem)] bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex flex-col">
          <span className="text-sm font-bold text-white">Brief → Prompt</span>
          <span className="text-[11px] text-white/40">On-brand, written by Featherless</span>
        </div>
        <button onClick={() => setOpen(false)} className="text-white/50 hover:text-white text-lg leading-none" aria-label="Close">✕</button>
      </div>

      <div className="p-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <select value={brand} onChange={(e) => setBrand(e.target.value)} className={field} aria-label="Brand">
            {XAEN_BRANDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <select value={assetType} onChange={(e) => setAssetType(e.target.value)} className={field} aria-label="Asset type">
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
          </select>
        </div>

        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run(); }}
          placeholder="e.g. hero shot for the provider landing page — premium, clinical, calm"
          rows={3}
          className={`${field} resize-none`}
        />

        <button
          onClick={run}
          disabled={loading || !brief.trim()}
          className="w-full bg-[#22d3ee] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#22d3ee]/90 text-black font-bold text-sm py-2.5 rounded-lg transition-colors"
        >
          {loading ? 'Writing…' : 'Enhance with Featherless'}
        </button>

        {error && <div className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

        {result && (
          <div className="flex flex-col gap-2">
            <div className="text-[13px] text-white/90 bg-black/40 border border-white/10 rounded-lg px-3 py-2 max-h-40 overflow-auto whitespace-pre-wrap">{result.prompt}</div>
            {(result.negative_prompt || result.aspect_ratio) && (
              <div className="text-[11px] text-white/40 flex flex-wrap gap-x-3 gap-y-1">
                {result.aspect_ratio && <span>aspect: {result.aspect_ratio}</span>}
                {result.negative_prompt && <span>negative: {result.negative_prompt}</span>}
              </div>
            )}
            <button onClick={copy} className="self-start text-[12px] font-semibold text-[#22d3ee] hover:underline">
              {copied ? 'Copied ✓' : 'Copy prompt'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
