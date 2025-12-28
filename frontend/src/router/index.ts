import { createRouter, createWebHistory } from 'vue-router';
import TopicsView from '../views/TopicsView.vue';
import SpeakersView from '../views/SpeakersView.vue';
import ClusterHeatmapView from '../views/ClusterHeatmapView.vue';
import SpeakerSpeakerHeatmapView from '../views/SpeakerSpeakerHeatmapView.vue';
import ClusterClusterHeatmapView from '../views/ClusterClusterHeatmapView.vue';
import DurationHeatmapView from '../views/DurationHeatmapView.vue';
import UmapView from '../views/UmapView.vue';
import AboutView from '../views/AboutView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/topics'
    },
    {
      path: '/topics',
      name: 'topics',
      component: TopicsView
    },
    {
      path: '/speakers',
      name: 'speakers',
      component: SpeakersView
    },
    {
      path: '/cluster-heatmap',
      name: 'cluster-heatmap',
      component: ClusterHeatmapView
    },
    {
      path: '/speaker-speaker-heatmap',
      name: 'speaker-speaker-heatmap',
      component: SpeakerSpeakerHeatmapView
    },
    {
      path: '/cluster-cluster-heatmap',
      name: 'cluster-cluster-heatmap',
      component: ClusterClusterHeatmapView
    },
    {
      path: '/duration-heatmap',
      name: 'duration-heatmap',
      component: DurationHeatmapView
    },
    {
      path: '/umap',
      name: 'umap',
      component: UmapView
    },
    {
      path: '/about',
      name: 'about',
      component: AboutView
    }
  ]
});

export default router;

