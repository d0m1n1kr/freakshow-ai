import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generates speaker statistics for each episode from transcript files.
 * 
 * Output format:
 * {
 *   v: 1,
 *   episode: 123,
 *   episodeDurationSec: 6640,
 *   speakers: ["Tim Pritlove", ...],
 *   speakerStats: {
 *     "Tim Pritlove": {
 *       overall: { ... },
 *       temporal: [ ... ]
 *     }
 *   }
 * }
 */

function parseArgs(argv) {
  const args = {
    projectRoot: path.join(__dirname, '..'),
    podcastId: 'freakshow',
    inDir: null,
    outDir: null,
    episode: null,
    all: false,
    pretty: false,
  };

  const a = argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--podcast') args.podcastId = a[++i] ?? 'freakshow';
    else if (k === '--in-dir') args.inDir = a[++i] ?? null;
    else if (k === '--out-dir') args.outDir = a[++i] ?? null;
    else if (k === '--episode') args.episode = a[++i] ?? null;
    else if (k === '--all') args.all = true;
    else if (k === '--pretty') args.pretty = true;
    else if (k === '--help' || k === '-h') args.help = true;
    else throw new Error(`Unknown arg: ${k}`);
  }

  return args;
}

function parseHmsToSec(timeStr) {
  if (typeof timeStr !== 'string') return null;
  const s = timeStr.trim();
  if (!s) return null;

  const parts = s.split(':').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0 || parts.length > 3) return null;

  const nums = parts.map((p) => {
    const n = parseInt(p, 10);
    return Number.isFinite(n) ? n : null;
  });
  if (nums.some((n) => n === null)) return null;

  if (nums.length === 3) {
    const [h, m, sec] = nums;
    return h * 3600 + m * 60 + sec;
  }
  if (nums.length === 2) {
    const [m, sec] = nums;
    return m * 60 + sec;
  }
  return nums[0];
}

function extractEpisodeNumberFromFilename(filename) {
  const m = filename.match(/^(\d+)-ts\.json$/);
  return m ? parseInt(m[1], 10) : null;
}

function calculateQuartiles(sortedValues) {
  if (sortedValues.length === 0) {
    return { min: 0, q1: 0, median: 0, q3: 0, max: 0 };
  }

  const min = sortedValues[0];
  const max = sortedValues[sortedValues.length - 1];
  
  const median = calculateMedian(sortedValues);
  
  const mid = Math.floor(sortedValues.length / 2);
  const lowerHalf = sortedValues.slice(0, mid);
  const upperHalf = sortedValues.slice(sortedValues.length % 2 === 0 ? mid : mid + 1);
  
  const q1 = calculateMedian(lowerHalf);
  const q3 = calculateMedian(upperHalf);

  return { min, q1, median, q3, max };
}

function calculateMedian(sortedValues) {
  if (sortedValues.length === 0) return 0;
  const mid = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 0) {
    return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
  }
  return sortedValues[mid];
}

function calculateMean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function calculateVariance(values, mean) {
  if (values.length === 0) return 0;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return calculateMean(squaredDiffs);
}

function calculateStdDev(variance) {
  return Math.sqrt(variance);
}

function findMonologues(allSegments, targetSpeaker) {
  // Sort all segments chronologically
  const allSorted = [...allSegments].sort((a, b) => a.startSec - b.startSec);
  
  const monologues = [];
  let currentMonologueStart = null;
  let currentMonologueEnd = null;

  for (const seg of allSorted) {
    if (seg.speaker === targetSpeaker) {
      if (currentMonologueStart === null) {
        // Start new monologue
        currentMonologueStart = seg.startSec;
        currentMonologueEnd = seg.endSec;
      } else {
        // Check if this segment continues the current monologue
        // (no gap or very small gap, and no other speaker interrupted)
        if (seg.startSec <= currentMonologueEnd + 2) {
          // Extend monologue
          currentMonologueEnd = Math.max(currentMonologueEnd, seg.endSec);
        } else {
          // Gap detected, save current monologue and start new one
          monologues.push({
            speaker: targetSpeaker,
            startSec: currentMonologueStart,
            endSec: currentMonologueEnd,
            durationSec: currentMonologueEnd - currentMonologueStart,
          });
          currentMonologueStart = seg.startSec;
          currentMonologueEnd = seg.endSec;
        }
      }
    } else {
      // Different speaker - if we had a monologue, it's now interrupted
      if (currentMonologueStart !== null && seg.startSec < currentMonologueEnd) {
        // This segment interrupts the monologue
        monologues.push({
          speaker: targetSpeaker,
          startSec: currentMonologueStart,
          endSec: seg.startSec,
          durationSec: seg.startSec - currentMonologueStart,
        });
        currentMonologueStart = null;
        currentMonologueEnd = null;
      }
    }
  }
  
  // Don't forget the last monologue if it exists
  if (currentMonologueStart !== null) {
    monologues.push({
      speaker: targetSpeaker,
      startSec: currentMonologueStart,
      endSec: currentMonologueEnd,
      durationSec: currentMonologueEnd - currentMonologueStart,
    });
  }
  
  return monologues;
}

function calculateStatsForSegments(segments, allSegments = null, targetSpeaker = null) {
  if (segments.length === 0) {
    return {
      totalSpeakingTimeSec: 0,
      segmentCount: 0,
      longestMonologueSec: 0,
      shortestSegmentSec: 0,
      averageSegmentDurationSec: 0,
      medianSegmentDurationSec: 0,
      varianceSegmentDurationSec: 0,
      stdDevSegmentDurationSec: 0,
      boxplot: { min: 0, q1: 0, median: 0, q3: 0, max: 0 },
    };
  }

  const durations = segments.map(s => s.durationSec);
  const sortedDurations = [...durations].sort((a, b) => a - b);
  
  // Find monologues: if allSegments and targetSpeaker provided, use full context
  // Otherwise, just use segments (for temporal intervals where context might be limited)
  let longestMonologue = 0;
  if (allSegments && targetSpeaker) {
    const monologues = findMonologues(allSegments, targetSpeaker);
    longestMonologue = monologues.length > 0
      ? Math.max(...monologues.map(m => m.durationSec))
      : 0;
  } else {
    // Fallback: treat each segment as its own monologue for intervals
    longestMonologue = sortedDurations.length > 0 ? sortedDurations[sortedDurations.length - 1] : 0;
  }

  const totalSpeakingTimeSec = durations.reduce((sum, d) => sum + d, 0);
  const mean = calculateMean(durations);
  const variance = calculateVariance(durations, mean);
  const stdDev = calculateStdDev(variance);
  const median = calculateMedian(sortedDurations);
  const boxplot = calculateQuartiles(sortedDurations);

  return {
    totalSpeakingTimeSec,
    segmentCount: segments.length,
    longestMonologueSec: longestMonologue,
    shortestSegmentSec: sortedDurations[0],
    averageSegmentDurationSec: mean,
    medianSegmentDurationSec: median,
    varianceSegmentDurationSec: variance,
    stdDevSegmentDurationSec: stdDev,
    boxplot,
  };
}

function getIntervalIndex(sec, intervalSizeSec = 600) {
  return Math.floor(sec / intervalSizeSec);
}

async function generateOne(inputPath, outputPath, { pretty }) {
  const raw = await fs.readFile(inputPath, 'utf8');
  const json = JSON.parse(raw);

  const rows = Array.isArray(json?.transcript) ? json.transcript : null;
  if (!rows) throw new Error(`Invalid transcript JSON (missing transcript array): ${inputPath}`);

  // Parse and filter segments with valid timestamps
  const items = [];
  for (const r of rows) {
    const speaker = typeof r?.speaker === 'string' ? r.speaker.trim() : '';
    const text = typeof r?.text === 'string' ? r.text.trim() : '';
    const sec = parseHmsToSec(r?.time);
    
    // Skip segments without valid speaker, text, or timestamp
    if (!speaker || !text || !Number.isFinite(sec)) continue;
    
    items.push({
      speaker,
      startSec: Math.max(0, Math.floor(sec)),
      text,
    });
  }

  if (items.length === 0) {
    throw new Error(`No valid segments found in transcript: ${inputPath}`);
  }

  // Sort by time
  items.sort((a, b) => a.startSec - b.startSec);

  // Calculate segment durations
  // Duration is the time until the next segment starts
  const segments = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let durationSec;
    
    if (i < items.length - 1) {
      // Duration until next segment
      durationSec = items[i + 1].startSec - item.startSec;
    } else {
      // Last segment: use average duration of previous segments
      const previousDurations = segments.map(s => s.durationSec);
      durationSec = previousDurations.length > 0
        ? calculateMean(previousDurations)
        : 5; // Fallback: 5 seconds if no previous segments
    }
    
    segments.push({
      speaker: item.speaker,
      startSec: item.startSec,
      endSec: item.startSec + durationSec,
      durationSec: Math.max(0, durationSec),
    });
  }

  // Determine episode duration (last segment end time, rounded to integer)
  const episodeDurationSec = segments.length > 0
    ? Math.round(segments[segments.length - 1].endSec)
    : 0;

  // Get unique speakers
  const speakers = [...new Set(segments.map(s => s.speaker))].sort();

  // Calculate overall stats per speaker
  const speakerStats = {};
  for (const speaker of speakers) {
    const speakerSegments = segments.filter(s => s.speaker === speaker);
    const overallStats = calculateStatsForSegments(speakerSegments, segments, speaker);
    
    // Calculate speaking share (relative to total speaking time of all speakers)
    const totalAllSpeakingTime = segments.reduce((sum, s) => sum + s.durationSec, 0);
    const speakingShare = totalAllSpeakingTime > 0
      ? overallStats.totalSpeakingTimeSec / totalAllSpeakingTime
      : 0;

    speakerStats[speaker] = {
      overall: {
        ...overallStats,
        speakingShare,
      },
      temporal: [],
    };
  }

  // Calculate temporal stats (10-minute intervals = 600 seconds)
  const intervalSizeSec = 600;
  const numIntervals = Math.ceil(episodeDurationSec / intervalSizeSec);

  for (const speaker of speakers) {
    const speakerSegments = segments.filter(s => s.speaker === speaker);
    
    for (let intervalIdx = 0; intervalIdx < numIntervals; intervalIdx++) {
      const intervalStartSec = intervalIdx * intervalSizeSec;
      const intervalEndSec = Math.min((intervalIdx + 1) * intervalSizeSec, episodeDurationSec);
      
      // Get segments that start in this interval
      const intervalSegments = speakerSegments.filter(
        s => s.startSec >= intervalStartSec && s.startSec < intervalEndSec
      );

      // Only include intervals with segments
      if (intervalSegments.length === 0) continue;

      // For temporal intervals, we don't have full context for monologue detection
      // So we'll calculate monologues within the interval only
      const intervalStats = calculateStatsForSegments(intervalSegments);
      
      // Calculate speaking share for this interval
      const allSegmentsInInterval = segments.filter(
        s => s.startSec >= intervalStartSec && s.startSec < intervalEndSec
      );
      const totalIntervalSpeakingTime = allSegmentsInInterval.reduce(
        (sum, s) => sum + s.durationSec, 0
      );
      const intervalSpeakingShare = totalIntervalSpeakingTime > 0
        ? intervalStats.totalSpeakingTimeSec / totalIntervalSpeakingTime
        : 0;

      speakerStats[speaker].temporal.push({
        intervalStartSec,
        intervalEndSec,
        ...intervalStats,
        speakingShare: intervalSpeakingShare,
      });
    }
  }

  const episode = (() => {
    const base = path.basename(inputPath);
    const n = extractEpisodeNumberFromFilename(base);
    return Number.isFinite(n) ? n : null;
  })();

  const out = {
    v: 1,
    ...(episode !== null ? { episode } : {}),
    episodeDurationSec,
    speakers,
    speakerStats,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const jsonOut = pretty ? JSON.stringify(out, null, 2) : JSON.stringify(out);
  await fs.writeFile(outputPath, jsonOut, 'utf8');
  
  return {
    segments: segments.length,
    speakers: speakers.length,
    durationSec: episodeDurationSec,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage:
  node scripts/generate-speaker-stats.js --in-dir <dir> --out-dir <dir> [--all | --episode <n>] [--pretty]

Example:
  node scripts/generate-speaker-stats.js [--podcast <id>] --in-dir <dir> --out-dir <dir> --all
  node scripts/generate-speaker-stats.js --podcast freakshow --all
`);
    process.exit(0);
  }

  // Default to podcast episodes directory if not provided
  const defaultEpisodesDir = path.join(args.projectRoot, 'podcasts', args.podcastId, 'episodes');
  const inDir = args.inDir ?? defaultEpisodesDir;
  const outDir = args.outDir ?? inDir;

  const entries = await fs.readdir(inDir, { withFileTypes: true });
  const tsFiles = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((n) => n.endsWith('-ts.json'));

  const wantedEpisode = args.episode ? parseInt(String(args.episode), 10) : null;

  const selected = tsFiles.filter((name) => {
    const ep = extractEpisodeNumberFromFilename(name);
    if (!Number.isFinite(ep)) return false;
    if (args.all) return true;
    if (wantedEpisode !== null) return ep === wantedEpisode;
    // default: generate all (safe, and matches typical usage)
    return true;
  });

  if (selected.length === 0) {
    console.error('No input files selected. Check --in-dir and --episode.');
    process.exit(2);
  }

  let ok = 0;
  let failed = 0;

  for (const name of selected) {
    const inputPath = path.join(inDir, name);
    const outName = name.replace(/-ts\.json$/, '-speaker-stats.json');
    const outputPath = path.join(outDir, outName);
    try {
      const stats = await generateOne(inputPath, outputPath, { pretty: args.pretty });
      ok++;
      const durationMin = Math.floor(stats.durationSec / 60);
      const durationSecRem = Math.floor(stats.durationSec % 60);
      console.log(`✅ ${name} -> ${outName} (${stats.segments} segments, ${stats.speakers} speakers, ${durationMin}:${String(durationSecRem).padStart(2, '0')})`);
    } catch (e) {
      failed++;
      console.error(`❌ ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (failed > 0) process.exit(1);
}

await main();

