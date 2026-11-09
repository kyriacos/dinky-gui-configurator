const LAYOUTS = ["floating", "tiling", "tiles", "dwindle", "accordion", "fixed", "scrolling", "master"]
const WORKSPACE_LAYOUTS = ["tiles", "dwindle", "accordion", "fixed", "scrolling", "master"]
const DIRECTIONS = ["left", "right", "up", "down"]

function bare(id, label, group) {
  return {
    id,
    label,
    group,
    match(text) {
      return text === id ? {} : null
    },
    defaults() {
      return {}
    },
    build() {
      return id
    },
    fields: [],
  }
}

function choice(key, label, options, fallback) {
  return { key, label, kind: "select", options, fallback }
}

export const COMMAND_SPECS = [
  {
    id: "layout",
    label: "Layout",
    group: "Placement",
    fields: [
      choice("layout", "Layout", LAYOUTS, "floating"),
      choice("also", "Also", ["", ...LAYOUTS], ""),
    ],
    match(text) {
      const parts = text.split(/\s+/)
      if (parts[0] !== "layout" || parts.length > 3) return null
      if (!LAYOUTS.includes(parts[1] || "")) return null
      if (parts[2] && !LAYOUTS.includes(parts[2])) return null
      return { layout: parts[1], also: parts[2] || "" }
    },
    defaults() {
      return { layout: "floating", also: "" }
    },
    build(values) {
      return values.also ? `layout ${values.layout} ${values.also}` : `layout ${values.layout}`
    },
  },
  {
    id: "workspace-layout",
    label: "Workspace layout",
    group: "Placement",
    fields: [
      choice("layout", "Layout", WORKSPACE_LAYOUTS, "tiles"),
      choice("also", "Also", ["", ...WORKSPACE_LAYOUTS], ""),
    ],
    match(text) {
      const parts = text.split(/\s+/)
      if (parts[0] !== "workspace-layout" || parts.length > 3) return null
      if (!WORKSPACE_LAYOUTS.includes(parts[1] || "")) return null
      if (parts[2] && !WORKSPACE_LAYOUTS.includes(parts[2])) return null
      return { layout: parts[1], also: parts[2] || "" }
    },
    defaults() {
      return { layout: "tiles", also: "" }
    },
    build(values) {
      return values.also ? `workspace-layout ${values.layout} ${values.also}` : `workspace-layout ${values.layout}`
    },
  },
  {
    id: "move-window-to-workspace",
    label: "Move window to workspace",
    group: "Placement",
    fields: [
      { key: "target", label: "Workspace", kind: "workspace", fallback: "1" },
      { key: "follow", label: "Follow the window", kind: "check", fallback: false },
    ],
    match(text) {
      const match = /^move-window-to-workspace\s+(\d+)(?:\s+--follow)?$/.exec(text)
      if (!match) return null
      return { target: match[1], follow: text.endsWith("--follow") }
    },
    defaults() {
      return { target: "1", follow: false }
    },
    build(values) {
      return `move-window-to-workspace ${values.target}${values.follow ? " --follow" : ""}`
    },
  },
  {
    id: "move-window-to-display",
    label: "Move window to display",
    group: "Placement",
    fields: [choice("target", "Display", ["next", "prev", "main", "secondary"], "next")],
    match(text) {
      const match = /^move-window-to-display\s+(next|prev|main|secondary)$/.exec(text)
      return match ? { target: match[1] } : null
    },
    defaults() {
      return { target: "next" }
    },
    build(values) {
      return `move-window-to-display ${values.target}`
    },
  },
  {
    id: "fullscreen",
    label: "Fullscreen",
    group: "Placement",
    ...bare("fullscreen", "Fullscreen", "Placement"),
  },
  {
    id: "workspace",
    label: "Switch workspace",
    group: "Workspace",
    fields: [{ key: "target", label: "Workspace", kind: "workspace-move", fallback: "next" }],
    match(text) {
      const match = /^workspace\s+(\d+|next|prev)$/.exec(text)
      return match ? { target: match[1] } : null
    },
    defaults() {
      return { target: "next" }
    },
    build(values) {
      return `workspace ${values.target}`
    },
  },
  bare("workspace-back-and-forth", "Workspace back and forth", "Workspace"),
  {
    id: "focus",
    label: "Focus",
    group: "Focus",
    fields: [
      choice("direction", "Direction", DIRECTIONS, "left"),
      { key: "wrap", label: "Wrap around", kind: "check", fallback: false },
    ],
    match(text) {
      const match = /^focus\s+(left|right|up|down)(?:\s+--wrap-around)?$/.exec(text)
      if (!match) return null
      return { direction: match[1], wrap: text.endsWith("--wrap-around") }
    },
    defaults() {
      return { direction: "left", wrap: false }
    },
    build(values) {
      return `focus ${values.direction}${values.wrap ? " --wrap-around" : ""}`
    },
  },
  {
    id: "focus-monitor",
    label: "Focus monitor",
    group: "Focus",
    fields: [choice("target", "Monitor", ["next", "prev"], "next")],
    match(text) {
      const match = /^focus-monitor\s+(next|prev)$/.exec(text)
      return match ? { target: match[1] } : null
    },
    defaults() {
      return { target: "next" }
    },
    build(values) {
      return `focus-monitor ${values.target}`
    },
  },
  {
    id: "move",
    label: "Move",
    group: "Focus",
    fields: [choice("direction", "Direction", DIRECTIONS, "left")],
    match(text) {
      const match = /^move\s+(left|right|up|down)$/.exec(text)
      return match ? { direction: match[1] } : null
    },
    defaults() {
      return { direction: "left" }
    },
    build(values) {
      return `move ${values.direction}`
    },
  },
  {
    id: "join-with",
    label: "Join with",
    group: "Focus",
    fields: [choice("direction", "Direction", DIRECTIONS, "left")],
    match(text) {
      const match = /^join-with\s+(left|right|up|down)$/.exec(text)
      return match ? { direction: match[1] } : null
    },
    defaults() {
      return { direction: "left" }
    },
    build(values) {
      return `join-with ${values.direction}`
    },
  },
  {
    id: "resize",
    label: "Resize",
    group: "Size",
    fields: [
      choice("axis", "Axis", ["smart", "width", "height"], "smart"),
      { key: "amount", label: "Amount", kind: "text", fallback: "+50", placeholder: "+50" },
    ],
    match(text) {
      const match = /^resize\s+(smart|width|height)\s+([+-]?\d+)$/.exec(text)
      return match ? { axis: match[1], amount: match[2] } : null
    },
    defaults() {
      return { axis: "smart", amount: "+50" }
    },
    build(values) {
      return `resize ${values.axis} ${values.amount}`
    },
  },
  bare("balance-sizes", "Balance sizes", "Size"),
  bare("swap-with-master", "Swap with master", "Size"),
  bare("flatten-workspace-tree", "Flatten layout", "Size"),
  bare("retile", "Retile", "Size"),
  bare("clear-minimum-sizes", "Clear minimum sizes", "Size"),
  {
    id: "mode",
    label: "Switch mode",
    group: "Session",
    fields: [{ key: "name", label: "Mode", kind: "mode", fallback: "main" }],
    match(text) {
      const match = /^mode\s+(\S+)$/.exec(text)
      return match ? { name: match[1] } : null
    },
    defaults() {
      return { name: "main" }
    },
    build(values) {
      return `mode ${values.name}`
    },
  },
  bare("reload-config", "Reload config", "Session"),
  bare("enable", "Enable dinky", "Session"),
  {
    id: "exec-and-forget",
    label: "Run a shell command",
    group: "Script",
    fields: [{ key: "command", label: "Shell command", kind: "text", fallback: "", placeholder: "open -a Notes" }],
    match(text) {
      const match = /^exec-and-forget\s+(.+)$/.exec(text)
      return match ? { command: match[1] } : null
    },
    defaults() {
      return { command: "" }
    },
    build(values) {
      const command = String(values.command || "").trim()
      return command ? `exec-and-forget ${command}` : ""
    },
  },
  bare("list-workspaces", "List workspaces", "Inspect"),
  bare("list-windows", "List windows", "Inspect"),
  bare("list-monitors", "List monitors", "Inspect"),
  bare("list-displays", "List displays", "Inspect"),
  bare("list-modes", "List modes", "Inspect"),
  bare("debug-state", "Debug state", "Inspect"),
  {
    id: "custom",
    label: "Custom",
    group: "Custom",
    fields: [{ key: "text", label: "Command", kind: "text", fallback: "", placeholder: "command and arguments" }],
    match() {
      return null
    },
    defaults() {
      return { text: "" }
    },
    build(values) {
      return String(values.text || "").trim()
    },
  },
]

const SPEC_BY_ID = new Map(COMMAND_SPECS.map((spec) => [spec.id, spec]))

export function parseCommand(text) {
  const raw = String(text || "").trim()
  for (const spec of COMMAND_SPECS) {
    if (spec.id === "custom") continue
    const values = spec.match(raw)
    if (values) return { id: spec.id, values }
  }
  return { id: "custom", values: { text: raw } }
}

export function commandText(parsed) {
  const spec = SPEC_BY_ID.get(parsed.id) || SPEC_BY_ID.get("custom")
  return spec.build(parsed.values)
}

export function commandSpec(id) {
  return SPEC_BY_ID.get(id) || SPEC_BY_ID.get("custom")
}
