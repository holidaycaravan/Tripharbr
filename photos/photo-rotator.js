/*
 * Trip Harbour — Photo Rotator
 * -----------------------------------------------------------
 * Randomly selects photos on every page load and applies them
 * as background images, honouring per-photo focal points.
 *
 * Public API:
 *   PhotoRotator.applyHero(dest, gradient)              hero background (single random)
 *   PhotoRotator.startSlideshow(dest, gradient, secs)   hero auto-rotating slideshow
 *   PhotoRotator.applyCards(dest, selector, count)      up to `count` matched els
 *   PhotoRotator.applyHomepage()                        legacy index.html wiring
 *
 * Data sources: photos/<dest>/manifest.json:
 *   { "destination": "...", "photos": [ { "file": "x.avif", "focal": "center" } ] }
 *
 * Photos are preloaded and only swapped in on success, so any
 * pre-existing gradient stays as a graceful fallback. The hero
 * uses a CSS custom property (--hero-photo) so a Ken Burns
 * ::before layer can animate the image independently.
 */
// Base path to the photos/ directory, derived from this script's own src so
// it resolves under any subdirectory deploy (e.g. /Tripharbr/). A `dest` may
// itself be a nested path such as 'blog/kashmir-family' — it is concatenated
// after BASE, so fetches resolve to photos/blog/kashmir-family/manifest.json.
const PHOTOS_BASE = (() => {
  try {
    const s = document.querySelector('script[src*="photo-rotator"]');
    if (s) return s.src.substring(0, s.src.lastIndexOf('photo-rotator.js'));
  } catch(e) {}
  return 'photos/';
})();

(function () {
  'use strict';

  var BASE = PHOTOS_BASE;
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

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function fileOf(photo) { return typeof photo === 'string' ? photo : photo.file; }
  function focalOf(photo) { return (photo && photo.focal) ? photo.focal : 'center'; }

  // Reorder so JPG/JPEG photos come first (keeps original order within groups).
  // Used for the homepage hero so the new high-quality JPGs show before AVIFs.
  function prioritiseJpg(photos) {
    var jpgs = photos.filter(function (p) {
      var f = fileOf(p).toLowerCase();
      return f.endsWith('.jpg') || f.endsWith('.jpeg');
    });
    var others = photos.filter(function (p) {
      var f = fileOf(p).toLowerCase();
      return !(f.endsWith('.jpg') || f.endsWith('.jpeg'));
    });
    return jpgs.concat(others);
  }

  function pickPhoto(dest, photos) {
    if (!photos.length) return null;
    var used = usedByDest[dest] || (usedByDest[dest] = []);
    if (used.length >= photos.length) used.length = 0;
    var available = photos.filter(function (p) { return used.indexOf(fileOf(p)) === -1; });
    var pool = available.length ? available : photos;
    var chosen = pool[Math.floor(Math.random() * pool.length)];
    used.push(fileOf(chosen));
    return chosen;
  }

  // Cards / generic elements: preload then swap on success (keeps gradient fallback)
  function applyToElement(el, dest) {
    if (!el) return;
    loadManifest(dest).then(function (photos) {
      var photo = pickPhoto(dest, photos);
      if (!photo) return;
      var url = BASE + dest + '/' + encodeURIComponent(fileOf(photo));
      var pre = new Image();
      pre.onload = function () {
        el.style.backgroundImage = "url('" + url + "')";
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = focalOf(photo);
        el.style.backgroundRepeat = 'no-repeat';
        el.classList.add('photo-loaded');
        if (el.querySelector) {
          var label = el.querySelector('.photo-label');
          if (label) label.style.display = 'none';
        }
        el.setAttribute('data-photo-applied', fileOf(photo));
      };
      pre.onerror = function () { /* keep fallback */ };
      pre.src = url;
    });
  }

  function heroElement() {
    return document.querySelector('.hero')
        || document.querySelector('.pkg-hero-img')
        || document.querySelector('.pkg-hero');
  }

  function applyHero(dest, gradient) {
    var hero = heroElement();
    if (!hero) return;
    if (gradient) hero.style.background = gradient; // fallback until photo loads
    loadManifest(dest).then(function (photos) {
      var photo = pickPhoto(dest, photos);
      if (!photo) return;
      var url = BASE + dest + '/' + encodeURIComponent(fileOf(photo));
      var focal = focalOf(photo);
      var pre = new Image();
      pre.onload = function () {
        hero.style.setProperty('--hero-photo', "url('" + url + "')");
        hero.style.backgroundImage = "url('" + url + "'), " + (gradient || 'none');
        hero.style.backgroundSize = 'cover, cover';
        hero.style.backgroundPosition = focal + ', center';
        hero.classList.add('photo-loaded');
        var label = hero.querySelector && hero.querySelector('.photo-label');
        if (label) label.style.display = 'none';
      };
      pre.onerror = function () { /* keep gradient fallback */ };
      pre.src = url;
    });
  }

  function startSlideshow(dest, gradient, intervalSeconds) {
    intervalSeconds = intervalSeconds || 7;
    loadManifest(dest).then(function (photos) {
      var hero = document.querySelector('.hero');
      if (!hero) return;
      // Homepage: float the new high-quality JPGs ahead of the AVIFs
      if (dest === 'homepage') {
        photos = prioritiseJpg(photos);
      }
      // Only one (or zero) photo — apply statically, no slideshow needed
      if (!photos || photos.length < 2) {
        applyHero(dest, gradient);
        return;
      }
      // Shuffle for variety, but keep JPGs first on the homepage so a
      // high-quality JPG is always the opening frame of the rotation.
      var shuffled = (dest === 'homepage') ? prioritiseJpg(shuffle(photos)) : shuffle(photos);
      var index = 0;

      function showPhoto() {
        var photo = shuffled[index % shuffled.length];
        var focal = focalOf(photo);
        var url = BASE + dest + '/' + encodeURIComponent(fileOf(photo));
        var pre = new Image();
        pre.onload = function () {
          hero.style.opacity = '0.85';           // fade out
          setTimeout(function () {
            hero.style.setProperty('--hero-photo', "url('" + url + "')");
            hero.style.backgroundImage = "url('" + url + "'), " + gradient;
            hero.style.backgroundSize = 'cover, cover';
            hero.style.backgroundPosition = focal + ', center';
            hero.classList.add('photo-loaded');
            hero.style.opacity = '1';            // fade back in
          }, 400);
        };
        pre.onerror = function () { /* skip this frame, keep current */ };
        pre.src = url;
        index++;
      }

      showPhoto();                                // first photo immediately
      setInterval(showPhoto, intervalSeconds * 1000);
    });
  }

  function applyCards(dest, selector, count) {
    var all = document.querySelectorAll(selector);
    var els = Array.prototype.slice.call(all, 0, (count > 0 ? count : all.length));
    els.forEach(function (el) { applyToElement(el, dest); });
  }

  function applyHomepage() {
    startSlideshow('homepage', 'linear-gradient(135deg, #0a2a4a, #1a4a7a)', 7);
    Array.prototype.forEach.call(document.querySelectorAll('[data-dest]'), function (el) {
      applyToElement(el, el.getAttribute('data-dest'));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-pkg]'), function (el) {
      var dest = (el.getAttribute('data-pkg') || '').split('-')[0];
      if (!dest) return;
      var target = el.querySelector('.pkg-img') || el;
      applyToElement(target, dest);
    });
  }

  window.PhotoRotator = {
    applyHero: applyHero,
    startSlideshow: startSlideshow,
    applyCards: applyCards,
    applyHomepage: applyHomepage,
    applyToElement: applyToElement,
    prioritiseJpg: prioritiseJpg
  };
})();
