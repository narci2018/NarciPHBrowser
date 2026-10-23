import fs from 'node:fs';

const raw = fs.readFileSync('pawdroid_sub.txt', 'utf8').trim();
const decoded = Buffer.from(raw, 'base64').toString('utf8');
const lines = decoded.split('\n').map(l => l.trim()).filter(Boolean);

console.log('Total decoded links:', lines.length);
for (let i = 0; i < Math.min(5, lines.length); i++) {
  console.log(lines[i]);
}
