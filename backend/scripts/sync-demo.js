const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '../../demo_dashboard.html');
const dest = path.resolve(__dirname, '../public/demo.html');

fs.copyFileSync(src, dest);
console.log(`Synced demo dashboard: ${src} -> ${dest}`);
