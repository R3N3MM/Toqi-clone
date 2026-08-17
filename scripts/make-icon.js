/* Generates the Toqi app icon: two separated right-side-up crescent moons
   with sharp pointed tips, solid white on a white -> dark purple gradient.
   Outputs assets/icon.png (512) and assets/icon.ico. */
const { createCanvas } = require('@napi-rs/canvas')
const fs = require('fs')
const path = require('path')
const pngToIco = require('png-to-ico').default

const SIZE = 512
const BG_TOP = '#ffffff'
const BG_BOTTOM = '#5b21b6'
const MOON = '#ffffff'

function draw(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')
  const s = size / SIZE

  // Rounded-square background
  const radius = 96 * s
  ctx.beginPath()
  ctx.moveTo(radius, 0)
  ctx.arcTo(size, 0, size, size, radius)
  ctx.arcTo(size, size, 0, size, radius)
  ctx.arcTo(0, size, 0, 0, radius)
  ctx.arcTo(0, 0, size, 0, radius)
  ctx.closePath()

  const bg = ctx.createLinearGradient(0, 0, 0, size)
  bg.addColorStop(0, BG_TOP)
  bg.addColorStop(1, BG_BOTTOM)
  ctx.fillStyle = bg
  ctx.fill()

  // Two solid-white crescent moons with sharp pointed horns.
  // Each crescent is a closed path of two arcs that meet at two tip points:
  //  - outer curve: circle A, radius R, over the top (from left tip to right tip)
  //  - inner curve: circle B, radius Rp, centered below, passing exactly through
  //    A's tips so the crescent pinches to two pointy points at (cx +- R, eyeY).
  const R = 110 * s
  const h = 70 * s
  const Rp = Math.hypot(R, h)
  const a = Math.atan2(h, R)
  const eyeY = size * 0.57
  const eyeX1 = size * 0.24
  const eyeX2 = size * 0.76

  ctx.fillStyle = MOON
  for (const cx of [eyeX1, eyeX2]) {
    ctx.beginPath()
    ctx.arc(cx, eyeY, R, Math.PI, 2 * Math.PI)
    ctx.arc(cx, eyeY + h, Rp, 2 * Math.PI - a, Math.PI + a, true)
    ctx.closePath()
    ctx.fill()
  }

  return canvas.toBuffer('image/png')
}

async function main() {
  const outDir = path.join(__dirname, '..', 'assets')
  fs.mkdirSync(outDir, { recursive: true })

  const png512 = draw(512)
  fs.writeFileSync(path.join(outDir, 'icon.png'), png512)
  console.log('icon.png written')

  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const buffers = sizes.map((s) => draw(s))
  const ico = await pngToIco(buffers)
  fs.writeFileSync(path.join(outDir, 'icon.ico'), ico)
  console.log('icon.ico written')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})