const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
let html = fs.readFileSync(file, 'utf8');
html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, '<script defer src="$1"></script>');
html = html.replace(/<script type="module" src="([^"]+)"><\/script>/, '<script defer src="$1"></script>');
fs.writeFileSync(file, html);
console.log('[frontend] Rewrote bundle script tag for classic browser loading.');
