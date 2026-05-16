---
name: changelog
description: Generate short, friendly release notes for the commits between the two most recent git tags. Plain text with emojis, no markdown. Trigger when the user says "generate release notes", "changelog", "what changed since last release", or invokes /changelog. Note: do NOT use the built-in /release-notes command — that shows Claude Code's own changelog.
---

# Release notes generator

Produce concise, pleasant release notes covering everything between the two
most recent version tags of this repo.

## Steps

1. Find the two most recent tags (version-sorted, newest first):
   ```
   git tag -l --sort=-v:refname | head -2
   ```
   Call them NEW (first line) and PREV (second line).
   - If fewer than 2 tags exist, tell the user and stop.

2. Collect the commits in the range:
   ```
   git log PREV..NEW --no-merges --pretty=format:'%s'
   ```

3. Write the release notes from those commit subjects.

## Output rules

- Plain text only. NO markdown: no `#`, no `*`/`-` bullets, no `**bold**`, no
  backticks, no links.
- Lead each change line with a single relevant emoji used as the bullet.
- Keep it short: group/merge related commits, drop noise (version bumps,
  "test fixes", typo-only commits, merge chatter). Aim for 3-8 lines.
- Rewrite terse commit subjects into clear, friendly user-facing phrasing.
  Describe the user impact, not the code.
- First line: a title with the new version and a 🎉 (or similar), e.g.
  `qxp 0.5.3 🎉`
- Optionally one short framing sentence after the title.
- Pick emojis that fit each change: ✨ feature, 🐛 fix, ⚡ performance,
  🔒 security, 🎨 UI, 📝 docs, ♻️ refactor, 🚀 release.

## Example shape

```
qxp 0.5.3 🎉
A few fixes for channels.

🐛 Channels created with the right members now keep them.
🔇 Joined channels are correctly read-only — no stray input bar.
🔗 Cleaner invite links.
```

Output the notes directly to the user — do not write a file unless asked.
