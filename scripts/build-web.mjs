// Kopiuje pliki aplikacji do www/ (katalog, który Capacitor pakuje do APK).
import fs from 'node:fs';

const FILES = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons'];
fs.rmSync('www', { recursive: true, force: true });
fs.mkdirSync('www');
for (const f of FILES) fs.cpSync(f, `www/${f}`, { recursive: true });
console.log('www/ gotowe');
