<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const activeView = computed(() => {
  return route.name as 'topics' | 'categories' | 'speakers' | 'heatmap' | 'cluster-heatmap' | 'about';
});
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
    <header class="bg-white border-b border-gray-200 shadow-sm">
      <div class="container mx-auto px-4 py-6">
        <h1 class="text-4xl font-bold text-gray-900">
          Freak Show Visualisierung
        </h1>
        <p class="text-gray-600 mt-2">
          Visualisierung der Themen- und Sprecher-Entwicklung über die Jahre
        </p>
        
        <!-- Tab Navigation with Router Links -->
        <div class="mt-6 flex gap-2 border-b border-gray-200">
          <router-link
            to="/categories"
            :class="[
              'px-6 py-3 font-semibold border-b-2 transition-colors',
              activeView === 'categories' 
                ? 'border-purple-500 text-purple-600' 
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            ]"
          >
            Kategorien
          </router-link>
          <router-link
            to="/topics"
            :class="[
              'px-6 py-3 font-semibold border-b-2 transition-colors',
              activeView === 'topics' 
                ? 'border-blue-500 text-blue-600' 
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            ]"
          >
            Themen
          </router-link>
          <router-link
            to="/speakers"
            :class="[
              'px-6 py-3 font-semibold border-b-2 transition-colors',
              activeView === 'speakers' 
                ? 'border-green-500 text-green-600' 
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            ]"
          >
            Sprecher
          </router-link>
          <router-link
            to="/heatmap"
            :class="[
              'px-6 py-3 font-semibold border-b-2 transition-colors',
              activeView === 'heatmap' 
                ? 'border-pink-500 text-pink-600' 
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            ]"
          >
            Sprecher × Kategorien
          </router-link>
          <router-link
            to="/cluster-heatmap"
            :class="[
              'px-6 py-3 font-semibold border-b-2 transition-colors',
              activeView === 'cluster-heatmap' 
                ? 'border-orange-500 text-orange-600' 
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            ]"
          >
            Sprecher × Cluster
          </router-link>
          <router-link
            to="/about"
            :class="[
              'px-6 py-3 font-semibold border-b-2 transition-colors',
              activeView === 'about' 
                ? 'border-indigo-500 text-indigo-600' 
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            ]"
          >
            Über
          </router-link>
        </div>
      </div>
    </header>

    <main class="container mx-auto px-4 py-8">
      <router-view />
    </main>
  </div>
</template>

<style>
#app {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>
