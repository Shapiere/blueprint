---
description: Evidence-based performance analysis protocol (measure, profile, change, re-measure)
argument-hint: "<target-or-scenario>"
---
Performance analysis target: $@

Protocol (no claims without measurement):

1. **Baseline** — establish the current behavior with a concrete measurement (time, throughput, memory, request latency) and record the command that produced it.
2. **Profile** — identify where time/memory goes (profiler output, logs, timing breakdown). Only then form a bottleneck hypothesis.
3. **Change** — the smallest change addressing the measured bottleneck. If the platform has no profiler capability for the target, state that the profile step is approximate and say why.
4. **Re-measure** — run the identical baseline command; report before/after numbers.
5. **Trade-off note** — complexity/maintenance cost of the change vs. measured gain; reject the change if the ratio is poor.

Output: baseline numbers, bottleneck evidence, change summary, before/after table, trade-off verdict. If measurement is impossible in the environment, say so and stop — do not speculate about performance.