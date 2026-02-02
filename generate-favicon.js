const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, 'public/images/shadow-logo.png');
const outputPath = path.join(__dirname, 'public/favicon.ico');
const outputPath2 = path.join(__dirname, 'app/favicon.ico');

sharp(inputPath)
  .resize(32, 32)
  .toFile(outputPath)
  .then(() => {
    console.log('Favicon created at public/favicon.ico');
    // Copie aussi dans app/
    fs.copyFileSync(outputPath, path.join(__dirname, 'src/app/favicon.ico'));
    console.log('Favicon copied to src/app/favicon.ico');
  })
  .catch(err => console.error(err));
