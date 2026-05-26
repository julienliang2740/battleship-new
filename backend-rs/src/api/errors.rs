use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApiErrorCode {
    BadRequest,
    NotFound,
    WrongPhase,
    NotYourTurn,
    InvalidPlace,
    InvalidAction,
    NoQuota,
    InvalidTarget,
    GameOver,
    Internal,
}

impl ApiErrorCode {
    pub fn status(self) -> StatusCode {
        match self {
            ApiErrorCode::BadRequest => StatusCode::BAD_REQUEST,
            ApiErrorCode::NotFound => StatusCode::NOT_FOUND,
            ApiErrorCode::WrongPhase => StatusCode::CONFLICT,
            ApiErrorCode::NotYourTurn => StatusCode::CONFLICT,
            ApiErrorCode::InvalidPlace => StatusCode::UNPROCESSABLE_ENTITY,
            ApiErrorCode::InvalidAction => StatusCode::UNPROCESSABLE_ENTITY,
            ApiErrorCode::NoQuota => StatusCode::UNPROCESSABLE_ENTITY,
            ApiErrorCode::InvalidTarget => StatusCode::UNPROCESSABLE_ENTITY,
            ApiErrorCode::GameOver => StatusCode::CONFLICT,
            ApiErrorCode::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            ApiErrorCode::BadRequest => "BAD_REQUEST",
            ApiErrorCode::NotFound => "NOT_FOUND",
            ApiErrorCode::WrongPhase => "WRONG_PHASE",
            ApiErrorCode::NotYourTurn => "NOT_YOUR_TURN",
            ApiErrorCode::InvalidPlace => "INVALID_PLACE",
            ApiErrorCode::InvalidAction => "INVALID_ACTION",
            ApiErrorCode::NoQuota => "NO_QUOTA",
            ApiErrorCode::InvalidTarget => "INVALID_TARGET",
            ApiErrorCode::GameOver => "GAME_OVER",
            ApiErrorCode::Internal => "INTERNAL",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ApiError {
    pub code: ApiErrorCode,
    pub message: String,
}

impl ApiError {
    pub fn new(code: ApiErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code.as_str(), self.message)
    }
}

impl std::error::Error for ApiError {}

#[derive(Serialize)]
struct ErrorBody<'a> {
    error: ErrorPayload<'a>,
}

#[derive(Serialize)]
struct ErrorPayload<'a> {
    code: &'a str,
    message: &'a str,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = ErrorBody {
            error: ErrorPayload {
                code: self.code.as_str(),
                message: &self.message,
            },
        };
        (self.code.status(), Json(body)).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
