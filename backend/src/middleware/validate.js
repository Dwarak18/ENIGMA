/**
 * src/middleware/validate.js
 * express-validator rules for the POST /api/v1/entropy endpoint.
 */
'use strict';

const { body, query, validationResult } = require('express-validator');

/** Middleware: return 400 if any validation errors are present. */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      ok: false,
      code: 'VALIDATION_ERROR',
      errors: errors.array(),
    });
  }
  next();
}

/**
 * Validation rules for POST /api/v1/entropy
 */
const entropySubmitRules = [
  body('device_id')
    .isString().trim().notEmpty()
    .isLength({ max: 64 })
    .withMessage('device_id must be a non-empty string (max 64 chars)'),

  body('timestamp')
    .isInt({ min: 1000000000, max: 9999999999 })
    .withMessage('timestamp must be a valid UNIX epoch integer'),

  body('entropy_hash')
    .isHexadecimal()
    .isLength({ min: 64, max: 64 })
    .withMessage('entropy_hash must be a 64-character hex string (SHA-256)'),

  body('signature')
    .isHexadecimal()
    .isLength({ min: 128, max: 128 })
    .withMessage('signature must be a 128-character hex string (raw ECDSA r||s)'),

  body('public_key')
    .optional()
    .isHexadecimal()
    .isLength({ min: 130, max: 130 })
    .withMessage('public_key must be a 130-character hex string (uncompressed P-256)'),

  handleValidationErrors,
];

/**
 * Validation rules for GET /api/v1/entropy/history
 */
const historyQueryRules = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .toInt()
    .withMessage('limit must be an integer between 1 and 1000'),

  handleValidationErrors,
];

module.exports = { entropySubmitRules, historyQueryRules, handleValidationErrors };
