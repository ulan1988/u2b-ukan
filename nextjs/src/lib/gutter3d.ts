// 3D-схема водостока: две системы — «Модерн бюджет» (желоб 120×86, труба 76×102) и «Дёке»
// (полукруглый желоб, круглая труба; три класса отличаются размером, для меню модель одна).
// Детали строятся кодом по размерам,
// лежат разобранной схемой, каждую можно тащить пальцем — рядом со своим местом у желоба она
// прищёлкивается. Подписи (наши алиасы) стоят рядом с деталью со стрелкой.
// Чистый движок: о товарах и ценах ничего не знает — их даёт компонент GutterScheme.
// three.js грузится ТОЛЬКО здесь (динамический import) — в общий бандл каталога не попадает.

export type GutterKind = string
export type GutterSystemId = 'budget' | 'docke'
export interface GutterLabel { text: string; qty?: number; off?: boolean }
export interface GutterPalette { out: string; inn: string; line: string }
export interface GutterScene {
  setPalette(p: GutterPalette): void
  setLabels(m: Partial<Record<GutterKind, GutterLabel>>): void
  select(k: GutterKind | null): void
  arrange(assembled: boolean): void
  resetView(): void
  dispose(): void
}
// hide — детали, которых в меню нет: модель в движке остаётся, на схему просто не ставится
interface Opts { system?: GutterSystemId; onPick: (k: GutterKind | null) => void; onSnap?: (k: GutterKind) => void; hide?: GutterKind[] }

const ACCENT = '#e0744d', OK = '#2e8a5e'

export async function createGutterScene(host: HTMLElement, opts: Opts): Promise<GutterScene> {
  const T: any = await import('three')
  const V3 = T.Vector3, PI = Math.PI
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  const el: HTMLCanvasElement = renderer.domElement
  el.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab'
  host.appendChild(el)

  const scene = new T.Scene()
  scene.add(new T.HemisphereLight(0xffffff, 0x9aa0a6, 2.6))
  const sun = new T.DirectionalLight(0xffffff, 1.9); sun.position.set(300, 500, 420); scene.add(sun)
  const fill = new T.DirectionalLight(0xffffff, 0.7); fill.position.set(-300, 120, -260); scene.add(fill)
  const cam = new T.PerspectiveCamera(26, 1, 10, 40000)

  // ── геометрия (мм) ──────────────────────────────────────────────────────────
  // Сечение желоба 120×86: u — от лицевой кромки к стене, y — вверх.
  const ogee: number[][] = []
  for (let i = 1; i <= 14; i++) { const t = i / 14; ogee.push([37 * (0.5 - 0.5 * Math.cos(PI * t)), 81 - 71 * t]) }
  const PROF = [[14, 75], [14, 86], [0, 86], [0, 81]].concat(ogee, [[37, 0], [120, 0], [120, 100]])

  function geoOf(pos: number[], idx: number[]) {
    const g = new T.BufferGeometry()
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g
  }
  function skin(rings: number[][][], closed: boolean) {
    const n = rings[0].length, pos: number[] = [], idx: number[] = [], m = closed ? n : n - 1
    rings.forEach(r => r.forEach(q => pos.push(q[0], q[1], q[2])))
    for (let a = 0; a < rings.length - 1; a++) for (let k = 0; k < m; k++) {
      const p0 = a * n + k, p1 = a * n + (k + 1) % n, q0 = (a + 1) * n + k, q1 = (a + 1) * n + (k + 1) % n
      idx.push(p0, q0, p1, p1, q0, q1)
    }
    return geoOf(pos, idx)
  }
  // развернуть грани так, чтобы треугольник № tri смотрел ОТ точки ref (лицо = наружная сторона)
  function faceOut(g: any, tri: number, ref: any) {
    const p = g.attributes.position, ix = g.index.array
    const A = new V3().fromBufferAttribute(p, ix[tri * 3]), B = new V3().fromBufferAttribute(p, ix[tri * 3 + 1]), C = new V3().fromBufferAttribute(p, ix[tri * 3 + 2])
    const nrm = new V3().subVectors(B, A).cross(new V3().subVectors(C, A))
    const ctr = new V3().add(A).add(B).add(C).multiplyScalar(1 / 3).sub(ref)
    if (nrm.dot(ctr) < 0) { for (let k = 0; k < ix.length; k += 3) { const s = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = s } g.index.needsUpdate = true; g.computeVertexNormals() }
    return g
  }
  const unit = (v: number[]) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l] }

  // желоб вдоль ломаной в плане [[x,z],…]; side=+1 — лицевая стенка слева по ходу
  function gutterSweep(path: number[][], side: number, prof: number[][] = PROF) {
    let ref: number[] | null = null
    const rings = path.map((P, a) => {
      const prev = path[a - 1], next = path[a + 1]
      const n1 = prev ? unit([-(P[1] - prev[1]), P[0] - prev[0]]) : null
      const n2 = next ? unit([-(next[1] - P[1]), next[0] - P[0]]) : null
      const b = (n1 && n2 ? unit([n1[0] + n2[0], n1[1] + n2[1]]) : (n1 || n2)) as number[]
      const k = n1 && n2 ? 1 / (b[0] * n1[0] + b[1] * n1[1]) : 1
      const at = (u: number, y: number) => { const off = side * (60 - u) * k; return [P[0] + b[0] * off, y, P[1] + b[1] * off] }
      if (!ref) ref = at(78, 50)
      return prof.map(q => at(q[0], q[1]))
    })
    const r = ref as unknown as number[]
    // самый нижний отрезок сечения — дно: по нему видно, где у желоба «снаружи»
    let bot = 0, lowY = 1e9
    for (let i = 0; i < prof.length - 1; i++) { const my = (prof[i][1] + prof[i + 1][1]) / 2; if (my < lowY) { lowY = my; bot = i } }
    return faceOut(skin(rings, false), bot * 2, new V3(r[0], r[1], r[2]))
  }
  // торцевая пластина по сечению желоба в плоскости x = const (лицевая стенка к +z)
  function capPlate(x: number, prof: number[][] = PROF.slice(2)) {
    const pts = prof
    const tri = T.ShapeUtils.triangulateShape(pts.map(q => new T.Vector2(q[0], q[1])), [])
    const pos: number[] = [], idx: number[] = []
    pts.forEach(q => pos.push(x, q[1], 60 - q[0]))
    tri.forEach((f: number[]) => idx.push(f[0], f[1], f[2]))
    return faceOut(geoOf(pos, idx), 0, new V3(x + 60, 50, 0))
  }
  // сечение трубы 76×102: скошенные углы и продольные рёбра
  function tubeSection(grow = 0) {
    const a = 38 + grow, b = 51 + grow, r = 9, pts: number[][] = []
    const side = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
      for (let k = 0; k <= 12; k++) {
        const t = k / 12, w = grow ? 0 : 1.7 * (0.5 - 0.5 * Math.cos(t * PI * 6))
        pts.push([x0 + (x1 - x0) * t - nx * w, y0 + (y1 - y0) * t - ny * w])
      }
    }
    side(-a + r, -b, a - r, -b, 0, -1); side(a, -b + r, a, b - r, 1, 0)
    side(a - r, b, -a + r, b, 0, 1); side(-a, b - r, -a, -b + r, -1, 0)
    return pts
  }
  // труба вдоль ломаной в вертикальной плоскости [[x,y],…]
  function tubeSweep(path: number[][], sec: number[][]) {
    const rings = path.map((P, a) => {
      const prev = path[a - 1], next = path[a + 1]
      const d = unit([(next || P)[0] - (prev || P)[0], (next || P)[1] - (prev || P)[1]]), n = [-d[1], d[0]]
      let k = 1
      if (prev && next) { const d1 = unit([P[0] - prev[0], P[1] - prev[1]]), d2 = unit([next[0] - P[0], next[1] - P[1]]); k = 1 / Math.sqrt(Math.max(0.2, (1 + d1[0] * d2[0] + d1[1] * d2[1]) / 2)) }
      return sec.map(q => [P[0] + n[0] * q[0] * k, P[1] + n[1] * q[0] * k, q[1]])
    })
    return faceOut(skin(rings, true), 0, new V3(path[0][0], path[0][1], 0))
  }
  // горизонтальная пластина с прямоугольным отверстием
  function flange(w: number, d: number, hw: number, hd: number, y: number) {
    const c = [[-w, -d], [w, -d], [w, d], [-w, d]], h = [[-hw, -hd], [-hw, hd], [hw, hd], [hw, -hd]]
    const v2 = (q: number[]) => new T.Vector2(q[0], q[1])
    const tri = T.ShapeUtils.triangulateShape(c.map(v2), [h.map(v2)])
    const pos: number[] = [], idx: number[] = []
    c.concat(h).forEach(q => pos.push(q[0], y, q[1]))
    tri.forEach((f: number[]) => idx.push(f[0], f[1], f[2]))
    return faceOut(geoOf(pos, idx), 0, new V3(0, y - 100, 0))
  }
  // полоса вдоль ломаной в плоскости сечения [[u,y],…]
  const strip2d = (pts: number[][], x0: number, x1: number) => skin([x0, x1].map(x => pts.map(q => [x, q[1], 60 - q[0]])), false)
  function hookPath(tail: number) {
    const p = [[123, 100 + tail], [123, -3], [36, -3]]
    for (let k = ogee.length - 1; k >= 0; k--) p.push([ogee[k][0] - 3, ogee[k][1] - 1])
    p.push([-3, 82], [-3, 90], [17, 90], [17, 79])
    return p
  }
  // колено 60°: начало — верхний торец, дальше вниз и плавный поворот
  const ELBOW = (() => {
    const p = [[0, 0], [0, -60]]; let ang = -PI / 2, x = 0, y = -60
    for (let k = 0; k < 6; k++) { ang += PI / 18; x += 14 * Math.cos(ang - PI / 36); y += 14 * Math.sin(ang - PI / 36); p.push([x, y]) }
    p.push([x + 80 * Math.cos(ang), y + 80 * Math.sin(ang)])
    return p
  })()
  const PL = 360
  // держатель трубы: x — к стене, z — вдоль стены, y — вверх. Лента с разрезом спереди + клин-замок.
  const BA = 40.5, BB = 53.5
  function band(hh: number) {
    const r = 9, g = 12, lip = 7
    const p = [[-BA - lip, -g], [-BA, -g], [-BA, -BB + r], [-BA + r, -BB], [BA - r, -BB], [BA, -BB + r], [BA, BB - r], [BA - r, BB], [-BA + r, BB], [-BA, BB - r], [-BA, g], [-BA - lip, g]]
    return faceOut(skin([-hh / 2, hh / 2].map(y => p.map(q => [q[0], y, q[1]])), false), 0, new V3(0, 0, 0))
  }
  function poly(pts: number[][]) {
    const pos: number[] = [], idx: number[] = []
    pts.forEach(q => pos.push(q[0], q[1], q[2]))
    for (let k = 1; k < pts.length - 1; k++) idx.push(0, k, k + 1)
    return geoOf(pos, idx)
  }
  const wedge = (hh: number) => { const x = -BA - 5; return poly([[x, -hh / 2 + 6, -7], [x, -hh / 2 + 6, 7], [x, hh / 2 + 42, 16], [x, hh / 2 + 42, -16]]) }
  const rod = (rad: number, len: number, sides: number, x: number, z: number) => { const g = new T.CylinderGeometry(rad, rad, len, sides); g.rotateZ(PI / 2); g.translate(x, 0, z); return g }
  function ear(s: number, hh: number) {
    const z0 = s * (BB - 9), z1 = s * (BB + 22), z2 = s * (BB + 32), y = hh / 2
    return poly([[BA, -y, z0], [BA, -y, z1], [BA, -y + 10, z2], [BA, y - 10, z2], [BA, y, z1], [BA, y, z0]])
  }

  type Def = Record<string, { g: any[][]; flip?: boolean }>
  //   деталь, место в сборке, поворот, сдвиг в разобранной схеме, подпись: сторона и доля вдоль края
  type Row = [GutterKind, number[], number[], number[], string, number?]
  interface Sys { DEF: Def; LAYOUT: Row[]; thin: GutterKind[] }

  // ── «Модерн бюджет»: у каждой детали — список кусков [геометрия, одноцветная?]; flip — зеркало по длине
  function budget(): Sys {
    const capG = [[capPlate(0)], [gutterSweep([[0, 0], [28, 0]], 1, PROF.slice(1))]]
    const DEF: Def = {
      gutter: { g: [[gutterSweep([[-200, 0], [200, 0]], 1)]] },
      cout: { g: [[gutterSweep([[0, -160], [0, 0], [160, 0]], 1)]] },
      cin: { g: [[gutterSweep([[-160, 0], [0, 0], [0, 160]], 1)]] },
      capl: { g: capG },
      capr: { g: capG, flip: true },
      hold: { g: [[strip2d(hookPath(195), -13, 13), true]] },
      holdk: { g: [[strip2d(hookPath(46), -13, 13), true]] },
      pipe: { g: [[tubeSweep([[0, -PL / 2], [0, PL / 2]], tubeSection())]] },
      elbow: { g: [[tubeSweep(ELBOW, tubeSection())]] },
      funnel: { g: [[flange(46, 62, 38, 51, 0)], [tubeSweep([[0, 0], [0, -75]], tubeSection())]] },
      clamp: { g: [[band(70)], [wedge(70), true], [rod(7, 5, 6, BA - 3, 0), true], [rod(2.6, 46, 8, BA + 23, 0), true]] },
      clampw: { g: [[band(48)], [wedge(48), true], [ear(1, 48), true], [ear(-1, 48), true], [rod(4.5, 3, 8, BA - 1.5, BB + 16), true], [rod(4.5, 3, 8, BA - 1.5, -BB - 16), true]] },
    }
    const FX = -30, FZ = -18.5, PT = -76   // верх трубы = низ воронки; колено одно — слив внизу трубы
    const LAYOUT: Row[] = [
      ['gutter', [0, 0, 0], [0, 0, 0], [0, 0, 0], 'b', 0.82],
      ['cout', [-360, 0, 0], [0, 0, 0], [-100, 0, 0], 'b', 0.35],
      ['capl', [-360, 0, -160], [0, -PI / 2, 0], [-100, 0, -100], 't'],
      ['cin', [360, 0, 0], [0, 0, 0], [100, 0, 0], 't', 0.6],
      ['capr', [360, 0, 160], [0, -PI / 2, 0], [100, 0, 100], 'b'],
      ['hold', [-140, 0, 0], [0, 0, 0], [0, 150, 0], 'l', 0.3],
      ['holdk', [140, 0, 0], [0, 0, 0], [0, 150, 0], 't'],
      ['funnel', [FX, -1, FZ], [0, PI / 2, 0], [0, -90, 0], 'l'],
      ['pipe', [FX, PT - PL / 2, FZ], [0, PI / 2, 0], [0, -180, 0], 'l'],
      ['elbow', [FX, PT - PL, FZ], [0, -PI / 2, 0], [0, -270, 0], 'l'],
      ['clamp', [FX, PT - 170, FZ], [0, PI / 2, 0], [178, -180, 0], 'r'],
      ['clampw', [FX, PT - 270, FZ], [0, PI / 2, 0], [178, -180, 0], 'r'],
    ]
    return { DEF, LAYOUT, thin: ['hold', 'holdk', 'clamp', 'clampw'] }
  }

  // ── «Дёке»: желоб полукруглый, труба круглая. Виды деталей — по нашей номенклатуре (14 позиций класса).
  function docke(): Sys {
    const half = (r: number) => { const p: number[][] = []; for (let i = 0; i <= 18; i++) { const t = PI * i / 18; p.push([60 - r * Math.cos(t), 60 - r * Math.sin(t)]) } return p }
    // сечение желоба: наружный валик спереди → полукруг → отбортовка у стены
    const PD = [[-6, 52], [-6, 62]].concat(half(60), [[126, 60], [126, 68]])
    const PJ = [[-10, 50], [-10, 65]].concat(half(63.5), [[130, 60], [130, 71]])       // соединитель — чуть шире желоба
    const open = (rt: number, rb: number, hh: number, y: number) => { const g = new T.CylinderGeometry(rt, rb, hh, 28, 1, true); g.translate(0, y, 0); return g }
    const ring: number[][] = []; for (let i = 0; i < 28; i++) { const t = 2 * PI * i / 28; ring.push([45 * Math.cos(t), 45 * Math.sin(t)]) }
    // колено: раструб сверху, поворот на ang градусов, прямой выпуск
    const bend = (ang: number, tail: number) => {
      const p = [[0, 0], [0, -45]]; let d = -PI / 2, x = 0, y = -45; const steps = Math.round(ang / 9)
      for (let k = 0; k < steps; k++) { d += (ang / steps) * PI / 180; x += 13 * Math.cos(d - (ang / steps) * PI / 360); y += 13 * Math.sin(d - (ang / steps) * PI / 360); p.push([x, y]) }
      p.push([x + tail * Math.cos(d), y + tail * Math.sin(d)])
      return p
    }
    const elbow = (ang: number, tail: number) => [[tubeSweep(bend(ang, tail), ring)], [open(50, 50, 36, -18)]]
    // кронштейн: спинка у стены → дуга под желобом → зацеп за передний валик
    const hook = (top: number, r: number) => {
      const p = [[127, top], [127, 60]]
      for (let i = 1; i <= 18; i++) { const t = PI - PI * i / 18; p.push([60 - r * Math.cos(t), 60 - r * Math.sin(t)]) }
      p.push([60 - r, 67], [60 - r + 8, 67])
      return p
    }
    const box = (w: number, hh: number, d: number, x: number, y: number, z: number) => { const g = new T.BoxGeometry(w, hh, d); g.translate(x, y, z); return g }
    const pin = (rad: number, len: number, z: number) => { const g = new T.CylinderGeometry(rad, rad, len, 8); g.rotateX(PI / 2); g.translate(0, 0, z); return g }
    const DPL = 300
    const DEF: Def = {
      dg: { g: [[gutterSweep([[-160, 0], [160, 0]], 1, PD)]] },
      dc90: { g: [[gutterSweep([[0, -140], [0, 0], [140, 0]], 1, PD)]] },
      dc135: { g: [[gutterSweep([[-120, 0], [0, 0], [85, -85]], 1, PD)]] },
      dcap: { g: [[capPlate(0, half(60))], [gutterSweep([[0, 0], [24, 0]], 1, PJ)]] },
      dconn: { g: [[gutterSweep([[-34, 0], [34, 0]], 1, PJ)]] },
      dfun: { g: [[gutterSweep([[-80, 0], [80, 0]], 1, PD)], [open(54, 46, 38, -15)], [open(46, 46, 58, -63)]] },
      dbr: { g: [[strip2d(hook(112, 65), -13, 13), true], [box(44, 66, 5, 0, 80, -69.5), true]] },
      dbrm: { g: [[strip2d(hook(250, 64), -9, 9), true]] },
      dpipe: { g: [[open(45, 45, DPL, 0)]] },
      dmuf: { g: [[open(49, 49, 80, 0)], [open(52.5, 52.5, 7, 14)], [open(52.5, 52.5, 7, -14)]] },
      dclamp: { g: [[open(49.5, 49.5, 22, 0), true], [box(30, 22, 26, 0, 0, -62), true], [pin(3, 44, -97), true]] },
      del72: { g: elbow(72, 52) },
      del45: { g: elbow(45, 52) },
      dtip: { g: elbow(62, 95) },
    }
    const PX = 240, PT = -92                              // ось трубы — под воронкой; низ выпуска воронки
    const LAYOUT: Row[] = [
      ['dg', [0, 0, 0], [0, 0, 0], [0, 0, 0], 't', 0.5],
      ['dconn', [-160, 0, 0], [0, 0, 0], [-48, 0, 0], 'b'],
      ['dc90', [-300, 0, 0], [0, 0, 0], [-100, 0, 0], 'b', 0.3],
      ['dcap', [-300, 0, -140], [0, -PI / 2, 0], [-100, 0, -95], 't'],
      ['dfun', [PX, 0, 0], [0, 0, 0], [55, 0, 0], 't', 0.4],
      ['dc135', [440, 0, 0], [0, 0, 0], [118, 0, 0], 'b', 0.7],
      ['dbr', [-80, 0, 0], [0, 0, 0], [0, 150, 0], 'l', 0.3],
      ['dbrm', [80, 0, 0], [0, 0, 0], [0, 150, 0], 'r', 0.3],
      ['dpipe', [PX, PT - DPL / 2, 0], [0, 0, 0], [55, -55, 0], 'l'],
      ['dclamp', [PX, PT - DPL / 2, 0], [0, 0, 0], [215, -55, 0], 'r'],
      ['dmuf', [PX, PT - DPL - 40, 0], [0, 0, 0], [55, -110, 0], 'l'],
      ['dtip', [PX, PT - DPL - 80, 0], [0, 0, 0], [55, -165, 0], 'l'],
      ['del72', [-60, -190, 0], [0, 0, 0], [-20, -55, 0], 'l'],
      ['del45', [-60, -380, 0], [0, 0, 0], [-20, -140, 0], 'l'],
    ]
    return { DEF, LAYOUT, thin: ['dbr', 'dbrm', 'dclamp', 'dconn', 'dcap'] }
  }

  const { DEF, LAYOUT, thin } = opts.system === 'docke' ? docke() : budget()
  const geos: any[] = []
  Object.values(DEF).forEach(d => d.g.forEach(it => { if (!geos.includes(it[0])) geos.push(it[0]) }))
  const edgeOf = new Map<any, any>()
  geos.forEach(g => edgeOf.set(g, new T.EdgesGeometry(g, 28)))

  let pal: GutterPalette = { out: '#5b392e', inn: '#f2f3f0', line: '#2c1b15' }
  const mats = () => ({
    out: new T.MeshStandardMaterial({ color: pal.out, roughness: 0.62, metalness: 0.1, side: T.FrontSide, flatShading: true }),
    inn: new T.MeshStandardMaterial({ color: pal.inn, roughness: 0.7, metalness: 0.05, side: T.BackSide, flatShading: true }),
    all: new T.MeshStandardMaterial({ color: pal.out, roughness: 0.62, metalness: 0.1, side: T.DoubleSide, flatShading: true }),
    line: new T.LineBasicMaterial({ color: pal.line }),
  })
  const hitMat = new T.MeshBasicMaterial({ visible: false })

  // слой подписей: стрелки (svg) + плашки с алиасами
  host.style.position = host.style.position || 'relative'
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible')
  host.appendChild(svg)

  const pivot = new T.Group(), content = new T.Group(); pivot.add(content); scene.add(pivot)
  const hitList: any[] = []
  const hidden = opts.hide || []
  const INST = LAYOUT.filter(row => !hidden.includes(row[0])).map(row => {
    const m = mats(), outer = new T.Group(), inner = new T.Group(), def = DEF[row[0]]
    def.g.forEach(it => {
      if (it[1]) inner.add(new T.Mesh(it[0], m.all)); else { inner.add(new T.Mesh(it[0], m.out)); inner.add(new T.Mesh(it[0], m.inn)) }
      inner.add(new T.LineSegments(edgeOf.get(it[0]), m.line))
    })
    if (def.flip) inner.scale.x = -1
    outer.rotation.set(row[2][0], row[2][1], row[2][2]); outer.add(inner)
    outer.updateMatrixWorld(true)
    const box0 = new T.Box3().setFromObject(outer)
    // тонким деталям — невидимая «ручка» покрупнее, иначе пальцем не попасть
    let handle: any = null
    if (thin.includes(row[0])) {
      const ib = new T.Box3().setFromObject(inner), sz = ib.getSize(new V3()).addScalar(34)
      handle = new T.Mesh(new T.BoxGeometry(sz.x, sz.y, sz.z), hitMat)
      handle.position.copy(ib.getCenter(new V3())); inner.add(handle)
    }
    const line = document.createElementNS(NS, 'line')
    line.setAttribute('stroke', 'currentColor'); line.setAttribute('stroke-width', '1.4'); line.setAttribute('stroke-linecap', 'round')
    const dot = document.createElementNS(NS, 'path'); dot.setAttribute('fill', 'currentColor')
    svg.appendChild(line); svg.appendChild(dot)
    const tag = document.createElement('div'); tag.setAttribute('role', 'button'); tag.dataset.tag = '1'   // div, а не button: общие стили кнопок кабинета раздували плашку
    tag.style.cssText = 'position:absolute;left:0;top:0;margin:0;box-sizing:border-box;user-select:none;border:1px solid rgba(0,0,0,.14);border-radius:9px;padding:4px 7px;font-family:inherit;font-size:11px;font-weight:700;line-height:1.15;white-space:nowrap;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.18);will-change:transform;-webkit-tap-highlight-color:transparent'
    host.appendChild(tag)
    const inst = { kind: row[0], m, group: outer, handle, home: new V3().fromArray(row[1]), ex: new V3().fromArray(row[3]), rel: new V3(),
      c0: box0.getCenter(new V3()), box0, side: row[4], frac: row[5] ?? 0.5, attached: false, tag, line, dot, w: 40, h: 20, label: { text: '' } as GutterLabel }
    outer.traverse((o: any) => { if (o.isMesh) { o.userData.inst = inst; hitList.push(o) } })
    tag.addEventListener('click', () => { pickInst(inst); opts.onPick(inst.kind) })
    content.add(outer)
    return inst
  })
  type Inst = (typeof INST)[number]
  const anchor = INST[0]
  INST.forEach(q => { q.rel = q.home.clone().sub(anchor.home); q.group.position.copy(q.home).add(q.ex) })

  // ── вид ─────────────────────────────────────────────────────────────────────
  // По умолчанию смотрим с лицевой стороны слева: наружный угол ближе, слив колена уходит вправо.
  const VIEW0 = [0.34, 0.62]
  let dist = 3000, zoom = 1, dirty = true, dead = false
  pivot.rotation.set(VIEW0[0], VIEW0[1], 0)
  const tmp = new V3()
  const corner = (q: Inst, k: number, p: any) => { const m = q.box0; return tmp.set(k & 1 ? m.max.x : m.min.x, k & 2 ? m.max.y : m.min.y, k & 4 ? m.max.z : m.min.z).add(p) }
  function fitOf(posOf: (q: Inst) => any) {
    const R = new T.Matrix4().makeRotationFromEuler(pivot.rotation), lo = new V3(1e9, 1e9, 1e9), hi = new V3(-1e9, -1e9, -1e9)
    INST.forEach(q => { const p = posOf(q); for (let k = 0; k < 8; k++) { corner(q, k, p).applyMatrix4(R); lo.min(tmp); hi.max(tmp) } })
    const tv = Math.tan(cam.fov * PI / 360), th = tv * cam.aspect
    const d = Math.max((hi.y - lo.y) / 2 / tv * 1.24, (hi.x - lo.x) / 2 / th * 1.12) + (hi.z - lo.z) / 2
    return { ctr: lo.add(hi).multiplyScalar(0.5).applyMatrix4(R.invert()), dist: d }
  }
  const curPos = (q: Inst) => q.group.position
  const applyFit = (f: { ctr: any; dist: number }) => { content.position.copy(f.ctr).multiplyScalar(-1); dist = f.dist; dirty = true }

  // плавный переход: детали едут на новые места, вид подстраивается
  let tween: null | { t0: number; dur: number; items: { q: Inst; a: any; b: any }[]; c0: any; c1: any; d0: number; d1: number } = null
  function arrange(assembled: boolean) {
    const base = anchor.group.position.clone()          // желоб остаётся там, где стоит
    const items = INST.map(q => {
      const to = base.clone().add(q.rel); if (!assembled) to.add(q.ex)
      q.attached = assembled && q !== anchor
      return { q, a: q.group.position.clone(), b: to }
    })
    const f = fitOf(q => items[INST.indexOf(q)].b)
    tween = { t0: performance.now(), dur: 650, items, c0: content.position.clone(), c1: f.ctr.clone().multiplyScalar(-1), d0: dist, d1: f.dist }
    dirty = true
  }

  // ── выбор и цвет ────────────────────────────────────────────────────────────
  let picked: Inst | null = null
  const cA = new T.Color(ACCENT)
  function paint() {
    INST.forEach(q => {
      const on = !!picked && q.kind === picked.kind
      q.m.out.color.set(pal.out); q.m.all.color.set(pal.out); q.m.inn.color.set(pal.inn); q.m.line.color.set(pal.line)
      if (on) { q.m.out.color.lerp(cA, 0.55); q.m.all.color.lerp(cA, 0.55) }
      const lb = q.label, has = (lb.qty || 0) > 0
      q.tag.style.background = on ? ACCENT : has ? OK : '#fff'
      q.tag.style.color = on || has ? '#fff' : '#26231f'
      q.tag.style.opacity = lb.off ? '0.6' : '1'
    })
    dirty = true
  }
  function pickInst(q: Inst | null) { picked = q; paint() }

  // ── палец: деталь двигаем, пустое место — крутим схему ─────────────────────
  const ray = new T.Raycaster(), ndc = new T.Vector2(), ptrs: Record<number, { x: number; y: number }> = {}
  let lastPinch = 0, drag: any = null
  const setNdc = (e: PointerEvent) => { const r = el.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1) }
  const toScreen = (local: any) => { const r = el.getBoundingClientRect(), w = content.localToWorld(local.clone()).project(cam); return [(w.x + 1) / 2 * r.width, (1 - w.y) / 2 * r.height] }
  function moveTo(q: Inst, np: any) {
    if (q === anchor) {
      const d = np.clone().sub(q.group.position)
      INST.forEach(o => { if (o === q || o.attached) o.group.position.add(d) })
      return
    }
    // рядом со своим местом у желоба деталь прищёлкивается
    const home = anchor.group.position.clone().add(q.rel)
    const a = toScreen(np.clone().add(q.c0)), b = toScreen(home.clone().add(q.c0))
    const near = Math.hypot(a[0] - b[0], a[1] - b[1]) < 18
    if (near && !q.attached && opts.onSnap) opts.onSnap(q.kind)
    q.attached = near; q.group.position.copy(near ? home : np)
  }
  const onDown = (e: PointerEvent) => {
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }
    try { el.setPointerCapture(e.pointerId) } catch { /* синтетическое событие */ }
    if (Object.keys(ptrs).length > 1) { drag = null; return }
    tween = null; scene.updateMatrixWorld(true); setNdc(e); ray.setFromCamera(ndc, cam)
    const hit = ray.intersectObjects(hitList, false)[0]
    drag = { x0: e.clientX, y0: e.clientY, moved: false, q: null }
    if (hit) {
      const fwd = cam.getWorldDirection(new V3())
      drag.q = hit.object.userData.inst; drag.plane = new T.Plane().setFromNormalAndCoplanarPoint(fwd, hit.point)
      drag.s = content.worldToLocal(hit.point.clone()); drag.p0 = drag.q.group.position.clone()
      el.style.cursor = 'grabbing'
    }
  }
  const onMove = (e: PointerEvent) => {
    const p = ptrs[e.pointerId]; if (!p) return
    const ids = Object.keys(ptrs)
    if (ids.length === 2) {
      p.x = e.clientX; p.y = e.clientY
      const a = ptrs[+ids[0]], b = ptrs[+ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y)
      if (lastPinch) zoom = Math.max(0.5, Math.min(4, zoom * d / lastPinch))
      lastPinch = d; dirty = true; return
    }
    if (!drag) return
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) drag.moved = true
    if (drag.q) {
      if (drag.moved) {
        setNdc(e); ray.setFromCamera(ndc, cam)
        const w = new V3()
        if (ray.ray.intersectPlane(drag.plane, w)) moveTo(drag.q, drag.p0.clone().add(content.worldToLocal(w).sub(drag.s)))
      }
    } else {
      pivot.rotation.y += (e.clientX - p.x) * 0.008
      pivot.rotation.x = Math.max(-0.2, Math.min(1.35, pivot.rotation.x + (e.clientY - p.y) * 0.008))
    }
    p.x = e.clientX; p.y = e.clientY; dirty = true
  }
  const onUp = (e: PointerEvent) => {
    delete ptrs[e.pointerId]; lastPinch = 0; el.style.cursor = 'grab'
    if (drag && (drag.q || !drag.moved)) { pickInst(drag.q || null); opts.onPick(drag.q ? drag.q.kind : null) }
    drag = null
  }
  const onWheel = (e: WheelEvent) => { e.preventDefault(); zoom = Math.max(0.5, Math.min(4, zoom * (e.deltaY > 0 ? 0.92 : 1.08))); dirty = true }
  el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp)
  el.addEventListener('wheel', onWheel, { passive: false })

  let W = 320, H = 420
  function size() {
    W = host.clientWidth || 320; H = host.clientHeight || 420
    renderer.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix()
    if (!tween) applyFit(fitOf(curPos))
    dirty = true
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(size) : null
  if (ro) ro.observe(host); else window.addEventListener('resize', size)
  size()

  // подписи: плашка рядом с деталью со своей стороны, пересечения плашек разводим по вертикали
  function layoutLabels() {
    const boxes = INST.map(q => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
      for (let k = 0; k < 8; k++) {
        content.localToWorld(corner(q, k, q.group.position)).project(cam)
        const sx = (tmp.x + 1) / 2 * W, sy = (1 - tmp.y) / 2 * H
        if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy
      }
      const c = content.localToWorld(tmp.copy(q.group.position).add(q.c0)).project(cam)
      const cx = (c.x + 1) / 2 * W, cy = (1 - c.y) / 2 * H, gap = 12
      let x: number, y: number
      if (q.side === 'l') { x = x0 - gap - q.w; y = y0 + (y1 - y0) * q.frac - q.h / 2 }
      else if (q.side === 'r') { x = x1 + gap; y = y0 + (y1 - y0) * q.frac - q.h / 2 }
      else if (q.side === 't') { x = x0 + (x1 - x0) * q.frac - q.w / 2; y = y0 - gap - q.h }
      else { x = x0 + (x1 - x0) * q.frac - q.w / 2; y = y1 + gap }
      return { q, x, y, cx, cy }
    })
    const clampBox = (b: (typeof boxes)[number]) => { b.x = Math.max(3, Math.min(W - b.q.w - 3, b.x)); b.y = Math.max(3, Math.min(H - b.q.h - 3, b.y)) }
    boxes.forEach(clampBox)
    for (let it = 0; it < 8; it++) {
      let moved = false
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j]
        const ox = Math.min(a.x + a.q.w, b.x + b.q.w) - Math.max(a.x, b.x) + 4
        const oy = Math.min(a.y + a.q.h, b.y + b.q.h) - Math.max(a.y, b.y) + 3
        if (ox <= 0 || oy <= 0) continue
        const up = a.y + a.q.h / 2 <= b.y + b.q.h / 2 ? a : b, dn = up === a ? b : a
        up.y -= oy / 2; dn.y += oy / 2; moved = true
      }
      boxes.forEach(clampBox)
      if (!moved) break
    }
    boxes.forEach(b => {
      const q = b.q
      q.tag.style.transform = `translate(${b.x.toFixed(1)}px,${b.y.toFixed(1)}px)`
      // стрелка: от ближайшей точки плашки к детали
      const sx = Math.max(b.x, Math.min(b.x + q.w, b.cx)), sy = Math.max(b.y, Math.min(b.y + q.h, b.cy))
      const dx = b.cx - sx, dy = b.cy - sy, len = Math.hypot(dx, dy)
      if (len < 9) { q.line.setAttribute('visibility', 'hidden'); q.dot.setAttribute('visibility', 'hidden'); return }
      const ux = dx / len, uy = dy / len, ex = b.cx - ux * 2, ey = b.cy - uy * 2
      q.line.setAttribute('visibility', 'visible'); q.dot.setAttribute('visibility', 'visible')
      q.line.setAttribute('x1', sx.toFixed(1)); q.line.setAttribute('y1', sy.toFixed(1))
      q.line.setAttribute('x2', (ex - ux * 5).toFixed(1)); q.line.setAttribute('y2', (ey - uy * 5).toFixed(1))
      const bx = ex - ux * 7, by = ey - uy * 7
      q.dot.setAttribute('d', `M${ex.toFixed(1)} ${ey.toFixed(1)}L${(bx - uy * 3.4).toFixed(1)} ${(by + ux * 3.4).toFixed(1)}L${(bx + uy * 3.4).toFixed(1)} ${(by - ux * 3.4).toFixed(1)}Z`)
    })
  }

  function frame(now: number) {
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.dur), s = k * k * (3 - 2 * k)
      tween.items.forEach(it => it.q.group.position.lerpVectors(it.a, it.b, s))
      content.position.lerpVectors(tween.c0, tween.c1, s); dist = tween.d0 + (tween.d1 - tween.d0) * s
      if (k >= 1) tween = null
      dirty = true
    }
    if (!dirty) return
    dirty = false
    cam.position.set(0, 0, dist / zoom); cam.lookAt(0, 0, 0)
    scene.updateMatrixWorld(true)
    renderer.render(scene, cam)
    layoutLabels()
  }
  let raf = 0
  const loop = (now: number) => { if (dead) return; frame(now); raf = requestAnimationFrame(loop) }
  raf = requestAnimationFrame(loop)

  const api: GutterScene = {
    setPalette(p) { pal = p; paint() },
    setLabels(m) {
      INST.forEach(q => {
        const lb = m[q.kind]; if (!lb) return
        q.label = lb
        const text = lb.text + ((lb.qty || 0) > 0 ? ` · ${lb.qty}` : '')
        if (q.tag.textContent !== text) { q.tag.textContent = text; q.w = q.tag.offsetWidth || 40; q.h = q.tag.offsetHeight || 20 }
      })
      paint()
    },
    select(k) { pickInst(k ? INST.find(q => q.kind === k) || null : null) },
    arrange,
    resetView() { pivot.rotation.set(VIEW0[0], VIEW0[1], 0); zoom = 1; applyFit(fitOf(curPos)) },
    dispose() {
      dead = true; cancelAnimationFrame(raf)
      if (ro) ro.disconnect(); else window.removeEventListener('resize', size)
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp); el.removeEventListener('wheel', onWheel)
      INST.forEach(q => { q.tag.remove(); Object.values(q.m).forEach((mm: any) => mm.dispose()); if (q.handle) q.handle.geometry.dispose() })
      geos.forEach(g => { g.dispose(); edgeOf.get(g).dispose() })
      hitMat.dispose(); renderer.dispose(); svg.remove(); el.remove()
    },
  }
  // для проверки на экране (фоновая вкладка не крутит requestAnimationFrame)
  ;(host as any).__g3d = { render: () => { dirty = true; frame(performance.now() + 5000) }, arrange, canvas: el,
    at: (i: number) => { const r = el.getBoundingClientRect(), s = toScreen(INST[i].group.position.clone().add(INST[i].c0)); return [r.left + s[0], r.top + s[1], INST[i].kind, INST[i].attached] } }
  return api
}
