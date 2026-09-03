# spotify-card

Generate a printable card for QRotify featuring a Spotify album cover and its QR code.

## Docker

```sh
cp .env.example .env
# Renseignez les identifiants Spotify si vous en avez
 docker compose up --build
```

Then open <http://localhost:3000>. Without Spotify credentials, the project uses oEmbed (metadata and cover art at approximately 300px).

## Développement

```sh
npm install
npm run dev
```
