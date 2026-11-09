import fs from "node:fs"
import { parseToml, normalizeConfig, serializeConfig, patchConfig } from "./toml.js"
import {
  DISPLAY,
  tileArea,
  resolveGaps,
  contentRect,
  arrangeDwindle,
  arrangeFixed,
  arrangeMaster,
  arrangeScrolling,
  masterAssignment,
  layoutWindows,
} from "./layout.js"

const failures = []
function check(name, ok) {
  if (!ok) failures.push(name)
  else console.log("ok", name)
}

const rawText = fs.readFileSync("/Users/kyriacos/.config/dinky/dinky.toml", "utf8")
const parsed = parseToml(rawText)
check("workspaces", parsed.workspaces === 6)
check("workspace 6 untiled", parsed.workspace["6"].tiling === false)
check("border width", parsed.borders.width === 5)
check("transparent inactive", parsed.borders["inactive-color"] === "#00000000")
check("rules", parsed.rules.length === 10)
check("chrome rule", parsed.rules[3]["app-id"] === "com.google.Chrome")
check("hook", parsed.hooks.startup[0].includes("sort-windows.sh"))
check("binding", parsed.mode.main["alt-period"] === "focus right --wrap-around")
check("service list", parsed.mode.service.esc.length === 2)

const warnings = []
const config = normalizeConfig(parsed, warnings)
const again = normalizeConfig(parseToml(serializeConfig(config)))
check("roundtrip workspaces", again.workspaces === config.workspaces)
check("roundtrip rules", again.rules.length === config.rules.length)
check("roundtrip color", again.borders["active-color"] === "#9333ea")
check("roundtrip mode", again.mode.main["alt-h"] === "focus left")
check("roundtrip ws6", again.workspace["6"].tiling === false)
check("defaults filled", again.master.side === "left" && again.swipe.enabled === false)
check("no warnings", warnings.length === 0)

const dotted = parseToml("[display.main]\ngaps.outer.top = 44\nfullscreen-width = 0.55\n")
check("dotted gap", dotted.display.main.gaps.outer.top === 44)
check("display width", dotted.display.main["fullscreen-width"] === 0.55)

const quoted = parseToml("[display.'DELL U3421WE']\nlone-window-width = 0.75\n")
check("quoted display", quoted.display["DELL U3421WE"]["lone-window-width"] === 0.75)

const inline = parseToml("inner = { horizontal = 10, vertical = 4 }\n")
check("inline", inline.inner.horizontal === 10 && inline.inner.vertical === 4)

const tile = tileArea()
const gaps = resolveGaps({ gaps: { inner: 8, outer: 8 }, display: {} })
const content = contentRect(tile, gaps)
const two = arrangeDwindle(2, content, gaps.innerH, gaps.innerV)
check("dwindle side by side", two[0].w > 100 && two[1].x > two[0].x && Math.abs(two[0].y - two[1].y) < 1)

const four = arrangeDwindle(4, content, 8, 8)
check("dwindle four", four.length === 4 && four.every((win) => win.w > 40 && win.h > 40))

const fixed = arrangeFixed(1, content, 2, 3, "columns", 8, 8, 30, 0)
check("fixed empty cells", fixed.cells.length === 5 && fixed.windows.length === 1)

const grown = arrangeFixed(7, content, 2, 3, "columns", 8, 8, 30, 0)
check("fixed adds a column", grown.windows.length === 7 && grown.windows[6].x > grown.windows[0].x)

const center = masterAssignment(4)
check("master center stacks", center.left.length === 1 && center.right.length === 2)

const master = arrangeMaster(4, content, { size: 0.6, side: "center", gapH: 8, gapV: 8, accordion: false, padding: 30, focus: 0 })
check("master centered", master[0].x > content.x + 40 && master.some((win) => win.x < master[0].x))

const lone = layoutWindows({
  layout: "dwindle",
  count: 1,
  tile,
  gaps,
  lone: true,
  widthFraction: 0.5,
})
check(
  "lone width",
  Math.abs(lone.windows[0].w - content.w * 0.5) < 2 && lone.windows[0].x > content.x,
)

check("display size", DISPLAY.w === 1440)

function tag(config) {
  config.rules.forEach((rule, index) => {
    rule._id = `r${index + 1}`
  })
  return config
}

const before = tag(structuredClone(config))
const identity = patchConfig(rawText, before, structuredClone(before))
check("patch leaves the file untouched", identity.text === rawText.replace(/\r\n/g, "\n") && identity.changes.length === 0)

const edited = structuredClone(before)
edited.workspaces = 7
edited.borders.width = 6
const patched = patchConfig(rawText, before, edited)
check("patch changes workspaces", patched.text.includes("workspaces = 7") && patched.text.includes("# across all displays"))
check("patch changes border width", /^width = 6$/m.test(patched.text))
check("patch keeps the colour comment", patched.text.includes("active-color = '#9333ea'") && patched.text.includes("# saturated purple"))
check("patch keeps the Chrome rule", patched.text.includes("app-id = 'com.google.Chrome'\nrun = 'move-window-to-workspace 1'"))
check("patch does not invent untouched sections", !patched.text.includes("follow-space-order") && !patched.text.includes("[scrolling]") && !patched.text.includes("[master]"))
check("patched text round-trips", patchConfig(patched.text, edited, structuredClone(edited)).text === patched.text)

const ruled = structuredClone(before)
const chrome = ruled.rules.find((rule) => rule["app-id"] === "com.google.Chrome")
chrome.run = "move-window-to-workspace 5"
const rulePatch = patchConfig(rawText, before, ruled)
check("patch edits one rule", rulePatch.text.includes("app-id = 'com.google.Chrome'\nrun = 'move-window-to-workspace 5'"))
check("patch keeps the next rule", rulePatch.text.includes("app-id = 'com.mitchellh.ghostty'\nrun = 'move-window-to-workspace 2'"))
check("patch keeps the settings comment", rulePatch.text.includes("# also: app-name"))

const added = structuredClone(before)
added.rules.push({ _id: "new", "app-id": "com.example.demo", run: "layout floating" })
const addedPatch = patchConfig(rawText, before, added)
check("patch appends a rule", addedPatch.text.includes("[[rules]]\napp-id = 'com.example.demo'\nrun = 'layout floating'"))
check("patch keeps existing rule blocks", addedPatch.text.includes("app-id = 'com.google.Chrome'\nrun = 'move-window-to-workspace 1'"))

const perSide = structuredClone(before)
perSide.gaps.outer = { top: 44, bottom: 8, left: 8, right: 8 }
const gapPatch = patchConfig(rawText, before, perSide)
check("patch rewrites one gap value", gapPatch.text.includes("outer = { top = 44, bottom = 8, left = 8, right = 8 }") && gapPatch.text.includes("# or { top = 8"))

const scrolled = arrangeScrolling(4, content, tile, 1, 0.49, 8)
const parked = scrolled.filter((win) => win.parked)
check(
  "scrolling sliver is wide enough to see",
  parked.some((win) => {
    const visible = win.parked === "left" ? win.x + win.w - tile.x : tile.x + tile.w - win.x
    return visible > 50 && visible < 80
  }),
)

if (failures.length) {
  console.error("FAILED", failures)
  process.exit(1)
}
console.log("all checks passed")
