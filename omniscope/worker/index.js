import { onRequestGet as archive } from '../functions/api/archive.js';
import { onRequestGet as ephemeris } from '../functions/api/ephemeris.js';
import { onRequestGet as catalog } from '../functions/api/catalog.js';
import { onRequestPost as ask } from '../functions/api/ask.js';


export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
