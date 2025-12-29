<template>
  <div class="max-w-4xl mx-auto my-12 p-8 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl shadow-xl border-2 border-blue-200 dark:border-blue-900">
    <div class="text-center mb-6">
      <div class="inline-flex items-center justify-center w-20 h-20 bg-blue-100 dark:bg-blue-900 rounded-full mb-4">
        <svg class="w-10 h-10 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        {{ $t('noVariants.title') }}
      </h2>
      <p class="text-gray-600 dark:text-gray-400">
        {{ $t('noVariants.subtitle') }}
      </p>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 mb-6 border border-gray-200 dark:border-gray-700">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <span class="text-2xl">🚀</span>
        {{ $t('noVariants.quickStart') }}
      </h3>
      
      <div class="space-y-4">
        <div class="flex gap-4">
          <div class="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
            1
          </div>
          <div class="flex-1">
            <p class="font-medium text-gray-900 dark:text-white mb-1">
              {{ $t('noVariants.step1.title') }}
            </p>
            <code class="block bg-gray-100 dark:bg-gray-900 px-3 py-2 rounded text-sm font-mono text-gray-800 dark:text-gray-200">
              ./build-variant.sh v1 default-v1
            </code>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {{ $t('noVariants.step1.description') }}
            </p>
          </div>
        </div>

        <div class="flex gap-4">
          <div class="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
            2
          </div>
          <div class="flex-1">
            <p class="font-medium text-gray-900 dark:text-white mb-1">
              {{ $t('noVariants.step2.title') }}
            </p>
            <code class="block bg-gray-100 dark:bg-gray-900 px-3 py-2 rounded text-sm font-mono text-gray-800 dark:text-gray-200">
              ./build-variant.sh v2 auto-v2.1
            </code>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {{ $t('noVariants.step2.description') }}
            </p>
          </div>
        </div>

        <div class="flex gap-4">
          <div class="flex-shrink-0 w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center font-bold">
            3
          </div>
          <div class="flex-1">
            <p class="font-medium text-gray-900 dark:text-white mb-1">
              {{ $t('noVariants.step3.title') }}
            </p>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ $t('noVariants.step3.description') }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
      <div class="flex gap-3">
        <div class="flex-shrink-0">
          <svg class="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
          </svg>
        </div>
        <div class="flex-1">
          <h4 class="font-semibold text-yellow-800 dark:text-yellow-300 mb-1">
            {{ $t('noVariants.note.title') }}
          </h4>
          <p class="text-sm text-yellow-700 dark:text-yellow-400">
            {{ $t('noVariants.note.description') }}
          </p>
        </div>
      </div>
    </div>

    <div class="mt-6 text-center">
      <a 
        href="https://github.com/yourusername/freakshow#variants" 
        target="_blank"
        class="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {{ $t('noVariants.documentation') }}
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
// No props or logic needed - just a static information component
</script>

<style scoped>
code {
  user-select: all;
}
</style>

