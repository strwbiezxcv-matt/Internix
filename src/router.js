'use strict';

/**
 * Tiny, dependency-free router used by the InternConnect server.
 *
 * Routes are declared as { method, path, handler }. The path may contain
 * `:param` segments which are captured into ctx.params. Handlers run in
 * declaration order; the first match wins.
 */

class Router {
  constructor() {
    this.routes = [];
  }

  add(method, path, handler) {
    const pattern = path.split('/').filter(Boolean);
    this.routes.push({ method: method.toUpperCase(), pattern, path, handler });
  }

  get(path, handler) { this.add('GET', path, handler); }
  post(path, handler) { this.add('POST', path, handler); }
  put(path, handler) { this.add('PUT', path, handler); }
  patch(path, handler) { this.add('PATCH', path, handler); }
  delete(path, handler) { this.add('DELETE', path, handler); }

  match(method, urlPath) {
    const segments = urlPath.split('/').filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method) {
        if (!(method === 'HEAD' && route.method === 'GET')) continue;
      }
      if (route.pattern.length !== segments.length) continue;
      const params = {};
      let matched = true;
      for (let i = 0; i < route.pattern.length; i++) {
        const p = route.pattern[i];
        if (p.startsWith(':')) {
          params[p.slice(1)] = decodeURIComponent(segments[i]);
        } else if (p !== segments[i]) {
          matched = false;
          break;
        }
      }
      if (matched) return { handler: route.handler, params };
    }
    return null;
  }
}

module.exports = { Router };