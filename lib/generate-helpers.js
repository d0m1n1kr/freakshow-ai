// Shared helper functions for generate scripts
import fs from 'fs';
import path from 'path';

/**
 * Parse command line arguments for input/output paths
 * Returns: { input: string, output: string }
 */
export function parseArgs(defaultInput, defaultOutput) {
  const args = process.argv.slice(2);
  let input = defaultInput;
  let output = defaultOutput;
  
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--input' || args[i] === '-i') && i + 1 < args.length) {
      input = args[i + 1];
      i++;
    } else if ((args[i] === '--output' || args[i] === '-o') && i + 1 < args.length) {
      output = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: node <script> [OPTIONS]');
      console.log('');
      console.log('Options:');
      console.log(`  --input, -i PATH   Input file (default: ${defaultInput})`);
      console.log(`  --output, -o PATH  Output file (default: ${defaultOutput})`);
      console.log('  --help, -h         Show this help');
      process.exit(0);
    }
  }
  
  return { input, output };
}

/**
 * Ensure output directory exists
 */
export function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Save JSON file with pretty formatting
 */
export function saveJSON(filePath, data) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Load JSON file
 */
export function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

