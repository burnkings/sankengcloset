#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const root = path.resolve(process.argv[2] || 'unpackage/dist/dev/mp-weixin')
const requiredFiles = [
  'app.js',
  'app.json',
  'common/vendor.js',
  'pages/home/index.js',
  'pages/discover/index.js',
  'pages/ai/index.js',
  'pages/favorites/index.js',
  'pages/profile/index.js',
  'components/v2/V2PageHeader.js',
  'components/v2/V2SectionHeader.js',
  'components/v2/V2HorizontalTabs.js',
  'components/v2/V2ListGroup.js',
  'components/v2/V2ListRow.js',
  'components/v2/V2ProductCard.js',
]

const failures = []

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath)) failures.push(`missing compiled file: ${relativePath}`)
}

function walk(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(absolutePath))
    if (entry.isFile() && entry.name.endsWith('.js')) files.push(absolutePath)
  }
  return files
}

if (fs.existsSync(root)) {
  const requirePattern = /require\(["']([^"']+)["']\)/g
  for (const file of walk(root)) {
    const source = fs.readFileSync(file, 'utf8')
    let match
    while ((match = requirePattern.exec(source)) !== null) {
      if (!match[1].startsWith('.')) continue
      const target = path.resolve(path.dirname(file), match[1])
      const candidates = [target, `${target}.js`, path.join(target, 'index.js')]
      if (!candidates.some((candidate) => fs.existsSync(candidate))) {
        failures.push(`broken require: ${path.relative(root, file)} -> ${match[1]}`)
      }
    }
  }
}

const vendorPath = path.join(root, 'common/vendor.js')
const homeStorePath = path.join(root, 'stores/home-feed-store.js')
if (fs.existsSync(vendorPath) && !fs.readFileSync(vendorPath, 'utf8').includes('exports.defineStore = defineStore')) {
  failures.push('vendor defineStore export is missing')
}
if (fs.existsSync(homeStorePath) && !fs.readFileSync(homeStorePath, 'utf8').includes('patch-vendor: defineStore bound')) {
  failures.push('home store defineStore binding is missing')
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`[FAIL] ${failure}`)
  process.exit(1)
}

console.log(`[OK] compiled files and require paths verified: ${root}`)
