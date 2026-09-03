import express from 'express';
import QRCode from 'qrcode';

const app = express();
const PORT = process.env.PORT || 3000;
const albumCache = new Map();
let tokenCache = null;

function extractAlbumId(input = '') {
  const value = String(input).trim();
  if (/^spotify:album:[A-Za-z0-9]{22}$/.test(value)) return value.slice(14);
  if (/^[A-Za-z0-9]{22}$/.test(value)) return value;
  const match = value.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?album\/([A-Za-z0-9]{22})/);
  return match ? match[1] : null;
}

async function getToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60000) return tokenCache.value;
  const credentials = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded'},
    body: 'grant_type=client_credentials'
  });
  if (!response.ok) throw new Error(`Token HTTP ${response.status}`);
  const data = await response.json();
  tokenCache = {value: data.access_token, expiresAt: Date.now() + (data.expires_in * 1000)};
  return tokenCache.value;
}

async function fetchAlbum(albumId) {
  if (albumCache.has(albumId)) return albumCache.get(albumId);
  let album;
  if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
    const token = await getToken();
    const response = await fetch(`https://api.spotify.com/v1/albums/${albumId}`, {headers: {Authorization: `Bearer ${token}`} });
    if (!response.ok) throw new Error(`Album HTTP ${response.status}`);
    const data = await response.json();
    album = {name: data.name, artists: (data.artists || []).map(a => a.name).join(', '), year: (data.release_date || '').slice(0, 4), cover: data.images?.[0]?.url || ''};
  } else {
    const response = await fetch(`https://open.spotify.com/oembed?url=spotify:album:${albumId}`);
    if (!response.ok) throw new Error(`oEmbed HTTP ${response.status}`);
    const data = await response.json();
    album = {name: data.title || '', artists: '', year: '', cover: data.thumbnail_url || ''};
  }
  albumCache.set(albumId, album);
  return album;
}

app.use(express.static('public'));
app.get('/api/album', async (req, res) => {
  const id = extractAlbumId(req.query.url);
  if (!id) return res.status(400).json({error: 'URL ou identifiant d’album invalide'});
  try {
    const album = await fetchAlbum(id);
    const qr = await QRCode.toDataURL(`spotify:album:${id}`, {errorCorrectionLevel: 'M', margin: 1, width: 600, color: {dark: '#000000', light: '#FFFFFF'}});
    res.json({id, uri: `spotify:album:${id}`, qr, ...album});
  } catch (error) { res.status(502).json({error: 'Impossible de récupérer cet album'}); }
});

app.get('/api/cover', async (req, res) => {
  const url = String(req.query.url || '');
  if (!/^https:\/\/i\.scdn\.co\//.test(url)) return res.status(400).send('URL de pochette non autorisée');
  try {
    const response = await fetch(url);
    if (!response.ok) return res.status(response.status).end();
    const buffer = Buffer.from(await response.arrayBuffer());
    res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch { res.status(502).end(); }
});
app.get('/healthz', (_req, res) => res.json({ok: true}));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`spotify-card écoute sur http://0.0.0.0:${PORT}`);
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) console.warn('Avertissement : identifiants Spotify absents, mode oEmbed activé.');
});
