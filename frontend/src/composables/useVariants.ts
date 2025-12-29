// Composable for loading variant-specific data
import { computed } from 'vue';
import { useSettingsStore } from '@/stores/settings';

export interface VariantSettings {
  // V1 settings
  clusters?: number;
  linkageMethod?: string;
  // V2 settings
  minClusterSize?: number;
  minSamples?: number;
  reducedDimensions?: number;
  defaultTopicDurationSec?: number;
  // Common settings
  outlierThreshold?: number;
  useRelevanceWeighting?: boolean;
  useLLMNaming?: boolean;
}

export interface VariantInfo {
  name: string;
  version: string;
  lastBuilt: string;
  description?: string;
  settings?: VariantSettings;
}

export interface VariantManifest {
  variants: Record<string, VariantInfo>;
  defaultVariant: string;
  lastUpdated: string;
}

/**
 * Get the base path for a variant's data files
 */
export function useVariantPath() {
  const settings = useSettingsStore();
  
  const variantPath = computed(() => {
    const variant = settings.clusteringVariant || 'auto-v2.1';
    return `/topics/${variant}`;
  });
  
  const variantName = computed(() => settings.clusteringVariant || 'auto-v2.1');
  
  return {
    variantPath,
    variantName
  };
}

/**
 * Load variant-specific data file
 */
export async function loadVariantData<T>(filename: string): Promise<T> {
  const { variantPath } = useVariantPath();
  const url = `${variantPath.value}/${filename}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load ${url}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error loading variant data from ${url}:`, error);
    throw error;
  }
}

/**
 * Check if any variants are available
 */
export async function hasVariants(): Promise<boolean> {
  try {
    const manifest = await loadVariantsManifest();
    return Object.keys(manifest.variants).length > 0;
  } catch {
    return false;
  }
}

/**
 * Load available variants from manifest
 */
export async function loadVariantsManifest(): Promise<VariantManifest> {
  try {
    const response = await fetch('/topics/manifest.json');
    if (!response.ok) {
      console.warn('No variants manifest found, using default');
      return {
        variants: {
          'auto-v2.1': {
            name: 'Automatisch (V2.1)',
            version: 'v2',
            lastBuilt: ''
          }
        },
        defaultVariant: 'auto-v2.1',
        lastUpdated: ''
      };
    }
    return await response.json();
  } catch (error) {
    console.error('Error loading variants manifest:', error);
    return {
      variants: {
        'auto-v2.1': {
          name: 'Automatisch (V2.1)',
          version: 'v2',
          lastBuilt: ''
        }
      },
      defaultVariant: 'auto-v2.1',
      lastUpdated: ''
    };
  }
}

/**
 * Get URL for a variant-specific file
 */
export function getVariantFileUrl(filename: string, variant?: string): string {
  const settings = useSettingsStore();
  const v = variant || settings.clusteringVariant || 'auto-v2.1';
  return `/topics/${v}/${filename}`;
}

