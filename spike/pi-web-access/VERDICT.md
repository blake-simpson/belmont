# pi-web-access — GO (no v1.0 milestone consumer)

**Pin.** `pi-web-access@0.10.7` (latest 2026-05-02, MIT, by nicobailon;
deps: `@mozilla/readability`, `linkedom`, `p-limit`, `turndown`,
`unpdf`).

**Repository.** https://github.com/nicobailon/pi-web-access

## Deciding criterion (§17 M0 — "stable schema, opt-in install")

| Gate | Status | Evidence |
|---|---|---|
| 1. Stable schema | ✅ | Tool surface (`web_search`, `code_search`, `fetch_content`, `get_search_content`) and parameter families have held across the entire 0.10.x line (0.10.0 on 2026-02-18 → 0.10.7 on 2026-05-02 = 73 days of point-release stability with no breaking changes). |
| 2. Opt-in install | ✅ | User-explicit `pi install npm:pi-web-access`. No postinstall autoload. Belmont's `belmont init` does NOT add this dep automatically. |
| 3. Documented tool surface | ✅ | README documents each tool's signature, fallback chain (Exa → Perplexity → Gemini API → Gemini Web), and dependency on optional binaries (`ffmpeg`, `yt-dlp` for video). Zero-config default via Exa MCP — works without API keys. |
| 4. v1.0 milestone consumer | ❌ none | No §17 M1–M11 milestone explicitly requires web search, URL fetch, or GitHub clone. The plan's surface is purely the local repo + `.belmont/`. |

## Conclusion

**GO** as a record-of-availability pin, **not wired into v1.0**. The
package is well-engineered, ecosystem-native (pi v0.37.3+ peer), and
stable enough to adopt on demand if a v1.1+ milestone introduces web
research (e.g. a `/belmont:research` skill, or a `working-backwards`
extension that pulls competitor pages, or an `RTK`/`gain` evaluator
that fetches benchmark corpora).

## Belmont integration (when needed)

- Standalone: `pi install npm:pi-web-access` from inside the pi REPL —
  no Belmont harness change required. The harness's blast-radius gate
  (§12.3) already covers MCP-shaped servers; pi-web-access registers
  as a regular pi extension that exposes 4 tools.
- API keys: `~/.pi/web-search.json` per the package's README. Belmont
  must NOT auto-create this; user-driven config only.
- Video frame extraction needs `ffmpeg` + `yt-dlp` — defer detection to
  the M3 `belmont init` boot doctor only when the feature is wired.

## Risks

- Pre-1.0 versioning (0.10.x) — breaking changes possible before 1.0.0
  release of the package. v1.0 ship of Belmont is not blocked.
- Multi-vendor fallback chain (Exa/Perplexity/Gemini) means cost +
  privacy posture varies by which provider answers. Belmont's preferences
  (§15.3) gain a line if/when this lands: "web_search defaults to Exa
  zero-config; user opts into others by adding keys."

## Re-evaluation triggers

- A v1.1+ milestone introduces a `/belmont:research` skill, or external
  fetch is needed.
- Package reaches 1.0.0 (re-check schema stability + breaking changes).
