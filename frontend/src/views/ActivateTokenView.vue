<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@/stores/settings';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const settings = useSettingsStore();

const loading = ref(true);
const success = ref(false);
const error = ref('');
const tokenInfo = ref<{
  token: string;
  email: string;
  requestLimit: number;
  message: string;
} | null>(null);

const backendBase = computed(() => {
  // In production we assume a reverse proxy and always use relative URLs.
  if ((import.meta as any)?.env?.PROD) return '';

  // In dev, allow overriding the backend URL (or fall back to local dev server).
  const v = (import.meta as any)?.env?.VITE_RAG_BACKEND_URL;
  const s = typeof v === 'string' ? v.trim() : '';
  return (s || 'http://127.0.0.1:7878').replace(/\/+$/, '');
});

const activateToken = async (activationCode: string) => {
  loading.value = true;
  error.value = '';
  
  console.log('Activating token with code:', activationCode);
  
  try {
    const url = backendBase.value 
      ? `${backendBase.value}/api/auth/activate/${activationCode}` 
      : `/api/auth/activate/${activationCode}`;
    
    console.log('Calling URL:', url);
    
    const res = await fetch(url);
    
    console.log('Response status:', res.status);
    
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    
    const data = await res.json();
    console.log('Response data:', data);
    
    tokenInfo.value = data;
    success.value = true;
    
    // Save token to settings
    settings.setRagAuthToken(data.token);
    
    // Auto-redirect to search after 2 seconds
    setTimeout(() => {
      goToSearch();
    }, 2000);
    
  } catch (e) {
    console.error('Activation error:', e);
    error.value = e instanceof Error ? e.message : String(e);
    success.value = false;
  } finally {
    loading.value = false;
  }
};

const goToSearch = () => {
  router.push('/search');
};

onMounted(() => {
  // Try to get code from route params first, then from query
  const activationCode = (route.params.code as string) || (route.query.code as string);
  
  console.log('ActivateTokenView mounted');
  console.log('Route params:', route.params);
  console.log('Route query:', route.query);
  console.log('Activation code:', activationCode);
  
  if (!activationCode) {
    error.value = t('activate.missingCode');
    loading.value = false;
    return;
  }
  
  activateToken(activationCode);
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
    <div class="max-w-md w-full">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8">
        <!-- Loading State -->
        <div v-if="loading" class="text-center">
          <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p class="mt-4 text-gray-600 dark:text-gray-400">
            {{ t('activate.activating') }}
          </p>
        </div>

        <!-- Success State -->
        <div v-else-if="success && tokenInfo" class="space-y-6">
          <div class="text-center">
            <div class="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
              <svg class="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {{ t('activate.successTitle') }}
            </h1>
            <p class="text-gray-600 dark:text-gray-400">
              {{ t('activate.successMessage') }}
            </p>
          </div>

          <div class="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 space-y-3">
            <div>
              <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {{ t('activate.email') }}
              </div>
              <div class="text-sm text-gray-900 dark:text-white font-medium mt-1">
                {{ tokenInfo.email }}
              </div>
            </div>
            
            <div>
              <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {{ t('activate.requestLimit') }}
              </div>
              <div class="text-sm text-gray-900 dark:text-white font-medium mt-1">
                {{ tokenInfo.requestLimit }} {{ t('activate.requests') }}
              </div>
            </div>

            <div>
              <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {{ t('activate.token') }}
              </div>
              <div class="text-xs text-gray-700 dark:text-gray-300 font-mono mt-1 break-all bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700">
                {{ tokenInfo.token }}
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <button
              @click="goToSearch"
              class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              {{ t('activate.startSearching') }}
            </button>
            <p class="text-xs text-center text-gray-500 dark:text-gray-400">
              {{ t('activate.autoRedirect') }}
            </p>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="space-y-6">
          <div class="text-center">
            <div class="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full mb-4">
              <svg class="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {{ t('activate.errorTitle') }}
            </h1>
            <p class="text-gray-600 dark:text-gray-400 mb-4">
              {{ t('activate.errorMessage') }}
            </p>
          </div>

          <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p class="text-sm text-red-700 dark:text-red-300">
              {{ error }}
            </p>
          </div>

          <div class="space-y-2">
            <button
              @click="router.push('/search')"
              class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              {{ t('activate.requestNew') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
