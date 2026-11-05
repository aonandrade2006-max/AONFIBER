import fs from 'node:fs'
import path from 'node:path'

fs.cpSync('dist', 'public', {
  recursive: true,
  force: true,
  filter: (source) => path.basename(source) !== 'Main logo.png'
})

console.log('Frontend files copied to public.')
