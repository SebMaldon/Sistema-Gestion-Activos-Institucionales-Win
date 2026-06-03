const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'Dashboard.jsx');
const content = fs.readFileSync(file, 'utf8');

const lines = content.split('\n');
lines.forEach((l, i) => {
    if (l.includes('canSave')) {
        console.log(`Line ${i + 1}: ${l.trim()}`);
    }
});
