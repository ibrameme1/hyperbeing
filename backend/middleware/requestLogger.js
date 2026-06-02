import { randomUUID } from 'crypto';
import { logger, requestContext } from '../services/logger.js';
import { metrics } from '../services/metrics.js';
import { tracer } from '../services/tracer.js';

/**
 * Assigns every request a UUID trace ID, runs the request inside an
 * AsyncLocalStorage context so all downstream logger calls automatically
 * inherit {requestId, method, path}, and logs + records metrics when
 * the response finishes.
 */
export function requestLogger(req, res, next) {
  const requestId = randomUUID();
  const startMs = Date.now();

  res.setHeader('X-Request-Id', requestId);

  const store = {
    requestId,
    method: req.method,
    path: req.path,
    // userId is patched in by authenticateToken after the JWT is verified
  };

  requestContext.run(store, () => {
    tracer.initRequest(requestId, null, req.method, req.path);

    res.on('finish', () => {
      const durationMs = Date.now() - startMs;
      const { statusCode } = res;

      const level =
        statusCode >= 500 ? 'error' :
        statusCode >= 400 ? 'warn'  : 'info';

      logger[level]('http', {
        status: statusCode,
        durationMs,
        ip: req.ip,
        ua: req.headers['user-agent']?.slice(0, 80),
      });

      metrics.recordRequest(req.method, req.path, statusCode, durationMs);

      if (durationMs > 8_000) {
        logger.warn('slow request', { status: statusCode, durationMs });
      }

      if (statusCode >= 500) {
        tracer.failRequest(requestId, 'http_error', 'HTTP ' + statusCode);
      } else {
        tracer.completeRequest(requestId);
      }
    });

    next();
  });
}
