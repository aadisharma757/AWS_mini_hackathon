// The one dot-matrix moment: a tiny night skyline on the CRT screen.
// A streetlight drifts across it on its own, or follows your pointer. Decorative only.
(() => {
  const canvas = document.getElementById('crt-dots');
  if (!canvas) return;

  const screen = canvas.parentElement;
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const CREAM = '#f6ecd9';
  const WARM = '#ffd37a';
  const PINK = '#ff7a9c';

  let w = 0, h = 0, cell = 5, cols = 0, rows = 0, dpr = 1;
  let skyline = [];
  const lamp = { x: 0, y: 0, tx: 0, ty: 0 };
  let hovering = false;
  let visible = true;
  let raf = 0;
  let last = 0;

  function hash(x, y) {
    let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  function buildSkyline() {
    skyline = new Array(cols);
    let x = 0;
    let b = 0;
    while (x < cols) {
      const width = 3 + Math.floor(hash(b, 1) * 5);
      const top = Math.floor(rows * (1 - (0.22 + hash(b, 2) * 0.34)));
      for (let i = 0; i < width && x < cols; i += 1, x += 1) skyline[x] = top;
      b += 1;
    }
  }

  function setup() {
    const rect = screen.getBoundingClientRect();
    w = Math.max(1, Math.floor(rect.width));
    h = Math.max(1, Math.floor(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = Math.max(4, Math.round(w / 52));
    cols = Math.ceil(w / cell);
    rows = Math.ceil(h / cell);
    buildSkyline();
    lamp.x = lamp.tx = w * 0.5;
    lamp.y = lamp.ty = h * 0.55;
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const radius = Math.max(w, h) * 0.55;
    const rc = radius / cell;
    const lc = lamp.x / cell;
    const lr = lamp.y / cell;

    const cream = new Path2D();
    const warm = new Path2D();
    const pink = new Path2D();

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const top = skyline[c];
        let base = 0;
        let pinkDot = false;

        if (r >= rows - 1) base = 0.3;
        else if (r >= top) {
          base = 0.14;
          if (c % 3 === 1 && r % 3 === 1 && r > top + 1) {
            const v = hash(c, r);
            if (v > 0.72) {
              base = 0.55 + (v - 0.72);
              pinkDot = v > 0.95;
            }
          }
        } else if (hash(c * 7, r * 13) > 0.985) base = 0.45;

        const dx = c - lc;
        const dy = r - lr;
        let glow = 1 - Math.sqrt(dx * dx + dy * dy) / rc;
        glow = glow > 0 ? glow * glow : 0;

        const b = Math.min(1, base + glow * 0.7);
        if (b < 0.08) continue;

        const rad = cell * 0.46 * Math.pow(b, 0.75);
        const x = c * cell + cell / 2;
        const y = r * cell + cell / 2;
        const path = pinkDot ? pink : glow > 0.25 ? warm : cream;
        path.moveTo(x + rad, y);
        path.arc(x, y, rad, 0, Math.PI * 2);
      }
    }

    ctx.fillStyle = CREAM;
    ctx.fill(cream);
    ctx.fillStyle = WARM;
    ctx.fill(warm);
    ctx.fillStyle = PINK;
    ctx.fill(pink);
  }

  function tick(now) {
    raf = 0;
    if (!visible) return;
    if (!hovering) {
      lamp.tx = w * (0.5 + 0.34 * Math.sin(now / 3200));
      lamp.ty = h * (0.5 + 0.12 * Math.sin(now / 2100));
    }
    if (now - last > 40) {
      lamp.x += (lamp.tx - lamp.x) * 0.12;
      lamp.y += (lamp.ty - lamp.y) * 0.12;
      draw();
      last = now;
    }
    raf = requestAnimationFrame(tick);
  }

  function run() {
    if (!reduce && !raf && visible) raf = requestAnimationFrame(tick);
  }

  screen.addEventListener('pointermove', (e) => {
    const rect = screen.getBoundingClientRect();
    hovering = true;
    lamp.tx = e.clientX - rect.left;
    lamp.ty = e.clientY - rect.top;
  });
  screen.addEventListener('pointerleave', () => {
    hovering = false;
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) run();
    }).observe(screen);
  }

  let resizing = 0;
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      cancelAnimationFrame(resizing);
      resizing = requestAnimationFrame(setup);
    }).observe(screen);
  } else {
    window.addEventListener('resize', setup);
  }

  setup();
  run();
})();