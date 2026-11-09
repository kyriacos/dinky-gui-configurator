import { parseToml, normalizeConfig, serializeConfig, configWarnings, LAYOUTS } from "./toml.js"
import { DISPLAY } from "./layout.js"
import { paint } from "./stage.js"
import { freshDemo, stageModel, motionMs, ruleSamples, previewRule, pressBinding } from "./scenes.js"

const $ = (id) => document.getElementById(id)
let config = normalizeConfig({})
const ui = {
  selected: "default-layout",
  demos: {},
  path: "~/.config/dinky/dinky.toml",
  snapshot: "",
  actionSig: "",
  playTimer: 0,
  spaceTimer: 0,
  heldMod: "",
  lastModel: null,
}

const KEY_FROM_CODE = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  Minus: "minus",
  Equal: "equal",
  BracketLeft: "left-bracket",
  BracketRight: "right-bracket",
  Backslash: "backslash",
  Semicolon: "semicolon",
  Quote: "quote",
  Comma: "comma",
  Period: "period",
  Slash: "slash",
  Backquote: "backtick",
  Space: "space",
  Enter: "enter",
  Escape: "esc",
  Backspace: "backspace",
  Tab: "tab",
  PageUp: "page-up",
  PageDown: "page-down",
  Home: "home",
  End: "end",
  Delete: "forward-delete",
}

function keyName(event) {
  if (KEY_FROM_CODE[event.code]) return KEY_FROM_CODE[event.code]
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5)
  if (/^F([1-9]|1[0-9]|20)$/.test(event.key)) return event.key.toLowerCase()
  return null
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

function button(label, className) {
  const node = el("button", className || "mini-btn", label)
  node.type = "button"
  return node
}

function sceneOf(id) {
  return SETTINGS.find((item) => item.id === id)?.scene || "layout"
}

function demoFor(scene) {
  if (!ui.demos[scene]) ui.demos[scene] = freshDemo(scene, config)
  return ui.demos[scene]
}

function setStatus(text, bad = false) {
  const node = $("status")
  node.textContent = text
  node.classList.toggle("bad", bad)
}

function dirty() {
  return JSON.stringify(config) !== ui.snapshot
}

function syncValues() {
  for (const setting of SETTINGS) {
    const node = document.querySelector(`[data-value="${setting.id}"]`)
    if (node) node.textContent = setting.value(config)
  }
  const ffm = document.querySelector('[data-bind="ffm"]')
  if (ffm) ffm.checked = config["focus-follows-mouse"].enabled
  const swipe = document.querySelector('[data-bind="swipe"]')
  if (swipe) swipe.checked = config.swipe.enabled
  const login = document.querySelector('[data-bind="login"]')
  if (login) login.checked = config["start-at-login"]
}

function renderWarnings(extra = []) {
  const warnings = [...configWarnings(config), ...extra]
  const host = $("warnings")
  host.replaceChildren()
  for (const warning of warnings) host.append(el("p", "", warning))
  return warnings
}

function renderLive() {
  const scene = sceneOf(ui.selected)
  const demo = demoFor(scene)
  if (scene === "space-order" && demo.tokens?.length !== Math.min(config.workspaces, 12)) {
    ui.demos[scene] = freshDemo(scene, config)
  }
  const model = stageModel(config, scene, demoFor(scene))
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  paint($("desk"), model, { motion: reduce ? 0 : motionMs(config), config })
  $("caption").textContent = model.caption
  const toml = serializeConfig(config)
  $("toml").textContent = toml
  renderWarnings()
  syncValues()
  const signature = model.actions.map((action) => `${action.id}:${action.label}:${action.pressed ? 1 : 0}`).join("|")
  if (signature !== ui.actionSig) {
    ui.actionSig = signature
    const host = $("actions")
    host.replaceChildren()
    for (const action of model.actions) {
      const node = button(action.label, action.pressed ? "btn on" : "btn")
      node.addEventListener("click", () => onAction(action.id))
      host.append(node)
    }
  }
  ui.lastModel = model
  $("write").disabled = renderWarnings().length > 0
}

function select(id) {
  if (!SETTINGS.some((item) => item.id === id)) id = "default-layout"
  ui.selected = id
  history.replaceState(null, "", `#${id}`)
  clearInterval(ui.playTimer)
  ui.actionSig = ""
  buildRail()
  renderLive()
  if (id === "follow-space-order") settleSpacesSoon()
}

function commit() {
  renderLive()
}

function slider(parent, { min, max, step, value, format, onInput }) {
  const label = el("label", "slider")
  const input = document.createElement("input")
  input.type = "range"
  input.min = String(min)
  input.max = String(Math.max(max, value))
  input.step = String(step)
  input.value = String(value)
  const read = el("span", "slider-read", format(value))
  input.addEventListener("input", () => {
    const number = Number(input.value)
    read.textContent = format(number)
    onInput(number)
  })
  label.append(input, read)
  parent.append(label)
}

function segments(parent, options, current, onChange) {
  const wrap = el("div", "segments")
  wrap.setAttribute("role", "radiogroup")
  for (const option of options) {
    const node = button(option.label, option.id === current ? "on" : "")
    node.dataset.value = option.id
    node.setAttribute("role", "radio")
    node.setAttribute("aria-checked", String(option.id === current))
    node.addEventListener("click", () => {
      for (const child of wrap.children) {
        const on = child.dataset.value === option.id
        child.classList.toggle("on", on)
        child.setAttribute("aria-checked", String(on))
      }
      onChange(option.id)
    })
    wrap.append(node)
  }
  parent.append(wrap)
}

function toggle(parent, text, checked, onChange, bind) {
  const label = el("label", "check")
  const input = document.createElement("input")
  input.type = "checkbox"
  input.checked = checked
  if (bind) input.dataset.bind = bind
  input.addEventListener("change", () => onChange(input.checked))
  label.append(input, document.createTextNode(text))
  parent.append(label)
}

function field(parent, label, control) {
  const wrap = el("label", "field")
  wrap.append(el("span", "", label), control)
  parent.append(wrap)
  return control
}

function tags(parent, values, onChange, placeholder) {
  const wrap = el("div", "tag-list")
  const draw = () => {
    wrap.replaceChildren()
    values.forEach((value, index) => {
      const node = button(`${value} ×`, "tag")
      node.addEventListener("click", () => {
        values.splice(index, 1)
        onChange([...values])
        draw()
      })
      wrap.append(node)
    })
    const input = document.createElement("input")
    input.type = "text"
    input.placeholder = placeholder
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return
      const next = input.value.trim()
      if (!next) return
      event.preventDefault()
      values.push(next)
      onChange([...values])
      draw()
    })
    wrap.append(input)
  }
  draw()
  parent.append(wrap)
}

function colorField(parent, value, onChange) {
  const rgb = value.slice(0, 7)
  const alpha = value.length === 9 ? parseInt(value.slice(7), 16) / 255 : 1
  const row = el("div", "color-row")
  const picker = document.createElement("input")
  picker.type = "color"
  picker.value = rgb
  const text = document.createElement("input")
  text.type = "text"
  text.value = value
  const emit = (hex, opacity) => {
    const clamped = Math.round(Math.min(1, Math.max(0, opacity)) * 255)
    const next = clamped >= 255 ? hex : `${hex}${clamped.toString(16).padStart(2, "0")}`
    text.value = next
    onChange(next)
  }
  picker.addEventListener("input", () => emit(picker.value, alphaOf(text.value)))
  text.addEventListener("change", () => {
    if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(text.value)) {
      picker.value = text.value.slice(0, 7)
      onChange(text.value)
    } else text.value = value
  })
  row.append(picker, text)
  parent.append(row)
  slider(parent, {
    min: 0,
    max: 100,
    step: 1,
    value: Math.round(alpha * 100),
    format: (number) => `${number}%`,
    onInput: (number) => emit(picker.value, number / 100),
  })
}

function alphaOf(value) {
  return value.length === 9 ? parseInt(value.slice(7), 16) / 255 : 1
}

function gapNumber(value, fallback = 8) {
  return typeof value === "number" ? value : fallback
}

function followState() {
  const follow = config["follow-app-activation"]
  if (typeof follow === "boolean") return { enabled: follow, "exclude-apps": [] }
  return { enabled: follow.enabled !== false, "exclude-apps": [...(follow["exclude-apps"] || [])] }
}

function setFollow(enabled, apps) {
  config["follow-app-activation"] = apps.length ? { enabled, "exclude-apps": apps } : enabled
}

function layoutLabel(name) {
  if (name === "tiles") return "Tiles"
  return name[0].toUpperCase() + name.slice(1)
}

const LAYOUT_OPTIONS = LAYOUTS.map((id) => ({ id, label: layoutLabel(id) }))

function mountLayout(body) {
  segments(body, LAYOUT_OPTIONS, config["default-layout"], (value) => {
    config["default-layout"] = value
    commit()
  })
}

function mountWorkspace(body) {
  const holder = el("div", "stack")
  body.append(holder)
  const draw = () => {
    holder.replaceChildren()
    const total = config.workspaces
    const demo = demoFor("workspace")
    demo.id = Math.min(Math.max(1, demo.id || 1), total)
    const select = document.createElement("select")
    for (let id = 1; id <= total; id++) {
      const option = el("option", "", `Workspace ${id}`)
      option.value = String(id)
      select.append(option)
    }
    select.value = String(demo.id)
    select.addEventListener("change", () => {
      demo.id = Number(select.value)
      draw()
      commit()
    })
    field(holder, "Workspace", select)
    const entry = config.workspace[String(demo.id)] || {}
    const tiling = entry.tiling
    segments(
      holder,
      [
        { id: "default", label: "Default" },
        { id: "on", label: "Tiled" },
        { id: "off", label: "Not tiled" },
      ],
      tiling == null ? "default" : tiling ? "on" : "off",
      (value) => {
        const row = ensureWorkspace(demo.id)
        if (value === "default") delete row.tiling
        else row.tiling = value === "on"
        pruneWorkspace(demo.id)
        commit()
      },
    )
    const layout = entry.layout || "default"
    segments(holder, [{ id: "default", label: "Default" }, ...LAYOUT_OPTIONS], layout, (value) => {
      const row = ensureWorkspace(demo.id)
      if (value === "default") {
        delete row.layout
        delete row.columns
        delete row.rows
        delete row.expand
      } else {
        row.layout = value
        if (value === "fixed") {
          row.columns = row.columns || 2
          row.rows = row.rows || 2
          row.expand = row.expand || "columns"
        } else {
          delete row.columns
          delete row.rows
          delete row.expand
        }
      }
      pruneWorkspace(demo.id)
      draw()
      commit()
    })
    if ((entry.layout || config["default-layout"]) === "fixed" && entry.layout === "fixed") {
      slider(holder, {
        min: 1,
        max: 6,
        step: 1,
        value: entry.columns || 1,
        format: (number) => `${number} col`,
        onInput: (number) => {
          ensureWorkspace(demo.id).columns = number
          commit()
        },
      })
      slider(holder, {
        min: 1,
        max: 6,
        step: 1,
        value: entry.rows || 1,
        format: (number) => `${number} row`,
        onInput: (number) => {
          ensureWorkspace(demo.id).rows = number
          commit()
        },
      })
      segments(
        holder,
        [
          { id: "columns", label: "Add columns" },
          { id: "rows", label: "Add rows" },
          { id: "accordion", label: "Accordion" },
        ],
        entry.expand || "columns",
        (value) => {
          ensureWorkspace(demo.id).expand = value
          commit()
        },
      )
    }
    const displays = entry.display || {}
    holder.append(el("p", "hint", "On one display"))
    for (const [pattern, sub] of Object.entries(displays)) {
      const card = el("div", "card")
      const input = document.createElement("input")
      input.type = "text"
      input.value = pattern
      input.addEventListener("change", () => {
        const name = input.value.trim()
        if (!name || name === pattern) return
        const row = ensureWorkspace(demo.id)
        row.display[name] = sub
        delete row.display[pattern]
        demo.pattern = name
        draw()
        commit()
      })
      card.append(input)
      segments(card, LAYOUT_OPTIONS, sub.layout || entry.layout || config["default-layout"], (value) => {
        sub.layout = value
        commit()
      })
      const remove = button("Remove display override")
      remove.addEventListener("click", () => {
        delete ensureWorkspace(demo.id).display[pattern]
        pruneWorkspace(demo.id)
        draw()
        commit()
      })
      card.append(remove)
      holder.append(card)
    }
    const addRow = el("div", "row-actions")
    const pattern = document.createElement("input")
    pattern.type = "text"
    pattern.placeholder = "built-in"
    const add = button("Add display")
    add.addEventListener("click", () => {
      const name = pattern.value.trim()
      if (!name) return
      const row = ensureWorkspace(demo.id)
      row.display = row.display || {}
      row.display[name] = { layout: "accordion" }
      demo.pattern = name
      draw()
      commit()
    })
    addRow.append(pattern, add)
    holder.append(addRow)
  }
  draw()
}

function ensureWorkspace(id) {
  const key = String(id)
  config.workspace[key] = config.workspace[key] || {}
  return config.workspace[key]
}

function pruneWorkspace(id) {
  const key = String(id)
  const row = config.workspace[key]
  if (!row) return
  if (row.display && !Object.keys(row.display).length) delete row.display
  if (!Object.keys(row).length) delete config.workspace[key]
}

function mountPlacement(body) {
  const holder = el("div", "stack")
  body.append(holder)
  const draw = () => {
    holder.replaceChildren()
    const entries = Object.entries(config["workspace-to-display"])
    if (!entries.length) holder.append(el("p", "hint", "No workspace is pinned to a display."))
    for (const [id, pattern] of entries) {
      const card = el("div", "card")
      const select = document.createElement("select")
      for (let number = 1; number <= config.workspaces; number++) {
        const option = el("option", "", String(number))
        option.value = String(number)
        select.append(option)
      }
      select.value = id
      const input = document.createElement("input")
      input.type = "text"
      input.value = Array.isArray(pattern) ? pattern.join(", ") : pattern
      const apply = () => {
        const next = { ...config["workspace-to-display"] }
        delete next[id]
        const text = input.value.split(",").map((part) => part.trim()).filter(Boolean)
        if (text.length === 1) next[select.value] = text[0]
        else if (text.length > 1) next[select.value] = text
        config["workspace-to-display"] = next
        draw()
        commit()
      }
      select.addEventListener("change", apply)
      input.addEventListener("change", apply)
      const remove = button("Remove")
      remove.addEventListener("click", () => {
        delete config["workspace-to-display"][id]
        draw()
        commit()
      })
      card.append(select, input, remove)
      holder.append(card)
    }
    const add = button("Pin a workspace to secondary")
    add.addEventListener("click", () => {
      const id = String(Math.min(5, config.workspaces))
      config["workspace-to-display"][id] = "secondary"
      draw()
      commit()
    })
    holder.append(add)
  }
  draw()
}

function mountDisplays(body) {
  const holder = el("div", "stack")
  body.append(holder)
  const draw = () => {
    holder.replaceChildren()
    const names = ["main", ...Object.keys(config.display).filter((name) => name !== "main")]
    const demo = demoFor("displays")
    if (!names.includes(demo.pattern)) demo.pattern = "main"
    const select = document.createElement("select")
    for (const name of names) select.append(new Option(name, name))
    select.value = demo.pattern
    select.addEventListener("change", () => {
      demo.pattern = select.value
      draw()
      commit()
    })
    field(holder, "Display", select)
    const name = demo.pattern
    const resolved = resolvedOuter(name)
    for (const side of ["top", "bottom", "left", "right"]) {
      slider(holder, {
        min: 0,
        max: Math.max(80, resolved[side]),
        step: 1,
        value: resolved[side],
        format: (number) => `${side} ${number}`,
        onInput: (number) => {
          const display = config.display[name] || (config.display[name] = {})
          const gaps = display.gaps || (display.gaps = {})
          const outer = typeof gaps.outer === "object" && gaps.outer ? { ...gaps.outer } : {}
          outer[side] = number
          gaps.outer = outer
          commit()
        },
      })
    }
    const customWidth = config.display[name]?.["fullscreen-width"]
    slider(holder, {
      min: 10,
      max: 100,
      step: 1,
      value: Math.round((customWidth ?? config["fullscreen-width"]) * 100),
      format: (number) => `fullscreen ${number}%`,
      onInput: (number) => {
        const display = config.display[name] || (config.display[name] = {})
        display["fullscreen-width"] = number / 100
        demo.count = 1
        commit()
      },
    })
    if (name !== "main") {
      const remove = button("Remove this display")
      remove.addEventListener("click", () => {
        delete config.display[name]
        demo.pattern = "main"
        draw()
        commit()
      })
      holder.append(remove)
    }
    const add = button("Add a display")
    const input = document.createElement("input")
    input.type = "text"
    input.placeholder = "DELL U3421WE"
    add.addEventListener("click", () => {
      const pattern = input.value.trim()
      if (!pattern) return
      config.display[pattern] = config.display[pattern] || {}
      demo.pattern = pattern
      draw()
      commit()
    })
    holder.append(input, add)
  }
  draw()
}

function resolvedOuter(name) {
  const base = config.gaps.outer
  const sides = typeof base === "number"
    ? { top: base, right: base, bottom: base, left: base }
    : { top: base.top, right: base.right, bottom: base.bottom, left: base.left }
  const over = config.display[name]?.gaps?.outer
  if (typeof over === "number") return { top: over, right: over, bottom: over, left: over }
  if (over && typeof over === "object") {
    for (const side of ["top", "right", "bottom", "left"]) if (over[side] != null) sides[side] = over[side]
  }
  return sides
}

function mountRules(body) {
  const holder = el("div", "stack")
  body.append(holder)
  const draw = () => {
    holder.replaceChildren()
    config.rules.forEach((rule, index) => {
      const card = el("div", "card")
      card.append(el("strong", "", `Rule ${index + 1}`))
      for (const key of ["app-id", "app-name", "title", "kind"]) {
        const input = document.createElement("input")
        input.type = "text"
        input.placeholder = key
        input.value = rule[key] || ""
        input.addEventListener("change", () => {
          if (input.value.trim()) rule[key] = input.value.trim()
          else delete rule[key]
          commit()
        })
        card.append(input)
      }
      const run = document.createElement("textarea")
      run.value = Array.isArray(rule.run) ? rule.run.join("\n") : rule.run || ""
      run.addEventListener("change", () => {
        const lines = run.value.split("\n").map((line) => line.trim()).filter(Boolean)
        rule.run = lines.length <= 1 ? lines[0] || "" : lines
        commit()
      })
      card.append(run)
      const actions = el("div", "row-actions")
      const remove = button("Remove")
      remove.addEventListener("click", () => {
        config.rules.splice(index, 1)
        draw()
        commit()
      })
      const up = button("Up")
      up.addEventListener("click", () => {
        if (index === 0) return
        ;[config.rules[index - 1], config.rules[index]] = [config.rules[index], config.rules[index - 1]]
        draw()
        commit()
      })
      actions.append(up, remove)
      card.append(actions)
      holder.append(card)
    })
    const add = button("Add a rule")
    add.addEventListener("click", () => {
      config.rules.push({ "app-id": "com.example.app", run: "layout floating" })
      draw()
      commit()
    })
    holder.append(add)
  }
  draw()
}

function mountBindings(body) {
  const holder = el("div", "stack")
  body.append(holder)
  const draw = () => {
    holder.replaceChildren()
    const demo = demoFor("bindings")
    const names = Object.keys(config.mode)
    if (!names.includes(demo.mode)) demo.mode = names[0] || "main"
    const select = document.createElement("select")
    for (const name of names) select.append(new Option(name, name))
    select.value = demo.mode
    select.addEventListener("change", () => {
      demo.mode = select.value
      draw()
      commit()
    })
    field(holder, "Mode", select)
    const table = config.mode[demo.mode] || {}
    for (const [combo, command] of Object.entries(table)) {
      const card = el("div", "card")
      const key = document.createElement("input")
      key.type = "text"
      key.value = combo
      const run = document.createElement("textarea")
      run.value = Array.isArray(command) ? command.join("\n") : command
      const save = () => {
        const next = key.value.trim()
        if (!next) return
        const lines = run.value.split("\n").map((line) => line.trim()).filter(Boolean)
        const value = lines.length <= 1 ? lines[0] || "" : lines
        if (next !== combo) delete table[combo]
        table[next] = value
        commit()
        if (next !== combo) draw()
      }
      key.addEventListener("change", save)
      run.addEventListener("change", save)
      const row = el("div", "row-actions")
      const press = button("Press")
      press.addEventListener("click", () => {
        pressBinding(config, demo, combo)
        commit()
      })
      const remove = button("Remove")
      remove.addEventListener("click", () => {
        delete table[combo]
        draw()
        commit()
      })
      row.append(press, remove)
      card.append(key, run, row)
      holder.append(card)
    }
    const add = button("Add a binding")
    add.addEventListener("click", () => {
      config.mode[demo.mode] = table
      table["alt-a"] = "focus left"
      draw()
      commit()
    })
    holder.append(add)
  }
  draw()
}

function mountHooks(body) {
  const names = ["startup", "workspace-changing", "workspace-changed", "focus-changed", "mode-changed", "display-changed"]
  for (const name of names) {
    const input = document.createElement("textarea")
    input.placeholder = name
    input.value = (config.hooks[name] || []).join("\n")
    field(body, name, input)
    input.addEventListener("change", () => {
      const lines = input.value.split("\n").map((line) => line.trim()).filter(Boolean)
      if (lines.length) config.hooks[name] = lines
      else delete config.hooks[name]
      commit()
    })
  }
}

const SETTINGS = [
  { id: "default-layout", group: "Layout", scene: "layout", label: "Default layout", hint: "Where a new window goes when a workspace doesn't choose its own layout. Tiles is dwindle.", value: (c) => layoutLabel(c["default-layout"]), mount: mountLayout },
  { id: "default-tiling", group: "Layout", scene: "tiling", label: "Tile by default", hint: "Off leaves every workspace floating until one of them opts in.", value: (c) => (c["default-tiling"] ? "On" : "Off"), mount: (body) => toggle(body, "Tile new windows", config["default-tiling"], (on) => { config["default-tiling"] = on; commit() }) },
  { id: "accordion-padding", group: "Layout", scene: "accordion", label: "Accordion peek", hint: "How far a neighbour sticks out, in points. It shrinks when the space gets tight.", value: (c) => `${c.accordion.padding} pt`, mount: (body) => slider(body, { min: 0, max: 120, step: 1, value: config.accordion.padding, format: (n) => `${n} pt`, onInput: (n) => { config.accordion.padding = n; commit() } }) },
  { id: "accordion-orientation", group: "Layout", scene: "accordion", label: "Accordion direction", hint: "Auto follows the longer side when a container becomes an accordion. Keep leaves the direction it already had.", value: (c) => c.accordion.orientation, mount: (body) => segments(body, [{ id: "auto", label: "Auto" }, { id: "keep", label: "Keep" }], config.accordion.orientation, (value) => { config.accordion.orientation = value; commit() }) },
  { id: "scrolling-column", group: "Layout", scene: "scrolling", label: "Column width", hint: "A new scrolling column's share of the screen. A column by itself still fills the display.", value: (c) => `${Math.round(c.scrolling["column-width"] * 100)}%`, mount: (body) => slider(body, { min: 10, max: 100, step: 1, value: Math.round(config.scrolling["column-width"] * 100), format: (n) => `${n}%`, onInput: (n) => { config.scrolling["column-width"] = n / 100; commit() } }) },
  { id: "master-size", group: "Layout", scene: "master", label: "Master size", hint: "The master's share of the screen while other windows are stacked beside it.", value: (c) => `${Math.round(c.master.size * 100)}%`, mount: (body) => slider(body, { min: 10, max: 90, step: 1, value: Math.round(config.master.size * 100), format: (n) => `${n}%`, onInput: (n) => { config.master.size = n / 100; commit() } }) },
  { id: "master-side", group: "Layout", scene: "master", label: "Master side", hint: "Center waits until two windows are stacked, then puts the master in the middle.", value: (c) => c.master.side, mount: (body) => segments(body, [{ id: "left", label: "Left" }, { id: "right", label: "Right" }, { id: "center", label: "Center" }], config.master.side, (value) => { config.master.side = value; commit() }) },
  { id: "gaps-inner", group: "Spacing", scene: "gaps", label: "Inner gap", hint: "Space between tiled windows.", value: (c) => (typeof c.gaps.inner === "number" ? `${c.gaps.inner} pt` : `${c.gaps.inner.horizontal} / ${c.gaps.inner.vertical}`), mount: mountInner },
  { id: "gaps-outer", group: "Spacing", scene: "gaps", label: "Outer gap", hint: "Space between the tiles and the screen edge.", value: (c) => (typeof c.gaps.outer === "number" ? `${c.gaps.outer} pt` : "Per side"), mount: mountOuter },
  { id: "fullscreen-width", group: "Spacing", scene: "fullscreen", label: "Fullscreen width", hint: "How much of the width a fullscreen window takes, centred. A lone window uses this too unless lone width is set.", value: (c) => `${Math.round(c["fullscreen-width"] * 100)}%`, mount: (body) => slider(body, { min: 10, max: 100, step: 1, value: Math.round(config["fullscreen-width"] * 100), format: (n) => `${n}%`, onInput: (n) => { config["fullscreen-width"] = n / 100; commit() } }) },
  { id: "lone-window-width", group: "Spacing", scene: "lone", label: "Lone window width", hint: "The centred width of a window that is alone on a workspace. Leave it unset to follow fullscreen width.", value: (c) => (c["lone-window-width"] == null ? "Same as fullscreen" : `${Math.round(c["lone-window-width"] * 100)}%`), mount: mountLone },
  { id: "workspaces", group: "Workspaces", scene: "workspaces", label: "Workspaces", hint: "How many Spaces dinky keeps, across all displays.", value: (c) => String(c.workspaces), mount: (body) => slider(body, { min: 1, max: 12, step: 1, value: Math.min(config.workspaces, 12), format: (n) => String(n), onInput: (n) => { config.workspaces = n; const demo = demoFor("workspaces"); demo.current = Math.min(demo.current || 1, n); commit() } }) },
  { id: "follow-space-order", group: "Workspaces", scene: "space-order", label: "Follow Space order", hint: "What happens after you drag Spaces around in Mission Control.", value: (c) => (c["follow-space-order"] ? "Renumber" : "Keep numbers"), mount: (body) => toggle(body, "Renumber workspaces to match Space order", config["follow-space-order"], (on) => { config["follow-space-order"] = on; reshuffleSpaces(); commit() }) },
  { id: "workspace-layout", group: "Workspaces", scene: "workspace", label: "Per workspace", hint: "Override tiling and layout for one workspace, including while it sits on a particular display.", value: (c) => { const ids = Object.keys(c.workspace); return ids.length ? `ws ${ids.join(", ")}` : "None" }, mount: mountWorkspace },
  { id: "workspace-to-display", group: "Workspaces", scene: "placement", label: "Workspace display", hint: "Which display a workspace lives on. secondary is the other screen when two are connected. A list tries each name in turn.", value: (c) => (Object.keys(c["workspace-to-display"]).length ? `${Object.keys(c["workspace-to-display"]).length} pinned` : "All on main"), mount: mountPlacement },
  { id: "displays", group: "Workspaces", scene: "displays", label: "Per display", hint: "Gaps and widths for one display. A name matches part of what dinky list-displays prints.", value: (c) => (Object.keys(c.display).length ? Object.keys(c.display).join(", ") : "None"), mount: mountDisplays },
  { id: "float-without", group: "Windows", scene: "float", label: "Float windows that can't fullscreen", hint: "Progress windows, About This Mac, Calculator. Dialogs float either way. A layout tiling rule can still tile one.", value: (c) => (c["float-windows-without-fullscreen"] ? "Float" : "Tile them"), mount: (body) => toggle(body, "Float windows that can't go fullscreen", config["float-windows-without-fullscreen"], (on) => { config["float-windows-without-fullscreen"] = on; commit() }) },
  { id: "border-enabled", group: "Windows", scene: "borders", label: "Borders", hint: "Draw dinky's border around managed windows.", value: (c) => (c.borders.enabled ? "On" : "Off"), mount: (body) => toggle(body, "Draw borders", config.borders.enabled, (on) => { config.borders.enabled = on; commit() }) },
  { id: "border-width", group: "Windows", scene: "borders", label: "Border width", hint: "Points. Fractions are allowed.", value: (c) => `${c.borders.width} pt`, mount: (body) => slider(body, { min: 0, max: 20, step: 0.5, value: config.borders.width, format: (n) => `${n} pt`, onInput: (n) => { config.borders.width = n; commit() } }) },
  { id: "border-active", group: "Windows", scene: "borders", label: "Active colour", hint: "The focused window. Use 8 digits to include transparency.", value: (c) => c.borders["active-color"], mount: (body) => colorField(body, config.borders["active-color"], (value) => { config.borders["active-color"] = value; commit() }) },
  { id: "border-inactive", group: "Windows", scene: "borders", label: "Inactive colour", hint: "Every window that isn't focused. Fully transparent leaves only the focused border.", value: (c) => c.borders["inactive-color"], mount: (body) => colorField(body, config.borders["inactive-color"], (value) => { config.borders["inactive-color"] = value; commit() }) },
  { id: "border-order", group: "Windows", scene: "borders", label: "Border order", hint: "Below sits behind the window. Above draws a ring over its edge that doesn't take clicks.", value: (c) => c.borders.order, mount: (body) => segments(body, [{ id: "below", label: "Below" }, { id: "above", label: "Above" }], config.borders.order, (value) => { config.borders.order = value; commit() }) },
  { id: "border-exclude", group: "Windows", scene: "borders", label: "Border exceptions", hint: "Bundle IDs that get no border. Calculator in this preview is com.apple.calculator.", value: (c) => (c.borders["exclude-apps"].length ? String(c.borders["exclude-apps"].length) : "None"), mount: (body) => tags(body, config.borders["exclude-apps"], (values) => { config.borders["exclude-apps"] = values; commit() }, "com.apple.calculator") },
  { id: "follow-app", group: "Windows", scene: "follow-app", label: "Follow app activation", hint: "Cmd-Tab and Dock clicks switch to that app's Space. Mail in this preview is com.apple.mail.", value: (c) => { const s = typeof c["follow-app-activation"] === "boolean" ? { enabled: c["follow-app-activation"], apps: [] } : c["follow-app-activation"]; return s.enabled ? (s["exclude-apps"]?.length ? `On, ${s["exclude-apps"].length} excluded` : "On") : "Off" }, mount: mountFollow },
  { id: "ffm-enabled", group: "Motion", scene: "ffm", label: "Focus follows mouse", hint: "The window under the pointer takes focus once the pointer has rested.", value: (c) => (c["focus-follows-mouse"].enabled ? "On" : "Off"), mount: (body) => toggle(body, "Focus the window under the pointer", config["focus-follows-mouse"].enabled, (on) => { config["focus-follows-mouse"].enabled = on; commit() }, "ffm") },
  { id: "ffm-delay", group: "Motion", scene: "ffm", label: "Focus delay", hint: "How long the pointer must rest. Zero focuses as soon as it arrives.", value: (c) => `${c["focus-follows-mouse"]["delay-ms"]} ms`, mount: (body) => slider(body, { min: 0, max: 1000, step: 10, value: config["focus-follows-mouse"]["delay-ms"], format: (n) => `${n} ms`, onInput: (n) => { config["focus-follows-mouse"]["delay-ms"] = n; commit() } }) },
  { id: "ffm-edges", group: "Motion", scene: "ffm", label: "Accordion edges", hint: "Whether resting on a peeking accordion edge focuses that window.", value: (c) => (c["focus-follows-mouse"]["accordion-edges"] ? "Peeks focus" : "Peeks ignored"), mount: (body) => toggle(body, "Focus a window from its peeking edge", config["focus-follows-mouse"]["accordion-edges"], (on) => { config["focus-follows-mouse"]["accordion-edges"] = on; commit() }) },
  { id: "swipe-enabled", group: "Motion", scene: "swipe", label: "Swipe focuses windows", hint: "The trackpad gesture that changes Spaces focuses the next tiled window first.", value: (c) => (c.swipe.enabled ? "On" : "Off"), mount: (body) => toggle(body, "Sideways swipes move focus", config.swipe.enabled, (on) => { config.swipe.enabled = on; commit() }, "swipe") },
  { id: "swipe-switch", group: "Motion", scene: "swipe", label: "Swipe past the edge", hint: "Instant changes Space only after the last window, when your fingers lift. Native lets macOS see the whole swipe.", value: (c) => c.swipe["space-switch"], mount: (body) => segments(body, [{ id: "instant", label: "Instant" }, { id: "native", label: "Native" }], config.swipe["space-switch"], (value) => { config.swipe["space-switch"] = value; commit() }) },
  { id: "swipe-vertical", group: "Motion", scene: "swipe", label: "Vertical swipe", hint: "Up and down also move focus. They always pass the gesture to macOS, so Mission Control can open too.", value: (c) => (c.swipe.vertical ? "On" : "Off"), mount: (body) => toggle(body, "Swipes up and down move focus", config.swipe.vertical, (on) => { config.swipe.vertical = on; commit() }) },
  { id: "anim-enabled", group: "Motion", scene: "motion", label: "Animations", hint: "Windows glide into their tiles. macOS Reduce Motion turns this off.", value: (c) => (c.animations.enabled ? "Glide" : "Jump"), mount: (body) => toggle(body, "Glide windows into place", config.animations.enabled, (on) => { config.animations.enabled = on; demoFor("motion").alt = !demoFor("motion").alt; commit() }) },
  { id: "anim-duration", group: "Motion", scene: "motion", label: "Animation duration", hint: "Roughly how long a window takes to arrive. Zero jumps.", value: (c) => `${c.animations["duration-ms"]} ms`, mount: (body) => slider(body, { min: 0, max: 1000, step: 10, value: config.animations["duration-ms"], format: (n) => `${n} ms`, onInput: (n) => { config.animations["duration-ms"] = n; demoFor("motion").alt = !demoFor("motion").alt; commit() } }) },
  { id: "drag-placeholders", group: "Motion", scene: "drag", label: "Drag outlines", hint: "While a tiled window is dragged, outline where it came from and where it will land.", value: (c) => (c.drag.placeholders ? "On" : "Off"), mount: (body) => toggle(body, "Show drop outlines", config.drag.placeholders, (on) => { config.drag.placeholders = on; commit() }) },
  { id: "drag-split", group: "Motion", scene: "drag", label: "Split on drop", hint: "What makes a drop split a tile instead of swapping. Fixed, master, and scrolling layouts only swap.", value: (c) => c.drag["split-trigger"], mount: (body) => segments(body, ["off", "hold", "alt", "ctrl", "cmd", "shift"].map((id) => ({ id, label: id })), config.drag["split-trigger"], (value) => { config.drag["split-trigger"] = value; commit() }) },
  { id: "drag-delay", group: "Motion", scene: "drag", label: "Split delay", hint: "With split set to hold, how long the pointer must rest on a tile.", value: (c) => `${c.drag["split-delay-ms"]} ms`, mount: (body) => slider(body, { min: 0, max: 2000, step: 50, value: config.drag["split-delay-ms"], format: (n) => `${n} ms`, onInput: (n) => { config.drag["split-delay-ms"] = n; commit() } }) },
  { id: "mod-alt", group: "Keys", scene: "modifiers", label: "Option key", hint: "Which Option key counts as alt in bindings. The other side still types.", value: (c) => c.modifiers.alt, mount: (body) => mountModifier(body, "alt") },
  { id: "mod-ctrl", group: "Keys", scene: "modifiers", label: "Control key", hint: "Which Control key counts as ctrl in bindings.", value: (c) => c.modifiers.ctrl, mount: (body) => mountModifier(body, "ctrl") },
  { id: "mod-cmd", group: "Keys", scene: "modifiers", label: "Command key", hint: "Which Command key counts as cmd in bindings.", value: (c) => c.modifiers.cmd, mount: (body) => mountModifier(body, "cmd") },
  { id: "mod-shift", group: "Keys", scene: "modifiers", label: "Shift key", hint: "Which Shift key counts as shift in bindings.", value: (c) => c.modifiers.shift, mount: (body) => mountModifier(body, "shift") },
  { id: "bindings", group: "Keys", scene: "bindings", label: "Bindings", hint: "Click the desktop, then press a binding. Keys follow the modifier sides above.", value: (c) => `${Object.values(c.mode).reduce((sum, table) => sum + Object.keys(table).length, 0)} keys`, mount: mountBindings },
  { id: "start-at-login", group: "Automation", scene: "login", label: "Start at login", hint: "Register dinky as a login item.", value: (c) => (c["start-at-login"] ? "Yes" : "No"), mount: (body) => toggle(body, "Open dinky at login", config["start-at-login"], (on) => { config["start-at-login"] = on; commit() }, "login") },
  { id: "hooks", group: "Automation", scene: "hooks", label: "Hooks", hint: "Commands dinky runs when something happens. One command per line.", value: (c) => (Object.keys(c.hooks).length ? Object.keys(c.hooks).join(", ") : "None"), mount: mountHooks },
  { id: "rules", group: "Automation", scene: "rules", label: "Rules", hint: "Every matching rule runs, in order. Open a sample window on the desktop to see where it lands.", value: (c) => `${c.rules.length} rules`, mount: mountRules },
]

function mountModifier(body, which) {
  const demo = demoFor("modifiers")
  demo.which = which
  segments(body, [{ id: "both", label: "Both" }, { id: "left", label: "Left" }, { id: "right", label: "Right" }], config.modifiers[which], (value) => {
    config.modifiers[which] = value
    demo.which = which
    demo.output = ""
    commit()
  })
}

function mountInner(body) {
  const split = typeof config.gaps.inner === "object"
  toggle(body, "Different horizontal and vertical", split, (on) => {
    const current = gapNumber(typeof config.gaps.inner === "number" ? config.gaps.inner : config.gaps.inner.horizontal)
    config.gaps.inner = on ? { horizontal: current, vertical: current } : current
    select("gaps-inner")
  })
  if (!split) {
    slider(body, { min: 0, max: 80, step: 1, value: config.gaps.inner, format: (n) => `${n} pt`, onInput: (n) => { config.gaps.inner = n; commit() } })
  } else {
    slider(body, { min: 0, max: 80, step: 1, value: config.gaps.inner.horizontal, format: (n) => `H ${n}`, onInput: (n) => { config.gaps.inner.horizontal = n; commit() } })
    slider(body, { min: 0, max: 80, step: 1, value: config.gaps.inner.vertical, format: (n) => `V ${n}`, onInput: (n) => { config.gaps.inner.vertical = n; commit() } })
  }
}

function mountOuter(body) {
  const split = typeof config.gaps.outer === "object"
  toggle(body, "Different on each side", split, (on) => {
    const current = gapNumber(typeof config.gaps.outer === "number" ? config.gaps.outer : config.gaps.outer.top)
    config.gaps.outer = on ? { top: current, bottom: current, left: current, right: current } : current
    select("gaps-outer")
  })
  if (!split) {
    slider(body, { min: 0, max: 80, step: 1, value: config.gaps.outer, format: (n) => `${n} pt`, onInput: (n) => { config.gaps.outer = n; commit() } })
  } else {
    for (const side of ["top", "bottom", "left", "right"]) {
      slider(body, { min: 0, max: 120, step: 1, value: config.gaps.outer[side], format: (n) => `${side} ${n}`, onInput: (n) => { config.gaps.outer[side] = n; commit() } })
    }
  }
  const bar = button("Leave room for a bar")
  bar.addEventListener("click", () => {
    const current = typeof config.gaps.outer === "number" ? config.gaps.outer : config.gaps.outer.left
    config.gaps.outer = { top: 44, bottom: current, left: current, right: current }
    select("gaps-outer")
  })
  body.append(bar)
}

function mountLone(body) {
  const set = config["lone-window-width"] != null
  toggle(body, "Set a width of its own", set, (on) => {
    config["lone-window-width"] = on ? config["fullscreen-width"] : null
    select("lone-window-width")
  })
  if (set) {
    slider(body, { min: 10, max: 100, step: 1, value: Math.round(config["lone-window-width"] * 100), format: (n) => `${n}%`, onInput: (n) => { config["lone-window-width"] = n / 100; commit() } })
  }
}

function mountFollow(body) {
  const state = followState()
  toggle(body, "Switch Space when an app activates", state.enabled, (on) => {
    setFollow(on, state["exclude-apps"])
    commit()
  })
  tags(body, state["exclude-apps"], (values) => {
    setFollow(followState().enabled, values)
    commit()
  }, "com.apple.mail")
}

function buildRail() {
  const rail = $("rail")
  rail.replaceChildren()
  let group = ""
  for (const setting of SETTINGS) {
    if (setting.group !== group) {
      group = setting.group
      rail.append(el("h2", "group-title", group))
    }
    const open = setting.id === ui.selected
    const row = el("div", open ? "set open" : "set")
    const head = button("", "set-btn")
    head.setAttribute("aria-expanded", String(open))
    head.append(el("span", "set-label", setting.label), el("span", "set-value", setting.value(config)))
    head.querySelector(".set-value").dataset.value = setting.id
    head.addEventListener("click", () => select(setting.id))
    row.append(head)
    if (open) {
      const body = el("div", "set-body")
      body.append(el("p", "hint", setting.hint))
      setting.mount(body)
      row.append(body)
    }
    rail.append(row)
  }
}

function onAction(id) {
  const scene = sceneOf(ui.selected)
  const demo = demoFor(scene)
  if (id === "open") {
    demo.count = Math.min(8, (demo.count || 1) + 1)
    demo.focus = demo.count - 1
    demo.custom = null
  } else if (id === "close") {
    demo.count = Math.max(1, (demo.count || 1) - 1)
    demo.focus = Math.min(demo.focus || 0, demo.count - 1)
    demo.custom = null
  } else if (id === "focus-next") {
    const total = scene === "scrolling" ? demo.count || 4 : demo.count || 3
    demo.focus = ((demo.focus || 0) + 1) % total
  } else if (id === "play") {
    playOpen(demo)
    return
  } else if (id === "stack") demo.stack = !demo.stack
  else if (id === "rearrange") demo.alt = !demo.alt
  else if (id === "reset-drag") {
    demo.custom = null
    demo.ghosts = []
    demo.dragId = null
  } else if (id === "shuffle") reshuffleSpaces()
  else if (id === "enable-ffm") config["focus-follows-mouse"].enabled = true
  else if (id === "enable-swipe") config.swipe.enabled = true
  else if (id === "lone-display") demo.count = demo.count === 1 ? 3 : 1
  else if (id.startsWith("sample-")) {
    demo.picked = Number(id.slice(7))
    demo.result = previewRule(config, ruleSamples()[demo.picked])
  } else if (id.startsWith("hook-")) fireHook(demo, id)
  ui.actionSig = ""
  renderLive()
}

function playOpen(demo) {
  clearInterval(ui.playTimer)
  demo.count = 1
  demo.focus = 0
  renderLive()
  ui.playTimer = setInterval(() => {
    if (demo.count >= 4) {
      clearInterval(ui.playTimer)
      return
    }
    demo.count += 1
    demo.focus = demo.count - 1
    renderLive()
  }, Math.max(motionMs(config), 160) + 220)
}

function reshuffleSpaces() {
  const demo = demoFor("space-order")
  const tokens = demo.tokens || []
  if (tokens.length >= 3) {
    const first = tokens.shift()
    tokens.splice(Math.min(2, tokens.length), 0, first)
  }
  demo.phase = "shuffled"
  settleSpacesSoon()
}

function settleSpacesSoon() {
  clearTimeout(ui.spaceTimer)
  ui.spaceTimer = setTimeout(settleSpaces, 700)
}

function settleSpaces() {
  const demo = demoFor("space-order")
  if (!demo.tokens) return
  if (config["follow-space-order"]) demo.tokens.forEach((token, index) => { token.num = index + 1 })
  else demo.tokens.sort((a, b) => a.num - b.num)
  demo.phase = "settled"
  if (ui.selected === "follow-space-order") renderLive()
}

function fireHook(demo, id) {
  const event = {
    "hook-startup": "startup",
    "hook-workspace": "workspace-changed",
    "hook-focus": "focus-changed",
    "hook-mode": "mode-changed",
    "hook-display": "display-changed",
  }[id]
  const commands = config.hooks[event] || []
  demo.lines = [`${event}  ${commands.length ? commands.join("  ·  ") : "nothing set"}`, ...(demo.lines || [])].slice(0, 6)
  if (event === "workspace-changed") demo.workspace = demo.workspace === 1 ? 2 : 1
  if (event === "focus-changed") demo.focus = (demo.focus + 1) % 3
  if (event === "mode-changed") demo.mode = demo.mode === "main" ? "service" : "main"
  if (event === "display-changed") demo.extra = !demo.extra
}

function logicalPoint(event) {
  const screen = event.target.closest?.(".screen") || document.querySelector(".screen")
  const box = screen.getBoundingClientRect()
  return {
    x: ((event.clientX - box.left) / box.width) * DISPLAY.w,
    y: ((event.clientY - box.top) / box.height) * DISPLAY.h,
    screen,
  }
}

function snapshotDrag() {
  const demo = demoFor("drag")
  if (!demo.custom) {
    const model = stageModel(config, "drag", { ...demo, custom: null })
    demo.custom = model.monitors[0].windows.map((win) => ({
      index: Number(win.id.slice(1)) - 1,
      x: win.x,
      y: win.y,
      w: win.w,
      h: win.h,
    }))
  }
  return demo.custom
}

function rectUnder(rects, point, skip) {
  return rects.find((rect) => rect.index !== skip && point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h) || null
}

function halfRect(rect, point) {
  const px = (point.x - rect.x) / rect.w - 0.5
  const py = (point.y - rect.y) / rect.h - 0.5
  const gap = 8
  if (Math.abs(px) > Math.abs(py)) {
    const width = (rect.w - gap) / 2
    const left = px < 0
    return {
      mine: { x: rect.x + (left ? 0 : width + gap), y: rect.y, w: width, h: rect.h },
      theirs: { x: rect.x + (left ? width + gap : 0), y: rect.y, w: width, h: rect.h },
    }
  }
  const height = (rect.h - gap) / 2
  const top = py < 0
  return {
    mine: { x: rect.x, y: rect.y + (top ? 0 : height + gap), w: rect.w, h: height },
    theirs: { x: rect.x, y: rect.y + (top ? height + gap : 0), w: rect.w, h: height },
  }
}

function onPointerDown(event) {
  if (event.button != null && event.button !== 0) return
  const scene = sceneOf(ui.selected)
  const card = event.target.closest?.("[data-token]")
  if (card && scene === "space-order") {
    const demo = demoFor("space-order")
    const token = demo.tokens.find((item) => String(item.token) === card.dataset.token)
    if (!token) return
    event.preventDefault()
    ui.pointer = { kind: "space", pointer: event.pointerId, token: token.token, origin: event.clientX }
    card.setPointerCapture(event.pointerId)
    return
  }
  const pad = event.target.closest?.(".trackpad")
  if (pad && scene === "swipe") {
    event.preventDefault()
    ui.pointer = { kind: "swipe", pointer: event.pointerId, x: event.clientX, y: event.clientY, used: false }
    pad.setPointerCapture(event.pointerId)
    return
  }
  const win = event.target.closest?.("[data-win]")
  if (win && scene === "drag") {
    const index = Number(win.dataset.win.slice(1)) - 1
    const rects = snapshotDrag()
    const rect = rects.find((item) => item.index === index)
    if (!rect) return
    const point = logicalPoint(event)
    event.preventDefault()
    ui.pointer = {
      kind: "window",
      pointer: event.pointerId,
      index,
      dx: point.x - rect.x,
      dy: point.y - rect.y,
      origin: { ...rect },
      moved: false,
      split: false,
      holdTarget: null,
    }
    const demo = demoFor("drag")
    demo.dragId = index
    win.setPointerCapture(event.pointerId)
  }
}

function onPointerMove(event) {
  const drag = ui.pointer
  if (!drag || event.pointerId !== drag.pointer) {
    if (sceneOf(ui.selected) === "ffm") hoverFocus(event)
    return
  }
  if (drag.kind === "space") moveSpace(event)
  else if (drag.kind === "swipe") moveSwipe(event)
  else if (drag.kind === "window") moveWindow(event)
}

function moveSpace(event) {
  const demo = demoFor("space-order")
  const board = document.querySelector(".mission")
  if (!board) return
  const box = board.getBoundingClientRect()
  const index = Math.max(0, Math.min(demo.tokens.length - 1, Math.floor(((event.clientX - box.left) / box.width) * demo.tokens.length)))
  const from = demo.tokens.findIndex((item) => item.token === dragToken(ui.pointer))
  if (from >= 0 && from !== index) {
    const [token] = demo.tokens.splice(from, 1)
    demo.tokens.splice(index, 0, token)
  }
  const current = demo.tokens.find((item) => item.token === dragToken(ui.pointer))
  if (current) {
    current.dragged = true
    current.dragX = Math.max(0, Math.min(80, ((event.clientX - box.left) / box.width) * 100 - 8))
  }
  demo.phase = "shuffled"
  renderLive()
}

function dragToken(pointer) {
  return pointer.token
}

function moveSwipe(event) {
  const demo = demoFor("swipe")
  const box = event.target.closest?.(".trackpad")?.getBoundingClientRect() || document.querySelector(".trackpad").getBoundingClientRect()
  demo.finger = {
    x: Math.max(8, Math.min(92, ((event.clientX - box.left) / box.width) * 100)),
    y: Math.max(12, Math.min(88, ((event.clientY - box.top) / box.height) * 100)),
  }
  const dx = event.clientX - ui.pointer.x
  const dy = event.clientY - ui.pointer.y
  if (ui.pointer.used) {
    renderLive()
    return
  }
  const count = config.swipe.vertical ? 4 : 3
  if (Math.abs(dx) < 36 && Math.abs(dy) < 36) {
    renderLive()
    return
  }
  ui.pointer.used = true
  if (!config.swipe.enabled) {
    demo.banner = "Swipe is off"
    renderLive()
    return
  }
  if (Math.abs(dy) > Math.abs(dx) && config.swipe.vertical) {
    demo.focus = Math.max(0, Math.min(count - 1, demo.focus + (dy < 0 ? -1 : 1)))
    if (Math.abs(dy) > 80) demo.banner = "Mission Control"
    renderLive()
    return
  }
  const toward = dx < 0 ? 1 : -1
  const next = demo.focus + toward
  if (next >= 0 && next < count) {
    demo.focus = next
    demo.banner = ""
  } else if (config.swipe["space-switch"] === "native") {
    demo.workspace = Math.min(config.workspaces, Math.max(1, demo.workspace + toward))
    demo.banner = "Space changed with the swipe"
  } else {
    demo.pendingSpace = toward
    demo.banner = "Lift to change Space"
  }
  renderLive()
}

function moveWindow(event) {
  const demo = demoFor("drag")
  const rects = demo.custom
  const rect = rects.find((item) => item.index === ui.pointer.index)
  const point = logicalPoint(event)
  rect.x = point.x - ui.pointer.dx
  rect.y = point.y - ui.pointer.dy
  rect.dragging = true
  ui.pointer.moved = true
  const target = rectUnder(rects, point, rect.index)
  const trigger = config.drag["split-trigger"]
  if (trigger === "hold") {
    if (ui.pointer.holdTarget !== target?.index) {
      ui.pointer.holdTarget = target?.index ?? null
      ui.pointer.split = false
      clearTimeout(ui.pointer.timer)
      if (target) {
        ui.pointer.timer = setTimeout(() => {
          ui.pointer.split = true
          renderLive()
        }, config.drag["split-delay-ms"])
      }
    }
  } else if (trigger !== "off") ui.pointer.split = ui.heldMod === trigger
  else ui.pointer.split = false
  demo.ghosts = []
  if (config.drag.placeholders && target) {
    demo.ghosts.push({ ...ui.pointer.origin, id: "src" })
    if (ui.pointer.split) demo.ghosts.push({ ...halfRect(target, point).mine, id: "dst" })
    else demo.ghosts.push({ ...target, id: "dst" })
  }
  demo.dragId = rect.index
  renderLive()
}

function onPointerUp(event) {
  const drag = ui.pointer
  if (!drag || event.pointerId !== drag.pointer) return
  if (drag.kind === "space") {
    for (const token of demoFor("space-order").tokens) {
      token.dragged = false
      token.dragX = null
    }
    settleSpaces()
  } else if (drag.kind === "swipe") {
    const demo = demoFor("swipe")
    if (demo.pendingSpace && config.swipe["space-switch"] === "instant") {
      demo.workspace = Math.min(config.workspaces, Math.max(1, demo.workspace + demo.pendingSpace))
      demo.banner = "Space changed"
    }
    demo.pendingSpace = 0
    demo.finger = { x: 50, y: 50 }
    renderLive()
  } else if (drag.kind === "window") finishWindowDrag(event)
  ui.pointer = null
}

function finishWindowDrag(event) {
  const demo = demoFor("drag")
  const rects = demo.custom
  const rect = rects.find((item) => item.index === ui.pointer.index)
  const target = rectUnder(rects, logicalPoint(event), rect.index)
  if (target && ui.pointer.moved) {
    if (ui.pointer.split && config.drag["split-trigger"] !== "off") {
      const halves = halfRect(target, logicalPoint(event))
      Object.assign(rect, halves.mine, { dragging: false })
      Object.assign(target, halves.theirs)
    } else {
      const next = { x: target.x, y: target.y, w: target.w, h: target.h }
      Object.assign(target, { x: ui.pointer.origin.x, y: ui.pointer.origin.y, w: ui.pointer.origin.w, h: ui.pointer.origin.h })
      Object.assign(rect, next)
    }
  } else if (rect) {
    Object.assign(rect, ui.pointer.origin)
  }
  if (rect) rect.dragging = false
  demo.ghosts = []
  demo.dragId = null
  clearTimeout(ui.pointer.timer)
  renderLive()
}

function hoverFocus(event) {
  const demo = demoFor("ffm")
  if (!config["focus-follows-mouse"].enabled) return
  const win = event.target.closest?.("[data-win]")
  const index = win ? Number(win.dataset.win.slice(1)) - 1 : null
  if (index == null) {
    if (demo.waiting != null) {
      demo.waiting = null
      demo.hover = null
      clearTimeout(ui.hoverTimer)
      renderLive()
    }
    return
  }
  if (index === demo.hover) return
  const peek = win?.dataset.peek === "1"
  if (peek && !config["focus-follows-mouse"]["accordion-edges"]) return
  demo.hover = index
  demo.waiting = index
  clearTimeout(ui.hoverTimer)
  renderLive()
  ui.hoverTimer = setTimeout(() => {
    demo.focus = index
    demo.waiting = null
    if (ui.selected.startsWith("ffm")) renderLive()
  }, config["focus-follows-mouse"]["delay-ms"])
}

function onKeyDown(event) {
  const mod = { Alt: "alt", Control: "ctrl", Meta: "cmd", Shift: "shift" }[event.key]
  if (mod) ui.heldMod = mod
  if (event.target.closest("input, textarea, select")) return
  const scene = sceneOf(ui.selected)
  if (scene !== "bindings") return
  const name = keyName(event)
  if (!name) return
  const parts = []
  if (event.altKey) parts.push("alt")
  if (event.ctrlKey) parts.push("ctrl")
  if (event.metaKey) parts.push("cmd")
  if (event.shiftKey) parts.push("shift")
  if (["alt", "ctrl", "cmd", "shift"].includes(name)) return
  parts.push(name)
  event.preventDefault()
  pressBinding(config, demoFor("bindings"), parts.join("-"))
  renderLive()
}

function onKeyUp(event) {
  const mod = { Alt: "alt", Control: "ctrl", Meta: "cmd", Shift: "shift" }[event.key]
  if (mod && ui.heldMod === mod) ui.heldMod = ""
}

function onDeskClick(event) {
  const login = event.target.closest?.("[data-login]")
  if (login) return
  const cap = event.target.closest?.("[data-keycap]")
  if (cap && sceneOf(ui.selected) === "modifiers") {
    pressModifier(cap.dataset.keycap)
    return
  }
  const dock = event.target.closest?.("[data-dock]")
  if (dock && sceneOf(ui.selected) === "follow-app") {
    followDock(dock.dataset.dock)
    return
  }
  const space = event.target.closest?.("[data-space]")
  if (space && sceneOf(ui.selected) === "workspaces") {
    demoFor("workspaces").current = Number(space.dataset.space)
    renderLive()
    return
  }
  const win = event.target.closest?.("[data-win]")
  if (!win || ui.pointer) return
  const scene = sceneOf(ui.selected)
  if (!["layout", "tiling", "accordion", "master", "borders", "scrolling", "gaps"].includes(scene)) return
  const index = Number(win.dataset.win.slice(1)) - 1
  if (!Number.isFinite(index)) return
  demoFor(scene).focus = index
  renderLive()
}

function pressModifier(id) {
  const demo = demoFor("modifiers")
  demo.pressed = id
  if (id !== "h") {
    demo.heldSide = id
    demo.output = ""
    renderLive()
    return
  }
  const side = demo.heldSide || ""
  const allowed = config.modifiers.alt === "both" || side === `alt-${config.modifiers.alt}`
  if (allowed && side.startsWith("alt")) {
    demo.focus = demo.focus === 0 ? 1 : 0
    demo.output = ""
  } else demo.output = "˙"
  renderLive()
}

function followDock(id) {
  const demo = demoFor("follow-app")
  if (id !== "mail") {
    demo.note = ""
    renderLive()
    return
  }
  const state = followState()
  if (state.enabled && !state["exclude-apps"].includes("com.apple.mail")) {
    demo.space = 2
    demo.note = "Followed Mail"
  } else {
    demo.space = 1
    demo.note = "Stayed on this Space"
  }
  renderLive()
}

function applyParsed(text, message) {
  const warnings = []
  const next = normalizeConfig(parseToml(text), warnings)
  config = next
  ui.demos = {}
  ui.snapshot = JSON.stringify(config)
  ui.actionSig = ""
  buildRail()
  renderLive()
  setStatus(warnings[0] ? `${message} ${warnings[0]}` : message, warnings.length > 0)
}

async function loadDisk() {
  const response = await fetch("/api/config")
  if (!response.ok) throw new Error(`Could not read config (${response.status})`)
  const body = await response.json()
  ui.path = body.path || ui.path
  if (body.missing || !body.toml) {
    applyParsed(serializeConfig(normalizeConfig({})), "No config file yet. Showing dinky's defaults.")
    return
  }
  applyParsed(body.toml, `Loaded ${body.path}`)
}

function download() {
  const blob = new Blob([serializeConfig(config)], { type: "text/plain" })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = "dinky.toml"
  link.click()
  URL.revokeObjectURL(link.href)
}

async function copyConfig() {
  const text = serializeConfig(config)
  try {
    await navigator.clipboard.writeText(text)
    setStatus("Copied the config.")
  } catch {
    $("toml-drawer")?.setAttribute("open", "")
    setStatus("Clipboard blocked. The config is in the file panel.", true)
  }
}

async function writeConfig() {
  const warnings = renderWarnings()
  if (warnings.length) {
    setStatus(warnings[0], true)
    return
  }
  $("confirm-text").textContent = `This replaces ${ui.path}. dinky reloads when the file is saved. The current file is copied beside it first.`
  $("confirm").hidden = false
}

async function confirmWrite() {
  $("confirm").hidden = true
  const response = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: serializeConfig(config),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    setStatus(body.error || "Could not write the config.", true)
    return
  }
  ui.snapshot = JSON.stringify(config)
  ui.path = body.path || ui.path
  setStatus(body.backup ? `Wrote ${body.path}. Backup: ${body.backup}` : `Wrote ${body.path}`)
}

function applyConfigObject(next, message) {
  config = next
  ui.demos = {}
  ui.snapshot = JSON.stringify(config)
  ui.actionSig = ""
  buildRail()
  renderLive()
  setStatus(message)
}

window.__dinky = {
  select,
  get config() { return config },
  model: () => ui.lastModel,
}

$("reload").addEventListener("click", () => {
  loadDisk().catch(() => setStatus("Couldn't read the config. Is the preview server running?", true))
})
$("open-file").addEventListener("click", () => $("file").click())
$("file").addEventListener("change", () => {
  const file = $("file").files?.[0]
  if (!file) return
  file.text().then((text) => applyParsed(text, `Opened ${file.name}. Write config saves it into dinky's folder.`)).catch((error) => setStatus(error.message, true))
})
$("copy").addEventListener("click", () => copyConfig())
$("download").addEventListener("click", download)
$("write").addEventListener("click", () => writeConfig())
$("confirm-no").addEventListener("click", () => { $("confirm").hidden = true })
$("confirm-yes").addEventListener("click", () => confirmWrite())
$("desk").addEventListener("pointerdown", onPointerDown)
$("desk").addEventListener("click", onDeskClick)
document.addEventListener("pointermove", onPointerMove)
document.addEventListener("pointerup", onPointerUp)
document.addEventListener("keydown", onKeyDown)
document.addEventListener("keyup", onKeyUp)
window.addEventListener("beforeunload", (event) => {
  if (!dirty()) return
  event.preventDefault()
  event.returnValue = ""
})

const hash = location.hash.replace("#", "")
if (SETTINGS.some((item) => item.id === hash)) ui.selected = hash
applyConfigObject(normalizeConfig({}), "Loading your config…")
loadDisk().catch((error) => {
  const offline = /fetch|network/i.test(error.message || "")
  setStatus(offline ? "Showing defaults. Start the preview server to load and write your config." : error.message, !offline)
})
