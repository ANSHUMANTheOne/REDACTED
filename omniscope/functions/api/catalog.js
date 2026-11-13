// Same-origin proxy for catalog overlays (Gaia DR3, AllWISE) and name resolution (CDS Sesame).
const TAP = {
  gaia: 'https://gea.esac.esa.int/tap-server/tap/sync',
  wise: 'https://irsa.ipac.caltech.edu/TAP/sync',
};
export async function onRequestGet({ request }) {
  const p = new URL(request.url).searchParams;
  try {
    if (p.get('name')) {
      const name = p.get('name').slice(0, 80);
      const r = await fetch('https://cds.unistra.fr/cgi-bin/nph-sesame/-oI/SNV?' + encodeURIComponent(name), { signal: AbortSignal.timeout(20000) });
      const m = (await r.text()).match(/%J\s+([\d.+-]+)\s+([\d.+-]+)/);
      if (!m) return Response.json({ error: 'Name not found.' }, { status: 404 });
      return Response.json({ ra: Number(m[1]), dec: Number(m[2]) }, { headers: { 'Cache-Control': 'public, max-age=86400' } });
    }
    const ra = Number(p.get('ra')), dec = Number(p.get('dec')), r = Math.min(0.5, Number(p.get('r') || 0.25)), src = p.get('src');
    if (!TAP[src] || !Number.isFinite(ra) || !Number.isFinite(dec) || !(r > 0)) return Response.json({ error: 'Use src=gaia|wise, ra, dec, r (deg).' }, { status: 400 });
    const adql = src === 'gaia'
      ? `SELECT TOP 400 source_id,ra,dec,phot_g_mean_mag AS mag,pmra,pmdec,parallax FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',${ra},${dec},${r})) ORDER BY phot_g_mean_mag`
      : `SELECT TOP 400 designation AS source_id,ra,dec,w1mpro AS mag,pmra,pmdec FROM allwise_p3as_psd WHERE CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',${ra},${dec},${r}))=1 ORDER BY w1mpro`;
    const res = await fetch(TAP[src], { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ REQUEST: 'doQuery', LANG: 'ADQL', FORMAT: 'csv', QUERY: adql }), signal: AbortSignal.timeout(40000) });
    if (!res.ok) return Response.json({ error: `${src} catalog returned ${res.status}` }, { status: 502 });
    const [head, ...lines] = (await res.text()).trim().split('\n'), cols = head.split(',');
    const rows = lines.map(l => Object.fromEntries(l.split(',').map((v, i) => [cols[i], i === 0 ? v.replace(/"/g, '') : Number(v)])));
    return Response.json({ src, rows }, { headers: { 'Cache-Control': 'public, max-age=86400' } });
  } catch (e) {
    return Response.json({ error: 'Catalog service unreachable.' }, { status: 502 });
  }
}
