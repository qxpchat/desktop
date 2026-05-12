# qxp desktop — code-review prompt

A self-contained brief for a senior engineer (or another Claude instance) to perform a deep code review of the desktop codebase. Output is a written review, not code changes.

## Mission

Find and document **non-idiomatic patterns, code duplication, leaky abstractions, and bloat** in the desktop codebase. The goal is a punch-list the maintainer can act on; do not refactor in place. Be substantive — skip nits unless they pair with a more material finding in the same file. Read like a peer reviewing a colleague's PR, not a linter.

Three objectives shape every finding, in **strict priority order**:

1. **DRY — strong override.** Code duplication is the worst sin. If the same logic, predicate, mapping, or layout appears in ≥2 places, it must be factored into a single source of truth and re-imported. This rule strictly overrides every objective below: even if the resulting shared helper feels small, deep, or "less LLM-friendly," DRY wins. Look hard for soft duplication too — same shape with slightly different names, parallel switch statements, near-identical CSS blocks across components.
2. **Clean internal dependencies.** Internal modules importing each other is *fine* — encouraged, even — as long as (a) boundaries are clear (each module has a stated responsibility, its exports are the intent, not the implementation), and (b) the dependency graph is **acyclic**. Flag cycles, boundary smears (UI components reaching into private internals of state modules), and modules whose stated responsibility no longer matches their exports.
3. **Delete as much as possible without changing behaviour.** Among the survivors of objectives 1 + 2, the shortest correct program wins. Every line, comment, export, dep, default, config flag that has no observable effect on removal is a candidate. The reviewer's default question is "what happens if I just delete this?" — only when the answer is "something the user notices" does the code earn its place.

A secondary, ground-floor heuristic: prefer flat hierarchies when DRY and dependency objectives don't push the other way. Trivially-replaceable, self-contained files are nice when achievable, but **never duplicate code to make a file more self-contained**. If you must reach for a shared helper or a state module, that's correct.

## Scope

**Review:**
- `desktop/frontend/src/**/*` — Svelte 5 + TypeScript SPA.
- `desktop/server/src/**/*` — Rust qxp-web daemon (axum + yerpc + deltachat-jsonrpc).
- `desktop/src-tauri/src/**/*` — Tauri 2 shell (Rust).
- `desktop/{Makefile, shell.nix, scripts/, README.md}` — build glue.

**Skip:**
- `ios/`, `assets/`, `notifier/`, `relay/`, `plans/`, `references/`, `libs/` — out of scope for this pass.
- Generated files under `assets/generated/` and any `desktop/.../public/icon.svg` etc. populated by `make icons`.

## Context the reviewer should load first

1. **`CLAUDE.md` / `AGENTS.md`** at the repo root — project-wide conventions and the explicit "check reference apps" rule.
2. **`desktop/README.md`** — high-level architecture, run modes, account-data layout.
3. **`.claude/skills/rpc-expert/SKILL.md`** and **`.claude/skills/svelte-expert/SKILL.md`** if present — encode the team's view of idiomatic patterns in those areas.
4. **`references/deltachat-desktop/`** — the upstream Electron client. Cross-check anything UX-related; qxp's stated goal is feature parity with the reference, not novel UX. If qxp diverges, flag whether the divergence is justified.
5. **`references/Signal-Desktop/`** (if present) — secondary reference for chat-shell patterns (three-pane, search, pinned/archived).

## Conventions to apply

These come from `CLAUDE.md`/`AGENTS.md` and override personal preferences:

- **Concise output, thorough reasoning.** Findings should justify themselves in one or two sentences; the supporting diff/rationale is what matters, not prose.
- **No over-engineering.** Three similar lines beat a premature abstraction. Flag *both* directions: missing abstractions and gratuitous ones.
- **Trust internal code; validate at system boundaries** (user input, RPC wire). Flag defensive checks for impossible internal states.
- **Default to no comments.** Comments that re-state the code, narrate a current task, or recite history are noise; only comments explaining a non-obvious WHY are kept.
- **Zero unjustified deps.** Any npm or crates.io addition needs a written justification. Flag bundled deps that could be replaced by stdlib / hand-rolled in ≤30 lines.
- **No backwards-compatibility shims.** qxp is pre-1.0. `_unused` renames, re-exports for old paths, deprecation aliases — delete them.
- **DRY first.** Duplication of logic, predicates, mappings, or CSS shapes across files is the worst smell — flag and consolidate. This rule strictly overrides the "flat hierarchies" preference below.
- **Acyclic, well-bounded deps.** Internal modules importing each other is fine. What's not fine: cycles, modules whose stated responsibility doesn't match their exports, UI reaching into a state module's private internals (vs. its intent-named API).
- **Flat where unforced.** When DRY and dependency rules don't push the other way, prefer self-contained files over indirection. A 5-line helper used once is a candidate for inlining *if* no second caller is on the horizon and inlining doesn't recreate duplication elsewhere.
- **Delete-by-default.** Apply the test "what observable behaviour changes if I remove this line / export / dep / config flag?" If the answer is "nothing", it goes. This applies to: unused exports, unused fields, unused props, unused branches, comments that re-state code, defensive nil-checks for invariants, default values that are never overridden, dependency entries with no live import.

## Idiomatic targets

The reviewer should be fluent in (or quickly skim docs for):

- **Svelte 5 runes:** `$state`, `$derived`, `$derived.by`, `$effect`, `$effect.pre`, `$props`, `$bindable`. The reactivity model: dynamic dep tracking via reads, `untrack` to escape, `tick` to await render flush, `flushSync` for forced commits.
- **Svelte 5 component decomposition:** when to break a `.svelte` file, when `{#key}` is the right remount tool, when to use `<svelte:window>` / event delegation.
- **TypeScript:** strict types, narrow signatures, discriminated unions for wire variants, `as const` for literals, avoiding `any`/`unknown` casts.
- **Tauri 2 + axum + tokio:** message-passing patterns, `#[tauri::command]` semantics, lifetime of state passed to commands, careful `objc2` use on macOS.
- **deltachat-jsonrpc:** wire-type tags (PascalCase via serde, e.g. `kind: "ChatListItem"`), event fan-out via `onEvent`, and the cost model of common calls (which RPCs are cheap, which traverse the DB).

## Categories of findings

Cover at least these. Add more if warranted.

### 1. Reactivity & async correctness (high-leverage on this codebase)

- `$effect`s that subscribe to state they only read once (should be `untrack`ed). Look especially for `$effect` blocks that *write* to state they also read — that's the classic feedback loop.
- Polling loops (`setTimeout` + condition check) that could be event-driven or replaced by `tick()` / `flushSync()` / promise resolution.
- Floating `Promise`s without explicit `void` or `await` — easy to miss in event handlers.
- Race conditions across `await` boundaries (state mutated between an await and a subsequent state read, no `gen` guard).
- Use of `onMount`/`onDestroy` where `$effect` with a cleanup return is more idiomatic, or vice versa.

### 2. State module organisation

Reviewer should map `desktop/frontend/src/lib/state/` and judge:
- Where state should be **global runes** (shared singletons) vs **component-local `$state`**.
- Mixed concerns inside a single state module (e.g. RPC wrappers + UI selection + event handlers all in `chat.svelte.ts`).
- Patterns that should be centralised but aren't (e.g. multiple modules each loading + caching ChatListItems independently).

### 3. RPC + event layer

- Direct `rpc.call('foo', [...])` scattered through components — flag where they should be wrapped in `state/*` helpers with typed args/results.
- Repeated event-subscription boilerplate. The `onEvent` helper should be the only surface; components subscribing to raw `chat.events` etc. is suspicious.
- Wire-type leakage: are `kind: "ChatListItem"` tags handled in UI code, or are they unwrapped at the state-module boundary?

### 4. Component decomposition

- `.svelte` files over ~400 lines: usually a decomposition opportunity, but only if the parts have independent reasons to change.
- Prop-drilling deeper than 2 levels: usually a state-module / context shape problem.
- Duplicate context menus / action lists across chat-list / chat / media-browser (Pin/Mute/Archive/Delete is the canonical one).

### 5. Code duplication

- Message state → glyph mappings repeated across `MessageBubble`, `ChatListRow`, etc.
- Time / date formatters re-implemented in multiple components.
- Avatar / contact-color helpers repeated.
- Inline regex linkifiers vs the shared `lib/format/linkify` helpers.

### 6. Leaky abstractions

- State modules exposing internal mutation handles instead of intent-named functions.
- UI components reaching into deltachat-jsonrpc wire types directly.
- Cross-module reach-ins (component A reading state module B's private cache).

### 7. Dead / defensive code

- Defensive checks for impossible internal states.
- Fallback branches with no real caller.
- `// removed` / `// TODO` comments that have rotted.
- `_unused`-prefixed parameters that exist only to mute lints.

### 8. CSS / theming

- Hard-coded colours that should reference `--color-*` variables in `styles/theme.css`.
- Repeated layout patterns (e.g. flex column with gap) that could become a small utility class.
- Magic pixel values that have a semantic name elsewhere (`var(--space-3)` etc.).

### 9. Rust side (daemon + Tauri shell)

- `unsafe` blocks: each should have a one-line invariant comment.
- `Box<dyn Error>` vs `anyhow::Result<T>` consistency.
- Tokio task lifetimes: who joins what, who cancels on shutdown.
- `objc2` usage on macOS: main-thread requirements, retain semantics, deprecated selectors.

### 10. Build / packaging

- Files in the repo that should be `.gitignore`d, and vice versa.
- `tauri.conf.json` / `Cargo.toml` features that aren't actually consumed.
- `package.json` deps that are unused or used in one place where stdlib would do.

### 11. Deletability (after objectives 1 + 2 have decided what stays)

Once DRY consolidation and dependency-boundary cleanup have settled what code *must* exist, prune what's left. Every finding here is a candidate for outright deletion or inlining — but only when DRY isn't violated by the removal (i.e. inlining would not re-create duplication elsewhere).

- **Unused exports / fields / props / params.** Anything no current caller consumes. Drop the `export` first, drop the symbol second.
- **Re-exports that just rename.** `export { foo as Foo } from './foo'` with no actual API stability argument.
- **Type aliases used once.** `type ChatId = number;` consumed in a single signature — inline the `number`. (DRY note: if there's even one other place that says `number` and means a chat id, the alias *is* DRY-correct; keep it. The bar is "literally one usage.")
- **Generic helpers with one concrete type instantiation.** Replace with the concrete signature *unless* a second instantiation is plausibly imminent.
- **Default prop values that are never overridden.** Drop the default + the prop.
- **Conditional branches no caller exercises.** Especially `viewType`-style switches with arms that aren't reachable in qxp's flow.
- **Comments narrating the implementation** ("call X, then Y", "this loops over messages"). The code shows it; delete.
- **`onMount` callbacks doing one-shot setup the parent could do.** Indirection without a reuse story.
- **State modules wrapping a single RPC with no transformation, called from one place.** Inline the `rpc.call`. **But:** if it's called from two or more components, the wrapper is DRY-correct — keep it and improve its intent name if the name doesn't already convey what it does.
- **Components that exist only to position another component.** Lift the wrapper's CSS into the parent.
- **Single-use helpers that aren't duplication candidates.** A `formatX` in `lib/foo.ts` called from one place, with no near-duplicate inline anywhere, can be folded back to the caller. If a near-duplicate of `formatX` exists inline somewhere else, do the opposite: route the second caller through the helper.

For each finding in this category, the report must include the **minimal deletion** — i.e. the exact lines/files to remove — and confirm nothing else breaks (or list what else needs to move). When inlining a helper, also confirm no other (current or imminent) caller would need to recreate it.

### 12. Cross-platform breakage (Tauri targets Linux + macOS + Windows)

The desktop app is meant to ship to all three OSes. **Anything that compiles or runs on only one platform without an explicit alternative is a regression risk.** Flag aggressively here — silent degradation on Linux or Windows is exactly the class of bug that hides until someone tries to build a release.

- **Rust:** macOS-only crates (`objc2`, `objc2-app-kit`, `objc2-foundation`, `cocoa`, `core-foundation`, …) used without a `#[cfg(target_os = "macos")]` gate. Same for Linux-only (`gtk`, `webkit2gtk` direct) or Windows-only (`windows`, `winapi`) crates. Each platform-specific block needs a parallel `#[cfg(not(target_os = "macos"))]` no-op (with a one-line comment explaining why "do nothing here" is correct) or a real fallback.
- **Rust `#[link]` / `cargo:rustc-link-arg` flags** in `build.rs` (e.g. `-Wl,-sectcreate,__TEXT,__info_plist,…` is macOS-only Mach-O) — these must be `#[cfg]` gated. `desktop/src-tauri/build.rs` is the canonical example to mimic.
- **Frontend:** hardcoded `process.platform` checks, `navigator.platform` sniffing, OS-specific path separators in string literals, `~/Library/...` paths in JS, `Cmd`-only or `Ctrl`-only keyboard shortcuts not handled by both sides. If `Cmd+K` is bound, `Ctrl+K` on Linux/Windows must work too (and vice versa).
- **CSS:** `-webkit-app-region: drag` (macOS title-bar dragging), `-apple-system` font stack, `backdrop-filter` reliance (uneven WebKitGTK support on Linux), macOS-only `font-smoothing` tweaks. Fonts especially: `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, …` is the correct cascade — single-platform fonts are a smell.
- **Tauri config:** options that silently no-op on other platforms — `titleBarStyle: "Overlay"`, `hiddenTitle`, `transparent`, `decorations: false` on macOS-only assumptions, `traffic-light-position` etc. Verify each behaves acceptably on Linux/Windows or is `#[cfg]` gated.
- **macOS Info.plist embedding** (via `build.rs` `__TEXT,__info_plist` section): correctly cfg-gated on `target_os = "macos"`. Linux/Windows have no equivalent and shouldn't try.
- **Native menu items**, dock icon / dock badge, system tray, notifications: each tends to be platform-specific. A code path that calls `dockTile().setBadgeLabel:` on macOS should have an equivalent (or a documented "no taskbar badge support on this platform yet") for Linux + Windows.
- **File-system assumptions**: `app_data_dir()` paths (`~/.local/share/`, `~/Library/Application Support/`, `%APPDATA%\`) usually work via Tauri's `path()` API — flag any hard-coded variant. Newline conventions (`\r\n` vs `\n`) in clipboard / file output.
- **Daemon (`desktop/server/`)**: should be fully portable. Any platform-conditional code here is suspicious — flag it.

For each platform-specific finding, also note whether the feature is **degraded gracefully** (still usable, just with worse UX) or **breaks the build / app**. Build breakage = HIGH. Silent UX gap = MED.

## Anti-patterns specific to this codebase

Flag these by name if you see them:

- **Mixed timing fences.** Functions that interleave `await tick()`, `setTimeout`, `requestAnimationFrame`, and event waits inside the same flow. Pick one, justify it.
- **Per-chat client-side flags that duplicate deltachat-core state.** If the daemon already tracks it (mute, pin, archive, freshness), don't shadow it in `lib/state/*`.
- **`PageSize`-by-50 paginations** that fail to handle "jump to old message" without N round-trips — see the bulk-load pattern in `loadUntilInWindow`.
- **`{#key}` remounts used in place of explicit teardown.** They work but throw away animation state and scroll position.
- **Soft duplication.** Same predicate, mapping, or layout shape repeated with slightly different names or variable bindings. The objective-1 (DRY) override applies — flag and consolidate, even when the duplicates are "small enough."
- **Cyclic imports** (`a → b → a`) or modules whose exports no longer match their stated responsibility.
- **Inline RPC wire shapes** like `r.kind === 'message'` checked in components instead of unwrapped at the state-module boundary.
- **macOS-only code paths without alternatives.** A feature that uses `objc2` / AppKit / Mach-O linker tricks should have either a working Linux/Windows equivalent or an explicit cfg-gated no-op with a comment justifying why "nothing" is the right answer there. Silent dead code on two-thirds of targets is the bug pattern.

## Output format

For each finding:

```
[SEVERITY] path/to/file.svelte:line — short title
  what: concrete description of what's wrong (≤2 sentences).
  why:  why it matters (perf / correctness / readability / divergence from reference).
  fix:  the smallest change that addresses it, ideally a 2-5 line diff.
  effort: small / medium / large.
```

Severity scale:

- **HIGH** — correctness bug, perf regression, a leak, or a security concern.
- **MED** — convention violation, duplication, or maintainability hit that will compound.
- **LOW** — nit. Only include if it pairs with a MED in the same file.

Group findings by area (1–12 above). End with a **Top 3 to fix first** list — the highest-leverage items by impact-per-effort. Then a **Net deletion estimate**: rough line count the punch-list would remove if all findings were acted on. The two mission objectives mean a successful review usually nets *negative* code.

## What *not* to include

- Stylistic preferences without a concrete maintainability or correctness argument.
- **"Could be more abstract"** suggestions aimed at imagined future re-use. The bar for a new abstraction is *one* existing duplicate (i.e. ≥2 call sites total) — but it has to be real, not speculative. Imagined symmetry doesn't count.
- Speculative future-proofing.
- Anything that requires changing the deltachat-jsonrpc surface — that's upstream's call.
- Anything outside the `desktop/` scope listed above.
- Suggestions that *add* code without either (a) eliminating duplication, (b) closing a dependency-boundary leak, or (c) deleting more elsewhere than they add.

## When in doubt

Cite the reference app first (`references/deltachat-desktop/`), then the conventions, then the language idiom — in that order. A divergence from the reference that has a clear local reason is fine; flag it only if the reason isn't documented or is weaker than the cost.
