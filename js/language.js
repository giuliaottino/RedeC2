/* Rede C2 language switcher
 * Adds a small language selector and translates the current static Quarto page
 * using the exact-text dictionary defined in js/translations.js.
 *
 * Default behavior: always starts in English unless the URL has ?lang=pt.
 */
(function () {
  "use strict";

  const config = window.RedeC2Translations || {};
  const strings = config.strings || {};
  const labels = config.labels || { en: "English", pt: "Português" };
  const available = config.availableLanguages || ["en", "pt"];
  const defaultLanguage = config.defaultLanguage || "en";
  const textOriginals = new WeakMap();
  const attrOriginals = new WeakMap();
  const excludedSelectors = "script, style, code, pre, kbd, samp, textarea, noscript, svg, canvas, .rede-c2-language-control";
  let originalTitle = document.title;
  let currentLanguage = defaultLanguage;

  function normalize(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function getInitialLanguage() {
    const params = new URLSearchParams(window.location.search);
    const queryLanguage = params.get("lang");

    if (available.includes(queryLanguage)) {
      return queryLanguage;
    }

    return defaultLanguage;
  }

  function translateValue(value, language) {
    const original = normalize(value);
    if (!original || language === defaultLanguage) return original;

    const dictionary = strings[language] || {};

    if (Object.prototype.hasOwnProperty.call(dictionary, original)) {
      return dictionary[original];
    }

    const memberPrefix = "RedeC2 member at ";
    if (original.startsWith(memberPrefix) && dictionary[memberPrefix]) {
      return dictionary[memberPrefix] + original.slice(memberPrefix.length);
    }

    return original;
  }

  function translateTextNode(node, language) {
    if (!textOriginals.has(node)) textOriginals.set(node, node.nodeValue);

    const original = textOriginals.get(node);
    const trimmed = normalize(original);
    if (!trimmed) return;

    const leading = (original.match(/^\s*/) || [""])[0];
    const trailing = (original.match(/\s*$/) || [""])[0];
    const translated = translateValue(trimmed, language);

    node.nodeValue = leading + translated + trailing;
  }

  function translateAttributes(element, language) {
    const attrs = ["placeholder", "title", "aria-label", "alt"];

    attrs.forEach((attr) => {
      if (!element.hasAttribute(attr)) return;

      if (!attrOriginals.has(element)) attrOriginals.set(element, {});

      const stored = attrOriginals.get(element);
      if (!stored[attr]) stored[attr] = element.getAttribute(attr);

      const translated = translateValue(stored[attr], language);
      element.setAttribute(attr, translated);
    });
  }

  function walkAndTranslate(language) {
    currentLanguage = available.includes(language) ? language : defaultLanguage;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || parent.closest(excludedSelectors)) return NodeFilter.FILTER_REJECT;
          return normalize(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach((node) => translateTextNode(node, currentLanguage));

    document.querySelectorAll("[placeholder], [title], [aria-label], img[alt]").forEach((element) => {
      if (!element.closest(excludedSelectors)) translateAttributes(element, currentLanguage);
    });

    document.title = translateValue(originalTitle, currentLanguage);
    document.documentElement.lang = currentLanguage === "pt" ? "pt-BR" : "en";
    document.body.dataset.language = currentLanguage;

    const select = document.getElementById("rede-c2-language-select");
    if (select && select.value !== currentLanguage) select.value = currentLanguage;
  }

  function findNavTarget() {
    return (
      document.querySelector(".quarto-navbar-tools") ||
      document.querySelector("#quarto-header .quarto-navbar-tools") ||
      document.querySelector(".navbar .container-fluid") ||
      document.querySelector("#quarto-header .navbar .container-fluid") ||
      document.querySelector("#quarto-header .navbar") ||
      document.querySelector("nav.navbar") ||
      document.body
    );
  }

  function createControl(currentLanguageForControl) {
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
    select.setAttribute("title", "Language");

    available.forEach((language) => {
      const option = document.createElement("option");
      option.value = language;
      option.textContent = labels[language] || language.toUpperCase();
      option.selected = language === currentLanguageForControl;
      select.appendChild(option);
    });

    select.addEventListener("change", function () {
      walkAndTranslate(this.value);
    });

    container.appendChild(label);
    container.appendChild(select);

    const target = findNavTarget();
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
        border: 1px solid rgba(92,122,62,.35);
        border-radius: 999px;
        background: rgba(250,246,238,.96);
        color: #4A3A22;
        font: 700 .72rem/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        padding: .25rem .55rem;
        cursor: pointer;
      }

      .rede-c2-language-select:focus {
        outline: 2px solid rgba(200,90,58,.35);
        outline-offset: 2px;
      }

      @media (max-width: 768px) {
        .rede-c2-language-control { margin: .5rem 0; }
      }
    `;

    document.head.appendChild(style);
  }

  function init() {
    const language = getInitialLanguage();
    currentLanguage = language;

    injectStyles();
    createControl(language);
    walkAndTranslate(language);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.RedeC2SetLanguage = walkAndTranslate;
})();
