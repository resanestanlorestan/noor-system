import ZAI from '/home/z/.bun/install/global/node_modules/z-ai-web-dev-sdk/dist/index.js';
import fs from 'fs';

const SRC = '/tmp/src-shot.jpg';
const OUT = '/home/z/my-project/download/screenshot-no-label.png';
const PROMPT = `This is a mobile screenshot of a Persian web app page. Remove ONLY the small text line reading «بدون یک خط کدنویس» together with its small golden bullet dot — that short line sits between the breadcrumb row "صفحه اصلی / لوگوی سایت" and the large green heading "لوگوی سایت". After removal, the breadcrumb row should be directly followed by the large heading. Keep absolutely everything else pixel-identical to the source: the phone status bar row, the Chrome URL bar, the site header with menu button, the search row, the breadcrumb, the heading itself, the description paragraph, both cards, all buttons, icons, colors, borders and fonts. Do not crop anything and do not change any other text.`;

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
