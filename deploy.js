// deploy.js — uploads Cineo zip + deploys site
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

function request(opts, body) {
  return new Promise((resolve, reject) => {
    const mod = opts.protocol === 'http:' ? http : https
    const req = mod.request(opts, (res) => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

function uploadStream(opts, stream, size) {
  return new Promise((resolve, reject) => {
    const mod = opts.protocol === 'http:' ? http : https
    const req = mod.request({ ...opts, headers: { ...opts.headers, 'Content-Length': size } }, (res) => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    stream.pipe(req)
  })
}

// Upload via multipart/form-data
function uploadMultipart(opts, fieldName, fileName, filePath) {
  return new Promise((resolve, reject) => {
    const boundary = '----CineoBoundary' + Date.now()
    const stat = fs.statSync(filePath)
    const headerBuf = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`
    )
    const footerBuf = Buffer.from(`\r\n--${boundary}--\r\n`)
    const totalSize = headerBuf.length + stat.size + footerBuf.length

    const mod = opts.protocol === 'http:' ? http : https
    const req = mod.request({
      ...opts,
      headers: {
        ...opts.headers,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalSize
      }
    }, (res) => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.write(headerBuf)
    const stream = fs.createReadStream(filePath)
    stream.on('data', chunk => req.write(chunk))
    stream.on('end', () => { req.write(footerBuf); req.end() })
    stream.on('error', reject)
  })
}

async function uploadToGofile(zipPath) {
  console.log('⬆ Getting best gofile.io server...')
  const serverRes = await request({
    protocol: 'https:',
    hostname: 'api.gofile.io',
    path: '/servers',
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
  console.log('gofile servers response:', serverRes.status, serverRes.body.slice(0, 200))
  let server = 'store1'
  try {
    const j = JSON.parse(serverRes.body)
    if (j.data && j.data.servers && j.data.servers.length > 0) {
      server = j.data.servers[0].name
    }
  } catch(e) {}

  console.log(`⬆ Uploading to ${server}.gofile.io ...`)
  const res = await uploadMultipart({
    protocol: 'https:',
    hostname: `${server}.gofile.io`,
    path: '/contents/uploadFile',
    method: 'POST',
    headers: { 'User-Agent': 'Mozilla/5.0' }
  }, 'file', 'Cineo-Windows.zip', zipPath)

  console.log('gofile upload status:', res.status)
  console.log('gofile response:', res.body.slice(0, 300))
  try {
    const j = JSON.parse(res.body)
    if (j.status === 'ok' && j.data && j.data.downloadPage) {
      return j.data.downloadPage
    }
    if (j.status === 'ok' && j.data && j.data.directLink) {
      return j.data.directLink
    }
  } catch(e) {}
  throw new Error('gofile failed: ' + res.body.slice(0, 200))
}

async function uploadToFileIO(zipPath) {
  console.log('⬆ Uploading to file.io ...')
  const res = await uploadMultipart({
    protocol: 'https:',
    hostname: 'file.io',
    path: '/?expires=1y',
    method: 'POST',
    headers: { 'User-Agent': 'Mozilla/5.0' }
  }, 'file', 'Cineo-Windows.zip', zipPath)
  console.log('file.io status:', res.status, res.body.slice(0, 200))
  try {
    const j = JSON.parse(res.body)
    if (j.success && j.link) return j.link
  } catch(e) {}
  return null
}

async function uploadHtmlTo0x0(htmlPath) {
  console.log('⬆ Uploading HTML to 0x0.st ...')
  const html = fs.readFileSync(htmlPath)
  const boundary = '--cineo' + Date.now()
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="index.html"\r\nContent-Type: text/html\r\n\r\n`
  )
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`)
  const body = Buffer.concat([header, html, footer])

  const res = await request({
    protocol: 'https:',
    hostname: '0x0.st',
    path: '/',
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length
    }
  }, body)
  if (res.status === 200 && res.body.trim().startsWith('https')) {
    return res.body.trim()
  }
  console.log('0x0.st response:', res.status, res.body.slice(0, 100))
  return null
}

async function uploadHtmlToTmpSh(htmlPath) {
  console.log('⬆ Uploading HTML to temp.sh ...')
  const html = fs.readFileSync(htmlPath)
  const boundary = '--cineo' + Date.now()
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="index.html"\r\nContent-Type: text/html\r\n\r\n`
  )
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`)
  const body = Buffer.concat([header, html, footer])

  const res = await request({
    protocol: 'https:',
    hostname: 'temp.sh',
    path: '/',
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length
    }
  }, body)
  console.log('temp.sh:', res.status, res.body.slice(0, 150))
  if (res.status === 200 && res.body.trim().startsWith('https')) return res.body.trim()
  return null
}

;(async () => {
  const zipPath = path.join(__dirname, 'dist-pkg/Cineo-Windows.zip')
  const htmlPath = path.join(__dirname, 'docs/index.html')

  // 1. Upload the zip
  let downloadUrl = null

  try {
    downloadUrl = await uploadToGofile(zipPath)
    console.log('✓ Download link (gofile):', downloadUrl)
  } catch(e) {
    console.log('gofile error:', e.message)
  }

  if (!downloadUrl) {
    try {
      downloadUrl = await uploadToFileIO(zipPath)
      if (downloadUrl) console.log('✓ Download link (file.io):', downloadUrl)
    } catch(e) {
      console.log('file.io error:', e.message)
    }
  }

  if (!downloadUrl) {
    console.log('All zip upload services failed.')
    process.exit(1)
  }

  // 2. Update HTML with real download link
  let html = fs.readFileSync(htmlPath, 'utf8')
  const directScript = `
  // Direct download link
  const downloadUrl = '${downloadUrl}';
  const version = 'v0.1.0';
  setDownloadUrl(downloadUrl, version, null);
`
  html = html.replace(
    /fetch\(`https:\/\/api\.github\.com.*?\}\);/s,
    directScript
  )
  const tmpHtml = path.join(__dirname, 'docs/index-deploy.html')
  fs.writeFileSync(tmpHtml, html)
  console.log('✓ HTML updated with download link:', downloadUrl)

  // 3. Host the website
  let siteUrl = null

  siteUrl = await uploadHtmlTo0x0(tmpHtml)
  if (siteUrl) { console.log('\n🎉 SITE URL:', siteUrl); process.exit(0) }

  siteUrl = await uploadHtmlToTmpSh(tmpHtml)
  if (siteUrl) { console.log('\n🎉 SITE URL:', siteUrl); process.exit(0) }

  console.log('\n⚠ Website hosting failed, but download link is ready:', downloadUrl)
  console.log('To publish: go to netlify.com/drop and drag the docs/ folder')
  process.exit(0)
})()
