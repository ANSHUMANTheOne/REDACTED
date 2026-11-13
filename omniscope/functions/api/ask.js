// Free chat assistant via Cloudflare Workers AI (binding "AI" in wrangler.jsonc). No API key needed.
const SYSTEM = `You are the OmniScope assistant inside a SPHEREx infrared sky viewer. Help users understand what they see: moving objects (brown dwarfs, asteroids, high proper-motion stars), variable stars, the six detectors (D1-D6, 0.75-5 micron, 102 spectral channels), stacking, subtraction, flags, and Gaia/AllWISE overlays.
Rules: use only the CONTEXT given for facts about the current field; never invent detections, magnitudes or coordinates. If unsure, say so and suggest a check (e.g. subtract epochs of the same detector, compare against Gaia). Differences between detectors or wavelengths can look like changes but are not real motion. Keep answers short (under 150 words), plain language.`;
export async function onRequestPost({ request, env }) {
  if (!env?.AI) return Response.json({ error: 'AI is not enabled. Add the "ai" binding in wrangler.jsonc and redeploy.' }, { status: 503 });
  let body; try { body = await request.json(); } catch { return Response.json({ error: 'Bad request.' }, { status: 400 }); }
  const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-6)
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 800) }));
  if (!msgs.length || msgs.at(-1).role !== 'user') return Response.json({ error: 'Ask a question first.' }, { status: 400 });
  const context = String(body.context || '').slice(0, 2500);
  try {
    const r = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { max_tokens: 350, messages: [{ role: 'system', content: SYSTEM + '\n\nCONTEXT:\n' + context }, ...msgs] });
    return Response.json({ reply: String(r.response || '').trim() || 'No answer returned.' });
  } catch (e) {
    return Response.json({ error: 'The free AI allowance may be used up for today. Try again later.' }, { status: 429 });
  }
}
