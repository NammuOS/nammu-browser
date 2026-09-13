import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(resolve(root, 'nammu.app.json'), 'utf8'));
const requestedVersion = process.env.NAMMU_BROWSER_VERSION?.trim();
if (requestedVersion) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(requestedVersion)) {
    throw new Error('NAMMU_BROWSER_VERSION must be a valid semantic version.');
  }
  manifest.version = requestedVersion;
}

const bundle = await Bun.build({
  entrypoints: [resolve(root, 'src/main.tsx')],
  target: 'browser',
  format: 'esm',
  minify: true,
  sourcemap: 'none',
});
if (!bundle.success) {
  throw new Error(bundle.logs.map((entry) => entry.message).join('\n'));
}
const script = bundle.outputs.find((output) => output.path.endsWith('.js'));
if (!script) throw new Error('Browser bundle did not produce JavaScript.');
const moduleCss = bundle.outputs.find((output) => output.path.endsWith('.css'));
const sourceCss = await readFile(resolve(root, 'src/styles.css'), 'utf8');
const compiled = await postcss([tailwindcss()]).process(sourceCss, {
  from: resolve(root, 'src/styles.css'),
});
const css = `${compiled.css}\n${moduleCss ? await moduleCss.text() : ''}`;

const encoder = new TextEncoder();
const files = [
  { path: 'nammu.app.json', data: encoder.encode(JSON.stringify(manifest, null, 2)) },
  { path: 'app/index.html', data: new Uint8Array(await readFile(resolve(root, 'src/index.html'))) },
  { path: 'app/main.js', data: new Uint8Array(await script.arrayBuffer()) },
  { path: 'app/styles.css', data: encoder.encode(css) },
];
const magic = encoder.encode('NAPP');
const table = files.map(({ path, data }) => ({ path, size: data.byteLength }));
const tableBytes = encoder.encode(JSON.stringify(table));
const archive = new Uint8Array(
  9 + tableBytes.byteLength + files.reduce((total, file) => total + file.data.byteLength, 0),
);
const view = new DataView(archive.buffer);
archive.set(magic, 0);
archive[4] = 1;
view.setUint32(5, tableBytes.byteLength, false);
archive.set(tableBytes, 9);
let offset = 9 + tableBytes.byteLength;
for (const file of files) {
  archive.set(file.data, offset);
  offset += file.data.byteLength;
}

const dist = resolve(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
const output = resolve(dist, `${manifest.id}-${manifest.version}-unsigned.napp`);
await writeFile(output, archive, { flag: 'wx' });
process.stdout.write(`${output}\n`);
