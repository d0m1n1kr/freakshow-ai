// LanceDB integration
pub mod lance;

// Simple Rust unit tests for mathematical functions
#[cfg(test)]
mod tests {
    /// Test basic distance calculation
    #[test]
    fn test_cosine_distance_identical_vectors() {
        // Cosine distance between identical vectors should be 0
        let v1 = vec![1.0, 0.0, 0.0];
        let v2 = vec![1.0, 0.0, 0.0];
        
        // Calculate cosine similarity manually
        let dot_product: f64 = v1.iter().zip(&v2).map(|(a, b)| a * b).sum();
        let magnitude1: f64 = v1.iter().map(|x| x * x).sum::<f64>().sqrt();
        let magnitude2: f64 = v2.iter().map(|x| x * x).sum::<f64>().sqrt();
        let cosine_similarity = dot_product / (magnitude1 * magnitude2);
        let distance = 1.0 - cosine_similarity;
        
        assert!(
            (distance - 0.0).abs() < 1e-10,
            "Identical vectors should have distance 0"
        );
    }

    #[test]
    fn test_cosine_distance_orthogonal_vectors() {
        // Cosine distance between orthogonal vectors should be 1
        let v1 = vec![1.0, 0.0, 0.0];
        let v2 = vec![0.0, 1.0, 0.0];
        
        let dot_product: f64 = v1.iter().zip(&v2).map(|(a, b)| a * b).sum();
        let magnitude1: f64 = v1.iter().map(|x| x * x).sum::<f64>().sqrt();
        let magnitude2: f64 = v2.iter().map(|x| x * x).sum::<f64>().sqrt();
        let cosine_similarity = dot_product / (magnitude1 * magnitude2);
        let distance = 1.0 - cosine_similarity;
        
        assert!(
            (distance - 1.0).abs() < 1e-10,
            "Orthogonal vectors should have distance 1"
        );
    }

    #[test]
    fn test_weighted_average() {
        // Test weighted average calculation
        let values = vec![10.0, 20.0, 30.0];
        let weights = vec![1.0, 2.0, 1.0];
        
        let weighted_sum: f64 = values
            .iter()
            .zip(&weights)
            .map(|(v, w)| v * w)
            .sum();
        let weight_sum: f64 = weights.iter().sum();
        let weighted_avg = weighted_sum / weight_sum;
        
        assert_eq!(weighted_avg, 20.0, "Weighted average should be 20.0");
    }

    #[test]
    fn test_vector_normalization() {
        // Test that normalization produces unit vector
        let v = vec![3.0, 4.0];
        let magnitude: f64 = v.iter().map(|x| x * x).sum::<f64>().sqrt();
        let normalized: Vec<f64> = v.iter().map(|x| x / magnitude).collect();
        
        let new_magnitude: f64 = normalized.iter().map(|x| x * x).sum::<f64>().sqrt();
        
        assert!(
            (new_magnitude - 1.0).abs() < 1e-10,
            "Normalized vector should have magnitude 1"
        );
    }

    #[test]
    fn test_vector_operations() {
        // Test basic vector operations
        let v1 = vec![1.0, 2.0, 3.0];
        let v2 = vec![4.0, 5.0, 6.0];
        
        // Element-wise addition
        let sum: Vec<f64> = v1.iter().zip(&v2).map(|(a, b)| a + b).collect();
        assert_eq!(sum, vec![5.0, 7.0, 9.0]);
        
        // Dot product
        let dot: f64 = v1.iter().zip(&v2).map(|(a, b)| a * b).sum();
        assert_eq!(dot, 32.0); // 1*4 + 2*5 + 3*6 = 32
    }

    #[test]
    fn test_euclidean_distance() {
        // Test Euclidean distance calculation
        let v1 = vec![0.0_f64, 0.0_f64];
        let v2 = vec![3.0_f64, 4.0_f64];
        
        let squared_diff: f64 = v1.iter()
            .zip(&v2)
            .map(|(a, b)| (a - b).powi(2))
            .sum();
        let distance = squared_diff.sqrt();
        
        assert_eq!(distance, 5.0, "Distance should be 5 (3-4-5 triangle)");
    }

    #[test]
    fn test_vector_scaling() {
        // Test vector scaling
        let v = vec![1.0, 2.0, 3.0];
        let scale = 2.5;
        
        let scaled: Vec<f64> = v.iter().map(|x| x * scale).collect();
        
        assert_eq!(scaled, vec![2.5, 5.0, 7.5]);
    }

    #[test]
    fn test_vector_subtraction() {
        // Test vector subtraction
        let v1 = vec![5.0, 7.0, 9.0];
        let v2 = vec![2.0, 3.0, 4.0];
        
        let diff: Vec<f64> = v1.iter().zip(&v2).map(|(a, b)| a - b).collect();
        
        assert_eq!(diff, vec![3.0, 4.0, 5.0]);
    }

    #[test]
    fn test_manhattan_distance() {
        // Test Manhattan distance (L1 norm)
        let v1 = vec![1.0_f64, 2.0_f64, 3.0_f64];
        let v2 = vec![4.0_f64, 6.0_f64, 8.0_f64];
        
        let manhattan: f64 = v1.iter()
            .zip(&v2)
            .map(|(a, b)| (a - b).abs())
            .sum();
        
        assert_eq!(manhattan, 12.0); // |1-4| + |2-6| + |3-8| = 3 + 4 + 5 = 12
    }

    #[test]
    fn test_zero_vector_handling() {
        // Test handling of zero vectors
        let zero = vec![0.0, 0.0, 0.0];
        let magnitude: f64 = zero.iter().map(|x| x * x).sum::<f64>().sqrt();
        
        assert_eq!(magnitude, 0.0, "Zero vector should have magnitude 0");
    }

    #[test]
    fn test_vector_min_max() {
        // Test finding min and max in vector
        let v = vec![3.5, 1.2, 7.8, 2.1, 9.3, 4.6];
        
        let min = v.iter().cloned().fold(f64::INFINITY, f64::min);
        let max = v.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        
        assert_eq!(min, 1.2);
        assert_eq!(max, 9.3);
    }

    #[test]
    fn test_vector_mean() {
        // Test mean calculation
        let v = vec![10.0, 20.0, 30.0, 40.0, 50.0];
        let mean: f64 = v.iter().sum::<f64>() / v.len() as f64;
        
        assert_eq!(mean, 30.0);
    }

    #[test]
    fn test_vector_variance() {
        // Test variance calculation
        let v = vec![2.0, 4.0, 6.0, 8.0, 10.0];
        let mean: f64 = v.iter().sum::<f64>() / v.len() as f64;
        let variance: f64 = v.iter()
            .map(|x| (x - mean).powi(2))
            .sum::<f64>() / v.len() as f64;
        
        assert_eq!(variance, 8.0);
    }

    #[test]
    fn test_large_vectors() {
        // Test with larger vectors (performance check)
        let size = 1000;
        let v1: Vec<f64> = (0..size).map(|i| i as f64).collect();
        let v2: Vec<f64> = (0..size).map(|i| (i * 2) as f64).collect();
        
        let dot: f64 = v1.iter().zip(&v2).map(|(a, b)| a * b).sum();
        
        // Sum of i * (2*i) for i=0..999 = 2 * sum(i^2)
        // sum(i^2) = n(n+1)(2n+1)/6
        let n = size - 1; // 0 to 999
        let expected = 2.0 * (n as f64 * (n + 1) as f64 * (2 * n + 1) as f64) / 6.0;
        
        assert!((dot - expected).abs() < 100.0, "Large vector dot product should be accurate, got {} expected {}", dot, expected);
    }

    #[test]
    fn test_parallel_addition() {
        // Test element-wise parallel operations
        let v1 = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let v2 = vec![5.0, 4.0, 3.0, 2.0, 1.0];
        
        let result: Vec<f64> = v1.iter()
            .zip(&v2)
            .map(|(a, b)| a + b)
            .collect();
        
        assert_eq!(result, vec![6.0, 6.0, 6.0, 6.0, 6.0]);
    }
}

