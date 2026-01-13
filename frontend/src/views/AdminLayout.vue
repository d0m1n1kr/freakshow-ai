<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()
const adminToken = ref('')
const isAuthenticated = ref(false)
const showTokenInput = ref(false)
const error = ref('')

// Load admin token from localStorage
onMounted(() => {
  const savedToken = localStorage.getItem('adminToken')
  if (savedToken) {
    adminToken.value = savedToken
    isAuthenticated.value = true
  } else {
    showTokenInput.value = true
  }
})

const saveAdminToken = () => {
  if (adminToken.value.trim()) {
    localStorage.setItem('adminToken', adminToken.value.trim())
    isAuthenticated.value = true
    showTokenInput.value = false
    error.value = ''
  } else {
    error.value = 'Bitte gib einen Admin-Token ein'
  }
}

const logout = () => {
  localStorage.removeItem('adminToken')
  adminToken.value = ''
  isAuthenticated.value = false
  showTokenInput.value = true
}

const navigateTo = (path: string) => {
  router.push(path)
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Header -->
    <header class="bg-white dark:bg-gray-800 shadow">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div class="flex justify-between items-center">
          <div>
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
              Admin Dashboard
            </h1>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Verwaltung und Statistiken
            </p>
          </div>
          <div class="flex gap-3">
            <button
              v-if="isAuthenticated"
              @click="logout"
              class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Logout
            </button>
            <button
              @click="router.push('/')"
              class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Zurück
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- Navigation -->
    <nav v-if="isAuthenticated" class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex space-x-8">
          <button
            @click="navigateTo('/admin/tokens')"
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
              route.path === '/admin/tokens' || route.path === '/admin'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            ]"
          >
            Token-Verwaltung
          </button>
          <button
            @click="navigateTo('/admin/stats')"
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
              route.path === '/admin/stats'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            ]"
          >
            Analytics & Statistiken
          </button>
        </div>
      </div>
    </nav>

    <!-- Token Input Modal -->
    <div
      v-if="showTokenInput"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    >
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">
          Admin-Authentifizierung
        </h2>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Bitte gib deinen Admin-Token ein, um fortzufahren.
        </p>
        <input
          v-model="adminToken"
          type="password"
          placeholder="Admin Token"
          class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg mb-4 dark:bg-gray-700 dark:text-white"
          @keyup.enter="saveAdminToken"
        />
        <div class="flex gap-3">
          <button
            @click="saveAdminToken"
            class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Anmelden
          </button>
          <button
            @click="router.push('/')"
            class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300"
          >
            Abbrechen
          </button>
        </div>
        <p v-if="error" class="mt-3 text-sm text-red-600">{{ error }}</p>
      </div>
    </div>

    <!-- Main Content -->
    <main v-if="isAuthenticated" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
/* Optional: Additional custom styles if needed */
</style>
