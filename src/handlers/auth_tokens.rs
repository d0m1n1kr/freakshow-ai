// Token-System API-Handlers
use anyhow::{anyhow, Result};
use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::auth::{AuthToken, TokenDatabase, TokenStats, TokenStatistics};
use crate::config::AppState;
use crate::email::EmailService;

// ==========================================
// Request/Response Types
// ==========================================

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestTokenRequest {
    pub email: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestTokenResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivateTokenResponse {
    pub token: String,
    pub email: String,
    pub request_limit: i64,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenInfoResponse {
    pub email: String,
    pub request_count: i64,
    pub request_limit: i64,
    pub remaining: i64,
    pub is_activated: bool,
    pub created_at: String,
    pub activated_at: Option<String>,
    pub last_used_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncreaseLimitRequest {
    pub amount: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncreaseLimitResponse {
    pub new_limit: i64,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListTokensResponse {
    pub tokens: Vec<TokenStats>,
    pub statistics: TokenStatistics,
}

// ==========================================
// Helper Functions
// ==========================================

fn extract_auth_token(headers: &HeaderMap) -> Option<String> {
    // Prefer explicit x-auth-token, but also accept Authorization: Bearer <token>
    if let Some(v) = headers.get("x-auth-token").and_then(|v| v.to_str().ok()) {
        let t = v.trim();
        if !t.is_empty() {
            return Some(t.to_string());
        }
    }

    if let Some(v) = headers.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()) {
        let s = v.trim();
        if let Some(rest) = s.strip_prefix("Bearer ").or_else(|| s.strip_prefix("bearer ")) {
            let t = rest.trim();
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
    }

    None
}

fn is_admin_auth_ok(state: &AppState, headers: &HeaderMap) -> bool {
    let Some(expected) = state.cfg.stats_auth_token.as_ref() else {
        tracing::warn!("Admin authentication failed: No statsAuthToken configured");
        return false; // Admin endpoints require statsAuthToken
    };
    let Some(got) = extract_auth_token(headers) else {
        tracing::warn!("Admin authentication failed: No Authorization header provided");
        return false;
    };
    let is_valid = got == *expected;
    if !is_valid {
        tracing::warn!("Admin authentication failed: Token mismatch");
    }
    is_valid
}

fn is_valid_email(email: &str) -> bool {
    // Basic email validation
    email.contains('@') 
        && email.contains('.') 
        && email.len() >= 5 
        && email.len() <= 254
        && !email.starts_with('@')
        && !email.ends_with('@')
}

// ==========================================
// Public API Endpoints
// ==========================================

/// POST /api/auth/request-token
/// Request a new API token
pub async fn request_token(
    State(state): State<AppState>,
    Json(req): Json<RequestTokenRequest>,
) -> impl IntoResponse {
    // Validate email
    if !is_valid_email(&req.email) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "Invalid email address"
            })),
        )
            .into_response();
    }

    // Check if token DB exists
    let Some(ref token_db) = state.token_db else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "error": "Token system not configured"
            })),
        )
            .into_response();
    };

    // Check if email service exists
    let Some(ref email_service) = state.email_service else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "error": "Email service not configured"
            })),
        )
            .into_response();
    };

    // Create token request (or reuse existing pending one)
    let default_limit = state.cfg.token_default_limit.unwrap_or(100);
    let expires_days = state.cfg.token_expire_days;

    match token_db
        .create_token_request(&req.email, default_limit, expires_days)
        .await
    {
        Ok((token, activation_code)) => {
            // Send activation email (await to know if it succeeded)
            match email_service
                .send_activation_email(&req.email, &activation_code)
                .await
            {
                Ok(_) => {
                    tracing::info!("Activation email sent successfully to: {}", req.email);
                    (
                        StatusCode::OK,
                        Json(RequestTokenResponse {
                            success: true,
                            message: "Activation email sent. Please check your inbox.".to_string(),
                        }),
                    )
                        .into_response()
                }
                Err(e) => {
                    tracing::error!("Failed to send activation email to {}: {}", req.email, e);
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({
                            "error": "Failed to send activation email. Please try again later."
                        })),
                    )
                        .into_response()
                }
            }
        }
        Err(e) => {
            tracing::error!("Failed to create token request: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Failed to create token request"
                })),
            )
                .into_response()
        }
    }
}

/// GET /api/auth/activate/:activation_code
/// Activate a token using the activation code from email
pub async fn activate_token(
    State(state): State<AppState>,
    Path(activation_code): Path<String>,
) -> impl IntoResponse {
    let Some(ref token_db) = state.token_db else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "error": "Token system not configured"
            })),
        )
            .into_response();
    };

    match token_db.activate_token(&activation_code).await {
        Ok(token_info) => {
            let was_already_activated = token_info.is_activated;
            
            (
                StatusCode::OK,
                Json(ActivateTokenResponse {
                    token: token_info.token.clone(),
                    email: token_info.email.clone(),
                    request_limit: token_info.request_limit,
                    message: if was_already_activated {
                        "This token was already activated. You can use it now.".to_string()
                    } else {
                        "Token activated successfully!".to_string()
                    },
                }),
            )
                .into_response()
        }
        Err(e) => {
            tracing::warn!("Token activation failed: {}", e);
            let error_msg = if e.to_string().contains("Invalid activation code") {
                "Invalid or expired activation code"
            } else {
                "Token activation failed"
            };

            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": error_msg
                })),
            )
                .into_response()
        }
    }
}

/// GET /api/auth/token-info
/// Get information about the current token
pub async fn token_info(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let Some(token) = extract_auth_token(&headers) else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({
                "error": "No token provided"
            })),
        )
            .into_response();
    };

    let Some(ref token_db) = state.token_db else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "error": "Token system not configured"
            })),
        )
            .into_response();
    };

    // Check if it's the config token (unlimited)
    if state.cfg.auth_token.as_ref().map(|t| t == &token).unwrap_or(false) {
        return (
            StatusCode::OK,
            Json(serde_json::json!({
                "email": "admin",
                "request_count": 0,
                "request_limit": -1,
                "remaining": -1,
                "is_activated": true,
                "is_unlimited": true,
                "created_at": null,
                "activated_at": null,
                "last_used_at": null
            })),
        )
            .into_response();
    }

    // Get user token info
    match token_db.get_token(&token).await {
        Ok(Some(token_info)) => (
            StatusCode::OK,
            Json(TokenInfoResponse {
                email: token_info.email,
                request_count: token_info.request_count,
                request_limit: token_info.request_limit,
                remaining: token_info.request_limit - token_info.request_count,
                is_activated: token_info.is_activated,
                created_at: token_info.created_at.to_rfc3339(),
                activated_at: token_info.activated_at.map(|dt| dt.to_rfc3339()),
                last_used_at: token_info.last_used_at.map(|dt| dt.to_rfc3339()),
            }),
        )
            .into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "error": "Token not found"
            })),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("Failed to get token info: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Failed to get token info"
                })),
            )
                .into_response()
        }
    }
}

// ==========================================
// Admin API Endpoints (protected with statsAuthToken)
// ==========================================

/// GET /api/admin/tokens
/// List all tokens (admin only)
pub async fn list_tokens(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if !is_admin_auth_ok(&state, &headers) {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({
                "error": "Admin authentication required"
            })),
        )
            .into_response();
    }

    let Some(ref token_db) = state.token_db else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "error": "Token system not configured"
            })),
        )
            .into_response();
    };

    match tokio::try_join!(token_db.list_tokens(), token_db.get_statistics()) {
        Ok((tokens, statistics)) => (
            StatusCode::OK,
            Json(ListTokensResponse {
                tokens,
                statistics,
            }),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("Failed to list tokens: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Failed to list tokens"
                })),
            )
                .into_response()
        }
    }
}

/// POST /api/admin/tokens/:token/increase-limit
/// Increase the request limit for a token (admin only)
pub async fn increase_token_limit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(token): Path<String>,
    Json(req): Json<IncreaseLimitRequest>,
) -> impl IntoResponse {
    if !is_admin_auth_ok(&state, &headers) {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({
                "error": "Admin authentication required"
            })),
        )
            .into_response();
    }

    if req.amount <= 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "Amount must be positive"
            })),
        )
            .into_response();
    }

    let Some(ref token_db) = state.token_db else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "error": "Token system not configured"
            })),
        )
            .into_response();
    };

    match token_db.increase_limit(&token, req.amount).await {
        Ok(new_limit) => (
            StatusCode::OK,
            Json(IncreaseLimitResponse {
                new_limit,
                message: format!("Limit increased by {} to {}", req.amount, new_limit),
            }),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("Failed to increase limit: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Failed to increase limit"
                })),
            )
                .into_response()
        }
    }
}

/// DELETE /api/admin/tokens/:token
/// Delete a token (admin only)
pub async fn delete_token(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(token): Path<String>,
) -> impl IntoResponse {
    if !is_admin_auth_ok(&state, &headers) {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({
                "error": "Admin authentication required"
            })),
        )
            .into_response();
    }

    let Some(ref token_db) = state.token_db else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "error": "Token system not configured"
            })),
        )
            .into_response();
    };

    match token_db.delete_token(&token).await {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "Token deleted successfully"
            })),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("Failed to delete token: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Failed to delete token"
                })),
            )
                .into_response()
        }
    }
}
