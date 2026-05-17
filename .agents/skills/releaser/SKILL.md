---
name: releaser
description: Tag HEAD with the current app version, generate short, friendly release notes for the commits since the previous tag, then push the branch and tags to GitHub. Plain text with emojis, no markdown. Trigger when the user says "release", "cut a release", "generate release notes", "changelog", "what changed since last release", or invokes /releaser. Note: do NOT use the built-in /release-notes command — that shows Claude Code's own changelog.
---

# Releaser

Tag the current HEAD with the app version, produce concise release notes
covering everything since the previous tag, then push the branch and tags
to GitHub.

## Steps

1. Read the current app version (single source of truth for all version sites):
   ```
   scripts/sync-versions.sh
   ```
   The printed value is NEW (e.g. `0.11.0`). If the script reports drift
   (exit 1), tell the user to fix versions first and stop.

2. Create the tag on HEAD if it does not already exist:
   ```
   git tag -l NEW
   ```
   - If that prints NEW, the tag already exists — skip to step 3.
   - Otherwise create it:
     ```
     git tag NEW
     ```
     Tag names match existing tags: bare version, no `v` prefix.

3. Find the previous tag — the newest version tag strictly older than NEW:
   ```
   git tag -l --sort=-v:refname
   ```
   PREV is the first line that is not NEW.
   - If no tag older than NEW exists, tell the user and stop.

4. Collect the commits in the range:
   ```
   git log PREV..NEW --no-merges --pretty=format:'%s'
   ```

5. Write the release notes from those commit subjects. End the notes with a
   blank line followed by:
   ```
   Download here: https://github.com/qxpchat/qxp/releases/latest
   ```

6. Push the branch and all tags to GitHub:
   ```
   make push-github
   ```
   This is an outward-facing, hard-to-reverse action. Confirm with the user
   before running it, then run it and report the result.

## Output rules

- Plain text only. NO markdown: no `#`, no `*`/`-` bullets, no `**bold**`, no
  backticks. The only URL is the download link on the final line (bare, not a
  markdown link).
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

Download here: https://github.com/qxpchat/qxp/releases/latest
```

Output the notes directly to the user — do not write a file unless asked.
