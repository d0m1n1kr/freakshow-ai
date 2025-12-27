import { createRouter, createWebHistory } from 'vue-router';
import TopicsView from '../views/TopicsView.vue';
import CategoriesView from '../views/CategoriesView.vue';
import SpeakersView from '../views/SpeakersView.vue';
import HeatmapView from '../views/HeatmapView.vue';
import ClusterHeatmapView from '../views/ClusterHeatmapView.vue';
import AboutView from '../views/AboutView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/categories'
    },
    {
      path: '/categories',
      name: 'categories',
      component: CategoriesView
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
      path: '/heatmap',
      name: 'heatmap',
      component: HeatmapView
    },
    {
      path: '/cluster-heatmap',
      name: 'cluster-heatmap',
      component: ClusterHeatmapView
    },
    {
      path: '/about',
      name: 'about',
      component: AboutView
    }
  ]
});

export default router;

