<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ref, onMounted, onUnmounted } from 'vue';

const { locale, availableLocales } = useI18n();
const showDropdown = ref(false);

const languageNames: Record<string, string> = {
  de: 'Deutsch',
  en: 'English',
  fr: 'Français'
};

const languageFlags: Record<string, string> = {
  de: '🇩🇪',
  en: '🇬🇧',
  fr: '🇫🇷'
};

const changeLanguage = (lang: string) => {
  locale.value = lang;
  localStorage.setItem('locale', lang);
  showDropdown.value = false;
};

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  if (!target.closest('.language-selector')) {
    showDropdown.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div class="language-selector relative">
    <button
      @click="showDropdown = !showDropdown"
      class="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
      :title="languageNames[locale]"
    >
      <span class="text-2xl">{{ languageFlags[locale] }}</span>
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ languageNames[locale] }}</span>
      <svg 
        class="w-4 h-4 text-gray-600 dark:text-gray-400 transition-transform"
        :class="{ 'rotate-180': showDropdown }"
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Dropdown -->
    <div
      v-if="showDropdown"
      class="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-50"
    >
      <button
        v-for="lang in availableLocales"
        :key="lang"
        @click="changeLanguage(lang)"
        class="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        :class="{
          'bg-blue-50 dark:bg-blue-900/20': locale === lang
        }"
      >
        <span class="text-2xl">{{ languageFlags[lang] }}</span>
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ languageNames[lang] }}</span>
        <svg
          v-if="locale === lang"
          class="w-5 h-5 ml-auto text-blue-600 dark:text-blue-400"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.language-selector {
  position: relative;
}
</style>

