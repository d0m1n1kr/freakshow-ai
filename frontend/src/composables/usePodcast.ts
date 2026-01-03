// Composable for podcast-specific paths and data
import { computed } from 'vue';
import { useSettingsStore, type Podcast } from '@/stores/settings';

// Re-export Podcast type for convenience
export type { Podcast };

/**
 * Get the base path for a podcast's data files
 */
export function usePodcastPath() {
  const settings = useSettingsStore();
  
  const podcastPath = computed(() => {
    const podcastId = settings.selectedPodcast || 'freakshow';
    return `/podcasts/${podcastId}`;
  });
  
  const podcastId = computed(() => settings.selectedPodcast || 'freakshow');
  
  return {
    podcastPath,
    podcastId
  };
}

/**
 * Load podcast-specific data file
 */
export async function loadPodcastData<T>(filename: string): Promise<T> {
  const { podcastPath } = usePodcastPath();
  const url = `${podcastPath.value}/${filename}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load ${url}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error loading podcast data from ${url}:`, error);
    throw error;
  }
}

/**
 * Get URL for a podcast-specific file
 */
export function getPodcastFileUrl(filename: string, podcastId?: string): string {
  const settings = useSettingsStore();
  const pid = podcastId || settings.selectedPodcast || 'freakshow';
  return `/podcasts/${pid}/${filename}`;
}

/**
 * Get URL for episode JSON file
 */
export function getEpisodeUrl(episodeNumber: number, podcastId?: string): string {
  return getPodcastFileUrl(`episodes/${episodeNumber}.json`, podcastId);
}

/**
 * Get URL for speaker meta JSON file
 */
export function getSpeakerMetaUrl(slug: string, podcastId?: string): string {
  return getPodcastFileUrl(`speakers/${slug}-meta.json`, podcastId);
}

/**
 * Get base URL for speakers directory
 */
export function getSpeakersBaseUrl(podcastId?: string): string {
  const settings = useSettingsStore();
  const pid = podcastId || settings.selectedPodcast || 'freakshow';
  return `/podcasts/${pid}/speakers`;
}

/**
 * Get URL for episode image file
 * Returns URL for jpg format (most common). 
 * Note: Images are saved with various extensions (jpg, png, jpeg, webp) by scrape-images.js.
 * Components should handle missing images gracefully with @error handlers.
 * 
 * To get episode images, run: node scripts/scrape-images.js --podcast <podcastId>
 */
export function getEpisodeImageUrl(episodeNumber: number, podcastId?: string): string {
  const settings = useSettingsStore();
  const pid = podcastId || settings.selectedPodcast || 'freakshow';
  // Try jpg first (most common format)
  // If the image doesn't exist or has a different extension, the @error handler will hide it
  return `/podcasts/${pid}/episodes/${episodeNumber}.jpg`;
}

