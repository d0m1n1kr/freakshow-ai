<template>
  <div>
    <!-- Header Section -->
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
        Analytics & Statistiken
      </h2>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Übersicht über Nutzungsstatistiken und Analytics-Daten
      </p>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-12">
      <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100"></div>
      <p class="mt-4 text-gray-600 dark:text-gray-400">Loading statistics...</p>
    </div>

    <!-- Error State -->
    <div v-if="error" class="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 rounded-lg p-4 mb-6">
      <p class="text-red-800 dark:text-red-200">{{ error }}</p>
    </div>

    <!-- Stats Content -->
    <div v-if="stats && !loading">
      <!-- Time Range Selector -->
      <div class="mb-6 flex gap-2">
        <button
          v-for="period in timePeriods"
          :key="period.days ?? 'all'"
          @click="selectedDays = period.days"
          :class="[
            'px-4 py-2 rounded-lg font-medium transition-colors',
            selectedDays === period.days
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          ]"
        >
          {{ period.label }}
        </button>
      </div>

      <!-- KPI Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Unique Users</h3>
          <p class="text-3xl font-bold text-gray-900 dark:text-gray-100">{{ formatNumber(stats.unique_users) }}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Total Page Views</h3>
          <p class="text-3xl font-bold text-gray-900 dark:text-gray-100">{{ formatNumber(stats.total_page_views) }}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Total Episode Plays</h3>
          <p class="text-3xl font-bold text-gray-900 dark:text-gray-100">{{ formatNumber(stats.total_episode_plays) }}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Avg Views per User</h3>
          <p class="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {{ stats.unique_users > 0 ? (stats.total_page_views / stats.unique_users).toFixed(1) : '0' }}
          </p>
        </div>
      </div>

      <!-- Top Pages -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold">Top Pages</h2>
          <div class="flex gap-2">
            <button
              @click="showPagesChart = !showPagesChart"
              :class="[
                'px-3 py-1 rounded text-sm font-medium transition-colors',
                showPagesChart
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              ]"
            >
              Chart
            </button>
            <button
              @click="showPagesChart = !showPagesChart"
              :class="[
                'px-3 py-1 rounded text-sm font-medium transition-colors',
                !showPagesChart
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              ]"
            >
              Table
            </button>
          </div>
        </div>
        <div v-if="showPagesChart" ref="topPagesChart" class="h-64"></div>
        <div v-else>
          <div class="flex justify-end items-center gap-2 mb-4">
            <label class="text-sm text-gray-600 dark:text-gray-400">Items per page:</label>
            <select 
              v-model="pagesPerPage" 
              class="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
            >
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
            </select>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">#</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Path</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Route</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Views</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Unique Users</th>
                </tr>
              </thead>
              <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="(page, index) in paginatedPages" :key="page.path">
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ (pagesCurrentPage - 1) * pagesPerPage + index + 1 }}</td>
                  <td class="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{{ page.path }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ page.route_name || '-' }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ formatNumber(page.views) }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ formatNumber(page.unique_users) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="pagesTotalPages > 1" class="mt-4 flex items-center justify-between">
            <div class="text-sm text-gray-600 dark:text-gray-400">
              Showing {{ (pagesCurrentPage - 1) * pagesPerPage + 1 }} to {{ Math.min(pagesCurrentPage * pagesPerPage, stats.top_pages.length) }} of {{ stats.top_pages.length }} pages
            </div>
            <div class="flex gap-2">
              <button
                @click="pagesCurrentPage = 1"
                :disabled="pagesCurrentPage === 1"
                :class="[
                  'px-3 py-1 rounded text-sm font-medium transition-colors',
                  pagesCurrentPage === 1
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                ]"
              >
                First
              </button>
              <button
                @click="pagesCurrentPage--"
                :disabled="pagesCurrentPage === 1"
                :class="[
                  'px-3 py-1 rounded text-sm font-medium transition-colors',
                  pagesCurrentPage === 1
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                ]"
              >
                Previous
              </button>
              <div class="flex gap-1">
                <button
                  v-for="page in visiblePagePages"
                  :key="page"
                  @click="pagesCurrentPage = page"
                  :class="[
                    'px-3 py-1 rounded text-sm font-medium transition-colors',
                    pagesCurrentPage === page
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  ]"
                >
                  {{ page }}
                </button>
              </div>
              <button
                @click="pagesCurrentPage++"
                :disabled="pagesCurrentPage === pagesTotalPages"
                :class="[
                  'px-3 py-1 rounded text-sm font-medium transition-colors',
                  pagesCurrentPage === pagesTotalPages
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                ]"
              >
                Next
              </button>
              <button
                @click="pagesCurrentPage = pagesTotalPages"
                :disabled="pagesCurrentPage === pagesTotalPages"
                :class="[
                  'px-3 py-1 rounded text-sm font-medium transition-colors',
                  pagesCurrentPage === pagesTotalPages
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                ]"
              >
                Last
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Top Podcasts -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold">Top Podcasts</h2>
          <div class="flex gap-2">
            <button
              @click="showPodcastsChart = !showPodcastsChart"
              :class="[
                'px-3 py-1 rounded text-sm font-medium transition-colors',
                showPodcastsChart
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              ]"
            >
              Chart
            </button>
            <button
              @click="showPodcastsChart = !showPodcastsChart"
              :class="[
                'px-3 py-1 rounded text-sm font-medium transition-colors',
                !showPodcastsChart
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              ]"
            >
              Table
            </button>
          </div>
        </div>
        <div v-if="showPodcastsChart" ref="topPodcastsChart" class="h-64"></div>
        <div v-else>
          <div class="flex justify-end items-center gap-2 mb-4">
            <label class="text-sm text-gray-600 dark:text-gray-400">Items per page:</label>
            <select 
              v-model="podcastsPerPage" 
              class="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
            >
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
            </select>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">#</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Podcast</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Views</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Unique Users</th>
                </tr>
              </thead>
              <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="(podcast, index) in paginatedPodcasts" :key="podcast.podcast">
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ (podcastsCurrentPage - 1) * podcastsPerPage + index + 1 }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">{{ podcast.podcast }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ formatNumber(podcast.views) }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ formatNumber(podcast.unique_users) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="podcastsTotalPages > 1" class="mt-4 flex items-center justify-between">
            <div class="text-sm text-gray-600 dark:text-gray-400">
              Showing {{ (podcastsCurrentPage - 1) * podcastsPerPage + 1 }} to {{ Math.min(podcastsCurrentPage * podcastsPerPage, stats.top_podcasts.length) }} of {{ stats.top_podcasts.length }} podcasts
            </div>
            <div class="flex gap-2">
              <button
                @click="podcastsCurrentPage = 1"
                :disabled="podcastsCurrentPage === 1"
                :class="[
                  'px-3 py-1 rounded text-sm font-medium transition-colors',
                  podcastsCurrentPage === 1
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                ]"
              >
                First
              </button>
              <button
                @click="podcastsCurrentPage--"
                :disabled="podcastsCurrentPage === 1"
                :class="[
                  'px-3 py-1 rounded text-sm font-medium transition-colors',
                  podcastsCurrentPage === 1
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                ]"
              >
                Previous
              </button>
              <div class="flex gap-1">
                <button
                  v-for="page in visiblePodcastPages"
                  :key="page"
                  @click="podcastsCurrentPage = page"
                  :class="[
                    'px-3 py-1 rounded text-sm font-medium transition-colors',
                    podcastsCurrentPage === page
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  ]"
                >
                  {{ page }}
                </button>
              </div>
              <button
                @click="podcastsCurrentPage++"
                :disabled="podcastsCurrentPage === podcastsTotalPages"
                :class="[
                  'px-3 py-1 rounded text-sm font-medium transition-colors',
                  podcastsCurrentPage === podcastsTotalPages
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                ]"
              >
                Next
              </button>
              <button
                @click="podcastsCurrentPage = podcastsTotalPages"
                :disabled="podcastsCurrentPage === podcastsTotalPages"
                :class="[
                  'px-3 py-1 rounded text-sm font-medium transition-colors',
                  podcastsCurrentPage === podcastsTotalPages
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                ]"
              >
                Last
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Top Episodes Table -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold">Top Episodes</h2>
          <div class="flex items-center gap-2">
            <label class="text-sm text-gray-600 dark:text-gray-400">Items per page:</label>
            <select 
              v-model="episodesPerPage" 
              class="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
            >
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
            </select>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">#</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Podcast</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Episode</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Views</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Unique Users</th>
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              <tr v-for="(episode, index) in paginatedEpisodes" :key="`${episode.podcast}-${episode.episode}`">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ (episodesCurrentPage - 1) * episodesPerPage + index + 1 }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">{{ episode.podcast }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ episode.episode }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ formatNumber(episode.views) }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ formatNumber(episode.unique_users) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- Pagination Controls -->
        <div v-if="episodesTotalPages > 1" class="mt-4 flex items-center justify-between">
          <div class="text-sm text-gray-600 dark:text-gray-400">
            Showing {{ (episodesCurrentPage - 1) * episodesPerPage + 1 }} to {{ Math.min(episodesCurrentPage * episodesPerPage, stats.top_episodes.length) }} of {{ stats.top_episodes.length }} episodes
          </div>
          <div class="flex gap-2">
            <button
              @click="episodesCurrentPage = 1"
              :disabled="episodesCurrentPage === 1"
              :class="[
                'px-3 py-1 rounded text-sm font-medium transition-colors',
                episodesCurrentPage === 1
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              ]"
            >
              First
            </button>
            <button
              @click="episodesCurrentPage--"
              :disabled="episodesCurrentPage === 1"
              :class="[
                'px-3 py-1 rounded text-sm font-medium transition-colors',
                episodesCurrentPage === 1
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              ]"
            >
              Previous
            </button>
            <div class="flex gap-1">
              <button
                v-for="page in visibleEpisodePages"
                :key="page"
                @click="episodesCurrentPage = page"
                :class="[
                  'px-3 py-1 rounded text-sm font-medium transition-colors',
                  episodesCurrentPage === page
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                ]"
              >
                {{ page }}
              </button>
            </div>
            <button
              @click="episodesCurrentPage++"
              :disabled="episodesCurrentPage === episodesTotalPages"
              :class="[
                'px-3 py-1 rounded text-sm font-medium transition-colors',
                episodesCurrentPage === episodesTotalPages
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              ]"
            >
              Next
            </button>
            <button
              @click="episodesCurrentPage = episodesTotalPages"
              :disabled="episodesCurrentPage === episodesTotalPages"
              :class="[
                'px-3 py-1 rounded text-sm font-medium transition-colors',
                episodesCurrentPage === episodesTotalPages
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              ]"
            >
              Last
            </button>
          </div>
        </div>
      </div>

      <!-- Top Played Podcasts Table -->
      <div v-if="stats.top_played_podcasts" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold">Top Played Podcasts</h2>
          <div class="flex items-center gap-2">
            <label class="text-sm text-gray-600 dark:text-gray-400">Items per page:</label>
            <select 
              v-model="podcastsPerPage" 
              class="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
            >
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
            </select>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">#</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Podcast</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Plays</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Unique Users</th>
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              <tr v-for="(podcast, index) in paginatedPlayedPodcasts" :key="podcast.podcast">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ (playedPodcastsCurrentPage - 1) * podcastsPerPage + index + 1 }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">{{ podcast.podcast }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ formatNumber(podcast.views) }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ formatNumber(podcast.unique_users) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="playedPodcastsTotalPages > 1" class="mt-4 flex items-center justify-between">
          <div class="text-sm text-gray-600 dark:text-gray-400">
            Showing {{ (playedPodcastsCurrentPage - 1) * podcastsPerPage + 1 }} to {{ Math.min(playedPodcastsCurrentPage * podcastsPerPage, stats.top_played_podcasts.length) }} of {{ stats.top_played_podcasts.length }} podcasts
          </div>
          <div class="flex gap-2">
            <button
              @click="playedPodcastsCurrentPage = 1"
              :disabled="playedPodcastsCurrentPage === 1"
              :class="[
                'px-3 py-1 rounded text-sm font-medium transition-colors',
                playedPodcastsCurrentPage === 1
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              ]"
            >
              First
            </button>
            <button
              @click="playedPodcastsCurrentPage--"
              :disabled="playedPodcastsCurrentPage === 1"
              :class="[
                'px-3 py-1 rounded text-sm font-medium transition-colors',
                playedPodcastsCurrentPage === 1
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              ]"
            >
              Previous
            </button>
            <div class="flex gap-1">
              <button
                v-for="page in visiblePlayedPodcastPages"
                :key="page"
                @click="playedPodcastsCurrentPage = page"
                :class="[
                  'px-3 py-1 rounded text-sm font-medium transition-colors',
                  playedPodcastsCurrentPage === page
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                ]"
              >
                {{ page }}
              </button>
            </div>
            <button
              @click="playedPodcastsCurrentPage++"
              :disabled="playedPodcastsCurrentPage === playedPodcastsTotalPages"
              :class="[
                'px-3 py-1 rounded text-sm font-medium transition-colors',
                playedPodcastsCurrentPage === playedPodcastsTotalPages
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              ]"
            >
              Next
            </button>
            <button
              @click="playedPodcastsCurrentPage = playedPodcastsTotalPages"
              :disabled="playedPodcastsCurrentPage === playedPodcastsTotalPages"
              :class="[
                'px-3 py-1 rounded text-sm font-medium transition-colors',
                playedPodcastsCurrentPage === playedPodcastsTotalPages
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              ]"
            >
              Last
            </button>
          </div>
        </div>
      </div>

      <!-- Top Played Episodes Table -->
      <div v-if="stats.top_played_episodes && stats.top_played_episodes.length > 0" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold">Top Played Episodes</h2>
          <div class="flex items-center gap-2">
            <label class="text-sm text-gray-600 dark:text-gray-400">Items per page:</label>
            <select 
              v-model="episodesPerPage" 
              class="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
            >
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
            </select>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">#</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Podcast</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Episode</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Plays</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Unique Users</th>
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              <tr v-for="(episode, index) in paginatedPlayedEpisodes" :key="`${episode.podcast}-${episode.episode}`">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ (playedEpisodesCurrentPage - 1) * episodesPerPage + index + 1 }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">{{ episode.podcast }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ episode.episode }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ formatNumber(episode.views) }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ formatNumber(episode.unique_users) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- Pagination Controls -->
        <div v-if="playedEpisodesTotalPages > 1" class="mt-4 flex items-center justify-between">
          <div class="text-sm text-gray-600 dark:text-gray-400">
            Showing {{ (playedEpisodesCurrentPage - 1) * episodesPerPage + 1 }} to {{ Math.min(playedEpisodesCurrentPage * episodesPerPage, stats.top_played_episodes.length) }} of {{ stats.top_played_episodes.length }} episodes
          </div>
          <div class="flex gap-2">
            <button
              @click="playedEpisodesCurrentPage = 1"
              :disabled="playedEpisodesCurrentPage === 1"
              :class="[
                'px-3 py-1 rounded text-sm font-medium transition-colors',
                playedEpisodesCurrentPage === 1
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              ]"
            >
              First
            </button>
            <button
              @click="playedEpisodesCurrentPage--"
              :disabled="playedEpisodesCurrentPage === 1"
              :class="[
                'px-3 py-1 rounded text-sm font-medium transition-colors',
                playedEpisodesCurrentPage === 1
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              ]"
            >
              Previous
            </button>
            <div class="flex gap-1">
              <button
                v-for="page in visiblePlayedEpisodePages"
                :key="page"
                @click="playedEpisodesCurrentPage = page"
                :class="[
                  'px-3 py-1 rounded text-sm font-medium transition-colors',
                  playedEpisodesCurrentPage === page
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                ]"
              >
                {{ page }}
              </button>
            </div>
            <button
              @click="playedEpisodesCurrentPage++"
              :disabled="playedEpisodesCurrentPage === playedEpisodesTotalPages"
              :class="[
                'px-3 py-1 rounded text-sm font-medium transition-colors',
                playedEpisodesCurrentPage === playedEpisodesTotalPages
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              ]"
            >
              Next
            </button>
            <button
              @click="playedEpisodesCurrentPage = playedEpisodesTotalPages"
              :disabled="playedEpisodesCurrentPage === playedEpisodesTotalPages"
              :class="[
                'px-3 py-1 rounded text-sm font-medium transition-colors',
                playedEpisodesCurrentPage === playedEpisodesTotalPages
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              ]"
            >
              Last
            </button>
          </div>
        </div>
      </div>

      <!-- Locations Chart -->
      <div v-if="stats.locations.length > 0" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <h2 class="text-xl font-bold mb-4">Top Locations</h2>
        <div ref="locationsChart" class="h-64"></div>
      </div>

      <!-- World Map -->
      <div v-if="stats.locations.length > 0" class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 relative">
        <h2 class="text-xl font-bold mb-4">Visits by Location</h2>
        <div ref="worldMap" class="h-96 w-full"></div>
        <!-- HTML Tooltip -->
        <div
          ref="mapTooltip"
          class="absolute pointer-events-none opacity-0 transition-opacity duration-200 z-50 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-3 py-2 rounded-lg shadow-lg text-sm max-w-xs"
          style="display: none;"
        >
          <div class="font-semibold mb-1" ref="tooltipTitle"></div>
          <div class="text-xs opacity-90" ref="tooltipContent"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, onUnmounted } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import {
  select,
  scaleBand,
  scaleLinear,
  axisBottom,
  axisLeft,
  max,
  geoMercator,
  geoPath,
  scaleSqrt
} from '@/utils/d3-imports';
const settings = useSettingsStore();

const backendBase = computed(() => {
  if ((import.meta as any)?.env?.PROD) return '';
  const v = (import.meta as any)?.env?.VITE_RAG_BACKEND_URL;
  const s = typeof v === 'string' ? v.trim() : '';
  return (s || 'http://127.0.0.1:7878').replace(/\/+$/, '');
});

interface AnalyticsStats {
  unique_users: number;
  total_page_views: number;
  total_episode_plays: number;
  top_pages: Array<{ path: string; route_name: string | null; views: number; unique_users: number }>;
  top_podcasts: Array<{ podcast: string; views: number; unique_users: number }>;
  top_played_podcasts: Array<{ podcast: string; views: number; unique_users: number }>;
  top_episodes: Array<{ podcast: string; episode: string; views: number; unique_users: number }>;
  top_played_episodes: Array<{ podcast: string; episode: string; views: number; unique_users: number }>;
  locations: Array<{ 
    country: string | null; 
    city: string | null; 
    views: number; 
    unique_users: number;
    latitude?: number | null;
    longitude?: number | null;
  }>;
}

const stats = ref<AnalyticsStats | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const authenticated = ref(true); // Always authenticated in admin context
const selectedDays = ref<number | null>(null);

const timePeriods = [
  { label: 'All Time', days: null },
  { label: 'Last 7 Days', days: 7 },
  { label: 'Last 30 Days', days: 30 },
  { label: 'Last 90 Days', days: 90 },
];

const topPagesChart = ref<HTMLElement | null>(null);
const topPodcastsChart = ref<HTMLElement | null>(null);
const locationsChart = ref<HTMLElement | null>(null);
const worldMap = ref<HTMLElement | null>(null);
const mapTooltip = ref<HTMLElement | null>(null);
const tooltipTitle = ref<HTMLElement | null>(null);
const tooltipContent = ref<HTMLElement | null>(null);
let tooltipHideTimeout: number | null = null;

// View mode toggles
const showPagesChart = ref(true);
const showPodcastsChart = ref(true);

// Pagination for episodes table
const episodesCurrentPage = ref(1);
const episodesPerPage = computed({
  get: () => settings.statsEpisodesPerPage,
  set: (value: number) => settings.setStatsEpisodesPerPage(value)
});

const paginatedEpisodes = computed(() => {
  if (!stats.value) return [];
  const start = (episodesCurrentPage.value - 1) * episodesPerPage.value;
  const end = start + episodesPerPage.value;
  return stats.value.top_episodes.slice(start, end);
});

const episodesTotalPages = computed(() => {
  if (!stats.value) return 1;
  return Math.ceil(stats.value.top_episodes.length / episodesPerPage.value);
});

const visibleEpisodePages = computed(() => {
  const total = episodesTotalPages.value;
  const current = episodesCurrentPage.value;
  const pages: number[] = [];
  
  // Show up to 5 page numbers around current page
  const start = Math.max(1, current - 2);
  const end = Math.min(total, current + 2);
  
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  
  return pages;
});

// Pagination for played episodes table
const playedEpisodesCurrentPage = ref(1);

const paginatedPlayedEpisodes = computed(() => {
  if (!stats.value || !stats.value.top_played_episodes) return [];
  const start = (playedEpisodesCurrentPage.value - 1) * episodesPerPage.value;
  const end = start + episodesPerPage.value;
  return stats.value.top_played_episodes.slice(start, end);
});

const playedEpisodesTotalPages = computed(() => {
  if (!stats.value || !stats.value.top_played_episodes) return 1;
  return Math.ceil(stats.value.top_played_episodes.length / episodesPerPage.value);
});

const visiblePlayedEpisodePages = computed(() => {
  const total = playedEpisodesTotalPages.value;
  const current = playedEpisodesCurrentPage.value;
  const pages: number[] = [];
  
  const start = Math.max(1, current - 2);
  const end = Math.min(total, current + 2);
  
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  
  return pages;
});

// Pagination for pages table
const pagesCurrentPage = ref(1);
const pagesPerPage = computed({
  get: () => settings.statsPagesPerPage,
  set: (value: number) => settings.setStatsPagesPerPage(value)
});

const paginatedPages = computed(() => {
  if (!stats.value) return [];
  const start = (pagesCurrentPage.value - 1) * pagesPerPage.value;
  const end = start + pagesPerPage.value;
  return stats.value.top_pages.slice(start, end);
});

const pagesTotalPages = computed(() => {
  if (!stats.value) return 1;
  return Math.ceil(stats.value.top_pages.length / pagesPerPage.value);
});

const visiblePagePages = computed(() => {
  const total = pagesTotalPages.value;
  const current = pagesCurrentPage.value;
  const pages: number[] = [];
  
  const start = Math.max(1, current - 2);
  const end = Math.min(total, current + 2);
  
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  
  return pages;
});

// Pagination for podcasts table
const podcastsCurrentPage = ref(1);
const podcastsPerPage = computed({
  get: () => settings.statsPodcastsPerPage,
  set: (value: number) => settings.setStatsPodcastsPerPage(value)
});

const paginatedPodcasts = computed(() => {
  if (!stats.value) return [];
  const start = (podcastsCurrentPage.value - 1) * podcastsPerPage.value;
  const end = start + podcastsPerPage.value;
  return stats.value.top_podcasts.slice(start, end);
});

const podcastsTotalPages = computed(() => {
  if (!stats.value) return 1;
  return Math.ceil(stats.value.top_podcasts.length / podcastsPerPage.value);
});

const visiblePodcastPages = computed(() => {
  const total = podcastsTotalPages.value;
  const current = podcastsCurrentPage.value;
  const pages: number[] = [];
  
  const start = Math.max(1, current - 2);
  const end = Math.min(total, current + 2);
  
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  
  return pages;
});

// Pagination for played podcasts table
const playedPodcastsCurrentPage = ref(1);

const paginatedPlayedPodcasts = computed(() => {
  if (!stats.value || !stats.value.top_played_podcasts) return [];
  const start = (playedPodcastsCurrentPage.value - 1) * podcastsPerPage.value;
  const end = start + podcastsPerPage.value;
  return stats.value.top_played_podcasts.slice(start, end);
});

const playedPodcastsTotalPages = computed(() => {
  if (!stats.value || !stats.value.top_played_podcasts) return 1;
  return Math.ceil(stats.value.top_played_podcasts.length / podcastsPerPage.value);
});

const visiblePlayedPodcastPages = computed(() => {
  const total = playedPodcastsTotalPages.value;
  const current = playedPodcastsCurrentPage.value;
  const pages: number[] = [];
  
  const start = Math.max(1, current - 2);
  const end = Math.min(total, current + 2);
  
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  
  return pages;
});

const ensureAuthToken = async (): Promise<string> => {
  // Use admin token from localStorage (same as AdminTokensView)
  const savedToken = localStorage.getItem('adminToken');
  if (savedToken) {
    return savedToken;
  }
  
  // Return empty string to try without token first
  // (backend allows no auth if not configured)
  return '';
};

const isPermissionDenied = (status: number, bodyText: string) => {
  if (status === 401 || status === 403) return true;
  const txt = (bodyText || '').toLowerCase();
  return txt.includes('permission denied') || txt.includes('forbidden') || txt.includes('unauthorized');
};

const fetchStats = async () => {
  loading.value = true;
  error.value = null;

  try {
    const token0 = await ensureAuthToken();

    const url = backendBase.value
      ? `${backendBase.value}/api/analytics/stats${selectedDays.value ? `?days=${selectedDays.value}` : ''}`
      : `/api/analytics/stats${selectedDays.value ? `?days=${selectedDays.value}` : ''}`;

    const run = async (token: string) => {
      const headers: any = {};
      // Only add auth header if token is non-empty
      // Use Authorization: Bearer header (like Admin panel)
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      return await fetch(url, {
        headers,
        cache: 'no-cache',
      });
    };

    let res = await run(token0);

    if (!res.ok) {
      const txt = await res.text();
      if (isPermissionDenied(res.status, txt)) {
        // Backend requires auth
        error.value = 'Authentifizierung fehlgeschlagen. Bitte logge dich erneut ein.';
        authenticated.value = false;
        loading.value = false;
        return;
      } else {
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
    }

    const data = await res.json() as AnalyticsStats;
    // Ensure top_played_podcasts exists (fallback to empty array if missing)
    if (!data.top_played_podcasts) {
      (data as any).top_played_podcasts = [];
    }
    stats.value = data;
    authenticated.value = true;
    // Wait for DOM to update and ensure containers have width
    await nextTick();
    setTimeout(() => {
      renderCharts();
      renderWorldMap();
    }, 100);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    console.error('Failed to fetch stats:', e);
  } finally {
    loading.value = false;
  }
};

const formatNumber = (num: number): string => {
  return new Intl.NumberFormat().format(num);
};

const renderCharts = () => {
  if (!stats.value) {
    console.log('renderCharts: No stats data');
    return;
  }

  console.log('renderCharts: Rendering charts', {
    topPages: stats.value.top_pages.length,
    topPodcasts: stats.value.top_podcasts.length,
    locations: stats.value.locations.length,
    topPagesChart: !!topPagesChart.value,
    topPodcastsChart: !!topPodcastsChart.value,
    locationsChart: !!locationsChart.value
  });

  // Render Top Pages Chart
  if (topPagesChart.value && stats.value.top_pages.length > 0) {
    console.log('Rendering top pages chart, container width:', topPagesChart.value.clientWidth);
    select(topPagesChart.value).selectAll('*').remove();
    const margin = { top: 20, right: 30, bottom: 60, left: 60 };
    const containerWidth = topPagesChart.value.clientWidth || 800;
    const width = Math.max(400, containerWidth - margin.left - margin.right);
    const height = 256 - margin.top - margin.bottom;

    const svg = select(topPagesChart.value)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const pageData = stats.value.top_pages.slice(0, 10);
    const x = scaleBand()
      .domain(pageData.map(d => d.route_name || d.path.split('/').pop() || 'Unknown'))
      .range([0, width])
      .padding(0.2);

    const y = scaleLinear()
      .domain([0, max(pageData, d => d.views) || 0])
      .nice()
      .range([height, 0]);

    const isDark = settings.isDarkMode;
    const textColor = isDark ? '#e5e7eb' : '#374151';
    const barColor = isDark ? '#3b82f6' : '#2563eb';

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(axisBottom(x))
      .selectAll('text')
      .attr('fill', textColor)
      .style('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .attr('transform', 'rotate(-45)');

    g.append('g')
      .call(axisLeft(y).tickFormat((d: any) => formatNumber(d)))
      .selectAll('text')
      .attr('fill', textColor);

    g.selectAll('.bar')
      .data(pageData)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.route_name || d.path.split('/').pop() || 'Unknown') || 0)
      .attr('width', x.bandwidth())
      .attr('y', d => y(d.views))
      .attr('height', d => height - y(d.views))
      .attr('fill', barColor);
  }

  // Render Top Podcasts Chart
  if (topPodcastsChart.value && stats.value.top_podcasts.length > 0) {
    select(topPodcastsChart.value).selectAll('*').remove();
    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const containerWidth = topPodcastsChart.value.clientWidth || 800;
    const width = Math.max(400, containerWidth - margin.left - margin.right);
    const height = 256 - margin.top - margin.bottom;

    const svg = select(topPodcastsChart.value)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = scaleBand()
      .domain(stats.value.top_podcasts.map(d => d.podcast))
      .range([0, width])
      .padding(0.2);

    const y = scaleLinear()
      .domain([0, max(stats.value.top_podcasts, d => d.views) || 0])
      .nice()
      .range([height, 0]);

    const isDark = settings.isDarkMode;
    const textColor = isDark ? '#e5e7eb' : '#374151';
    const barColor = isDark ? '#10b981' : '#059669';

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(axisBottom(x))
      .selectAll('text')
      .attr('fill', textColor)
      .style('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .attr('transform', 'rotate(-45)');

    g.append('g')
      .call(axisLeft(y).tickFormat((d: any) => formatNumber(d)))
      .selectAll('text')
      .attr('fill', textColor);

    g.selectAll('.bar')
      .data(stats.value.top_podcasts)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.podcast) || 0)
      .attr('width', x.bandwidth())
      .attr('y', d => y(d.views))
      .attr('height', d => height - y(d.views))
      .attr('fill', barColor);
  }

  // Render Locations Chart
  if (locationsChart.value && stats.value.locations.length > 0) {
    select(locationsChart.value).selectAll('*').remove();
    const margin = { top: 20, right: 30, bottom: 60, left: 60 };
    const containerWidth = locationsChart.value.clientWidth || 800;
    const width = Math.max(400, containerWidth - margin.left - margin.right);
    const height = 256 - margin.top - margin.bottom;

    const svg = select(locationsChart.value)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const topLocations = stats.value.locations.slice(0, 10);
    const locationLabels = topLocations.map(d => 
      d.city && d.country ? `${d.city}, ${d.country}` : d.country || d.city || 'Unknown'
    );

    const x = scaleBand()
      .domain(locationLabels)
      .range([0, width])
      .padding(0.2);

    const y = scaleLinear()
      .domain([0, max(topLocations, d => d.views) || 0])
      .nice()
      .range([height, 0]);

    const isDark = settings.isDarkMode;
    const textColor = isDark ? '#e5e7eb' : '#374151';
    const barColor = isDark ? '#f59e0b' : '#d97706';

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(axisBottom(x))
      .selectAll('text')
      .attr('fill', textColor)
      .style('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .attr('transform', 'rotate(-45)');

    g.append('g')
      .call(axisLeft(y).tickFormat((d: any) => formatNumber(d)))
      .selectAll('text')
      .attr('fill', textColor);

    g.selectAll('.bar')
      .data(topLocations)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (_, i) => x(locationLabels[i] ?? '') || 0)
      .attr('width', x.bandwidth())
      .attr('y', d => y(d.views))
      .attr('height', d => height - y(d.views))
      .attr('fill', barColor);
  }
};

// Country code to approximate coordinates mapping (centroids)
const countryCoordinates: Record<string, [number, number]> = {
  'US': [-95.7129, 37.0902],
  'DE': [10.4515, 51.1657],
  'GB': [-3.4360, 55.3781],
  'FR': [2.2137, 46.2276],
  'CA': [-106.3468, 56.1304],
  'AU': [133.7751, -25.2744],
  'IT': [12.5674, 41.8719],
  'ES': [-3.7492, 40.4637],
  'NL': [5.2913, 52.1326],
  'CH': [8.2275, 46.8182],
  'AT': [14.5501, 47.5162],
  'BE': [4.4699, 50.5039],
  'SE': [18.6435, 60.1282],
  'NO': [8.4689, 60.4720],
  'DK': [9.5018, 56.2639],
  'FI': [25.7482, 61.9241],
  'PL': [19.1451, 51.9194],
  'CZ': [15.4726, 49.8175],
  'IE': [-8.2439, 53.4129],
  'PT': [-8.2245, 39.3999],
  'GR': [21.8243, 39.0742],
  'BR': [-51.9253, -14.2350],
  'MX': [-102.5528, 23.6345],
  'AR': [-63.6167, -38.4161],
  'CL': [-71.5430, -35.6751],
  'CO': [-74.2973, 4.5709],
  'JP': [138.2529, 36.2048],
  'CN': [104.1954, 35.8617],
  'KR': [127.7669, 35.9078],
  'IN': [78.9629, 20.5937],
  'SG': [103.8198, 1.3521],
  'NZ': [174.8860, -40.9006],
  'ZA': [22.9375, -30.5595],
  'IL': [34.8516, 31.0461],
  'TR': [35.2433, 38.9637],
  'RU': [105.3188, 61.5240],
  'UA': [31.1656, 48.3794],
};

const renderWorldMap = async () => {
  if (!stats.value || !worldMap.value || stats.value.locations.length === 0) {
    console.log('renderWorldMap: No data or container');
    return;
  }

  console.log('renderWorldMap: Rendering map');

  select(worldMap.value).selectAll('*').remove();

  const containerWidth = worldMap.value.clientWidth || 800;
  const width = Math.max(600, containerWidth);
  const height = 384;

  const svg = select(worldMap.value)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`);

  // Use Mercator projection centered on Central Europe (Germany, Switzerland, Austria)
  // Center around 10°E, 50°N (central Germany)
  // Adjust scale based on container size - zoomed out a bit more
  const baseScale = Math.min(width, height);
  const projection = geoMercator()
    .scale(baseScale * 2.5) // Zoomed out more to show more area
    .center([10, 50]) // Center on Central Europe (10°E, 50°N)
    .translate([width / 2, height / 2]);
  
  console.log('Projection:', { 
    scale: baseScale * 3.5, 
    center: [10, 50], 
    translate: [width / 2, height / 2],
    width,
    height,
    baseScale
  });

  const path = geoPath().projection(projection);

  // Filter to only show Germany (DE), Switzerland (CH), and Austria (AT)
  const allowedCountries = new Set(['DE', 'CH', 'AT']);
  
  // Group locations by city (only for allowed countries)
  // Use city+country as key to show individual cities
  const cityData = new Map<string, { city: string; country: string; views: number; unique_users: number }>();
  
  stats.value.locations.forEach(loc => {
    if (!loc.country) return;
    const country = loc.country.toUpperCase();
    if (!allowedCountries.has(country)) return; // Skip countries not in the allowed list
    
    const city = loc.city || 'Unknown';
    const key = `${country}-${city}`;
    
    if (!cityData.has(key)) {
      cityData.set(key, { city, country, views: 0, unique_users: 0 });
    }
    const data = cityData.get(key)!;
    data.views += loc.views;
    data.unique_users += loc.unique_users;
  });

  // Get max views for scaling (using city data)
  const maxViews = max(Array.from(cityData.values()), d => d.views) || 1;
  const radiusScale = scaleSqrt()
    .domain([0, maxViews])
    .range([3, 18]); // Smaller markers to show individual cities

  const isDark = settings.isDarkMode;
  // Increased contrast colors
  const bgColor = isDark ? '#111827' : '#ffffff'; // Darker background in dark mode, pure white in light
  const landColor = isDark ? '#4b5563' : '#d1d5db'; // Lighter land in dark mode, darker in light mode
  const strokeColor = isDark ? '#6b7280' : '#9ca3af'; // Stronger borders
  const textColor = isDark ? '#f3f4f6' : '#1f2937'; // Higher contrast text
  const markerColor = isDark ? '#60a5fa' : '#1d4ed8'; // Brighter markers for better visibility

  // Background
  svg.append('rect')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', bgColor);

  // Try to load world map data from Natural Earth
  let worldData: any = null;
  try {
    // Use Natural Earth 110m countries GeoJSON
    const response = await fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson');
    if (response.ok) {
      worldData = await response.json();
      console.log('Loaded world map data:', worldData);
    }
  } catch (e) {
    console.log('Could not load world map data, using simple background:', e);
  }

  // Draw world map if available (in background layer)
  // Filter to only show Germany, Switzerland, and Austria
  const mapGroup = svg.append('g').attr('class', 'map-layer');
  if (worldData && worldData.features) {
    // Filter features to only show DE, CH, AT
    // Try multiple property names for country codes
    const countryCodes: Record<string, string[]> = {
      'DE': ['DEU', 'DE', 'Germany', 'GER'],
      'CH': ['CHE', 'CH', 'Switzerland', 'SUI'],
      'AT': ['AUT', 'AT', 'Austria', 'AUS']
    };
    const allCodes = new Set<string>();
    Object.values(countryCodes).forEach(codes => codes.forEach(code => allCodes.add(code.toUpperCase())));
    
    const filteredFeatures = worldData.features.filter((feature: any) => {
      if (!feature.properties) return false;
      const props = feature.properties;
      // Try various property names
      const codes = [
        props.ISO_A3, props.ISO_A3_EH, props.iso_a3, props.ISO3, props.ISO_A2, props.iso_a2, 
        props.ISO2, props.NAME, props.NAME_EN, props.ADMIN, props.NAME_LONG
      ].filter(Boolean).map((c: any) => String(c).toUpperCase());
      
      return codes.some(code => allCodes.has(code));
    });
    
    console.log('Filtered features:', filteredFeatures.length, 'out of', worldData.features.length);
    console.log('Sample feature properties:', worldData.features[0]?.properties);
    
    if (filteredFeatures.length === 0) {
      // Fallback: show all features with lower opacity
      console.log('No features matched filter, showing all features as fallback');
      mapGroup.selectAll('path')
        .data(worldData.features)
        .enter()
        .append('path')
        .attr('d', path as any)
        .attr('fill', landColor)
        .attr('stroke', strokeColor)
        .attr('stroke-width', 1)
        .attr('opacity', 0.3);
    } else {
      console.log('Rendering', filteredFeatures.length, 'filtered features');
      mapGroup.selectAll('path')
        .data(filteredFeatures)
        .enter()
        .append('path')
        .attr('d', path as any)
        .attr('fill', landColor)
        .attr('stroke', strokeColor)
        .attr('stroke-width', 2) // Thicker borders for more contrast
        .attr('opacity', 1); // Full opacity for better contrast
    }
  } else {
    // Fallback: draw a simple grid/outline
    // Draw latitude/longitude grid lines
    for (let lat = -80; lat <= 80; lat += 20) {
      const line = {
        type: 'LineString',
        coordinates: Array.from({ length: 361 }, (_, i) => [i - 180, lat])
      };
      mapGroup.append('path')
        .datum(line as any)
        .attr('d', path as any)
        .attr('fill', 'none')
        .attr('stroke', strokeColor)
        .attr('stroke-width', 0.5)
        .attr('opacity', 0.2);
    }
    for (let lon = -180; lon <= 180; lon += 30) {
      const line = {
        type: 'LineString',
        coordinates: Array.from({ length: 161 }, (_, i) => [lon, i - 80])
      };
      mapGroup.append('path')
        .datum(line as any)
        .attr('d', path as any)
        .attr('fill', 'none')
        .attr('stroke', strokeColor)
        .attr('stroke-width', 0.5)
        .attr('opacity', 0.2);
    }
  }

  // Create marker groups with clustering (on top of map - append after mapGroup)
  const markersGroup = svg.append('g').attr('class', 'markers').style('pointer-events', 'all');

  // Group nearby markers (simple clustering) - now using city data
  const clusters: Array<{ x: number; y: number; cities: Array<{ city: string; country: string; data: { views: number; unique_users: number } }> }> = [];
  
  console.log('renderWorldMap: Processing', cityData.size, 'cities');
  
  // For city coordinates, we'll use approximate coordinates based on city names
  // In a real implementation, you'd have a city coordinate database
  // For now, we'll use country centroids and add some offset for major cities
  const cityOffsets: Record<string, [number, number]> = {
    // Germany
    'DE-Berlin': [13.4050, 52.5200],
    'DE-Munich': [11.5820, 48.1351],
    'DE-Hamburg': [9.9937, 53.5511],
    'DE-Cologne': [6.9603, 50.9375],
    'DE-Frankfurt': [8.6821, 50.1109],
    'DE-Stuttgart': [9.1815, 48.7758],
    'DE-Düsseldorf': [6.7735, 51.2277],
    'DE-Dortmund': [7.4653, 51.5136],
    'DE-Essen': [7.0123, 51.4556],
    'DE-Leipzig': [12.3731, 51.3397],
    'DE-Bremen': [8.8017, 53.0793],
    'DE-Dresden': [13.7373, 51.0504],
    'DE-Hannover': [9.7320, 52.3759],
    'DE-Nuremberg': [11.0774, 49.4521],
    // Switzerland
    'CH-Zurich': [8.5417, 47.3769],
    'CH-Geneva': [6.1432, 46.2044],
    'CH-Basel': [7.5886, 47.5596],
    'CH-Bern': [7.4474, 46.9481],
    'CH-Lausanne': [6.6323, 46.5197],
    // Austria
    'AT-Vienna': [16.3738, 48.2082],
    'AT-Graz': [15.4395, 47.0707],
    'AT-Linz': [14.2866, 48.3069],
    'AT-Salzburg': [13.0550, 47.8095],
    'AT-Innsbruck': [11.4041, 47.2692],
  };
  
  // Simple hash function for deterministic offsets
  const hashString = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  };

  cityData.forEach((data) => {
    // Use coordinates from backend if available, otherwise fallback to hardcoded offsets
    const cityKey = `${data.country}-${data.city}`;
    let coords: [number, number] | undefined;
    
    // First, try to get coordinates from the location data (enriched by backend)
    const locationData = stats.value?.locations.find(loc => 
      loc.country === data.country && loc.city === data.city
    );
    
    if (locationData?.longitude != null && locationData?.latitude != null) {
      // Backend provided coordinates - use them directly (note: backend uses lat/lng, we need lng/lat)
      coords = [locationData.longitude, locationData.latitude];
    } else {
      // Fallback to hardcoded offsets
      coords = cityOffsets[cityKey];
      
      if (!coords) {
        // Fallback to country centroid
        coords = countryCoordinates[data.country];
        if (!coords) {
          console.log('No coordinates for city:', cityKey);
          return;
        }
        // Add deterministic offset based on city name to prevent exact overlap
        const hash = hashString(cityKey);
        const offsetX = ((hash % 200) - 100) / 100; // -1 to 1 degrees
        const offsetY = (((hash >> 8) % 200) - 100) / 100; // -1 to 1 degrees
        coords = [coords[0] + offsetX, coords[1] + offsetY];
      }
    }

    const [lon, lat] = coords;
    const projected = projection([lon, lat]);
    if (!projected || projected[0] == null || projected[1] == null || isNaN(projected[0]) || isNaN(projected[1])) {
      console.log('Invalid projection for city:', cityKey, coords, projected);
      return;
    }

    const [x, y] = projected;

    // Allow markers slightly outside bounds (with margin)
    const margin = 100;
    if (x < -margin || x > width + margin || y < -margin || y > height + margin) {
      return;
    }

    // Simple clustering: check if marker is close to existing cluster
    // Reduced cluster radius to show more individual cities
    const clusterRadius = 12; // Reduced to 50% of previous value (25) to show more individual markers
    let addedToCluster = false;

    for (const cluster of clusters) {
      const dx = x - cluster.x;
      const dy = y - cluster.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < clusterRadius) {
        // Add to existing cluster
        cluster.cities.push({ city: data.city, country: data.country, data });
        addedToCluster = true;
        break;
      }
    }

    if (!addedToCluster) {
      // Create new cluster
      clusters.push({
        x,
        y,
        cities: [{ city: data.city, country: data.country, data }]
      });
    }
  });

  console.log('renderWorldMap: Rendering', clusters.length, 'clusters from', cityData.size, 'cities');

  // Render clusters
  clusters.forEach(cluster => {
    const totalViews = cluster.cities.reduce((sum, c) => sum + c.data.views, 0);
    const totalUsers = cluster.cities.reduce((sum, c) => sum + c.data.unique_users, 0);
    const radius = radiusScale(totalViews);

    // Cluster circle
    const clusterGroup = markersGroup.append('g')
      .attr('class', 'cluster')
      .attr('transform', `translate(${cluster.x},${cluster.y})`);

    clusterGroup.append('circle')
      .attr('r', radius)
      .attr('fill', markerColor)
      .attr('opacity', 0.85) // Higher opacity for better visibility
      .attr('stroke', isDark ? '#93c5fd' : '#1e40af') // Brighter stroke for contrast
      .attr('stroke-width', 2.5) // Thicker stroke
      .style('cursor', 'pointer');

    // Cluster label
    if (cluster.cities.length === 1) {
      // Single city - show city name
      const city = cluster.cities[0]!;
      clusterGroup.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', radius + 12)
        .attr('fill', textColor)
        .attr('font-size', '9px')
        .attr('font-weight', '500')
        .text(city.city.length > 12 ? city.city.substring(0, 10) + '...' : city.city);
    } else {
      // Multiple cities - show count
      clusterGroup.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', radius + 12)
        .attr('fill', textColor)
        .attr('font-size', '9px')
        .text(`${cluster.cities.length} cities`);
    }

    // HTML Tooltip on hover
    clusterGroup
      .on('mouseenter', function(event: MouseEvent) {
        if (!mapTooltip.value || !tooltipTitle.value || !tooltipContent.value || !worldMap.value) return;
        
        // Clear any pending hide timeout
        if (tooltipHideTimeout) {
          clearTimeout(tooltipHideTimeout);
          tooltipHideTimeout = null;
        }
        
        const tooltip = mapTooltip.value;
        const titleEl = tooltipTitle.value;
        const contentEl = tooltipContent.value;
        const mapContainer = worldMap.value;
        const rect = mapContainer.getBoundingClientRect();
        
        // Get mouse position relative to map container
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // Set tooltip content
        if (cluster.cities.length === 1) {
          const c = cluster.cities[0]!;
          titleEl.textContent = `${c.city}, ${c.country}`;
          contentEl.textContent = `${formatNumber(c.data.views)} views • ${formatNumber(c.data.unique_users)} users`;
        } else {
          titleEl.textContent = `${cluster.cities.length} Cities`;
          const cityList = cluster.cities.slice(0, 3).map(c => `${c.city}, ${c.country}`).join(', ');
          const moreText = cluster.cities.length > 3 ? ` +${cluster.cities.length - 3} more` : '';
          contentEl.innerHTML = `${cityList}${moreText}<br/>${formatNumber(totalViews)} views • ${formatNumber(totalUsers)} users`;
        }
        
        // Position tooltip
        if (tooltip.style.display === 'none') {
          tooltip.style.display = 'block';
          tooltip.style.opacity = '0';
        }
        
        // Force a reflow to get accurate dimensions
        void tooltip.offsetWidth;
        
        // Calculate position (offset to avoid cursor)
        const tooltipWidth = tooltip.offsetWidth || 200;
        const tooltipHeight = tooltip.offsetHeight || 60;
        const offsetX = 25; // Increased offset to prevent tooltip from being under cursor
        const offsetY = 25;
        
        let left = x + offsetX;
        let top = y + offsetY;
        
        // Adjust if tooltip goes off screen
        if (left + tooltipWidth > rect.width) {
          left = x - tooltipWidth - offsetX;
        }
        if (top + tooltipHeight > rect.height) {
          top = y - tooltipHeight - offsetY;
        }
        
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
        
        // Fade in
        requestAnimationFrame(() => {
          tooltip.style.opacity = '1';
        });
      })
      .on('mousemove', function(event: MouseEvent) {
        if (!mapTooltip.value || !worldMap.value) return;
        
        const tooltip = mapTooltip.value;
        const mapContainer = worldMap.value;
        const rect = mapContainer.getBoundingClientRect();
        
        // Get mouse position relative to map container
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // Update position as mouse moves
        const tooltipWidth = tooltip.offsetWidth || 200;
        const tooltipHeight = tooltip.offsetHeight || 60;
        const offsetX = 25; // Increased offset to prevent tooltip from being under cursor
        const offsetY = 25;
        
        let left = x + offsetX;
        let top = y + offsetY;
        
        if (left + tooltipWidth > rect.width) {
          left = x - tooltipWidth - offsetX;
        }
        if (top + tooltipHeight > rect.height) {
          top = y - tooltipHeight - offsetY;
        }
        
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      })
      .on('mouseleave', function() {
        if (!mapTooltip.value) return;
        
        // Clear any pending hide timeout
        if (tooltipHideTimeout) {
          clearTimeout(tooltipHideTimeout);
        }
        
        const tooltip = mapTooltip.value;
        tooltip.style.opacity = '0';
        tooltipHideTimeout = setTimeout(() => {
          tooltip.style.display = 'none';
          tooltipHideTimeout = null;
        }, 200) as unknown as number;
      });
  });
};

watch(selectedDays, () => {
  // Reset all pagination to first page when time period changes
  episodesCurrentPage.value = 1;
  playedEpisodesCurrentPage.value = 1;
  pagesCurrentPage.value = 1;
  podcastsCurrentPage.value = 1;
  playedPodcastsCurrentPage.value = 1;
  fetchStats();
});

watch(() => settings.statsEpisodesPerPage, () => {
  episodesCurrentPage.value = 1;
});

watch(() => settings.statsPagesPerPage, () => {
  pagesCurrentPage.value = 1;
});

watch(() => settings.statsPodcastsPerPage, () => {
  podcastsCurrentPage.value = 1;
});

watch(() => settings.isDarkMode, () => {
  if (stats.value && authenticated.value) {
    renderCharts();
    renderWorldMap();
  }
});

watch(showPagesChart, (show) => {
  if (show && stats.value) {
    // Wait for DOM to update before rendering
    nextTick(() => {
      setTimeout(() => {
        renderCharts();
      }, 100);
    });
  }
});

watch(showPodcastsChart, (show) => {
  if (show && stats.value) {
    // Wait for DOM to update before rendering
    nextTick(() => {
      setTimeout(() => {
        renderCharts();
      }, 100);
    });
  }
});

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  // Fetch stats immediately (admin token is handled by AdminLayout)
  fetchStats();
  
  // Set up resize observer to re-render charts when container size changes
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (stats.value) {
        renderCharts();
        renderWorldMap();
      }
    });
    
    // Observe all chart containers
    if (topPagesChart.value) resizeObserver.observe(topPagesChart.value);
    if (topPodcastsChart.value) resizeObserver.observe(topPodcastsChart.value);
    if (locationsChart.value) resizeObserver.observe(locationsChart.value);
    if (worldMap.value) resizeObserver.observe(worldMap.value);
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
});
</script>

<style scoped>
.stats-view {
  min-height: 100vh;
}
</style>

