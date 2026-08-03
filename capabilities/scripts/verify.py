#!/usr/bin/env python3
"""Platform verification (Milestone 10): repository consistency, links, orphans,
secrets, structure conformance, registry shape, decision numbering.

Lightweight by design: Python stdlib only, no CI, no network. Run before committing:
    python capabilities/scripts/verify.py
Exit 0 = all checks passed; exit 1 = issues listed.
"""
import re
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
issues = []


def check(cond: bool, msg: str) -> None:
    if not cond:
        issues.append(msg)


# 1. Markdown links resolve (file-relative)
link_re = re.compile(r"\]\(([^)]+)\)")
for f in ROOT.rglob("*.md"):
    if ".git" in f.parts:
        continue
    for m in link_re.finditer(f.read_text(encoding="utf-8")):
        t = m.group(1).strip()
        if t.startswith(("http://", "https://", "git@", "#", "mailto:")):
            continue
        t = t.split("#")[0].strip()
        if t and not (f.parent / t).resolve().exists():
            issues.append(f"BROKEN LINK {f.relative_to(ROOT)} -> {t}")

# 2. Orphaned markdown files (never referenced)
md_files = [f for f in ROOT.rglob("*.md") if ".git" not in f.parts]
all_text = "\n".join(f.read_text(encoding="utf-8") for f in md_files)
for f in md_files:
    rel = str(f.relative_to(ROOT))
    if rel != "README.md" and f.name not in all_text and rel not in all_text:
        issues.append(f"ORPHAN {rel}")

# 3. Secret patterns in tracked text files (best-effort; never print matches)
secret_re = re.compile(
    r"sk_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|"
    r"BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE KEY"
)
for f in ROOT.rglob("*"):
    if (
        f.is_file()
        and ".git" not in f.parts
        and f.name not in ("auth.json", "oauth.json", "models.json")
        and f.suffix in (".md", ".ts", ".py", ".json", ".txt", ".yml", ".yaml", ".toml")
    ):
        for i, line in enumerate(f.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            if secret_re.search(line):
                issues.append(f"SECRET PATTERN {f.relative_to(ROOT)}:{i} (do not print)")

# 4. Structure conformance (constitution structure block)
required = [
    "README.md", "AI_CONTEXT.md", "CONTRIBUTING.md", "CHANGELOG.md",
    "PROJECT_STATE.md", "ROADMAP.md", "NEXT_SESSION.md", ".gitignore",
    "docs/BOOTSTRAP_SPEC.md", "docs/ARCHITECTURE.md", "docs/VISION.md",
    "docs/DESIGN_PRINCIPLES.md", "docs/SUCCESS_CRITERIA.md",
    "docs/DECISIONS.md", "docs/SETUP.md", "capabilities/index.md",
    "implementation/TODO.md",
]
for p in required:
    if not (ROOT / p).exists():
        issues.append(f"MISSING {p}")

# 5. Registry shape: 10 columns per data row; unique capability names
reg = (ROOT / "capabilities" / "index.md").read_text(encoding="utf-8")
seen = set()
for line in reg.splitlines():
    line = line.strip()
    if line.startswith("|") and "Capability |" not in line and not line.startswith("|---"):
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) != 10:
            issues.append(f"REGISTRY COLUMNS {len(cells)}: {line[:60]}")
        if cells and cells[0] in seen:
            issues.append(f"REGISTRY DUPLICATE {cells[0]}")
        if cells:
            seen.add(cells[0])

# 6. Decision numbering sequential and unique
dec = (ROOT / "docs" / "DECISIONS.md").read_text(encoding="utf-8")
nums = [int(n) for n in re.findall(r"^### D(\d+)", dec, re.M)]
if nums != sorted(nums) or len(set(nums)) != len(nums):
    issues.append(f"DECISIONS numbering not sequential/unique: {nums}")

# 7. Single carried-forward section in TODO
todo = (ROOT / "implementation" / "TODO.md").read_text(encoding="utf-8")
if todo.count("Carried Forward") != 1:
    issues.append(f"TODO carried-forward sections: {todo.count('Carried Forward')}")

if issues:
    print(f"{len(issues)} issue(s) found:")
    for i in issues:
        print(" -", i)
    sys.exit(1)
print("OK - all checks passed")
