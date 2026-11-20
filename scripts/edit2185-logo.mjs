import ZAI from '/home/z/.bun/install/global/node_modules/z-ai-web-dev-sdk/dist/index.js';
import fs from 'fs';

const SRC = '/tmp/src-shot.jpg';
const OUT = '/home/z/my-project/download/screenshot-logo-text-removed-v3.png';
const PROMPT = `Remove the Persian word نور inside the small rounded-square logo box in the middle of the page, leaving that box completely empty with clean white background. CRITICAL: the very first top row of the output MUST be the phone status bar (dark icons: signal bars, LTE, battery, settings gear, the time ۲۳:۱۹ on the right) exactly as in the source, followed by the Chrome URL bar row. Do not crop or drop any row of the screenshot. Keep all other Persian and English text, header, cards, buttons, icons, colors and borders pixel-identical. Only erase the word نور from inside that rounded box.`;

const b64 = fs.readFileSync(SRC).toString('base64');
const zai = await ZAI.create();
const res = await zai.images.generations.edit({
  prompt: PROMPT,
  images: [{ url: `data:image/jpeg;base64,${b64}` }],
  size: '720x1440',
});
const buf = Buffer.from(res.data[0].base64, 'base64');
fs.writeFileSync(OUT, buf);
console.log('saved', OUT, buf.length, 'bytes');
