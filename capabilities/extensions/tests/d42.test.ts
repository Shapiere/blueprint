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
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  MccOverviewList,
  ModelControlSurface,
  panelLines,
  providerCounts,
  scopeTitle,
  PROFILE_DESCRIPTIONS,
  REASONING_PROFILES,
  USER_LEVEL_MAP,
  applyVisibility,
  clearExecutionProfile,
  loadModelsVisibility,
  loadReasoningState,
  parseProfileTag,
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

const STATE_FILE = path.join(os.homedir(), ".pi", "agent", "harness-reasoning.json");
const MODELS_FILE = path.join(os.homedir(), ".pi", "agent", "harness-models.json");

let failures = 0;
const check = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`PASS ${name}`);
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
  { provider: "9router", id: "bai/deepseek-v4-flash", reasoning: true, input: ["text"], contextWindow: 200000 },
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
    if (width >= 64) {
      assert.ok(out.some((l) => l.includes("│")), `two-pane divider missing at ${width}`);
    } else {
      assert.ok(!out.join("\n").includes("│"), `unexpected divider at ${width}`);
    }
  }
});

check("D53b BROWSER: box-drawn container with continuous divider at wide", () => {
  const out = makeSurface().render(140);
  const flat = out.map(stripAnsi);
  assert.ok(flat.some((l) => l.startsWith("┌") && l.includes("┬") && l.endsWith("┐")), "box top border missing");
  assert.ok(flat.some((l) => l.startsWith("└") && l.includes("┴") && l.endsWith("┘")), "box bottom border missing");
  // Every interior row carries the divider in the same column (no fragments).
  const dividerCols = new Set(
    flat.filter((l) => l.includes("│")).map((l) => l.indexOf("│")),
  );
  assert.equal(dividerCols.size, 1, `divider column drift: ${[...dividerCols]}`);
  // Titles live on the first interior row inside the box.
  assert.ok(flat.some((l) => l.includes("│") && l.includes("PROVIDERS") && l.includes("ALL MODELS")));
});

check("D53 PROVIDERS: counts visible, unconfigured rows present but never selectable", () => {
  const surface = makeSurface({ focus: "providers" });
  const joined = flatText(surface.render(100));
  assert.match(joined, /3 models/);
  assert.match(joined, /anthropic/);
  // Navigation wraps over configured rows only — the dimmed row is never
  // selected, so the detail panel always shows a real provider.
  for (let i = 0; i < 5; i++) {
    surface.handleInput(DOWN);
    const detail = regionOf(surface.render(100), "PROVIDER");
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
  assert.ok(!joined.includes("deepseek-v4-flash"), "scoped search leaked other models");
});

check("D53 DETAIL: context follows focus — provider, model, profile", () => {
  const surface = makeSurface({ focus: "providers" });
  let joined = flatText(surface.render(140));
  assert.match(joined, / PROVIDER /);
  assert.match(joined, /Configured \/ available to Pi/);
  assert.ok(!joined.includes("SELECTED MODEL"), "model detail leaked into providers focus");
  surface.handleInput("\x1b[C"); // → models
  joined = flatText(surface.render(140));
  assert.match(joined, / SELECTED MODEL /);
  assert.match(joined, /200k ctx/);
  assert.match(joined, /✓ Current Model/);
  assert.ok(!joined.includes("Availability:"), "provider detail leaked into models focus");
  surface.handleInput(DOWN); // highlight → ox-alpha
  joined = flatText(surface.render(140));
  assert.match(joined, /ox-alpha/);
  assert.ok(!joined.includes("✓ Current Model"), "stale current marker on a non-current model");
  surface.handleInput("\x1b[C"); // → profiles
  joined = flatText(surface.render(140));
  assert.match(joined, / PROFILE /);
  assert.match(joined, /Normal interactions/);
  assert.ok(!joined.includes("SELECTED MODEL"), "model detail leaked into profiles focus");
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

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
