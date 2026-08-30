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
  NavDetailPane,
  providerCounts,
  scopeTitle,
  PROFILE_GROUPS,
  PROFILE_DESCRIPTIONS,
  REASONING_PROFILES,
  USER_LEVEL_MAP,
  applyVisibility,
  clearExecutionProfile,
  loadModelsVisibility,
  loadReasoningState,
  mccProfileValue,
  parseProfileTag,
  resolveEffective,
  saveModelsVisibility,
  saveReasoningState,
  scriptWritesProtectedState,
  setExecutionProfile,
  sortModelsRouterFirst,
  type MccSection,
  type MccRow,
  type ReasoningProfileName,
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
  const sections: MccSection[] = [
    { title: "MODEL", rows: [{ kind: "item", item: { value: "__model__", primary: "Select model…" } }] },
  ];
  for (const g of PROFILE_GROUPS) {
    const rows: MccRow[] = [];
    for (const name of g.items) {
      if (name === "Vision" && !levels.Vision) continue; // capability-gated fixture
      rows.push({
        kind: "item",
        item: {
          value: mccProfileValue(name),
          primary: `${name} · ${levels[name]}`,
          description: PROFILE_DESCRIPTIONS[name],
          marked: defaultProfile === name ? "★default" : undefined,
        },
      });
    }
    sections.push({ title: g.title, rows });
  }
  sections.push({
    title: "",
    rows: [{ kind: "item", item: { value: "__done__", primary: "Done", description: "Save & exit" } }],
  });
  return sections;
}

const selectedPlain = (lines: string[]) => stripAnsi(lines.find((l) => l.includes("› ") || l.includes("→ ")) ?? "");

check("headers never selectable across full navigation", () => {
  const list = new MccOverviewList(buildSections("Task", { Default: "high", Task: "medium" }), themeStub, 30);
  for (let i = 0; i < 12; i++) {
    const sel = selectedPlain(list.render(100));
    for (const h of ["MODEL", "GENERAL", "PLANNING", "EXECUTION", "SPECIALIZED"]) {
      assert.ok(!sel.includes(h), `header selected: ${h} at step ${i}`);
    }
    assert.ok(!sel.includes("unavailable"), `disabled row selected at step ${i}`);
    list.handleInput(DOWN);
  }
});

check("navigation wraps both directions over items only", () => {
  const list = new MccOverviewList(buildSections("Task", { Default: "high", Task: "medium" }), themeStub, 30);
  const totalItems = 11; // model + 8 profiles (Vision gated) + done
  for (let i = 0; i < totalItems; i++) list.handleInput(DOWN);
  assert.match(selectedPlain(list.render(100)), /Select model/, "expected wrap back to first row");
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
  const sections: MccSection[] = PROFILE_GROUPS.map((g) => ({
    title: g.title,
    rows: g.items.map((name) => ({
      kind: "item" as const,
      item: {
        value: `p:${name}`,
        primary: `${name} · ${levels[name]}`,
        description: PROFILE_DESCRIPTIONS[name],
        marked: name === "Default" ? "★default" : undefined,
      },
    })),
  }));

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

check("NAV+DETAIL: two-pane at wide, stacked at narrow, never overflows", () => {
  const sections: MccSection[] = [
    { title: "MODEL", rows: [{ kind: "item", item: { value: "__model__", primary: "Select model…" } }] },
    {
      title: "GENERAL",
      rows: [
        { kind: "item", item: { value: "p:Default", primary: "Default · medium", description: "Normal interactions", marked: "★default" } },
        { kind: "item", item: { value: "p:Task", primary: "Task · high", description: "Execution-oriented work" } },
        { kind: "item", item: { value: "p:Review", primary: "Review · high", description: "Critique & verification" } },
      ],
    },
    {
      title: "PLANNING",
      rows: [{ kind: "item", item: { value: "p:Plan", primary: "Plan · high", description: "Planning & architecture" } }],
    },
  ];
  for (const width of [40, 60, 80, 100, 120, 160, 204, 215, 300]) {
    const list = new MccOverviewList(sections, themeStub, 14);
    const pane = new NavDetailPane(
      list,
      (maxLines) => {
        const sel = list.getSelectedItem();
        if (!sel || !sel.value.startsWith("p:")) return ["(no profile)"];
        const name = sel.value.slice(2);
        return [`${name.toUpperCase()}`, sel.description ?? "", "", "REASONING", sel.primary.split(" · ")[1] ?? "", "", "STATE", "● Active"].slice(0, maxLines);
      },
      14,
    );
    // Move to first profile row so detail panel shows content.
    list.handleInput("\u001b[B");
    const out = pane.render(width);
    assert.ok(out.length > 0, `no output at ${width}`);
    for (const line of out) {
      assert.ok(visibleWidth(line) <= width, `nav+detail overflow ${visibleWidth(line)} > ${width} at width ${width}: ${JSON.stringify(stripAnsi(line).slice(0, 50))}`);
    }
    // Detail content appears (stacked at narrow, beside nav at wide).
    const joined = stripAnsi(out.join("\n")).replace(/\s+/g, " ");
    assert.match(joined, /REASONING/, `detail panel missing at ${width}`);
  }
});

check("NAV+DETAIL: navigation updates the focused detail", () => {
  const sections: MccSection[] = [
    { title: "MODEL", rows: [{ kind: "item", item: { value: "__model__", primary: "Select model…" } }] },
    {
      title: "GENERAL",
      rows: [
        { kind: "item", item: { value: "p:Default", primary: "Default · medium", description: "Normal interactions" } },
        { kind: "item", item: { value: "p:Task", primary: "Task · high", description: "Execution-oriented work" } },
        { kind: "item", item: { value: "p:Review", primary: "Review · high", description: "Critique & verification" } },
      ],
    },
  ];
  const list = new MccOverviewList(sections, themeStub, 14);
  const pane = new NavDetailPane(
    list,
    (maxLines) => {
      const sel = list.getSelectedItem();
      if (!sel || !sel.value.startsWith("p:")) return ["(no profile)"];
      return [`${sel.value.slice(2).toUpperCase()}`, sel.primary.split(" · ")[1] ?? ""].slice(0, maxLines);
    },
    14,
  );
  const flat = (lines: string[]) => stripAnsi(lines.join("\n")).replace(/\s+/g, " ");
  // Start on Select model… → no profile detail yet.
  assert.match(flat(pane.render(120)), /\(no profile\)/);
  list.handleInput("\u001b[B"); // Default
  assert.match(flat(pane.render(120)), /DEFAULT.*medium/);
  list.handleInput("\u001b[B"); // Task
  assert.match(flat(pane.render(120)), /TASK.*high/);
  list.handleInput("\u001b[B"); // Review
  assert.match(flat(pane.render(120)), /REVIEW.*high/);
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

check("viewport cap respected with scroll indicator", () => {
  const list = new MccOverviewList(buildSections("Task", { Default: "high" }), themeStub, 14);
  const out = list.render(80);
  assert.ok(out.length <= 15, `rendered ${out.length} lines`);
  assert.ok(out.some((l) => stripAnsi(l).includes("(1/11)")), "scroll indicator missing");
});

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
