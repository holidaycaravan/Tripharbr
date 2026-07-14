/*
 * Trip Harbour — Photo Rotator
 * -----------------------------------------------------------
 * Randomly selects photos on every page load and applies them
 * as background images, honouring per-photo focal points.
 *
 * Public API:
 *   PhotoRotator.applyHero(dest, gradient)          hero background
 *   PhotoRotator.applyCards(dest, selector, count)  up to `count` matched els
 *   PhotoRotator.applyHomepage()                    index.html wiring
 *
 * Data sources: photos/<dest>/manifest.json, shape:
 *   { "destination": "...", "photos": [ { "file": "x.avif", "focal": "center" } ] }
 *
 * Elements sharing a destination on one page get distinct random
 * photos where the pool allows (no repeat until pool exhausted).
 * A real photo is only swapped in after it successfully preloads,
 * so any pre-existing gradient stays as a graceful fallback.
 */
(function () {
  'use strict';

  var BASE = 'photos/';
  var manifestCache = {};   // dest -> Promise<photos[]>
  var usedByDest = {};      // dest -> [files assigned this load]

  function loadManifest(dest) {
    if (manifestCache[dest]) return manifestCache[dest];
    var url = BASE + dest + '/manifest.json';
    manifestCache[dest] = fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('manifest ' + r.status);
        return r.json();
      })
      .then(function (data) {
        return (data && Array.isArray(data.photos)) ? data.photos : [];
      })
      .catch(function (err) {
        console.warn('[photo-rotator] cannot load', url, err);
        return [];
      });
    return manifestCache[dest];
  }

  function pickPhoto(dest, photos) {
    if (!photos.length) return null;
    var used = usedByDest[dest] || (usedByDest[dest] = []);
    if (used.length >= photos.length) used.length = 0;
    var available = photos.filter(function (p) { return used.indexOf(p.file) === -1; });
    var pool = available.length ? available : photos;
    var chosen = pool[Math.floor(Math.random() * pool.length)];
    used.push(chosen.file);
    return chosen;
  }

  // Preload, then swap the image in only on success (keeps fallback on error)
  function applyToElement(el, dest) {
    if (!el) return;
    loadManifest(dest).then(function (photos) {
      var photo = pickPhoto(dest, photos);
      if (!photo) return;
      var url = BASE + dest + '/' + encodeURIComponent(photo.file);
      var pre = new Image();
      pre.onload = function () {
        el.style.backgroundImage = "url('" + url + "')";
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = photo.focal || 'center';
        el.style.backgroundRepeat = 'no-repeat';
        el.classList.add('photo-loaded');
        // hide any "Photos Coming Soon" placeholder label inside the element
        if (el.querySelector) {
          var label = el.querySelector('.photo-label');
          if (label) label.style.display = 'none';
        }
        el.setAttribute('data-photo-applied', photo.file);
      };
      pre.onerror = function () { /* keep existing gradient fallback */ };
      pre.src = url;
    });
  }

  function heroElement() {
    return document.querySelector('.hero')
        || document.querySelector('.pkg-hero-img')
        || document.querySelector('.pkg-hero');
  }

  function applyHero(dest, gradient) {
    var el = heroElement();
    if (!el) return;
    if (gradient) el.style.background = gradient; // fallback until photo loads
    applyToElement(el, dest);
  }

  function applyCards(dest, selector, count) {
    var all = document.querySelectorAll(selector);
    var els = Array.prototype.slice.call(all, 0, (count > 0 ? count : all.length));
    els.forEach(function (el) { applyToElement(el, dest); });
  }

  function applyHomepage() {
    // Hero uses the dedicated homepage photo set
    applyHero('homepage', null);
    // Destination cards: destination named directly on data-dest
    Array.prototype.forEach.call(document.querySelectorAll('[data-dest]'), function (el) {
      applyToElement(el, el.getAttribute('data-dest'));
    });
    // Package cards: destination is the prefix of data-pkg (e.g. "kashmir-honeymoon")
    Array.prototype.forEach.call(document.querySelectorAll('[data-pkg]'), function (el) {
      var dest = (el.getAttribute('data-pkg') || '').split('-')[0];
      if (!dest) return;
      var target = el.querySelector('.pkg-img') || el;
      applyToElement(target, dest);
    });
  }

  window.PhotoRotator = {
    applyHero: applyHero,
    applyCards: applyCards,
    applyHomepage: applyHomepage,
    // low-level helpers, exposed for reuse
    applyToElement: applyToElement
  };
})();
