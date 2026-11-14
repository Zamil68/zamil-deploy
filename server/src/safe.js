// Wraps every async route handler so a throw/rejection reaches Express' error
// middleware instead of leaving the request hanging forever. Zero deps.
let installed = false;
function wrap(fn) {
  if (typeof fn !== 'function' || fn.__zSafe || fn.length >= 4) return fn; // skip error handlers
  const w = function (req, res, next) {
    try {
      const out = fn.call(this, req, res, next);
      if (out && typeof out.catch === 'function') out.catch(next);
      return out;
    } catch (e) { next(e); }
  };
  w.__zSafe = true;
  return w;
}
function install() {
  if (installed) return;
  installed = true;
  const express = require('express');
  const orig = express.Router;
  const patched = function (...args) {
    const r = orig(...args);
    for (const m of ['get', 'post', 'put', 'patch', 'delete', 'all']) {
      const base = r[m].bind(r);
      r[m] = (...a) => base(...a.map(x => Array.isArray(x) ? x.map(wrap) : (typeof x === 'function' ? wrap(x) : x)));
    }
    return r;
  };
  for (const k of Object.keys(orig)) patched[k] = orig[k];
  express.Router = patched;
}
module.exports = { install, wrap };
