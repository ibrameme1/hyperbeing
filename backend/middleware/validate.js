// Schema-based request validation middleware.
// Each schema is an object mapping field names to validator functions.
// Validators return an error string on failure, or null on success.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ── Primitive validators ─────────────────────────────────────────────────────

export function isString(min, max) {
  return (v) => {
    if (typeof v !== 'string') return `Must be a string`;
    const t = v.trim();
    if (t.length < min) return `Must be at least ${min} character${min === 1 ? '' : 's'}`;
    if (t.length > max) return `Must be at most ${max} characters`;
    return null;
  };
}

export function isEmail() {
  return (v) => {
    if (typeof v !== 'string') return 'Must be a string';
    if (!EMAIL_RE.test(v.trim())) return 'Must be a valid email address';
    if (v.length > 255) return 'Email too long';
    return null;
  };
}

export function isEnum(...allowed) {
  return (v) => {
    if (!allowed.includes(v)) return `Must be one of: ${allowed.join(', ')}`;
    return null;
  };
}

export function isOptionalString(max) {
  return (v) => {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string') return 'Must be a string';
    if (v.trim().length > max) return `Must be at most ${max} characters`;
    return null;
  };
}

export function isIntBetween(min, max) {
  return (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n)) return 'Must be an integer';
    if (n < min || n > max) return `Must be between ${min} and ${max}`;
    return null;
  };
}

export function isArray(maxItems, itemValidator) {
  return (v) => {
    if (!Array.isArray(v)) return 'Must be an array';
    if (v.length > maxItems) return `Maximum ${maxItems} items allowed`;
    if (itemValidator) {
      for (let i = 0; i < v.length; i++) {
        const err = itemValidator(v[i], i);
        if (err) return `Item ${i}: ${err}`;
      }
    }
    return null;
  };
}

// ── Middleware factory ───────────────────────────────────────────────────────

/**
 * validate(schema) — returns Express middleware that:
 *  1. Strips any fields not listed in the schema (unknown field rejection)
 *  2. Runs each validator and collects all errors
 *  3. Returns 400 with error details if any fail
 *  4. Trims string fields and replaces req.body with the clean copy
 */
export function validate(schema) {
  return (req, res, next) => {
    const errors = {};
    const clean = {};

    for (const [field, validator] of Object.entries(schema)) {
      const value = req.body[field];
      const err = validator(value);
      if (err) {
        errors[field] = err;
      } else {
        // Trim strings automatically
        clean[field] = typeof value === 'string' ? value.trim() : value;
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Validation failed', fields: errors });
    }

    // Replace req.body with only validated + sanitized fields (strips unknown)
    req.body = clean;
    next();
  };
}
