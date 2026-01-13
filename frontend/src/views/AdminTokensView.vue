<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'

interface TokenInfo {
  id: number
  token: string
  email: string
  is_activated: boolean
  request_count: number
  request_limit: number
  created_at: string
  activated_at: string | null
  last_used_at: string | null
  expires_at: string | null
  notes: string | null
}

const tokens = ref<TokenInfo[]>([])
const loading = ref(true)
const error = ref('')

// Increase limit state
const increasingLimit = ref<string | null>(null)
const increaseAmount = ref<number>(100)

// Delete confirmation state
const deletingToken = ref<string | null>(null)
const confirmDelete = ref('')

const backendBase = computed(() => {
  // In production we assume a reverse proxy and always use relative URLs.
  if ((import.meta as any)?.env?.PROD) return '';

  // In dev, allow overriding the backend URL (or fall back to local dev server).
  const v = (import.meta as any)?.env?.VITE_RAG_BACKEND_URL;
  const s = typeof v === 'string' ? v.trim() : '';
  return (s || 'http://127.0.0.1:7878').replace(/\/+$/, '');
})

// Load admin token from localStorage
const adminToken = computed(() => {
  return localStorage.getItem('adminToken') || ''
})

onMounted(() => {
  loadTokens()
})

const loadTokens = async () => {
  loading.value = true
  error.value = ''
  
  try {
    const url = backendBase.value 
      ? `${backendBase.value}/api/admin/tokens` 
      : '/api/admin/tokens';
    
    console.log('[AdminTokens] Loading tokens from:', url)
    console.log('[AdminTokens] Using admin token:', adminToken.value.substring(0, 10) + '...')
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${adminToken.value}`
      }
    })
    
    console.log('[AdminTokens] Response status:', response.status)
    
    if (response.status === 401 || response.status === 403) {
      error.value = 'Ungültiger Admin-Token. Bitte logge dich erneut ein.'
      // Remove invalid token - AdminLayout will show login modal on next request
      localStorage.removeItem('adminToken')
      // Reload page to trigger AdminLayout login modal
      setTimeout(() => {
        window.location.reload()
      }, 1500)
      return
    }
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[AdminTokens] Error response:', errorText)
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }
    
    const data = await response.json()
    console.log('[AdminTokens] Received data:', data)
    tokens.value = data.tokens || []
  } catch (err) {
    console.error('[AdminTokens] Failed to load tokens:', err)
    error.value = `Fehler beim Laden der Tokens: ${err}`
  } finally {
    loading.value = false
  }
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('de-DE')
}

const startIncreaseLimit = (token: string) => {
  increasingLimit.value = token
  increaseAmount.value = 100
}

const cancelIncreaseLimit = () => {
  increasingLimit.value = null
  increaseAmount.value = 100
}

const confirmIncreaseLimit = async (token: string) => {
  if (increaseAmount.value <= 0) {
    alert('Bitte gib eine positive Zahl ein')
    return
  }
  
  try {
    const url = backendBase.value 
      ? `${backendBase.value}/api/admin/tokens/${encodeURIComponent(token)}/increase-limit`
      : `/api/admin/tokens/${encodeURIComponent(token)}/increase-limit`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken.value}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          increase_by: increaseAmount.value
        })
      }
    )
    
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || `HTTP ${response.status}`)
    }
    
    // Reload tokens
    await loadTokens()
    increasingLimit.value = null
  } catch (err) {
    console.error('Failed to increase limit:', err)
    alert(`Fehler: ${err}`)
  }
}

const startDeleteToken = (token: string) => {
  deletingToken.value = token
  confirmDelete.value = ''
}

const cancelDeleteToken = () => {
  deletingToken.value = null
  confirmDelete.value = ''
}

const confirmDeleteToken = async (token: string) => {
  if (confirmDelete.value !== 'DELETE') {
    alert('Bitte tippe "DELETE" zur Bestätigung')
    return
  }
  
  try {
    const url = backendBase.value 
      ? `${backendBase.value}/api/admin/tokens/${encodeURIComponent(token)}`
      : `/api/admin/tokens/${encodeURIComponent(token)}`;
    
    const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${adminToken.value}`
        }
      }
    )
    
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || `HTTP ${response.status}`)
    }
    
    // Reload tokens
    await loadTokens()
    deletingToken.value = null
  } catch (err) {
    console.error('Failed to delete token:', err)
    alert(`Fehler: ${err}`)
  }
}

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text)
  // Could show a toast notification here
}

const getUsagePercent = (count: number, limit: number) => {
  return Math.round((count / limit) * 100)
}

const getUsageColor = (percent: number) => {
  if (percent >= 90) return 'text-red-600'
  if (percent >= 70) return 'text-orange-600'
  return 'text-green-600'
}
</script>

<template>
  <div>
    <!-- Header Section -->
    <div class="mb-6 flex justify-between items-center">
      <div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
          Token-Verwaltung
        </h2>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Übersicht und Verwaltung aller API-Tokens
        </p>
      </div>
      <button
        @click="loadTokens"
        :disabled="loading"
        class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ loading ? 'Lädt...' : 'Aktualisieren' }}
      </button>
    </div>

    <!-- Error Message -->
    <div
      v-if="error"
      class="mb-6 p-4 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg"
    >
      {{ error }}
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-12">
      <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      <p class="mt-4 text-gray-600 dark:text-gray-400">Lade Tokens...</p>
    </div>

    <!-- Tokens List -->
    <div v-else-if="!loading" class="space-y-4">
        <div v-if="tokens.length === 0" class="text-center py-12 text-gray-500 dark:text-gray-400">
          Keine Tokens vorhanden
        </div>

        <div
          v-for="token in tokens"
          :key="token.token"
          class="bg-white dark:bg-gray-800 rounded-lg shadow p-6"
        >
          <!-- Token Header -->
          <div class="flex justify-between items-start mb-4">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                  {{ token.email }}
                </h3>
                <span
                  v-if="token.is_activated"
                  class="px-2 py-1 text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded"
                >
                  Aktiviert
                </span>
                <span
                  v-else
                  class="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded"
                >
                  Nicht aktiviert
                </span>
              </div>
              <div class="flex items-center gap-2">
                <code class="text-sm text-gray-600 dark:text-gray-400 font-mono">
                  {{ token.token.substring(0, 20) }}...
                </code>
                <button
                  @click="copyToClipboard(token.token)"
                  class="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
                  title="Token kopieren"
                >
                  📋
                </button>
              </div>
            </div>
          </div>

          <!-- Token Stats -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400">Requests</p>
              <p
                class="text-lg font-semibold"
                :class="getUsageColor(getUsagePercent(token.request_count, token.request_limit))"
              >
                {{ token.request_count }} / {{ token.request_limit }}
                <span class="text-sm">
                  ({{ getUsagePercent(token.request_count, token.request_limit) }}%)
                </span>
              </p>
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400">Erstellt</p>
              <p class="text-sm text-gray-900 dark:text-white">
                {{ formatDate(token.created_at) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400">Aktiviert</p>
              <p class="text-sm text-gray-900 dark:text-white">
                {{ formatDate(token.activated_at) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400">Zuletzt genutzt</p>
              <p class="text-sm text-gray-900 dark:text-white">
                {{ formatDate(token.last_used_at) }}
              </p>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="mb-4">
            <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full transition-all"
                :class="{
                  'bg-green-500': getUsagePercent(token.request_count, token.request_limit) < 70,
                  'bg-orange-500': getUsagePercent(token.request_count, token.request_limit) >= 70 && getUsagePercent(token.request_count, token.request_limit) < 90,
                  'bg-red-500': getUsagePercent(token.request_count, token.request_limit) >= 90
                }"
                :style="{ width: `${Math.min(getUsagePercent(token.request_count, token.request_limit), 100)}%` }"
              ></div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex gap-3">
            <!-- Increase Limit -->
            <div v-if="increasingLimit === token.token" class="flex-1 flex gap-2">
              <input
                v-model.number="increaseAmount"
                type="number"
                min="1"
                placeholder="Anzahl"
                class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-white"
              />
              <button
                @click="confirmIncreaseLimit(token.token)"
                class="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
              >
                Bestätigen
              </button>
              <button
                @click="cancelIncreaseLimit"
                class="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white text-sm rounded-lg hover:bg-gray-400"
              >
                Abbrechen
              </button>
            </div>
            <button
              v-else
              @click="startIncreaseLimit(token.token)"
              class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
              Limit erhöhen
            </button>

            <!-- Delete Token -->
            <div v-if="deletingToken === token.token" class="flex-1 flex gap-2">
              <input
                v-model="confirmDelete"
                type="text"
                placeholder='Tippe "DELETE"'
                class="flex-1 px-3 py-2 border border-red-300 dark:border-red-600 rounded-lg text-sm dark:bg-gray-700 dark:text-white"
              />
              <button
                @click="confirmDeleteToken(token.token)"
                class="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
              >
                Löschen
              </button>
              <button
                @click="cancelDeleteToken"
                class="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white text-sm rounded-lg hover:bg-gray-400"
              >
                Abbrechen
              </button>
            </div>
            <button
              v-else
              @click="startDeleteToken(token.token)"
              class="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
            >
              Löschen
            </button>
          </div>
        </div>
      </div>
  </div>
</template>

<style scoped>
/* Optional: Additional custom styles if needed */
</style>
