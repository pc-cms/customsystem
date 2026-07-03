/**
 * Single source of truth for per-hostname branding (PWA manifest, favicon,
 * apple-touch-icon, theme-color, document title).
 *
 * Loaded SYNCHRONOUSLY from index.html BEFORE any service worker registration
 * because iOS/Android pin <link rel="manifest"> at install time — the installer
 * must see the correct branded manifest URL on first parse.
 *
 * Exposes on window:
 *   window.__cmsBranding         — config + pure resolver
 *   window.__cmsApplyBranding()  — mutates document.head for current hostname
 *
 * TypeScript callers: see src/lib/branding.ts for typed wrappers.
 */
(function () {
  "use strict";

  // ---- Config -------------------------------------------------------------

  // On-prem 3-letter codes alias to canonical Cloud casino slugs.
  var ALIAS = { mwz: "mwanza", aru: "arusha", dod: "dodoma", mbi: "mbeya" };

  // Per-canonical-slug branding. Anything not in here falls back to the
  // default system black icon set (favicon.png / apple-touch-icon.png /
  // manifest.json) embedded statically in index.html.
  var PREMIER_FAVICON = "/favicon-premier.png";
  var PREMIER_APPLE_ICON = "/apple-touch-icon-premier.png";

  var BRANCHES = {
    arusha:  { name: "Premier Arusha",  manifest: "/manifest-arusha.json",  favicon: PREMIER_FAVICON, appleTouchIcon: PREMIER_APPLE_ICON },
    mwanza:  { name: "Premier Mwanza",  manifest: "/manifest-mwanza.json",  favicon: PREMIER_FAVICON, appleTouchIcon: PREMIER_APPLE_ICON },
    dodoma:  { name: "Premier Dodoma",  manifest: "/manifest-dodoma.json",  favicon: PREMIER_FAVICON, appleTouchIcon: PREMIER_APPLE_ICON },
    mbeya:   { name: "Premier Mbeya",   manifest: "/manifest-mbeya.json",   favicon: PREMIER_FAVICON, appleTouchIcon: PREMIER_APPLE_ICON },
    premier: { name: "Premier HQ",      manifest: "/manifest-premier.json", favicon: PREMIER_FAVICON, appleTouchIcon: PREMIER_APPLE_ICON },
    club:    {
      name: "Premier Club",
      manifest: "/manifest-club.json",
      themeColor: "#A0000D",
      favicon: "/favicon-club.png",
      appleTouchIcon: "/apple-touch-icon-club.png",
      description: "Premier Club — premium gaming rewards, wallet & exclusive perks in Tanzania.",
      ogTitle: "Premier Club",
      ogDescription: "Premium gaming rewards, wallet & exclusive perks in Tanzania.",
    },
  };

  // On-prem servers ship their own pinnable manifest so installed PWA stays distinct.
  var ONPREM_MANIFEST = {
    mwz: "/manifest-mwz.json",
    aru: "/manifest-aru.json",
    dod: "/manifest-dod.json",
    mbi: "/manifest-mbi.json",
  };

  var LANDING_HOSTS = ["casinosystem.app", "www.casinosystem.app"];

  // ---- Pure resolver ------------------------------------------------------

  /**
   * Resolve branding for a hostname. Returns one of:
   *   { kind: "landing" }                                    — strip all PWA tags
   *   { kind: "default" }                                    — use static index.html defaults
   *   { kind: "branch", label, canonical, isOnPrem, branch,
   *     manifest, favicon, appleTouchIcon, displayName,
   *     themeColor?, description?, ogTitle?, ogDescription? }
   */
  function resolve(hostname) {
    var host = (hostname || "").toLowerCase();
    if (LANDING_HOSTS.indexOf(host) !== -1) return { kind: "landing" };

    var label = host.split(".")[0];
    var canonical = Object.prototype.hasOwnProperty.call(ALIAS, label) ? ALIAS[label] : label;
    var isOnPrem = Object.prototype.hasOwnProperty.call(ALIAS, label);
    var branch = Object.prototype.hasOwnProperty.call(BRANCHES, canonical) ? BRANCHES[canonical] : null;
    if (!branch) {
      // Unknown slug — could be a new casino added via admin. Point the manifest
      // at the dynamic edge function; if it's really garbage (localhost, IP,
      // preview host), the function returns a safe fallback manifest.
      var isPlausibleSlug = label && label !== "localhost" && !/^\d+$/.test(label) && !/^\d+\.\d+/.test(host);
      if (isPlausibleSlug) {
        return {
          kind: "dynamic",
          label: label,
          canonical: canonical,
          manifest: "https://rpehngjvwcnipvkouluu.supabase.co/functions/v1/casino-manifest?slug=" + encodeURIComponent(canonical),
        };
      }
      return { kind: "default" };
    }

    return {
      kind: "branch",
      label: label,
      canonical: canonical,
      isOnPrem: isOnPrem,
      branch: branch,
      manifest: isOnPrem && ONPREM_MANIFEST[label] ? ONPREM_MANIFEST[label] : branch.manifest,
      favicon: branch.favicon || "/favicon.png",
      appleTouchIcon: branch.appleTouchIcon || branch.favicon || "/apple-touch-icon.png",
      displayName: isOnPrem ? branch.name + " (Local)" : branch.name,
      themeColor: branch.themeColor,
      description: branch.description,
      ogTitle: branch.ogTitle,
      ogDescription: branch.ogDescription,
    };
  }


  // ---- DOM application ----------------------------------------------------

  function removeAll(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var nodes = document.head.querySelectorAll(selectors[i]);
      for (var j = 0; j < nodes.length; j++) nodes[j].parentNode.removeChild(nodes[j]);
    }
  }

  // iOS/Android frequently IGNORE attribute mutations on <title>,
  // <meta apple-mobile-web-app-title> and <link rel=apple-touch-icon>.
  // We must REMOVE the static tag and APPEND a fresh node.
  function replaceTag(selector, build) {
    var old = document.head.querySelector(selector);
    if (old) old.parentNode.removeChild(old);
    var fresh = build();
    document.head.appendChild(fresh);
    return fresh;
  }

  function apply() {
    try {
      var info = resolve(window.location.hostname);

      if (info.kind === "landing") {
        // Strip PWA-specific tags (landing is not installable) but swap
        // favicon/apple-touch-icon to the Amaell Group corporate marks.
        removeAll([
          'link[rel="manifest"]',
          'meta[name="theme-color"]',
          'meta[name="apple-mobile-web-app-capable"]',
          'meta[name="mobile-web-app-capable"]',
          'meta[name="apple-mobile-web-app-status-bar-style"]',
          'meta[name="apple-mobile-web-app-title"]',
          'link[rel="icon"]',
          'link[rel="apple-touch-icon"]',
        ]);
        var icoLink = document.createElement('link');
        icoLink.setAttribute('rel', 'icon');
        icoLink.setAttribute('type', 'image/x-icon');
        icoLink.setAttribute('href', '/favicon.ico');
        document.head.appendChild(icoLink);
        var png32 = document.createElement('link');
        png32.setAttribute('rel', 'icon');
        png32.setAttribute('type', 'image/png');
        png32.setAttribute('sizes', '32x32');
        png32.setAttribute('href', '/favicon-32x32.png');
        document.head.appendChild(png32);
        var png16 = document.createElement('link');
        png16.setAttribute('rel', 'icon');
        png16.setAttribute('type', 'image/png');
        png16.setAttribute('sizes', '16x16');
        png16.setAttribute('href', '/favicon-16x16.png');
        document.head.appendChild(png16);
        var apple = document.createElement('link');
        apple.setAttribute('rel', 'apple-touch-icon');
        apple.setAttribute('sizes', '180x180');
        apple.setAttribute('href', '/apple-touch-icon-amaell.png');
        document.head.appendChild(apple);
        return;
      }


      if (info.kind === "dynamic") {
        var manifestLinkDyn = document.getElementById("app-manifest");
        if (manifestLinkDyn) manifestLinkDyn.setAttribute("href", info.manifest);
        return; // title/icons will be augmented by augmentFromDB()
      }

      if (info.kind === "default") return;


      replaceTag('title', function () {
        var t = document.createElement('title'); t.textContent = info.displayName; return t;
      });
      replaceTag('meta[name="apple-mobile-web-app-title"]', function () {
        var m = document.createElement('meta');
        m.setAttribute('name', 'apple-mobile-web-app-title');
        m.setAttribute('content', info.displayName);
        return m;
      });
      replaceTag('link[rel="apple-touch-icon"]', function () {
        var l = document.createElement('link');
        l.setAttribute('rel', 'apple-touch-icon');
        l.setAttribute('sizes', '180x180');
        l.setAttribute('href', info.appleTouchIcon);
        return l;
      });
      replaceTag('link[rel="icon"]', function () {
        var l = document.createElement('link');
        l.setAttribute('rel', 'icon');
        l.setAttribute('type', 'image/png');
        l.setAttribute('href', info.favicon);
        return l;
      });

      var manifestLink = document.getElementById("app-manifest");
      if (manifestLink) manifestLink.setAttribute("href", info.manifest);

      if (info.themeColor) {
        var tc = document.querySelector('meta[name="theme-color"]');
        if (tc) tc.setAttribute("content", info.themeColor);
      }
      if (info.description) {
        var desc = document.querySelector('meta[name="description"]');
        if (desc) desc.setAttribute("content", info.description);
      }
      if (info.ogTitle) {
        var ogt = document.querySelector('meta[property="og:title"]');
        if (ogt) ogt.setAttribute("content", info.ogTitle);
      }
      if (info.ogDescription) {
        var ogd = document.querySelector('meta[property="og:description"]');
        if (ogd) ogd.setAttribute("content", info.ogDescription);
      }
    } catch (e) { /* noop — branding is best-effort */ }
  }

  // ---- Async DB augmentation --------------------------------------------
  // After the sync static branding is applied, ask the casino-branding edge
  // function for DB overrides (favicon/theme-color/title/OG). Best-effort —
  // any error keeps the static config. Manifest URL is NOT swapped after
  // install (iOS/Android pinned it already), but cold visitors see fresh
  // favicon + title without a redeploy.
  var SUPABASE_FN_URL = "https://rpehngjvwcnipvkouluu.supabase.co/functions/v1/casino-branding";

  function augmentFromDB() {
    try {
      var host = (window.location.hostname || "").toLowerCase();
      var label = host.split(".")[0];
      var canonical = Object.prototype.hasOwnProperty.call(ALIAS, label) ? ALIAS[label] : label;
      if (!canonical || canonical === "localhost" || /^\d+$/.test(canonical)) return;

      fetch(SUPABASE_FN_URL + "?slug=" + encodeURIComponent(canonical), { credentials: "omit" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (row) {
          if (!row) return;
          if (row.meta_title || row.short_name || row.name) {
            replaceTag('title', function () {
              var t = document.createElement('title');
              t.textContent = row.meta_title || row.short_name || row.name;
              return t;
            });
          }
          if (row.short_name || row.name) {
            replaceTag('meta[name="apple-mobile-web-app-title"]', function () {
              var m = document.createElement('meta');
              m.setAttribute('name', 'apple-mobile-web-app-title');
              m.setAttribute('content', row.short_name || row.name);
              return m;
            });
          }
          if (row.favicon_url) {
            replaceTag('link[rel="icon"]', function () {
              var l = document.createElement('link');
              l.setAttribute('rel', 'icon');
              l.setAttribute('type', 'image/png');
              l.setAttribute('href', row.favicon_url);
              return l;
            });
          }
          if (row.apple_touch_icon_url) {
            replaceTag('link[rel="apple-touch-icon"]', function () {
              var l = document.createElement('link');
              l.setAttribute('rel', 'apple-touch-icon');
              l.setAttribute('sizes', '180x180');
              l.setAttribute('href', row.apple_touch_icon_url);
              return l;
            });
          }
          if (row.theme_color) {
            var tc = document.querySelector('meta[name="theme-color"]');
            if (tc) tc.setAttribute("content", row.theme_color);
          }
          if (row.meta_description) {
            var desc = document.querySelector('meta[name="description"]');
            if (desc) desc.setAttribute("content", row.meta_description);
          }
          if (row.og_image_url) {
            var og = document.querySelector('meta[property="og:image"]');
            if (!og) {
              og = document.createElement('meta');
              og.setAttribute('property', 'og:image');
              document.head.appendChild(og);
            }
            og.setAttribute('content', row.og_image_url);
          }
        })
        .catch(function () { /* noop */ });
    } catch (e) { /* noop */ }
  }

  window.__cmsBranding = {
    ALIAS: ALIAS,
    BRANCHES: BRANCHES,
    ONPREM_MANIFEST: ONPREM_MANIFEST,
    LANDING_HOSTS: LANDING_HOSTS,
    resolve: resolve,
  };
  window.__cmsApplyBranding = apply;
  window.__cmsAugmentBrandingFromDB = augmentFromDB;

  // Run immediately — index.html loads this synchronously in <head>.
  apply();
  // Async DB augmentation — non-blocking.
  augmentFromDB();
})();

