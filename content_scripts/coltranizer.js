/* Coltranizer — content script
 * Finds chord progressions in page text and applies Coltrane-inspired
 * harmonic transformations. Communicates with the popup via runtime messages.
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

  // Extended regex supporting a wide range of chord qualities
  const CHORD_RE = /^([A-G][b#]?)(maj13|maj9|maj7#11|maj7#5|maj7|maj6|mM7|m7b5|m13|m11|m9|m7|m6|m|dim7|dim|aug7|aug|7b9|7#9|7#11|7#5|7b5|7sus4|13|11|9|7|6|maj|M7|M|△7|sus4|sus2|add9)?$/;

  function parseChord(token) {
    const m = token.match(CHORD_RE);
    if (!m) return null;
    return { root: m[1], quality: m[2] || "" };
  }

  function isMajorQuality(quality) {
    return quality === "" || quality === "maj" || quality === "M" ||
           quality === "maj7" || quality === "M7" || quality === "△7" ||
           quality === "maj9" || quality === "maj13" || quality === "maj6" ||
           quality === "maj7#11" || quality === "maj7#5" ||
           quality === "6" || quality === "add9";
  }

  function isMinorQuality(quality) {
    return quality.startsWith("m") && !quality.startsWith("maj") && quality !== "M" && quality !== "M7";
  }

  function isDominantQuality(quality) {
    return quality === "7" || quality === "9" || quality === "11" || quality === "13" ||
           quality === "7b9" || quality === "7#9" || quality === "7#11" ||
           quality === "7#5" || quality === "7b5" || quality === "7sus4";
  }

  function isStableQuality(quality) {
    // Include "7" so that normalised plain-major chords (→ 7) can act as tonic
    return isMajorQuality(quality) || isMinorQuality(quality) || quality === "7";
  }

  /**
   * Upgrade simple/bare chord qualities to their 7th equivalents so they can
   * participate in II-V-I detection and transformation.
   *   plain major ("")  → "7"   (acts as dominant / blues I7)
   *   plain minor ("m") → "m7"
   *   "maj" / "M"       → "maj7"
   */
  function normalizeSimpleChord(chord) {
    switch (chord.quality) {
      case "":    return { root: chord.root, quality: "7" };
      case "m":   return { root: chord.root, quality: "m7" };
      case "maj": return { root: chord.root, quality: "maj7" };
      case "M":   return { root: chord.root, quality: "maj7" };
      default:    return chord;
    }
  }

  // ── Transform strategies ────────────────────────────────────────────────────

  // Qualities used in Alchemy mode, ordered from simple to exotic
  const DOMINANT_QUALITIES_ALCHEMY = ["7", "9", "13", "7b9", "7#9", "7#11", "7#5", "aug7"];
  const TONIC_MAJ_QUALITIES_ALCHEMY = ["", "maj7", "maj9", "maj13", "maj7#11", "6"];
  const TONIC_MIN_QUALITIES_ALCHEMY = ["m7", "m9", "m11", "m7b5", "m6"];

  function randomAlchemyQuality(arr, intensity) {
    // Higher intensity → access more exotic (later) entries
    const count = Math.max(1, Math.ceil(arr.length * (0.3 + intensity * 0.7)));
    const slice = arr.slice(0, count);
    return slice[Math.floor(Math.random() * slice.length)];
  }

  /**
   * Each strategy has two transform functions:
   *   dominantTransform(root, origDomQuality, intensity) → chord string
   *   tonicTransform(root, origTonicQuality, useMaj7, intensity) → chord string
   */
  const TRANSFORM_STRATEGIES = {
    COLTRANE_CLASSIC: {
      dominantTransform: (root, _q, _i) => root + "7",
      tonicTransform:    (root, _q, useMaj7, _i) => root + (useMaj7 ? "maj7" : ""),
    },
    PRESERVE_QUALITY: {
      dominantTransform: (root, _q, _i) => root + "7",
      tonicTransform:    (root, origQuality, _useMaj7, _i) => root + origQuality,
    },
    JAZZ_FUSION: {
      dominantTransform: (root, _q, _i) => root + "13",
      tonicTransform:    (root, origQuality, _useMaj7, _i) =>
        isMinorQuality(origQuality) ? root + "m9" : root + "maj9",
    },
    ALCHEMY: {
      dominantTransform: (root, _q, intensity) =>
        root + randomAlchemyQuality(DOMINANT_QUALITIES_ALCHEMY, intensity),
      tonicTransform: (root, origQuality, _useMaj7, intensity) => {
        const arr = isMinorQuality(origQuality)
          ? TONIC_MIN_QUALITIES_ALCHEMY
          : TONIC_MAJ_QUALITIES_ALCHEMY;
        return root + randomAlchemyQuality(arr, intensity);
      },
    },
  };

  // ── Core Coltrane substitution ──────────────────────────────────────────────

  /**
   * Given a parsed chord segment and a target tonic root, generates the
   * Coltrane replacement sequence using the selected strategy.
   *
   * For a II-V-I (3+ chords ending in V7-Istable):
   *   [prefix…] T3_7 T3res_I T2_7 T2res_I V7(orig) I(orig)
   * where T2 = tonic+4st, T3 = tonic+8st, T2res = T2+5st, T3res = T3+5st.
   *
   * For a single stable chord (expandMajor mode):
   *   T3_7 T3res_I T2_7 T2res_I T1_7 T1_I
   */
  function generateColtraneReplacement(segment, targetTonic, options) {
    const stratKey = options.strategy || "COLTRANE_CLASSIC";
    const strat    = TRANSFORM_STRATEGIES[stratKey] || TRANSFORM_STRATEGIES.COLTRANE_CLASSIC;
    const intensity = (options.intensity !== undefined ? options.intensity : 50) / 100;
    const useMaj7  = options.useMaj7 !== false;

    const t1    = targetTonic;
    const t2    = transposeNote(t1, 4);
    const t3    = transposeNote(t1, 8);
    const t2res = transposeNote(t2, 5);
    const t3res = transposeNote(t3, 5);

    if (segment.length === 1) {
      // Single stable chord — expand to full triangle cycle
      const origQuality = segment[0].quality;
      return [
        strat.dominantTransform(t3, origQuality, intensity),
        strat.tonicTransform(t3res, origQuality, useMaj7, intensity),
        strat.dominantTransform(t2, origQuality, intensity),
        strat.tonicTransform(t2res, origQuality, useMaj7, intensity),
        strat.dominantTransform(t1, origQuality, intensity),
        strat.tonicTransform(t1, origQuality, useMaj7, intensity),
      ];
    }

    // 3-chord (or longer) II-V-I: keep prefix intact, substitute V-I cadences
    const vChord = segment[segment.length - 2];
    const iChord = segment[segment.length - 1];
    const prefix = segment.slice(0, segment.length - 2).map(c => c.root + c.quality);

    return [
      ...prefix,
      strat.dominantTransform(t3, vChord.quality, intensity),
      strat.tonicTransform(t3res, iChord.quality, useMaj7, intensity),
      strat.dominantTransform(t2, vChord.quality, intensity),
      strat.tonicTransform(t2res, iChord.quality, useMaj7, intensity),
      vChord.root + vChord.quality,
      strat.tonicTransform(t1, iChord.quality, useMaj7, intensity),
    ];
  }

  // ── Candidate finding ───────────────────────────────────────────────────────

  /**
   * Finds transformation candidates within a parsed chord array.
   * Returns an array of { startIndex, endIndex, tonic, type, confidence }.
   */
  function findTransformationCandidates(chords, options) {
    const candidates = [];

    // 1. Classic II-V-I: last chord stable, second-to-last dominant
    for (let i = 0; i <= chords.length - 3; i++) {
      const win = chords.slice(i, i + 3);
      if (isStableQuality(win[2].quality) && isDominantQuality(win[1].quality)) {
        candidates.push({
          startIndex: i,
          endIndex:   i + 2,
          tonic:      win[2].root,
          type:       "ii-v-i",
          confidence: 1.0,
        });
        i += 2; // move past this window (non-overlapping)
      }
    }

    // 2. Experimental: any 3-chord window (when no II-V-I found)
    if (options.experimental && candidates.length === 0) {
      for (let i = 0; i <= chords.length - 3; i++) {
        const win = chords.slice(i, i + 3);
        candidates.push({
          startIndex: i,
          endIndex:   i + 2,
          tonic:      win[2].root,
          type:       "three-chord",
          confidence: 0.5,
        });
      }
    }

    // 3. Expand all stable chords not already covered
    if (options.expandMajor) {
      const covered = new Set();
      candidates.forEach(c => {
        for (let i = c.startIndex; i <= c.endIndex; i++) covered.add(i);
      });
      for (let i = 0; i < chords.length; i++) {
        if (!covered.has(i) && isStableQuality(chords[i].quality)) {
          candidates.push({
            startIndex: i,
            endIndex:   i,
            tonic:      chords[i].root,
            type:       "single-stable",
            confidence: 0.7,
          });
        }
      }
    }

    return candidates;
  }

  // ── Apply transformation to a parsed chord sequence ─────────────────────────

  function applyTransformationToSequence(chords, options) {
    const candidates = findTransformationCandidates(chords, options);
    if (candidates.length === 0) return null;

    // Longer sequences first; break ties by confidence
    candidates.sort((a, b) => {
      const lenDiff = (b.endIndex - b.startIndex) - (a.endIndex - a.startIndex);
      return lenDiff !== 0 ? lenDiff : b.confidence - a.confidence;
    });

    const replaced = new Array(chords.length).fill(false);
    const insertions = [];

    for (const cand of candidates) {
      let canReplace = true;
      for (let i = cand.startIndex; i <= cand.endIndex; i++) {
        if (replaced[i]) { canReplace = false; break; }
      }
      if (!canReplace) continue;

      const segment     = chords.slice(cand.startIndex, cand.endIndex + 1);
      const replacement = generateColtraneReplacement(segment, cand.tonic, options);
      insertions.push({ startIndex: cand.startIndex, endIndex: cand.endIndex, replacement });
      for (let i = cand.startIndex; i <= cand.endIndex; i++) replaced[i] = true;
    }

    if (insertions.length === 0) return null;

    // Apply back-to-front to keep indices valid
    insertions.sort((a, b) => b.startIndex - a.startIndex);
    const result = chords.map(c => c.root + c.quality);
    for (const ins of insertions) {
      result.splice(ins.startIndex, ins.endIndex - ins.startIndex + 1, ...ins.replacement);
    }
    return result;
  }

  // ── Passing chords ──────────────────────────────────────────────────────────

  /**
   * Adds chromatic dominant passing chords between consecutive chords.
   * Probability of insertion is proportional to intensity.
   * The passing chord quality is generated by the strategy's dominantTransform.
   */
  function addPassingChords(chordStrings, intensity, dominantTransform) {
    const result = [];
    for (let i = 0; i < chordStrings.length - 1; i++) {
      result.push(chordStrings[i]);
      if (Math.random() < intensity * 0.6) {
        const current = parseChord(chordStrings[i]);
        if (current) {
          const passingRoot = transposeNote(current.root, 1);
          result.push(dominantTransform(passingRoot, "", intensity));
        }
      }
    }
    result.push(chordStrings[chordStrings.length - 1]);
    return result;
  }

  // ── DOM text scanning ───────────────────────────────────────────────────────

  // Extended PROGRESSION_RE matching 3+ consecutive chord tokens
  const CHORD_QUALITY_PART =
    "(?:maj13|maj9|maj7#11|maj7#5|maj7|maj6|mM7|m7b5|m13|m11|m9|m7|m6|m" +
    "|dim7|dim|aug7|aug|7b9|7#9|7#11|7#5|7b5|7sus4|13|11|9|7|6" +
    "|maj|M7|M|\u25b37|sus4|sus2|add9)?";

  const PROGRESSION_RE = new RegExp(
    "(?:(?:[A-G][b#]?" + CHORD_QUALITY_PART + ")(?:\\s+|$)){3,}",
    "g"
  );

  let replacementCount = 0;
  let totalChordsCount = 0;
  let progressionsCount = 0;
  let originalHTML = null;

  /**
   * Attempts to transform a whitespace-delimited run of chord tokens.
   * Returns the replacement string, or null if no transformation applied.
   */
  function processPotentialProgression(text, options) {
    const tokens = text.trim().split(/\s+/);
    if (tokens.length < 3) return null;

    const parsed = tokens.map(parseChord);
    if (parsed.some(c => c === null)) return null;

    totalChordsCount += parsed.length;
    progressionsCount++;

    // Upgrade simple bare chords (plain major/minor) to 7th equivalents so
    // they can participate in II-V-I detection and transformation.
    const normalized = parsed.map(normalizeSimpleChord);

    const result = applyTransformationToSequence(normalized, options);
    if (!result) return null;

    let final = result;
    if (options.addPassing && final.length >= 2) {
      const intensity = (options.intensity !== undefined ? options.intensity : 50) / 100;
      const stratKey = options.strategy || "COLTRANE_CLASSIC";
      const strat = TRANSFORM_STRATEGIES[stratKey] || TRANSFORM_STRATEGIES.COLTRANE_CLASSIC;
      final = addPassingChords(final, intensity, strat.dominantTransform);
    }

    return final.join(" ");
  }

  /**
   * Scans every text node in the document and applies transformations.
   * Returns statistics: { count, totalChords, progressions }.
   */
  function replaceInPage(options) {
    replacementCount  = 0;
    totalChordsCount  = 0;
    progressionsCount = 0;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toUpperCase();
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    for (const textNode of textNodes) {
      const original = textNode.nodeValue;
      const newValue = original.replace(PROGRESSION_RE, (match) => {
        const result = processPotentialProgression(match.trim(), options);
        if (result !== null) {
          replacementCount++;
          const trailingWS = match.match(/\s+$/);
          return result + (trailingWS ? trailingWS[0] : "");
        }
        return match;
      });
      if (newValue !== original) {
        textNode.nodeValue = newValue;
      }
    }

    return {
      count:       replacementCount,
      totalChords: totalChordsCount,
      progressions: progressionsCount,
    };
  }

  // ── Message handler ─────────────────────────────────────────────────────────

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "coltranize") {
      if (!originalHTML) {
        originalHTML = document.body.innerHTML;
      }
      const opts = {
        strategy:    message.strategy    || "COLTRANE_CLASSIC",
        useMaj7:     message.useMaj7     !== false,
        intensity:   message.intensity   !== undefined ? message.intensity : 50,
        addPassing:  message.addPassing  || false,
        expandMajor: message.expandMajor || false,
        experimental: message.experimental || false,
      };
      const result = replaceInPage(opts);
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
