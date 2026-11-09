// A TOML subset that covers dinky configs: comments, tables, arrays of tables,
// inline tables, literal and basic strings, dotted keys.

export function parseToml(input) {
  const text = String(input).replace(/^\uFEFF/, "")
  let i = 0
  const root = {}
  let current = root

  function peek() {
    return text[i]
  }

  function error(msg) {
    const line = text.slice(0, i).split("\n").length
    const err = new Error(`${msg} (line ${line})`)
    err.line = line
    return err
  }

  function skipSpaces() {
    while (i < text.length && (text[i] === " " || text[i] === "\t" || text[i] === "\r")) i++
  }

  function skipTrivia(allowNewlines) {
    for (;;) {
      skipSpaces()
      if (peek() === "#") {
        while (i < text.length && text[i] !== "\n") i++
        continue
      }
      if (allowNewlines && peek() === "\n") {
        i++
        continue
      }
      break
    }
  }

  function parseString() {
    const quote = text[i++]
    let out = ""
    if (quote === "'") {
      while (i < text.length && text[i] !== "'") out += text[i++]
      if (text[i] !== "'") throw error("Unclosed string")
      i++
      return out
    }
    if (quote !== '"') throw error("Expected a string")
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\\") {
        i++
        const esc = text[i++]
        const map = { n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"', b: "\b", f: "\f" }
        if (!(esc in map)) throw error("Unknown escape")
        out += map[esc]
      } else {
        out += text[i++]
      }
    }
    if (text[i] !== '"') throw error("Unclosed string")
    i++
    return out
  }

  function parseKey() {
    skipSpaces()
    if (peek() === '"' || peek() === "'") return parseString()
    const start = i
    while (i < text.length && /[A-Za-z0-9_-]/.test(text[i])) i++
    if (start === i) throw error("Expected a key")
    return text.slice(start, i)
  }

  function parseKeyPath() {
    const parts = [parseKey()]
    for (;;) {
      skipSpaces()
      if (peek() !== ".") break
      i++
      parts.push(parseKey())
    }
    return parts
  }

  function assign(obj, parts, value) {
    let cursor = obj
    for (let n = 0; n < parts.length - 1; n++) {
      const part = parts[n]
      const next = cursor[part]
      if (next == null || typeof next !== "object" || Array.isArray(next)) cursor[part] = {}
      cursor = cursor[part]
    }
    cursor[parts[parts.length - 1]] = value
  }

  function parseArray() {
    if (text[i++] !== "[") throw error("Expected [")
    const items = []
    for (;;) {
      skipTrivia(true)
      if (peek() === "]") {
        i++
        break
      }
      items.push(parseValue())
      skipTrivia(true)
      if (peek() === ",") {
        i++
        continue
      }
      if (peek() === "]") {
        i++
        break
      }
      throw error("Expected , or ]")
    }
    return items
  }

  function parseInline() {
    if (text[i++] !== "{") throw error("Expected {")
    const obj = {}
    for (;;) {
      skipTrivia(true)
      if (peek() === "}") {
        i++
        break
      }
      const parts = parseKeyPath()
      skipSpaces()
      if (text[i++] !== "=") throw error("Expected =")
      assign(obj, parts, parseValue())
      skipTrivia(true)
      if (peek() === ",") {
        i++
        continue
      }
      if (peek() === "}") {
        i++
        break
      }
      throw error("Expected , or }")
    }
    return obj
  }

  function parseValue() {
    skipSpaces()
    const c = peek()
    if (c === '"' || c === "'") return parseString()
    if (c === "[") return parseArray()
    if (c === "{") return parseInline()
    if (text.startsWith("true", i) && boundary(i + 4)) {
      i += 4
      return true
    }
    if (text.startsWith("false", i) && boundary(i + 5)) {
      i += 5
      return false
    }
    const match = /^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i))
    if (match) {
      i += match[0].length
      return Number(match[0])
    }
    throw error("Expected a value")
  }

  function boundary(index) {
    return index >= text.length || !/[A-Za-z0-9_-]/.test(text[index])
  }

  function enterTable(parts, arrayOfTables) {
    let cursor = root
    for (let n = 0; n < parts.length - 1; n++) {
      const part = parts[n]
      const next = cursor[part]
      if (next == null || typeof next !== "object" || Array.isArray(next)) cursor[part] = {}
      cursor = cursor[part]
    }
    const last = parts[parts.length - 1]
    if (arrayOfTables) {
      if (!Array.isArray(cursor[last])) cursor[last] = []
      const row = {}
      cursor[last].push(row)
      current = row
      return
    }
    const existing = cursor[last]
    if (existing == null || typeof existing !== "object" || Array.isArray(existing)) cursor[last] = {}
    current = cursor[last]
  }

  while (i < text.length) {
    skipTrivia(true)
    if (i >= text.length) break
    if (peek() === "[") {
      i++
      const arrayOfTables = peek() === "["
      if (arrayOfTables) i++
      const parts = parseKeyPath()
      skipSpaces()
      if (text[i++] !== "]") throw error("Expected ]")
      if (arrayOfTables) {
        skipSpaces()
        if (text[i++] !== "]") throw error("Expected ]]")
      }
      enterTable(parts, arrayOfTables)
      continue
    }
    const parts = parseKeyPath()
    skipSpaces()
    if (text[i++] !== "=") throw error("Expected =")
    assign(current, parts, parseValue())
  }

  return root
}

export const LAYOUTS = ["tiles", "dwindle", "accordion", "fixed", "scrolling", "master"]

export const DEFAULT_MODE = {
  main: {
    "ctrl-left": "workspace prev",
    "ctrl-right": "workspace next",
    "alt-1": "workspace 1",
    "alt-2": "workspace 2",
    "alt-3": "workspace 3",
    "alt-4": "workspace 4",
    "alt-5": "workspace 5",
    "alt-6": "workspace 6",
    "alt-7": "workspace 7",
    "alt-8": "workspace 8",
    "alt-9": "workspace 9",
    "alt-shift-1": "move-window-to-workspace 1",
    "alt-shift-2": "move-window-to-workspace 2",
    "alt-shift-3": "move-window-to-workspace 3",
    "alt-shift-4": "move-window-to-workspace 4",
    "alt-shift-5": "move-window-to-workspace 5",
    "alt-shift-6": "move-window-to-workspace 6",
    "alt-shift-7": "move-window-to-workspace 7",
    "alt-shift-8": "move-window-to-workspace 8",
    "alt-shift-9": "move-window-to-workspace 9",
    "alt-tab": "workspace-back-and-forth",
    "alt-h": "focus left",
    "alt-j": "focus down",
    "alt-k": "focus up",
    "alt-l": "focus right",
    "alt-shift-h": "move left",
    "alt-shift-j": "move down",
    "alt-shift-k": "move up",
    "alt-shift-l": "move right",
    "alt-minus": "resize smart -50",
    "alt-equal": "resize smart +50",
    "alt-f": "fullscreen",
    "alt-shift-f": "layout floating tiling",
    "alt-comma": "layout accordion",
    "alt-slash": "layout tiles",
    "alt-shift-n": "move-window-to-display next",
    "alt-shift-semicolon": "mode service",
  },
  service: {
    esc: ["reload-config", "mode main"],
    r: ["flatten-workspace-tree", "mode main"],
    "alt-shift-h": ["join-with left", "mode main"],
    "alt-shift-j": ["join-with down", "mode main"],
    "alt-shift-k": ["join-with up", "mode main"],
    "alt-shift-l": ["join-with right", "mode main"],
  },
}

const KNOWN = new Set([
  "start-at-login",
  "workspaces",
  "follow-space-order",
  "workspace-to-display",
  "default-layout",
  "default-tiling",
  "workspace",
  "follow-app-activation",
  "float-windows-without-fullscreen",
  "fullscreen-width",
  "lone-window-width",
  "scrolling",
  "master",
  "accordion",
  "gaps",
  "display",
  "borders",
  "focus-follows-mouse",
  "swipe",
  "animations",
  "drag",
  "modifiers",
  "hooks",
  "rules",
  "mode",
])

const KEY_COMBO =
  /^((alt|ctrl|cmd|shift|hyper|meh)-)*([a-z0-9]|f[1-9]|f1[0-9]|f20|keypad-([0-9]|clear|decimal|divide|enter|equal|minus|multiply|plus)|section|minus|equal|left-bracket|right-bracket|backslash|semicolon|quote|comma|period|slash|backtick|page-up|page-down|home|end|forward-delete|space|enter|esc|backspace|tab|left|down|up|right)$/

const COMMAND =
  /^\s*(workspace|workspace-back-and-forth|move-window-to-workspace|move-window-to-display|focus|focus-monitor|move|join-with|resize|layout|workspace-layout|fullscreen|flatten-workspace-tree|balance-sizes|swap-with-master|retile|clear-minimum-sizes|mode|reload-config|enable|list-workspaces|list-windows|list-monitors|list-displays|list-modes|debug-state|exec-and-forget)(\s.*)?$/

function clamp(n, min, max, fallback) {
  const value = Number(n)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function bool(value, fallback) {
  return typeof value === "boolean" ? value : fallback
}

function color(value, fallback) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value) ? value : fallback
}

function enumValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}

export function normalizeInner(value, fallback = 8) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value))
  if (value && typeof value === "object") {
    const horizontal = Math.max(0, Math.round(Number(value.horizontal ?? fallback)))
    const vertical = Math.max(0, Math.round(Number(value.vertical ?? fallback)))
    if (horizontal === vertical) return horizontal
    return { horizontal, vertical }
  }
  return fallback
}

export function normalizeOuter(value, fallback = 8) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value))
  if (value && typeof value === "object") {
    const sides = {
      top: Math.max(0, Math.round(Number(value.top ?? fallback))),
      bottom: Math.max(0, Math.round(Number(value.bottom ?? fallback))),
      left: Math.max(0, Math.round(Number(value.left ?? fallback))),
      right: Math.max(0, Math.round(Number(value.right ?? fallback))),
    }
    if (sides.top === sides.bottom && sides.top === sides.left && sides.top === sides.right) return sides.top
    return sides
  }
  return fallback
}

function copyRules(rules) {
  if (!Array.isArray(rules)) return []
  return rules.map((rule) => ({ ...rule }))
}

function copyMode(mode) {
  const out = {}
  for (const [name, bindings] of Object.entries(mode || {})) {
    out[name] = { ...bindings }
  }
  return out
}

export function normalizeConfig(raw, warnings = []) {
  const source = raw && typeof raw === "object" ? raw : {}
  for (const key of Object.keys(source)) {
    if (!KNOWN.has(key)) warnings.push(`Left out unknown key \`${key}\`. dinky rejects keys it doesn't know.`)
  }

  const followRaw = source["follow-app-activation"]
  let follow
  if (followRaw && typeof followRaw === "object" && !Array.isArray(followRaw)) {
    follow = {
      enabled: bool(followRaw.enabled, true),
      "exclude-apps": Array.isArray(followRaw["exclude-apps"])
        ? followRaw["exclude-apps"].map(String).filter(Boolean)
        : [],
    }
  } else {
    follow = bool(followRaw, true)
  }

  const workspace = {}
  for (const [id, table] of Object.entries(source.workspace || {})) {
    if (!/^[1-9]\d*$/.test(id) || !table || typeof table !== "object") continue
    const entry = {}
    if (typeof table.tiling === "boolean") entry.tiling = table.tiling
    if (LAYOUTS.includes(table.layout)) entry.layout = table.layout
    if (table.layout === "fixed") {
      entry.columns = Math.max(1, Math.round(Number(table.columns ?? 1)))
      entry.rows = Math.max(1, Math.round(Number(table.rows ?? 1)))
      entry.expand = enumValue(table.expand, ["columns", "rows", "accordion"], "columns")
    } else if (table.columns != null || table.rows != null || table.expand != null) {
      warnings.push(`Workspace ${id} sets columns, rows, or expand without layout = 'fixed'. Those keys were left out.`)
    }
    if (table["fullscreen-width"] != null) entry["fullscreen-width"] = clamp(table["fullscreen-width"], 0.1, 1, 1)
    if (table["lone-window-width"] != null) entry["lone-window-width"] = clamp(table["lone-window-width"], 0.1, 1, 1)
    if (table.display && typeof table.display === "object") {
      entry.display = {}
      for (const [pattern, sub] of Object.entries(table.display)) {
        if (!sub || typeof sub !== "object") continue
        const copy = {}
        if (typeof sub.tiling === "boolean") copy.tiling = sub.tiling
        if (LAYOUTS.includes(sub.layout)) copy.layout = sub.layout
        if (sub.layout === "fixed") {
          copy.columns = Math.max(1, Math.round(Number(sub.columns ?? 1)))
          copy.rows = Math.max(1, Math.round(Number(sub.rows ?? 1)))
          copy.expand = enumValue(sub.expand, ["columns", "rows", "accordion"], "columns")
        }
        if (sub["fullscreen-width"] != null) copy["fullscreen-width"] = clamp(sub["fullscreen-width"], 0.1, 1, 1)
        if (sub["lone-window-width"] != null) copy["lone-window-width"] = clamp(sub["lone-window-width"], 0.1, 1, 1)
        entry.display[pattern] = copy
      }
    }
    workspace[id] = entry
  }

  const displays = {}
  for (const [pattern, table] of Object.entries(source.display || {})) {
    if (!table || typeof table !== "object") continue
    const entry = {}
    if (table.gaps && typeof table.gaps === "object") {
      entry.gaps = {}
      if (table.gaps.inner != null) entry.gaps.inner = table.gaps.inner
      if (table.gaps.outer != null) entry.gaps.outer = table.gaps.outer
    }
    if (table["fullscreen-width"] != null) entry["fullscreen-width"] = clamp(table["fullscreen-width"], 0.1, 1, 1)
    if (table["lone-window-width"] != null) entry["lone-window-width"] = clamp(table["lone-window-width"], 0.1, 1, 1)
    displays[pattern] = entry
  }

  const placement = {}
  for (const [id, pattern] of Object.entries(source["workspace-to-display"] || {})) {
    if (!/^[1-9]\d*$/.test(id)) continue
    if (typeof pattern === "string" && pattern.trim()) placement[id] = pattern.trim()
    else if (Array.isArray(pattern)) {
      const items = pattern.map((item) => String(item).trim()).filter(Boolean)
      if (items.length === 1) placement[id] = items[0]
      else if (items.length > 1) placement[id] = items
    }
  }

  return {
    "start-at-login": bool(source["start-at-login"], true),
    workspaces: Math.max(1, Math.round(Number(source.workspaces ?? 5)) || 5),
    "follow-space-order": bool(source["follow-space-order"], false),
    "workspace-to-display": placement,
    "default-layout": enumValue(source["default-layout"], LAYOUTS, "tiles"),
    "default-tiling": bool(source["default-tiling"], true),
    workspace,
    "follow-app-activation": follow,
    "float-windows-without-fullscreen": bool(source["float-windows-without-fullscreen"], true),
    "fullscreen-width": clamp(source["fullscreen-width"], 0.1, 1, 1),
    "lone-window-width": source["lone-window-width"] == null ? null : clamp(source["lone-window-width"], 0.1, 1, 1),
    scrolling: {
      "column-width": clamp(source.scrolling?.["column-width"], 0.1, 1, 0.49),
    },
    master: {
      size: clamp(source.master?.size, 0.1, 0.9, 0.6),
      side: enumValue(source.master?.side, ["left", "right", "center"], "left"),
    },
    accordion: {
      padding: Math.max(0, Math.round(Number(source.accordion?.padding ?? 30)) || 0),
      orientation: enumValue(source.accordion?.orientation, ["auto", "keep"], "auto"),
    },
    gaps: {
      inner: normalizeInner(source.gaps?.inner, 8),
      outer: normalizeOuter(source.gaps?.outer, 8),
    },
    display: displays,
    borders: {
      enabled: bool(source.borders?.enabled, true),
      width: Math.max(0, Number(source.borders?.width ?? 4) || 0),
      "active-color": color(source.borders?.["active-color"], "#e1e3e4"),
      "inactive-color": color(source.borders?.["inactive-color"], "#494d64"),
      order: enumValue(source.borders?.order, ["below", "above"], "below"),
      "exclude-apps": Array.isArray(source.borders?.["exclude-apps"])
        ? source.borders["exclude-apps"].map(String).filter(Boolean)
        : [],
    },
    "focus-follows-mouse": {
      enabled: bool(source["focus-follows-mouse"]?.enabled, false),
      "delay-ms": Math.max(0, Math.round(Number(source["focus-follows-mouse"]?.["delay-ms"] ?? 100)) || 0),
      "accordion-edges": bool(source["focus-follows-mouse"]?.["accordion-edges"], true),
    },
    swipe: {
      enabled: bool(source.swipe?.enabled, false),
      "space-switch": enumValue(source.swipe?.["space-switch"], ["instant", "native"], "instant"),
      vertical: bool(source.swipe?.vertical, false),
    },
    animations: {
      enabled: bool(source.animations?.enabled, true),
      "duration-ms": clamp(Math.round(Number(source.animations?.["duration-ms"] ?? 150)), 0, 1000, 150),
    },
    drag: {
      placeholders: bool(source.drag?.placeholders, true),
      "split-trigger": enumValue(source.drag?.["split-trigger"], ["off", "hold", "alt", "ctrl", "cmd", "shift"], "off"),
      "split-delay-ms": Math.max(0, Math.round(Number(source.drag?.["split-delay-ms"] ?? 500)) || 0),
    },
    modifiers: {
      alt: enumValue(source.modifiers?.alt, ["both", "left", "right"], "both"),
      ctrl: enumValue(source.modifiers?.ctrl, ["both", "left", "right"], "both"),
      cmd: enumValue(source.modifiers?.cmd, ["both", "left", "right"], "both"),
      shift: enumValue(source.modifiers?.shift, ["both", "left", "right"], "both"),
    },
    hooks: copyHooks(source.hooks),
    rules: copyRules(source.rules),
    mode: source.mode ? copyMode(source.mode) : structuredClone(DEFAULT_MODE),
  }
}

function copyHooks(hooks) {
  const names = ["startup", "workspace-changing", "workspace-changed", "focus-changed", "mode-changed", "display-changed"]
  const out = {}
  for (const name of names) {
    const value = hooks?.[name]
    if (value == null) continue
    if (typeof value === "string") out[name] = [value]
    else if (Array.isArray(value)) out[name] = value.map(String)
  }
  return out
}

export function configWarnings(config) {
  const warnings = []
  for (const [mode, bindings] of Object.entries(config.mode || {})) {
    for (const [combo, command] of Object.entries(bindings || {})) {
      if (!KEY_COMBO.test(combo)) warnings.push(`Mode ${mode} has a key dinky won't accept: ${combo}`)
      const commands = Array.isArray(command) ? command : [command]
      for (const item of commands) {
        if (typeof item !== "string" || !COMMAND.test(item)) {
          warnings.push(`Mode ${mode} key ${combo} has a command dinky won't accept: ${item}`)
        }
      }
    }
  }
  config.rules.forEach((rule, index) => {
    const commands = Array.isArray(rule.run) ? rule.run : [rule.run]
    if (!rule.run || commands.length === 0) warnings.push(`Rule ${index + 1} has no command.`)
    for (const item of commands) {
      if (typeof item !== "string" || !COMMAND.test(item)) warnings.push(`Rule ${index + 1} has a command dinky won't accept: ${item}`)
    }
  })
  for (const [name, commands] of Object.entries(config.hooks || {})) {
    for (const item of commands) {
      if (!COMMAND.test(item)) warnings.push(`Hook ${name} has a command dinky won't accept: ${item}`)
    }
  }
  return warnings
}

function quote(value) {
  const text = String(value)
  if (!/['\\\n\r]/.test(text)) return `'${text}'`
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`
}

function bareOrQuotedKey(key) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : quote(key)
}

function emitNumber(value) {
  if (Number.isInteger(value)) return String(value)
  const rounded = Math.round(value * 1000) / 1000
  return String(rounded)
}

function emitScalar(value) {
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") return emitNumber(value)
  if (typeof value === "string") return quote(value)
  return null
}

function emitInline(value) {
  if (Array.isArray(value)) return `[${value.map((item) => emitScalar(item) ?? emitInline(item)).join(", ")}]`
  if (value && typeof value === "object") {
    const parts = Object.entries(value).map(([key, item]) => `${bareOrQuotedKey(key)} = ${emitScalar(item) ?? emitInline(item)}`)
    return `{ ${parts.join(", ")} }`
  }
  return emitScalar(value)
}

function emitCommand(value) {
  if (Array.isArray(value)) return emitInline(value)
  return quote(value)
}

function emitGap(value) {
  if (typeof value === "number") return emitNumber(value)
  return emitInline(value)
}

export function serializeConfig(config) {
  const lines = [
    "#:schema https://dinky.rodeo/schemas/dinky.json",
    "# ~/.config/dinky/dinky.toml. dinky reloads this file when it is saved.",
    "",
    `start-at-login = ${config["start-at-login"] ? "true" : "false"}`,
    `workspaces = ${emitNumber(config.workspaces)}`,
    `follow-space-order = ${config["follow-space-order"] ? "true" : "false"}`,
    `default-layout = ${quote(config["default-layout"])}`,
    `default-tiling = ${config["default-tiling"] ? "true" : "false"}`,
  ]

  const follow = config["follow-app-activation"]
  if (typeof follow === "boolean") lines.push(`follow-app-activation = ${follow ? "true" : "false"}`)
  lines.push(
    `float-windows-without-fullscreen = ${config["float-windows-without-fullscreen"] ? "true" : "false"}`,
    `fullscreen-width = ${emitNumber(config["fullscreen-width"])}`,
  )
  if (config["lone-window-width"] != null) lines.push(`lone-window-width = ${emitNumber(config["lone-window-width"])}`)

  if (follow && typeof follow === "object") {
    lines.push("", "[follow-app-activation]", `enabled = ${follow.enabled ? "true" : "false"}`)
    lines.push(`exclude-apps = ${emitInline(follow["exclude-apps"])}`)
  }

  const workspaceIds = Object.keys(config.workspace).sort((a, b) => Number(a) - Number(b))
  for (const id of workspaceIds) {
    const entry = config.workspace[id]
    const own = { ...entry }
    const display = own.display
    delete own.display
    if (Object.keys(own).length) {
      lines.push("", `[workspace.${id}]`)
      emitWorkspaceFields(lines, own)
    }
    for (const [pattern, sub] of Object.entries(display || {})) {
      lines.push("", `[workspace.${id}.display.${bareOrQuotedKey(pattern)}]`)
      emitWorkspaceFields(lines, sub)
    }
  }

  lines.push(
    "",
    "[accordion]",
    `padding = ${emitNumber(config.accordion.padding)}`,
    `orientation = ${quote(config.accordion.orientation)}`,
    "",
    "[scrolling]",
    `column-width = ${emitNumber(config.scrolling["column-width"])}`,
    "",
    "[master]",
    `size = ${emitNumber(config.master.size)}`,
    `side = ${quote(config.master.side)}`,
    "",
    "[gaps]",
    `inner = ${emitGap(config.gaps.inner)}`,
    `outer = ${emitGap(config.gaps.outer)}`,
  )

  const placement = Object.entries(config["workspace-to-display"])
  if (placement.length) {
    lines.push("", "[workspace-to-display]")
    for (const [id, pattern] of placement.sort((a, b) => Number(a[0]) - Number(b[0]))) {
      lines.push(`${id} = ${emitInline(pattern)}`)
    }
  }

  for (const [pattern, display] of Object.entries(config.display)) {
    lines.push("", `[display.${bareOrQuotedKey(pattern)}]`)
    if (display.gaps?.inner != null) lines.push(`gaps.inner = ${emitGap(normalizeInner(display.gaps.inner))}`)
    if (display.gaps?.outer != null) lines.push(`gaps.outer = ${emitGap(display.gaps.outer)}`)
    if (display["fullscreen-width"] != null) lines.push(`fullscreen-width = ${emitNumber(display["fullscreen-width"])}`)
    if (display["lone-window-width"] != null) lines.push(`lone-window-width = ${emitNumber(display["lone-window-width"])}`)
  }

  const borders = config.borders
  lines.push(
    "",
    "[borders]",
    `enabled = ${borders.enabled ? "true" : "false"}`,
    `width = ${emitNumber(borders.width)}`,
    `active-color = ${quote(borders["active-color"])}`,
    `inactive-color = ${quote(borders["inactive-color"])}`,
    `order = ${quote(borders.order)}`,
    `exclude-apps = ${emitInline(borders["exclude-apps"])}`,
    "",
    "[focus-follows-mouse]",
    `enabled = ${config["focus-follows-mouse"].enabled ? "true" : "false"}`,
    `delay-ms = ${emitNumber(config["focus-follows-mouse"]["delay-ms"])}`,
    `accordion-edges = ${config["focus-follows-mouse"]["accordion-edges"] ? "true" : "false"}`,
    "",
    "[swipe]",
    `enabled = ${config.swipe.enabled ? "true" : "false"}`,
    `space-switch = ${quote(config.swipe["space-switch"])}`,
    `vertical = ${config.swipe.vertical ? "true" : "false"}`,
    "",
    "[animations]",
    `enabled = ${config.animations.enabled ? "true" : "false"}`,
    `duration-ms = ${emitNumber(config.animations["duration-ms"])}`,
    "",
    "[drag]",
    `placeholders = ${config.drag.placeholders ? "true" : "false"}`,
    `split-trigger = ${quote(config.drag["split-trigger"])}`,
    `split-delay-ms = ${emitNumber(config.drag["split-delay-ms"])}`,
    "",
    "[modifiers]",
    `alt = ${quote(config.modifiers.alt)}`,
    `ctrl = ${quote(config.modifiers.ctrl)}`,
    `cmd = ${quote(config.modifiers.cmd)}`,
    `shift = ${quote(config.modifiers.shift)}`,
  )

  const hookNames = ["startup", "workspace-changing", "workspace-changed", "focus-changed", "mode-changed", "display-changed"]
  const usedHooks = hookNames.filter((name) => config.hooks[name])
  if (usedHooks.length) {
    lines.push("", "[hooks]")
    for (const name of usedHooks) lines.push(`${name} = ${emitInline(config.hooks[name])}`)
  }

  for (const rule of config.rules) {
    lines.push("", "[[rules]]")
    for (const key of ["app-id", "app-id-regex", "app-name", "title", "window-identifier", "exclude-window-identifier", "kind"]) {
      if (rule[key]) lines.push(`${key} = ${quote(rule[key])}`)
    }
    lines.push(`run = ${emitCommand(rule.run)}`)
  }

  for (const [mode, bindings] of Object.entries(config.mode)) {
    lines.push("", `[mode.${bareOrQuotedKey(mode)}]`)
    for (const [combo, command] of Object.entries(bindings)) lines.push(`${combo} = ${emitCommand(command)}`)
  }

  lines.push("")
  return lines.join("\n")
}

function emitWorkspaceFields(lines, entry) {
  if (typeof entry.tiling === "boolean") lines.push(`tiling = ${entry.tiling ? "true" : "false"}`)
  if (entry.layout) lines.push(`layout = ${quote(entry.layout)}`)
  if (entry.layout === "fixed") {
    lines.push(`columns = ${emitNumber(entry.columns ?? 1)}`)
    lines.push(`rows = ${emitNumber(entry.rows ?? 1)}`)
    lines.push(`expand = ${quote(entry.expand || "columns")}`)
  }
  if (entry["fullscreen-width"] != null) lines.push(`fullscreen-width = ${emitNumber(entry["fullscreen-width"])}`)
  if (entry["lone-window-width"] != null) lines.push(`lone-window-width = ${emitNumber(entry["lone-window-width"])}`)
}

const RULE_FIELDS = ["app-id", "app-id-regex", "app-name", "title", "window-identifier", "exclude-window-identifier", "kind", "run"]

function emitValue(value) {
  return emitScalar(value) ?? emitInline(value)
}

function sameLeaf(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function collectLeaves(value, path, out) {
  if (path === "rules" || path.startsWith("rules.")) return
  if (Array.isArray(value)) {
    out[path] = value
    return
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).filter((key) => key !== "_id")
    if (!keys.length) return
    for (const key of keys) collectLeaves(value[key], path ? `${path}.${key}` : key, out)
    return
  }
  out[path] = value
}

function valueAt(root, path) {
  let cursor = root
  for (const part of path.split(".")) {
    if (cursor == null || typeof cursor !== "object") return undefined
    cursor = cursor[part]
  }
  return cursor
}

function showValue(value) {
  if (value == null) return "unset"
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return emitValue(value)
}

function decodeKeyPath(input) {
  const parts = []
  let i = 0
  const s = input.trim()
  while (i < s.length) {
    while (s[i] === " " || s[i] === "\t") i++
    if (i >= s.length) break
    if (s[i] === "'" || s[i] === '"') {
      const q = s[i++]
      let out = ""
      while (i < s.length && s[i] !== q) out += s[i++]
      if (s[i] === q) i++
      parts.push(out)
    } else {
      let out = ""
      while (i < s.length && s[i] !== ".") out += s[i++]
      parts.push(out.trim())
    }
    if (s[i] === ".") i++
  }
  return parts.filter((part) => part !== "")
}

function parseHeader(line) {
  const hash = line.indexOf("#")
  const code = (hash === -1 ? line : line.slice(0, hash)).trim()
  const array = code.startsWith("[[")
  const inner = array ? code.slice(2, code.lastIndexOf("]]")) : code.slice(1, code.lastIndexOf("]"))
  return { array, path: decodeKeyPath(inner).join(".") }
}

function readRawValue(src, index) {
  let i = index
  const stack = []
  let quote = ""
  while (i < src.length) {
    const c = src[i]
    if (quote) {
      if (quote === '"' && c === "\\") {
        i += 2
        continue
      }
      if (c === quote) quote = ""
      i++
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      i++
      continue
    }
    if (c === "[" || c === "{") {
      stack.push(c)
      i++
      continue
    }
    if ((c === "]" || c === "}") && stack.length) {
      stack.pop()
      i++
      continue
    }
    if ((c === " " || c === "\t" || c === "\r") && stack.length === 0) {
      let j = i
      while (j < src.length && (src[j] === " " || src[j] === "\t" || src[j] === "\r")) j++
      if (j >= src.length || src[j] === "#" || src[j] === "\n") break
      i++
      continue
    }
    if ((c === "#" || c === "\n") && stack.length === 0) break
    i++
  }
  return { text: src.slice(index, i), end: i }
}

function parseDocument(text) {
  const src = String(text).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")
  const items = []
  const counts = {}
  let table = ""
  let i = 0
  while (i < src.length) {
    if (src[i] === "\n") {
      items.push({ type: "raw", text: "\n" })
      i++
      continue
    }
    const lineEnd = src.indexOf("\n", i)
    const line = src.slice(i, lineEnd === -1 ? src.length : lineEnd)
    const trimmed = line.trim()
    const takeLine = () => {
      const text = lineEnd === -1 ? line : src.slice(i, lineEnd + 1)
      i += text.length
      return text
    }
    if (!trimmed || trimmed.startsWith("#")) {
      items.push({ type: "raw", text: takeLine() })
      continue
    }
    if (trimmed.startsWith("[")) {
      const text = takeLine()
      const header = parseHeader(trimmed)
      let path = header.path
      if (header.array) {
        const n = counts[header.path] || 0
        counts[header.path] = n + 1
        path = `${header.path}[${n}]`
      }
      table = path
      items.push({ type: "header", text, path, array: header.array, headerPath: header.path })
      continue
    }
    const match = /^(\s*(?:[A-Za-z0-9_-]+|"[^"\n]*"|'[^'\n]*')(?:\s*\.\s*(?:[A-Za-z0-9_-]+|"[^"\n]*"|'[^'\n]*'))*)\s*=\s*/.exec(line)
    if (!match) {
      items.push({ type: "raw", text: takeLine() })
      continue
    }
    const key = decodeKeyPath(match[1]).join(".")
    const valueStart = i + match[0].length
    const value = readRawValue(src, valueStart)
    const nl = src.indexOf("\n", value.end)
    const suffixEnd = nl === -1 ? src.length : nl + 1
    items.push({
      type: "key",
      table,
      key,
      path: table ? `${table}.${key}` : key,
      prefix: match[0],
      valueText: value.text,
      suffix: src.slice(value.end, suffixEnd),
    })
    i = suffixEnd
  }
  return items
}

function renderItems(items) {
  let out = ""
  for (const item of items) {
    if (item.type === "key") out += item.prefix + item.valueText + item.suffix
    else if (item.type !== "rules-marker") out += item.text
  }
  return out
}

function ruleBody(rule) {
  const out = {}
  for (const key of RULE_FIELDS) {
    if (rule?.[key] != null && rule[key] !== "") out[key] = rule[key]
  }
  return out
}

function rulesSame(before, after) {
  const left = before || []
  const right = after || []
  if (left.length !== right.length) return false
  return left.every((rule, index) => rule._id === right[index]._id && sameLeaf(ruleBody(rule), ruleBody(right[index])))
}

function ruleLabel(rule) {
  if (rule?.["app-name"] === ".*") return "the catch-all rule"
  const who = rule?.["app-id"] || rule?.["app-name"] || rule?.title || rule?.kind
  return who ? `the rule for ${who}` : "a rule"
}

function keyItem(table, key, valueText) {
  return {
    type: "key",
    table,
    key,
    path: table ? `${table}.${key}` : key,
    prefix: `${key} = `,
    valueText,
    suffix: "\n",
  }
}

function updateRuleBlock(block, rule) {
  const header = block.find((item) => item.type === "header")
  const table = header?.path || "rules[new]"
  for (const key of RULE_FIELDS) {
    const value = rule[key]
    const index = block.findIndex((item) => item.type === "key" && item.key === key)
    if (value == null || value === "") {
      if (index >= 0) block.splice(index, 1)
      continue
    }
    const text = emitValue(value)
    if (index >= 0) block[index].valueText = text
    else {
      let at = block.length
      while (at > 0 && block[at - 1].type === "raw") at--
      block.splice(at, 0, keyItem(table, key, text))
    }
  }
}

function freshRuleBlock(rule) {
  const block = [
    { type: "raw", text: "\n" },
    { type: "header", text: "[[rules]]\n", path: "rules[new]", array: true, headerPath: "rules" },
  ]
  updateRuleBlock(block, rule)
  return block
}

function extractRuleBlocks(items) {
  const ranges = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.type !== "header" || !item.array || item.headerPath !== "rules") continue
    let end = i + 1
    while (end < items.length && items[end].type !== "header") end++
    ranges.push([i, end])
    i = end - 1
  }
  if (!ranges.length) return { items, blocks: [] }
  const skip = new Set()
  for (const [start, end] of ranges) {
    for (let i = start; i < end; i++) skip.add(i)
  }
  const next = []
  items.forEach((item, index) => {
    if (index === ranges[0][0]) next.push({ type: "rules-marker" })
    if (!skip.has(index)) next.push(item)
  })
  return { items: next, blocks: ranges.map(([start, end]) => items.slice(start, end)) }
}

function hasKey(items, path) {
  return items.some((item) => item.type === "key" && item.path === path)
}

function ancestorKey(items, path) {
  const parts = path.split(".")
  for (let i = parts.length - 1; i > 0; i--) {
    const parent = parts.slice(0, i).join(".")
    if (hasKey(items, parent)) return parent
  }
  return ""
}

function formatHeader(path) {
  return path.split(".").map((part) => (/^[A-Za-z0-9_-]+$/.test(part) ? part : `'${part.replaceAll("'", "")}'`)).join(".")
}

function insertKey(items, path, valueText) {
  const headers = items.filter((item) => item.type === "header" && !item.array).map((item) => item.path)
  let table = ""
  for (const header of headers) {
    if (path.startsWith(`${header}.`) && header.length > table.length) table = header
  }
  let key = table ? path.slice(table.length + 1) : path
  if (!table && path.includes(".")) {
    const parts = path.split(".")
    table = parts.slice(0, -1).join(".")
    key = parts.at(-1)
  }
  const item = keyItem(table, key, valueText)
  if (hasKey(items, item.path) || hasKey(items, path)) {
    const found = items.find((entry) => entry.type === "key" && (entry.path === path || entry.path === item.path))
    const removed = keyLine(found)
    found.valueText = valueText
    return { removed, added: keyLine(found) }
  }
  if (!table) {
    let at = 0
    for (let i = 0; i < items.length; i++) {
      if (items[i].type === "header") break
      if (items[i].type === "key") at = i + 1
    }
    items.splice(at, 0, item)
    return { removed: "", added: keyLine(item) }
  }
  const headerAt = items.findIndex((entry) => entry.type === "header" && !entry.array && entry.path === table)
  if (headerAt === -1) {
    const headerText = `[${formatHeader(table)}]`
    items.push({ type: "raw", text: "\n" }, { type: "header", text: `${headerText}\n`, path: table, array: false, headerPath: table }, item)
    return { removed: "", added: `${headerText}\n${keyLine(item)}` }
  }
  let lastKey = headerAt
  for (let i = headerAt + 1; i < items.length; i++) {
    if (items[i].type === "header") break
    if (items[i].type === "key") lastKey = i
  }
  items.splice(lastKey + 1, 0, item)
  return { removed: "", added: keyLine(item) }
}

function keyLine(item) {
  return `${item.prefix}${item.valueText}${item.suffix}`.replace(/\s+$/, "")
}

function blockText(block) {
  return renderItems(block).replace(/\s+$/, "")
}

function change(summary, removed, added) {
  return { summary, removed: removed || "", added: added || "" }
}

function removeKey(items, path) {
  const index = items.findIndex((item) => item.type === "key" && item.path === path)
  if (index < 0) return ""
  const removed = keyLine(items[index])
  items.splice(index, 1)
  return removed
}

function pruneHeaders(items, removed) {
  const tables = new Set(removed.map((path) => path.split(".").slice(0, -1).join(".")).filter(Boolean))
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.type !== "header" || item.array || !tables.has(item.path)) continue
    let keys = 0
    let notes = false
    for (let j = i + 1; j < items.length; j++) {
      if (items[j].type === "header") break
      if (items[j].type === "key") keys++
      else if (items[j].type === "raw" && items[j].text.trim()) notes = true
    }
    if (!keys && !notes) items.splice(i, 1)
  }
}

export function patchConfig(originalText, before, after) {
  let items = parseDocument(originalText)
  const changes = []
  if (!rulesSame(before?.rules, after?.rules)) {
    const extracted = extractRuleBlocks(items)
    items = extracted.items
    const byId = new Map()
    ;(before?.rules || []).forEach((rule, index) => {
      if (extracted.blocks[index]) byId.set(rule._id, extracted.blocks[index])
    })
    let edited = false
    const blocks = (after?.rules || []).map((rule) => {
      const existing = byId.get(rule._id)
      if (!existing) {
        const block = freshRuleBlock(rule)
        changes.push(change(`Added ${ruleLabel(rule)}`, "", blockText(block)))
        return block
      }
      const prior = (before?.rules || []).find((item) => item._id === rule._id)
      if (!sameLeaf(ruleBody(prior), ruleBody(rule))) {
        const removed = blockText(existing)
        edited = true
        updateRuleBlock(existing, rule)
        changes.push(change(`Updated ${ruleLabel(rule)}`, removed, blockText(existing)))
      }
      return existing
    })
    for (const rule of before?.rules || []) {
      if (!(after?.rules || []).some((item) => item._id === rule._id)) {
        const block = byId.get(rule._id)
        changes.push(change(`Removed ${ruleLabel(rule)}`, block ? blockText(block) : ruleLabel(rule), ""))
      }
    }
    const beforeIds = (before?.rules || []).map((rule) => rule._id).join("\0")
    const afterIds = (after?.rules || []).map((rule) => rule._id).join("\0")
    const sameMembers = (before?.rules || []).length === (after?.rules || []).length && (before?.rules || []).every((rule) => (after?.rules || []).some((item) => item._id === rule._id))
    if (beforeIds !== afterIds && sameMembers) {
      const orderOf = (rules) => rules.map((rule, index) => `${index + 1}. ${ruleLabel(rule)}`).join("\n")
      changes.push(change("Reordered rules", orderOf(before.rules), orderOf(after.rules)))
    }
    const flat = blocks.flat()
    const marker = items.findIndex((item) => item.type === "rules-marker")
    if (marker === -1) items.push(...flat)
    else items.splice(marker, 1, ...flat)
  }

  const oldLeaves = {}
  const newLeaves = {}
  collectLeaves(before, "", oldLeaves)
  collectLeaves(after, "", newLeaves)
  const planned = new Map()
  const unsets = []
  for (const path of new Set([...Object.keys(oldLeaves), ...Object.keys(newLeaves)])) {
    if (sameLeaf(oldLeaves[path], newLeaves[path])) continue
    if (newLeaves[path] == null) unsets.push(path)
    else {
      const target = hasKey(items, path)
        ? { path, value: newLeaves[path] }
        : ancestorKey(items, path)
          ? { path: ancestorKey(items, path), value: valueAt(after, ancestorKey(items, path)) }
          : { path, value: newLeaves[path] }
      planned.set(target.path, target.value)
    }
  }
  const removed = []
  for (const path of unsets) {
    if (planned.has(path)) continue
    if ([...planned.keys()].some((parent) => path === parent || path.startsWith(`${parent}.`))) continue
    removed.push(path)
    const line = removeKey(items, path)
    changes.push(change(`Removed ${path}`, line, ""))
  }
  for (const [path, value] of planned) {
    const previous = valueAt(before, path)
    const summary = previous == null ? `Added ${path} = ${showValue(value)}` : `${path}: ${showValue(previous)} → ${showValue(value)}`
    const diff = insertKey(items, path, emitValue(value))
    changes.push(change(summary, diff?.removed, diff?.added))
  }
  pruneHeaders(items, removed)
  return { text: renderItems(items), changes }
}
