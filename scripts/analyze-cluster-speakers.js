#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Navigate from scripts/ to project root
const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * Analyze cluster speakers from topic-taxonomy.json
 * 
 * This script:
 * 1. Reads all clusters from topic-taxonomy.json
 * 2. For each cluster, analyzes which speakers appear in the assigned episodes
 * 3. Calculates speaker relevance based on frequency and coverage
 * 4. Outputs a new JSON file (cluster-speakers.json) with:
 *    - Cluster ID
 *    - Cluster name and description
 *    - List of speakers with:
 *      * name: Speaker name
 *      * frequency: Number of episodes the speaker appeared in
 *      * coverage: Percentage of cluster episodes the speaker appeared in
 *      * relevance: Weighted score (0-100) combining coverage and frequency
 * 
 * Relevance calculation:
 * - 50% based on coverage (how consistently the speaker appears in cluster episodes)
 * - 50% based on market share (speaker's % of total speaker appearances in cluster)
 *   This gives a different perspective: coverage measures presence, market share measures
 *   relative contribution compared to all speakers combined.
 * 
 * Usage: node scripts/analyze-cluster-speakers.js
 * Output: cluster-speakers.json
 */

async function loadJSON(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

async function loadEpisode(episodeNumber) {
  const filePath = path.join(PROJECT_ROOT, 'episodes', `${episodeNumber}.json`);
  try {
    return await loadJSON(filePath);
  } catch (err) {
    console.warn(`Warning: Could not load episode ${episodeNumber}: ${err.message}`);
    return null;
  }
}

function calculateSpeakerRelevance(speakerCounts, totalEpisodes) {
  // Calculate relevance scores for speakers
  const speakers = [];
  
  // Find max frequency and total appearances for normalization
  const maxFrequency = Math.max(...Object.values(speakerCounts));
  const totalAppearances = Object.values(speakerCounts).reduce((sum, count) => sum + count, 0);
  
  for (const [name, count] of Object.entries(speakerCounts)) {
    const frequency = count;
    const coverage = count / totalEpisodes; // 0-1 (what % of episodes speaker appears in)
    
    // Market share: what % of total speaker appearances belong to this speaker
    const marketShare = totalAppearances > 0 ? count / totalAppearances : 0;
    
    // Combined relevance score (0-100)
    // 50% coverage (consistency/presence in cluster episodes)
    // 50% market share (relative importance compared to all speakers combined)
    const relevance = (coverage * 0.5 + marketShare * 0.5) * 100;
    
    speakers.push({
      name,
      frequency,
      coverage: Math.round(coverage * 1000) / 10, // percentage with 1 decimal
      relevance: Math.round(relevance * 10) / 10  // rounded to 1 decimal
    });
  }
  
  // Sort by relevance (descending)
  speakers.sort((a, b) => b.relevance - a.relevance);
  
  return speakers;
}

async function analyzeClusterSpeakers() {
  console.log('Loading topic taxonomy...');
  const taxonomy = await loadJSON(path.join(PROJECT_ROOT, 'topic-taxonomy.json'));
  
  if (!taxonomy.clusters || !Array.isArray(taxonomy.clusters)) {
    throw new Error('Invalid topic-taxonomy.json format: missing clusters array');
  }
  
  console.log(`Found ${taxonomy.clusters.length} clusters`);
  
  const result = {
    createdAt: new Date().toISOString(),
    sourceFile: 'topic-taxonomy.json',
    sourceCreatedAt: taxonomy.createdAt,
    totalClusters: taxonomy.clusters.length,
    clusters: []
  };
  
  // Process each cluster
  for (let i = 0; i < taxonomy.clusters.length; i++) {
    const cluster = taxonomy.clusters[i];
    console.log(`Processing cluster ${i + 1}/${taxonomy.clusters.length}: ${cluster.id} (${cluster.episodeCount} episodes)`);
    
    if (!cluster.episodes || cluster.episodes.length === 0) {
      console.log(`  Skipping cluster ${cluster.id}: no episodes`);
      result.clusters.push({
        id: cluster.id,
        name: cluster.name,
        episodeCount: 0,
        speakers: []
      });
      continue;
    }
    
    // Count speaker occurrences across all episodes in this cluster
    const speakerCounts = {};
    let episodesProcessed = 0;
    
    for (const episodeNumber of cluster.episodes) {
      const episode = await loadEpisode(episodeNumber);
      
      if (!episode || !episode.speakers) {
        continue;
      }
      
      episodesProcessed++;
      
      // Count each speaker
      for (const speaker of episode.speakers) {
        if (!speakerCounts[speaker]) {
          speakerCounts[speaker] = 0;
        }
        speakerCounts[speaker]++;
      }
    }
    
    // Calculate relevance scores
    const speakers = calculateSpeakerRelevance(speakerCounts, episodesProcessed);
    
    console.log(`  Processed ${episodesProcessed}/${cluster.episodes.length} episodes`);
    console.log(`  Found ${speakers.length} unique speakers`);
    if (speakers.length > 0) {
      console.log(`  Top speaker: ${speakers[0].name} (${speakers[0].relevance}% relevance)`);
    }
    
    result.clusters.push({
      id: cluster.id,
      name: cluster.name,
      description: cluster.description,
      episodeCount: episodesProcessed,
      speakers: speakers
    });
  }
  
  return result;
}

async function main() {
  try {
    console.log('Starting cluster speaker analysis...\n');
    
    const result = await analyzeClusterSpeakers();
    
    const outputFile = path.join(PROJECT_ROOT, 'frontend', 'public', 'cluster-speakers.json');
    await fs.writeFile(outputFile, JSON.stringify(result, null, 2), 'utf-8');
    
    console.log(`\n✓ Analysis complete!`);
    console.log(`Output written to: ${outputFile}`);
    console.log(`\nSummary:`);
    console.log(`  Total clusters: ${result.totalClusters}`);
    
    // Calculate some statistics
    const totalSpeakers = new Set();
    let clustersWithSpeakers = 0;
    
    for (const cluster of result.clusters) {
      if (cluster.speakers.length > 0) {
        clustersWithSpeakers++;
        cluster.speakers.forEach(s => totalSpeakers.add(s.name));
      }
    }
    
    console.log(`  Clusters with speakers: ${clustersWithSpeakers}`);
    console.log(`  Unique speakers across all clusters: ${totalSpeakers.size}`);
    
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();

