import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const PORT = process.env.PORT || 3000;
const SOURCE = 'https://colegioarubano.aw/roosters/';
const MAX_AGE = 15 * 60 * 1000;
const cache = new Map();
const classes = [
  ...'abcdefghij'.split('').map(letter => `CB1${letter}`),
  ...'abcdefgh'.split('').map(letter => `CB2${letter}`),
  ...'abcdef'.split('').map(letter => `H3${letter}`),
  ...'ABCDEFGHIJ'.split('').map(letter => `H4${letter}`),
  ...'ABCDEFGHIJK'.split('').map(letter => `H5${letter}`), 'res',
  ...'ab'.split('').map(letter => `V3${letter}`),
  ...'ABC'.split('').map(letter => `V4${letter}`),
  ...'ABC'.split('').map(letter => `V5${letter}`),
  ...'ABC'.split('').map(letter => `V6${letter}`)
];

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

async function scheduleFor(klas) {
  if (!classes.includes(klas)) throw new Error('Onbekende klas');
  const saved = cache.get(klas);
  if (saved && Date.now() - saved.savedAt < MAX_AGE) return { ...saved, cached: true };

  // The original form submits the selected class back to the same public page.
  const form = new URLSearchParams({ klas, verkort: '0', zoek: 'Zoek' });
  const response = await fetch(SOURCE, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'ColegioRooster/1.0 (schedule viewer)' },
    body: form,
    signal: AbortSignal.timeout(15000)
  });
  const html = await response.text();
  if (!response.ok || !html.includes('rooster_table')) throw new Error('De bronwebsite gaf geen rooster terug');
  const entry = { klas, html, savedAt: Date.now(), sourceUpdatedAt: new Date().toISOString() };
  cache.set(klas, entry);
  return { ...entry, cached: false };
}

async function everySchedule() {
  const schedules = [];
  // Keep requests gentle to the school's public timetable site: four at a time.
  for (let start = 0; start < classes.length; start += 4) {
    const batch = await Promise.all(classes.slice(start, start + 4).map(scheduleFor));
    schedules.push(...batch);
  }
  return schedules;
}

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/classes') return send(res, 200, JSON.stringify({ classes }));
    if (url.pathname === '/api/schedule') {
      const data = await scheduleFor(url.searchParams.get('class'));
      return send(res, 200, JSON.stringify(data));
    }
    if (url.pathname === '/api/all-schedules') {
      const schedules = await everySchedule();
      return send(res, 200, JSON.stringify({ schedules, sourceUpdatedAt: new Date().toISOString() }));
    }
    if (url.pathname === '/api/refresh' && req.method === 'POST') {
      cache.clear();
      return send(res, 200, JSON.stringify({ ok: true }));
    }
    const name = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!['/index.html', '/app.js', '/styles.css'].includes(name)) return send(res, 404, 'Niet gevonden', 'text/plain; charset=utf-8');
    const text = await readFile(new URL(`.${name}`, import.meta.url));
    return send(res, 200, text, mime[extname(name)]);
  } catch (error) {
    console.error(error);
    return send(res, 502, JSON.stringify({ error: error.message || 'Rooster kon niet worden opgehaald' }));
  }
});
server.listen(PORT, () => console.log(`Rooster viewer draait op http://localhost:${PORT}`));
