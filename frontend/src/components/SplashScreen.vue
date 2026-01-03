<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-blue-50 to-teal-50 dark:from-gray-900 dark:to-gray-800"
  >
    <div class="text-center">
      <!-- Logo -->
      <div class="mb-8">
        <img
          :src="logoUrl"
          alt="Freakshow AI Logo"
          class="w-24 h-24 sm:w-32 sm:h-32 mx-auto rounded-xl shadow-lg"
        />
      </div>

      <!-- Project Name -->
      <h1 class="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-4">
        {{ displayName }}
      </h1>

      <!-- Version -->
      <div class="text-lg sm:text-xl text-gray-600 dark:text-gray-400 mb-8">
        {{ t('splash.version') }} {{ displayVersion }}
      </div>

      <!-- Loading indicator -->
      <div class="flex justify-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>

      <!-- Optional subtitle -->
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-4">
        {{ t('splash.loading') }}
      </p>
    </div>

    <!-- Click to dismiss (optional) -->
    <button
      @click="dismiss"
      class="absolute bottom-8 right-8 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
      :title="t('splash.skip')"
    >
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

// Props
interface Props {
  logoUrl?: string;
  projectName?: string;
  version?: string;
  autoHideDelay?: number; // in milliseconds
}

const props = withDefaults(defineProps<Props>(), {
  logoUrl: '/logo.svg',
  projectName: 'PodInsights',
  version: '1.0.0',
  autoHideDelay: 500, // 500ms
});

// Emits
const emit = defineEmits<{
  dismissed: [];
}>();

// State
const show = ref(true);
const displayVersion = ref(props.version);
const displayName = ref(props.projectName);

// Load version from version.json if not provided or if we want to override
onMounted(async () => {
  // Load version information from version.json
  try {
    const response = await fetch('/version.json');
    if (response.ok) {
      const versionData = await response.json();
      displayVersion.value = versionData.version || props.version;
      displayName.value = versionData.name || props.projectName;
    }
  } catch (error) {
    console.warn('Could not load version information:', error);
    // Keep default values
  }

  // Auto-hide after delay
  if (props.autoHideDelay > 0) {
    setTimeout(() => {
      if (show.value) {
        dismiss();
      }
    }, props.autoHideDelay);
  }
});

// Methods
const dismiss = () => {
  show.value = false;
  emit('dismissed');
};
</script>
