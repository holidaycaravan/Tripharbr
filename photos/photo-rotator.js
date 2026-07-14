/*
 * Trip Harbour — Photo Rotator
 * -----------------------------------------------------------
 * Randomly selects photos on every page load and applies them
 * as background images, honouring per-photo focal points.
 *
 * Usage in HTML:
 *   <div data-photo="kashmir"></div>              hero-style single image
 *   <div data-photo="kashmir" data-photo-role="card"></div>
 *   <div data-photo="homepage" data-photo-role="hero"></div>
 *
 * Each folder photos/<destination>/manifest.json provides:
 *   { "destination": "...", "photos": [ { "file": "x.avif", "focal": "center" }, ... ] }
 *
 * Elements sharing a destination on the same page are given
 * distinct random photos where possible (no immediate repeats
 * until the pool is exhausted).
 */
(function () {
  'use strict';

  var BASE = 'photos/';
  var manifestCache = {};   // destination -> Promise<photos[]>
  var usedByDest = {};      // destination -> [files already assigned this load]

  function loadManifest(dest) {
    if (manifestCache[dest]) return manifestCache[dest];
    var url = BASE + dest + '/manifest.json';
    manifestCache[dest] = fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('manifest ' + r.status + ' for ' + dest);
        return r.json();
      })
      .then(function (data) {
        return (data && Array.isArray(data.photos)) ? data.photos : [];
      })
      .catch(function (err) {
        console.warn('[photo-rotator] could not load', url, err);
        return [];
      });
    return manifestCache[dest];
  }

  function pickPhoto(dest, photos) {
    if (!photos.length) return null;
    var used = usedByDest[dest] || (usedByDest[dest] = []);
    // reset the pool once every photo has been shown
    if (used.length >= photos.length) used.length = 0;
    var available = photos.filter(function (p) { return used.indexOf(p.file) === -1; });
    var pool = available.length ? available : photos;
    var chosen = pool[Math.floor(Math.random() * pool.length)];
    used.push(chosen.file);
    return chosen;
  }

  function applyPhoto(el, dest, photo) {
    if (!photo) return;
    var url = BASE + dest + '/' + encodeURIComponent(photo.file);
    el.style.backgroundImage = "url('" + url + "')";
    el.style.backgroundSize = el.style.backgroundSize || 'cover';
    el.style.backgroundPosition = photo.focal || 'center';
    el.style.backgroundRepeat = 'no-repeat';
    el.setAttribute('data-photo-applied', photo.file);
  }

  function rotate(el) {
    var dest = el.getAttribute('data-photo');
    if (!dest) return;
    loadManifest(dest).then(function (photos) {
      applyPhoto(el, dest, pickPhoto(dest, photos));
    });
  }

  function init() {
    var els = document.querySelectorAll('[data-photo]');
    Array.prototype.forEach.call(els, rotate);
  }

  // Public API for manual / dynamic re-rotation
  window.PhotoRotator = {
    rotateAll: init,
    rotate: rotate,
    rotateElement: rotate
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
