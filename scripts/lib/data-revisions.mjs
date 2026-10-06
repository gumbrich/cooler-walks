import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export function dataRevisions(root) {
  const result = {};
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(json|geojson|shade)$/.test(file))
        result['/' + path.relative(root, file).split(path.sep).join('/')] = crypto
          .createHash('sha256')
          .update(fs.readFileSync(file))
          .digest('hex')
          .slice(0, 20);
    }
  }
  visit(path.join(root, 'data'));
  return result;
}
