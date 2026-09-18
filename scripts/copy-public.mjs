// Copies the static browser assets (src/public) into the compiled output (dist/public)
// so the built server can serve them. Runs as part of `npm run build`.
import { cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(root, 'src', 'public');
const to = path.join(root, 'dist', 'public');

await cp(from, to, { recursive: true });
console.log(`Copied ${from} -> ${to}`);
