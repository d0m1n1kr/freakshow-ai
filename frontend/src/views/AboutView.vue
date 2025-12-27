<script setup lang="ts">
</script>

<template>
  <div class="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
    <div class="p-6 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50">
      <h2 class="text-2xl font-bold text-gray-900 mb-2">Über diese Visualisierung</h2>
      <p class="text-gray-600">Technologien und Werkzeuge hinter der Freak Show River Visualisierung</p>
    </div>

    <div class="p-8 space-y-8">
      <!-- Project Description -->
      <section>
        <h3 class="text-xl font-semibold text-gray-900 mb-3">📊 Projekt-Beschreibung</h3>
        <p class="text-gray-700 leading-relaxed">
          Diese interaktive Visualisierung analysiert und visualisiert die Themen und Sprecher des 
          <strong>Freak Show Podcasts</strong> über die Jahre. Durch KI-gestützte Textanalyse und 
          Clustering-Algorithmen werden Themen gruppiert und deren zeitliche Entwicklung in 
          River-Diagrammen dargestellt.
        </p>
      </section>

      <!-- Frontend Technologies -->
      <section>
        <h3 class="text-xl font-semibold text-gray-900 mb-4">🎨 Frontend-Technologien</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
            <h4 class="font-semibold text-green-900 mb-2">Vue.js 3.5</h4>
            <p class="text-sm text-gray-700">Progressive JavaScript Framework für die reaktive Benutzeroberfläche</p>
          </div>
          
          <div class="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg border border-blue-200">
            <h4 class="font-semibold text-blue-900 mb-2">TypeScript 5.9</h4>
            <p class="text-sm text-gray-700">Typsichere Programmierung für robusteren Code</p>
          </div>
          
          <div class="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
            <h4 class="font-semibold text-purple-900 mb-2">D3.js 7.9</h4>
            <p class="text-sm text-gray-700">Datenvisualisierungs-Bibliothek für die interaktiven River-Diagramme</p>
          </div>
          
          <div class="p-4 bg-gradient-to-r from-sky-50 to-blue-50 rounded-lg border border-sky-200">
            <h4 class="font-semibold text-sky-900 mb-2">Tailwind CSS 4.1</h4>
            <p class="text-sm text-gray-700">Utility-First CSS Framework für modernes Design</p>
          </div>
          
          <div class="p-4 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-lg border border-amber-200">
            <h4 class="font-semibold text-amber-900 mb-2">Pinia 3.0</h4>
            <p class="text-sm text-gray-700">State Management mit LocalStorage-Persistenz</p>
          </div>
          
          <div class="p-4 bg-gradient-to-r from-indigo-50 to-violet-50 rounded-lg border border-indigo-200">
            <h4 class="font-semibold text-indigo-900 mb-2">Vue Router 4.6</h4>
            <p class="text-sm text-gray-700">Single-Page-Application Routing</p>
          </div>
          
          <div class="p-4 bg-gradient-to-r from-orange-50 to-red-50 rounded-lg border border-orange-200">
            <h4 class="font-semibold text-orange-900 mb-2">Vite 7.2</h4>
            <p class="text-sm text-gray-700">Schneller Build-Tool und Development-Server</p>
          </div>
        </div>
      </section>

      <!-- Backend Technologies -->
      <section>
        <h3 class="text-xl font-semibold text-gray-900 mb-4">⚙️ Backend & Datenverarbeitung</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="p-4 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-200">
            <h4 class="font-semibold text-orange-900 mb-2">Rust 2021 Edition</h4>
            <p class="text-sm text-gray-700">Hochperformante Clustering-Algorithmen für Topic-Analyse</p>
          </div>
          
          <div class="p-4 bg-gradient-to-r from-green-50 to-lime-50 rounded-lg border border-green-200">
            <h4 class="font-semibold text-green-900 mb-2">Node.js</h4>
            <p class="text-sm text-gray-700">Daten-Aggregation und JSON-Generierung</p>
          </div>
          
          <div class="p-4 bg-gradient-to-r from-red-50 to-pink-50 rounded-lg border border-red-200">
            <h4 class="font-semibold text-red-900 mb-2">Rayon</h4>
            <p class="text-sm text-gray-700">Parallele Verarbeitung in Rust für schnelleres Clustering</p>
          </div>
          
          <div class="p-4 bg-gradient-to-r from-cyan-50 to-teal-50 rounded-lg border border-cyan-200">
            <h4 class="font-semibold text-cyan-900 mb-2">Serde JSON</h4>
            <p class="text-sm text-gray-700">Serialisierung und Deserialisierung von Episode-Daten</p>
          </div>
        </div>
      </section>

      <!-- AI & Machine Learning -->
      <section>
        <h3 class="text-xl font-semibold text-gray-900 mb-4">🤖 KI & Machine Learning</h3>
        <div class="space-y-4">
          <div class="p-5 bg-gradient-to-r from-violet-50 to-purple-50 rounded-lg border border-violet-200">
            <h4 class="font-semibold text-violet-900 mb-2 flex items-center gap-2">
              <span>OpenAI text-embedding-3-small</span>
              <span class="text-xs bg-violet-200 text-violet-800 px-2 py-0.5 rounded-full">Embedding-Modell</span>
            </h4>
            <p class="text-sm text-gray-700 mb-2">
              Generierung von semantischen Embeddings für alle Podcast-Themen. 
              Ermöglicht bedeutungsbasiertes Clustering statt nur Keyword-Matching.
            </p>
            <ul class="text-xs text-gray-600 list-disc list-inside space-y-1">
              <li>1536-dimensionale Vektoren</li>
              <li>Semantische Ähnlichkeitsberechnung</li>
              <li>Sprachübergreifendes Verständnis</li>
            </ul>
          </div>
          
          <div class="p-5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
            <h4 class="font-semibold text-blue-900 mb-2 flex items-center gap-2">
              <span>Hierarchisches Clustering</span>
              <span class="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">Algorithmus</span>
            </h4>
            <p class="text-sm text-gray-700 mb-2">
              Automatische Gruppierung ähnlicher Themen basierend auf Kosinus-Ähnlichkeit der Embeddings.
            </p>
            <ul class="text-xs text-gray-600 list-disc list-inside space-y-1">
              <li>Agglomerative Clustering mit Average-Linkage</li>
              <li>Dynamische Schwellwert-Bestimmung</li>
              <li>Automatische Cluster-Benennung</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Data Processing Pipeline -->
      <section>
        <h3 class="text-xl font-semibold text-gray-900 mb-4">🔄 Datenverarbeitungs-Pipeline</h3>
        <div class="bg-gray-50 rounded-lg p-6 border border-gray-200">
          <ol class="space-y-4">
            <li class="flex gap-4">
              <span class="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-sm">1</span>
              <div>
                <h5 class="font-semibold text-gray-900">Episode-Daten Extraktion</h5>
                <p class="text-sm text-gray-600">Laden von Episode-Metadaten und Themen aus JSON-Dateien</p>
              </div>
            </li>
            <li class="flex gap-4">
              <span class="flex-shrink-0 w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold text-sm">2</span>
              <div>
                <h5 class="font-semibold text-gray-900">Embedding-Generierung</h5>
                <p class="text-sm text-gray-600">OpenAI API erstellt semantische Vektoren für jedes Thema</p>
              </div>
            </li>
            <li class="flex gap-4">
              <span class="flex-shrink-0 w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center font-bold text-sm">3</span>
              <div>
                <h5 class="font-semibold text-gray-900">Clustering-Analyse</h5>
                <p class="text-sm text-gray-600">Rust-basiertes hierarchisches Clustering gruppiert ähnliche Themen</p>
              </div>
            </li>
            <li class="flex gap-4">
              <span class="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold text-sm">4</span>
              <div>
                <h5 class="font-semibold text-gray-900">Kategorisierung</h5>
                <p class="text-sm text-gray-600">Übergeordnete Kategorien fassen verwandte Cluster zusammen</p>
              </div>
            </li>
            <li class="flex gap-4">
              <span class="flex-shrink-0 w-8 h-8 bg-cyan-500 text-white rounded-full flex items-center justify-center font-bold text-sm">5</span>
              <div>
                <h5 class="font-semibold text-gray-900">Zeitreihen-Aggregation</h5>
                <p class="text-sm text-gray-600">Node.js aggregiert Daten nach Jahren für River-Visualisierung</p>
              </div>
            </li>
            <li class="flex gap-4">
              <span class="flex-shrink-0 w-8 h-8 bg-pink-500 text-white rounded-full flex items-center justify-center font-bold text-sm">6</span>
              <div>
                <h5 class="font-semibold text-gray-900">Interactive Visualisierung</h5>
                <p class="text-sm text-gray-600">D3.js rendert die Daten als interaktive Stream-Graphen</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <!-- Features -->
      <section>
        <h3 class="text-xl font-semibold text-gray-900 mb-4">✨ Features</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
            <span class="text-2xl">🎯</span>
            <div>
              <h5 class="font-semibold text-gray-900 text-sm">Interaktive Tooltips</h5>
              <p class="text-xs text-gray-600">Jahr-spezifische Informationen beim Hovern</p>
            </div>
          </div>
          <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
            <span class="text-2xl">🔍</span>
            <div>
              <h5 class="font-semibold text-gray-900 text-sm">Jahr-Filter</h5>
              <p class="text-xs text-gray-600">Klick-basierte Filterung nach Jahren</p>
            </div>
          </div>
          <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
            <span class="text-2xl">📊</span>
            <div>
              <h5 class="font-semibold text-gray-900 text-sm">Normierte Ansicht</h5>
              <p class="text-xs text-gray-600">Persistente Einstellung für prozentuale Darstellung</p>
            </div>
          </div>
          <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
            <span class="text-2xl">🔗</span>
            <div>
              <h5 class="font-semibold text-gray-900 text-sm">Deep-Linking</h5>
              <p class="text-xs text-gray-600">Direkte URLs für jede Ansicht</p>
            </div>
          </div>
          <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
            <span class="text-2xl">📱</span>
            <div>
              <h5 class="font-semibold text-gray-900 text-sm">Responsive Design</h5>
              <p class="text-xs text-gray-600">Optimiert für Desktop und Tablet</p>
            </div>
          </div>
          <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
            <span class="text-2xl">💾</span>
            <div>
              <h5 class="font-semibold text-gray-900 text-sm">LocalStorage</h5>
              <p class="text-xs text-gray-600">Einstellungen bleiben über Sitzungen erhalten</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Open Source -->
      <section class="border-t pt-6">
        <div class="text-center text-gray-600">
          <p class="text-sm">
            Erstellt mit ❤️ für den <strong>Freak Show Podcast</strong>
          </p>
          <p class="text-xs mt-2 text-gray-500">
            © 2025 • Alle Daten basieren auf öffentlich verfügbaren Podcast-Informationen
          </p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Zusätzliche Styles falls nötig */
</style>

