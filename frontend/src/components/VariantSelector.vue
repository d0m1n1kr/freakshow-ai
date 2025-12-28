<template>
  <div class="variant-selector">
    <label for="variant-dropdown" class="label">
      {{ $t('variantSelector.label') }}
    </label>
    <select 
      id="variant-dropdown"
      v-model="selectedVariant" 
      class="select"
      @change="onVariantChange"
    >
      <option 
        v-for="(info, key) in availableVariants" 
        :key="key" 
        :value="key"
      >
        {{ info.name }}
      </option>
    </select>
    <div v-if="isLoading" class="loading">
      {{ $t('variantSelector.loading') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { loadVariantsManifest, type VariantManifest } from '@/composables/useVariants';
import { useRouter } from 'vue-router';

const settings = useSettingsStore();
const router = useRouter();

const manifest = ref<VariantManifest | null>(null);
const isLoading = ref(false);
const selectedVariant = ref(settings.clusteringVariant || 'default-v1');

const availableVariants = computed(() => {
  if (!manifest.value) {
    return {
      'default-v1': {
        name: 'Standard (V1)',
        version: 'v1',
        lastBuilt: ''
      }
    };
  }
  return manifest.value.variants;
});

onMounted(async () => {
  try {
    manifest.value = await loadVariantsManifest();
    
    // If current variant doesn't exist, fall back to default
    if (!manifest.value.variants[selectedVariant.value]) {
      selectedVariant.value = manifest.value.defaultVariant;
      settings.setClusteringVariant(selectedVariant.value);
    }
  } catch (error) {
    console.error('Failed to load variants:', error);
  }
});

async function onVariantChange() {
  isLoading.value = true;
  settings.setClusteringVariant(selectedVariant.value);
  
  // Reload current view to fetch new data
  try {
    const currentRoute = router.currentRoute.value;
    await router.push({ path: '/' }); // Go to home briefly
    await router.push(currentRoute); // Return to current view
  } catch (error) {
    console.error('Failed to reload view:', error);
  } finally {
    isLoading.value = false;
  }
}
</script>

<style scoped>
.variant-selector {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
}

.dark .label {
  color: #d1d5db;
}

.select {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background-color: white;
  color: #111827;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 200px;
}

.select:hover {
  border-color: #9ca3af;
}

.select:focus {
  outline: none;
  border-color: #3b82f6;
  ring: 2px;
  ring-color: #3b82f6;
  ring-opacity: 0.5;
}

.dark .select {
  background-color: #1f2937;
  color: #f3f4f6;
  border-color: #4b5563;
}

.dark .select:hover {
  border-color: #6b7280;
}

.loading {
  font-size: 0.75rem;
  color: #6b7280;
  font-style: italic;
}

.dark .loading {
  color: #9ca3af;
}
</style>

