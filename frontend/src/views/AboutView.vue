<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Podcast } from '@/stores/settings';

const { t } = useI18n();

const podcasts = ref<Podcast[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const response = await fetch('/podcasts.json');
    if (response.ok) {
      const data = await response.json();
      podcasts.value = data.podcasts || [];
    }
  } catch (error) {
    console.error('Failed to load podcasts:', error);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
    <div class="p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-teal-50 dark:from-blue-900/20 dark:to-teal-900/20">
      <div class="flex items-center gap-4 mb-4">
        <img
          src="/logo.svg?v=2"
          alt="PodInsights Logo"
          class="w-16 h-16 flex-shrink-0"
        />
        <div>
          <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">{{ t('about.title') }}</h2>
          <p class="text-gray-600 dark:text-gray-400">{{ t('about.subtitle') }}</p>
        </div>
      </div>
    </div>

    <div class="p-8 space-y-8">
      <!-- Project Description -->
      <section>
        <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">📊 {{ t('about.projectDescription.title') }}</h3>
        <p class="text-gray-700 dark:text-gray-300 leading-relaxed">
          {{ t('about.projectDescription.content') }}
        </p>
      </section>

      <!-- Supported Podcasts -->
      <section>
        <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">🎙️ {{ t('about.supportedPodcasts.title') }}</h3>
        <div v-if="loading" class="text-center py-4">
          <p class="text-gray-500 dark:text-gray-400">{{ t('about.supportedPodcasts.loading') }}</p>
        </div>
        <div v-else-if="podcasts.length > 0" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a
            v-for="podcast in podcasts"
            :key="podcast.id"
            :href="podcast.homeUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-700 hover:border-blue-400 dark:hover:border-blue-500 transition-colors group"
          >
            <div class="flex items-center gap-4">
              <img
                v-if="podcast.logoUrl"
                :src="podcast.logoUrl"
                :alt="podcast.name"
                class="w-16 h-16 rounded-lg object-cover flex-shrink-0 ring-2 ring-blue-200 dark:ring-blue-700 group-hover:ring-blue-400 dark:group-hover:ring-blue-500 transition-all"
                loading="lazy"
                referrerpolicy="no-referrer"
              />
              <div class="flex-1 min-w-0">
                <h4 class="font-semibold text-blue-900 dark:text-blue-100 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors">
                  {{ podcast.name }}
                </h4>
                <p class="text-xs text-blue-700 dark:text-blue-300 mt-1 truncate">
                  {{ podcast.homeUrl }}
                </p>
              </div>
              <svg
                class="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </div>
          </a>
        </div>
        <p v-else class="text-gray-500 dark:text-gray-400 text-sm">{{ t('about.supportedPodcasts.none') }}</p>
      </section>

      <!-- Multi-Podcast Support -->
      <section>
        <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">🔧 {{ t('about.multiPodcast.title') }}</h3>
        <div class="p-5 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-lg border border-emerald-200 dark:border-emerald-700">
          <p class="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
            {{ t('about.multiPodcast.description') }}
          </p>
          <ul class="text-sm text-gray-700 dark:text-gray-300 list-disc list-inside space-y-2 mb-4">
            <li>{{ t('about.multiPodcast.features.selection') }}</li>
            <li>{{ t('about.multiPodcast.features.organization') }}</li>
            <li>{{ t('about.multiPodcast.features.configuration') }}</li>
            <li>{{ t('about.multiPodcast.features.metadata') }}</li>
          </ul>
          <div class="mt-4 p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded border border-emerald-200 dark:border-emerald-700">
            <p class="text-xs text-emerald-900 dark:text-emerald-100 font-semibold mb-1">{{ t('about.multiPodcast.note.title') }}</p>
            <p class="text-xs text-emerald-800 dark:text-emerald-200">{{ t('about.multiPodcast.note.content') }}</p>
          </div>
        </div>
      </section>

      <!-- Frontend Technologies -->
      <section>
        <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">🎨 {{ t('about.frontend.title') }}</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-700">
            <h4 class="font-semibold text-green-900 dark:text-green-100 mb-2">Vue.js 3.5</h4>
            <p class="text-sm text-gray-700 dark:text-gray-300">{{ t('about.frontend.vue') }}</p>
          </div>
          
          <div class="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
            <h4 class="font-semibold text-blue-900 dark:text-blue-100 mb-2">TypeScript 5.9</h4>
            <p class="text-sm text-gray-700 dark:text-gray-300">{{ t('about.frontend.typescript') }}</p>
          </div>
          
          <div class="p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
            <h4 class="font-semibold text-purple-900 dark:text-purple-100 mb-2">D3.js 7.9</h4>
            <p class="text-sm text-gray-700 dark:text-gray-300">{{ t('about.frontend.d3') }}</p>
          </div>
          
          <div class="p-4 bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-900/20 dark:to-blue-900/20 rounded-lg border border-sky-200 dark:border-sky-700">
            <h4 class="font-semibold text-sky-900 dark:text-sky-100 mb-2">Tailwind CSS 4.1</h4>
            <p class="text-sm text-gray-700 dark:text-gray-300">{{ t('about.frontend.tailwind') }}</p>
          </div>
          
          <div class="p-4 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
            <h4 class="font-semibold text-amber-900 dark:text-amber-100 mb-2">Pinia 3.0</h4>
            <p class="text-sm text-gray-700 dark:text-gray-300">{{ t('about.frontend.pinia') }}</p>
          </div>
          
          <div class="p-4 bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20 rounded-lg border border-indigo-200 dark:border-indigo-700">
            <h4 class="font-semibold text-indigo-900 dark:text-indigo-100 mb-2">Vue Router 4.6</h4>
            <p class="text-sm text-gray-700 dark:text-gray-300">{{ t('about.frontend.router') }}</p>
          </div>
          
          <div class="p-4 bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-lg border border-orange-200 dark:border-orange-700">
            <h4 class="font-semibold text-orange-900 dark:text-orange-100 mb-2">Vite 7.2</h4>
            <p class="text-sm text-gray-700 dark:text-gray-300">{{ t('about.frontend.vite') }}</p>
          </div>
        </div>
      </section>

      <!-- Backend Technologies -->
      <section>
        <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">⚙️ {{ t('about.backend.title') }}</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="p-4 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-lg border border-orange-200 dark:border-orange-700">
            <h4 class="font-semibold text-orange-900 dark:text-orange-100 mb-2">Rust 2021 Edition</h4>
            <p class="text-sm text-gray-700 dark:text-gray-300">{{ t('about.backend.rust') }}</p>
          </div>
          
          <div class="p-4 bg-gradient-to-r from-green-50 to-lime-50 dark:from-green-900/20 dark:to-lime-900/20 rounded-lg border border-green-200 dark:border-green-700">
            <h4 class="font-semibold text-green-900 dark:text-green-100 mb-2">Node.js</h4>
            <p class="text-sm text-gray-700 dark:text-gray-300">{{ t('about.backend.node') }}</p>
          </div>
          
          <div class="p-4 bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 rounded-lg border border-red-200 dark:border-red-700">
            <h4 class="font-semibold text-red-900 dark:text-red-100 mb-2">Rayon</h4>
            <p class="text-sm text-gray-700 dark:text-gray-300">{{ t('about.backend.rayon') }}</p>
          </div>
          
          <div class="p-4 bg-gradient-to-r from-cyan-50 to-teal-50 dark:from-cyan-900/20 dark:to-teal-900/20 rounded-lg border border-cyan-200 dark:border-cyan-700">
            <h4 class="font-semibold text-cyan-900 dark:text-cyan-100 mb-2">Serde JSON</h4>
            <p class="text-sm text-gray-700 dark:text-gray-300">{{ t('about.backend.serde') }}</p>
          </div>
        </div>
      </section>

      <!-- AI & Machine Learning -->
      <section>
        <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">🤖 {{ t('about.ai.title') }}</h3>
        <div class="space-y-4">
          <div class="p-5 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-lg border border-violet-200 dark:border-violet-700">
            <h4 class="font-semibold text-violet-900 dark:text-violet-100 mb-2 flex items-center gap-2">
              <span>{{ t('about.ai.embedding.title') }}</span>
              <span class="text-xs bg-violet-200 dark:bg-violet-800 text-violet-800 dark:text-violet-200 px-2 py-0.5 rounded-full">{{ t('about.ai.embedding.badge') }}</span>
            </h4>
            <p class="text-sm text-gray-700 dark:text-gray-300 mb-2">
              {{ t('about.ai.embedding.description') }}
            </p>
            <ul class="text-xs text-gray-600 dark:text-gray-400 list-disc list-inside space-y-1">
              <li>{{ t('about.ai.embedding.features.dimensions') }}</li>
              <li>{{ t('about.ai.embedding.features.similarity') }}</li>
              <li>{{ t('about.ai.embedding.features.multilingual') }}</li>
            </ul>
          </div>
          
          <div class="p-5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
            <h4 class="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
              <span>{{ t('about.ai.clustering.title') }}</span>
              <span class="text-xs bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full">{{ t('about.ai.clustering.badge') }}</span>
            </h4>
            <p class="text-sm text-gray-700 dark:text-gray-300 mb-2">
              {{ t('about.ai.clustering.description') }}
            </p>
            <ul class="text-xs text-gray-600 dark:text-gray-400 list-disc list-inside space-y-1">
              <li>{{ t('about.ai.clustering.features.agglomerative') }}</li>
              <li>{{ t('about.ai.clustering.features.threshold') }}</li>
              <li>{{ t('about.ai.clustering.features.naming') }}</li>
            </ul>
          </div>

          <div class="p-5 bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20 rounded-lg border border-teal-200 dark:border-teal-700">
            <h4 class="font-semibold text-teal-900 dark:text-teal-100 mb-2 flex items-center gap-2">
              <span>{{ t('about.ai.rag.title') }}</span>
              <span class="text-xs bg-teal-200 dark:bg-teal-800 text-teal-800 dark:text-teal-200 px-2 py-0.5 rounded-full">{{ t('about.ai.rag.badge') }}</span>
            </h4>
            <p class="text-sm text-gray-700 dark:text-gray-300 mb-2">
              {{ t('about.ai.rag.description') }}
            </p>
            <ul class="text-xs text-gray-600 dark:text-gray-400 list-disc list-inside space-y-1">
              <li>{{ t('about.ai.rag.features.retrieval') }}</li>
              <li>{{ t('about.ai.rag.features.citations') }}</li>
              <li>{{ t('about.ai.rag.features.playback') }}</li>
              <li>{{ t('about.ai.rag.features.auth') }}</li>
              <li>{{ t('about.ai.rag.features.personas') }}</li>
              <li>{{ t('about.ai.rag.features.discussion') }}</li>
              <li>{{ t('about.ai.rag.features.markdown') }}</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Development Tools -->
      <section>
        <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">🛠️ {{ t('about.tools.title') }}</h3>
        <div class="space-y-4">
          <div class="p-5 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 rounded-lg border border-indigo-200 dark:border-indigo-700">
            <h4 class="font-semibold text-indigo-900 dark:text-indigo-100 mb-2 flex items-center gap-2">
              <span>{{ t('about.tools.cursor.title') }}</span>
              <span class="text-xs bg-indigo-200 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200 px-2 py-0.5 rounded-full">{{ t('about.tools.cursor.badge') }}</span>
            </h4>
            <p class="text-sm text-gray-700 dark:text-gray-300 mb-2">
              {{ t('about.tools.cursor.description') }}
            </p>
            <ul class="text-xs text-gray-600 dark:text-gray-400 list-disc list-inside space-y-1">
              <li>{{ t('about.tools.cursor.features.sonnet') }}</li>
              <li>{{ t('about.tools.cursor.features.opus') }}</li>
              <li>{{ t('about.tools.cursor.features.gpt52') }}</li>
              <li>{{ t('about.tools.cursor.features.pair') }}</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Data Processing Pipeline -->
      <section>
        <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">🔄 {{ t('about.pipeline.title') }}</h3>
        <div class="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <ol class="space-y-4">
            <li class="flex gap-4">
              <span class="flex-shrink-0 w-8 h-8 bg-blue-500 dark:bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</span>
              <div>
                <h5 class="font-semibold text-gray-900 dark:text-gray-100">{{ t('about.pipeline.steps.extraction.title') }}</h5>
                <p class="text-sm text-gray-600 dark:text-gray-400">{{ t('about.pipeline.steps.extraction.description') }}</p>
              </div>
            </li>
            <li class="flex gap-4">
              <span class="flex-shrink-0 w-8 h-8 bg-purple-500 dark:bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</span>
              <div>
                <h5 class="font-semibold text-gray-900 dark:text-gray-100">{{ t('about.pipeline.steps.embedding.title') }}</h5>
                <p class="text-sm text-gray-600 dark:text-gray-400">{{ t('about.pipeline.steps.embedding.description') }}</p>
              </div>
            </li>
            <li class="flex gap-4">
              <span class="flex-shrink-0 w-8 h-8 bg-green-500 dark:bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</span>
              <div>
                <h5 class="font-semibold text-gray-900 dark:text-gray-100">{{ t('about.pipeline.steps.clustering.title') }}</h5>
                <p class="text-sm text-gray-600 dark:text-gray-400">{{ t('about.pipeline.steps.clustering.description') }}</p>
              </div>
            </li>
            <li class="flex gap-4">
              <span class="flex-shrink-0 w-8 h-8 bg-orange-500 dark:bg-orange-600 text-white rounded-full flex items-center justify-center font-bold text-sm">4</span>
              <div>
                <h5 class="font-semibold text-gray-900 dark:text-gray-100">{{ t('about.pipeline.steps.categorization.title') }}</h5>
                <p class="text-sm text-gray-600 dark:text-gray-400">{{ t('about.pipeline.steps.categorization.description') }}</p>
              </div>
            </li>
            <li class="flex gap-4">
              <span class="flex-shrink-0 w-8 h-8 bg-cyan-500 dark:bg-cyan-600 text-white rounded-full flex items-center justify-center font-bold text-sm">5</span>
              <div>
                <h5 class="font-semibold text-gray-900 dark:text-gray-100">{{ t('about.pipeline.steps.aggregation.title') }}</h5>
                <p class="text-sm text-gray-600 dark:text-gray-400">{{ t('about.pipeline.steps.aggregation.description') }}</p>
              </div>
            </li>
            <li class="flex gap-4">
              <span class="flex-shrink-0 w-8 h-8 bg-pink-500 dark:bg-pink-600 text-white rounded-full flex items-center justify-center font-bold text-sm">6</span>
              <div>
                <h5 class="font-semibold text-gray-900 dark:text-gray-100">{{ t('about.pipeline.steps.visualization.title') }}</h5>
                <p class="text-sm text-gray-600 dark:text-gray-400">{{ t('about.pipeline.steps.visualization.description') }}</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <!-- Features -->
      <section>
        <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">✨ {{ t('about.features.title') }}</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <span class="text-2xl">🎯</span>
            <div>
              <h5 class="font-semibold text-gray-900 dark:text-gray-100 text-sm">{{ t('about.features.tooltips.title') }}</h5>
              <p class="text-xs text-gray-600 dark:text-gray-400">{{ t('about.features.tooltips.description') }}</p>
            </div>
          </div>
          <div class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <span class="text-2xl">🔍</span>
            <div>
              <h5 class="font-semibold text-gray-900 dark:text-gray-100 text-sm">{{ t('about.features.filter.title') }}</h5>
              <p class="text-xs text-gray-600 dark:text-gray-400">{{ t('about.features.filter.description') }}</p>
            </div>
          </div>
          <div class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <span class="text-2xl">📊</span>
            <div>
              <h5 class="font-semibold text-gray-900 dark:text-gray-100 text-sm">{{ t('about.features.normalized.title') }}</h5>
              <p class="text-xs text-gray-600 dark:text-gray-400">{{ t('about.features.normalized.description') }}</p>
            </div>
          </div>
          <div class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <span class="text-2xl">🔗</span>
            <div>
              <h5 class="font-semibold text-gray-900 dark:text-gray-100 text-sm">{{ t('about.features.deeplink.title') }}</h5>
              <p class="text-xs text-gray-600 dark:text-gray-400">{{ t('about.features.deeplink.description') }}</p>
            </div>
          </div>
          <div class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <span class="text-2xl">📱</span>
            <div>
              <h5 class="font-semibold text-gray-900 dark:text-gray-100 text-sm">{{ t('about.features.responsive.title') }}</h5>
              <p class="text-xs text-gray-600 dark:text-gray-400">{{ t('about.features.responsive.description') }}</p>
            </div>
          </div>
          <div class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <span class="text-2xl">💾</span>
            <div>
              <h5 class="font-semibold text-gray-900 dark:text-gray-100 text-sm">{{ t('about.features.storage.title') }}</h5>
              <p class="text-xs text-gray-600 dark:text-gray-400">{{ t('about.features.storage.description') }}</p>
            </div>
          </div>
          <div class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <span class="text-2xl">🧩</span>
            <div>
              <h5 class="font-semibold text-gray-900 dark:text-gray-100 text-sm">{{ t('about.features.variants.title') }}</h5>
              <p class="text-xs text-gray-600 dark:text-gray-400">{{ t('about.features.variants.description') }}</p>
            </div>
          </div>
          <div class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <span class="text-2xl">🧠</span>
            <div>
              <h5 class="font-semibold text-gray-900 dark:text-gray-100 text-sm">{{ t('about.features.search.title') }}</h5>
              <p class="text-xs text-gray-600 dark:text-gray-400">{{ t('about.features.search.description') }}</p>
            </div>
          </div>
          <div class="flex items-start gap-3 p-3 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 rounded-lg border border-purple-200 dark:border-purple-700">
            <span class="text-2xl">🎭</span>
            <div>
              <h5 class="font-semibold text-gray-900 dark:text-gray-100 text-sm flex items-center gap-1.5">
                {{ t('about.features.personas.title') }}
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-bold uppercase">new</span>
              </h5>
              <p class="text-xs text-gray-600 dark:text-gray-400">{{ t('about.features.personas.description') }}</p>
            </div>
          </div>
          <div class="flex items-start gap-3 p-3 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 rounded-lg border border-blue-200 dark:border-blue-700">
            <span class="text-2xl">💬</span>
            <div>
              <h5 class="font-semibold text-gray-900 dark:text-gray-100 text-sm flex items-center gap-1.5">
                {{ t('about.features.discussion.title') }}
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold uppercase">new</span>
              </h5>
              <p class="text-xs text-gray-600 dark:text-gray-400">{{ t('about.features.discussion.description') }}</p>
            </div>
          </div>
          <div class="flex items-start gap-3 p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 rounded-lg border border-green-200 dark:border-green-700">
            <span class="text-2xl">📝</span>
            <div>
              <h5 class="font-semibold text-gray-900 dark:text-gray-100 text-sm flex items-center gap-1.5">
                {{ t('about.features.markdown.title') }}
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-bold uppercase">new</span>
              </h5>
              <p class="text-xs text-gray-600 dark:text-gray-400">{{ t('about.features.markdown.description') }}</p>
            </div>
          </div>
          <div class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <span class="text-2xl">🗺️</span>
            <div>
              <h5 class="font-semibold text-gray-900 dark:text-gray-100 text-sm">{{ t('about.features.umap.title') }}</h5>
              <p class="text-xs text-gray-600 dark:text-gray-400">{{ t('about.features.umap.description') }}</p>
            </div>
          </div>
          <div class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <span class="text-2xl">🔥</span>
            <div>
              <h5 class="font-semibold text-gray-900 dark:text-gray-100 text-sm">{{ t('about.features.heatmaps.title') }}</h5>
              <p class="text-xs text-gray-600 dark:text-gray-400">{{ t('about.features.heatmaps.description') }}</p>
            </div>
          </div>
          <div class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <span class="text-2xl">🌙</span>
            <div>
              <h5 class="font-semibold text-gray-900 dark:text-gray-100 text-sm">{{ t('about.features.darkMode.title') }}</h5>
              <p class="text-xs text-gray-600 dark:text-gray-400">{{ t('about.features.darkMode.description') }}</p>
            </div>
          </div>
          <div class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <span class="text-2xl">🌍</span>
            <div>
              <h5 class="font-semibold text-gray-900 dark:text-gray-100 text-sm">{{ t('about.features.multilingual.title') }}</h5>
              <p class="text-xs text-gray-600 dark:text-gray-400">{{ t('about.features.multilingual.description') }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Developers -->
      <section>
        <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">👨‍💻 {{ t('about.developers.title') }}</h3>
        <div class="p-5 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-lg border border-indigo-200 dark:border-indigo-700">
          <div class="flex items-start gap-4 mb-3">
            <img 
              src="/dominik-profile.png" 
              alt="Dominik Rössler" 
              class="w-20 h-20 rounded-full object-cover border-2 border-indigo-300 dark:border-indigo-600"
            />
            <div class="flex-1">
              <p class="text-sm text-gray-700 dark:text-gray-300 mb-3">
                {{ t('about.developers.items.dominik') }}
              </p>
            </div>
          </div>
          <div class="flex gap-3">
            <a
              href="https://mastodon.social/@d0m1n1k"
              target="_blank"
              rel="noopener noreferrer me"
              class="inline-flex items-center gap-2 px-3 py-2 bg-indigo-600 dark:bg-indigo-700 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors text-sm"
            >
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z"/>
              </svg>
              {{ t('about.developers.mastodon') }}
            </a>
            <a
              href="https://github.com/d0m1n1kr"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors text-sm"
            >
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd" />
              </svg>
              {{ t('about.developers.github') }}
            </a>
          </div>
        </div>
      </section>

      <!-- Open Source -->
      <section>
        <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">💻 {{ t('about.openSource.title') }}</h3>
        <div class="p-5 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/50 dark:to-slate-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <p class="text-sm text-gray-700 dark:text-gray-300 mb-3">
            {{ t('about.openSource.description') }}
          </p>
          <a
            href="https://github.com/d0m1n1kr/pod-insights"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors"
          >
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd" />
            </svg>
            {{ t('about.openSource.viewOnGithub') }}
          </a>
        </div>
      </section>

      <!-- Footer -->
      <section class="border-t border-gray-200 dark:border-gray-700 pt-6">
        <div class="text-center text-gray-600 dark:text-gray-400">
          <p class="text-sm">
            {{ t('about.footer.madeWith') }} <strong>{{ t('about.footer.podcast') }}</strong>
          </p>
          <p class="text-xs mt-2 text-gray-500 dark:text-gray-500">
            {{ t('about.footer.copyright') }}
          </p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Zusätzliche Styles falls nötig */
</style>

