/* Rede C2 language switcher
 * Adds a small language selector and translates the current static Quarto pages
 * using the exact-text dictionary defined in js/translations.js.
 * Default language is always English unless ?lang=pt is explicitly passed.
 */
(function () {
  "use strict";

  const config = window.RedeC2Translations || {};
  const strings = config.strings || {};
  const labels = config.labels || { en: "English", pt: "Português" };
  const available = config.availableLanguages || ["en", "pt"];
  const defaultLanguage = config.defaultLanguage || "en";
  const storageKey = config.storageKey || "rede-c2-language";

  const textOriginals = new WeakMap();
  const attrOriginals = new WeakMap();
  const elementOriginals = new WeakMap();

  const excludedSelectors = [
    "script", "style", "code", "pre", "kbd", "samp", "textarea", "noscript",
    "svg", "canvas", ".rede-c2-language-control", ".MathJax", ".sourceCode"
  ].join(",");

  const elementSelector = [
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "figcaption", "blockquote",
    "a", "button", "label", "legend", ".navbar-title", ".nav-link", ".dropdown-item",
    ".rc2-btn", ".rc2-card", ".proto-card", ".sites-box", ".tag", ".pill", ".agency-pill",
    ".team-name", ".team-affiliation", ".team-empty", ".redec2-footer-title",
    ".redec2-footer-name span", ".redec2-footer-contact", ".redec2-footer-links"
  ].join(",");

  let originalTitle = document.title;
  let currentLanguage = defaultLanguage;
  let observerStarted = false;
  let refreshTimer = null;

  function normalize(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function preserveSpacing(original, translated) {
    const originalString = String(original || "");
    const leading = (originalString.match(/^\s*/) || [""])[0];
    const trailing = (originalString.match(/\s*$/) || [""])[0];
    return leading + translated + trailing;
  }

  function getInitialLanguage() {
    const params = new URLSearchParams(window.location.search);
    const queryLanguage = params.get("lang");
    if (available.includes(queryLanguage)) return queryLanguage;

    try {
      localStorage.removeItem(storageKey);
    } catch (error) {}

    return defaultLanguage;
  }

  function translateValue(value, language) {
    const originalRaw = String(value || "");
    const original = normalize(originalRaw);

    if (!original || language === defaultLanguage) return originalRaw;

    const dictionary = strings[language] || {};

    if (Object.prototype.hasOwnProperty.call(dictionary, original)) {
      return preserveSpacing(originalRaw, dictionary[original]);
    }

    const prefixes = (config.prefixes && config.prefixes[language]) || {};
    for (const prefix in prefixes) {
      if (Object.prototype.hasOwnProperty.call(prefixes, prefix) && original.startsWith(prefix)) {
        return preserveSpacing(originalRaw, prefixes[prefix] + original.slice(prefix.length));
      }
    }

    return originalRaw;
  }

  function isExcludedElement(element) {
    if (!element) return true;
    return !!element.closest(excludedSelectors);
  }

  function captureElementOriginal(element) {
    if (!elementOriginals.has(element)) {
      elementOriginals.set(element, { html: element.innerHTML, text: element.textContent });
    }
  }

  function translateWholeElements(language) {
    document.querySelectorAll(elementSelector).forEach(function (element) {
      if (isExcludedElement(element)) return;

      captureElementOriginal(element);

      const original = elementOriginals.get(element);
      const originalText = normalize(original.text);
      const dictionary = strings[language] || {};
      const blockChildren = element.querySelectorAll("section, article, div, p, h1, h2, h3, h4, h5, h6, ul, ol, table");

      if (originalText.length > 1400 || blockChildren.length > 10) return;

      if (language !== defaultLanguage && Object.prototype.hasOwnProperty.call(dictionary, originalText)) {
        element.textContent = dictionary[originalText];
        element.dataset.redec2I18nElementTranslated = "1";
      } else if (language === defaultLanguage && element.dataset.redec2I18nElementTranslated === "1") {
        element.innerHTML = original.html;
        delete element.dataset.redec2I18nElementTranslated;
      }
    });
  }

  function hasTranslatedElementAncestor(node) {
    let element = node && node.parentElement;
    while (element) {
      if (element.dataset && element.dataset.redec2I18nElementTranslated === "1") return true;
      element = element.parentElement;
    }
    return false;
  }

  function translateTextNode(node, language) {
    if (!node || !node.parentElement) return;
    if (isExcludedElement(node.parentElement)) return;
    if (hasTranslatedElementAncestor(node)) return;

    if (!textOriginals.has(node)) textOriginals.set(node, node.nodeValue);

    node.nodeValue = translateValue(textOriginals.get(node), language);
  }

  function translateAttributes(element, language) {
    if (!element || isExcludedElement(element)) return;

    ["placeholder", "title", "aria-label", "alt", "data-label"].forEach(function (attr) {
      if (!element.hasAttribute(attr)) return;

      if (!attrOriginals.has(element)) attrOriginals.set(element, {});
      const stored = attrOriginals.get(element);

      if (!Object.prototype.hasOwnProperty.call(stored, attr)) stored[attr] = element.getAttribute(attr);

      element.setAttribute(attr, translateValue(stored[attr], language));
    });
  }

  function walkAndTranslate(language) {
    currentLanguage = available.includes(language) ? language : defaultLanguage;

    translateWholeElements(currentLanguage);

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        const parent = node.parentElement;
        if (!parent || isExcludedElement(parent)) return NodeFilter.FILTER_REJECT;
        if (hasTranslatedElementAncestor(node)) return NodeFilter.FILTER_REJECT;
        return normalize(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(function (node) { translateTextNode(node, currentLanguage); });

    document.querySelectorAll("[placeholder], [title], [aria-label], img[alt], [data-label]").forEach(function (element) {
      translateAttributes(element, currentLanguage);
    });

    document.title = translateValue(originalTitle, currentLanguage);
    document.documentElement.lang = currentLanguage === "pt" ? "pt-BR" : "en";
    document.body.dataset.language = currentLanguage;

    updateControl(currentLanguage);
  }

  function createControl(currentLanguageForControl) {
    let container = document.querySelector(".rede-c2-language-control");
    let select = document.querySelector("#rede-c2-language-select");

    if (!container) {
      container = document.createElement("div");
      container.className = "rede-c2-language-control quarto-navigation-tool px-1";
    }

    if (!select) {
      const label = document.createElement("label");
      label.className = "visually-hidden";
      label.setAttribute("for", "rede-c2-language-select");
      label.textContent = "Language";

      select = document.createElement("select");
      select.id = "rede-c2-language-select";
      select.className = "rede-c2-language-select";
      select.setAttribute("aria-label", "Language");

      available.forEach(function (language) {
        const option = document.createElement("option");
        option.value = language;
        option.textContent = labels[language] || language.toUpperCase();
        select.appendChild(option);
      });

      select.addEventListener("change", function () { walkAndTranslate(this.value); });

      container.appendChild(label);
      container.appendChild(select);
    }

    const target =
      document.querySelector(".quarto-navbar-tools") ||
      document.querySelector("#quarto-header .quarto-navbar-tools") ||
      document.querySelector("#quarto-header .navbar .container-fluid") ||
      document.querySelector(".navbar .container-fluid") ||
      document.querySelector("#quarto-header .navbar") ||
      document.querySelector("nav.navbar") ||
      document.body;

    if (target && !target.contains(container)) target.prepend(container);

    updateControl(currentLanguageForControl);
  }

  function updateControl(language) {
    const select = document.querySelector("#rede-c2-language-select");
    if (!select) return;
    select.value = available.includes(language) ? language : defaultLanguage;
    select.setAttribute("aria-label", language === "pt" ? "Idioma" : "Language");
    select.setAttribute("title", language === "pt" ? "Idioma" : "Language");
  }

  function injectStyles() {
    if (document.getElementById("rede-c2-language-style")) return;

    const style = document.createElement("style");
    style.id = "rede-c2-language-style";
    style.textContent = `
      .rede-c2-language-control { display: inline-flex; align-items: center; margin-right: .35rem; }
      .rede-c2-language-select {
        border: 1px solid rgba(92,122,62,.35);
        border-radius: 999px;
        background: rgba(250,246,238,.96);
        color: #4A3A22;
        font: 700 .72rem/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        padding: .25rem .55rem;
        cursor: pointer;
      }
      .rede-c2-language-select:focus { outline: 2px solid rgba(200,90,58,.35); outline-offset: 2px; }
      @media (max-width: 768px) { .rede-c2-language-control { margin: .5rem 0; } }
    `;
    document.head.appendChild(style);
  }

  function scheduleRefresh() {
    if (currentLanguage === defaultLanguage) return;
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(function () { walkAndTranslate(currentLanguage); }, 120);
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
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
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

  window.addEventListener("load", function () { walkAndTranslate(currentLanguage); });
  window.RedeC2SetLanguage = walkAndTranslate;
})();
