import { onRequestGet as archive } from '../functions/api/archive.js';
import { onRequestGet as ephemeris } from '../functions/api/ephemeris.js';
import { onRequestGet as catalog } from '../functions/api/catalog.js';
import { onRequestPost as ask } from '../functions/api/ask.js';


const ORIGINS = ['https://anshumantheone.github.io', 'https://beaconofunity.com'];
const withCors = (req, res) => {
  const o = req.headers.get('Origin');
  if (!ORIGINS.includes(o)) return res;
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', o); h.set('Vary', 'Origin');
  h.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); h.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(res.body, { status: res.status, headers: h });
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/omniscope/api/')) {
      if (request.method === 'OPTIONS') return withCors(request, new Response(null, { status: 204 }));
      return withCors(request, await this.route(request, env, url));
    }
    return this.route(request, env, url);
  },
  async route(request, env, url) {
    const path = url.pathname;
    if (path === '/omniscope') {
      url.pathname = '/omniscope/';
      return Response.redirect(url, 308);
    }
    if (path === '/omniscope/index.html') {
      url.pathname = '/omniscope/';
      return Response.redirect(url.toString(), 308);
    }
    if (path === '/omniscope/api/ask') return request.method === 'POST' ? ask({ request, env }) : new Response('Method not allowed', { status: 405 });
    if (path === '/omniscope/api/archive' || path === '/omniscope/api/ephemeris' || path === '/omniscope/api/catalog') {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
      return path.endsWith('/archive') ? archive({ request }) : path.endsWith('/catalog') ? catalog({ request }) : ephemeris({ request });
    }
    if (!path.startsWith('/omniscope/')) return new Response('Not found', { status: 404 });
    url.pathname = path.slice('/omniscope'.length) || '/';
    return env.ASSETS.fetch(new Request(url, request));
  },
};
