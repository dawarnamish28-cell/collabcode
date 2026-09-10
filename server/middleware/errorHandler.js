/**
 * Error Handling Middleware
 * 
 * Centralized error handling for Express routes.
 * Provides consistent error response format and logging.
 */

// Custom application error class
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 404 Not Found handler
function notFoundHandler(req, res, next) {
  const error = new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND');
  next(error);
}

// Global error handler
function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Log error details
  if (statusCode >= 500) {
    console.error(`[ERROR] ${err.code || 'INTERNAL'}: ${err.message}`);
    if (!isProduction) {
      console.error(err.stack);
    }
  } else {
    console.warn(`[WARN] ${statusCode}: ${err.message}`);
  }

  // Send error response
  const response = {
    error: true,
    code: err.code || 'INTERNAL_ERROR',
    message: isProduction && statusCode >= 500
      ? 'An internal server error occurred'
      : err.message,
  };

  // Include stack trace in development
  if (!isProduction && err.stack) {
    response.stack = err.stack.split('\n').slice(0, 5);
  }

  res.status(statusCode).json(response);
}

// Async route wrapper to catch promise rejections
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  AppError,
  notFoundHandler,
  errorHandler,
  asyncHandler,
};
