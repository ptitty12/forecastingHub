const pptxgen = require('pptxgenjs')
const path = require('path')

const IMG = (n) => path.join(__dirname, 'deck', n)

// Palette: pub-and-forecast — deep forest green dominant, beer amber accent.
const FOREST = '1B4D2E'
const FOREST_DEEP = '123520'
const MOSS = '4E8B5B'
const AMBER = 'E8A33D'
const CREAM = 'F7F7F4'
const INK = '1A1A1A'
const INK2 = '4A4A46'
const WHITE = 'FFFFFF'

const HEAD = 'Cambria'
const BODY = 'Calibri'

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE' // 13.3 x 7.5
pres.author = 'Forecasting Pub'
pres.title = 'Forecasting Pub — functionality overview'

const W = 13.3
const H = 7.5

// ---------------------------------------------------------------- helpers

/** Rounded screenshot frame — the deck's repeated motif. */
function shot(slide, file, { x, y, w, h }) {
  slide.addShape(pres.ShapeType.roundRect, {
    x: x - 0.045,
    y: y - 0.045,
    w: w + 0.09,
    h: h + 0.09,
    rectRadius: 0.06,
    fill: { color: WHITE },
    line: { color: 'D8D8D2', width: 0.75 },
    shadow: { type: 'outer', angle: 90, blur: 14, offset: 3, color: '000000', opacity: 0.16 },
  })
  slide.addImage({ path: file, x, y, w, h })
}

/** Amber numbered pill used in step rows. */
function stepNum(slide, n, x, y) {
  slide.addShape(pres.ShapeType.ellipse, {
    x, y, w: 0.36, h: 0.36,
    fill: { color: AMBER },
  })
  slide.addText(String(n), {
    x, y, w: 0.36, h: 0.36,
    align: 'center', valign: 'middle',
    fontFace: BODY, fontSize: 14, bold: true, color: FOREST_DEEP, margin: 0,
  })
}

function slideTitle(slide, text, kicker) {
  if (kicker) {
    slide.addText(kicker.toUpperCase(), {
      x: 0.62, y: 0.36, w: 9, h: 0.28,
      fontFace: BODY, fontSize: 11.5, bold: true, color: MOSS, charSpacing: 1.6, margin: 0,
    })
  }
  slide.addText(text, {
    x: 0.62, y: kicker ? 0.66 : 0.5, w: 12.1, h: 0.62,
    fontFace: HEAD, fontSize: 30, bold: true, color: FOREST_DEEP, margin: 0,
  })
}

function caption(slide, text, { x, y, w }) {
  slide.addText(text, {
    x, y, w, h: 0.3,
    fontFace: BODY, fontSize: 11, italic: true, color: INK2, margin: 0,
  })
}

// ================================================================ 1. Title
{
  const s = pres.addSlide()
  s.background = { color: FOREST_DEEP }

  // beer mug mark — rasterized from the app's own SVG, not an emoji glyph
  s.addShape(pres.ShapeType.roundRect, {
    x: 0.95, y: 1.46, w: 1.0, h: 1.0, rectRadius: 0.22, fill: { color: AMBER },
  })
  s.addImage({ path: IMG('mug.png'), x: 0.95, y: 1.46, w: 1.0, h: 1.0, rounding: false })

  s.addText('Forecasting Pub', {
    x: 0.95, y: 2.62, w: 11.5, h: 1.0,
    fontFace: HEAD, fontSize: 54, bold: true, color: WHITE, margin: 0,
  })
  s.addText('One place for sales teams to call their number', {
    x: 0.95, y: 3.62, w: 11, h: 0.5,
    fontFace: BODY, fontSize: 20, color: 'C9DCC9', margin: 0,
  })

  s.addText('Every team forecasts differently.', {
    x: 0.95, y: 4.6, w: 9.2, h: 0.34,
    fontFace: BODY, fontSize: 15.5, bold: true, color: WHITE, margin: 0,
  })
  s.addText(
    'The Pub stops fighting that — how a team slices, measures and weights its forecast is configuration, not a separate app.',
    { x: 0.95, y: 4.98, w: 8.9, h: 0.72, fontFace: BODY, fontSize: 14.5, color: 'AFC6AF', lineSpacing: 22, margin: 0 },
  )

  s.addText('Functionality overview', {
    x: 0.95, y: 6.5, w: 6, h: 0.3,
    fontFace: BODY, fontSize: 12, color: MOSS, charSpacing: 1.2, margin: 0,
  })
  s.addNotes(
    'The Forecasting Pub replaces a SharePoint/PowerApp setup that had to be rebuilt for every team. ' +
    'The core bet: a dozen business units will never agree on how to slice a forecast, so the app has no opinion about shape.',
  )
}

// ================================================================ 2. Problem → approach
{
  const s = pres.addSlide()
  s.background = { color: CREAM }
  slideTitle(s, 'A dozen teams, a dozen shapes', 'The problem')

  const cards = [
    {
      t: 'Before',
      body: 'Each business unit had its own hacked-together forecast — its own SQL, its own spreadsheet, its own rebuild every time something changed.',
      fill: WHITE, color: INK2, head: INK,
    },
    {
      t: 'After',
      body: 'One app. A team\'s levels, metric and weighting are rows in a config table, filled in through a form. Onboarding is data entry.',
      fill: FOREST, color: 'D6E6D6', head: WHITE,
    },
  ]
  cards.forEach((c, i) => {
    const x = 0.62 + i * 6.35
    s.addShape(pres.ShapeType.roundRect, {
      x, y: 1.72, w: 5.85, h: 1.78, rectRadius: 0.05,
      fill: { color: c.fill },
      line: { color: c.fill === WHITE ? 'E2E2DC' : FOREST, width: 1 },
    })
    s.addText(c.t, {
      x: x + 0.35, y: 1.95, w: 5.1, h: 0.34,
      fontFace: HEAD, fontSize: 19, bold: true, color: c.head, margin: 0,
    })
    s.addText(c.body, {
      x: x + 0.35, y: 2.38, w: 5.15, h: 1.2,
      fontFace: BODY, fontSize: 13.5, color: c.color, lineSpacing: 20, margin: 0,
    })
  })

  s.addText('What a team declares — and nothing else', {
    x: 0.62, y: 3.86, w: 8, h: 0.34,
    fontFace: HEAD, fontSize: 17, bold: true, color: FOREST_DEEP, margin: 0,
  })

  const rows = [
    ['Levels', 'How rows are grouped — 1 to 8, standard dimensions or your own SQL'],
    ['Metric', 'Orders or sales, with exceptions (e.g. software counted on sales)'],
    ['Weighting', 'How open pipeline counts toward the suggestion'],
    ['Groups & filters', 'Custom product rollups, and which source rows are yours'],
  ]
  rows.forEach((r, i) => {
    const y = 4.38 + i * 0.66
    s.addShape(pres.ShapeType.ellipse, { x: 0.68, y: y + 0.06, w: 0.16, h: 0.16, fill: { color: AMBER } })
    s.addText(r[0], {
      x: 1.02, y, w: 2.3, h: 0.3,
      fontFace: BODY, fontSize: 13.5, bold: true, color: FOREST, margin: 0,
    })
    s.addText(r[1], {
      x: 3.25, y, w: 9.4, h: 0.3,
      fontFace: BODY, fontSize: 13.5, color: INK2, margin: 0,
    })
  })

  s.addNotes('The design response to "we can never standardise": stop trying. Standardise the contract — one fact shape, one dimension catalogue, one entry and audit model — and let shape be configuration.')
}

// ================================================================ 3. The grid (hero shot)
{
  const s = pres.addSlide()
  s.background = { color: CREAM }
  slideTitle(s, 'The forecast grid', 'Where sellers work')

  shot(s, IMG('s_grid.png'), { x: 0.62, y: 1.5, w: 8.5, h: 5.31 })

  const points = [
    ['Actuals & pipeline', 'Read straight from source. Nobody types over them.'],
    ['Two suggestions', 'A weighted starting number, and the "if everything lands" ceiling.'],
    ['You enter one number', 'Adjustment or Total — they stay in step, last edit wins.'],
    ['And say why', 'A one-line comment saves the follow-up call.'],
  ]
  points.forEach((p, i) => {
    const y = 1.62 + i * 1.3
    stepNum(s, i + 1, 9.42, y)
    s.addText(p[0], {
      x: 9.92, y: y - 0.02, w: 3.0, h: 0.3,
      fontFace: BODY, fontSize: 14, bold: true, color: FOREST_DEEP, margin: 0,
    })
    s.addText(p[1], {
      x: 9.92, y: y + 0.3, w: 3.05, h: 0.8,
      fontFace: BODY, fontSize: 12, color: INK2, lineSpacing: 17, margin: 0,
    })
  })

  caption(s, 'Shorthand works: 1.2M, 500K, -750K. Everything saves as you type.', { x: 0.62, y: 6.92, w: 8.5 })
  s.addNotes('The grid is the product. Everything else supports it.')
}

// ================================================================ 4. Drill-down
{
  const s = pres.addSlide()
  s.background = { color: CREAM }
  slideTitle(s, 'Every number opens up', 'Trust')

  s.addText(
    'Click the arrow on any row and the actual Salesforce deals behind it appear — amount, likelihood, stage, and whether each one counts toward the suggestion. Deal names link straight into Salesforce.',
    { x: 0.62, y: 1.5, w: 12.1, h: 0.62, fontFace: BODY, fontSize: 14, color: INK2, lineSpacing: 21, margin: 0 },
  )

  shot(s, IMG('s_drilldown.png'), { x: 0.62, y: 2.35, w: 12.06, h: 4.16 })

  caption(s, 'The answer to "why is my suggestion so high?" is usually one deal that is not as certain as it looks.', { x: 0.62, y: 6.68, w: 12.06 })
  s.addNotes('This is the feature that earns trust in the number. A forecast tool nobody can audit gets ignored.')
}

// ================================================================ 5. Time travel
{
  const s = pres.addSlide()
  s.background = { color: CREAM }
  slideTitle(s, 'Rewind to any date', 'Point in time')

  shot(s, IMG('s_asof.png'), { x: 4.4, y: 1.55, w: 8.28, h: 5.18 })

  const bits = [
    ['See as of', 'Pick a date and the grid shows what everyone had entered then. Editing switches off so the past cannot be rewritten.'],
    ['Compare to now', 'Adds today\'s number and the delta, so "what moved this week?" is one glance.'],
    ['Full history', 'Every change ever made — field, old value, new value, who, when. Nothing is silently overwritten.'],
  ]
  bits.forEach((b, i) => {
    const y = 1.66 + i * 1.72
    s.addShape(pres.ShapeType.roundRect, {
      x: 0.62, y, w: 3.5, h: 1.36, rectRadius: 0.05,
      fill: { color: WHITE }, line: { color: 'E2E2DC', width: 1 },
    })
    s.addText(b[0], {
      x: 0.88, y: y + 0.16, w: 3.0, h: 0.28,
      fontFace: BODY, fontSize: 13.5, bold: true, color: FOREST, margin: 0,
    })
    s.addText(b[1], {
      x: 0.88, y: y + 0.48, w: 3.05, h: 0.8,
      fontFace: BODY, fontSize: 11, color: INK2, lineSpacing: 15.5, margin: 0,
    })
  })

  caption(s, 'Rebuilt by replaying the audit trail — no snapshot jobs, no extra tables.', { x: 4.4, y: 6.88, w: 8.28 })
  s.addNotes('Rep input is reconstructed from the audit log. Source facts stay live for now because the upstream tables have no snapshots yet — the UI says so rather than hiding it.')
}

// ================================================================ 6. Dashboard
{
  const s = pres.addSlide()
  s.background = { color: CREAM }
  slideTitle(s, 'The same numbers, drawn', 'Dashboard')

  shot(s, IMG('s_dashboard.png'), { x: 0.62, y: 1.5, w: 8.5, h: 5.31 })

  const points = [
    ['Trajectory', 'Actuals, suggestion and commitment across quarters. A wide gap means a lot still has to be won.'],
    ['Breakdown', 'Switch what is measured and how it is grouped — any level the team forecasts by.'],
    ['Bars or lines', 'Stacked bars for make-up, lines for movement. Same data either way.'],
    ['Filters everywhere', 'Every tile and chart follows the same filters, so the numbers always agree.'],
  ]
  points.forEach((p, i) => {
    const y = 1.62 + i * 1.3
    s.addText(p[0], {
      x: 9.42, y, w: 3.4, h: 0.28,
      fontFace: BODY, fontSize: 13.5, bold: true, color: FOREST_DEEP, margin: 0,
    })
    s.addText(p[1], {
      x: 9.42, y: y + 0.3, w: 3.5, h: 0.9,
      fontFace: BODY, fontSize: 11.5, color: INK2, lineSpacing: 16.5, margin: 0,
    })
  })

  s.addNotes('Charts are native SVG with a fixed, colourblind-checked palette — no chart library, no generated hues.')
}

// ================================================================ 7. Administration
{
  const s = pres.addSlide()
  s.background = { color: CREAM }
  slideTitle(s, 'Onboarding is a form', 'Administration')

  s.addText(
    'Four decisions and the team is live in the picker. No schema change, no deploy, no ticket — and every setup can be edited or switched off later.',
    { x: 0.62, y: 1.5, w: 12.1, h: 0.62, fontFace: BODY, fontSize: 14, color: INK2, lineSpacing: 20, margin: 0 },
  )

  shot(s, IMG('s_admin.png'), { x: 0.62, y: 2.24, w: 7.0, h: 4.38 })
  shot(s, IMG('s_admin_edit.png'), { x: 8.06, y: 2.24, w: 2.05, h: 4.38 })

  s.addText('Edit anything, delete nothing', {
    x: 10.35, y: 2.3, w: 2.4, h: 0.6,
    fontFace: BODY, fontSize: 13.5, bold: true, color: FOREST_DEEP, margin: 0,
  })
  s.addText(
    'Edit loads a view\'s current setup. Deactivate hides it from sellers while keeping every entry and audit row — because deleting a forecast destroys the record of what someone committed to.',
    { x: 10.35, y: 2.98, w: 2.4, h: 2.2, fontFace: BODY, fontSize: 11, color: INK2, lineSpacing: 16, margin: 0 },
  )

  caption(s, 'Custom levels take a SQL expression, compiled and checked the moment you save.', { x: 0.62, y: 6.74, w: 7.0 })
  s.addNotes('A bad config fails for the admin who wrote it, with a reason — never for a seller opening the grid.')
}

// ================================================================ 8. Built for sellers
{
  const s = pres.addSlide()
  s.background = { color: CREAM }
  slideTitle(s, 'Built for people who sell', 'Usability')

  s.addText(
    'Our users are better at selling than at querying. Every column, control and setting explains itself in plain language — no acronyms anyone would have to look up.',
    { x: 0.62, y: 1.5, w: 12.1, h: 0.62, fontFace: BODY, fontSize: 14, color: INK2, lineSpacing: 20, margin: 0 },
  )

  shot(s, IMG('s_help_banner.png'), { x: 0.62, y: 2.42, w: 7.4, h: 1.28 })
  shot(s, IMG('s_tooltip.png'), { x: 0.62, y: 4.2, w: 6.6, h: 1.90 })

  const bits = [
    ['A four-step primer', 'On every page, dismissable, and always retrievable.'],
    ['A "?" on everything', 'Columns, controls, tiles, charts, admin fields. Keyboard reachable.'],
    ['Plain language', 'Say what the number is, then what to do with it. Two sentences, no jargon.'],
    ['Helpful failures', 'Empty and error states say what to do, not just what went wrong.'],
  ]
  bits.forEach((b, i) => {
    const y = 2.34 + i * 1.24
    stepNum(s, i + 1, 8.5, y)
    s.addText(b[0], {
      x: 9.0, y: y - 0.02, w: 3.8, h: 0.28,
      fontFace: BODY, fontSize: 13.5, bold: true, color: FOREST_DEEP, margin: 0,
    })
    s.addText(b[1], {
      x: 9.0, y: y + 0.29, w: 3.85, h: 0.75,
      fontFace: BODY, fontSize: 11.5, color: INK2, lineSpacing: 16, margin: 0,
    })
  })

  s.addNotes('All help copy lives in one file so the wording can be reviewed as prose rather than hunted through the code.')
}

// ================================================================ 9. Under the hood
{
  const s = pres.addSlide()
  s.background = { color: FOREST_DEEP }

  s.addText('UNDER THE HOOD', {
    x: 0.62, y: 0.52, w: 9, h: 0.28,
    fontFace: BODY, fontSize: 11.5, bold: true, color: MOSS, charSpacing: 1.6, margin: 0,
  })
  s.addText('Enterprise-friendly by construction', {
    x: 0.62, y: 0.84, w: 12, h: 0.6,
    fontFace: HEAD, fontSize: 30, bold: true, color: WHITE, margin: 0,
  })

  const tiles = [
    ['Logic runs as SQL', 'Levels, metrics, weighting and filters compile to SQL that executes in the database — so pointing a team at the real warehouse view is a config change, not a rewrite.'],
    ['Read-only on source', 'The app never writes orders, sales or pipeline. It owns only its own config, entries and audit tables.'],
    ['Audited by design', 'Every change writes an immutable record. That trail is also what powers point-in-time views.'],
    ['One container', 'docker compose up. The frontend compiles into the image and the API serves it — one service, one port, no reverse proxy.'],
    ['Agent-ready', 'Five guides plus a working contract for agents: what is safe to change, and which doc to update.'],
    ['Swap-in seams', 'Identity is one function away from SSO; source views are named in config; the SQL layer is a single module.'],
  ]
  tiles.forEach((t, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const x = 0.62 + col * 4.1
    const y = 1.85 + row * 2.28
    s.addShape(pres.ShapeType.roundRect, {
      x, y, w: 3.82, h: 1.98, rectRadius: 0.05,
      fill: { color: FOREST }, line: { color: '2A6B41', width: 1 },
    })
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.3, y: y + 0.3, w: 0.15, h: 0.15, fill: { color: AMBER } })
    s.addText(t[0], {
      x: x + 0.3, y: y + 0.56, w: 3.3, h: 0.3,
      fontFace: BODY, fontSize: 14, bold: true, color: WHITE, margin: 0,
    })
    s.addText(t[1], {
      x: x + 0.3, y: y + 0.92, w: 3.3, h: 1.1,
      fontFace: BODY, fontSize: 11, color: 'B9CFBB', lineSpacing: 15.5, margin: 0,
    })
  })

  s.addNotes('The four goals this was built against: faster onboarding, more out of the box, agents can iterate on it, and a backend that is not SharePoint.')
}

// ================================================================ 10. Where it stands
{
  const s = pres.addSlide()
  s.background = { color: CREAM }
  slideTitle(s, 'Where it stands', 'Status')

  // big stat callouts
  const stats = [
    ['3', 'differently-shaped\nteams seeded'],
    ['1–8', 'forecast levels,\nany of them SQL'],
    ['18', 'tests, including an\nanonymisation guard'],
    ['1', 'command to\ndeploy it'],
  ]
  stats.forEach((st, i) => {
    const x = 0.62 + i * 3.1
    s.addText(st[0], {
      x, y: 1.6, w: 2.8, h: 0.95,
      fontFace: HEAD, fontSize: 52, bold: true, color: FOREST, margin: 0,
    })
    s.addText(st[1], {
      x, y: 2.58, w: 2.8, h: 0.7,
      fontFace: BODY, fontSize: 12, color: INK2, lineSpacing: 16, margin: 0,
    })
  })

  s.addShape(pres.ShapeType.roundRect, {
    x: 0.62, y: 3.6, w: 5.85, h: 2.45, rectRadius: 0.05,
    fill: { color: WHITE }, line: { color: 'E2E2DC', width: 1 },
  })
  s.addText('Working today', {
    x: 0.92, y: 3.82, w: 5.2, h: 0.32,
    fontFace: HEAD, fontSize: 18, bold: true, color: FOREST_DEEP, margin: 0,
  })
  s.addText(
    [
      { text: 'Entry grid, drill-down and comments', options: { bullet: true, breakLine: true } },
      { text: 'Point-in-time views and full audit history', options: { bullet: true, breakLine: true } },
      { text: 'Dashboard with switchable cuts', options: { bullet: true, breakLine: true } },
      { text: 'Self-service onboarding and editing', options: { bullet: true, breakLine: true } },
      { text: 'One-command deployment, docs for every audience', options: { bullet: true } },
    ],
    { x: 0.95, y: 4.24, w: 5.2, h: 2.0, fontFace: BODY, fontSize: 12.5, color: INK2, paraSpaceAfter: 7, margin: 0 },
  )

  s.addShape(pres.ShapeType.roundRect, {
    x: 6.85, y: 3.6, w: 5.83, h: 2.45, rectRadius: 0.05,
    fill: { color: WHITE }, line: { color: 'E2E2DC', width: 1 },
  })
  s.addText('Before production', {
    x: 7.15, y: 3.82, w: 5.2, h: 0.32,
    fontFace: HEAD, fontSize: 18, bold: true, color: FOREST_DEEP, margin: 0,
  })
  s.addText(
    [
      { text: 'Wire SSO in place of the placeholder identity', options: { bullet: true, breakLine: true } },
      { text: 'Point the fact tables at the real feeds', options: { bullet: true, breakLine: true } },
      { text: 'Add source snapshots so as-of covers actuals too', options: { bullet: true, breakLine: true } },
      { text: 'Swap the placeholder Salesforce opportunity id', options: { bullet: true } },
    ],
    { x: 7.18, y: 4.24, w: 5.2, h: 2.0, fontFace: BODY, fontSize: 12.5, color: INK2, paraSpaceAfter: 7, margin: 0 },
  )

  s.addText('All demo data is fictional — accounts, people, products and every number.', {
    x: 0.62, y: 6.32, w: 12.1, h: 0.3,
    fontFace: BODY, fontSize: 11, italic: true, color: INK2, margin: 0,
  })

  s.addNotes('Known limits are stated rather than buried: identity, real feeds, fact snapshots, and the placeholder opportunity link.')
}

pres.writeFile({ fileName: path.join(__dirname, 'Forecasting-Pub-Overview.pptx') }).then((f) => console.log('wrote', f))
