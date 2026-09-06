// Renders an icon grid screenshot (black on white) into black-on-transparent PNGs.
// Cell layout: 4 columns x 132 CSS px; device scale factor 3.
const fs = require('fs');
const path = require('path');
// Resolve pngjs from the local scratch install (npm i pngjs in scripts/_icongen) or a temp install.
let PNG;
try { ({ PNG } = require(path.join(__dirname, 'node_modules', 'pngjs'))); } catch (e) {
  try { ({ PNG } = require(path.join(process.env.TEMP, 'dsh-png', 'node_modules', 'pngjs'))); } catch (e2) {
    console.error('pngjs not found. Run: npm install pngjs in ' + __dirname);
    process.exit(1);
  }
}

const DSF = 3;
const CELL = 132 * DSF;           // cell size in image px
const BOX_OFFSET_44 = ((132 - 44) / 2) * DSF;  // box44 top-left offset within cell
const BOX_OFFSET_42 = ((132 - 42) / 2) * DSF;  // box42 top-left offset within cell
const BOX_44 = 44 * DSF;
const BOX_42 = 42 * DSF;

const ROOT = 'E:/Database_Design/miniprogram/assets/icons';

// Order matches render-icons.html grid (row-major, 4 cols).
// [name, pageDir, boxPx]
const icons = [
  ['family',          'settings', 44],
  ['invite',          'settings', 44],
  ['member',          'settings', 44],
  ['insight',         'settings', 44],
  ['taste',           'settings', 44],
  ['restriction',     'settings', 44],
  ['account',         'settings', 44],
  ['help',            'settings', 44],
  ['about',           'settings', 44],
  ['cache',           'settings', 44],
  ['document',        'about',    42],
  ['shield',          'about',    42],
  ['agreement',       'about',    42],
  ['heart',           'about',    42],
  ['chevron',         'menu',     44],
  ['search',          'recipes',  44],
  ['edit',            'recipes',  44],
  ['share',           'recipes',  44],
];

const src = process.argv[2];
const png = PNG.sync.read(fs.readFileSync(src));
if (png.width < 4 * CELL || png.height < 5 * CELL) {
  console.error(`screenshot too small: ${png.width}x${png.height}`);
  process.exit(1);
}

function cropConvertToTransparent(col, row, boxPx, boxOffset) {
  const cw = boxPx * DSF;
  const ch = boxPx * DSF;
  const out = new PNG({ width: cw, height: ch });
  const ox = col * CELL + boxOffset;
  const oy = row * CELL + boxOffset;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = ((oy + y) * png.width + (ox + x)) << 2;
      const r = png.data[si], g = png.data[si + 1], b = png.data[si + 2];
      const gray = (r + g + b) / 3;
      const alpha = Math.round(255 - gray);
      const di = (y * cw + x) << 2;
      out.data[di] = 0;
      out.data[di + 1] = 0;
      out.data[di + 2] = 0;
      out.data[di + 3] = alpha;
    }
  }
  return out;
}

for (let i = 0; i < icons.length; i++) {
  const [name, pageDir, boxPx] = icons[i];
  const col = i % 4;
  const row = Math.floor(i / 4);
  const boxOffset = boxPx === 44 ? BOX_OFFSET_44 : BOX_OFFSET_42;
  const out = cropConvertToTransparent(col, row, boxPx, boxOffset);
  const dir = path.join(ROOT, pageDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.png`), PNG.sync.write(out));
  console.log(`wrote ${pageDir}/${name}.png (${boxPx * DSF}x${boxPx * DSF})`);
}
console.log('done');
