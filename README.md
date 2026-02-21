# 🎸 Coltranizer

A Firefox extension that applies **Coltrane changes** to chord progressions you select on any web page — tabs, lyrics, lead sheets, you name it.

## What it does

Select any text containing chord progressions on a web page (e.g. on Ultimate Guitar, Songsterr, or a plain text tab site), click **⚡ Coltranize!** in the popup, and every II–V–I progression in your selection is replaced with its Coltrane-changes equivalent.

**Example:**

```
Dm7 G7 Cmaj7  →  Dm7 Ab7 Dbmaj7 E7 Amaj7 G7 Cmaj7
```

The harmonic substitution builds a "tritone-of-thirds" cycle:

```
Given tonic T1 (e.g. C):
  T3 = T1 + 8 semitones  →  Ab  (V7: Ab7 → Db)
  T2 = T1 + 4 semitones  →  E   (V7: E7  → A)
  Original cadence        →  G7  → Cmaj7

Result: Dm7  Ab7 Dbmaj7  E7 Amaj7  G7 Cmaj7
```

One click restores the original page text.

## Installation & testing

### Option A — Load temporarily (no sign-up required)

This is the quickest way to try the extension on your own machine. The add-on is removed when Firefox is closed.

1. Clone or download this repository.
2. Open Firefox and go to **`about:debugging#/runtime/this-firefox`**.
3. Click **Load Temporary Add-on…**.
4. Navigate to the repository folder and select **`manifest.json`**.
5. The 🎸 icon appears in your toolbar immediately.

### Option B — Permanent local install with `web-ext`

[`web-ext`](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/) is Mozilla's official CLI tool. It hot-reloads the extension on file changes, making local development much smoother.

```bash
# Install web-ext globally (requires Node.js)
npm install --global web-ext

# From the repository root, start Firefox with the extension loaded
web-ext run

# Or target a specific Firefox binary
web-ext run --firefox /path/to/firefox
```

`web-ext run` opens a fresh Firefox profile with the extension pre-installed and reloads it automatically whenever you save a file.

#### Lint before packaging

```bash
web-ext lint
```

This validates `manifest.json` and the extension source against Mozilla's rules and catches common mistakes before you submit.

### Option C — Publish to addons.mozilla.org (AMO)

Publishing makes the extension available to everyone and enables automatic updates.

1. **Create a developer account** at [addons.mozilla.org/developers](https://addons.mozilla.org/en-US/developers/).

2. **Package the extension:**
   ```bash
   web-ext build
   # Creates web-ext-artifacts/coltranizer-<version>.zip
   ```

3. **Submit for review:**
   - Go to [Submit a new add-on](https://addons.mozilla.org/en-US/developers/addon/submit/distribution) on AMO.
   - Choose **List on this site** (public) or **On your own** (self-distributed).
   - Upload the `.zip` produced in the previous step.
   - Fill in the listing details (name, description, screenshots, category).
   - Submit — Mozilla's review team will approve the extension (typically within a few days for straightforward extensions).

4. **Self-distribution (signed `.xpi` without AMO listing):**
   ```bash
   # Requires AMO API credentials — see
   # https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/#sign-a-web-extension
   web-ext sign --api-key=<jwt-issuer> --api-secret=<jwt-secret>
   # Produces a signed .xpi that can be installed via drag-and-drop into Firefox
   ```

> **Note:** Firefox requires all extensions to be signed by Mozilla before they can be permanently installed in release builds. Unsigned extensions only work in Firefox Developer Edition / Nightly with `xpinstall.signatures.required` set to `false` in `about:config`.

## Usage

1. **Select** the chord text on the page (drag to highlight, or Ctrl+A inside a `<pre>` block).
2. Click the **🎸** toolbar icon to open the popup.
3. Click **⚡ Coltranize!** — the selected chords are replaced in-place.
4. Click **↺ Restore original** to undo all changes.

### Settings

| Option | Default | Effect |
|---|---|---|
| Auto-detect II–V–I | ✅ on | Only processes sequences that end with V7 → Imaj7 |
| Use maj7 chords | ✅ on | Resolving chords use `maj7` suffix; turn off for plain triads |

Settings are saved automatically between sessions.

## How it works

### Coltrane Changes (algorithm)

John Coltrane's harmonic substitution system (*Giant Steps*, *Countdown*) replaces a single II–V–I with three interlocking V–I cadences whose roots are a major third apart:

```
[prefix]  T3_7  T3res_maj7  T2_7  T2res_maj7  V7  Imaj7
```

where `T3 = tonic + 8st`, `T2 = tonic + 4st`, and each resolution is up a perfect fourth (+5st).

### Selection processing

The extension uses `window.getSelection()` to find only the text nodes (and their exact character offsets) inside the highlighted area. It never touches content outside the selection. Replacements are applied back-to-front within each text node so offset arithmetic remains valid for multi-range selections.

### Chord quality support

`maj7` · `M7` · `△7` · `maj9` · `m7` · `m9` · `7` · `m` · `maj` · `M` · *(plain root)*

Enharmonic spelling follows jazz convention: Db Eb Gb Ab Bb are preferred over C# D# F# G# A#.

## Project structure

```
coltranizer/
├── manifest.json               # WebExtension MV2 manifest (Firefox 58+)
├── icons/
│   └── icon-48.png             # Toolbar icon
├── popup/
│   ├── popup.html              # Popup UI
│   ├── popup.css               # Styles
│   └── popup.js                # Popup logic & settings persistence
└── content_scripts/
    └── coltranizer.js          # Core algorithm + selection-based DOM processing
```

## Permissions

| Permission | Reason |
|---|---|
| `activeTab` | Send messages to the current tab's content script |
| `storage` | Persist checkbox settings across sessions |

## License

MIT
