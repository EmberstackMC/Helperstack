'use strict';
/**
 * Creates a new feature module from modules/_template.
 *   npm run new-module -- reports
 * Then restart the bot. The module appears in the sidebar automatically.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const name = process.argv[2];

if (!name || !/^[a-z][a-z0-9_]{1,23}$/.test(name)) {
  console.error('\nGive the module a short lowercase name (letters, numbers, underscores; 2-24 characters):');
  console.error('  npm run new-module -- reports\n');
  process.exit(1);
}

const source = path.join(root, 'modules', '_template');
const dest = path.join(root, 'modules', name);
if (fs.existsSync(dest)) {
  console.error(`\nmodules/${name} already exists. Pick another name.\n`);
  process.exit(1);
}

const label = name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const fill = (text) => text.replaceAll('__NAME__', name).replaceAll('__LABEL__', label);

function copy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const target = path.join(to, fill(entry.name));
    if (entry.isDirectory()) copy(path.join(from, entry.name), target);
    else fs.writeFileSync(target, fill(fs.readFileSync(path.join(from, entry.name), 'utf8')));
  }
}

copy(source, dest);
console.log(`\nCreated modules/${name}. Restart the bot to load it:`);
console.log('  npm start   (or: pm2 restart emberstack)\n');
console.log(`You will get a /${name}_hello command and a "${label}" page in the dashboard sidebar.\n`);
