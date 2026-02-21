/* Coltranizer — content script
 * Finds II-V-I chord progressions in page text and replaces them
 * with Coltrane changes. Communicates with the popup via runtime messages.
 */

(function () {
  "use strict";

  // ── Music theory helpers ────────────────────────────────────────────────────

  const NOTES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const NOTES_FLAT  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

  // Prefer flat names for certain roots (more common in jazz)
  const PREFER_FLAT = new Set([1, 3, 6, 8, 10]); // Db Eb Gb Ab Bb

  function noteToIndex(note) {
    let idx = NOTES_SHARP.indexOf(note);
    if (idx === -1) idx = NOTES_FLAT.indexOf(note);
    return idx; // -1 when not found
  }

  function indexToNote(idx) {
    idx = ((idx % 12) + 12) % 12;
    return PREFER_FLAT.has(idx) ? NOTES_FLAT[idx] : NOTES_SHARP[idx];
  }

  function transposeNote(note, semitones) {
    const idx = noteToIndex(note);
    if (idx === -1) return note;
    return indexToNote(idx + semitones);
  }

  // ── Chord parsing ───────────────────────────────────────────────────────────

  // Regex for a single chord token
  const CHORD_RE = /^([A-G][b#]?)(maj7|M7|△7|maj9|m7|m9|7|m|maj|M)?$/;

  function parseChord(token) {
    const m = token.match(CHORD_RE);
    if (!m) return null;
    return { root: m[1], quality: m[2] || "" };
  }

  function isMajor(quality) {
    // maj7, M7, △7, maj9, maj, M, or empty string = major-ish
    return quality === "" || quality === "maj" || quality === "M" ||
           quality === "maj7" || quality === "M7" || quality === "△7" ||
           quality === "maj9";
  }

  function isDominant(quality) {
    return quality === "7";
  }

  // ── Coltrane algorithm ──────────────────────────────────────────────────────

  /**
   * Given a parsed sequence ending in V7-Imaj7, returns the coltranized
   * sequence as an array of chord strings.
   *
   * Algorithm:
   *   Given tonic T1:
   *   T2 = T1 + 4 semitones (major third up, e.g. C→E)
   *   T3 = T1 + 8 semitones (two major thirds up, e.g. C→Ab)
   *
   *   Substitution inserts two new V7-I cadences BEFORE the original V7-I:
   *   [prefix] T3_7 (T3+5)maj7 T2_7 (T2+5)maj7 V7(original) Imaj7(original)
   *
   *   Example: Dm7 G7 Cmaj7 → Dm7 Ab7 Dbmaj7 E7 Amaj7 G7 Cmaj7
   */
  function coltranize(chords, useMaj7) {
    if (chords.length < 3) return null;

    // Last chord must be major (tonic = I)
    const tonic = chords[chords.length - 1];
    if (!isMajor(tonic.quality)) return null;

    // Second-to-last must be dominant V7
    const dominant = chords[chords.length - 2];
    if (!isDominant(dominant.quality)) return null;

    const t1 = tonic.root;
    const t2 = transposeNote(t1, 4);   // major third up (e.g. C→E)
    const t3 = transposeNote(t1, 8);   // two major thirds up (e.g. C→Ab)

    // Each new V7 resolves up a perfect fourth (5 semitones)
    const t3res = transposeNote(t3, 5); // Ab→Db
    const t2res = transposeNote(t2, 5); // E→A

    const iQuality = useMaj7 ? "maj7" : "";

    // Preserve everything before V7-I as-is (the II and any leading chords)
    const prefix = chords.slice(0, chords.length - 2).map(c => c.root + c.quality);

    const substitution = [
      t3 + "7", t3res + iQuality,
      t2 + "7", t2res + iQuality,
      dominant.root + dominant.quality,
      t1 + (useMaj7 && isMajor(tonic.quality) ? "maj7" : tonic.quality),
    ];

    return [...prefix, ...substitution];
  }

  // ── DOM text scanning ───────────────────────────────────────────────────────

  /**
   * Returns all text nodes (with their selected offsets) that fall within
   * the given Range. For each node the `start` and `end` indices describe
   * which portion of `node.nodeValue` is covered by the selection.
   */
  function getTextNodesInRange(range) {
    const result = [];
    const { startContainer, startOffset, endContainer, endOffset } = range;

    // Fast path: entire selection is inside a single text node
    if (startContainer === endContainer &&
        startContainer.nodeType === Node.TEXT_NODE) {
      result.push({ node: startContainer, start: startOffset, end: endOffset });
      return result;
    }

    const walker = document.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toUpperCase();
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
            return NodeFilter.FILTER_REJECT;
          }
          return range.intersectsNode(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        }
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      const start = node === startContainer ? startOffset : 0;
      const end   = node === endContainer   ? endOffset   : node.nodeValue.length;
      if (start < end) {
        result.push({ node, start, end });
      }
    }

    return result;
  }

  /**
   * Attempt to coltranize a whitespace-delimited run of tokens.
   * Returns the replacement string or null if no II-V-I was found.
   */
  function processPotentialProgression(text, useMaj7, autoDetect) {
    const tokens = text.trim().split(/\s+/);
    if (tokens.length < 3) return null;

    const parsed = tokens.map(parseChord);
    if (parsed.some(c => c === null)) return null; // non-chord token present

    if (autoDetect) {
      const result = coltranize(parsed, useMaj7);
      return result ? result.join(" ") : null;
    } else {
      // Without auto-detection, try all 3-chord windows
      let changed = false;
      const out = [...parsed];
      for (let i = out.length - 3; i >= 0; i--) {
        const slice = out.slice(i, i + 3);
        const result = coltranize(slice, useMaj7);
        if (result) {
          out.splice(i, 3, ...result.map(parseChord));
          changed = true;
        }
      }
      if (!changed) return null;
      return out.map(c => c.root + c.quality).join(" ");
    }
  }

  // Regex to match chord-like runs (3+ chord tokens separated by spaces)
  // We use a broad approach: scan text nodes for segments that look like
  // sequences of chord tokens.
  const PROGRESSION_RE = new RegExp(
    "(?:(?:[A-G][b#]?(?:maj7|M7|\u25b37|maj9|m7|m9|7|m|maj|M)?)(?:\\s+|$)){3,}",
    "g"
  );

  let replacementCount = 0;
  let originalHTML = null;

  /**
   * Processes only the text the user has currently selected on the page.
   * Returns { count } on success or { count: 0, noSelection: true } when
   * nothing is selected.
   */
  function replaceInSelection(useMaj7, autoDetect) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      return { count: 0, noSelection: true };
    }

    replacementCount = 0;

    // Collect all modifications first so that changing one text node's value
    // does not invalidate the offsets captured for another range on the same node.
    // Each entry: { node, start, end }
    const modifications = [];

    for (let ri = 0; ri < sel.rangeCount; ri++) {
      const range = sel.getRangeAt(ri);
      for (const segment of getTextNodesInRange(range)) {
        modifications.push(segment);
      }
    }

    // Group by node and sort each group by descending start offset so that
    // applying replacements back-to-front keeps earlier offsets valid.
    const byNode = new Map();
    for (const seg of modifications) {
      if (!byNode.has(seg.node)) byNode.set(seg.node, []);
      byNode.get(seg.node).push(seg);
    }

    for (const [node, segs] of byNode) {
      // Apply from the end of the text node toward the beginning
      segs.sort((a, b) => b.start - a.start);

      for (const { start, end } of segs) {
        const original     = node.nodeValue;
        const selectedPart = original.substring(start, end);

        const replaced = selectedPart.replace(PROGRESSION_RE, (match) => {
          const result = processPotentialProgression(match.trim(), useMaj7, autoDetect);
          if (result) {
            replacementCount++;
            const trailingWS = match.match(/\s+$/);
            return result + (trailingWS ? trailingWS[0] : "");
          }
          return match;
        });

        if (replaced !== selectedPart) {
          node.nodeValue = original.substring(0, start) + replaced + original.substring(end);
        }
      }
    }

    return { count: replacementCount };
  }

  // ── Message handler ─────────────────────────────────────────────────────────

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "coltranize") {
      if (!originalHTML) {
        originalHTML = document.body.innerHTML;
      }
      const result = replaceInSelection(
        message.useMaj7 !== false,
        message.autoDetect !== false
      );
      sendResponse(result);
    } else if (message.action === "restore") {
      if (originalHTML !== null) {
        // We restore the HTML we captured from this same page before any
        // modifications. The content comes from the page itself (same origin),
        // so there is no additional XSS surface beyond what the page already had.
        document.body.innerHTML = originalHTML;
        originalHTML = null;
      }
      sendResponse({ ok: true });
    } else if (message.action === "ping") {
      sendResponse({ ok: true });
    }
    return true; // keep channel open for async response
  });
})();
