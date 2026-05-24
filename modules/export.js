/* ============================================================
   Mermaid Markdown Editor - Export Module
   Split from app.js
   ============================================================ */

var MR = window.MR || {};
window.MR = MR;

MR.Export = (function () {
  function init() {
    document.getElementById('btn-word').addEventListener('click', exportWord);
    document.getElementById('btn-pdf').addEventListener('click', exportPDF);
    document.getElementById('btn-html').addEventListener('click', exportHTML);
  }

  function getFullHTML() {
    // Get preview HTML and collect styles
    var previewHtml = MR.Renderer.getPreviewHTML();

    // Collect all relevant styles
    var styles = '';
    var styleSheets = document.styleSheets;
    for (var i = 0; i < styleSheets.length; i++) {
      try {
        var sheet = styleSheets[i];
        if (sheet.cssRules) {
          for (var j = 0; j < sheet.cssRules.length; j++) {
            var rule = sheet.cssRules[j];
            if (rule.cssText) {
              styles += rule.cssText + '\n';
            }
          }
        }
      } catch (e) { /* cross-origin stylesheet */ }
    }

    // Convert mermaid SVGs to base64 PNGs for better Word compatibility
    var tempDiv = document.createElement('div');
    tempDiv.innerHTML = previewHtml;
    var mermaidWrappers = tempDiv.querySelectorAll('.mermaid-wrapper');
    var conversionPromises = [];

    mermaidWrappers.forEach(function (wrapper) {
      var svg = wrapper.querySelector('svg');
      if (svg) {
        var p = svgToDataURL(svg).then(function (dataUrl) {
          var img = document.createElement('img');
          img.src = dataUrl;
          img.style.maxWidth = '100%';
          wrapper.innerHTML = '';
          wrapper.appendChild(img);
        });
        conversionPromises.push(p);
      }
    });

    return Promise.all(conversionPromises).then(function () {
      var bodyHtml = tempDiv.innerHTML;
      return '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n' +
        '<style>' + styles + '</style>\n</head>\n<body>' + bodyHtml + '</body>\n</html>';
    });
  }

  function svgToDataURL(svgEl) {
    return new Promise(function (resolve) {
      var clone = svgEl.cloneNode(true);
      var serializer = new XMLSerializer();
      var svgString = serializer.serializeToString(clone);
      var svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(svgBlob);

      var img = new Image();
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          // Read dimensions from viewBox or width/height attributes (getBoundingClientRect is 0 on detached elements)
          var w = 800, h = 600;
          var vb = svgEl.getAttribute('viewBox');
          if (vb) {
            var parts = vb.split(/[\s,]+/);
            w = parseFloat(parts[2]) || 800;
            h = parseFloat(parts[3]) || 600;
          } else {
            w = parseFloat(svgEl.getAttribute('width')) || 800;
            h = parseFloat(svgEl.getAttribute('height')) || 600;
          }
          canvas.width = w * 2;
          canvas.height = h * 2;
          var ctx = canvas.getContext('2d');
          ctx.scale(2, 2);
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob(function (blob) {
            if (!blob) {
              resolve('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString));
              URL.revokeObjectURL(url);
              return;
            }
            var reader = new FileReader();
            reader.onload = function () {
              resolve(reader.result);
              URL.revokeObjectURL(url);
            };
            reader.readAsDataURL(blob);
          }, 'image/png');
        } catch (e) {
          resolve('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString));
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = function () {
        resolve('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString));
        URL.revokeObjectURL(url);
      };
      img.src = url;
    });
  }

  function exportWord() {
    getFullHTML().then(function (fullHtml) {
      try {
        var blob = htmlDocx.asBlob(fullHtml);
        var name = (MR.StatusBar.getCurrentFile() || 'document').replace(/\.md$/, '') + '.docx';
        downloadBlob(blob, name);
        MR.Util.showToast('Word 文档已导出', 'success');
      } catch (e) {
        MR.Util.showToast('Word 导出失败: ' + e.message, 'error');
      }
    }).catch(function (e) {
      MR.Util.showToast('Word 导出失败: ' + e.message, 'error');
    });
  }

  function exportPDF() {
    MR.Util.showToast('在打印对话框中选择"另存为 PDF"即可导出', 'info');
    // Use window.print with @media print CSS
    setTimeout(function () { window.print(); }, 500);
  }

  function exportHTML() {
    var previewHtml = MR.Renderer.getPreviewHTML();
    if (!previewHtml || previewHtml === '<div class="preview-placeholder">\u6682\u65E0\u9884\u89C8\u5185\u5BB9</div>') {
      MR.Util.showToast('\u5185\u5BB9\u4E3A\u7A7A\uFF0C\u65E0\u6CD5\u5BFC\u51FA', 'warning');
      return;
    }

    // Collect styles
    var styles = '';
    var styleSheets = document.styleSheets;
    for (var i = 0; i < styleSheets.length; i++) {
      try {
        var sheet = styleSheets[i];
        if (sheet.cssRules) {
          for (var j = 0; j < sheet.cssRules.length; j++) {
            var rule = sheet.cssRules[j];
            if (rule.cssText) {
              styles += rule.cssText + '\n';
            }
          }
        }
      } catch (e) { /* ignore */ }
    }

    // Convert mermaid SVGs to base64 PNGs
    var tempDiv = document.createElement('div');
    tempDiv.innerHTML = previewHtml;
    var mermaidWrappers = tempDiv.querySelectorAll('.mermaid-wrapper');
    var conversionPromises = [];

    mermaidWrappers.forEach(function (wrapper) {
      var svg = wrapper.querySelector('svg');
      if (svg) {
        var p = svgToDataURL(svg).then(function (dataUrl) {
          var img = document.createElement('img');
          img.src = dataUrl;
          img.style.maxWidth = '100%';
          wrapper.innerHTML = '';
          wrapper.appendChild(img);
        });
        conversionPromises.push(p);
      }
    });

    Promise.all(conversionPromises).then(function () {
      var bodyHtml = tempDiv.innerHTML;
      var fullHtml = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        '<title>' + (MR.StatusBar.getCurrentFile() || 'document').replace('.md', '') + '</title>\n' +
        '<style>' + styles + '</style>\n' +
        '<style>body{padding:40px 32px;max-width:900px;margin:0 auto;}</style>\n' +
        '</head>\n<body>' + bodyHtml + '</body>\n</html>';

      var blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
      var name = (MR.StatusBar.getCurrentFile() || 'document').replace(/\.md$/, '') + '.html';
      downloadBlob(blob, name);
      MR.Util.showToast('HTML 文件已导出', 'success');
    }).catch(function (e) {
      MR.Util.showToast('HTML 导出失败: ' + e.message, 'error');
    });
  }

  function exportMermaidPNG(wrapper) {
    if (!wrapper || !wrapper.querySelector) {
      MR.Util.showToast('未找到图表', 'error');
      return;
    }

    var svgEl = wrapper.querySelector('svg');
    if (!svgEl) {
      MR.Util.showToast('图表尚未渲染完成', 'warning');
      return;
    }

    svgToDataURL(svgEl).then(function (dataUrl) {
      var link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'diagram-' + Date.now() + '.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      MR.Util.showToast('图表已导出为 PNG', 'success');
    }).catch(function (e) {
      MR.Util.showToast('导出 PNG 失败', 'error');
    });
  }

  return {
    init: init,
    getFullHTML: getFullHTML,
    exportWord: exportWord,
    exportPDF: exportPDF,
    exportMermaidPNG: exportMermaidPNG
  };
})();


