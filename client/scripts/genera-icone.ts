/**
 * Genera le icone PNG per la PWA a partire dal solo SVG, senza dipendenze.
 * Le icone sono disegnate in modo procedurale: un tetto, una finestra e una porta.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');

type RGB = [number, number, number];

const PRIMARIO: RGB = [27, 73, 101];
const ACCENTO: RGB = [202, 103, 2];
const BIANCO: RGB = [255, 255, 255];

function crc32(buffer: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buffer.length; i++) {
    c ^= buffer[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(tipo: string, dati: Buffer): Buffer {
  const lunghezza = Buffer.alloc(4);
  lunghezza.writeUInt32BE(dati.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dati]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([lunghezza, corpo, crc]);
}

/** Codifica RGBA come PNG senza librerie esterne. */
function scriviPng(percorso: string, larghezza: number, altezza: number, pixel: (x: number, y: number) => RGB | null): void {
  const righe = Buffer.alloc((larghezza * 4 + 1) * altezza);
  let offset = 0;
  for (let y = 0; y < altezza; y++) {
    righe[offset++] = 0; // filtro "None"
    for (let x = 0; x < larghezza; x++) {
      const colore = pixel(x, y);
      if (colore) {
        righe[offset++] = colore[0];
        righe[offset++] = colore[1];
        righe[offset++] = colore[2];
        righe[offset++] = 255;
      } else {
        offset += 4;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(larghezza, 0);
  ihdr.writeUInt32BE(altezza, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(righe, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  writeFileSync(percorso, png);
}

/** Icona stilizzata: tetto a due spiovente, finestre e porta. */
function disegna(lato: number, mascherabile: boolean) {
  const s = lato / 64;
  const bordo = Math.max(1, Math.round(2 * s));
  const raggio = mascherabile ? 0 : Math.round(12 * s);

  // Il tetto: triangolo con base piu larga del corpo.
  const tettoY = 15;
  const tettoBase = 30;
  const corpoX0 = 17;
  const corpoX1 = 47;
  const corpoY0 = 30;
  const corpoY1 = 52;

  return (x: number, y: number): RGB | null => {
    const px = x / s;
    const py = y / s;

    // Rounded rect di sfondo.
    if (raggio > 0) {
      const dx = Math.max(0, Math.max(corpoX0 - 0, px - 0) - 0);
      void dx;
    }
    const dentroRettangolo =
      px >= 0 && px < 64 && py >= 0 && py < 64;
    if (!dentroRettangolo) return null;

    if (raggio > 0) {
      const cx = Math.min(Math.max(px, raggio / s), 64 - raggio / s);
      const cy = Math.min(Math.max(py, raggio / s), 64 - raggio / s);
      const dist = Math.hypot(px - cx, py - cy);
      if (dist > raggio / s) return null;
    }

    // Corpo dell'edificio.
    if (px >= corpoX0 && px <= corpoX1 && py >= corpoY0 && py <= corpoY1) {
      // Finestre bianche.
      const finestraY0 = 33;
      const finestraY1 = 39;
      const finX = [20.5, 36.5];
      for (const fx of finX) {
        if (px >= fx && px <= fx + 7 && py >= finestraY0 && py <= finestraY1) return BIANCO;
      }
      // Porta accento.
      if (px >= 28 && px <= 36 && py >= 41 && py <= 52) return ACCENTO;
      return PRIMARIO;
    }

    // Tetto.
    if (py >= tettoY && py <= tettoBase) {
      const t = (py - tettoY) / (tettoBase - tettoY);
      const larghezza = 8 + t * 25;
      if (Math.abs(px - 32) <= larghezza) return BIANCO;
    }

    return PRIMARIO;
  };
}

const formati: [nome: string, lato: number, mascherabile: boolean][] = [
  ['pwa-192x192.png', 192, false],
  ['pwa-512x512.png', 512, false],
  ['pwa-maskable-512x512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
];

mkdirSync(publicDir, { recursive: true });

for (const [nome, lato, mascherabile] of formati) {
  const pixel = disegna(lato, mascherabile);
  // bordo arrotondato: i pixel fuori dal raggio restano trasparenti
  scriviPng(path.join(publicDir, nome), lato, lato, (x, y) => {
    const r = mascherabile ? 0 : (12 / 64) * lato;
    const cx = Math.min(Math.max(x + 0.5, r), lato - r);
    const cy = Math.min(Math.max(y + 0.5, r), lato - r);
    if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) return null;
    return pixel(x, y);
  });
  console.log(`generata ${nome} (${lato}x${lato})`);
}
