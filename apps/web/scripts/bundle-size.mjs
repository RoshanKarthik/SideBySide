// Prints how much gzipped JavaScript the room page needs before Monaco and the whiteboard load
// (the target is about 400 KB), and the same for the app shell. Reads the Vite manifest,
// so run it after `vite build --manifest` (the `size` script does both).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOM_TARGET_KB = 400;
const dist = path.resolve(process.argv[2] ?? 'dist');
const manifest = JSON.parse(fs.readFileSync(path.join(dist, '.vite/manifest.json'), 'utf8'));
const gzipKb = (file) =>
  zlib.gzipSync(fs.readFileSync(path.join(dist, file)), { level: 9 }).length / 1024;

/** A chunk plus everything it imports statically; lazy imports load later, so they don't count. */
function staticClosure(keys) {
  const seen = new Set();
  const walk = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    for (const next of manifest[key].imports ?? []) walk(next);
  };
  keys.forEach(walk);
  return [...seen];
}

function report(label, keys) {
  const chunks = staticClosure(keys)
    .map((key) => ({ file: manifest[key].file, kb: gzipKb(manifest[key].file) }))
    .sort((a, b) => b.kb - a.kb);
  const total = chunks.reduce((sum, c) => sum + c.kb, 0);
  console.log(`\n${label}: ${total.toFixed(1)} KB gzipped in ${chunks.length} files`);
  for (const c of chunks.slice(0, 8)) console.log(`  ${c.kb.toFixed(1).padStart(7)} KB  ${c.file}`);
  return total;
}

const entry = Object.keys(manifest).find((k) => manifest[k].isEntry && k.endsWith('index.html'));
const room = Object.keys(manifest).find((k) => k.endsWith('src/routes/room-route.tsx'));
report('App shell (every page)', [entry]);
const roomKb = report('Room page before Monaco and the whiteboard', [entry, room]);
console.log(`\nTarget for the room page: about ${ROOM_TARGET_KB} KB.`);
if (roomKb > ROOM_TARGET_KB * 1.05) process.exitCode = 1;
