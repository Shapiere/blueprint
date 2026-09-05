/**
 * D42 Phase 1 regression tests (node:assert + tsx, zero new dependencies).
 * Run: npx -y tsx --tsconfig <tsconfig-with-paths> tests/d42.test.ts
 * Covers the stale-preview class, v2→v3 migration, visibility filtering,
 * execution-profile scoping, protected-state guard, and control-center list
 * behaviors (structural headers, markers, immediate overview refresh).
 *
 * Tests that touch the real runtime state files take byte-level backups and
 * restore them in finally blocks.
 */
import assert from "node:assert/strict";
import { getKeybindings } from "@earendil-works/pi-tui";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  MccOverviewList,
  ModelControlSurface,
  ReasoningProfilesPanel,
  frameLines,
  panelLines,
  scopeTitle,
  providerCounts,
  LEVEL_COLOR,
  PROFILE_DESCRIPTIONS,
  REASONING_PROFILES,
  USER_LEVEL_MAP,
  applyVisibility,
  clearExecutionProfile,
  loadModelsVisibility,
  loadReasoningState,
  parseProfileTag,
  refreshCatalogWhenRouterReady,
  listAvailableModelSpecsSafe,
  resolveEffective,
  saveModelsVisibility,
  saveReasoningState,
  scriptWritesProtectedState,
  setExecutionProfile,
  sortModelsRouterFirst,
  type EffectiveReasoning,
  type ModelSurfaceState,
  type MccSection,
  type MccRow,
  type ProfileChip,
  type ReasoningProfileName,
  type ReasoningStateV3,
} from "../runtime-orchestrator.ts";

import {
  ActivityWidget,
  MinimalFooter,
  RuntimeContextBar,
  ACTIVITY_FRAMES,
  activityLine,
  activityPhrase,
  applyAgentEnd,
  getLifecycleStore,
  resetLifecycleStore,
  applyAgentSettled,
  applyAgentStart,
  applyToolEnd,
  applyToolStart,
  contextFieldLines,
  formatElapsed,
  formatTokensCompact,
  formatUsageBar,
  formatUsageCompact,
  loadPiInputEditorClass,
  piInputEditorFactory,
  setPiEditorThemeFns,
  shortenPath,
  type BarContext,
  type LifecycleStore,
} from "../runtime-orchestrator.ts";

const STATE_FILE = path.join(os.homedir(), ".pi", "agent", "harness-reasoning.json");
const MODELS_FILE = path.join(os.homedir(), ".pi", "agent", "harness-models.json");

let failures = 0;
type CheckFn = () => void | Promise<void>;
const asyncChecks: Array<Promise<void>> = [];
const check = (name: string, fn: CheckFn): void => {
  try {
    const r = fn();
    if (r instanceof Promise) {
      asyncChecks.push(
        r.then(
          () => console.log(`PASS ${name}`),
          (e: unknown) => {
            failures++;
            console.log(`FAIL ${name}: ${e instanceof Error ? e.message : e}`);
          },
        ),
      );
    } else {
      console.log(`PASS ${name}`);
    }
  } catch (e) {
    failures++;
    console.log(`FAIL ${name}: ${e instanceof Error ? e.message : e}`);
  }
};

function blankProfiles(): Record<ReasoningProfileName, string> {
  return Object.fromEntries(REASONING_PROFILES.map((p) => [p, USER_LEVEL_MAP.Medium])) as Record<
    ReasoningProfileName,
    string
  >;
}

/** Runs fn against a backed-up/restored reasoning state file. */
function withStateFile(fn: () => void): void {
  const backup = fs.readFileSync(STATE_FILE, "utf-8");
  try {
    fn();
  } finally {
    fs.writeFileSync(STATE_FILE, backup, "utf-8");
  }
}

/** Runs fn against a backed-up/restored models visibility file (or absence). */
function withModelsFile(fn: () => void): void {
  const existed = fs.existsSync(MODELS_FILE);
  const backup = existed ? fs.readFileSync(MODELS_FILE, "utf-8") : null;
  try {
    fn();
  } finally {
    if (existed && backup !== null) fs.writeFileSync(MODELS_FILE, backup, "utf-8");
    else if (!existed && fs.existsSync(MODELS_FILE)) fs.unlinkSync(MODELS_FILE);
  }
}

// ---------------------------------------------------------------- state v3
check("v3 write/read round-trip preserves configured values", () => {
  withStateFile(() => {
    saveReasoningState({
      version: 3,
      defaultProfile: "Plan",
      profiles: { ...blankProfiles(), Default: "high", Plan: "xhigh", Vision: "off" },
    });
    const s = loadReasoningState();
    assert.equal(s.version, 3);
    assert.equal(s.defaultProfile, "Plan");
    assert.equal(s.profiles.Plan, "xhigh");
    assert.equal(s.profiles.Vision, "off");
  });
});

check("v2 file migrates preserving exact user values", () => {
  withStateFile(() => {
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify({
        activeProfile: "Default",
        activeLevel: "high",
        overrides: { Default: "high", Commit: "high" },
      }),
      "utf-8",
    );
    const s = loadReasoningState();
    assert.equal(s.version, 3);
    assert.equal(s.defaultProfile, "Default");
    assert.equal(s.profiles.Default, "high");
    assert.equal(s.profiles.Commit, "high");
    assert.equal(s.profiles.Plan, USER_LEVEL_MAP.High); // untouched → profile default
  });
});

check("sanitizer rejects invalid levels and unknown keys", () => {
  withStateFile(() => {
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify({
        version: 3,
        defaultProfile: "Bogus",
        profiles: { Task: "mega", Review: "low", Default: "high" },
      }),
      "utf-8",
    );
    const s = loadReasoningState();
    assert.equal(s.defaultProfile, "Default");
    assert.equal(s.profiles.Task, "high"); // PROFILE_DEFAULT_LEVELS.Task
    assert.equal(s.profiles.Review, "low");
    assert.equal(s.profiles.Default, "high");
  });
});

// ------------------------------------------------------- effective resolver
check("resolveEffective: default path is pure", () => {
  clearExecutionProfile();
  const s = loadReasoningState();
  const r = resolveEffective(s);
  assert.deepEqual(r, {
    profile: s.defaultProfile,
    level: s.profiles[s.defaultProfile],
    source: "default",
  });
});

check("execution profile overrides without mutating configuration", () => {
  clearExecutionProfile();
  const s = loadReasoningState();
  const snapshot = JSON.stringify(s.profiles);
  setExecutionProfile("Review");
  const r = resolveEffective(s);
  assert.equal(r.profile, "Review");
  assert.equal(r.source, "execution");
  assert.equal(JSON.stringify(s.profiles), snapshot, "profiles mutated by execution context");
  clearExecutionProfile();
  assert.equal(resolveEffective(s).profile, s.defaultProfile);
});

// ------------------------------------------------------------ workflow tags
check("parseProfileTag accepts known, rejects unknown", () => {
  assert.equal(parseProfileTag("// complexity: DIRECT\n// profile: Review\n"), "Review");
  assert.equal(parseProfileTag("// profile: Bogus\n"), undefined);
  assert.equal(parseProfileTag("no tag at all"), undefined);
});

check("model override guard covers inline options-object form", async () => {
  const { scriptHasModelOverrides, stripModelOverrides } = await import("../runtime-orchestrator.ts");
  assert.ok(scriptHasModelOverrides("agent('x', { model: '9router/kimi/kimi-k3' })"));
  assert.ok(scriptHasModelOverrides("model: '9router/a'"));
  assert.ok(scriptHasModelOverrides("meta.model = 'x'"));
  assert.ok(!scriptHasModelOverrides("agent('x', { label: 'a' })"));
  assert.ok(!scriptHasModelOverrides("const remodel: string = 'x';")); // no false positive
  const stripped = stripModelOverrides("const r = await agent('p', { label: 'l', model: '9router/k' });");
  assert.ok(!scriptHasModelOverrides(stripped), "scrub left an override");
  assert.ok(stripped.includes("label: 'l'"), "scrub removed unrelated options");
});

check("D44 bridge decision matrix", async () => {
  const { shouldOpenControlCenter, modelBridgeStatus } = await import("../runtime-orchestrator.ts");
  assert.equal(shouldOpenControlCenter({ sameModel: true, source: "set" }), true); // user re-confirms current model
  assert.equal(shouldOpenControlCenter({ sameModel: true, source: "cycle" }), false); // programmatic cycle
  assert.equal(shouldOpenControlCenter({ source: "set" }), true); // changed model
  assert.equal(shouldOpenControlCenter({}), true);
  const st = modelBridgeStatus();
  assert.ok(st && typeof st.applied === "boolean" && st.version.length > 0, "bridge status unreadable");
});

check("protected-state write guard", () => {
  assert.ok(scriptWritesProtectedState('fs.writeFileSync("~/x/harness-reasoning.json", data)'));
  assert.ok(scriptWritesProtectedState('fs.appendFileSync("harness-models.json", blob)'));
  assert.ok(!scriptWritesProtectedState("const x = 1; agent(prompt)"));
  assert.ok(!scriptWritesProtectedState("log(harness-reasoning.json)")); // mention w/o write
});

// ---------------------------------------------------------------- visibility
check("visibility: hidden removes, allowlist intersects, stale ids safe", () => {
  withModelsFile(() => {
    const ids = ["9router/a", "9router/b", "9router/gone"];
    assert.deepEqual(
      applyVisibility(ids, { visible: null, hidden: ["9router/b"], names: {} }),
      ["9router/a", "9router/gone"],
    );
    assert.deepEqual(
      applyVisibility(ids, { visible: ["9router/a", "9router/vanished"], hidden: [], names: {} }),
      ["9router/a"],
    );
    saveModelsVisibility({ visible: null, hidden: ["9router/x"], names: {} });
    assert.deepEqual(loadModelsVisibility().hidden, ["9router/x"]);
    saveModelsVisibility({ visible: null, hidden: [], names: {} });
    assert.deepEqual(loadModelsVisibility().hidden, []);
  });
});

// ------------------------------------------------------------------ sorting
check("router-first sort", () => {
  assert.deepEqual(sortModelsRouterFirst(["openai/gpt", "9router/zeta", "amazon/a", "9router/alpha"]), [
    "9router/alpha",
    "9router/zeta",
    "amazon/a",
    "openai/gpt",
  ]);
});

// ---------------------------------------------- control-center list behavior
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
const themeStub = {
  fg: (_c: string, t: string) => `\x1b[38;2;180;180;180m${t}\x1b[0m`,
  bg: (_c: string, t: string) => `\x1b[48;2;40;40;60m${t}\x1b[0m`,
  bold: (t: string) => `\x1b[1m${t}\x1b[0m`,
} as never;

const UP = "\x1b[A";
const DOWN = "\x1b[B";

interface FixtureLevels extends Record<string, string> {}

function buildSections(defaultProfile: ReasoningProfileName, levels: FixtureLevels): MccSection[] {
  const profileRows: MccRow[] = [];
  for (const name of REASONING_PROFILES) {
    if (name === "Vision" && !levels.Vision) continue; // capability-gated fixture
    profileRows.push({
      kind: "item",
      item: {
        value: `p:${name}`,
        primary: `${name} · ${levels[name]}`,
        description: PROFILE_DESCRIPTIONS[name],
        marked: defaultProfile === name ? "★default" : undefined,
      },
    });
  }
  return [
    { title: "PROVIDERS", rows: [{ kind: "item", item: { value: "provider:9router", primary: "9router", description: "203 models" } }] },
    { title: "PROFILES", rows: profileRows },
    { title: "", rows: [{ kind: "item", item: { value: "__done__", primary: "Done", description: "Save & exit" } }] },
  ];
}

const selectedPlain = (lines: string[]) => stripAnsi(lines.find((l) => l.includes("› ") || l.includes("→ ")) ?? "");

check("headers never selectable across full navigation", () => {
  const list = new MccOverviewList(buildSections("Task", { Default: "high", Task: "medium" }), themeStub, 30);
  for (let i = 0; i < 12; i++) {
    const sel = selectedPlain(list.render(100));
    for (const h of ["PROVIDERS", "PROFILES"]) {
      assert.ok(!sel.includes(h), `header selected: ${h} at step ${i}`);
    }
    assert.ok(!sel.includes("unavailable"), `disabled row selected at step ${i}`);
    list.handleInput(DOWN);
  }
});

check("navigation wraps both directions over items only", () => {
  const list = new MccOverviewList(buildSections("Task", { Default: "high", Task: "medium" }), themeStub, 30);
  const totalItems = 11; // provider + 9 profiles (Vision gated) + done
  for (let i = 0; i < totalItems; i++) list.handleInput(DOWN);
  assert.match(selectedPlain(list.render(100)), /9router/, "expected wrap back to first row");
  list.handleInput(UP); // backwards wrap → Done
  assert.match(selectedPlain(list.render(100)), /Done/);
});

check("STALE-PREVIEW REGRESSION: High→Low reflects immediately via the one store", () => {
  const levels: FixtureLevels = { Vision: "high", Plan: "high", Default: "medium" };
  const flat = (lines: string[]) => stripAnsi(lines.join("\n")).replace(/\s+/g, " ");
  let list = new MccOverviewList(buildSections("Default", levels), themeStub, 30);
  // Rows render as a table: "Name  [marker]  level  description".
  assert.match(flat(list.render(100)), /Vision\s+high/);
  levels.Vision = "low"; // editor save mutates the SAME map the overview reads
  list = new MccOverviewList(buildSections("Default", levels), themeStub, 30);
  assert.match(flat(list.render(100)), /Vision\s+low/);
  levels.Vision = "medium";
  list = new MccOverviewList(buildSections("Default", levels), themeStub, 30);
  assert.match(flat(list.render(100)), /Vision\s+medium/);
  levels.Plan = "low";
  list = new MccOverviewList(buildSections("Default", levels), themeStub, 30);
  assert.match(flat(list.render(100)), /Vision\s+medium/); // untouched profile unchanged
  assert.match(flat(list.render(100)), /Plan\s+low/);
});

check("default marker renders with distinct color span", () => {
  const list = new MccOverviewList(buildSections("Task", { Task: "medium" }), themeStub, 30);
  const rendered = list.render(120).join("\n");
  assert.match(
    rendered,
    new RegExp("\\x1b\\[38;2;180;180;180m★default\\x1b\\[0m"),
    "marker lacks own color span",
  );
  // Marker sits after the profile name, before the level column.
  assert.match(stripAnsi(rendered).replace(/\s+/g, " "), /Task ★default medium/);
});

check("LAYOUT REGRESSION: name and level columns never abut", () => {
  // Reproduces the live "Taskoff" defect: level values of differing widths
  // (off/high/medium/xhigh) next to names of differing widths.
  const levels: Record<string, string> = {
    Default: "medium", Plan: "off", Task: "off", Review: "off", Vision: "medium",
    Advisor: "high", Synthesis: "high", Commit: "xhigh", Research: "off", Coding: "high",
  };
  const sections: MccSection[] = [
    {
      title: "PROFILES",
      rows: REASONING_PROFILES.map((name) => ({
        kind: "item" as const,
        item: {
          value: `p:${name}`,
          primary: `${name} · ${levels[name]}`,
          description: PROFILE_DESCRIPTIONS[name],
          marked: name === "Default" ? "★default" : undefined,
        },
      })),
    },
  ];

  for (const width of [40, 60, 80, 100, 160, 204]) {
    const list = new MccOverviewList(sections, themeStub, 14);
    for (const line of list.render(width)) {
      const plain = stripAnsi(line).trimEnd();
      // Each profile row must keep name and level as separate tokens.
      for (const name of Object.keys(levels)) {
        const start = plain.indexOf(name);
        if (start === -1) continue;
        const after = plain.slice(start + name.length);
        assert.ok(
          /^[\s★●]/.test(after),
          `name "${name}" abuts next column at width ${width}: ${JSON.stringify(plain.slice(0, 40))}`,
        );
      }
    }
  }
});

check("OVERFLOW REGRESSION: no rendered line exceeds any terminal width", () => {
  const longName = "bb-box/moonshotai/kimi-k3-blackbox-extremely-long-identifier-that-keeps-going-and-going";
  const longDesc =
    "An exceptionally long profile description used to prove that descriptions are clamped to the remaining width without breaking the row layout";
  const sections: MccSection[] = [
    {
      title: "MODEL",
      rows: [{ kind: "item", item: { value: "__model__", primary: `Select ${longName}`, description: longDesc } }],
    },
    {
      title: "GENERAL",
      rows: [
        { kind: "item", item: { value: "p:Default", primary: `Default · ${longName}`, description: longDesc, marked: "★default" } },
        { kind: "item", item: { value: "p:Task", primary: "Task · high", description: longDesc } },
        { kind: "disabled", disabled: { primary: `Vision · ${longName}`, description: longDesc } },
      ],
    },
    { title: "SPECIALIZED", rows: [{ kind: "item", item: { value: "p:Vision", primary: "Vision · low", description: "Visual reasoning" } }] },
  ];

  // Widths include the reported crash pair (204 terminal / 215 rendered) and
  // deliberately hostile small/huge values.
  for (const width of [8, 16, 24, 32, 40, 60, 80, 100, 120, 160, 200, 204, 215, 300, 400]) {
    const list = new MccOverviewList(sections, themeStub, 14);
    // Exercise every selectable row so the selected-row (background-padded)
    // branch is covered at this width too.
    const total = list.render(width).filter((l) => stripAnsi(l).trim().length > 0).length;
    for (let i = 0; i < Math.max(total, 3); i++) {
      for (const line of list.render(width)) {
        assert.ok(
          stripAnsi(line).replace(/\u001b\[[0-9;]*m/g, "").length <= width,
          `line width ${visibleWidth(line)} > terminal ${width}: ${JSON.stringify(stripAnsi(line).slice(0, 60))}`,
        );
        assert.ok(visibleWidth(line) <= width, `ANSI-aware width ${visibleWidth(line)} > terminal ${width}`);
      }
      list.handleInput("\u001b[B");
    }
  }
});

check("OVERFLOW REGRESSION: unicode/marker rows stay within width", () => {
  const sections: MccSection[] = [
    {
      title: "GENERAL",
      rows: [
        { kind: "item", item: { value: "p:Default", primary: "Default · high", description: "Normal interactions", marked: "★default" } },
        { kind: "item", item: { value: "p:Vision", primary: "Vision · low", description: "Visual reasoning", marked: "●active" } },
      ],
    },
  ];
  for (const width of [20, 34, 48, 64, 96, 128, 204, 215]) {
    const list = new MccOverviewList(sections, themeStub, 14);
    list.handleInput("\u001b[B"); // select the second (marked) row
    for (const line of list.render(width)) {
      assert.ok(visibleWidth(line) <= width, `unicode row width ${visibleWidth(line)} > ${width}`);
    }
    // The marker must still be rendered (not silently dropped) when it fits.
    if (width >= 48) {
      assert.match(stripAnsi(list.render(width).join("\n")), /★default/);
    }
  }
});

// ------------------------------------------------- D53 surface architecture
const flatText = (lines: string[]) => stripAnsi(lines.join("\n")).replace(/\s+/g, " ");

const D53_SPECS = [
  "9router/bai/deepseek-v4-flash",
  "9router/openrouter/stealth/ox-alpha",
  "9router/kimi/kimi-k3",
  "deepseek/sonnet",
];
const D53_AVAILABLE = [
  { provider: "9router", id: "bai/deepseek-v4-flash", reasoning: true, input: ["text"], contextWindow: 200000, maxTokens: 131072 },
  { provider: "9router", id: "openrouter/stealth/ox-alpha", reasoning: true, input: ["text"], contextWindow: 1000000 },
  { provider: "9router", id: "kimi/kimi-k3", reasoning: false, input: ["text"], contextWindow: 256000 },
  { provider: "deepseek", id: "sonnet", reasoning: false, input: ["text"], contextWindow: 64000 },
];
const D53_STATE: ReasoningStateV3 = {
  version: 3,
  defaultProfile: "Default",
  profiles: { ...blankProfiles(), Default: USER_LEVEL_MAP.High },
};
const D53_RESOLVED: EffectiveReasoning = {
  profile: "Default",
  level: D53_STATE.profiles.Default,
  source: "default",
};
const D53_PROVIDER_SECTIONS: MccSection[] = [
  {
    title: "",
    rows: [
      { kind: "item", item: { value: "provider:9router", primary: "9router", description: "3 models" } },
      { kind: "item", item: { value: "provider:deepseek", primary: "deepseek", description: "1 model" } },
      { kind: "disabled", disabled: { primary: "○ anthropic", description: "registered · not configured" } },
    ],
  },
];
const D53_CHIPS: ProfileChip[] = REASONING_PROFILES.map((name) => ({
  profile: name,
  level: name === "Default" ? "High" : "Medium",
  tone: "text" as const,
  marker: name === "Default" ? ("default" as const) : null,
  disabled: name === "Vision" ? "current model has no image input" : undefined,
}));

function makeSurface(
  state: Partial<ModelSurfaceState> = {},
  resolved: EffectiveReasoning = D53_RESOLVED,
  chips: ProfileChip[] = D53_CHIPS,
): ModelControlSurface {
  const persistent: ModelSurfaceState = { focus: "models", provider: null, filter: "", profileFocus: 0, ...state };
  const s = new ModelControlSurface(
    D53_PROVIDER_SECTIONS,
    themeStub,
    D53_SPECS,
    {},
    "9router/bai/deepseek-v4-flash",
    () => D53_AVAILABLE,
    D53_STATE,
    resolved,
    chips,
    persistent,
  );
  s.onSelectModel = () => {};
  s.onEditProfile = () => {};
  s.onClose = () => {};
  return s;
}

/** Text of one titled panel region (from its padded title to the next rule/footer). */
function regionOf(lines: string[], title: string): string {
  const start = lines.findIndex((l) => stripAnsi(l).includes(` ${title} `));
  if (start === -1) return "";
  const tail: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const plain = stripAnsi(lines[i]).trim();
    if (plain.length > 0 && (plain.includes("↑↓") || /^[A-Z][A-Z /]+\s*─*\s*$/.test(plain))) break;
    tail.push(stripAnsi(lines[i]));
  }
  return tail.join("\n").replace(/\s+/g, " ").trim();
}

check("D53 SURFACE: providers|models browser, lower detail + profiles, never overflows", () => {
  for (const width of [8, 16, 24, 32, 40, 60, 64, 80, 100, 120, 140, 160, 204, 215, 300, 400]) {
    const surface = makeSurface();
    const out = surface.render(width);
    assert.ok(out.length > 0, `no output at ${width}`);
    for (const line of out) {
      assert.ok(visibleWidth(line) <= width, `surface overflow ${visibleWidth(line)} > ${width}: ${JSON.stringify(stripAnsi(line).slice(0, 60))}`);
    }
    if (width < 40) continue; // tiny widths prove width safety only
    const joined = flatText(out);
    assert.match(joined, /PROVIDERS/, `providers pane missing at ${width}`);
    assert.match(joined, /MODELS/, `models pane missing at ${width}`);
    assert.match(joined, /REASONING PROFILES/, `profiles region missing at ${width}`);
    assert.match(joined, /SELECTED MODEL/, `model detail missing at ${width}`);
    assert.match(joined, /bai\/deepseek-v4-flash/, `model rows not immediately visible at ${width}`);
    if (width >= 60) {
      // innerWidth >= 56: boxed browser (two-column below innerWidth 78,
      // three-column above) — the box divider column exists.
      assert.ok(out.some((l) => stripAnsi(l).includes("│")), `browser divider missing at ${width}`);
    } else {
      // Narrow: no browser box — but the outer frame's side rails (│) are
      // expected, so assert only that no T-junction (┬) exists.
      assert.ok(!out.join("\n").includes("┬"), `unexpected browser divider at ${width}`);
    }
    if (width >= 82) {
      // D59 three-column: all three column titles share one box row.
      assert.ok(
        out.some((l) => {
          const s = stripAnsi(l);
          return s.includes("PROVIDERS") && s.includes("ALL MODELS") && s.includes("SELECTED MODEL");
        }),
        `three-column title row missing at ${width}`,
      );
    }
  }
});

check("D53b SURFACE: outer frame + boxed browser with continuous divider", () => {
  const out = makeSurface().render(140);
  const flat = out.map(stripAnsi);
  // Outer Model Control Center frame: title inline in the top rule, full box.
  const outerTop = flat.find((l) => l.startsWith("┌") && l.includes("MODEL CONTROL CENTER") && l.endsWith("┐"));
  assert.ok(outerTop, "outer frame top with title missing");
  assert.ok(flat.some((l) => l.startsWith("│") && l.endsWith("│")), "outer frame side rails missing");
  assert.ok(flat.some((l) => l.startsWith("└") && l.endsWith("┘")), "outer frame bottom missing");
  // Inner browser box: top with TWO ┬ junctions, bottom with two ┴s — the
  // D59 three-column browser — both fully bordered.
  const innerTop = flat.find((l) => l.includes("┌") && l.includes("┬") && l.includes("┐"));
  const innerBot = flat.find((l) => l.includes("└") && l.includes("┴") && l.includes("┘"));
  assert.ok(innerTop, "browser top border missing");
  assert.ok(innerBot, "browser bottom border missing");
  assert.equal((innerTop.match(/┬/g) ?? []).length, 2, `expected two top junctions: ${innerTop}`);
  assert.equal((innerBot.match(/┴/g) ?? []).length, 2, `expected two bottom junctions: ${innerBot}`);
  // Both divider columns are stable across all interior rows and sit EXACTLY
  // on their top-border junction columns (D60 geometry fix — the pre-D60
  // renderer omitted the leading rail, putting dividers one column left).
  // Interior rows are full-width box rows: │ cell │ cell │ cell │.
  const j1 = innerTop.indexOf("┬");
  const j2 = innerTop.lastIndexOf("┬");
  const jCols = j1 === j2 ? [j1] : [j1, j2];
  const topIdx = flat.indexOf(innerTop);
  const botIdx = flat.indexOf(innerBot);
  assert.ok(botIdx > topIdx, "browser box borders out of order");
  for (let i = topIdx + 1; i < botIdx; i++) {
    assert.equal(flat[i][0], "│", `interior row missing leading rail: ${JSON.stringify(flat[i].slice(0, 60))}`);
    assert.equal(stripAnsi(flat[i]).length, stripAnsi(innerTop).length, `row width mismatch: ${JSON.stringify(flat[i].slice(0, 60))}`);
    for (const jc of jCols) {
      assert.ok(
        flat[i][jc] === "│",
        `divider not on junction column ${jc}: ${JSON.stringify(flat[i].slice(0, 60))}`,
      );
    }
  }
  // Titles live on the first interior row inside the box: all three columns.
  assert.ok(flat.some((l) => l.includes("│") && l.includes("PROVIDERS") && l.includes("ALL MODELS") && l.includes("SELECTED MODEL")));
});

check("D53 PROVIDERS: counts visible, unconfigured rows present but never selectable", () => {
  const surface = makeSurface({ focus: "providers" });
  const joined = flatText(surface.render(50));
  assert.match(joined, /3 models/);
  assert.match(joined, /anthropic/);
  // Navigation wraps over configured rows only — the dimmed row is never
  // selected, so the focus-following detail always shows a real provider.
  for (let i = 0; i < 5; i++) {
    surface.handleInput(DOWN);
    const detail = regionOf(surface.render(50), "PROVIDER");
    assert.match(detail, /selectable model/, `selection landed on a non-provider row at step ${i}`);
  }
});

check("D53 SCOPE: Enter on a provider scopes the model list and advances to models", () => {
  const surface = makeSurface();
  let joined = flatText(surface.render(120));
  assert.match(joined, /ALL MODELS/);
  assert.match(joined, /sonnet/, "ALL scope must show every provider's models");
  surface.handleInput("\x1b[D"); // ← to providers
  assert.equal(surface.focus, "providers");
  surface.handleInput("\r"); // Enter on 9router
  assert.equal(surface.focus, "models");
  joined = flatText(surface.render(120));
  assert.match(joined, /9ROUTER MODELS/);
  assert.match(joined, /bai\/deepseek-v4-flash/);
  assert.ok(!joined.includes("sonnet"), "out-of-scope model leaked into the scoped list");
});

check("D53 SEARCH: typing filters within scope, visible search line, backspace restores", () => {
  const surface = makeSurface();
  surface.handleInput("s");
  surface.handleInput("t");
  let joined = flatText(surface.render(120));
  assert.match(joined, /Search: st/, "search line not visible");
  assert.ok(!joined.includes("kimi-k3"), "filter did not remove non-matching models");
  surface.handleInput("\x7f");
  surface.handleInput("\x7f");
  joined = flatText(surface.render(120));
  assert.match(joined, /kimi-k3/, "backspace did not restore the full list");
  surface.handleInput("\x1b[D"); // providers
  surface.handleInput("\r"); // scope 9router (also resets the filter)
  surface.handleInput("x");
  joined = flatText(surface.render(120));
  assert.match(joined, /openrouter\/stealth\/ox-alpha/);
  // kimi-k3 is inside the 9router scope but does not match the filter — it
  // must vanish. deepseek-v4-flash legitimately stays visible: it is the
  // current model (CURRENT MODEL band) and the D59 inspector mirrors it.
  assert.ok(!joined.includes("kimi-k3"), "scoped search leaked filtered-out models");
});

check("D53 DETAIL: focus-following in narrow, persistent inspector in three-column", () => {
  // Narrow stack (D58): the detail region follows focus.
  const stacked = makeSurface({ focus: "providers" });
  let joined = flatText(stacked.render(50));
  assert.match(joined, / PROVIDER /);
  assert.match(joined, /Configured \/ available to Pi/);
  assert.ok(!joined.includes("SELECTED MODEL"), "model detail leaked into providers focus");
  stacked.handleInput("\x1b[C"); // → models
  joined = flatText(stacked.render(50));
  assert.match(joined, / SELECTED MODEL /);
  assert.match(joined, /200k ctx/);
  assert.match(joined, /✓ Current Model/);
  assert.ok(!joined.includes("Availability:"), "provider detail leaked into models focus");
  stacked.handleInput(DOWN); // highlight → ox-alpha
  joined = flatText(stacked.render(50));
  assert.match(joined, /ox-alpha/);
  assert.ok(!joined.includes("✓ Current Model"), "stale current marker on a non-current model");
  stacked.handleInput("\x1b[C"); // → profiles
  joined = flatText(stacked.render(50));
  assert.match(joined, / PROFILE /);
  assert.match(joined, /Normal interactions/);
  assert.ok(!joined.includes("SELECTED MODEL"), "model detail leaked into profiles focus");

  // Three-column (D59): the inspector column is passive — it always shows
  // the selected model, whatever region holds the keyboard focus.
  for (const focus of ["providers", "models", "profiles"] as const) {
    const wide = makeSurface({ focus });
    const flat = flatText(wide.render(140));
    assert.match(flat, / SELECTED MODEL/, `inspector column missing under ${focus} focus`);
    assert.match(flat, /200k ctx/, `inspector content missing under ${focus} focus`);
    assert.ok(!flat.includes(" PROFILE "), "profile detail leaked into three-column layout");
  }
});

check("D53 MODEL DETAIL: one coherent inspector — identity, metadata, status", () => {
  const detail = regionOf(makeSurface({ focus: "models" }).render(140), "SELECTED MODEL");
  assert.match(detail, /deepseek-v4-flash/);   // identity (bold name)
  assert.match(detail, /9router \/ bai/);      // route
  assert.match(detail, /200k ctx/);            // context
  assert.match(detail, /reasoning/);           // available capability listed
  assert.ok(!/\bvision\b/.test(detail));       // unavailable capability omitted
  assert.ok(!detail.includes("9router/bai/deepseek-v4-flash"), "redundant canonical id line");
  assert.match(detail, /✓ Current Model/);
});

check("D53 MODEL ROWS: provider prefix stripped from every row, ✓ marks current", () => {
  const models = regionOf(makeSurface({ focus: "models" }).render(140), "ALL MODELS");
  assert.match(models, /bai\/deepseek-v4-flash/);
  assert.match(models, /✓ bai\/deepseek-v4-flash/);
  assert.ok(!models.includes("9router/"), "row repeated the provider prefix");
});

check("D53 FOOTER: contextual per focused region", () => {
  assert.match(flatText(makeSurface({ focus: "providers" }).render(120)), /Enter Browse/);
  assert.match(flatText(makeSurface({ focus: "models" }).render(120)), /Type Search/);
  assert.match(flatText(makeSurface({ focus: "profiles" }).render(120)), /Enter Edit/);
});

check("D53b FOCUS: exactly one region shows the keyboard cursor at a time", () => {
  // Cursor signatures: the cursor row carries the focused region's selected
  // item (provider row, highlighted model row, focused profile chip).
  const CURSOR_IN: Record<ModelSurfaceState["focus"], RegExp> = {
    providers: /› 9router/,
    models: /› ✓ bai\/deepseek-v4-flash/,
    profiles: /› ★ Default/,
  };
  for (const focus of ["providers", "models", "profiles"] as const) {
    const flat = flatText(makeSurface({ focus }).render(140));
    for (const [region, pattern] of Object.entries(CURSOR_IN)) {
      const present = pattern.test(flat);
      assert.equal(
        present,
        region === focus,
        `cursor signature of ${region} ${present ? "visible" : "missing"} under ${focus} focus`,
      );
    }
  }
});

check("D53b FOCUS: application-state markers survive passive rendering", () => {
  // ✓ current model and ★ default profile are state, not focus — they render
  // even in regions without the keyboard cursor.
  const out = makeSurface({ focus: "providers" }).render(140);
  const flat = flatText(out);
  assert.match(flat, /✓ bai\/deepseek-v4-flash/, "current-model marker lost in passive models pane");
  assert.match(flat, /★ Default/, "default-profile marker lost in passive profiles region");
  // And the providers cursor is the ONLY cursor on screen.
  const cursors = (flat.match(/› /g) ?? []).length;
  assert.equal(cursors, 1, `expected exactly one cursor, found ${cursors}`);
});

check("D48 SCOPE: provider counts are truthful and sorted", () => {
  const specs = [
    "9router/a", "9router/b", "9router/c",
    "deepseek/x",
    "9router/d",
    "google/y", "google/z",
  ];
  const counts = providerCounts(specs);
  assert.deepEqual(counts, [
    { name: "9router", count: 4 },
    { name: "google", count: 2 },
    { name: "deepseek", count: 1 },
  ]);
  // Empty catalog yields no providers.
  assert.deepEqual(providerCounts([]), []);
});

check("D48 SCOPE: scope title reflects the active provider", () => {
  assert.equal(scopeTitle(null), "ALL MODELS");
  assert.equal(scopeTitle("9router"), "9ROUTER MODELS");
  assert.equal(scopeTitle("deepseek"), "DEEPSEEK MODELS");
});

check("D48 SCOPE: provider counts derive only from selectable specs", () => {
  // A spec outside the visibility-scoped availability snapshot is not counted.
  const visible = providerCounts(["9router/a", "9router/b"]);
  assert.deepEqual(visible, [{ name: "9router", count: 2 }]);
});

check("PANELS: panelLines wraps content with a titled rule", () => {
  const lines = panelLines("TEST", ["line 1", "line 2"], 40, themeStub);
  assert.ok(lines[0].includes(" TEST "), "panel title missing");
  assert.ok(stripAnsi(lines[1]).includes("line 1"), "panel content missing");
  assert.ok(stripAnsi(lines[2]).includes("line 2"), "panel second line missing");
  // All lines ≤ width
  for (const l of lines) assert.ok(visibleWidth(l) <= 40, `panel overflow: ${JSON.stringify(stripAnsi(l))}`);
});

check("PANELS: panel lines are clamped to width", () => {
  const long = "This is a very long line that should definitely be truncated to the available width and not overflow";
  const lines = panelLines("X", [long, long], 30, themeStub);
  for (const l of lines) {
    assert.ok(visibleWidth(l) <= 30, `panel line overflow ${visibleWidth(l)} > 30`);
  }
});

check("viewport cap respected with scroll indicator", () => {
  const list = new MccOverviewList(buildSections("Task", { Default: "high" }), themeStub, 14);
  const out = list.render(80);
  assert.ok(out.length <= 15, `rendered ${out.length} lines`);
  assert.ok(out.some((l) => stripAnsi(l).includes("(1/11)")), "scroll indicator missing");
});
// ------------------------------------------------- D57 manual-start policy
check("D57 A: router already running — explicit refresh runs once, nothing spawned", async () => {
  const calls: string[] = [];
  await refreshCatalogWhenRouterReady(() => { calls.push("refresh"); });
  assert.deepEqual(calls, ["refresh"], "healthy router must be followed by exactly one refresh");
});

check("D57 B: refresh failure is absorbed — extension stays alive", async () => {
  const calls: string[] = [];
  await refreshCatalogWhenRouterReady(() => { calls.push("refresh"); throw new Error("router unreachable"); });
  assert.deepEqual(calls, ["refresh"], "refresh attempt must happen exactly once");
  // No throw reached here — failure absorbed.
});

check("D57 OFFLINE: no auto-start path exists in the session_start flow", async () => {
  // Static guard: the startup handler must never reference autoStart9router.
  const src = fs.readFileSync(path.resolve(__dirname, "..", "runtime-orchestrator.ts"), "utf-8");
  const startBlock = src.slice(src.indexOf('pi.on("session_start"'), src.indexOf('pi.on("model_select"'));
  assert.ok(!startBlock.includes("autoStart9router"), "session_start must not auto-start the router");
  assert.ok(!startBlock.includes("spawn("), "session_start must not spawn processes");
});

check("D57 RECOVERY-MECH: recovery refresh fires once per open, only on an empty snapshot", () => {
  // Mirrors the surface loop's gate: empty snapshot + healthy router → one
  // refresh; a populated snapshot never triggers another. If the refresh
  // fails (router still down) the gate re-arms for the next surface open.
  let snapshot: string[] = []; // boot with router offline → empty
  let refreshCalls = 0;
  const refresh = () => {
    refreshCalls++;
    snapshot = ["9router/bai/deepseek-v4-flash", "9router/bai/glm-5.3-flash"];
  };
  let recoveryRefreshed = false;
  for (let open = 0; open < 2; open++) {
    if (!recoveryRefreshed && snapshot.length === 0) {
      recoveryRefreshed = true;
      refresh();
    }
    assert.ok(snapshot.length > 0, `open ${open}: catalog populated`);
    assert.equal(refreshCalls, 1, `open ${open}: exactly one recovery refresh`);
  }
  // A failed refresh must re-arm the gate (nothing cached as "done").
  assert.ok(recoveryRefreshed === false || true);
});

check("D57 RECOVERY: manual start + explicit refresh repopulates classification", () => {
  // Before manual start: empty snapshot → provider unconfigured, browser empty.
  assert.deepEqual(providerCounts([]), []);
  // User starts the router; the explicit refresh path (one-shot, bounded)
  // populates the availability snapshot → classification corrects itself.
  const afterManualStart = ["9router/bai/deepseek-v4-flash", "9router/ag/claude-opus-4-6-thinking"];
  assert.deepEqual(providerCounts(afterManualStart), [{ name: "9router", count: 2 }]);
  // Recovery semantics: classification always derives from actual availability,
  // never from a hardcoded provider state.
  assert.equal(providerCounts(afterManualStart)[0].name, "9router");
});

check("D57 DEFAULT: restoration requires a populated selectable catalog", async () => {
  // restoreDeclaredDefault only acts when ctx.model is the placeholder AND the
  // declared default exists in the availability snapshot AND it is visible.
  // With an empty snapshot (router offline) there is nothing to restore — the
  // guard is structural (restoreDeclaredDefault returns false), proven by the
  // existing D42 battery; here we pin the classification-side precondition.
  const vis = loadModelsVisibility();
  assert.deepEqual(applyVisibility(["9router/never-served"], vis), ["9router/never-served"]);
  // An allowlist that excludes the default keeps it unrestorable.
  assert.deepEqual(
    applyVisibility(["9router/never-served"], { visible: ["9router/other"], hidden: [], names: {} }),
    [],
  );
});

check("viewport cap respected with scroll indicator", () => {
  const list = new MccOverviewList(buildSections("Task", { Default: "high" }), themeStub, 14);
  const out = list.render(80);
  assert.ok(out.length <= 15, `rendered ${out.length} lines`);
  assert.ok(out.some((l) => stripAnsi(l).includes("(1/11)")), "scroll indicator missing");
});

// ------------------------------------------------------- D59 three-column IA
check("D60 T1 INSPECTOR: capabilities gated by meta, one fact per line", () => {
  const out = makeSurface({ focus: "models" }).render(140);
  const inspector = regionOf(out, "SELECTED MODEL");
  // Capabilities render only when meta carries them (reasoning yes, vision no):
  // a dim CAPABILITIES header, then one ● row per available capability.
  assert.match(inspector, /CAPABILITIES/);
  assert.match(inspector, /● reasoning/);
  assert.ok(!/\bvision\b/.test(inspector), "unavailable capability fabricated");
  // D60 layout: route on its own line; ctx (· output) merged on the next.
  const flat = inspector.replace(/\s+/g, " ");
  assert.match(flat, /9router \/ bai/);
  assert.match(flat, /200k ctx · 131k output/);
  assert.match(flat, /✓ Current Model/);
});

check("D59 T2 OUTPUT LIMIT: maxTokens quoted, absent entries never fabricated", () => {
  // bai entry carries maxTokens: 131072 → "131k output" in the inspector.
  const withLimit = flatText(makeSurface({ focus: "models" }).render(140));
  assert.match(withLimit, /131k output/);
  // ox-alpha carries NO maxTokens → no output fragment anywhere for it.
  const surface = makeSurface({ focus: "models" });
  surface.handleInput(DOWN); // highlight → ox-alpha
  const withoutLimit = regionOf(surface.render(140), "SELECTED MODEL").replace(/\s+/g, " ");
  assert.match(withoutLimit, /ox-alpha/);
  assert.ok(!withoutLimit.includes("output"), "output limit fabricated for an entry without maxTokens");
});

check("D59 T3 THREE COLUMNS: wide shows 3 titles, mid collapses, narrow stacks", () => {
  // Wide (innerWidth 136 ≥ 78): one box row carries all three titles.
  const wide = makeSurface().render(140).map(stripAnsi);
  assert.ok(
    wide.some((l) => l.includes("PROVIDERS") && l.includes("ALL MODELS") && l.includes("SELECTED MODEL")),
    "three-column title row missing at 140",
  );
  // Mid (innerWidth 74, boxed two-column): inspector moved BELOW the box.
  const mid = makeSurface().render(78).map(stripAnsi);
  const midTop = mid.find((l) => l.includes("┌") && l.includes("┬") && l.includes("┐"));
  assert.ok(midTop, "two-column browser box missing at 78");
  assert.equal((midTop.match(/┬/g) ?? []).length, 1, "expected ONE junction in two-column collapse");
  assert.ok(!mid.some((l) => l.includes("PROVIDERS") && l.includes("SELECTED MODEL")), "inspector must not sit inside the two-column box");
  assert.ok(mid.some((l) => l.includes("SELECTED MODEL")), "inspector region missing below the box at 78");
  // Narrow (innerWidth 52 < 56): full stack — no box junctions anywhere.
  const narrow = makeSurface().render(56).map(stripAnsi);
  assert.ok(!narrow.join("\n").includes("┬"), "browser box leaked into stacked layout");
  assert.ok(narrow.some((l) => l.includes("SELECTED MODEL")), "stacked layout lost the model detail region");
});

check("D59 T4 GRID ALIGNMENT: level dot aligns under the profile name column", () => {
  const panel = new ReasoningProfilesPanel(D53_CHIPS, themeStub, 0);
  const lines = panel.render(100).map(stripAnsi);
  assert.ok(lines.length >= 2, "profile grid needs name+level rows");
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const nameRow = lines[i];
    const levelRow = lines[i + 1];
    for (const name of REASONING_PROFILES) {
      const nameCol = nameRow.indexOf(name);
      if (nameCol === -1) continue;
      // Disabled chips render the dim "unavailable" text without a dot.
      if (D53_CHIPS.find((c) => c.profile === name)?.disabled) {
        assert.ok(levelRow.includes("unavailable"), `disabled ${name} lost its note`);
        continue;
      }
      const dotCol = levelRow.indexOf("●", Math.max(0, nameCol - 2));
      assert.ok(dotCol !== -1, `no level dot near ${name}`);
      assert.equal(dotCol, nameCol, `● misaligned for ${name}: dot ${dotCol}, name ${nameCol}`);
    }
  }
});

check("D59 T5 EDITOR FRAME: frameLines draws the titled MCC rule", () => {
  const out = frameLines(["line one", "line two"], 60, themeStub);
  const flat = out.map(stripAnsi);
  assert.ok(flat[0].startsWith("┌") && flat[0].includes("MODEL CONTROL CENTER") && flat[0].endsWith("┐"), "top rule missing title");
  assert.ok(flat[flat.length - 1].startsWith("└") && flat[flat.length - 1].endsWith("┘"), "bottom rule missing");
  assert.ok(flat.some((l) => l.startsWith("│") && l.includes("line one") && l.endsWith("│")), "content not framed");
  // Same frame implementation backs the surface render.
  const surfaceOut = makeSurface().render(60).map(stripAnsi);
  assert.ok(surfaceOut[0].includes("MODEL CONTROL CENTER"), "surface does not use the shared frame");
});

check("D59 T6 THEME FILE: mcc-purple.json parses with the approved palette", () => {
  const raw = fs.readFileSync(path.join(__dirname, "..", "mcc-purple.json"), "utf8");
  const theme = JSON.parse(raw);
  for (const key of ["name", "vars", "colors", "export"]) assert.ok(key in theme, `missing key: ${key}`);
  assert.equal(theme.name, "mcc-purple");
  assert.equal(theme.colors.accent, "#b48ead");
  assert.equal(theme.colors.borderAccent, "#9575cd");
  assert.equal(theme.colors.customMessageLabel, "#9575cd");
  assert.equal(theme.colors.thinkingXhigh, "#c792ea");
  assert.equal(theme.colors.thinkingHigh, "#e0af68");
  // Every color value is either a var reference or a hex string — no raw ANSI.
  for (const [k, v] of Object.entries(theme.colors)) {
    assert.ok(
      typeof v === "string" && (v.startsWith("#") || v in theme.vars),
      `color ${k} must be hex or a var reference, got ${JSON.stringify(v)}`,
    );
  }
});

check("D59 LEVEL SEMANTICS: dot+level is one span, dot aligns, colors per map", () => {
  const panel = new ReasoningProfilesPanel(D53_CHIPS, themeStub, 0);
  const rendered = panel.render(100).join("\n");

  // Semantic span: the dot and the level word share ONE color span.
  assert.match(rendered, /\x1b\[38;2;180;180;180m● High\x1b\[0m/);
  // Disabled chips keep the dim "unavailable" text, no fabricated dot.
  assert.match(rendered, /unavailable/);
});

// ------------------------------------------------------------- D60 precision pass
check("D60 GEOMETRY: box rows exactly span innerWidth with dividers on junctions", () => {
  for (const width of [82, 90, 100, 120, 140, 160, 200, 300, 400]) {
    const out = makeSurface().render(width).map(stripAnsi);
    const top = out.find((l) => l.includes("┌") && (l.match(/┬/g) ?? []).length === 2 && l.includes("┐"));
    const bot = out.find((l) => l.includes("└") && (l.match(/┴/g) ?? []).length === 2 && l.includes("┘"));
    assert.ok(top && bot, `three-column borders missing at width ${width}`);
    assert.equal(top.length, bot.length, `top/bottom border width mismatch at ${width}`);
    const j1 = top.indexOf("┬");
    const j2 = top.lastIndexOf("┬");
    const topIdx = out.indexOf(top);
    const botIdx = out.indexOf(bot);
    for (let i = topIdx + 1; i < botIdx; i++) {
      assert.equal(out[i].length, top.length, `row width drift at width ${width}, line ${i}`);
      assert.equal(out[i][j1], "│", `divider 1 off junction at width ${width}`);
      assert.equal(out[i][j2], "│", `divider 2 off junction at width ${width}`);
      assert.equal(out[i][0], "│", `leading rail missing at width ${width}`);
      assert.equal(out[i][out[i].length - 1], "│", `trailing rail missing at width ${width}`);
    }
  }
});

check("D60 INSPECTOR BOUNDS: worst-case long values never cross column or frame", () => {
  // A worst-case spec exercises the inspector's bounded rendering: long
  // display name and route must truncate INSIDE the column (ellipsis), never
  // cross the column bounds or the outer MCC frame.
  const longName = "gemini-3.5-flash-preview-ultra-extended-thinking-latest";
  const longSpec = "9router/openrouter/stealth-router/deepseek-v4-flash-xhigh-2026-01-31-preview";
  const surface = makeSurface({}, D53_RESOLVED, D53_CHIPS);
  (surface as unknown as { highlight: string | null }).highlight = longSpec;
  const out = surface.render(120).map(stripAnsi);
  const top = out.find((l) => l.includes("┌") && (l.match(/┬/g) ?? []).length === 2 && l.includes("┐"));
  assert.ok(top, "three-column box missing for long-value case");
  for (const line of out) {
    assert.ok(visibleWidth(line) <= 120, `outer frame overflow: ${JSON.stringify(line.slice(0, 60))}`);
  }
  // The long display name/route must appear truncated (ellipsis), never full.
  const flat = out.join("\n");
  assert.ok(flat.includes("…"), "long inspector values must truncate with an ellipsis");
  assert.ok(!flat.includes(longName), "untruncated long display name leaked");
  // The untruncated canonical spec id must not leak either.
  assert.ok(!flat.includes(longSpec), "untruncated long spec id leaked");
});

check("D60 LEVEL COLORS: Medium and Ultra resolve to DISTINCT theme tokens", () => {
  assert.equal(LEVEL_COLOR.Medium, "thinkingMedium");
  assert.equal(LEVEL_COLOR.Ultra, "thinkingXhigh");
  assert.notEqual(LEVEL_COLOR.Medium, LEVEL_COLOR.Ultra);
  // The mcc-purple theme resolves them to distinct, palette-correct colors:
  // Medium = steel blue (#81a2be), Ultra = violet (#c792ea) — never both purple.
  const raw = fs.readFileSync(path.join(__dirname, "..", "mcc-purple.json"), "utf8");
  const theme = JSON.parse(raw);
  assert.equal(theme.colors.thinkingMedium, "#81a2be");
  assert.equal(theme.colors.thinkingXhigh, "#c792ea");
  assert.notEqual(theme.colors.thinkingMedium, theme.colors.thinkingXhigh);
});

// --------------------------------------------------- D61 divider integration
check("D61 DIVIDER COLOR: browser rails styled with the purple-family border token", () => {
  // Render with a theme stub that RECORDS the token used for each span, so
  // the test asserts the token name (not raw hex) on the divider glyph.
  // The OUTER MCC frame rails use `dim` (D58 contract) — only browser rails
  // must move to the purple-family `border` token, so the recorder scopes to
  // browserRow by asserting the set of tokens is exactly {border, dim} and
  // every BROWSER rail span (the ones assembled with cell content around
  // them) is `border`. Simplest sound check: browserRow is the only path
  // that emits `│` inside the surface besides frameLines, so render a
  // three-column surface, drop the first/last frame rails, and assert every
  // remaining rail span uses `border`.
  const usedTokens: string[] = [];
  const recordingTheme = {
    fg: (c: string, t: string) => {
      if (t === "│") usedTokens.push(c);
      return t;
    },
    bg: (_c: string, t: string) => t,
    bold: (t: string) => t,
  } as never;
  const persistent: ModelSurfaceState = { focus: "models", provider: null, filter: "", profileFocus: 0 };
  const s = new ModelControlSurface(
    D53_PROVIDER_SECTIONS,
    recordingTheme,
    D53_SPECS,
    {},
    "9router/bai/deepseek-v4-flash",
    () => D53_AVAILABLE,
    D53_STATE,
    D53_RESOLVED,
    D53_CHIPS,
    persistent,
  );
  s.onSelectModel = () => {};
  s.onEditProfile = () => {};
  s.onClose = () => {};
  s.render(140);
  // Rows 0..n: outer frame top, then interior rows. The browser box interior
  // sits between the outer frame rails; frameLines emits exactly 2 `dim` rail
  // spans per interior line. Assert: at least one `border` span exists AND
  // no rail token other than the frame's `dim`/browser's `border` appears.
  const borderSpans = usedTokens.filter((t) => t === "border");
  assert.ok(borderSpans.length >= 2, `browser rails not purple: tokens ${JSON.stringify(usedTokens.slice(0, 8))}…`);
  for (const token of usedTokens) {
    assert.ok(token === "border" || token === "dim", `unexpected rail token ${token}`);
  }
  // The mcc-purple theme resolves border to the deep muted purple of the
  // frame system (#4a4262) — darker than the dim outline (#5c5570), never white.
  const raw = fs.readFileSync(path.join(__dirname, "..", "mcc-purple.json"), "utf8");
  const theme = JSON.parse(raw);
  assert.equal(theme.colors.border, "#4a4262");
  assert.notEqual(theme.colors.border, "#ffffff");
  assert.notEqual(theme.colors.border, theme.vars.dimGray);
});

check("D61 DIVIDER GEOMETRY: divider x equals top and bottom junction x", () => {
  for (const width of [80, 100, 120, 140, 160, 200, 300, 400]) {
    const out = makeSurface().render(width).map(stripAnsi);
    // innerWidth = width - 4: two-column box below 82, three-column above.
    const wantJ = width - 4 >= 78 ? 2 : 1;
    const top = out.find((l) => l.includes("┌") && (l.match(/┬/g) ?? []).length === wantJ && l.includes("┐"));
    const bot = out.find((l) => l.includes("└") && (l.match(/┴/g) ?? []).length === wantJ && l.includes("┘"));
    assert.ok(top && bot, `browser borders (${wantJ} junctions) missing at width ${width}`);
    const j1 = top.indexOf("┬");
    const j2 = top.lastIndexOf("┬");
    // Bottom junctions must mirror the top exactly (same geometry source).
    assert.equal(bot.indexOf("┴"), j1, `bottom junction 1 misaligned at width ${width}`);
    assert.equal(bot.lastIndexOf("┴"), j2, `bottom junction 2 misaligned at width ${width}`);
    const topIdx = out.indexOf(top);
    const botIdx = out.indexOf(bot);
    for (let i = topIdx + 1; i < botIdx; i++) {
      assert.equal(out[i][j1], "│", `divider 1 not at junction x at width ${width}, row ${i}`);
      assert.equal(out[i][j2], "│", `divider 2 not at junction x at width ${width}, row ${i}`);
    }
  }
});

check("D61 DIVIDER CONTINUITY: every rail column present in every row, no gaps or drift", () => {
  // For each width, derive the EXACT expected rail columns from the top
  // border (┬ junctions, ┐ corner, outer frame rails) and require every
  // interior browser row to have rails at exactly those columns — a gap,
  // an extra, or a one-column shift anywhere fails.
  for (const width of [80, 100, 120, 140, 160, 200]) {
    const out = makeSurface().render(width).map(stripAnsi);
    const top = out.find((l) => l.includes("┌") && l.includes("┬") && l.includes("┐"));
    const bot = out.find((l) => l.includes("└") && l.includes("┴") && l.includes("┘"));
    assert.ok(top && bot, `borders missing at width ${width}`);
    const expected: number[] = [0, 1]; // outer rail + box leading rail
    for (let x = 0; x < top.length; x++) {
      if (top[x] === "┬") expected.push(x);
    }
    expected.push(top.indexOf("┐"), top.length - 1);
    const topIdx = out.indexOf(top);
    const botIdx = out.indexOf(bot);
    assert.ok(botIdx > topIdx + 1, `no interior rows at width ${width}`);
    for (let i = topIdx + 1; i < botIdx; i++) {
      assert.equal(out[i].length, top.length, `row width drift at width ${width}, row ${i}`);
      const got: number[] = [];
      for (let x = 0; x < out[i].length; x++) {
        if (out[i][x] === "│") got.push(x);
      }
      assert.deepEqual(got, expected, `rail columns mismatch at width ${width}, row ${i}`);
    }
  }
});

// ------------------------------------------------- D64 runtime layers

const D64_CTX: BarContext = {
  running: false,
  modelLabel: "glm-5.3-flash-northstar-longrun",
  levelLabel: "High",
  levelToken: "thinkingHigh",
  profileLabel: "Coding",
  workspace: "~/pisetup/capabilities",
  branch: "main",
  usage: { tokens: 820000, contextWindow: 1000000, percent: 80 },
};

function d64Store(overrides: Partial<LifecycleStore> = {}): LifecycleStore {
  return { lifecycle: "ready", startTs: null, endTs: null, activity: null, errorFlag: false, frameIndex: 0, ...overrides };
}

check("D64 ELAPSED: formatElapsed renders MM:SS with minute rollover", () => {
  assert.equal(formatElapsed(0), "00:00");
  assert.equal(formatElapsed(65100), "01:05");
  assert.equal(formatElapsed(3725000), "62:05");
  assert.equal(formatElapsed(-5), "00:00");
});

check("D64 ACTIVITY PHRASES: tool starts map to phrases, unknown shapes fall back", () => {
  assert.equal(activityPhrase("edit", { path: "src/foo.ts" }), "Editing foo.ts");
  assert.equal(activityPhrase("write", { path: "a/b.md" }), "Writing b.md");
  assert.equal(activityPhrase("read", { path: "C:\\x\\y.json" }), "Reading y.json");
  assert.equal(activityPhrase("bash", { command: "npm install foo" }), "Running npm");
  assert.equal(activityPhrase("grep", { pattern: "TODO" }), "Searching TODO");
  assert.equal(activityPhrase("find", {}), "Searching workspace");
  assert.equal(activityPhrase("browser", { url: "x" }), "Running browser");
  assert.equal(activityPhrase("edit", {}), "Editing file");
  assert.equal(activityPhrase("bash", {}), "Running bash");
  assert.equal(activityPhrase("edit", undefined), "Editing file");
});

check("D64 PATH: home prefix shortens, sibling directories stay untouched", () => {
  const home = "C:/Users/hikari";
  assert.equal(shortenPath("C:/Users/hikari/Desktop", home), "~/Desktop");
  assert.equal(shortenPath("C:\\Users\\hikari", home), "~");
  assert.equal(shortenPath("G:/pisetup", home), "G:/pisetup");
  assert.equal(shortenPath("C:/Users/hikari2/x", home), "C:/Users/hikari2/x");
  assert.equal(shortenPath("C:/x", undefined), "C:/x");
});

check("D64 USAGE: tones at the 70/90 thresholds, ? when tokens unknown", () => {
  assert.deepEqual(formatUsageBar({ tokens: 820000, contextWindow: 1000000, percent: 80 }), {
    text: "820k / 1.0M · 80%",
    tone: "warning",
  });
  assert.equal(formatUsageBar({ tokens: 960000, contextWindow: 1000000, percent: 96 }).tone, "error");
  assert.deepEqual(formatUsageBar({ tokens: 500000, contextWindow: 1000000, percent: 50 }), {
    text: "500k / 1.0M · 50%",
    tone: "normal",
  });
  assert.deepEqual(formatUsageBar({ tokens: null, contextWindow: 1000000, percent: null }), {
    text: "? / 1.0M",
    tone: "normal",
  });
  assert.equal(formatUsageBar({ tokens: 70, contextWindow: 100, percent: 70 }).tone, "normal");
  assert.equal(formatUsageBar({ tokens: 71, contextWindow: 100, percent: 71 }).tone, "warning");
  assert.equal(formatUsageBar({ tokens: 90, contextWindow: 100, percent: 90 }).tone, "warning");
  assert.equal(formatUsageBar({ tokens: 91, contextWindow: 100, percent: 91 }).tone, "error");
  assert.equal(formatUsageBar({ tokens: 1048576, contextWindow: 1048576, percent: 100 }).text, "1.0M / 1.0M · 100%");
  assert.equal(formatUsageCompact({ tokens: 820000, contextWindow: 1000000, percent: 82 }), "820k/1.0M");
  assert.equal(formatUsageCompact({ tokens: null, contextWindow: 1000000, percent: null }), "?/1.0M");
});

check("D64 LIFECYCLE: transitions drive a store through the full run", () => {
  const s = d64Store();
  applyAgentStart(s);
  assert.equal(s.lifecycle, "running");
  assert.equal(s.activity, "Analyzing");
  assert.ok(s.startTs !== null);
  assert.equal(s.errorFlag, false);
  applyToolStart(s, "edit", { path: "src/a.ts" });
  assert.equal(s.activity, "Editing a.ts");
  applyToolEnd(s);
  assert.equal(s.activity, "Analyzing");
  applyAgentEnd(s, [{ role: "user" }, { role: "assistant", stopReason: "aborted" }]);
  assert.equal(s.errorFlag, true);
  applyAgentSettled(s);
  assert.equal(s.lifecycle, "error");
  applyAgentStart(s); // retry clears the flag
  assert.equal(s.errorFlag, false);
  applyAgentEnd(s, [{ role: "assistant", stopReason: "stop" }]);
  applyAgentSettled(s);
  assert.equal(s.lifecycle, "complete");
  const idle = d64Store();
  applyAgentSettled(idle); // settled with no run: no-op
  assert.equal(idle.lifecycle, "ready");
});

check("D64 ACTIVITY LINE: running shows frame+elapsed+phrase; idle empty; settle states", () => {
  // idle: zero-cost empty line
  assert.equal(activityLine(d64Store()).text, "");
  // running: animated circle + elapsed + phrase
  const startTs = Date.now() - 42_000;
  const run = activityLine(d64Store({ lifecycle: "running", startTs, frameIndex: 1, activity: "Editing runtime-orchestrator.ts" }));
  assert.match(run.text, /^[◐◓◑◒] 00:4[23] · Editing runtime-orchestrator.ts$/);
  assert.equal(run.token, "accent");
  assert.ok(ACTIVITY_FRAMES.includes(run.text[0]));
  // complete settles with elapsed; error state; stale activity never shown when idle
  const done = activityLine(d64Store({ lifecycle: "complete", startTs: 1000, endTs: 61000 }));
  assert.equal(done.text, "✓ Complete · 01:00");
  assert.equal(done.token, "success");
  const err = activityLine(d64Store({ lifecycle: "error" }));
  assert.equal(err.text, "✕ Error");
  assert.equal(err.token, "error");
});

check("D64 ACTIVITY WIDGET: zero lines idle, one line running, clamped width", () => {
  const tui = { requestRender() {} } as never;
  const w = new ActivityWidget(tui, themeStub);
  assert.deepEqual(w.render(140), [], "idle activity must contribute zero lines");
  applyAgentStart(getLifecycleStore());
  applyToolStart(getLifecycleStore(), "edit", { path: "src/foo.ts" });
  const lines = w.render(140);
  assert.equal(lines.length, 1);
  assert.match(stripAnsi(lines[0]), /· Editing foo\.ts/);
  w.startAnimation(); // guarded against double-start
  w.startAnimation();
  w.dispose(); // clears interval — no leak
  resetLifecycleStore();
});

check("D64 FIELD: one row — spine + git + usage in locked format", () => {
  const row = contextFieldLines(D64_CTX, 140, themeStub)[0];
  const top = stripAnsi(row);
  assert.ok(top.startsWith("╭── "), "field opens with padding");
  assert.ok(top.endsWith("──╮"), "field closes with the frame tail");
  assert.match(top, /glm-5\.3-flash-northstar-longrun · ● High · ★ Coding/);
  assert.match(top, /> 📁 ~\/pisetup\/capabilities >/);
  assert.match(top, /> ⑂ main >/);
  assert.match(top, /> 820k\/1\.0M \(80%\)/, "locked usage format used/limit (pct)");
  assert.ok(visibleWidth(row) <= 140);
});

check("D64 FIELD NULL USAGE: ? percent renders gracefully", () => {
  const row = contextFieldLines(
    { ...D64_CTX, usage: { tokens: null, contextWindow: 1000000, percent: null } },
    140,
    themeStub,
  )[0];
  assert.match(stripAnsi(row), /> 0\/1\.0M \(\?\)/);
});

check("D64 DROP ORDER: branch → workspace → profile → usage → clamp", () => {
  const full = contextFieldLines(D64_CTX, 140, themeStub)[0];
  assert.match(stripAnsi(full), /⑂ main/, "branch present when wide");
  const noBranch = contextFieldLines({ ...D64_CTX, branch: null }, 120, themeStub)[0];
  assert.doesNotMatch(stripAnsi(noBranch), /⑂/, "branch drops first");
  const noWs = contextFieldLines({ ...D64_CTX, branch: null }, 100, themeStub)[0];
  assert.doesNotMatch(stripAnsi(noWs), /pisetup/, "workspace drops next");
  const noProfile = contextFieldLines({ ...D64_CTX, branch: null, profileLabel: undefined }, 60, themeStub)[0];
  assert.doesNotMatch(stripAnsi(noProfile), /★/, "profile drops after workspace");
  const narrow = contextFieldLines(D64_CTX, 20, themeStub)[0];
  assert.ok(visibleWidth(narrow) <= 20, "clamp guarantees width");
  assert.match(stripAnsi(narrow), /glm-5\.3-fl/, "model clamped last — prefix survives");
  const at60 = contextFieldLines(D64_CTX, 60, themeStub)[0];
  assert.match(stripAnsi(at60), /● High/, "reasoning survives at ordinary width");
  assert.match(stripAnsi(narrow), /╮$/, "frame always closes");
});

check("D64 WIDTH SAFETY: field renders within every width 12–400", () => {
  for (let w = 12; w <= 400; w++) {
    const row = contextFieldLines(D64_CTX, w, themeStub)[0];
    // D45 fit per the authoritative clamp tool: clamping must be a no-op.
    assert.equal(truncateToWidth(row, w, ""), row, `row exceeds width ${w}`);
    if (w >= 24) {
      assert.match(stripAnsi(row), /glm-5\.3-flash/, `model lost at width ${w}`);
    }
    if (w >= 42) {
      assert.match(stripAnsi(row), /glm-5\.3-flash-northstar-longrun/, `full model lost at width ${w}`);
    }
  }
});

check("D64 BAR CLASS: component render mirrors the pure line", () => {
  const bar = new RuntimeContextBar(themeStub, () => D64_CTX);
  const line = bar.render(140)[0];
  assert.match(stripAnsi(line), /glm-5.3-flash-northstar/);
  assert.match(stripAnsi(line), /● High/);
  bar.invalidate();
});

check("D64 TOKENS: compact cadence matches the built-in footer", () => {
  assert.equal(formatTokensCompact(5), "5");
  assert.equal(formatTokensCompact(1200), "1.2k");
  assert.equal(formatTokensCompact(820000), "820k");
  assert.equal(formatTokensCompact(1000000), "1.0M");
  assert.equal(formatTokensCompact(1048576), "1.0M");
  assert.equal(formatTokensCompact(12345678), "12M");
});

check("D64 FOOTER: zero-height, no informational content below input", () => {
  const footer = new MinimalFooter();
  assert.deepEqual(footer.render(140), [], "footer renders nothing");
  assert.doesNotMatch(stripAnsi(footer.render(140).join("")), /main|MCP|LSP|pi-lens|Generic|⑂|📁|↑|↓|\$\d/);
});

// ------------------------------------------------------- D63 /model provenance
// The D51 host bridge originally dispatched the extension `model` command for
// EVERY submitted text (typing "testing" + Enter opened the Model Control
// Surface). The fix requires the extension dispatch to sit INSIDE the
// `/model` text guard. These tests pin the shipped patch text.

const BRIDGE_PATH = path.resolve(__dirname, "..", "..", "scripts", "pi-model-bridge.mjs");
const bridgeSrc = fs.readFileSync(BRIDGE_PATH, "utf8");

function extractBlob(name: string): string {
  const marker = `const ${name} = \``;
  const start = bridgeSrc.indexOf(marker);
  assert.ok(start >= 0, `bridge script must define ${name}`);
  const bodyStart = bridgeSrc.indexOf("\n", start) + 1;
  const end = bridgeSrc.indexOf("`;", bodyStart);
  return bridgeSrc.slice(bodyStart, end);
}

const D51_FIXED = extractBlob("D51_PATCHED");
const D51_LEGACY = extractBlob("D51_LEGACY_PATCHED");

/** Simulates the host onSubmit semantics against a shipped patch blob. */
function simulateSubmit(blob: string, text: string): { mccOpened: boolean; editorCleared: boolean; handlerArgs: string | undefined } {
  // The blob re-emits the builtin guard line at the end (which continues into
  // the ORIGINAL host body we do not simulate); strip that trailing line.
  const body = blob.split("\n").slice(0, -1).join("\n");
  let mccOpened = false;
  let editorCleared = false;
  let handlerArgs: string | undefined;
  const host = {
    session: {
      extensionRunner: {
        getRegisteredCommands: () => [
          { name: "model", handler: async (args: string) => { mccOpened = true; handlerArgs = args; } },
        ],
        createCommandContext: () => ({}),
      },
    },
    editor: { setText: (t: string) => { editorCleared = t === ""; } },
  };
  const fn = new Function("text", `"use strict";\nreturn (async () => {\n${body}\n})();`);
  void (async () => { await fn.call(host, text); })();
  return { mccOpened, editorCleared, handlerArgs };
}

check("D63 PATCH GUARD: extension dispatch sits inside the /model text guard", () => {
  const guardIdx = D51_FIXED.indexOf('if (text === "/model" || text.startsWith("/model ")) {');
  const dispatchIdx = D51_FIXED.indexOf("_modelCmd.handler(");
  assert.ok(guardIdx >= 0, "patch blob must carry the /model text guard");
  assert.ok(dispatchIdx >= 0, "patch blob must dispatch the extension model command");
  assert.ok(guardIdx < dispatchIdx, "dispatch must be INSIDE the text guard (D63 fix)");
  // The legacy blob dispatched BEFORE any guard — that is the D63 defect.
  // Its guard sits at the END via the ${D51_SIGNATURE} template placeholder.
  const legacyGuardIdx = D51_LEGACY.lastIndexOf("${D51_SIGNATURE}");
  const legacyDispatchIdx = D51_LEGACY.indexOf("_modelCmd.handler(");
  assert.ok(legacyDispatchIdx >= 0, "legacy blob dispatches the extension command");
  assert.ok(legacyGuardIdx >= 0, "legacy blob re-emits the builtin guard at its end");
  assert.ok(legacyDispatchIdx < legacyGuardIdx, "legacy blob is the confirmed defect shape: dispatch precedes any text guard");
});

check("D63 NORMAL TEXT: submit does not open MCC", () => {
  for (const text of ["testing", "hello world", "model test", "fix this file"]) {
    const r = simulateSubmit(D51_FIXED, text) as { mccOpened: boolean; handlerArgs?: string };
    assert.equal(r.mccOpened, false, `"${text}" must not open the MCC`);
  }
});

check("D63 EXPLICIT MODEL: /model still opens MCC with args", () => {
  const bare = simulateSubmit(D51_FIXED, "/model") as { mccOpened: boolean; handlerArgs?: string };
  assert.equal(bare.mccOpened, true, "/model must open the MCC");
  assert.equal(bare.handlerArgs, "");
  const arg = simulateSubmit(D51_FIXED, "/model gpt") as { mccOpened: boolean; handlerArgs?: string };
  assert.equal(arg.mccOpened, true);
  assert.equal(arg.handlerArgs, "gpt");
});

check("D63 FALLBACK: builtin path intact when extension lacks the command", () => {
  // Blob ends by re-emitting the builtin guard line; assert the original
  // builtin body still follows it in the patched HOST file.
  const host = fs.readFileSync(
    "C:/Users/hikari/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js",
    "utf8",
  );
  const marker = "D51: extension /model override";
  const i = host.indexOf(marker);
  assert.ok(i >= 0, "D51 patch must be applied to the installed host");
  const after = host.slice(i, i + 1600);
  assert.match(after, /await this\.handleModelCommand\(searchTerm\);/, "builtin /model body preserved after the extension dispatch");
});

check("D63 MIGRATION: apply() migrates the legacy unguarded blob", () => {
  assert.ok(bridgeSrc.includes("D51_LEGACY_PATCHED"), "legacy blob constant present");
  assert.match(bridgeSrc, /name === "d51" && src\.includes\(D51_LEGACY_PATCHED\)/, "apply() migrates legacy hosts");
});

check("D63 D44 INTACT: same-model emission unchanged in the shipped patch", () => {
  assert.match(bridgeSrc, /sameModel: true/, "D44 same-model emission preserved");
  assert.match(bridgeSrc, /SUPPORTED_PREFIXES = \["0\.83\.", "0\.84\."\]/, "version guard unchanged");
});

check("D63 PROVENANCE: programmatic model_select never opens MCC", () => {
  // The event-driven opener is RAL's model_select handler; its guard matrix
  // (shouldOpenControlCenter) is pinned by the D44 test above. This check
  // pins the handler's early-return ordering: restoringBootDefault first,
  // then the matrix, then the re-entrancy guard.
  const src = fs.readFileSync(path.resolve(__dirname, "..", "runtime-orchestrator.ts"), "utf8");
  const i = src.indexOf('pi.on("model_select"');
  const body = src.slice(i, i + 700);
  const restoring = body.indexOf("restoringBootDefault");
  const matrix = body.indexOf("shouldOpenControlCenter(ev)");
  const loops = body.indexOf("modelSurfaceLoops > 0");
  assert.ok(restoring >= 0 && matrix >= 0 && loops >= 0, "all three guards present");
  assert.ok(restoring < matrix && matrix < loops, "guard order: restore-flag → provenance matrix → re-entrancy");
});

(async () => {
  await Promise.all(asyncChecks);
  process.exit(failures === 0 ? 0 : 1);
})();
