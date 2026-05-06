/* Rede C2 language switcher — no-fragment v4
 * Runtime de tradução EN/PT para site Quarto estático.
 * Esta versão NÃO faz substituição por pedaços de palavras/frases.
 * Ela traduz apenas textos completos encontrados no dicionário.
 * Isso evita erros como: "collaborative Rede de pesquisa", "ecosyCaules" etc.
 */
(function () {
  "use strict";

  window.RedeC2_TRANSLATION_RUNTIME_VERSION = "nofragment-v4-2026-05-06";

  if (window.RedeC2_TRANSLATION_RUNTIME_ACTIVE) {
    return;
  }
  window.RedeC2_TRANSLATION_RUNTIME_ACTIVE = true;

  const config = window.RedeC2Translations || {};
  const strings = config.strings || {};
  const labels = config.labels || { en: "English", pt: "Português" };
  const available = config.availableLanguages || ["en", "pt"];
  const defaultLanguage = config.defaultLanguage || "en";
  const storageKey = config.storageKey || "rede-c2-language";

  const excludedSelectors = [
    "script", "style", "code", "pre", "kbd", "samp", "textarea", "noscript",
    "svg", "canvas", ".rede-c2-language-control", ".MathJax", ".sourceCode",
    ".leaflet-container", ".leaflet-control", ".plotly", ".js-plotly-plot"
  ].join(",");

  const wholeElementSelector = [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "li", "figcaption", "dt", "dd", "summary",
    "a.nav-link", "a.dropdown-item", ".navbar-title",
    ".rc2-kicker", ".rc2-chip", ".rc2-pill", ".rc2-tag", ".tag", ".agency-pill",
    ".rc2-btn", ".proto-card h3", ".proto-card p", ".sites-box h3", ".sites-box p",
    ".team-name", ".team-affiliation",
    ".redec2-footer-title", ".redec2-footer-name span", ".redec2-footer-contact", ".redec2-footer-links"
  ].join(",");

  const attrsToTranslate = ["placeholder", "title", "aria-label", "alt"];

  const textOriginals = new WeakMap();
  const attrOriginals = new WeakMap();
  const elementOriginals = new WeakMap();

  let originalTitle = document.title;
  let currentLanguage = defaultLanguage;
  let observerStarted = false;
  let refreshTimer = null;
  let translating = false;

  function normalize(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[—]/g, "–")
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

  function dictionaryLookup(value, dictionary) {
    const key = normalize(value);
    if (!key) return null;

    if (Object.prototype.hasOwnProperty.call(dictionary, key)) {
      return dictionary[key];
    }

    const noFinalPeriod = key.replace(/\.$/, "");
    if (noFinalPeriod !== key && Object.prototype.hasOwnProperty.call(dictionary, noFinalPeriod)) {
      const translated = dictionary[noFinalPeriod];
      return /\.$/.test(translated) ? translated : translated + ".";
    }

    const withFinalPeriod = key + ".";
    if (Object.prototype.hasOwnProperty.call(dictionary, withFinalPeriod)) {
      return dictionary[withFinalPeriod];
    }

    const altApostrophe = key.replace(/’/g, "'");
    if (altApostrophe !== key && Object.prototype.hasOwnProperty.call(dictionary, altApostrophe)) {
      return dictionary[altApostrophe];
    }

    const altApostrophe2 = key.replace(/'/g, "’");
    if (altApostrophe2 !== key && Object.prototype.hasOwnProperty.call(dictionary, altApostrophe2)) {
      return dictionary[altApostrophe2];
    }

    return null;
  }

  function translateValue(value, language) {
    const raw = String(value || "");
    const key = normalize(raw);

    if (!key || language === defaultLanguage) {
      return raw;
    }

    const dictionary = getDictionary(language);
    const translated = dictionaryLookup(key, dictionary);

    if (translated !== null) {
      return preserveSpacing(raw, translated);
    }

    return raw;
  }

  function getInitialLanguage() {
    const params = new URLSearchParams(window.location.search);
    const queryLanguage = params.get("lang");

    if (available.includes(queryLanguage)) {
      return queryLanguage;
    }

    // O site sempre abre em inglês. Não usa idioma do navegador nem localStorage.
    try {
      localStorage.removeItem(storageKey);
      localStorage.removeItem("rede-c2-language");
      localStorage.removeItem("site-language");
      localStorage.removeItem("language");
      localStorage.removeItem("tsiino_i18n_lang");
    } catch (error) {}

    return defaultLanguage;
  }

  function isExcludedElement(element) {
    return !!(element && element.closest && element.closest(excludedSelectors));
  }

  function isSafeWholeElement(element) {
    if (!element || isExcludedElement(element)) return false;

    // Não traduz containers da navbar; traduz só links individuais.
    if (
      element.matches("nav, ul, ol, .navbar, .navbar-nav, .navbar-collapse, .navbar-container, .container-fluid") ||
      element.classList.contains("quarto-navbar-tools")
    ) {
      return false;
    }

    const text = normalize(element.textContent);
    if (!text) return false;

    // Evita trocar seções enormes.
    if (text.length > 1200) return false;

    const blockChildren = element.querySelectorAll("section, article, div, table, ul, ol, p, h1, h2, h3, h4, h5, h6");
    if (blockChildren.length > 10) return false;

    return true;
  }

  function rememberElement(element) {
    if (!elementOriginals.has(element)) {
      elementOriginals.set(element, {
        html: element.innerHTML,
        text: element.textContent
      });
    }
  }

  function restoreElement(element) {
    const original = elementOriginals.get(element);
    if (!original) return;
    if (element.dataset) delete element.dataset.redec2TranslatedWhole;
    element.innerHTML = original.html;
  }

  function translateWholeElements(language) {
    const dictionary = getDictionary(language);

    document.querySelectorAll(wholeElementSelector).forEach(function (element) {
      if (!isSafeWholeElement(element)) return;

      rememberElement(element);
      restoreElement(element);

      if (language === defaultLanguage) return;

      const original = elementOriginals.get(element);
      const translated = dictionaryLookup(original.text, dictionary);

      if (translated !== null) {
        element.textContent = translated;
        element.dataset.redec2TranslatedWhole = "1";
      }
    });
  }

  function shouldTranslateTextNode(node) {
    if (!node || !node.parentElement) return false;
    if (isExcludedElement(node.parentElement)) return false;
    if (node.parentElement.closest("[data-redec2-translated-whole='1']")) return false;
    return !!normalize(node.nodeValue);
  }

  function translateTextNodes(language) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          return shouldTranslateTextNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(function (node) {
      if (!textOriginals.has(node)) {
        textOriginals.set(node, node.nodeValue);
      }

      const original = textOriginals.get(node);
      node.nodeValue = translateValue(original, language);
    });
  }

  function translateAttributes(language) {
    document.querySelectorAll("[placeholder], [title], [aria-label], img[alt]").forEach(function (element) {
      if (isExcludedElement(element)) return;

      if (!attrOriginals.has(element)) {
        attrOriginals.set(element, {});
      }

      const stored = attrOriginals.get(element);

      attrsToTranslate.forEach(function (attr) {
        if (!element.hasAttribute(attr)) return;

        if (!Object.prototype.hasOwnProperty.call(stored, attr)) {
          stored[attr] = element.getAttribute(attr);
        }

        element.setAttribute(attr, translateValue(stored[attr], language));
      });
    });
  }

  function translateDocumentTitle(language) {
    document.title = translateValue(originalTitle, language);
  }

  function walkAndTranslate(language) {
    if (!document.body || translating) return;

    translating = true;

    translateWholeElements(language);
    translateTextNodes(language);
    translateAttributes(language);
    translateDocumentTitle(language);

    document.documentElement.lang = language === "pt" ? "pt-BR" : "en";
    document.body.dataset.language = language;

    translating = false;
  }

  function findNavContainer() {
    return (
      document.querySelector(".quarto-navbar-tools") ||
      document.querySelector("#quarto-header .quarto-navbar-tools") ||
      document.querySelector("#quarto-header .navbar .container-fluid") ||
      document.querySelector(".navbar .container-fluid") ||
      document.querySelector("#quarto-header .navbar") ||
      document.querySelector("nav.navbar") ||
      document.body
    );
  }

  function injectStyles() {
    if (document.getElementById("rede-c2-language-style")) return;

    const style = document.createElement("style");
    style.id = "rede-c2-language-style";
    style.textContent = `
      .rede-c2-language-control {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: .5rem;
        margin-right: .35rem;
      }

      .rede-c2-language-select {
        border: 1px solid rgba(169, 54, 50, .35);
        border-radius: 999px;
        background: rgba(255, 253, 247, .96);
        color: #4A3A22;
        font: 700 .76rem/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        padding: .28rem .62rem;
        cursor: pointer;
      }

      .rede-c2-language-select:focus {
        outline: 2px solid rgba(169, 54, 50, .25);
        outline-offset: 2px;
      }

      @media (max-width: 768px) {
        .rede-c2-language-control { margin: .45rem 0; }
      }
    `;

    document.head.appendChild(style);
  }

  function createControl(language) {
    let control = document.querySelector(".rede-c2-language-control");
    let select = document.querySelector("#rede-c2-language-select");

    if (!control) {
      control = document.createElement("div");
      control.className = "rede-c2-language-control quarto-navigation-tool px-1";
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

      available.forEach(function (lang) {
        const option = document.createElement("option");
        option.value = lang;
        option.textContent = labels[lang] || lang.toUpperCase();
        select.appendChild(option);
      });

      select.addEventListener("change", function () {
        currentLanguage = this.value;
        walkAndTranslate(currentLanguage);
      });

      control.appendChild(label);
      control.appendChild(select);
    }

    select.value = language;

    const target = findNavContainer();
    if (target && !target.contains(control)) {
      target.prepend(control);
    }
  }

  function scheduleRefresh() {
    if (refreshTimer) window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(function () {
      walkAndTranslate(currentLanguage);
    }, 150);
  }

  function startObserver() {
    if (observerStarted || !document.body || !window.MutationObserver) return;

    observerStarted = true;

    const observer = new MutationObserver(function (mutations) {
      if (translating) return;

      const relevant = mutations.some(function (mutation) {
        if (mutation.type === "childList" && mutation.addedNodes.length) return true;
        if (mutation.type === "attributes") return true;
        return false;
      });

      if (relevant && currentLanguage !== defaultLanguage) {
        scheduleRefresh();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: attrsToTranslate
    });
  }

  function init() {
    currentLanguage = getInitialLanguage();
    injectStyles();
    createControl(currentLanguage);
    walkAndTranslate(currentLanguage);
    startObserver();

    window.setTimeout(function () { walkAndTranslate(currentLanguage); }, 500);
    window.setTimeout(function () { walkAndTranslate(currentLanguage); }, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.addEventListener("load", function () {
    walkAndTranslate(currentLanguage);
  });

  window.RedeC2SetLanguage = function (language) {
    currentLanguage = available.includes(language) ? language : defaultLanguage;
    const select = document.querySelector("#rede-c2-language-select");
    if (select) select.value = currentLanguage;
    walkAndTranslate(currentLanguage);
  };

  window.RedeC2RefreshI18n = function () {
    walkAndTranslate(currentLanguage);
  };
})();
