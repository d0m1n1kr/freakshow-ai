<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
    <div class="p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20">
      <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">{{ t('about.title') }}</h2>
      <p class="text-gray-600 dark:text-gray-400">{{ t('about.subtitle') }}</p>
    </div>

    <div class="p-8 space-y-8">
      <!-- Project Description -->
      <section>
        <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">📊 {{ t('about.projectDescription.title') }}</h3>
        <p class="text-gray-700 dark:text-gray-300 leading-relaxed">
          {{ t('about.projectDescription.content') }}
        </p>
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
        </div>
      </section>

      <!-- Open Source -->
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

