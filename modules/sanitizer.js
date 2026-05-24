/* ============================================================
   Mermaid Markdown Editor - Sanitizer Module
   Split from app.js
   ============================================================ */

var MR = window.MR || {};
window.MR = MR;

/* ============================================================
   MR.Sanitizer - Preview HTML Sanitization
   ============================================================ */
MR.Sanitizer = (function () {
  var purifyConfig = {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'option', 'link', 'meta', 'base'],
    FORBID_ATTR: ['srcdoc']
  };
  var blockedTags = {
    script: true,
    iframe: true,
    object: true,
    embed: true,
    form: true,
    input: true,
    button: true,
    textarea: true,
    select: true,
    option: true,
    link: true,
    meta: true,
    base: true
  };
  var urlAttrs = { href: true, src: true, 'xlink:href': true, action: true, formaction: true };
  var allowedDataImages = /^data:image\/(?:png|gif|jpe?g|webp|svg\+xml);base64,/i;

  function sanitize(html) {
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
      return window.DOMPurify.sanitize(html || '', purifyConfig);
    }
    var template = document.createElement('template');
    template.innerHTML = html || '';
    cleanNode(template.content);
    return template.innerHTML;
  }

  function cleanNode(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(function (node) {
      var tag = node.tagName.toLowerCase();
      if (blockedTags[tag]) {
        node.remove();
        return;
      }

      Array.from(node.attributes).forEach(function (attr) {
        var name = attr.name.toLowerCase();
        var value = attr.value || '';

        if (name.indexOf('on') === 0 || name === 'srcdoc') {
          node.removeAttribute(attr.name);
          return;
        }

        if (urlAttrs[name] && !isSafeUrl(value, name)) {
          node.removeAttribute(attr.name);
        }
      });

      if (tag === 'a') {
        node.setAttribute('rel', 'noopener noreferrer');
        if (node.getAttribute('target') === '_blank') {
          node.setAttribute('target', '_blank');
        }
      }
    });
  }

  function isSafeUrl(value, attrName) {
    var trimmed = value.trim();
    if (!trimmed) return true;
    if (trimmed.charAt(0) === '#' || trimmed.charAt(0) === '/' || trimmed.indexOf('./') === 0 || trimmed.indexOf('../') === 0) return true;
    if (attrName === 'src' && allowedDataImages.test(trimmed)) return true;
    return /^(https?:|mailto:|tel:)/i.test(trimmed);
  }

  return { sanitize: sanitize };
})();



