import {
  tileArea,
  resolveGaps,
  resolveWidths,
  resolveWorkspace,
  layoutWindows,
  centeredWidth,
  contentRect,
  cast,
} from "./layout.js"

const MINIS = [
  [[0.1, 0.14, 0.8, 0.72]],
  [[0.08, 0.14, 0.4, 0.72], [0.54, 0.14, 0.38, 0.72]],
  [[0.08, 0.14, 0.48, 0.34], [0.08, 0.54, 0.48, 0.32], [0.62, 0.14, 0.3, 0.72]],
  [[0.08, 0.14, 0.84, 0.34], [0.08, 0.54, 0.38, 0.32], [0.52, 0.54, 0.4, 0.32]],
]

export function freshDemo(scene, config) {
  const count = Math.max(1, Math.min(config.workspaces || 5, 12))
  if (scene === "space-order") {
    const tokens = Array.from({ length: count }, (_, index) => ({ token: index + 1, num: index + 1 }))
    if (tokens.length >= 3) [tokens[0], tokens[2]] = [tokens[2], tokens[0]]
    return { tokens, phase: "shuffled" }
  }
  if (scene === "bindings") {
    return {
      mode: "main",
      workspace: 1,
      previous: 1,
      focus: 0,
      fullscreen: false,
      container: "tiles",
      banner: "",
      windows: cast(3).map((win) => ({ ...win, workspace: 1, floating: false })),
    }
  }
  if (scene === "hooks") return { lines: [], workspace: 1, focus: 0, mode: "main", extra: false }
  if (scene === "rules") return { picked: 0, result: null }
  if (scene === "swipe") return { focus: 0, workspace: 1, banner: "", finger: { x: 50, y: 50 } }
  if (scene === "motion") return { alt: false }
  if (scene === "drag") return { focus: 0, ghosts: [], custom: null }
  if (scene === "modifiers") return { output: "", pressed: "", focus: 0 }
  if (scene === "ffm") return { focus: 0, waiting: null }
  if (scene === "follow-app") return { space: 1, note: "" }
  if (scene === "workspaces") return { current: 1 }
  if (scene === "workspace") {
    const first = Object.keys(config.workspace)[0]
    return { id: first ? Number(first) : 1, count: 4, focus: 0, pattern: "" }
  }
  if (scene === "displays") return { count: 3, focus: 0, pattern: "main" }
  if (scene === "scrolling") return { count: 4, focus: 1 }
  if (scene === "master") return { count: 4, focus: 0, stack: false }
  return { count: scene === "gaps" ? 3 : 4, focus: 0 }
}

function pills(total, active) {
  return Array.from({ length: total }, (_, index) => ({
    id: index + 1,
    label: String(index + 1),
    active: index + 1 === active,
  }))
}

function borderless(config, appId) {
  return !config.borders.enabled || config.borders["exclude-apps"].includes(appId)
}

function decorate(placed, focus, config, people = cast(8)) {
  return placed.map((rect) => {
    const person = people[rect.index] || people[rect.index % people.length]
    return {
      id: rect.id || person.id,
      title: rect.title || person.title,
      appId: rect.appId || person.appId,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      focused: rect.index === focus,
      floating: Boolean(rect.floating),
      borderless: borderless(config, rect.appId || person.appId),
      peek: Boolean(rect.peek),
      parked: rect.parked || "",
      depth: rect.depth || 0,
      panel: rect.panel || null,
      loginOn: rect.loginOn,
      dragging: Boolean(rect.dragging),
      waiting: Boolean(rect.waiting),
      waitMs: rect.waitMs,
    }
  })
}

function layoutSpec(config, demo, overrides = {}) {
  const display = overrides.display || null
  const workspace = overrides.workspace || 1
  const resolved = resolveWorkspace(config, workspace, display)
  const widths = resolveWidths(config, workspace, display)
  const count = overrides.count ?? demo.count ?? 4
  const focus = Math.max(0, Math.min(count - 1, overrides.focus ?? demo.focus ?? 0))
  const layout = overrides.layout || resolved.layout
  const lone = count === 1 && !overrides.fullscreen
  return layoutWindows({
    layout: overrides.floating ? "floating" : layout,
    count,
    focus,
    tile: tileArea(),
    gaps: resolveGaps(config, display),
    columns: overrides.columns ?? resolved.columns,
    rows: overrides.rows ?? resolved.rows,
    expand: overrides.expand ?? resolved.expand,
    padding: config.accordion.padding,
    orientation: overrides.orientation || config.accordion.orientation,
    columnWidth: config.scrolling["column-width"],
    masterSize: config.master.size,
    masterSide: config.master.side,
    stackAccordion: overrides.stackAccordion || false,
    fullscreen: Boolean(overrides.fullscreen),
    lone,
    widthFraction: overrides.fullscreen ? widths.fullscreen : widths.lone,
  })
}

function screenOf(config, opts) {
  const spec = opts.placed || { windows: [], cells: [] }
  const focus = opts.focus ?? 0
  return {
    label: opts.label || "",
    note: opts.note || "",
    workspaces: opts.workspaces || pills(Math.min(config.workspaces, 12), opts.active || 1),
    windows: opts.windows || decorate(spec.windows, focus, config, opts.people),
    cells: (spec.cells || []).map((cell, index) => ({ ...cell, id: `cell-${index}` })),
    ghosts: opts.ghosts || [],
    dock: opts.dock === undefined ? defaultDock(opts.activeDock) : opts.dock,
    banner: opts.banner || "",
    overlay: opts.overlay || null,
  }
}

function defaultDock(active) {
  return [
    { id: "notes", label: "Notes", glyph: "note" },
    { id: "mail", label: "Mail", glyph: "mail", active: active === "mail" },
    { id: "calc", label: "Calculator", glyph: "calc" },
    { id: "term", label: "Terminal", glyph: "term" },
  ]
}

function motionMs(config) {
  if (!config.animations.enabled) return 0
  return config.animations["duration-ms"]
}

export function stageModel(config, scene, demo) {
  const tile = tileArea()
  const gaps = resolveGaps(config, null)
  const content = contentRect(tile, gaps)

  if (scene === "layout" || scene === "tiling") {
    const tiling = scene === "tiling" ? config["default-tiling"] : true
    const layout = scene === "tiling" ? (tiling ? config["default-layout"] : "floating") : config["default-layout"]
    const placed = layoutSpec(config, demo, { layout, floating: !tiling && scene === "tiling", workspace: 0 })
    const name = layout === "tiles" ? "tiles, the dwindle layout" : layout
    return {
      scene,
      caption:
        scene === "tiling"
          ? config["default-tiling"]
            ? "New windows tile. A workspace can still opt out."
            : "New windows keep the size macOS gave them and stack in a cascade. Nothing is tiled until a workspace says so."
          : `A workspace with no layout of its own uses ${name}. Open another window and it splits the focused tile, or takes the next cell.`,
      actions: [
        { id: "open", label: "Open a window" },
        { id: "close", label: "Close focused" },
        { id: "play", label: "Open them one by one" },
      ],
      monitors: [screenOf(config, { placed, focus: demo.focus, note: name })],
    }
  }

  if (scene === "accordion") {
    const placed = layoutSpec(config, demo, { layout: "accordion", orientation: config.accordion.orientation })
    const horizontal = config.accordion.orientation === "keep" ? false : true
    return {
      scene,
      caption:
        config.accordion.orientation === "auto"
          ? `Neighbours peek by ${config.accordion.padding} points. Auto runs along the longer side, so on this wide screen the accordion is horizontal.`
          : `Keep leaves the accordion on the axis it already had. Here that axis stays vertical, even though the screen is wider than it is tall.`,
      actions: [
        { id: "focus-next", label: "Focus next window" },
        { id: "open", label: "Open a window" },
      ],
      monitors: [screenOf(config, { placed, focus: demo.focus, note: horizontal && config.accordion.orientation !== "keep" ? "Horizontal accordion" : "Vertical accordion" })],
    }
  }

  if (scene === "scrolling") {
    const placed = layoutSpec(config, demo, { layout: "scrolling", focus: demo.focus })
    const parked = placed.windows.some((win) => win.parked)
    return {
      scene,
      caption: `Each new column takes ${Math.round(config.scrolling["column-width"] * 100)}% of the width. A lone column fills the screen. ${parked ? "Columns that don't fit hang off the edge. dinky keeps at least 25 points visible, because macOS can't clip another app's window. This preview draws that sliver wider so you can see it." : "These columns fit, so they sit centred."}`,
      actions: [
        { id: "open", label: "Open a column" },
        { id: "focus-next", label: "Focus next column" },
      ],
      monitors: [screenOf(config, { placed, focus: demo.focus, note: "Scrolling" })],
    }
  }

  if (scene === "master") {
    const placed = layoutSpec(config, demo, { layout: "master", stackAccordion: demo.stack, focus: demo.focus })
    const side = config.master.side
    return {
      scene,
      caption:
        side === "center"
          ? `The master takes ${Math.round(config.master.size * 100)}% of the width. With one other window it stays on the left. A second stacked window moves it to the middle and the rest alternate left and right.`
          : `The master is on the ${side} and takes ${Math.round(config.master.size * 100)}% of the width. The other windows share the rest. Alone, the master fills the screen.`,
      actions: [
        { id: "open", label: "Open a window" },
        { id: "close", label: "Close focused" },
        { id: "stack", label: demo.stack ? "Stack as tiles" : "Stack as accordion" },
      ],
      monitors: [screenOf(config, { placed, focus: demo.focus, note: `Master ${side}` })],
    }
  }

  if (scene === "gaps") {
    const placed = layoutSpec(config, demo, { layout: "dwindle" })
    const inner = config.gaps.inner
    const outer = config.gaps.outer
    const innerText = typeof inner === "number" ? `${inner} points between windows` : `${inner.horizontal} horizontal and ${inner.vertical} vertical between windows`
    const outerText = typeof outer === "number" ? `${outer} points to the screen edge` : `${outer.top} above, ${outer.bottom} below, ${outer.left} left, ${outer.right} right`
    return {
      scene,
      caption: `${innerText}, and ${outerText}. Outer gaps are inside the menu bar and the Dock.`,
      actions: [],
      monitors: [screenOf(config, { placed, focus: demo.focus, note: "Gaps" })],
    }
  }

  if (scene === "fullscreen" || scene === "lone") {
    const widths = resolveWidths(config, 1, null)
    const fullscreen = scene === "fullscreen"
    const fraction = fullscreen ? widths.fullscreen : widths.lone
    const rect = fraction >= 0.999 ? content : centeredWidth(content, fraction)
    const ghostFraction = fullscreen ? widths.lone : widths.fullscreen
    const ghosts = []
    if (Math.abs(ghostFraction - fraction) > 0.01) {
      const ghost = ghostFraction >= 0.999 ? content : centeredWidth(content, ghostFraction)
      ghosts.push({ ...ghost, id: "ghost-width" })
    }
    return {
      scene,
      caption: fullscreen
        ? `Fullscreen uses ${Math.round(widths.fullscreen * 100)}% of the width and stays centred. The dashed outline, when it shows, is the lone-window width.`
        : `A window alone on a workspace uses ${Math.round(widths.lone * 100)}% of the width. ${config["lone-window-width"] == null ? "Lone width isn't set, so it follows fullscreen width." : "It no longer follows fullscreen width."}`,
      actions: [],
      monitors: [
        screenOf(config, {
          windows: decorate([{ index: 0, ...rect }], 0, config),
          ghosts,
          focus: 0,
          note: fullscreen ? "Fullscreen" : "Alone on the workspace",
        }),
      ],
    }
  }

  if (scene === "workspaces") {
    const total = config.workspaces
    const current = Math.min(demo.current || 1, total)
    return {
      scene,
      caption: `${total} workspace${total === 1 ? "" : "s"} across all displays, each one a macOS Space. dinky creates and removes Spaces to match this number.`,
      actions: [],
      monitors: [
        screenOf(config, {
          placed: layoutSpec(config, { count: 2, focus: 0 }, { workspace: current }),
          focus: 0,
          active: current,
          workspaces: pills(Math.min(total, 12), current),
          note: `Workspace ${current}`,
        }),
      ],
    }
  }

  if (scene === "space-order") {
    const tokens = demo.tokens || []
    return {
      scene,
      caption: config["follow-space-order"]
        ? "Drag a Space. On the next arrangement its windows stay put and the numbers rewrite from the left. Workspace settings follow the new numbers."
        : "Drag a Space. On the next arrangement each workspace keeps its number, so the windows travel back to that number's place.",
      actions: [{ id: "shuffle", label: "Reorder, then arrange" }],
      monitors: [
        {
          label: "",
          note: demo.phase === "shuffled" ? "Reordered" : "Arranged",
          workspaces: [],
          windows: [],
          cells: [],
          ghosts: [],
          dock: [],
          banner: "",
          overlay: {
            kind: "mission",
            spaces: tokens.map((space) => ({
              token: space.token,
              num: space.num,
              dragX: space.dragX,
              dragged: space.dragged,
              minis: MINIS[(space.token - 1) % MINIS.length],
            })),
          },
        },
      ],
    }
  }

  if (scene === "follow-app") {
    const follow = config["follow-app-activation"]
    const enabled = typeof follow === "boolean" ? follow : follow.enabled !== false
    const excluded = typeof follow === "object" ? follow["exclude-apps"] : []
    return {
      scene,
      caption: enabled
        ? `Click Mail in the Dock. dinky switches to its Space. ${excluded.length ? `${excluded.join(", ")} is not followed.` : "No apps are excluded."}`
        : "Following is off. A Dock click activates the app and leaves you on this Space.",
      actions: [],
      monitors: [
        screenOf(config, {
          placed: layoutSpec(config, { count: demo.space === 2 ? 2 : 3, focus: 0 }),
          focus: 0,
          active: demo.space,
          activeDock: demo.space === 2 ? "mail" : "",
          note: demo.note || `Workspace ${demo.space}`,
          workspaces: pills(Math.min(config.workspaces, 9), demo.space),
        }),
      ],
    }
  }

  if (scene === "float") {
    const tiledCount = config["float-windows-without-fullscreen"] ? 2 : 3
    const tiled = layoutSpec(config, { count: tiledCount, focus: 0 }, { layout: "dwindle" })
    const dialog = { index: 5, id: "dialog", title: "Copying 12 items", appId: "com.apple.finder", x: content.x + content.w * 0.3, y: content.y + content.h * 0.32, w: content.w * 0.36, h: content.h * 0.26, floating: true }
    const calcRect = config["float-windows-without-fullscreen"]
      ? { index: 2, x: content.x + content.w * 0.64, y: content.y + content.h * 0.1, w: content.w * 0.24, h: content.h * 0.34, floating: true }
      : null
    const placed = calcRect ? [...tiled.windows, calcRect, dialog] : [...tiled.windows, dialog]
    return {
      scene,
      caption: config["float-windows-without-fullscreen"]
        ? "Calculator can't go fullscreen, so it floats. The copy dialog floats either way. Notes and Mail stay tiled."
        : "Calculator joins the tiles. The copy dialog is a dialog, so it still floats.",
      actions: [],
      monitors: [screenOf(config, { windows: decorate(placed.filter(Boolean), 0, config), note: "Floating exceptions" })],
    }
  }

  if (scene === "borders") {
    const placed = layoutSpec(config, { count: 3, focus: demo.focus ?? 0 }, { layout: "dwindle" })
    const excluded = config.borders["exclude-apps"]
    return {
      scene,
      caption: !config.borders.enabled
        ? "Borders are off. The thin edge you still see is just the window itself."
        : `The focused border is ${config.borders["active-color"]}, ${config.borders.width} points, drawn ${config.borders.order} the window. ${excluded.length ? `${excluded.join(", ")} gets no border.` : "No apps are excluded."}`,
      actions: [{ id: "focus-next", label: "Focus next window" }],
      monitors: [screenOf(config, { placed, focus: demo.focus ?? 0, note: config.borders.order === "above" ? "Ring over the window" : "Border behind the window" })],
    }
  }

  if (scene === "ffm") {
    const edges = config["focus-follows-mouse"]["accordion-edges"]
    const placed = layoutSpec(config, { count: 3, focus: demo.focus }, { layout: edges ? "accordion" : "dwindle" })
    placed.windows.forEach((win) => {
      if (win.index === demo.waiting) {
        win.waiting = true
        win.waitMs = config["focus-follows-mouse"]["delay-ms"]
      }
    })
    const on = config["focus-follows-mouse"].enabled
    return {
      scene,
      caption: on
        ? `Rest the pointer on a window. Focus moves after ${config["focus-follows-mouse"]["delay-ms"]} ms. ${edges ? "The accordion peeks count." : "Accordion peeks would not count."}`
        : "Focus follows mouse is off. Turn it on, then rest the pointer on a window.",
      actions: on ? [] : [{ id: "enable-ffm", label: "Turn it on" }],
      monitors: [screenOf(config, { placed, focus: demo.focus, note: on ? "Pointer focus" : "Click to focus" })],
    }
  }

  if (scene === "swipe") {
    const vertical = config.swipe.vertical
    const placed = vertical
      ? layoutSpec(config, { count: 4, focus: demo.focus }, { layout: "fixed", columns: 2, rows: 2 })
      : layoutSpec(config, { count: 3, focus: demo.focus }, { layout: "dwindle" })
    return {
      scene,
      caption: !config.swipe.enabled
        ? "Swipe is off, so the trackpad does what macOS usually does. Turn it on to move focus first."
        : config.swipe["space-switch"] === "instant"
          ? `A sideways swipe focuses the next window. Past the last one, Space changes when you lift your fingers.${vertical ? " Up and down focus too, and a long swipe can still open Mission Control." : ""}`
          : `Native mode lets macOS see the whole swipe, so a long one can focus a window and change Space together.${vertical ? " Vertical swipes always work this way." : ""}`,
      actions: config.swipe.enabled ? [] : [{ id: "enable-swipe", label: "Turn swipe on" }],
      monitors: [
        screenOf(config, {
          placed,
          focus: demo.focus,
          active: demo.workspace,
          banner: demo.banner,
          note: `Workspace ${demo.workspace}`,
          dock: [],
          overlay: { kind: "trackpad", finger: demo.finger, vertical, hint: vertical ? "Drag any direction" : "Drag left or right" },
        }),
      ],
    }
  }

  if (scene === "motion") {
    const left = demo.alt
    const a = { index: 0, x: content.x, y: content.y, w: left ? content.w * 0.62 : content.w * 0.32, h: content.h }
    const b = { index: 1, x: a.x + a.w + gaps.innerH, y: content.y, w: content.x + content.w - (a.x + a.w + gaps.innerH), h: content.h * 0.48 }
    const c = { index: 2, x: b.x, y: b.y + b.h + gaps.innerV, w: b.w, h: content.y + content.h - (b.y + b.h + gaps.innerV) }
    return {
      scene,
      caption: config.animations.enabled
        ? `Windows glide for about ${config.animations["duration-ms"]} ms. Rearrange them to see this duration. macOS Reduce Motion turns the glide off.`
        : "Animations are off, so windows jump to the new tile.",
      actions: [{ id: "rearrange", label: "Rearrange" }],
      monitors: [screenOf(config, { windows: decorate([a, b, c], 0, config), note: "Moving tiles" })],
    }
  }

  if (scene === "drag") {
    const placed = demo.custom
      ? { windows: demo.custom, cells: [] }
      : layoutSpec(config, { count: 3, focus: demo.focus }, { layout: "dwindle" })
    for (const win of placed.windows) win.dragging = demo.dragId === win.index
    return {
      scene,
      caption:
        config.drag["split-trigger"] === "off"
          ? `Drag a window onto another to swap them. ${config.drag.placeholders ? "Outlines show the tile you left and the tile you'll land on." : "Placeholders are off, so there's no outline."} Fixed, master, and scrolling layouts only swap.`
          : config.drag["split-trigger"] === "hold"
            ? `Hold still over a tile for ${config.drag["split-delay-ms"]} ms and the drop splits it instead of swapping.`
            : `Hold ${config.drag["split-trigger"]} while you drop to split the tile under the pointer.`,
      actions: [{ id: "reset-drag", label: "Reset tiles" }],
      monitors: [screenOf(config, { placed, focus: demo.focus, ghosts: demo.ghosts || [], note: "Drag" })],
    }
  }

  if (scene === "modifiers") {
    const which = demo.which || "alt"
    const value = config.modifiers[which]
    const keys = modifierKeys(which, value, demo.pressed)
    return {
      scene,
      caption: `${labelFor(which)} bindings answer to the ${value === "both" ? "left and right keys" : value + " key"}. The other side types as usual. Press H after Option.`,
      actions: [],
      monitors: [
        screenOf(config, {
          placed: layoutSpec(config, { count: 2, focus: demo.focus }, { layout: "dwindle" }),
          focus: demo.focus,
          dock: [],
          note: demo.output ? "Typed" : "Bindings",
          overlay: { kind: "keyboard", keys, output: demo.output },
        }),
      ],
    }
  }

  if (scene === "workspace") {
    const id = demo.id || 1
    const own = resolveWorkspace(config, id, null)
    const pattern = demo.pattern || Object.keys(config.workspace[String(id)]?.display || {})[0] || ""
    const monitors = [
      screenOf(config, {
        label: pattern ? "Without the display override" : "",
        placed: layoutSpec(config, demo, { workspace: id, layout: own.layout, columns: own.columns, rows: own.rows, expand: own.expand, floating: !own.tiling }),
        focus: demo.focus,
        active: id,
        note: own.tiling ? own.layout : "Not tiled",
      }),
    ]
    if (pattern) {
      const over = resolveWorkspace(config, id, pattern)
      monitors.push(
        screenOf(config, {
          label: pattern,
          placed: layoutSpec(config, demo, {
            workspace: id,
            display: pattern,
            layout: over.layout,
            columns: over.columns,
            rows: over.rows,
            expand: over.expand,
            floating: !over.tiling,
          }),
          focus: demo.focus,
          active: id,
          note: over.tiling ? over.layout : "Not tiled",
        }),
      )
    }
    const entry = config.workspace[String(id)]
    return {
      scene,
      caption: entry
        ? `Workspace ${id} has its own settings. Other workspaces still use the defaults.`
        : `Workspace ${id} has no override, so it uses the default layout and tiling.`,
      actions: [
        { id: "open", label: "Open a window" },
        { id: "close", label: "Close focused" },
      ],
      monitors,
    }
  }

  if (scene === "placement") {
    const total = config.workspaces
    const onSecondary = (id) => {
      const value = config["workspace-to-display"][String(id)]
      if (value === "secondary") return true
      return Array.isArray(value) && value[0] === "secondary"
    }
    const mainSpaces = []
    const sideSpaces = []
    for (let id = 1; id <= total; id++) (onSecondary(id) ? sideSpaces : mainSpaces).push(id)
    const asOverlay = (ids) => ({
      kind: "mission",
      spaces: (ids.length ? ids : [0]).map((id) => ({
        token: id || "empty",
        num: id || "–",
        minis: id ? MINIS[(id - 1) % MINIS.length] : [],
      })),
    })
    return {
      scene,
      caption: sideSpaces.length
        ? `Workspace ${sideSpaces.join(", ")} lives on the secondary display while it's connected. The others stay on the main display.`
        : "Every workspace is on the main display. The secondary display keeps one Space with no number.",
      actions: [],
      monitors: [
        { label: "Main display", note: "", workspaces: [], windows: [], cells: [], ghosts: [], dock: [], banner: "", overlay: asOverlay(mainSpaces) },
        { label: "Secondary display", note: "", workspaces: [], windows: [], cells: [], ghosts: [], dock: [], banner: "", overlay: asOverlay(sideSpaces) },
      ],
    }
  }

  if (scene === "displays") {
    const pattern = demo.pattern || "main"
    const show = (name, label) =>
      screenOf(config, {
        label,
        display: name,
        placed: layoutSpec(config, { count: demo.count || 3, focus: demo.focus || 0 }, { display: name, workspace: 1, layout: demo.count === 1 ? "dwindle" : "dwindle" }),
        focus: 0,
        note: name,
      })
    const monitors = [show("main", "Main display")]
    if (pattern && pattern !== "main") monitors.push(show(pattern, pattern))
    const gaps = resolveGaps(config, pattern === "main" ? "main" : pattern)
    return {
      scene,
      caption: `${pattern} leaves ${gaps.top} points above the windows, ${gaps.bottom} below, ${gaps.left} left and ${gaps.right} right.`,
      actions: [
        { id: "lone-display", label: demo.count === 1 ? "Show three windows" : "Show a lone window" },
      ],
      monitors,
    }
  }

  if (scene === "login") {
    const on = config["start-at-login"]
    return {
      scene,
      caption: on ? "dinky registers itself as a login item and opens when you log in." : "dinky stays out of Login Items. You'll open it yourself.",
      actions: [],
      monitors: [
        screenOf(config, {
          windows: decorate(
            [
              {
                index: 0,
                id: "settings",
                title: "System Settings",
                appId: "com.apple.systempreferences",
                x: content.x + content.w * 0.16,
                y: content.y + content.h * 0.08,
                w: content.w * 0.68,
                h: content.h * 0.78,
                floating: true,
                panel: "login",
                loginOn: on,
              },
            ],
            0,
            config,
          ),
          dock: [],
          workspaces: [],
          note: "Login Items",
        }),
      ],
    }
  }

  if (scene === "hooks") {
    const placed = layoutSpec(config, { count: 3, focus: demo.focus }, { workspace: demo.workspace })
    const monitors = [
      screenOf(config, {
        placed,
        focus: demo.focus,
        active: demo.workspace,
        note: demo.mode === "service" ? "Service mode" : `Workspace ${demo.workspace}`,
      }),
    ]
    if (demo.extra) {
      monitors.push(
        screenOf(config, {
          label: "Display connected",
          placed: layoutSpec(config, { count: 1, focus: 0 }),
          focus: 0,
          workspaces: [{ id: 1, label: "1", active: true }],
        }),
      )
    }
    const log = demo.lines?.length ? demo.lines.join("\n") : "Fire an event. If a hook is set, its command is listed here."
    return {
      scene,
      caption: log,
      actions: [
        { id: "hook-startup", label: "Start dinky" },
        { id: "hook-workspace", label: "Switch workspace" },
        { id: "hook-focus", label: "Move focus" },
        { id: "hook-mode", label: "Change mode" },
        { id: "hook-display", label: "Connect a display" },
      ],
      monitors,
    }
  }

  if (scene === "rules") {
    const samples = ruleSamples(config)
    const sample = samples[demo.picked] || samples[0]
    const result = demo.result || previewRule(config, sample)
    const resolved = resolveWorkspace(config, result.workspace, null)
    const mates = result.floating || !resolved.tiling ? 0 : 2
    const placed = layoutSpec(config, { count: mates + 1, focus: mates }, { workspace: result.workspace, floating: result.floating || !resolved.tiling, layout: resolved.layout })
    const arrived = placed.windows[placed.windows.length - 1]
    if (arrived) {
      arrived.title = sample.title
      arrived.appId = sample.appId
      arrived.id = "arrived"
      arrived.index = placed.windows.length - 1
    }
    const matched = result.matched.length ? `Rules ${result.matched.map((n) => n + 1).join(", ")} matched.` : "No rule matched."
    return {
      scene,
      caption: `${sample.appName} opens on workspace ${result.workspace}${result.floating ? ", floating" : ", tiled"}. ${matched}`,
      actions: samples.map((item, index) => ({ id: `sample-${index}`, label: item.appName, pressed: index === demo.picked })),
      monitors: [
        screenOf(config, {
          placed,
          focus: placed.windows.length - 1,
          active: result.workspace,
          people: cast(6),
          note: result.floating ? "Floating" : resolved.layout,
        }),
      ],
    }
  }

  if (scene === "bindings") {
    const visible = demo.windows.filter((win) => win.workspace === demo.workspace)
    const tiled = visible.filter((win) => !win.floating)
    const floats = visible.filter((win) => win.floating)
    const layout = demo.container === "accordion" ? "accordion" : "dwindle"
    const placed = demo.fullscreen
      ? layoutWindows({
          layout: "dwindle",
          count: 1,
          focus: 0,
          tile,
          gaps,
          fullscreen: true,
          widthFraction: resolveWidths(config, demo.workspace, null).fullscreen,
        })
      : layoutWindows({
          layout,
          count: Math.max(tiled.length, 0),
          focus: 0,
          tile,
          gaps,
          padding: config.accordion.padding,
          orientation: config.accordion.orientation,
          columnWidth: config.scrolling["column-width"],
          masterSize: config.master.size,
          masterSide: config.master.side,
        })
    const windows = []
    if (!demo.fullscreen) {
      placed.windows.forEach((rect, index) => {
        const source = tiled[index]
        if (!source) return
        windows.push({ ...rect, ...source, index })
      })
      floats.forEach((win, index) => {
        windows.push({
          ...win,
          index: 100 + index,
          x: content.x + 48 + index * 32,
          y: content.y + 48 + index * 28,
          w: content.w * 0.42,
          h: content.h * 0.4,
          floating: true,
        })
      })
    } else if (tiled[demo.focus] || visible[0]) {
      const source = visible[Math.min(demo.focus, visible.length - 1)]
      windows.push({ ...placed.windows[0], ...source, index: 0 })
    }
    const focusId = visible[demo.focus]?.id
    return {
      scene,
      caption: `Mode ${demo.mode}. Press a key below, or click the desktop and type it. ${demo.banner || ""}`.trim(),
      actions: Object.keys(config.mode[demo.mode] || {}).map((combo) => ({ id: `bind:${combo}`, label: combo, compact: true })),
      monitors: [
        screenOf(config, {
          windows: decorate(
            windows.map((win) => ({ ...win, index: win.id === focusId ? 0 : win.index })),
            0,
            config,
          ).map((win) => ({ ...win, focused: win.id === focusId })),
          active: demo.workspace,
          note: demo.banner || demo.mode,
          dock: [],
        }),
      ],
    }
  }

  return {
    scene,
    caption: "",
    actions: [],
    monitors: [screenOf(config, { placed: layoutSpec(config, demo), focus: 0 })],
  }
}

function modifierKeys(which, value, pressed) {
  const pairs = [
    ["shift", "shift"],
    ["ctrl", "control"],
    ["alt", "option"],
    ["cmd", "command"],
  ]
  const keys = []
  for (const [id, label] of pairs) {
    const live = id === which && (value === "both" || value === "left")
    keys.push({ id: `${id}-left`, label, live, pressed: pressed === `${id}-left` })
  }
  keys.push({ id: "h", label: "H", live: false, pressed: pressed === "h" })
  for (const [id, label] of [...pairs].reverse()) {
    const live = id === which && (value === "both" || value === "right")
    keys.push({ id: `${id}-right`, label, live, pressed: pressed === `${id}-right` })
  }
  return keys
}

function labelFor(which) {
  return { alt: "Option", ctrl: "Control", cmd: "Command", shift: "Shift" }[which] || which
}

const APP_NAMES = {
  "com.google.Chrome": "Chrome",
  "com.mitchellh.ghostty": "Ghostty",
  "com.apple.systempreferences": "System Settings",
  "com.apple.TextEdit": "TextEdit",
  "com.tinyspeck.slackmacgap": "Slack",
  "com.tinyapp.TablePlus": "TablePlus",
  "com.anthropic.claudefordesktop": "Claude",
  "dev.warp.Warp-Stable": "Warp",
}

function sampleFromRule(rule) {
  let appName = ""
  let appId = rule["app-id"] || ""
  if (appId && APP_NAMES[appId]) appName = APP_NAMES[appId]
  if (!appName && rule["app-name"] && rule["app-name"] !== ".*") {
    const stripped = rule["app-name"].replace(/^\^/, "").replace(/\$$/, "")
    if (stripped && !/[\\[\]().*+?|]/.test(stripped)) appName = stripped
  }
  if (!appName && appId) appName = appId.split(".").pop().replace(/([a-z])([A-Z])/g, "$1 $2")
  if (!appName) return null
  if (!appId) {
    const known = Object.entries(APP_NAMES).find(([, name]) => name === appName)
    appId = known ? known[0] : `local.${appName}`
  }
  const kind = rule.kind || "normal"
  return { appName, appId, title: appName, kind, canFullscreen: kind === "normal" }
}

export function ruleSamples(config) {
  const samples = []
  const seen = new Set()
  for (const rule of config?.rules || []) {
    const sample = sampleFromRule(rule)
    if (!sample || seen.has(sample.appName)) continue
    seen.add(sample.appName)
    samples.push(sample)
  }
  if (!seen.has("Preview")) {
    samples.push({ appName: "Preview", appId: "com.apple.Preview", title: "Photo", kind: "normal", canFullscreen: true })
  }
  samples.push({ appName: "Dialog", appId: "com.apple.installer", title: "Copying", kind: "dialog", canFullscreen: false })
  return samples
}

function testRegex(pattern, value) {
  return new RegExp(pattern, "i").test(value || "")
}

export function ruleMatches(rule, win) {
  if (rule["app-id"] && rule["app-id"] !== (win.appId || "")) return false
  if (rule["app-id-regex"] && !testRegex(rule["app-id-regex"], win.appId || "")) return false
  if (rule["app-name"] && !testRegex(rule["app-name"], win.appName || "")) return false
  if (rule.title && !testRegex(rule.title, win.title || "")) return false
  if (rule["window-identifier"]) {
    if (!win.identifier || !testRegex(rule["window-identifier"], win.identifier)) return false
  }
  if (rule["exclude-window-identifier"] && win.identifier && testRegex(rule["exclude-window-identifier"], win.identifier)) return false
  if (rule.kind && rule.kind !== win.kind) return false
  return true
}

export function previewRule(config, win) {
  const matched = []
  let workspace = 1
  let floating = win.kind === "dialog" || win.kind === "sheet" || win.kind === "panel"
  let tilingVote = null
  config.rules.forEach((rule, index) => {
    let ok = false
    try {
      ok = ruleMatches(rule, win)
    } catch {
      ok = false
    }
    if (!ok) return
    matched.push(index)
    const commands = Array.isArray(rule.run) ? rule.run : [rule.run]
    for (const command of commands) {
      if (command === "layout floating") tilingVote = "floating"
      else if (command === "layout tiling") tilingVote = "tiling"
      const move = /^move-window-to-workspace\s+(\d+)/.exec(command || "")
      if (move) workspace = Number(move[1])
    }
  })
  if (win.kind === "dialog" || win.kind === "sheet" || win.kind === "panel") floating = true
  else if (tilingVote === "floating") floating = true
  else if (tilingVote === "tiling") floating = false
  else if (win.canFullscreen === false && config["float-windows-without-fullscreen"]) floating = true
  const resolved = resolveWorkspace(config, workspace, null)
  if (!resolved.tiling && tilingVote !== "tiling") floating = true
  return { workspace, floating, matched }
}

export function pressBinding(config, demo, combo) {
  const table = config.mode[demo.mode] || {}
  const command = table[combo]
  if (!command) {
    demo.banner = `${combo} is not bound in ${demo.mode}`
    return
  }
  const commands = Array.isArray(command) ? command : [command]
  const notes = []
  for (const item of commands) notes.push(runCommand(config, demo, item))
  demo.banner = notes.filter(Boolean).join(" · ")
}

function runCommand(config, demo, command) {
  const [name, ...args] = command.trim().split(/\s+/)
  if (name === "workspace") {
    const next = workspaceTarget(config, demo.workspace, args[0])
    if (next == null || next === demo.workspace) return `Already on workspace ${demo.workspace}`
    demo.previous = demo.workspace
    demo.workspace = next
    demo.focus = 0
    return `Workspace ${next}`
  }
  if (name === "workspace-back-and-forth") {
    const next = demo.previous || demo.workspace
    demo.previous = demo.workspace
    demo.workspace = next
    demo.focus = 0
    return `Workspace ${next}`
  }
  if (name === "focus") {
    moveFocus(config, demo, args[0])
    return `Focus ${args[0] || ""}`.trim()
  }
  if (name === "move") {
    swapFocus(demo, args[0])
    return `Move ${args[0] || ""}`.trim()
  }
  if (name === "move-window-to-workspace") {
    const target = workspaceTarget(config, demo.workspace, args[0])
    const visible = demo.windows.filter((win) => win.workspace === demo.workspace)
    const win = visible[demo.focus]
    if (win && target) {
      win.workspace = target
      demo.focus = 0
      return `${win.title} → workspace ${target}`
    }
  }
  if (name === "fullscreen") {
    demo.fullscreen = !demo.fullscreen
    return demo.fullscreen ? "Fullscreen" : "Leave fullscreen"
  }
  if (name === "layout") {
    if (args.includes("floating")) {
      const visible = demo.windows.filter((win) => win.workspace === demo.workspace)
      const win = visible[demo.focus]
      if (win) win.floating = true
      return "Floating"
    }
    if (args.includes("tiling")) {
      const visible = demo.windows.filter((win) => win.workspace === demo.workspace)
      const win = visible[demo.focus]
      if (win) win.floating = false
      return "Tiling"
    }
    if (args.includes("accordion")) {
      demo.container = "accordion"
      return "Accordion"
    }
    if (args.includes("tiles")) {
      demo.container = "tiles"
      return "Tiles"
    }
  }
  if (name === "mode" && args[0]) {
    demo.mode = args[0]
    return `Mode ${args[0]}`
  }
  if (name === "flatten-workspace-tree") {
    demo.container = "tiles"
    demo.fullscreen = false
    for (const win of demo.windows) if (win.workspace === demo.workspace) win.floating = false
    return "Flattened"
  }
  if (name === "reload-config") return "Reloaded"
  return command
}

function workspaceTarget(config, current, token) {
  const total = config.workspaces
  if (token === "prev") return current > 1 ? current - 1 : current
  if (token === "next") return current < total ? current + 1 : current
  const number = Number(token)
  if (!Number.isFinite(number)) return null
  return Math.min(total, Math.max(1, number))
}

function moveFocus(config, demo, direction) {
  const visible = demo.windows.filter((win) => win.workspace === demo.workspace && !win.floating)
  if (visible.length < 2) return
  const delta = direction === "left" || direction === "up" ? -1 : 1
  demo.focus = (demo.focus + delta + visible.length) % visible.length
}

function swapFocus(demo, direction) {
  const visible = demo.windows.filter((win) => win.workspace === demo.workspace && !win.floating)
  const delta = direction === "left" || direction === "up" ? -1 : 1
  const next = demo.focus + delta
  if (next < 0 || next >= visible.length) return
  const a = demo.windows.indexOf(visible[demo.focus])
  const b = demo.windows.indexOf(visible[next])
  ;[demo.windows[a], demo.windows[b]] = [demo.windows[b], demo.windows[a]]
  demo.focus = next
}

export { motionMs }
