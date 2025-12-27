export interface TopicRiverData {
  generatedAt: string;
  description: string;
  statistics: {
    totalTopics?: number;
    totalCategories?: number; // For category river data
    totalDurationHours?: number;
    yearRange: {
      start: number;
      end: number;
    };
    years: number[];
    topicsByEpisodeCount: Array<{
      id: string;
      name: string;
      count: number;
    }>;
    topicsByDuration?: Array<{
      id: string;
      name: string;
      hours: number;
    }>;
  };
  topics: {
    [key: string]: {
      id: string;
      name: string;
      description: string;
      totalEpisodes: number;
      totalTopics?: number;
      clusterCount?: number; // For category river data
      topicCount?: number; // For category river data
      totalDurationMinutes?: number;
      totalDurationHours?: number;
      yearData: Array<{
        year: number;
        count: number;
        totalDurationMinutes?: number;
        totalDurationHours?: number;
        episodes: Array<{
          number: number;
          date: string;
          title: string;
          durationMinutes?: number;
        }>;
      }>;
    };
  };
}

export interface ProcessedTopicData {
  id: string;
  name: string;
  yearValues: Map<number, number>;
  totalDuration: number;
  color: string;
}

export interface SpeakerRiverData {
  generatedAt: string;
  description: string;
  statistics: {
    totalSpeakers: number;
    totalEpisodes: number;
    totalAppearances: number;
    totalDurationHours: number;
    yearRange: {
      start: number;
      end: number;
    };
    years: number[];
    topSpeakersByEpisodeCount: Array<{
      id: string;
      name: string;
      count: number;
    }>;
  };
  speakers: Array<{
    id: string;
    name: string;
    totalEpisodes: number;
    totalDurationHours: number;
    firstAppearance: number;
    lastAppearance: number;
    timeline: Array<{
      year: number;
      episodeCount: number;
      durationHours: number;
      episodes: number[];
    }>;
  }>;
}

export interface ProcessedSpeakerData {
  id: string;
  name: string;
  yearValues: Map<number, number>;
  totalAppearances: number;
  color: string;
}

export interface HeatmapData {
  generatedAt: string;
  description: string;
  statistics: {
    totalSpeakers: number;
    totalCategories?: number;
    totalClusters?: number;
    totalCombinations: number;
    topSpeakersByEpisodes: Array<{
      id: string;
      name: string;
      count: number;
    }>;
    topCategoriesByEpisodes?: Array<{
      id: string;
      name: string;
      count: number;
    }>;
    topClustersByEpisodes?: Array<{
      id: string;
      name: string;
      count: number;
    }>;
  };
  speakers: Array<{
    id: string;
    name: string;
    totalEpisodes: number;
    categories?: Array<{
      categoryId: string;
      categoryName: string;
      count: number;
      episodes: number[];
    }>;
    clusters?: Array<{
      clusterId: string;
      clusterName: string;
      count: number;
      episodes: number[];
    }>;
  }>;
  categories?: Array<{
    id: string;
    name: string;
    description: string;
    totalEpisodes: number;
    clusterCount: number;
    topicCount: number;
  }>;
  clusters?: Array<{
    id: string;
    name: string;
    totalEpisodes: number;
    topicCount: number;
  }>;
  matrix: Array<{
    speakerId?: string;
    speakerName?: string;     // For backward compatibility
    speaker1Name?: string;    // For Speaker × Speaker heatmap
    clusterId?: string;       // For Cluster × Cluster heatmap
    clusterName?: string;     // For backward compatibility
    cluster1Name?: string;    // For Cluster × Cluster heatmap
    values: Array<{
      categoryId?: string;
      categoryName?: string;
      clusterId?: string;
      clusterName?: string;
      speakerId?: string;      // For Speaker × Speaker heatmap
      speaker2Name?: string;   // For Speaker × Speaker heatmap
      cluster2Name?: string;   // For Cluster × Cluster heatmap
      count: number;
      episodes: number[];
    }>;
  }>;
}

