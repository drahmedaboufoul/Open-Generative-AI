// Xaen Group brand presets for the Tower studio deployment.
//
// The standalone Open Generative AI studio is deployed as an owner-facing brand-media
// surface for Xaen's marketing tower. These presets feed the Featherless-backed
// /api/enhance-prompt route so a short brief becomes an on-brand render prompt. Palettes
// and voice notes are a curated starting point — edit freely; the owner's brand kits in
// xaen-core (creative_brand_kits) remain the source of truth for the automated pipeline.

export const XAEN_BRANDS = [
  {
    id: 'klaer',
    label: 'Klaer',
    domain: 'klaer.ae',
    palette: ['#4E97D1', '#EE7EA3', '#C9356B', '#1C2E4A', '#F2F8FC', '#1C1A22'],
    voice:
      'Premium, clinical, calm. Doctor-prescribed clear aligners for orthodontists (not patients). ' +
      'No negative marketing, never frame one goal against another. Hard rules: NO tooth icons, NO smiley faces, ' +
      'no "invisible" language. Azure + soft pink accents on white/ice; never aqua-teal, no gradients.',
  },
  {
    id: 'taech',
    label: 'taech.',
    domain: 'taech.ae',
    palette: ['#17E39A', '#0C1320', '#0E1828', '#FBFCFE', '#8B9CB3'],
    voice:
      'Bilingual (EN/AR) schools-management SaaS for the GCC. Confident, specific, unhurried, modern. ' +
      'Signature "Grow" green on a dark "mission-control" Console or clean Daylight white. No emoji, no exclamation ' +
      'marks, no serif, no edu-fluff. Premium mid-market international schools.',
  },
  {
    id: 'flowercorner',
    label: 'Flower Corner',
    domain: 'flowercorner.ae',
    palette: ['#E8B4C4', '#6B8E6B', '#FAF6F2', '#3A3A3A'],
    voice:
      'Elegant UAE florist e-commerce. Warm, fresh, tactile, gift-worthy. Natural light, real flowers, linen and ' +
      'craft textures. Editorial but inviting; never clip-art or artificial-looking.',
  },
  {
    id: 'aihealth',
    label: 'aiHealth Medical Center',
    domain: 'aihealthservices.ae',
    palette: ['#1F8FB2', '#0E7C86', '#F4FAFB', '#12303A'],
    voice:
      'Sharjah medical center. Clinical, trustworthy, reassuring, spotless. Real clinical settings, diverse patients, ' +
      'calm teal/medical palette. Never sensational; compliance-minded (DHA/MOH context).',
  },
  {
    id: 'engiomed',
    label: 'Engiomed',
    domain: 'engiomed.com',
    palette: ['#0B5FA5', '#16A0A0', '#F5F8FA', '#0E2233'],
    voice: 'Medical-engineering / med-tech. Precise, technical, credible, clean. Devices and clinical rigor over lifestyle.',
  },
  {
    id: 'pantre',
    label: 'Pantre AI',
    domain: 'pantre.ai',
    palette: ['#F2994A', '#27AE60', '#FFF8F0', '#2D2A26'],
    voice: 'AI for the kitchen/pantry. Warm, fresh, appetising, approachable. Real food, natural light, uncluttered.',
  },
  {
    id: 'thedentalstore',
    label: 'The Dental Store',
    domain: 'thedentalstore.ae',
    palette: ['#0E7C86', '#2DD4BF', '#FFFFFF', '#123', '#1B2A33'],
    voice: 'Dental supplies e-commerce. Clean, clinical, product-forward, trustworthy. Crisp studio product photography.',
  },
  {
    id: 'kyour-academy',
    label: 'Kyour Academy',
    domain: 'kyour.ai',
    palette: ['#5B5BD6', '#22D3EE', '#0B0B12', '#F5F6FF'],
    voice: 'Online lectures + assignments in the Kyour ecosystem. Modern, focused, credible edtech. "Powered by kyour.ai".',
  },
  {
    id: 'qcare',
    label: 'QCare',
    domain: 'qcare.ae',
    palette: ['#2A9D8F', '#264653', '#F7FBFB', '#1B2A33'],
    voice: 'Healthcare. Caring, calm, professional, accessible.',
  },
  {
    id: 'billcraft',
    label: 'BillCraft',
    domain: 'billcraft.ae',
    palette: ['#3B6EA5', '#5AA9E6', '#0E1828', '#F4F8FC'],
    voice: 'Accounting/billing SaaS. Precise, clean, reassuring, professional. Data and clarity over flourish.',
  },
];

export function getBrand(id) {
  if (!id) return null;
  const key = String(id).toLowerCase().trim();
  return XAEN_BRANDS.find((b) => b.id === key || b.label.toLowerCase() === key) || null;
}
