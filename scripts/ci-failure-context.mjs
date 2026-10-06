import fs from 'node:fs';
import path from 'node:path';
// Keep failed page state readable even when GitHub cannot accept trace uploads.
function printContexts(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) printContexts(file);
    else if (entry.name === 'error-context.md') {
      console.log(`::group::${file}`);
      console.log(fs.readFileSync(file, 'utf8').slice(0, 16000));
      console.log('::endgroup::');
    }
  }
}
printContexts('test-results');
