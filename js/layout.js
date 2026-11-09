// Logical points on a 1440×900 display. The preview scales these to the screen.

export const DISPLAY = { w: 1440, h: 900, menu: 28, dock: 108 }

export function tileArea() {
  return {
    x: 0,
    y: DISPLAY.menu,
    w: DISPLAY.w,
    h: DISPLAY.h - DISPLAY.menu - DISPLAY.dock,
  }
}

export function expandGaps(gaps) {
  const inner = gaps?.inner
  const outer = gaps?.outer
  const innerH = typeof inner === "number" ? inner : (inner?.horizontal ?? 8)
  const innerV = typeof inner === "number" ? inner : (inner?.vertical ?? 8)
  const uniform = typeof outer === "number"
  return {
    innerH,
    innerV,
    top: uniform ? outer : (outer?.top ?? 8),
    right: uniform ? outer : (outer?.right ?? 8),
    bottom: uniform ? outer : (outer?.bottom ?? 8),
    left: uniform ? outer : (outer?.left ?? 8),
  }
}

export function resolveGaps(config, displayName) {
  const base = expandGaps(config.gaps)
  const over = displayName ? config.display?.[displayName]?.gaps : null
  if (!over) return base
  const next = { ...base }
  if (over.inner != null) {
    if (typeof over.inner === "number") {
      next.innerH = over.inner
      next.innerV = over.inner
    } else {
      if (over.inner.horizontal != null) next.innerH = over.inner.horizontal
      if (over.inner.vertical != null) next.innerV = over.inner.vertical
    }
  }
  if (over.outer != null) {
    if (typeof over.outer === "number") {
      next.top = next.right = next.bottom = next.left = over.outer
    } else {
      for (const side of ["top", "right", "bottom", "left"]) {
        if (over.outer[side] != null) next[side] = over.outer[side]
      }
    }
  }
  return next
}

export function contentRect(tile, gaps) {
  return {
    x: tile.x + gaps.left,
    y: tile.y + gaps.top,
    w: Math.max(40, tile.w - gaps.left - gaps.right),
    h: Math.max(40, tile.h - gaps.top - gaps.bottom),
  }
}

export function resolveWidths(config, workspaceId, displayName) {
  const ws = config.workspace?.[String(workspaceId)] || {}
  const onDisplay = displayName ? ws.display?.[displayName] || {} : {}
  const display = displayName ? config.display?.[displayName] || {} : {}
  const fullscreen =
    onDisplay["fullscreen-width"] ??
    ws["fullscreen-width"] ??
    display["fullscreen-width"] ??
    config["fullscreen-width"]
  const lone =
    onDisplay["lone-window-width"] ??
    ws["lone-window-width"] ??
    display["lone-window-width"] ??
    config["lone-window-width"] ??
    fullscreen
  return { fullscreen, lone }
}

export function resolveWorkspace(config, workspaceId, displayName) {
  const ws = config.workspace?.[String(workspaceId)] || {}
  const onDisplay = displayName ? ws.display?.[displayName] || {} : {}
  const layout = onDisplay.layout || ws.layout || config["default-layout"]
  const tiling = onDisplay.tiling ?? ws.tiling ?? config["default-tiling"]
  const fixedSource = onDisplay.layout === "fixed" ? onDisplay : ws.layout === "fixed" ? ws : {}
  return {
    layout,
    tiling: Boolean(tiling),
    columns: fixedSource.columns || 1,
    rows: fixedSource.rows || 1,
    expand: fixedSource.expand || "columns",
  }
}

function split(rect, sideBySide, gapH, gapV) {
  if (sideBySide) {
    const gap = Math.min(gapH, Math.max(0, rect.w - 2))
    const inner = rect.w - gap
    const first = inner / 2
    return [
      { x: rect.x, y: rect.y, w: first, h: rect.h },
      { x: rect.x + first + gap, y: rect.y, w: inner - first, h: rect.h },
    ]
  }
  const gap = Math.min(gapV, Math.max(0, rect.h - 2))
  const inner = rect.h - gap
  const first = inner / 2
  return [
    { x: rect.x, y: rect.y, w: rect.w, h: first },
    { x: rect.x, y: rect.y + first + gap, w: rect.w, h: inner - first },
  ]
}

export function arrangeDwindle(count, rect, gapH, gapV) {
  if (count <= 0) return []
  let leaves = [{ index: 0, rect: { ...rect } }]
  let focus = 0
  for (let i = 1; i < count; i++) {
    const leaf = leaves[focus]
    const sideBySide = leaf.rect.w >= leaf.rect.h
    const [kept, added] = split(leaf.rect, sideBySide, gapH, gapV)
    leaves.splice(focus, 1, { index: leaf.index, rect: kept }, { index: i, rect: added })
    focus += 1
  }
  return leaves.map((leaf) => ({ index: leaf.index, ...leaf.rect }))
}

export function arrangeAccordion(indices, rect, focusIndex, padding, horizontal, gap) {
  const items = indices.length ? indices : [0]
  const n = items.length
  if (n === 1) return [{ index: items[0], ...rect }]
  const span = horizontal ? rect.w : rect.h
  const maxPeek = Math.max(0, (span - 72) / (n - 1))
  const peek = Math.min(padding, maxPeek)
  const focusPos = Math.max(0, items.indexOf(focusIndex))
  const focusedSpan = Math.max(36, span - peek * (n - 1))
  const rects = []
  let cursor = horizontal ? rect.x : rect.y
  items.forEach((index, position) => {
    const size = position === focusPos ? focusedSpan : peek
    if (horizontal) {
      rects.push({ index, x: cursor, y: rect.y, w: size, h: rect.h, peek: position !== focusPos })
    } else {
      rects.push({ index, x: rect.x, y: cursor, w: rect.w, h: size, peek: position !== focusPos })
    }
    cursor += size
  })
  return rects
}

function cellRect(rect, cols, rows, column, row, gapH, gapV) {
  const w = (rect.w - gapH * (cols - 1)) / cols
  const h = (rect.h - gapV * (rows - 1)) / rows
  return {
    x: rect.x + column * (w + gapH),
    y: rect.y + row * (h + gapV),
    w,
    h,
  }
}

export function arrangeFixed(count, rect, columns, rows, expand, gapH, gapV, padding, focusIndex) {
  const baseCols = Math.max(1, columns)
  const baseRows = Math.max(1, rows)
  const capacity = baseCols * baseRows
  let cols = baseCols
  let rowCount = baseRows
  if (count > capacity && expand === "columns") cols += Math.ceil((count - capacity) / baseRows)
  if (count > capacity && expand === "rows") rowCount += Math.ceil((count - capacity) / baseCols)

  const windows = []
  const cells = []
  const place = (index, column, row) => {
    windows.push({ index, ...cellRect(rect, cols, rowCount, column, row, gapH, gapV) })
  }

  if (expand === "accordion" && count > capacity) {
    for (let i = 0; i < capacity - 1; i++) place(i, i % baseCols, Math.floor(i / baseCols))
    for (let i = count; i < capacity - 1; i++) {
      cells.push({ ...cellRect(rect, baseCols, baseRows, i % baseCols, Math.floor(i / baseCols), gapH, gapV), empty: true })
    }
    const last = capacity - 1
    const lastRect = cellRect(rect, baseCols, baseRows, last % baseCols, Math.floor(last / baseCols), gapH, gapV)
    const overflow = []
    for (let i = capacity - 1; i < count; i++) overflow.push(i)
    const horizontal = lastRect.w >= lastRect.h
    windows.push(...arrangeAccordion(overflow, lastRect, overflow.includes(focusIndex) ? focusIndex : overflow.at(-1), padding, horizontal, 0))
    for (let i = 0; i < capacity - 1; i++) {
      if (i >= count) cells.push({ ...cellRect(rect, baseCols, baseRows, i % baseCols, Math.floor(i / baseCols), gapH, gapV), empty: true })
    }
    return { windows, cells }
  }

  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < cols; c++) cells.push({ ...cellRect(rect, cols, rowCount, c, r, gapH, gapV), empty: true })
  }

  const original = Math.min(count, capacity)
  for (let i = 0; i < original; i++) {
    const column = i % baseCols
    const row = Math.floor(i / baseCols)
    place(i, column, row)
    const cell = cells.find((item) => Math.abs(item.x - windows.at(-1).x) < 0.5 && Math.abs(item.y - windows.at(-1).y) < 0.5)
    if (cell) cell.empty = false
  }

  if (expand === "columns") {
    const holes = []
    for (let r = 0; r < baseRows; r++) {
      for (let c = baseCols; c < cols; c++) holes.push([c, r])
    }
    for (let extra = 0; extra < count - capacity; extra++) {
      const [column, row] = holes[extra]
      place(capacity + extra, column, row)
      const placed = windows.at(-1)
      const cell = cells.find((item) => Math.abs(item.x - placed.x) < 0.5 && Math.abs(item.y - placed.y) < 0.5)
      if (cell) cell.empty = false
    }
  } else if (expand === "rows") {
    const holes = []
    for (let r = baseRows; r < rowCount; r++) {
      for (let c = 0; c < baseCols; c++) holes.push([c, r])
    }
    for (let extra = 0; extra < count - capacity; extra++) {
      const [column, row] = holes[extra]
      place(capacity + extra, column, row)
      const placed = windows.at(-1)
      const cell = cells.find((item) => Math.abs(item.x - placed.x) < 0.5 && Math.abs(item.y - placed.y) < 0.5)
      if (cell) cell.empty = false
    }
  }

  return { windows, cells: cells.filter((cell) => cell.empty) }
}

function stackIn(area, indices, gapV, accordion, padding, focusIndex) {
  if (!indices.length) return []
  if (accordion) {
    const focus = indices.includes(focusIndex) ? focusIndex : indices[0]
    return arrangeAccordion(indices, area, focus, padding, false, gapV)
  }
  const gap = indices.length > 1 ? gapV : 0
  const height = (area.h - gap * (indices.length - 1)) / indices.length
  return indices.map((index, position) => ({
    index,
    x: area.x,
    y: area.y + position * (height + gap),
    w: area.w,
    h: height,
  }))
}

export function masterAssignment(count) {
  if (count <= 1) return { left: [], right: [] }
  if (count === 2) return { left: [], right: [1] }
  const left = []
  const right = [1]
  if (count >= 3) left.push(2)
  for (let index = 3; index < count; index++) {
    if (left.length < right.length) left.push(index)
    else right.push(index)
  }
  return { left, right }
}

export function arrangeMaster(count, rect, { size, side, gapH, gapV, accordion, padding, focus }) {
  if (count <= 0) return []
  if (count === 1) return [{ index: 0, ...rect, role: "master" }]
  const masterW = rect.w * size
  const stackW = Math.max(40, rect.w - masterW - gapH)
  const useCenter = side === "center" && count >= 3

  if (useCenter) {
    const { left, right } = masterAssignment(count)
    const sideW = Math.max(30, (rect.w - masterW - gapH * 2) / 2)
    const leftArea = { x: rect.x, y: rect.y, w: sideW, h: rect.h }
    const master = { x: rect.x + sideW + gapH, y: rect.y, w: masterW, h: rect.h }
    const rightArea = { x: master.x + masterW + gapH, y: rect.y, w: sideW, h: rect.h }
    return [
      { index: 0, ...master, role: "master" },
      ...stackIn(leftArea, left, gapV, accordion, padding, focus).map((item) => ({ ...item, role: "stack" })),
      ...stackIn(rightArea, right, gapV, accordion, padding, focus).map((item) => ({ ...item, role: "stack" })),
    ]
  }

  const masterOnRight = side === "right"
  const master = masterOnRight
    ? { x: rect.x + stackW + gapH, y: rect.y, w: masterW, h: rect.h }
    : { x: rect.x, y: rect.y, w: masterW, h: rect.h }
  const stackArea = masterOnRight
    ? { x: rect.x, y: rect.y, w: stackW, h: rect.h }
    : { x: rect.x + masterW + gapH, y: rect.y, w: stackW, h: rect.h }
  const stacked = Array.from({ length: count - 1 }, (_, index) => index + 1)
  return [
    { index: 0, ...master, role: "master" },
    ...stackIn(stackArea, stacked, gapV, accordion, padding, focus).map((item) => ({ ...item, role: "stack" })),
  ]
}

export function arrangeScrolling(count, content, tile, focus, fraction, gapH) {
  if (count <= 0) return []
  if (count === 1) return [{ index: 0, ...content }]
  const colW = Math.min(content.w, Math.max(48, content.w * fraction))
  const stride = colW + gapH
  const total = count * colW + (count - 1) * gapH
  if (total <= content.w + 0.5) {
    const origin = content.x + (content.w - total) / 2
    return Array.from({ length: count }, (_, index) => ({
      index,
      x: origin + index * stride,
      y: content.y,
      w: colW,
      h: content.h,
    }))
  }

  let scroll = 0
  const focusX = focus * stride
  if (focusX + colW > scroll + content.w) scroll = focusX + colW - content.w
  if (focusX < scroll) scroll = focusX

  const items = Array.from({ length: count }, (_, index) => {
    const x = content.x + index * stride - scroll
    const fully = x >= content.x - 0.5 && x + colW <= content.x + content.w + 0.5
    return { index, x, y: content.y, w: colW, h: content.h, fully }
  })

  const sliver = 25
  const left = items.filter((item) => !item.fully && item.index < focus).sort((a, b) => b.index - a.index)
  const right = items.filter((item) => !item.fully && item.index > focus).sort((a, b) => a.index - b.index)
  left.forEach((item, offset) => {
    item.x = tile.x + sliver - colW - offset * 14
    item.parked = "left"
  })
  right.forEach((item, offset) => {
    item.x = tile.x + tile.w - sliver + offset * 14
    item.parked = "right"
  })

  const visible = items.filter((item) => !item.parked)
  if (left.length && visible.length) {
    const minX = tile.x + sliver + gapH
    const shift = minX - Math.min(...visible.map((item) => item.x))
    if (shift > 0) {
      const focusItem = items[focus]
      const focusRight = focusItem.x + shift + focusItem.w
      if (focusRight <= content.x + content.w + 0.5) {
        for (const item of visible) item.x += shift
      }
    }
  }
  return items
}

export function arrangeFloating(count, rect) {
  const w = rect.w * 0.46
  const h = rect.h * 0.42
  return Array.from({ length: count }, (_, index) => ({
    index,
    x: rect.x + rect.w * 0.08 + index * 36,
    y: rect.y + rect.h * 0.08 + index * 28,
    w,
    h,
    floating: true,
  }))
}

export function centeredWidth(rect, fraction) {
  const width = rect.w * fraction
  return {
    x: rect.x + (rect.w - width) / 2,
    y: rect.y,
    w: width,
    h: rect.h,
  }
}

const NAMES = [
  ["Notes", "com.apple.Notes"],
  ["Mail", "com.apple.mail"],
  ["Calculator", "com.apple.calculator"],
  ["Terminal", "com.apple.Terminal"],
  ["Safari", "com.apple.Safari"],
  ["Calendar", "com.apple.iCal"],
]

export function cast(count) {
  return Array.from({ length: count }, (_, index) => {
    const [title, appId] = NAMES[index % NAMES.length]
    const suffix = index >= NAMES.length ? ` ${Math.floor(index / NAMES.length) + 1}` : ""
    return { id: `w${index + 1}`, title: title + suffix, appId, index }
  })
}

export function layoutWindows({
  layout,
  count,
  focus = 0,
  tile,
  gaps,
  columns = 2,
  rows = 2,
  expand = "columns",
  padding = 30,
  orientation = "auto",
  columnWidth = 0.49,
  masterSize = 0.6,
  masterSide = "left",
  stackAccordion = false,
  fullscreen = false,
  lone = false,
  widthFraction = 1,
}) {
  const content = contentRect(tile, gaps)
  const name = layout === "tiles" || layout === "dwindle" ? "dwindle" : layout
  let windows = []
  let cells = []
  const safeFocus = Math.max(0, Math.min(count - 1, focus))

  if (!count) return { windows, cells, content }

  if (lone || fullscreen || (count === 1 && (name === "dwindle" || name === "master" || name === "scrolling"))) {
    const fraction = count === 1 && !fullscreen ? widthFraction : fullscreen ? widthFraction : 1
    const only = count === 1 || fullscreen
    if (only) {
      const rect = fraction >= 0.999 ? content : centeredWidth(content, fraction)
      return {
        windows: [{ index: 0, ...rect }],
        cells,
        content,
      }
    }
  }

  if (name === "dwindle") windows = arrangeDwindle(count, content, gaps.innerH, gaps.innerV)
  else if (name === "accordion") {
    const horizontal = orientation === "keep" ? false : content.w >= content.h
    windows = arrangeAccordion(
      Array.from({ length: count }, (_, index) => index),
      content,
      safeFocus,
      padding,
      horizontal,
      gaps.innerH,
    )
  } else if (name === "fixed") {
    const placed = arrangeFixed(count, content, columns, rows, expand, gaps.innerH, gaps.innerV, padding, safeFocus)
    windows = placed.windows
    cells = placed.cells
  } else if (name === "master") {
    windows = arrangeMaster(count, content, {
      size: masterSize,
      side: masterSide,
      gapH: gaps.innerH,
      gapV: gaps.innerV,
      accordion: stackAccordion,
      padding,
      focus: safeFocus,
    })
  } else if (name === "scrolling") {
    windows = arrangeScrolling(count, content, tile, safeFocus, columnWidth, gaps.innerH)
  } else if (name === "floating") {
    windows = arrangeFloating(count, content)
  }

  return { windows, cells, content }
}
