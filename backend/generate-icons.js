const fs = require('fs');
const path = require('path');

const icons = [
  { size: 72, name: 'icon-72x72.png' },
  { size: 96, name: 'icon-96x96.png' },
  { size: 128, name: 'icon-128x128.png' },
  { size: 144, name: 'icon-144x144.png' },
  { size: 152, name: 'icon-152x152.png' },
  { size: 192, name: 'icon-192x192.png' },
  { size: 384, name: 'icon-384x384.png' },
  { size: 512, name: 'icon-512x512.png' }
];

const generateSolidIcon = (size) => {
  const canvasSize = size;
  const padding = size * 0.1;
  const radius = size * 0.15;
  
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg${size}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#16213e"/>
    </linearGradient>
    <linearGradient id="gas${size}" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" style="stop-color:#e94560"/>
      <stop offset="100%" style="stop-color:#ffd93d"/>
    </linearGradient>
    <filter id="glow${size}">
      <feGaussianBlur stdDeviation="${size/100}" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#bg${size})"/>
  <ellipse cx="${size/2}" cy="${size*0.6}" rx="${size*0.38}" ry="${size*0.1}" fill="#2d2d2d"/>
  <rect x="${size*0.47}" y="${size*0.22}" width="${size*0.06}" height="${size*0.38}" fill="#8b7355" rx="${size*0.01}"/>
  <g filter="url(#glow${size})">
    <circle cx="${size/2}" cy="${size*0.6}" r="${size*0.08}" fill="url(#gas${size})"/>
    <circle cx="${size*0.4}" cy="${size*0.55}" r="${size*0.04}" fill="url(#gas${size})" opacity="0.7"/>
    <circle cx="${size*0.6}" cy="${size*0.58}" r="${size*0.035}" fill="url(#gas${size})" opacity="0.8"/>
  </g>
  <circle cx="${size/2}" cy="${size*0.2}" r="${size*0.08}" fill="#333" stroke="#555" stroke-width="2"/>
</svg>`;

  return Buffer.from(svgContent);
};

const iconsDir = path.join(__dirname, '..', 'frontend', 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

icons.forEach(icon => {
  const svgBuffer = generateSolidIcon(icon.size);
  const svgPath = path.join(iconsDir, icon.name.replace('.png', '.svg'));
  fs.writeFileSync(svgPath, svgBuffer);
  console.log(`生成: ${path.basename(svgPath)} (${icon.size}x${icon.size})`);
});

console.log('\n图标已生成到:', iconsDir);
console.log('提示: 可以使用在线工具将SVG转换为PNG，或直接更新manifest.json使用SVG');
