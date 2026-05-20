#!/usr/bin/env node
/**
 * Download Yahoo Open NSFW TFLite model into Android assets.
 * Run: node scripts/download-nsfw-model.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const URL =
  'https://github.com/xeron56/flutter_nude_checker/releases/download/1.0.0/nsfw.tflite';
const OUT = path.join(
  __dirname,
  '..',
  'android',
  'app',
  'src',
  'main',
  'assets',
  'models',
  'nsfw.tflite',
);

function download(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          const next = res.headers.location;
          if (!next) {
            reject(new Error('Redirect without location'));
            return;
          }
          res.resume();
          download(next, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      })
      .on('error', reject);
  });
}

download(URL, OUT)
  .then(() => console.log(`[ok] Saved ${OUT}`))
  .catch((err) => {
    console.error('[error]', err.message);
    process.exit(1);
  });
