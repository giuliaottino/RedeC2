/* Rede C2 language switcher
 * Static Quarto runtime for EN/PT translation.
 * This version preserves the Quarto navbar structure: it only translates text
 * nodes and attributes, never replacing parent HTML with textContent.
 * Default language is always English unless ?lang=pt is used or the selector
 * is changed during the current page view.
 */
(function () {
  "use strict";

  const config = window.RedeC2Translations || {};
  const strings = config.strings || {};
  const labels = config.labels || { en: "English", pt: "Português" };
  const available = config.availableLanguages || ["en", "pt"];
  const defaultLanguage = config.defaultLanguage || "en";
  const storageKey = config.storageKey || "rede-c2-language";
  const prefixes = (config.prefixes && config.prefixes.pt) || {};

  const textOriginals = new WeakMap();
  const attrOriginals = new WeakMap();
  const trackedTextNodes = [];
  const trackedAttrElements = [];

  const excludedSelectors = [
    "script", "style", "code", "pre", "kbd", "samp", "textarea", "noscript",
    "svg", "canvas", ".rede-c2-language-control", ".MathJax", ".sourceCode",
    ".leaflet-container", ".leaflet-control", ".plotly", ".js-plotly-plot"
  ].join(",");

  let originalTitle = document.title;
  let currentLanguage = defaultLanguage;
  let observerStarted = false;
  let refreshTimer = null;
  let isTranslating = false;

  function normalize(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function preserveSpacing(original, translated) {
    const raw = String(original || "");
    const leading = (raw.match(/^\s*/) || [""])[0];
    const trailing = (raw.match(/\s*$/) || [""])[0];
    return leading + translated + trailing;
  }

  function getDictionary(language) {
    return (strings && strings[language]) || {};
  }

  function getInitialLanguage() {
    const params = new URLSearchParams(window.location.search);
    const queryLanguage = params.get("lang");

    if (available.includes(queryLanguage)) {
      return queryLanguage;
    }

    try {
      localStorage.removeItem(storageKey);
      localStorage.removeItem("site-language");
      localStorage.removeItem("language");
      localStorage.removeItem("tsiino_i18n_lang");
      localStorage.removeItem("rede-c2-language");
    } catch (error) {}

    return defaultLanguage;
  }

  function dictionaryLookup(key, dictionary) {
    if (!key) return null;

    if (Object.prototype.hasOwnProperty.call(dictionary, key)) {
      return dictionary[key];
    }

    const normalizedKey = normalize(key);
    if (Object.prototype.hasOwnProperty.call(dictionary, normalizedKey)) {
      return dictionary[normalizedKey];
    }

    const upperKey = normalizedKey.toUpperCase();
    if (Object.prototype.hasOwnProperty.call(dictionary, upperKey)) {
      return dictionary[upperKey];
    }

    const lowerKey = normalizedKey.toLowerCase();
    const keys = Object.keys(dictionary);

    for (let i = 0; i < keys.length; i += 1) {
      if (keys[i].toLowerCase() === lowerKey) {
        return dictionary[keys[i]];
      }
    }

    return null;
  }

  function applyPrefixTranslation(value, language) {
    if (language === defaultLanguage) return null;

    const original = normalize(value);
    const keys = Object.keys(prefixes || {}).sort(function (a, b) {
      return b.length - a.length;
    });

    for (let i = 0; i < keys.length; i += 1) {
      const prefix = keys[i];
      if (original.startsWith(prefix)) {
        return prefixes[prefix] + original.slice(prefix.length);
      }
    }

    return null;
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function replaceFragments(value, dictionary) {
    let output = normalize(value);
    if (!output) return output;

    const sortedKeys = Object.keys(dictionary)
      .map(function (key) { return normalize(key); })
      .filter(function (key, index, arr) {
        return key.length >= 4 && arr.indexOf(key) === index;
      })
      .sort(function (a, b) { return b.length - a.length; });

    sortedKeys.forEach(function (source) {
      const target = dictionaryLookup(source, dictionary);
      if (!source || !target) return;
      if (source.length > output.length) return;

      if (output === source) {
        output = target;
        return;
      }

      if (output.indexOf(source) >= 0) {
        output = output.split(source).join(target);
        return;
      }

      // Case-insensitive fallback for all-caps labels and small UI fragments.
      if (source.length <= 80) {
        const regex = new RegExp(escapeRegExp(source), "gi");
        output = output.replace(regex, target);
      }
    });

    return output;
  }

  function translateValue(value, language) {
    const raw = String(value || "");
    const original = normalize(raw);

    if (!original || language === defaultLanguage) {
      return raw;
    }

    const dictionary = getDictionary(language);
    const direct = dictionaryLookup(original, dictionary);
    if (direct !== null) {
      return preserveSpacing(raw, direct);
    }

    const prefixed = applyPrefixTranslation(original, language);
    if (prefixed !== null) {
      return preserveSpacing(raw, prefixed);
    }

    const replaced = replaceFragments(original, dictionary);
    if (replaced && replaced !== original) {
      return preserveSpacing(raw, replaced);
    }

    return raw;
  }

  function shouldSkipNode(node) {
    if (!node || !node.parentElement) return true;
    if (node.parentElement.closest(excludedSelectors)) return true;
    return !normalize(node.nodeValue);
  }

  function captureTextNode(node) {
    if (!textOriginals.has(node)) {
      textOriginals.set(node, node.nodeValue);
      trackedTextNodes.push(node);
    }
  }

  function translateTextNode(node, language) {
    if (shouldSkipNode(node)) return;

    captureTextNode(node);
    const original = textOriginals.get(node);
    node.nodeValue = translateValue(original, language);
  }

  function captureAttribute(element, attr) {
    if (!attrOriginals.has(element)) {
      attrOriginals.set(element, {});
      trackedAttrElements.push(element);
    }

    const stored = attrOriginals.get(element);
    if (!Object.prototype.hasOwnProperty.call(stored, attr)) {
      stored[attr] = element.getAttribute(attr);
    }
  }

  function translateAttributes(element, language) {
    if (!element || element.closest(excludedSelectors)) return;

    const attrs = ["placeholder", "title", "aria-label", "alt", "data-label"];

    attrs.forEach(function (attr) {
      if (!element.hasAttribute(attr)) return;

      captureAttribute(element, attr);
      const original = attrOriginals.get(element)[attr];
      element.setAttribute(attr, translateValue(original, language));
    });
  }

  function restoreOriginals() {
    trackedTextNodes.forEach(function (node) {
      if (node && node.parentElement && textOriginals.has(node)) {
        node.nodeValue = textOriginals.get(node);
      }
    });

    trackedAttrElements.forEach(function (element) {
      if (!element || !attrOriginals.has(element)) return;
      const stored = attrOriginals.get(element);
      Object.keys(stored).forEach(function (attr) {
        element.setAttribute(attr, stored[attr]);
      });
    });
  }

  function walkAndTranslate(language) {
    currentLanguage = available.includes(language) ? language : defaultLanguage;

    isTranslating = true;

    if (currentLanguage === defaultLanguage) {
      restoreOriginals();
    }

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          return shouldSkipNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    nodes.forEach(function (node) {
      translateTextNode(node, currentLanguage);
    });

    document.querySelectorAll("[placeholder], [title], [aria-label], img[alt], [data-label]").forEach(function (element) {
      translateAttributes(element, currentLanguage);
    });

    document.title = translateValue(originalTitle, currentLanguage);
    document.documentElement.lang = currentLanguage === "pt" ? "pt-BR" : "en";
    document.body.dataset.language = currentLanguage;

    const select = document.getElementById("rede-c2-language-select");
    if (select && select.value !== currentLanguage) {
      select.value = currentLanguage;
    }

    window.setTimeout(function () {
      isTranslating = false;
    }, 0);
  }

  function createControl(currentLanguage) {
    if (document.querySelector(".rede-c2-language-control")) return;

    const container = document.createElement("div");
    container.className = "rede-c2-language-control quarto-navigation-tool px-1";

    const label = document.createElement("label");
    label.className = "visually-hidden";
    label.setAttribute("for", "rede-c2-language-select");
    label.textContent = "Language";

    const select = document.createElement("select");
    select.id = "rede-c2-language-select";
    select.className = "rede-c2-language-select";
    select.setAttribute("aria-label", "Language");

    available.forEach(function (language) {
      const option = document.createElement("option");
      option.value = language;
      option.textContent = labels[language] || language.toUpperCase();
      option.selected = language === currentLanguage;
      select.appendChild(option);
    });

    select.addEventListener("change", function () {
      walkAndTranslate(this.value);
    });

    container.appendChild(label);
    container.appendChild(select);

    const target =
      document.querySelector(".quarto-navbar-tools") ||
      document.querySelector("#quarto-header .quarto-navbar-tools") ||
      document.querySelector("#quarto-header .navbar .container-fluid") ||
      document.querySelector(".navbar .container-fluid") ||
      document.querySelector("#quarto-header .navbar") ||
      document.querySelector("nav.navbar") ||
      document.body;

    target.prepend(container);
  }

  function injectStyles() {
    if (document.getElementById("rede-c2-language-style")) return;

    const style = document.createElement("style");
    style.id = "rede-c2-language-style";
    style.textContent = `
      .rede-c2-language-control {
        display: inline-flex;
        align-items: center;
        margin-right: .35rem;
      }

      .rede-c2-language-select {
        border: 1px solid rgba(169, 54, 50, .35);
        border-radius: 999px;
        background: rgba(250, 246, 238, .96);
        color: #4A3A22;
        font: 800 .72rem/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        padding: .28rem .65rem;
        cursor: pointer;
      }

      .rede-c2-language-select:focus {
        outline: 2px solid rgba(200, 90, 58, .35);
        outline-offset: 2px;
      }

      @media (max-width: 768px) {
        .rede-c2-language-control { margin: .5rem 0; }
      }
    `;
    document.head.appendChild(style);
  }

  function scheduleRefresh() {
    if (isTranslating || currentLanguage === defaultLanguage) return;

    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(function () {
      walkAndTranslate(currentLanguage);
    }, 150);
  }

  function startObserver() {
    if (observerStarted || !document.body || !window.MutationObserver) return;

    observerStarted = true;

    const observer = new MutationObserver(function (mutations) {
      for (let i = 0; i < mutations.length; i += 1) {
        const target = mutations[i].target;
        if (target && target.closest && target.closest(".rede-c2-language-control")) continue;
        scheduleRefresh();
        break;
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function init() {
    const language = getInitialLanguage();
    injectStyles();
    createControl(language);
    walkAndTranslate(language);
    startObserver();

    window.setTimeout(function () { walkAndTranslate(currentLanguage); }, 500);
    window.setTimeout(function () { walkAndTranslate(currentLanguage); }, 1500);
    window.setTimeout(function () { walkAndTranslate(currentLanguage); }, 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.addEventListener("load", function () {
    walkAndTranslate(currentLanguage);
  });

  window.RedeC2SetLanguage = walkAndTranslate;
})();
