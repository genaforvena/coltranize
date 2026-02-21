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

## Installation

1. Download or clone this repository.
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select the `manifest.json` file inside this folder.
4. The 🎸 icon appears in your toolbar.

> For a permanent install, the extension can be packaged and submitted to [addons.mozilla.org](https://addons.mozilla.org).

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
