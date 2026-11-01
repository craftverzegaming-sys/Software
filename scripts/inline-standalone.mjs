import { copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const htmlPath = path.join(distDir, 'index.html');
const standalonePath = path.join(rootDir, 'CRAFTVERZE-PAY-standalone.html');
let html = await readFile(htmlPath, 'utf8');

const scriptTags = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
const stylesheetTags = [...html.matchAll(/<link\b(?=[^>]*\brel="stylesheet")(?=[^>]*\bhref="([^"]+)")[^>]*>/g)]
  .filter((match) => match[1].startsWith('/assets/'));

if (scriptTags.length !== 1 || stylesheetTags.length !== 1) {
  throw new Error('Expected exactly one app script and stylesheet in the built HTML.');
}

for (const [, assetPath] of [...scriptTags, ...stylesheetTags]) {
  if (!assetPath.startsWith('/')) {
    throw new Error(`Unexpected non-root build asset path: ${assetPath}`);
  }
}

const scriptPath = path.join(distDir, scriptTags[0][1].slice(1));
const stylesheetPath = path.join(distDir, stylesheetTags[0][1].slice(1));
const [script, stylesheet] = await Promise.all([
  readFile(scriptPath, 'utf8'),
  readFile(stylesheetPath, 'utf8'),
]);
const scriptPlaceholder = '<!-- standalone app script -->';
const inlineScript = `<script>${script.replace(/<\/script/gi, '<\\/script')}</script>`;

html = html
  .replace('</body>', `${scriptPlaceholder}</body>`)
  .replace(scriptTags[0][0], '')
  .replace(stylesheetTags[0][0], () => `<style>${stylesheet}</style>`)
  .replace(/^\s*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com" \/>.*\n/gm, '')
  .replace(/^\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin \/>.*\n/gm, '')
  .replace(/^\s*<link href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]+" rel="stylesheet" \/>.*\n/gm, '')
  .replace('<div id="root"></div>', '<div id="standalone-notice">Standalone preview: payment actions and merchant settings need the online server.</div><div id="root"></div>')
  .replace('</head>', '<style>#standalone-notice{padding:9px 16px;text-align:center;background:#173c2b;color:#edf4ef;font:12px/1.5 system-ui,sans-serif}</style></head>')
  .replace(scriptPlaceholder, () => inlineScript);

if (html.includes(scriptPlaceholder)) {
  throw new Error('Failed to place the standalone app script in the document body.');
}

await writeFile(htmlPath, html);
await copyFile(htmlPath, standalonePath);
