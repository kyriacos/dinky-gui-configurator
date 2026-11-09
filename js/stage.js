import { DISPLAY } from "./layout.js"

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

function place(node, rect) {
  node.style.left = `${(rect.x / DISPLAY.w) * 100}%`
  node.style.top = `${(rect.y / DISPLAY.h) * 100}%`
  node.style.width = `${(rect.w / DISPLAY.w) * 100}%`
  node.style.height = `${(rect.h / DISPLAY.h) * 100}%`
}

function syncKeyed(parent, items, keyOf, create, update) {
  const wanted = new Set(items.map(keyOf))
  for (const child of [...parent.children]) {
    if (!wanted.has(child.dataset.key)) child.remove()
  }
  items.forEach((item, index) => {
    const key = keyOf(item)
    let node = [...parent.children].find((child) => child.dataset.key === key)
    if (!node) {
      node = create(item)
      node.dataset.key = key
      node.style.transition = "none"
      parent.append(node)
      requestAnimationFrame(() => {
        node.style.transition = ""
      })
    }
    update(node, item, index)
    const current = parent.children[index]
    if (current !== node) parent.insertBefore(node, current || null)
  })
}

function paintMenu(menu, monitor) {
  menu.replaceChildren()
  const left = el("div", "menu-side")
  left.append(el("span", "apple", ""), el("span", "menu-app", "Dinky"))
  if (monitor.note) left.append(el("span", "menu-note", monitor.note))
  const pills = el("div", "pills")
  for (const space of monitor.workspaces || []) {
    const pill = el("button", space.active ? "pill on" : "pill", String(space.label ?? space.id))
    pill.type = "button"
    pill.dataset.space = String(space.id)
    pills.append(pill)
  }
  menu.append(left, pills)
}

function paintDock(dock, monitor) {
  const items = monitor.dock
  dock.hidden = !items?.length
  if (!items?.length) return
  syncKeyed(
    dock,
    items,
    (item) => item.id,
    () => el("button", "dock-app"),
    (node, item) => {
      node.type = "button"
      node.dataset.dock = item.id
      node.className = item.active ? "dock-app on" : "dock-app"
      node.replaceChildren(el("span", `glyph g-${item.glyph || "note"}`), el("span", "dock-name", item.label))
      node.title = item.label
    },
  )
}

function paintWindows(layer, windows, config) {
  syncKeyed(
    layer,
    windows,
    (win) => win.id,
    () => {
      const win = el("div", "win")
      const title = el("div", "win-title")
      const lights = el("span", "lights")
      lights.append(el("i"), el("i"), el("i"))
      title.append(lights, el("span", "win-name"))
      win.append(title, el("div", "win-body"))
      return win
    },
    (node, win) => {
      place(node, win)
      node.className = "win" + (win.focused ? " is-focused" : "") + (win.floating ? " is-float" : "") + (win.dragging ? " dragging" : "") + (win.waiting ? " waiting" : "")
      node.dataset.win = win.id
      node.dataset.peek = win.peek ? "1" : "0"
      node.querySelector(".win-name").textContent = win.title
      const ring = win.borderless ? 0 : config.borders.width
      node.style.setProperty("--ring", `${(ring / DISPLAY.w) * 100}cqi`)
      node.style.setProperty("--bd", win.focused ? config.borders["active-color"] : config.borders["inactive-color"])
      node.dataset.order = config.borders.order
      node.style.zIndex = win.dragging ? "40" : win.floating ? "12" : win.focused ? "6" : "2"
      if (win.waiting) node.style.setProperty("--wait", `${win.waitMs || 100}ms`)
      const body = node.querySelector(".win-body")
      if (win.panel === "login") paintLogin(body, win.loginOn)
      else if (body.childElementCount) body.replaceChildren()
    },
  )
}

function paintLogin(body, on) {
  body.replaceChildren()
  const panel = el("div", "login-panel")
  panel.append(el("div", "login-head", "Login Items"))
  const row = el("label", "login-row")
  const box = el("input")
  box.type = "checkbox"
  box.dataset.login = "1"
  box.checked = on
  row.append(box, el("span", "login-name", "Dinky"), el("span", "login-kind", "Application"))
  const other = el("div", "login-row dim")
  other.append(el("span", "login-name", "Calendar"), el("span", "login-kind", "Application"))
  panel.append(row, other)
  body.append(panel)
}

function paintBoxes(layer, items, className) {
  syncKeyed(
    layer,
    items,
    (item, index) => item.id || `${className}-${index}`,
    () => el("div", className),
    (node, item) => {
      place(node, item)
      if (item.label) node.dataset.label = item.label
    },
  )
}

function paintOverlay(layer, overlay) {
  if (!overlay) {
    layer.replaceChildren()
    layer.dataset.kind = ""
    return
  }
  if (layer.dataset.kind !== overlay.kind) {
    layer.dataset.kind = overlay.kind
    layer.replaceChildren()
  }
  if (overlay.kind === "mission") paintMission(layer, overlay)
  else if (overlay.kind === "keyboard") paintKeyboard(layer, overlay)
  else if (overlay.kind === "trackpad") paintTrackpad(layer, overlay)
}

function paintMission(layer, overlay) {
  let board = layer.querySelector(".mission")
  if (!board) {
    board = el("div", "mission")
    layer.append(board)
  }
  const spaces = overlay.spaces
  const count = Math.max(1, spaces.length)
  const width = Math.min(22, (90 - (count - 1) * 1.4) / count)
  syncKeyed(
    board,
    spaces,
    (space) => String(space.token),
    () => {
      const card = el("div", "space-card")
      card.append(el("div", "space-num"), el("div", "space-desk"))
      return card
    },
    (card, space, index) => {
      card.dataset.token = String(space.token)
      card.classList.toggle("is-dragged", Boolean(space.dragged))
      card.querySelector(".space-num").textContent = String(space.num)
      const left = space.dragX != null ? space.dragX : 5 + index * (width + 1.4)
      card.style.left = `${left}%`
      card.style.width = `${width}%`
      const desk = card.querySelector(".space-desk")
      desk.replaceChildren()
      for (const mini of space.minis) {
        const block = el("div", "mini")
        block.style.left = `${mini[0] * 100}%`
        block.style.top = `${mini[1] * 100}%`
        block.style.width = `${mini[2] * 100}%`
        block.style.height = `${mini[3] * 100}%`
        desk.append(block)
      }
    },
  )
}

function paintKeyboard(layer, overlay) {
  let board = layer.querySelector(".keyboard")
  if (!board) {
    board = el("div", "keyboard")
    const row = el("div", "key-row")
    board.append(row, el("div", "key-output"))
    layer.append(board)
  }
  const row = board.querySelector(".key-row")
  syncKeyed(
    row,
    overlay.keys,
    (key) => key.id,
    () => el("button", "key"),
    (node, key) => {
      node.type = "button"
      node.dataset.keycap = key.id
      node.textContent = key.label
      node.className = "key" + (key.live ? " live" : "") + (key.pressed ? " pressed" : "")
    },
  )
  board.querySelector(".key-output").textContent = overlay.output || ""
}

function paintTrackpad(layer, overlay) {
  let pad = layer.querySelector(".trackpad")
  if (!pad) {
    pad = el("div", "trackpad")
    pad.append(el("div", "finger"), el("div", "pad-hint"))
    layer.append(pad)
  }
  const finger = pad.querySelector(".finger")
  finger.style.left = `${overlay.finger?.x ?? 50}%`
  finger.style.top = `${overlay.finger?.y ?? 50}%`
  pad.querySelector(".pad-hint").textContent = overlay.hint || "Drag across the trackpad"
  pad.classList.toggle("vertical", Boolean(overlay.vertical))
}

function ensureMonitor(parent) {
  let bezel = parent.querySelector(":scope > .bezel")
  if (!bezel) {
    parent.replaceChildren()
    bezel = el("div", "bezel")
    const screen = el("div", "screen")
    for (const name of ["cells", "ghosts", "windows", "overlay"]) screen.append(el("div", name))
    screen.append(el("div", "menu"), el("div", "dock"), el("div", "banner"))
    bezel.append(screen)
    parent.append(bezel, el("div", "mon-label"))
  }
  return bezel.querySelector(".screen")
}

export function paint(desk, model, { motion, config }) {
  desk.classList.toggle("two", model.monitors.length > 1)
  const monitors = [...desk.querySelectorAll(":scope > .monitor")]
  while (monitors.length < model.monitors.length) {
    const node = el("div", "monitor")
    desk.append(node)
    monitors.push(node)
  }
  while (monitors.length > model.monitors.length) monitors.pop().remove()

  model.monitors.forEach((monitor, index) => {
    const node = monitors[index]
    const screen = ensureMonitor(node)
    screen.style.setProperty("--move", `${motion}ms`)
    screen.dataset.scene = model.scene || ""
    node.querySelector(".mon-label").textContent = monitor.label || ""
    node.querySelector(".mon-label").hidden = !monitor.label
    paintBoxes(screen.querySelector(".cells"), monitor.cells || [], "cell")
    paintBoxes(screen.querySelector(".ghosts"), monitor.ghosts || [], "ghost")
    paintWindows(screen.querySelector(".windows"), monitor.windows || [], config)
    paintMenu(screen.querySelector(".menu"), monitor)
    paintDock(screen.querySelector(".dock"), monitor)
    const banner = screen.querySelector(".banner")
    banner.hidden = !monitor.banner
    banner.textContent = monitor.banner || ""
    paintOverlay(screen.querySelector(".overlay"), monitor.overlay)
  })
}
