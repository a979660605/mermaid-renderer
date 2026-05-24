/* ============================================================
   Mermaid Markdown Editor - Application Logic
   ============================================================ */

var MR = window.MR || {};

/* ============================================================
   MR.Excalidraw - Canvas Drawing Tool
   ============================================================ */
MR.Excalidraw = (function () {
  var canvas, ctx;
  var elements = [];
  var currentTool = 'select';
  var currentColor = '#000000';
  var currentLineWidth = 2;
  var fillEnabled = true;
  var isDrawing = false;
  var startX = 0, startY = 0;
  var currentElement = null;
  var undoStack = [];
  var redoStack = [];
  var selectedIndex = -1;
  var isDragging = false;
  var dragChanged = false;
  var dragOffsetX = 0, dragOffsetY = 0;
  var penPoints = [];
  var MAX_UNDO = 50;
  var toolButtons = {};
  var colorInput, lineWidthInput, fillCheckbox, canvasEl;

  function init() {
    canvasEl = document.getElementById('excalidraw-canvas');
    ctx = canvasEl.getContext('2d');
    colorInput = document.getElementById('ex-color');
    lineWidthInput = document.getElementById('ex-line-width');
    fillCheckbox = document.getElementById('ex-fill');

    // Tool buttons
    document.querySelectorAll('.ex-tool-btn').forEach(function (btn) {
      var tool = btn.getAttribute('data-tool');
      toolButtons[tool] = btn;
      btn.addEventListener('click', function () { setTool(tool); });
    });

    // Color / width / fill
    colorInput.addEventListener('input', function () { currentColor = this.value; });
    lineWidthInput.addEventListener('input', function () { currentLineWidth = parseInt(this.value); });
    fillCheckbox.addEventListener('change', function () { fillEnabled = this.checked; });

    // Action buttons
    document.getElementById('ex-undo').addEventListener('click', undo);
    document.getElementById('ex-redo').addEventListener('click', redo);
    document.getElementById('ex-clear').addEventListener('click', clearAll);
    document.getElementById('ex-embed').addEventListener('click', embedToMarkdown);
    document.getElementById('ex-back').addEventListener('click', hide);

    // Canvas events
    canvasEl.addEventListener('mousedown', onMouseDown);
    canvasEl.addEventListener('mousemove', onMouseMove);
    canvasEl.addEventListener('mouseup', onMouseUp);
    canvasEl.addEventListener('mouseleave', onMouseUp);
    canvasEl.addEventListener('dblclick', onDoubleClick);

    // Keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z)
    document.addEventListener('keydown', function (e) {
      if (!MR.Excalidraw.isVisible) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) { redo(); e.preventDefault(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'z') { undo(); e.preventDefault(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIndex >= 0 && selectedIndex < elements.length && !e.target.closest('input')) {
          pushUndoState();
          elements.splice(selectedIndex, 1);
          selectedIndex = -1;
          redraw();
          e.preventDefault();
        }
      }
    });

    resizeCanvas();
    window.addEventListener('resize', function () {
      if (!document.getElementById('excalidraw-modal').classList.contains('hidden')) {
        resizeCanvas();
      }
    });
  }

  function resizeCanvas() {
    var rect = canvasEl.parentElement.getBoundingClientRect();
    canvasEl.width = rect.width;
    canvasEl.height = rect.height;
    redraw();
  }

  function show() {
    document.getElementById('excalidraw-modal').classList.remove('hidden');
    MR.Excalidraw.isVisible = true;
    // Use requestAnimationFrame for earliest possible resize (vs setTimeout)
    requestAnimationFrame(function () { resizeCanvas(); });
  }

  function hide() {
    document.getElementById('excalidraw-modal').classList.add('hidden');
    MR.Excalidraw.isVisible = false;
  }

  function setTool(tool) {
    currentTool = tool;
    Object.keys(toolButtons).forEach(function (t) {
      toolButtons[t].classList.toggle('active', t === tool);
    });
    canvasEl.style.cursor = tool === 'select' ? 'default' : 'crosshair';
  }

  function pushUndoState() {
    undoStack.push(JSON.parse(JSON.stringify(elements)));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
  }

  function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(JSON.parse(JSON.stringify(elements)));
    elements = undoStack.pop();
    selectedIndex = -1;
    redraw();
  }

  function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(JSON.parse(JSON.stringify(elements)));
    elements = redoStack.pop();
    redraw();
  }

  function clearAll() {
    if (elements.length === 0) return;
    if (!confirm('确定要清空画布吗？')) return;
    pushUndoState();
    elements = [];
    selectedIndex = -1;
    penPoints = [];
    redraw();
  }

  function createElement(type, x, y) {
    var el = {
      type: type,
      color: currentColor,
      lineWidth: currentLineWidth,
      fill: fillEnabled ? currentColor : 'transparent'
    };
    if (type === 'pen') {
      el.points = [{ x: x, y: y }];
    } else if (type === 'text') {
      el.x = x;
      el.y = y;
      el.text = '';
      el.fontSize = 18;
    } else if (type === 'rectangle') {
      el.x = x; el.y = y; el.w = 0; el.h = 0;
    } else if (type === 'circle') {
      el.x = x; el.y = y; el.rx = 0; el.ry = 0;
    } else if (type === 'line' || type === 'arrow') {
      el.x1 = x; el.y1 = y; el.x2 = x; el.y2 = y;
    }
    return el;
  }

  function getMousePos(e) {
    var rect = canvasEl.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onMouseDown(e) {
    var pos = getMousePos(e);
    if (currentTool === 'select') {
      // Hit test
      var idx = hitTest(pos.x, pos.y);
      if (idx >= 0) {
        selectedIndex = idx;
        isDragging = true;
        dragChanged = false;
        pushUndoState();
        var el = elements[idx];
        if (el.type === 'pen') {
          if (el.points && el.points.length > 0) {
            dragOffsetX = pos.x - el.points[0].x;
            dragOffsetY = pos.y - el.points[0].y;
          } else {
            dragOffsetX = 0; dragOffsetY = 0;
          }
        } else if (el.type === 'line' || el.type === 'arrow') { dragOffsetX = pos.x - el.x1; dragOffsetY = pos.y - el.y1; }
        else if (el.type === 'text') { dragOffsetX = pos.x - el.x; dragOffsetY = pos.y - el.y; }
        else if (el.type === 'rectangle' || el.type === 'circle') { dragOffsetX = pos.x - el.x; dragOffsetY = pos.y - el.y; }
        else { dragOffsetX = 0; dragOffsetY = 0; }
        redraw();
      } else {
        selectedIndex = -1;
        redraw();
      }
      return;
    }

    if (currentTool === 'text') {
      handleTextInput(pos.x, pos.y);
      return;
    }

    isDrawing = true;
    startX = pos.x;
    startY = pos.y;
    pushUndoState();
    currentElement = createElement(currentTool, pos.x, pos.y);
    elements.push(currentElement);
    selectedIndex = elements.length - 1;

    if (currentTool === 'pen') {
      penPoints = [{ x: pos.x, y: pos.y }];
    }
  }

  function onMouseMove(e) {
    var pos = getMousePos(e);
    if (isDragging && selectedIndex >= 0 && selectedIndex < elements.length) {
      var el = elements[selectedIndex];
      dragChanged = true;
      if (el.type === 'line' || el.type === 'arrow') {
        var offsetX = pos.x - dragOffsetX - el.x1;
        var offsetY = pos.y - dragOffsetY - el.y1;
        el.x1 += offsetX; el.y1 += offsetY;
        el.x2 += offsetX; el.y2 += offsetY;
      } else if (el.type === 'pen') {
        if (el.points && el.points.length > 0) {
          var oX = pos.x - dragOffsetX - el.points[0].x;
          var oY = pos.y - dragOffsetY - el.points[0].y;
          for (var pi = 0; pi < el.points.length; pi++) {
            el.points[pi].x += oX;
            el.points[pi].y += oY;
          }
        }
      } else {
        var dx = pos.x - dragOffsetX;
        var dy = pos.y - dragOffsetY;
        el.x = dx; el.y = dy;
      }
      redraw();
      return;
    }

    if (!isDrawing || !currentElement) return;

    if (currentElement.type === 'pen') {
      penPoints.push({ x: pos.x, y: pos.y });
      currentElement.points = penPoints.slice();
    } else if (currentElement.type === 'rectangle') {
      currentElement.w = pos.x - startX;
      currentElement.h = pos.y - startY;
    } else if (currentElement.type === 'circle') {
      currentElement.rx = Math.abs(pos.x - startX) / 2;
      currentElement.ry = Math.abs(pos.y - startY) / 2;
      currentElement.x = (startX + pos.x) / 2;
      currentElement.y = (startY + pos.y) / 2;
    } else if (currentElement.type === 'line' || currentElement.type === 'arrow') {
      currentElement.x2 = pos.x;
      currentElement.y2 = pos.y;
    }
    redraw();
  }

  function onMouseUp(e) {
    if (isDragging) {
      isDragging = false;
      if (!dragChanged) undoStack.pop();
      dragChanged = false;
      return;
    }
    if (!isDrawing) return;
    isDrawing = false;

    // Remove if too small
    if (currentElement) {
      if (currentElement.type === 'rectangle' && Math.abs(currentElement.w) < 3 && Math.abs(currentElement.h) < 3) {
        elements.pop();
        selectedIndex = -1;
        undoStack.pop();
      } else if (currentElement.type === 'circle' && currentElement.rx < 3) {
        elements.pop();
        selectedIndex = -1;
        undoStack.pop();
      } else if ((currentElement.type === 'line' || currentElement.type === 'arrow') &&
        Math.hypot(currentElement.x2 - currentElement.x1, currentElement.y2 - currentElement.y1) < 3) {
        elements.pop();
        selectedIndex = -1;
        undoStack.pop();
      } else if (currentElement.type === 'pen' && currentElement.points.length < 2) {
        elements.pop();
        selectedIndex = -1;
        undoStack.pop();
      }
    }
    currentElement = null;
    penPoints = [];
    redraw();
  }

  function handleTextInput(x, y) {
    var text = prompt('输入文字:');
    if (!text || text.trim() === '') return;
    pushUndoState();
    var el = createElement('text', x, y);
    el.text = text.trim();
    el.fontSize = 18;
    elements.push(el);
    selectedIndex = elements.length - 1;
    redraw();
  }

  function onDoubleClick(e) {
    var pos = getMousePos(e);
    var idx = hitTest(pos.x, pos.y);
    if (idx >= 0 && elements[idx].type === 'text') {
      var newText = prompt('编辑文字:', elements[idx].text);
      if (newText !== null) {
        pushUndoState();
        elements[idx].text = newText;
        redraw();
      }
    }
  }

  function hitTest(mx, my) {
    var threshold = 8;
    for (var i = elements.length - 1; i >= 0; i--) {
      var el = elements[i];
      switch (el.type) {
        case 'rectangle': {
          var x = el.w >= 0 ? el.x : el.x + el.w;
          var y = el.h >= 0 ? el.y : el.y + el.h;
          var w = Math.abs(el.w);
          var h = Math.abs(el.h);
          if (mx >= x - threshold && mx <= x + w + threshold &&
            my >= y - threshold && my <= y + h + threshold) return i;
          break;
        }
        case 'circle': {
          var dx = mx - el.x, dy = my - el.y;
          if (el.rx > 0 && el.ry > 0) {
            var val = (dx * dx) / (el.rx * el.rx) + (dy * dy) / (el.ry * el.ry);
            if (val <= 1.2) return i;
          }
          break;
        }
        case 'line':
        case 'arrow': {
          var d = pointToLineDist(mx, my, el.x1, el.y1, el.x2, el.y2);
          if (d < threshold) return i;
          break;
        }
        case 'pen': {
          if (!el.points) break;
          for (var j = 0; j < el.points.length; j++) {
            if (Math.hypot(mx - el.points[j].x, my - el.points[j].y) < threshold) return i;
          }
          break;
        }
        case 'text': {
          ctx.font = (el.fontSize || 18) + 'px sans-serif';
          var metrics = ctx.measureText(el.text || '');
          if (mx >= el.x && mx <= el.x + metrics.width &&
            my >= el.y - (el.fontSize || 18) && my <= el.y + 4) return i;
          break;
        }
      }
    }
    return -1;
  }

  function pointToLineDist(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    var t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    var projX = x1 + t * dx, projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
  }

  function redraw() {
    if (!ctx) return;
    // 1. Fill white background (consistent with export)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
    // 2. Grid
    drawGrid();

    for (var i = 0; i < elements.length; i++) {
      drawElement(elements[i], i === selectedIndex);
    }
  }

  function drawGrid() {
    var gridSize = 20;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
    for (var x = 0; x < canvasEl.width; x += gridSize) {
      for (var y = 0; y < canvasEl.height; y += gridSize) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawElement(el, isSelected) {
    ctx.save();
    ctx.strokeStyle = el.color || '#000';
    ctx.lineWidth = el.lineWidth || 2;
    ctx.fillStyle = (el.fill && el.fill !== 'transparent') ? el.fill : 'transparent';

    switch (el.type) {
      case 'rectangle': {
        var x = el.w >= 0 ? el.x : el.x + el.w;
        var y = el.h >= 0 ? el.y : el.y + el.h;
        var w = Math.abs(el.w);
        var h = Math.abs(el.h);
        if (el.fill && el.fill !== 'transparent') {
          ctx.fillRect(x, y, w, h);
        }
        ctx.strokeRect(x, y, w, h);
        break;
      }
      case 'circle': {
        ctx.beginPath();
        ctx.ellipse(el.x, el.y, Math.max(el.rx, 1), Math.max(el.ry, 1), 0, 0, Math.PI * 2);
        if (el.fill && el.fill !== 'transparent') ctx.fill();
        ctx.stroke();
        break;
      }
      case 'line': {
        ctx.beginPath();
        ctx.moveTo(el.x1, el.y1);
        ctx.lineTo(el.x2, el.y2);
        ctx.stroke();
        break;
      }
      case 'arrow': {
        ctx.beginPath();
        ctx.moveTo(el.x1, el.y1);
        ctx.lineTo(el.x2, el.y2);
        ctx.stroke();
        drawArrowhead(ctx, el.x1, el.y1, el.x2, el.y2, el.color || '#000');
        break;
      }
      case 'pen': {
        if (!el.points || el.points.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (var i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i].x, el.points[i].y);
        }
        ctx.stroke();
        break;
      }
      case 'text': {
        ctx.font = (el.fontSize || 18) + 'px sans-serif';
        ctx.fillStyle = el.color || '#000';
        ctx.fillText(el.text || '', el.x, el.y);
        break;
      }
    }

    ctx.restore();

    // Selection handles
    if (isSelected) {
      drawSelectionHandles(el);
    }
  }

  function drawArrowhead(ctx, x1, y1, x2, y2, color) {
    var headLen = 12;
    var angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 6),
      y2 - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 6),
      y2 - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawSelectionHandles(el) {
    ctx.save();
    ctx.strokeStyle = '#3498db';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    var bx, by, bw, bh;
    switch (el.type) {
      case 'rectangle':
        bx = el.w >= 0 ? el.x : el.x + el.w;
        by = el.h >= 0 ? el.y : el.y + el.h;
        bw = Math.abs(el.w);
        bh = Math.abs(el.h);
        break;
      case 'circle':
        bx = el.x - el.rx;
        by = el.y - el.ry;
        bw = el.rx * 2;
        bh = el.ry * 2;
        break;
      case 'line':
      case 'arrow':
        bx = Math.min(el.x1, el.x2);
        by = Math.min(el.y1, el.y2);
        bw = Math.abs(el.x2 - el.x1);
        bh = Math.abs(el.y2 - el.y1);
        break;
      case 'pen': {
        if (!el.points || el.points.length === 0) { ctx.restore(); return; }
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var i = 0; i < el.points.length; i++) {
          if (el.points[i].x < minX) minX = el.points[i].x;
          if (el.points[i].y < minY) minY = el.points[i].y;
          if (el.points[i].x > maxX) maxX = el.points[i].x;
          if (el.points[i].y > maxY) maxY = el.points[i].y;
        }
        bx = minX; by = minY; bw = maxX - minX; bh = maxY - minY;
        break;
      }
      case 'text':
        ctx.font = (el.fontSize || 18) + 'px sans-serif';
        var m = ctx.measureText(el.text || '');
        bx = el.x; by = el.y - (el.fontSize || 18); bw = m.width; bh = (el.fontSize || 18) + 4;
        break;
      default:
        ctx.restore();
        return;
    }

    ctx.strokeRect(bx - 2, by - 2, bw + 4, bh + 4);
    ctx.setLineDash([]);

    // Corner handles
    var handleSize = 6;
    ctx.fillStyle = '#3498db';
    var corners = [
      [bx - 2, by - 2],
      [bx + bw + 2, by - 2],
      [bx - 2, by + bh + 2],
      [bx + bw + 2, by + bh + 2]
    ];
    for (var c = 0; c < corners.length; c++) {
      ctx.fillRect(corners[c][0] - handleSize / 2, corners[c][1] - handleSize / 2, handleSize, handleSize);
    }

    ctx.restore();
  }

  function exportToDataURL() {
    return new Promise(function (resolve) {
      var tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvasEl.width;
      tempCanvas.height = canvasEl.height;
      var tempCtx = tempCanvas.getContext('2d');

      // White background
      tempCtx.fillStyle = '#ffffff';
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

      // Replay all drawing
      for (var i = 0; i < elements.length; i++) {
        drawElementOnCtx(tempCtx, elements[i]);
      }

      tempCanvas.toBlob(function (blob) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.readAsDataURL(blob);
      }, 'image/png');
    });
  }

  function drawElementOnCtx(c, el) {
    c.save();
    c.strokeStyle = el.color || '#000';
    c.lineWidth = el.lineWidth || 2;
    c.fillStyle = (el.fill && el.fill !== 'transparent') ? el.fill : 'transparent';

    switch (el.type) {
      case 'rectangle':
        var x = el.w >= 0 ? el.x : el.x + el.w;
        var y = el.h >= 0 ? el.y : el.y + el.h;
        var w = Math.abs(el.w);
        var h = Math.abs(el.h);
        if (el.fill && el.fill !== 'transparent') c.fillRect(x, y, w, h);
        c.strokeRect(x, y, w, h);
        break;
      case 'circle':
        c.beginPath();
        c.ellipse(el.x, el.y, Math.max(el.rx, 1), Math.max(el.ry, 1), 0, 0, Math.PI * 2);
        if (el.fill && el.fill !== 'transparent') c.fill();
        c.stroke();
        break;
      case 'line':
        c.beginPath(); c.moveTo(el.x1, el.y1); c.lineTo(el.x2, el.y2); c.stroke();
        break;
      case 'arrow':
        c.beginPath(); c.moveTo(el.x1, el.y1); c.lineTo(el.x2, el.y2); c.stroke();
        drawArrowhead(c, el.x1, el.y1, el.x2, el.y2, el.color || '#000');
        break;
      case 'pen':
        if (!el.points || el.points.length < 2) break;
        c.beginPath(); c.moveTo(el.points[0].x, el.points[0].y);
        for (var i = 1; i < el.points.length; i++) c.lineTo(el.points[i].x, el.points[i].y);
        c.stroke();
        break;
      case 'text':
        c.font = (el.fontSize || 18) + 'px sans-serif';
        c.fillStyle = el.color || '#000';
        c.fillText(el.text || '', el.x, el.y);
        break;
    }
    c.restore();
  }

  function embedToMarkdown() {
    if (elements.length === 0) {
      MR.Util.showToast('画布为空，请先绘制内容', 'warning');
      return;
    }
    exportToDataURL().then(function (dataUrl) {
      var mdImage = '\n![excalidraw-diagram](' + dataUrl + ')';
      var editor = document.getElementById('editor');
      var start = editor.selectionStart;
      var end = editor.selectionEnd;
      var text = editor.value;
      editor.value = text.substring(0, start) + mdImage + '\n' + text.substring(end);
      editor.selectionStart = editor.selectionEnd = start + mdImage.length + 1;
      editor.dispatchEvent(new Event('input'));
      hide();
      if (editor) editor.focus();
      MR.Util.showToast('已嵌入绘图到编辑器', 'success');
    });
  }

  return {
    init: init,
    show: show,
    hide: hide,
    isVisible: false,
    exportToDataURL: exportToDataURL
  };
})();


/* ============================================================
   MR.Util - Utility Functions
   ============================================================ */
MR.Util = (function () {
  function showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toast-container');
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(function () { toast.remove(); }, 300);
    }, 2500);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  return {
    showToast: showToast,
    escapeHtml: escapeHtml
  };
})();


/* ============================================================
   MR.Storage - LocalStorage Auto-Save
   ============================================================ */
MR.Storage = (function () {
  var CONTENT_KEY = 'mermaid-editor-content';
  var FILE_KEY = 'mermaid-editor-filename';
  var TABS_KEY = 'mermaid-editor-tabs-v1';
  var THEME_KEY = 'mermaid-editor-theme';
  var saveTimer = null;

  function saveContent(content, filename) {
    try {
      localStorage.setItem(CONTENT_KEY, content || '');
      if (filename) localStorage.setItem(FILE_KEY, filename);
    } catch (e) { /* quota exceeded or disabled */ }
  }

  function saveCustomCSS(css) {
    try { localStorage.setItem('mermaid-editor-custom-css', css || ''); } catch (e) {}
  }

  function loadCustomCSS() {
    try { return localStorage.getItem('mermaid-editor-custom-css') || ''; } catch (e) { return ''; }
  }

  function loadContent() {
    try {
      var content = localStorage.getItem(CONTENT_KEY);
      var filename = localStorage.getItem(FILE_KEY);
      return { content: content, filename: filename };
    } catch (e) {
      return { content: null, filename: null };
    }
  }

  function saveTabs(tabs, activeIndex) {
    try {
      var serializableTabs = (tabs || []).map(function (tab) {
        return {
          id: tab.id,
          name: tab.name,
          content: tab.content || ''
        };
      });
      localStorage.setItem(TABS_KEY, JSON.stringify({
        activeIndex: activeIndex || 0,
        tabs: serializableTabs
      }));
    } catch (e) { /* quota exceeded or disabled */ }
  }

  function loadTabs() {
    try {
      var raw = localStorage.getItem(TABS_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return null;
      return {
        activeIndex: Math.max(0, Math.min(parsed.activeIndex || 0, parsed.tabs.length - 1)),
        tabs: parsed.tabs.map(function (tab) {
          return {
            id: tab.id || '',
            name: tab.name || 'untitled.md',
            content: tab.content || '',
            fileHandle: null
          };
        })
      };
    } catch (e) {
      return null;
    }
  }

  function clearContent() {
    try {
      localStorage.removeItem(CONTENT_KEY);
      localStorage.removeItem(FILE_KEY);
      localStorage.removeItem(TABS_KEY);
    } catch (e) {}
  }

  function saveTheme(theme) {
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  }

  function loadTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'default'; } catch (e) { return 'default'; }
  }

  return {
    saveContent: saveContent,
    loadContent: loadContent,
    saveTabs: saveTabs,
    loadTabs: loadTabs,
    clearContent: clearContent,
    saveTheme: saveTheme,
    loadTheme: loadTheme,
    saveCustomCSS: saveCustomCSS,
    loadCustomCSS: loadCustomCSS
  };
})();


/* ============================================================
   MR.StatusBar - Status Bar Updates
   ============================================================ */
MR.StatusBar = (function () {
  var fileEl, statsEl, mermaidEl, cursorEl;
  var currentFile = 'untitled.md';
  var autoSaveEl = null;
  var autoSaveTimer = null;

  function init() {
    fileEl = document.getElementById('status-file');
    statsEl = document.getElementById('status-stats');
    mermaidEl = document.getElementById('status-mermaid');

    // Add cursor position element
    cursorEl = document.createElement('span');
    cursorEl.id = 'status-cursor';
    cursorEl.textContent = '行: 1  列: 1';
    document.getElementById('status-bar').appendChild(cursorEl);
  }

  function setFileName(name) {
    currentFile = name;
    fileEl.textContent = '\uD83D\uDCC4 ' + name;
  }

  function updateStats(text) {
    var lines = text === '' ? 0 : text.split('\n').length;
    // Count words: for CJK, count each character as a word; for others, split by whitespace
    var wordCount = 0;
    if (text.trim()) {
      // Remove CJK characters, count them individually
      var cjkChars = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || [];
      var cjkCount = cjkChars.length;
      // For non-CJK text, split by whitespace
      var nonCJKText = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ');
      var nonCJKWords = nonCJKText.trim() ? nonCJKText.trim().split(/\s+/).length : 0;
      wordCount = cjkCount + nonCJKWords;
    }
    statsEl.textContent = '\u5B57\u6570: ' + wordCount + ' | \u7B26: ' + text.length + ' | \u884C\u6570: ' + lines;
  }

  function updateCursor(pos) {
    cursorEl.textContent = '\u884C: ' + pos.line + '  \u5217: ' + pos.col;
  }

  function updateMermaidCount(count) {
    mermaidEl.textContent = '\uD83E\uDDE9 Mermaid: ' + count + ' \u4E2A\u56FE\u8868';
  }

  function showAutoSave() {
    if (!autoSaveEl) {
      autoSaveEl = document.createElement('span');
      autoSaveEl.id = 'status-autosave';
      autoSaveEl.style.color = '#22c55e';
      autoSaveEl.style.fontSize = '11px';
      document.getElementById('status-bar').appendChild(autoSaveEl);
    }
    autoSaveEl.textContent = '\u2713 \u5DF2\u81EA\u52A8\u4FDD\u5B58';
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(function () {
      if (autoSaveEl) autoSaveEl.textContent = '';
    }, 3000);
  }

  return {
    init: init,
    setFileName: setFileName,
    updateStats: updateStats,
    updateCursor: updateCursor,
    updateMermaidCount: updateMermaidCount,
    showAutoSave: showAutoSave,
    getCurrentFile: function () { return currentFile; }
  };
})();


/* ============================================================
   MR.Templates - Mermaid Template Inserter
   ============================================================ */
MR.Templates = (function () {
  var templates = [
    {
      name: '流程图',
      desc: '适合业务流程、状态流转、审批链路',
      content: '```mermaid\ngraph TD;\n  A[开始] --> B{是否通过};\n  B -->|是| C[执行处理];\n  B -->|否| D[返回修改];\n  C --> E[结束];\n```'
    },
    {
      name: '时序图',
      desc: '适合接口调用、系统交互、消息流',
      content: '```mermaid\nsequenceDiagram;\n  participant U as 用户;\n  participant A as 前端;\n  participant S as 服务端;\n  U->>A: 提交请求;\n  A->>S: 调用 API;\n  S-->>A: 返回结果;\n  A-->>U: 展示结果;\n```'
    },
    {
      name: '甘特图',
      desc: '适合项目计划、里程碑、排期说明',
      content: '```mermaid\ngantt\n  title 项目计划\n  dateFormat  YYYY-MM-DD\n  section 阶段一\n  需求梳理 :a1, 2026-01-01, 5d\n  原型设计 :a2, after a1, 4d\n  section 阶段二\n  开发实现 :b1, after a2, 10d\n  测试验收 :b2, after b1, 5d\n```'
    },
    {
      name: '类图',
      desc: '适合领域模型、类关系、接口关系',
      content: '```mermaid\nclassDiagram\n  class Document {\n    +String title\n    +String content\n    +render()\n  }\n  class Renderer {\n    +renderMarkdown()\n    +renderMermaid()\n  }\n  Document --> Renderer\n```'
    }
  ];

  function init() {
    var openBtn = document.getElementById('btn-templates');
    var modal = document.getElementById('templates-modal');
    var grid = document.getElementById('templates-grid');
    var closeBtn = document.getElementById('btn-templates-close');
    if (!openBtn || !modal || !grid) return;

    grid.innerHTML = '';
    templates.forEach(function (tpl) {
      var btn = document.createElement('button');
      btn.className = 'template-card';
      btn.innerHTML = '<span class="template-card-title">' + MR.Util.escapeHtml(tpl.name) + '</span>' +
        '<span class="template-card-desc">' + MR.Util.escapeHtml(tpl.desc) + '</span>';
      btn.addEventListener('click', function () {
        MR.Editor.insertText('\n' + tpl.content + '\n');
        modal.classList.add('hidden');
        MR.Util.showToast('已插入' + tpl.name + '模板', 'success');
      });
      grid.appendChild(btn);
    });

    openBtn.addEventListener('click', function () {
      modal.classList.remove('hidden');
    });
    if (closeBtn) closeBtn.addEventListener('click', function () { modal.classList.add('hidden'); });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.classList.add('hidden'); });
  }

  return { init: init };
})();


/* ============================================================
   MR.SplitPane - Resizable Split Panes
   ============================================================ */
MR.SplitPane = (function () {
  var container, divider, leftPane, rightPane;
  var isDragging = false;

  function init() {
    container = document.getElementById('main-container');
    divider = document.getElementById('divider');
    leftPane = document.getElementById('editor-pane');
    rightPane = document.getElementById('preview-pane');

    divider.addEventListener('mousedown', startDrag);
    divider.addEventListener('dblclick', resetSplit);
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);

    // Touch support
    divider.addEventListener('touchstart', function (e) {
      startDrag(e.touches[0]);
      e.preventDefault();
    });
    document.addEventListener('touchmove', function (e) {
      onDrag(e.touches[0]);
    });
    document.addEventListener('touchend', stopDrag);
  }

  function startDrag(e) {
    isDragging = true;
    divider.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function onDrag(e) {
    if (!isDragging) return;
    var rect = container.getBoundingClientRect();
    var isMobile = window.innerWidth <= 768;
    var pct;
    if (isMobile) {
      pct = ((e.clientY - rect.top) / rect.height) * 100;
    } else {
      pct = ((e.clientX - rect.left) / rect.width) * 100;
    }
    pct = Math.max(20, Math.min(80, pct));

    if (isMobile) {
      leftPane.style.flex = 'none';
      rightPane.style.flex = 'none';
      leftPane.style.height = pct + '%';
      rightPane.style.height = (100 - pct) + '%';
    } else {
      leftPane.style.flex = 'none';
      rightPane.style.flex = 'none';
      leftPane.style.width = pct + '%';
      rightPane.style.width = (100 - pct) + '%';
    }
  }

  function stopDrag() {
    if (isDragging) {
      isDragging = false;
      divider.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  }

  function resetSplit() {
    leftPane.style.flex = '1';
    rightPane.style.flex = '1';
    leftPane.style.width = '';
    rightPane.style.width = '';
    leftPane.style.height = '';
    rightPane.style.height = '';
  }

  return { init: init };
})();


/* ============================================================
   MR.FileManager - File Open / Save / Drag & Drop
   ============================================================ */
MR.FileManager = (function () {
  var fileInput;

  function init() {
    fileInput = document.getElementById('file-input');

    // Open button - use File System Access API with fallback
    initOpenButton();

    fileInput.addEventListener('change', handleFileSelect);

    // Save button
    document.getElementById('btn-save').addEventListener('click', saveFile);

    // Drag and drop
    setupDragDrop();

    // Image paste
    setupImagePaste();

    // Image file input
    document.getElementById('image-input').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (file) embedImage(file);
      this.value = '';
    });

    // File System Access API
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
    });

    // Show tab bar
    document.getElementById('tab-bar').classList.remove('hidden');
  }

  function handleFileSelect(e) {
    var file = e.target.files[0];
    if (!file) return;
    loadFile(file);
    fileInput.value = '';
  }

  function loadFile(file) {
    // Validate extension
    var name = file.name.toLowerCase();
    if (!name.endsWith('.md') && !name.endsWith('.markdown')) {
      MR.Util.showToast('请选择 .md 格式的文件', 'error');
      return;
    }

    // Check size
    if (file.size > 10 * 1024 * 1024) {
      MR.Util.showToast('文件较大（超过10MB），可能影响性能', 'warning');
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      var content = e.target.result;

      // Check for binary content
      if (content.indexOf('\0') >= 0) {
        MR.Util.showToast('文件似乎是二进制文件，无法打开', 'error');
        return;
      }

      MR.Tabs.addTab(file.name, content);
      MR.Tabs.selectTab(MR.Tabs.tabs.length - 1);
    };
    reader.onerror = function () {
      MR.Util.showToast('文件读取失败', 'error');
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function saveFile() {
    var content = MR.Editor.getContent();
    if (!content) { MR.Util.showToast('内容为空', 'warning'); return; }

    // Try File System Access API first
    var currentFileHandle = MR.Tabs.getCurrentFileHandle();
    if (currentFileHandle && 'showSaveFilePicker' in window) {
      try {
        var writable = await currentFileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        MR.Tabs.markSaved();
        MR.Util.showToast('文件已保存', 'success');
        return;
      } catch (e) { /* fallback to download */ }
    }

    // Fallback: download blob
    var name = MR.Tabs.getCurrentName() || 'untitled.md';
    var blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, name);
    MR.Tabs.markSaved();
    MR.Util.showToast('文件已保存', 'success');
  }

  function setupDragDrop() {
    var dragOverlay = document.getElementById('drag-overlay');
    var dragEnterCount = 0;

    document.addEventListener('dragenter', function (e) {
      e.preventDefault();
      dragEnterCount++;
      dragOverlay.classList.remove('hidden');
    });

    document.addEventListener('dragover', function (e) {
      e.preventDefault();
    });

    document.addEventListener('dragleave', function (e) {
      e.preventDefault();
      dragEnterCount--;
      if (dragEnterCount <= 0) {
        dragEnterCount = 0;
        dragOverlay.classList.add('hidden');
      }
    });

    document.addEventListener('drop', function (e) {
      e.preventDefault();
      dragEnterCount = 0;
      dragOverlay.classList.add('hidden');

      var files = Array.from(e.dataTransfer.files);
      var mdFile = files.find(function (f) {
        return f.name.toLowerCase().endsWith('.md') || f.name.toLowerCase().endsWith('.markdown');
      });
      var imgFile = files.find(function (f) {
        return f.type && f.type.startsWith('image/');
      });

      if (mdFile) {
        loadFile(mdFile);
      } else if (imgFile) {
        embedImage(imgFile);
      } else {
        MR.Util.showToast('请拖入 .md 或图片文件', 'error');
      }
    });
  }

  function setupImagePaste() {
    document.getElementById('editor').addEventListener('paste', function (e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') === 0) {
          e.preventDefault();
          var file = items[i].getAsFile();
          if (file) embedImage(file);
          return;
        }
      }
    });
  }

  function embedImage(file) {
    if (!file.type.match(/^image\//)) {
      MR.Util.showToast('不支持的图片格式', 'error');
      return;
    }
    var sizeKB = Math.round(file.size / 1024);
    if (file.size > 2 * 1024 * 1024) {
      var ok = confirm('图片约 ' + Math.round(sizeKB / 1024) + 'MB，内嵌到 Markdown 会明显增大文件体积。是否压缩后继续嵌入？');
      if (!ok) {
        MR.Util.showToast('已取消图片嵌入', 'info');
        return;
      }
    }
    MR.Util.showToast('正在嵌入图片 (' + sizeKB + 'KB)...', 'info');
    // Compress large images
    var reader = new FileReader();
    reader.onload = function (e) {
      var dataUrl = e.target.result;
      // If too large, compress
      if (dataUrl.length > 500000) {
        compressImage(dataUrl, function (compressed) {
          insertImageMd(compressed, file.name, dataUrl.length, compressed.length);
        });
      } else {
        insertImageMd(dataUrl, file.name, dataUrl.length, dataUrl.length);
      }
    };
    reader.readAsDataURL(file);
  }

  function compressImage(dataUrl, callback) {
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement('canvas');
      var MAX = 1200;
      var w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        var ratio = Math.min(MAX / w, MAX / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
  }

  function insertImageMd(dataUrl, fileName, originalLength, finalLength) {
    var alt = (fileName || 'image').replace(/\.[^.]+$/, '').replace(/[\[\]\(\)]/g, '');
    var md = '\n![' + alt + '](' + dataUrl + ')\n';
    var editor = document.getElementById('editor');
    var start = editor.selectionStart;
    var end = editor.selectionEnd;
    editor.value = editor.value.substring(0, start) + md + editor.value.substring(end);
    editor.selectionStart = editor.selectionEnd = start + md.length;
    editor.dispatchEvent(new Event('input'));
    if (originalLength && finalLength && finalLength < originalLength) {
      var pct = Math.round((1 - finalLength / originalLength) * 100);
      MR.Util.showToast('图片已压缩并嵌入，体积减少约 ' + pct + '%', 'success');
    } else {
      MR.Util.showToast('图片已嵌入', 'success');
    }
  }

  async function openWithFileSystemAPI() {
    if (!('showOpenFilePicker' in window)) return false;
    try {
      var handles = await window.showOpenFilePicker({
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }],
        multiple: false
      });
      if (handles.length === 0) return true;
      var fileHandle = handles[0];
      var file = await fileHandle.getFile();
      var content = await file.text();
      MR.Tabs.addTab(file.name, content, fileHandle);
      MR.Tabs.selectTab(MR.Tabs.tabs.length - 1);
      MR.Util.showToast('已打开: ' + file.name, 'success');
      return true;
    } catch (e) { return e.name === 'AbortError' ? true : false; }
  }

  // Override open button to use File System API
  function initOpenButton() {
    document.getElementById('btn-open').addEventListener('click', async function () {
      var used = await openWithFileSystemAPI();
      if (!used) document.getElementById('file-input').click();
    });
  }

  function tryOpenFile() {
    if ('showOpenFilePicker' in window) {
      return openWithFileSystemAPI().then(function (used) {
        if (!used) document.getElementById('file-input').click();
      });
    }
    document.getElementById('file-input').click();
    return Promise.resolve();
  }

  return { init: init, loadFile: loadFile, embedImage: embedImage, tryOpenFile: tryOpenFile };
})();


/* ============================================================
   MR.Editor - Textarea Management
   ============================================================ */
MR.Editor = (function () {
  var textarea, lineNumbersEl;
  var cursorCallback = null;
  var focusMode = false;

  function init() {
    textarea = document.getElementById('editor');
    lineNumbersEl = document.getElementById('line-numbers');

    // Tab to spaces + auto-pairing
    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        insertText('    ');
      }
      // Auto-pairing
      autoPair(e);
    });

    // Line numbers
    textarea.addEventListener('scroll', syncLineNumbers);
    textarea.addEventListener('input', function () {
      updateLineNumbers();
      MR.Tabs.updateContent(textarea.value);
    });
    textarea.addEventListener('keyup', notifyCursor);
    textarea.addEventListener('click', function () {
      updateLineNumbers();
      notifyCursor();
    });
    textarea.addEventListener('selectionchange', notifyCursor);

    // Font size slider
    var slider = document.getElementById('font-size-slider');
    if (slider) {
      slider.addEventListener('input', function () {
        textarea.style.fontSize = this.value + 'px';
        lineNumbersEl.style.fontSize = this.value + 'px';
        updateLineNumbers();
      });
    }

    // Markdown toolbar buttons
    document.getElementById('md-toolbar').addEventListener('click', function (e) {
      var btn = e.target.closest('.md-btn');
      if (!btn) return;
      var md = btn.getAttribute('data-md');
      var wrap = btn.getAttribute('data-wrap');
      var start = textarea.selectionStart;
      var end = textarea.selectionEnd;
      var selected = textarea.value.substring(start, end);

      // Special case: code block
      if (md === 'codeblock') {
        md = '\n```\n' + (selected || 'code') + '\n```\n';
        textarea.value = textarea.value.substring(0, start) + md + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + md.length;
        textarea.dispatchEvent(new Event('input'));
        textarea.focus();
        return;
      }

      if (wrap) {
        // Wrap selection
        var inserted = wrap + selected + wrap.split('').reverse().join('');
        textarea.value = textarea.value.substring(0, start) + inserted + textarea.value.substring(end);
        if (selected) {
          textarea.selectionStart = start + wrap.length;
          textarea.selectionEnd = start + wrap.length + selected.length;
        } else {
          textarea.selectionStart = start + wrap.length;
          textarea.selectionEnd = start + wrap.length;
        }
      } else {
        // Insert prefix
        textarea.value = textarea.value.substring(0, start) + md + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + md.length;
      }
      textarea.dispatchEvent(new Event('input'));
      textarea.focus();
    });

    // Focus mode button
    document.getElementById('btn-focus').addEventListener('click', toggleFocus);

    // Initial line numbers
    updateLineNumbers();

    // Search
    initSearch();
  }

  function autoPair(e) {
    var pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
    var char = e.key;
    if (char.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!pairs[char]) return;
    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;
    var text = textarea.value;
    if (char.match(/['"`]/) && text[start] && text[start].match(/[\w]/)) return;
    var pair = pairs[char];
    // For symmetric pairs, skip if cursor is before a matching closing char
    if (start === end && char === pair && text[start] === char) {
      textarea.selectionStart = textarea.selectionEnd = start + 1;
      e.preventDefault();
      return;
    }
    e.preventDefault();
    if (start === end) {
      textarea.value = text.substring(0, start) + char + pair + text.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 1;
    } else {
      textarea.value = text.substring(0, start) + char + text.substring(start, end) + pair + text.substring(end);
      textarea.selectionStart = start + 1;
      textarea.selectionEnd = end + 1;
    }
    textarea.dispatchEvent(new Event('input'));
  }

  function insertText(text) {
    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;
    textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.dispatchEvent(new Event('input'));
  }

  function toggleFocus() {
    focusMode = !focusMode;
    document.body.classList.toggle('focus-mode', focusMode);
    MR.Util.showToast(focusMode ? '专注模式已开启' : '专注模式已关闭', 'info');
  }

  function updateLineNumbers() {
    if (!lineNumbersEl || !textarea) return;
    var lines = textarea.value.split('\n');
    // Only rebuild if count changed (performance optimization)
    var currentCount = lineNumbersEl.children.length;
    if (currentCount !== lines.length) {
      var html = '';
      for (var i = 1; i <= lines.length; i++) {
        html += '<span>' + i + '</span>';
      }
      lineNumbersEl.innerHTML = html;
    }
    syncLineNumbers();
    var cursorLine = textarea.value.substring(0, textarea.selectionStart).split('\n').length;
    var spans = lineNumbersEl.querySelectorAll('span');
    // Only update active class for changed lines
    for (var si = 0; si < spans.length; si++) {
      var shouldBeActive = si + 1 === cursorLine;
      if (spans[si].classList.contains('active') !== shouldBeActive) {
        spans[si].classList.toggle('active', shouldBeActive);
      }
    }
  }

  function syncLineNumbers() {
    if (!lineNumbersEl || !textarea) return;
    lineNumbersEl.scrollTop = textarea.scrollTop;
  }

  function notifyCursor() {
    updateLineNumbers();
    if (cursorCallback) cursorCallback(getCursorPosition());
  }

  function onCursorChange(callback) {
    cursorCallback = callback;
  }

  function getContent() {
    return textarea.value;
  }

  function setContent(text) {
    textarea.value = text;
  }

  // Search
  var searchMatches = [];
  var searchCurrent = -1;

  function initSearch() {
    var searchBar = document.getElementById('search-bar');
    var searchInput = document.getElementById('search-input');
    var searchCount = document.getElementById('search-count');
    var searchPrev = document.getElementById('search-prev');
    var searchNext = document.getElementById('search-next');
    var searchClose = document.getElementById('search-close');

    function doSearch() {
      var query = searchInput.value;
      if (!query) {
        searchMatches = [];
        searchCurrent = -1;
        searchCount.textContent = '0/0';
        clearHighlights();
        return;
      }
      var text = textarea.value;
      var idx = 0;
      var matches = [];
      var lowerText = text.toLowerCase();
      var lowerQuery = query.toLowerCase();
      while ((idx = lowerText.indexOf(lowerQuery, idx)) !== -1) {
        matches.push(idx);
        idx += query.length;
      }
      searchMatches = matches;
      searchCurrent = matches.length > 0 ? 0 : -1;
      searchCount.textContent = (searchCurrent >= 0 ? (searchCurrent + 1) : 0) + '/' + matches.length;
      highlightMatches(query, matches);
      if (matches.length > 0) {
        textarea.selectionStart = matches[0];
        textarea.selectionEnd = matches[0] + query.length;
        textarea.focus();
      }
    }

    function highlightMatches(query, matches) {
      clearHighlights();
      var text = textarea.value;
      if (!query || matches.length === 0) return;
      // Use selection only for navigation - don't modify textarea value
    }

    function clearHighlights() {
      // No-op - we use selection for navigation
    }

    searchInput.addEventListener('input', doSearch);
    searchPrev.addEventListener('click', function () {
      if (searchMatches.length === 0) return;
      searchCurrent = (searchCurrent - 1 + searchMatches.length) % searchMatches.length;
      var pos = searchMatches[searchCurrent];
      textarea.selectionStart = pos;
      textarea.selectionEnd = pos + searchInput.value.length;
      textarea.focus();
      searchCount.textContent = (searchCurrent + 1) + '/' + searchMatches.length;
    });
    searchNext.addEventListener('click', function () {
      if (searchMatches.length === 0) return;
      searchCurrent = (searchCurrent + 1) % searchMatches.length;
      var pos = searchMatches[searchCurrent];
      textarea.selectionStart = pos;
      textarea.selectionEnd = pos + searchInput.value.length;
      textarea.focus();
      searchCount.textContent = (searchCurrent + 1) + '/' + searchMatches.length;
    });
    searchClose.addEventListener('click', function () {
      searchBar.classList.add('hidden');
      clearHighlights();
      textarea.focus();
    });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) searchPrev.click();
        else searchNext.click();
      }
      if (e.key === 'Escape') searchClose.click();
    });
  }

  function toggleSearch() {
    var searchBar = document.getElementById('search-bar');
    var searchInput = document.getElementById('search-input');
    var isHidden = searchBar.classList.contains('hidden');
    searchBar.classList.toggle('hidden');
    if (isHidden) {
      // Pre-select current word
      var selected = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
      if (selected && !selected.includes('\n')) searchInput.value = selected;
      searchInput.focus();
      searchInput.select();
      searchInput.dispatchEvent(new Event('input'));
    } else {
      textarea.focus();
    }
  }

  function getCursorPosition() {
    var text = textarea.value.substring(0, textarea.selectionStart);
    var lines = text.split('\n');
    return {
      line: lines.length,
      col: lines[lines.length - 1].length + 1
    };
  }

  return {
    init: init,
    getContent: getContent,
    setContent: setContent,
    getCursorPosition: getCursorPosition,
    onCursorChange: onCursorChange,
    updateLineNumbers: updateLineNumbers,
    insertText: insertText,
    toggleFocus: toggleFocus,
    toggleSearch: toggleSearch,
    initSearch: initSearch,
    get textarea() { return textarea; }
  };
})();


/* ============================================================
   MR.Renderer - Markdown Rendering Pipeline
   ============================================================ */
MR.Renderer = (function () {
  var previewEl;
  var renderTimeout = null;
  var mermaidInitialized = false;
  var currentTheme = 'default';
  var customStyleEl = null;
  var mermaidRenderCounter = 0;

  function init() {
    previewEl = document.getElementById('preview');

    // Custom CSS support
    customStyleEl = document.createElement('style');
    customStyleEl.id = 'custom-preview-css';
    document.head.appendChild(customStyleEl);
    var savedCss = MR.Storage.loadCustomCSS();
    if (savedCss) {
      customStyleEl.textContent = savedCss;
      var input = document.getElementById('custom-css-input');
      if (input) input.value = savedCss;
    }
    var cssInput = document.getElementById('custom-css-input');
    if (cssInput) {
      cssInput.addEventListener('input', function () {
        customStyleEl.textContent = this.value;
        MR.Storage.saveCustomCSS(this.value);
      });
    }
    var cssReset = document.getElementById('btn-css-reset');
    if (cssReset) {
      cssReset.addEventListener('click', function () {
        var input = document.getElementById('custom-css-input');
        if (input) input.value = '';
        customStyleEl.textContent = '';
        MR.Storage.saveCustomCSS('');
        MR.Util.showToast('自定义 CSS 已重置', 'info');
      });
    }
    var cssClose = document.getElementById('btn-css-close');
    if (cssClose) {
      cssClose.addEventListener('click', function () {
        document.getElementById('css-modal').classList.add('hidden');
      });
    }
    var cssOpen = document.getElementById('btn-custom-css');
    if (cssOpen) {
      cssOpen.addEventListener('click', function () {
        var modal = document.getElementById('css-modal');
        var input = document.getElementById('custom-css-input');
        modal.classList.remove('hidden');
        if (input) input.focus();
      });
    }

    // Initialize mermaid
    mermaid.initialize({
      startOnLoad: false,
      theme: currentTheme,
      securityLevel: 'strict',
      fontFamily: 'sans-serif'
    });
    mermaidInitialized = true;

    // Debounced render on input
    document.getElementById('editor').addEventListener('input', function () {
      var text = this.value;
      MR.StatusBar.updateStats(text);
      scheduleRender(text);
      // Trigger auto-save
      MR.Storage.saveContent(text, MR.StatusBar.getCurrentFile());
      MR.StatusBar.showAutoSave();
    });
  }

  function setTheme(theme) {
    if (theme === currentTheme) return;
    currentTheme = theme;
    mermaid.initialize({
      startOnLoad: false,
      theme: theme,
      securityLevel: 'strict',
      fontFamily: 'sans-serif'
    });
    // Re-render current content
    var content = MR.Editor.getContent();
    if (content) renderAll(content);
    MR.Storage.saveTheme(theme);
  }

  function getTheme() {
    return currentTheme;
  }

  function scheduleRender(text) {
    var statusEl = document.getElementById('render-status');
    if (renderTimeout) clearTimeout(renderTimeout);
    statusEl.textContent = '渲染中...';
    statusEl.className = 'render-status rendering';
    renderTimeout = setTimeout(function () {
      renderAll(text);
    }, 300);
  }

  function renderAll(markdownText) {
    var statusEl = document.getElementById('render-status');

    if (!markdownText || markdownText.trim() === '') {
      previewEl.innerHTML = '<div class="preview-placeholder">暂无预览内容</div>';
      MR.StatusBar.updateMermaidCount(0);
      statusEl.textContent = '';
      statusEl.className = 'render-status';
      return;
    }

    try {
      // Step 1: Markdown to HTML
      var html = marked.parse(markdownText, { breaks: true, gfm: true });
      html = MR.Sanitizer.sanitize(html);

      // Step 2: Insert into preview
      previewEl.innerHTML = html;

      // Step 3: Process mermaid blocks
      var mermaidCount = 0;
      var mermaidBlocks = previewEl.querySelectorAll('code.language-mermaid');
      var mermaidPromises = [];

      if (typeof mermaid === 'undefined') {
        // Mermaid library not loaded - show error in place of diagrams
        mermaidBlocks.forEach(function (b) {
          var pre = b.parentNode;
          if (pre && pre.tagName === 'PRE') {
            var note = document.createElement('div');
            note.className = 'mermaid-error';
            note.innerHTML = '<strong>Mermaid 库未加载</strong><br>图表无法渲染';
            pre.parentNode.replaceChild(note, pre);
          }
        });
      } else if (mermaidBlocks.length > 0) {
        mermaidBlocks.forEach(function (codeBlock, index) {
          var diagramText = codeBlock.textContent.trim();
          if (!diagramText) return;

          var id = 'mermaid-' + (++mermaidRenderCounter);
          var wrapper = document.createElement('div');
          wrapper.className = 'mermaid-wrapper';

          // Export button
          var exportBtn = document.createElement('button');
          exportBtn.className = 'mermaid-export-btn';
          exportBtn.textContent = '导出 PNG';
          exportBtn.title = '导出此图表为 PNG 图片';
          wrapper.appendChild(exportBtn);

          var svgContainer = document.createElement('div');
          svgContainer.className = 'mermaid-svg-container';
          wrapper.appendChild(svgContainer);

          // Replace entire <pre> block with wrapper
          var pre = codeBlock.parentNode;
          if (pre && pre.tagName === 'PRE') {
            pre.parentNode.replaceChild(wrapper, pre);
          } else {
            codeBlock.parentNode.replaceChild(wrapper, codeBlock);
          }

          mermaidCount++;

          // Show loading placeholder
          svgContainer.innerHTML = '<div style="padding:20px;color:#666;font-size:13px;">渲染图表中...</div>';

          // Render with mermaid
          var p = mermaid.render(id, diagramText)
            .then(function (result) {
              svgContainer.innerHTML = typeof result === 'string' ? result : result.svg;
              var svg = svgContainer.querySelector('svg');
              if (svg) {
                svg.style.maxWidth = '100%';
                svg.style.height = 'auto';
              }
              if (result.bindFunctions) {
                try { result.bindFunctions(svgContainer); } catch (e) { /* ignore */ }
              }
            })
            .catch(function (err) {
              svgContainer.innerHTML = buildMermaidErrorHTML(err, diagramText);
            });

          mermaidPromises.push(p);

          // Wire export button (after render completes)
          p.then(function () {
            exportBtn.addEventListener('click', function (e) {
              e.stopPropagation();
              MR.Export.exportMermaidPNG(wrapper);
            });
          });
        });
      }

      // Step 4: Highlight code blocks (non-mermaid)
      previewEl.querySelectorAll('pre code').forEach(function (codeBlock) {
        // Skip mermaid blocks (already processed)
        if (codeBlock.className.includes('language-mermaid')) return;
        try {
          hljs.highlightElement(codeBlock);
          // Add language badge to parent <pre>
          var pre = codeBlock.parentElement;
          if (pre && pre.tagName === 'PRE') {
            var lang = '';
            codeBlock.className.split(' ').forEach(function (cls) {
              if (cls.startsWith('language-')) {
                lang = cls.replace('language-', '');
              }
            });
            if (lang) {
              pre.setAttribute('data-language', lang);
            }
            // Add copy button if not already present
            if (!pre.querySelector('.copy-btn')) {
              addCopyButton(pre, codeBlock);
            }
          }
        } catch (e) { /* ignore highlight errors */ }
      });

      // Step 5: Show mermaid count
      Promise.allSettled(mermaidPromises).then(function () {
        MR.StatusBar.updateMermaidCount(mermaidCount);
      });
      MR.StatusBar.updateMermaidCount(mermaidBlocks.length);

      statusEl.textContent = '';
      statusEl.className = 'render-status';

    } catch (e) {
      console.error('[renderAll] EXCEPTION:', e.message, e.stack);
      previewEl.innerHTML = '<div class="mermaid-error"><strong>Markdown 解析错误:</strong><br>' +
        MR.Util.escapeHtml(e.message || String(e)) + '</div>';
      statusEl.textContent = '错误';
      statusEl.className = 'render-status';
    }
  }

  function buildMermaidErrorHTML(err, diagramText) {
    var message = err && err.message ? err.message : String(err || '未知错误');
    var hints = getMermaidHints(message, diagramText);
    return '<div class="mermaid-error">' +
      '<strong>图表渲染失败</strong>' +
      '<div>' + MR.Util.escapeHtml(message) + '</div>' +
      '<div class="mermaid-error-hint">' + hints.map(function (hint) {
        return '• ' + MR.Util.escapeHtml(hint);
      }).join('<br>') + '</div>' +
      '<pre>' + MR.Util.escapeHtml(diagramText) + '</pre></div>';
  }

  function getMermaidHints(message, diagramText) {
    var hints = [];
    var text = diagramText || '';
    if (!/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|mindmap|timeline|gitGraph)\b/m.test(text.trim())) {
      hints.push('检查第一行是否是 Mermaid 支持的图类型，例如 graph TD、sequenceDiagram 或 gantt。');
    }
    if (/[；，]/.test(text)) {
      hints.push('检测到中文标点，Mermaid 通常需要英文分号、逗号和箭头符号。');
    }
    if (/Parse error|Lexical error|syntax/i.test(message)) {
      hints.push('优先检查箭头、括号、引号是否成对，节点文本里有特殊字符时可以用引号包住。');
    }
    if (/Expecting/i.test(message)) {
      hints.push('错误附近可能缺少换行、冒号、分号或缩进层级不正确。');
    }
    if (hints.length === 0) {
      hints.push('尝试从最小图表开始恢复，逐行加回内容定位出错行。');
    }
    return hints;
  }

  function addCopyButton(pre, codeBlock) {
    var copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = '复制';
    copyBtn.addEventListener('click', function () {
      var text = codeBlock.textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          copyBtn.textContent = '已复制 ✓';
          copyBtn.classList.add('copied');
          setTimeout(function () {
            copyBtn.textContent = '复制';
            copyBtn.classList.remove('copied');
          }, 2000);
        }).catch(function () {
          fallbackCopy(text, copyBtn);
        });
      } else {
        fallbackCopy(text, copyBtn);
      }
    });
    pre.appendChild(copyBtn);
    pre.style.position = 'relative';
  }

  function fallbackCopy(text, btn) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      btn.textContent = '已复制 ✓';
      btn.classList.add('copied');
      setTimeout(function () {
        btn.textContent = '复制';
        btn.classList.remove('copied');
      }, 2000);
    } catch (e) {
      btn.textContent = '复制失败';
    }
    document.body.removeChild(ta);
  }

  function getPreviewHTML() {
    return previewEl ? previewEl.innerHTML : '';
  }

  return {
    init: init,
    renderAll: renderAll,
    scheduleRender: scheduleRender,
    setTheme: setTheme,
    getTheme: getTheme,
    getPreviewHTML: getPreviewHTML,
    buildMermaidErrorHTML: buildMermaidErrorHTML
  };
})();


/* ============================================================
   MR.ScrollSync - Sync Editor and Preview Scrolling
   ============================================================ */
MR.ScrollSync = (function () {
  var editor, preview;
  var syncing = false;

  function init() {
    editor = document.getElementById('editor');
    preview = document.getElementById('preview');

    editor.addEventListener('scroll', function () {
      if (syncing) return;
      syncing = true;
      var pct = editor.scrollTop / (editor.scrollHeight - editor.clientHeight);
      if (!isFinite(pct)) pct = 0;
      preview.scrollTop = pct * (preview.scrollHeight - preview.clientHeight);
      setTimeout(function () { syncing = false; }, 20);
    });

    preview.addEventListener('scroll', function () {
      if (syncing) return;
      syncing = true;
      var pct = preview.scrollTop / (preview.scrollHeight - preview.clientHeight);
      if (!isFinite(pct)) pct = 0;
      editor.scrollTop = pct * (editor.scrollHeight - editor.clientHeight);
      setTimeout(function () { syncing = false; }, 20);
    });
  }

  return { init: init };
})();
/* ============================================================
   MR.Theme - UI Theme System
   ============================================================ */
MR.Theme = (function () {
  var THEME_KEY = 'mermaid-editor-ui-theme';

  function init() {
    var saved = loadTheme();
    applyTheme(saved);
    var sel = document.getElementById('ui-theme');
    if (sel) {
      sel.value = saved;
      sel.addEventListener('change', function () {
        applyTheme(this.value);
        saveTheme(this.value);
      });
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function saveTheme(theme) {
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  }

  function loadTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) { return 'dark'; }
  }

  return { init: init, applyTheme: applyTheme };
})();


/* ============================================================
   MR.Tabs - Multi-Tab Support
   ============================================================ */
MR.Tabs = (function () {
  var tabs = [];
  var activeIndex = 0;
  var tabIdCounter = 0;

  function init() {
    var container = document.getElementById('tab-container');
    if (!container) return;
    // Create default tab
    addTab('\u65E0\u6807\u9898', '', null, true);
    selectTab(0, true);

    document.getElementById('btn-new-tab').addEventListener('click', function () {
      addTab('\u65B0\u6807\u7B7E' + (tabs.length + 1), '');
      selectTab(tabs.length - 1);
    });

    // Ctrl+Tab to switch
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault();
        var next = (activeIndex + 1) % tabs.length;
        selectTab(next);
      }
    });

    setInterval(function () {
      flushCurrentContent();
    }, 2000);
  }

  function persistTabs() {
    MR.Storage.saveTabs(tabs, activeIndex);
  }

  function addTab(name, content, fileHandle, skipPersist) {
    var id = 'tab-' + (++tabIdCounter);
    tabs.push({ id: id, name: name, content: content, fileHandle: fileHandle || null, dirty: false });
    renderTabs();
    if (!skipPersist) persistTabs();
    return id;
  }

  function closeTab(index) {
    if (tabs.length <= 1) return;
    tabs.splice(index, 1);
    if (activeIndex >= tabs.length) activeIndex = tabs.length - 1;
    selectTab(activeIndex);
    renderTabs();
    persistTabs();
  }

  function selectTab(index, skipPersist) {
    // Save current tab content
    if (tabs[activeIndex]) {
      tabs[activeIndex].content = MR.Editor.getContent();
    }
    // Auto-save current content before switching
    MR.Storage.saveContent(tabs[activeIndex] ? tabs[activeIndex].content : '', MR.StatusBar.getCurrentFile());
    activeIndex = index;
    var tab = tabs[index];
    if (tab) {
      MR.Editor.setContent(tab.content);
      MR.StatusBar.setFileName(tab.name);
      MR.StatusBar.updateStats(tab.content);
      MR.Renderer.renderAll(tab.content);
    }
    renderTabs();
    MR.Editor.updateLineNumbers();
    if (!skipPersist) persistTabs();
  }

  function renameTab(name) {
    if (tabs[activeIndex]) {
      tabs[activeIndex].name = name;
      renderTabs();
      persistTabs();
    }
  }

  function getCurrentContent() {
    return tabs[activeIndex] ? tabs[activeIndex].content : '';
  }

  function getCurrentName() {
    return tabs[activeIndex] ? tabs[activeIndex].name : 'untitled.md';
  }

  function getCurrentFileHandle() {
    return tabs[activeIndex] ? tabs[activeIndex].fileHandle : null;
  }

  function setCurrentFileHandle(fileHandle) {
    if (tabs[activeIndex]) {
      tabs[activeIndex].fileHandle = fileHandle || null;
    }
  }

  function renderTabs() {
    var container = document.getElementById('tab-container');
    if (!container) return;
    container.innerHTML = '';
    tabs.forEach(function (tab, i) {
      var btn = document.createElement('button');
      btn.className = 'tab-item' + (i === activeIndex ? ' active' : '') + (tab.dirty ? ' dirty' : '');
      btn.textContent = tab.name;
      btn.addEventListener('click', function () { selectTab(i); });
      btn.addEventListener('dblclick', function () {
        var newName = prompt('重命名标签:', tab.name);
        if (newName && newName.trim()) {
          renameTab(newName.trim());
        }
      });
      if (tabs.length > 1) {
        var closeBtn = document.createElement('span');
        closeBtn.className = 'tab-close';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', function (e) { e.stopPropagation(); closeTab(i); });
        btn.appendChild(closeBtn);
      }
      container.appendChild(btn);
    });
  }

  function updateContent(content) {
    if (tabs[activeIndex]) {
      tabs[activeIndex].content = content;
      tabs[activeIndex].dirty = true;
      renderTabs();
      persistTabs();
    }
  }

  function markSaved() {
    if (tabs[activeIndex]) {
      tabs[activeIndex].dirty = false;
      renderTabs();
      persistTabs();
    }
  }

  function flushCurrentContent() {
    if (tabs[activeIndex]) {
      tabs[activeIndex].content = MR.Editor.getContent();
      persistTabs();
    }
  }

  function restoreTabs(savedTabs, savedActiveIndex) {
    if (!Array.isArray(savedTabs) || savedTabs.length === 0) return false;
    tabs = savedTabs.map(function (tab, index) {
      var idNumber = ++tabIdCounter;
      return {
        id: tab.id || ('tab-' + idNumber),
        name: tab.name || ('\u65B0\u6807\u7B7E' + (index + 1)),
        content: tab.content || '',
        fileHandle: null,
        dirty: !!tab.dirty
      };
    });
    activeIndex = Math.max(0, Math.min(savedActiveIndex || 0, tabs.length - 1));
    var tab = tabs[activeIndex];
    MR.Editor.setContent(tab.content);
    MR.StatusBar.setFileName(tab.name);
    MR.StatusBar.updateStats(tab.content);
    MR.Renderer.renderAll(tab.content);
    renderTabs();
    MR.Editor.updateLineNumbers();
    persistTabs();
    return true;
  }

  return {
    init: init,
    addTab: addTab,
    closeTab: closeTab,
    selectTab: selectTab,
    renameTab: renameTab,
    updateContent: updateContent,
    markSaved: markSaved,
    flushCurrentContent: flushCurrentContent,
    restoreTabs: restoreTabs,
    getCurrentContent: getCurrentContent,
    getCurrentName: getCurrentName,
    getCurrentFileHandle: getCurrentFileHandle,
    setCurrentFileHandle: setCurrentFileHandle,
    get tabs() { return tabs; },
    get activeIndex() { return activeIndex; }
  };
})();


/* ============================================================
   MR.Slideshow - Presentation Mode
   ============================================================ */
MR.Slideshow = (function () {
  var slides = [];
  var current = 0;
  var overlay, contentEl, counterEl;
  var currentRenderId = 0;

  function init() {
    overlay = document.getElementById('slideshow-overlay');
    contentEl = document.getElementById('ss-content');
    counterEl = document.getElementById('ss-counter');
    document.getElementById('ss-prev').addEventListener('click', prev);
    document.getElementById('ss-next').addEventListener('click', next);
    document.getElementById('ss-close').addEventListener('click', hide);
    document.getElementById('btn-slideshow').addEventListener('click', start);

    document.addEventListener('keydown', function (e) {
      if (!overlay || overlay.classList.contains('hidden')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prev(); }
      else if (e.key === 'Escape') { hide(); }
    });
  }

  function start() {
    var text = MR.Editor.getContent();
    if (!text.trim()) { MR.Util.showToast('内容为空', 'warning'); return; }

    // Protect code blocks before splitting by horizontal rules
    var codeBlocks = [];
    var protectedText = text.replace(/```[\s\S]*?```/g, function (match) {
      codeBlocks.push(match);
      return '```CODEBLOCK' + (codeBlocks.length - 1) + '```';
    });
    // Parse slides: split by horizontal rules (---, ***, ___)
    var rawSlides = protectedText.split(/\n?[-*_]{3,}\s*\n?/);
    slides = rawSlides.map(function (s) {
      // Restore code blocks
      s = s.replace(/```CODEBLOCK(\d+)```/g, function (_, id) {
        return codeBlocks[parseInt(id)] || '';
      });
      var html = MR.Sanitizer.sanitize(marked.parse(s, { breaks: true, gfm: true }));
      return '<div class="slide">' + html + '</div>';
    });
    if (slides.length === 0) slides = ['<div class="slide"><p class="preview-placeholder">空内容</p></div>'];

    current = 0;
    overlay.classList.remove('hidden');
    showSlide(0);

    // Show navigation hint
    var hint = document.createElement('div');
    hint.className = 'slideshow-hint';
    hint.textContent = '← → 方向键切换  |  Esc 退出';
    overlay.appendChild(hint);
    setTimeout(function () { hint.style.opacity = '0'; }, 4000);
    setTimeout(function () { if (hint.parentNode) hint.parentNode.removeChild(hint); }, 6000);
  }

  function showSlide(index) {
    if (index < 0 || index >= slides.length) return;
    current = index;
    contentEl.innerHTML = slides[index];
    counterEl.textContent = (index + 1) + ' / ' + slides.length;

    var renderId = ++currentRenderId;

    // Render mermaid in slide
    setTimeout(function () {
      if (renderId !== currentRenderId) return; // stale render

      var mermaidBlocks = contentEl.querySelectorAll('code.language-mermaid');

      // Check if mermaid library is loaded
      if (typeof mermaid === 'undefined') {
        mermaidBlocks.forEach(function (block) {
          var pre = block.parentNode;
          if (pre && pre.tagName === 'PRE') {
            var note = document.createElement('div');
            note.className = 'mermaid-error';
            note.innerHTML = '<strong>Mermaid 库未加载</strong><br>图表无法渲染';
            pre.parentNode.replaceChild(note, pre);
          }
        });
        return;
      }

      mermaidBlocks.forEach(function (block) {
        var text = block.textContent.trim();
        if (!text) return;

        // Render ID is separate from DOM element IDs (never set as element id)
        var rid = 'ss-mermaid-' + Date.now() + '-' + Math.random().toString(36).slice(2);

        var wrapper = document.createElement('div');
        wrapper.className = 'mermaid-wrapper';

        var svgContainer = document.createElement('div');
        svgContainer.className = 'mermaid-svg-container';
        wrapper.appendChild(svgContainer);

        // Replace <pre> block with wrapper
        var pre = block.parentNode;
        if (pre && pre.tagName === 'PRE') {
          pre.parentNode.replaceChild(wrapper, pre);
        } else {
          block.parentNode.replaceChild(wrapper, block);
        }

        // Loading placeholder
        svgContainer.innerHTML = '<div style="padding:20px;color:#666;font-size:13px;">渲染图表中...</div>';

        mermaid.render(rid, text).then(function (r) {
          if (renderId !== currentRenderId) return; // stale render
          svgContainer.innerHTML = typeof r === 'string' ? r : r.svg;
          var svg = svgContainer.querySelector('svg');
          if (svg) {
            svg.style.maxWidth = '100%';
            svg.style.height = 'auto';
          }
          if (r.bindFunctions) {
            try { r.bindFunctions(svgContainer); } catch (e) { /* ignore */ }
          }
        }).catch(function (err) {
          if (renderId !== currentRenderId) return; // stale render
          svgContainer.innerHTML = MR.Renderer.buildMermaidErrorHTML(err, text);
        });
      });
    }, 50);
  }

  function next() { showSlide(current + 1); }
  function prev() { showSlide(current - 1); }
  function hide() { overlay.classList.add('hidden'); }

  return { init: init, start: start, next: next, prev: prev, hide: hide };
})();


/* ============================================================
   MR.Stats - Document Statistics
   ============================================================ */
MR.Stats = (function () {
  var modal, contentEl;

  function init() {
    modal = document.getElementById('stats-modal');
    contentEl = document.getElementById('stats-content');
    document.getElementById('btn-stats').addEventListener('click', show);
    document.getElementById('btn-stats-close').addEventListener('click', hide);
    modal.addEventListener('click', function (e) { if (e.target === modal) hide(); });
  }

  function show() {
    var text = MR.Editor.getContent();
    if (!text) { MR.Util.showToast('内容为空', 'warning'); return; }

    var lines = text.split('\n');
    var chars = text.length;
    // Accurate word count: CJK chars count individually, other text splits by whitespace
    var words = 0;
    if (text.trim()) {
      var cjkChars = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || [];
      var cjkCount = cjkChars.length;
      var nonCJKText = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ');
      var nonCJKWords = nonCJKText.trim() ? nonCJKText.trim().split(/\s+/).length : 0;
      words = cjkCount + nonCJKWords;
    }
    var codeBlocks = (text.match(/```/g) || []).length / 2;
    var headings = (text.match(/^#{1,6}\s/gm) || []).length;
    var mermaidBlocks = (text.match(/```mermaid/g) || []).length;
    var paragraphs = (text.match(/\n\n/g) || []).length + 1;
    var links = (text.match(/\[([^\]]+)\]\(([^)]+)\)/g) || []).length;
    var images = (text.match(/!\[([^\]]*)\]\(([^)]+)\)/g) || []).length;
    var readingTime = Math.ceil(words / 200); // 200 wpm

    var stats = [
      { label: '总字数', value: chars.toLocaleString() },
      { label: '单词数', value: words.toLocaleString() },
      { label: '总行数', value: lines.length.toLocaleString() },
      { label: '段落数', value: paragraphs },
      { label: '标题数', value: headings },
      { label: '代码块', value: codeBlocks },
      { label: 'Mermaid', value: mermaidBlocks },
      { label: '链接数', value: links },
      { label: '图片数', value: images },
      { label: '阅读时间', value: '~' + readingTime + ' 分钟' }
    ];

    contentEl.innerHTML = stats.map(function (s) {
      return '<div class="stat-item"><div class="stat-value">' + s.value + '</div><div class="stat-label">' + s.label + '</div></div>';
    }).join('');

    modal.classList.remove('hidden');
  }

  function hide() { modal.classList.add('hidden'); }
  return { init: init, show: show, hide: hide };
})();

function downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}


/* ============================================================
   MR.App - Main Application
   ============================================================ */
MR.App = (function () {
  var defaultContent = [
    '# Mermaid Markdown Editor',
    '',
    '欢迎使用 Mermaid Markdown Editor！这是一个支持实时预览、Mermaid 图表渲染、多格式导出的 Markdown 编辑器。',
    '',
    '## 功能特性',
    '',
    '- **Markdown 编辑**：实时渲染预览',
    '- **Mermaid 图表**：支持流程图、时序图、甘特图等',
    '- **代码高亮**：支持多种编程语言',
    '- **文件操作**：打开 / 拖拽 .md 文件',
    '- **多格式导出**：Word (.docx), PDF',
    '- **绘图工具**：内置 Excalidraw 风格画板',
    '',
    '## Mermaid 示例',
    '',
    '### 流程图',
    '',
    '```mermaid',
    'graph TD;',
    '    A[开始] --> B{判断};',
    '    B -->|是| C[处理];',
    '    B -->|否| D[结束];',
    '    C --> D;',
    '```',
    '',
    '### 时序图',
    '',
    '```mermaid',
    'sequenceDiagram;',
    '    Alice->>John: 你好 John;',
    '    John-->>Alice: 你好 Alice;',
    '    Alice->>John: 你最近怎么样？;',
    '    John-->>Alice: 还不错！;',
    '```',
    '',
    '### 代码高亮示例',
    '',
    '```python',
    'def hello_world():',
    '    print("Hello, World!")',
    '    return True',
    '```',
    '',
    '```javascript',
    'const greet = (name) => {',
    '  console.log(`Hello, ${name}!`);',
    '};',
    '```',
    '',
    '## 如何使用',
    '',
    '1. 在左侧编辑区输入 Markdown 内容',
    '2. 或点击「打开文件」按钮加载 .md 文件',
    '3. 也可以直接将 .md 文件拖拽到页面中',
    '4. 使用上方工具栏导出 Word / PDF',
    '5. 点击「绘图」按钮打开画板绘制图形'
  ].join('\n');

  function init() {
    // Check external libraries
    var missingLibs = [];
    if (typeof marked === 'undefined') missingLibs.push('marked.min.js');
    if (typeof mermaid === 'undefined') missingLibs.push('mermaid.min.js');
    if (typeof hljs === 'undefined') missingLibs.push('highlight.min.js');
    if (typeof htmlDocx === 'undefined') missingLibs.push('html-docx.js');
    if (typeof DOMPurify === 'undefined') missingLibs.push('purify.min.js');
    if (missingLibs.length > 0) {
      console.error('Missing libraries:', missingLibs.join(', '));
      MR.Util.showToast('缺少库文件: ' + missingLibs.join(', '), 'error');
    }

    // Initialize all modules
    MR.StatusBar.init();
    MR.SplitPane.init();
    MR.Theme.init();
    MR.Editor.init();
    MR.Renderer.init();
    MR.Tabs.init();
    MR.FileManager.init();
    MR.Export.init();
    MR.Excalidraw.init();
    MR.ScrollSync.init();
    MR.Slideshow.init();
    MR.Stats.init();
    MR.Templates.init();

    // Wire Excalidraw button
    document.getElementById('btn-excalidraw').addEventListener('click', function () {
      MR.Excalidraw.show();
    });

    // Wire fullscreen preview button
    var fsBtn = document.getElementById('btn-fullscreen-preview');
    if (fsBtn) {
      fsBtn.addEventListener('click', toggleFullscreenPreview);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && document.body.classList.contains('fullscreen-preview')) {
          toggleFullscreenPreview();
        }
      });
    }
    function toggleFullscreenPreview() {
      document.body.classList.toggle('fullscreen-preview');
      fsBtn.textContent = document.body.classList.contains('fullscreen-preview') ? '✕ 退出' : '⛶ 全屏';
      var content = MR.Editor.getContent();
      if (content) MR.Renderer.renderAll(content);
    }

    // Cursor tracking
    MR.Editor.onCursorChange(function (pos) {
      MR.StatusBar.updateCursor(pos);
    });

    // Mermaid theme dropdown
    var themeSelect = document.getElementById('mermaid-theme');
    var savedMermaidTheme = MR.Storage.loadTheme();
    themeSelect.value = savedMermaidTheme;
    MR.Renderer.setTheme(savedMermaidTheme);

    themeSelect.addEventListener('change', function () {
      MR.Renderer.setTheme(this.value);
    });

    // Restore auto-saved tabs first, fallback to legacy single-document storage
    var savedTabs = MR.Storage.loadTabs();
    var restoredTabs = savedTabs && MR.Tabs.restoreTabs(savedTabs.tabs, savedTabs.activeIndex);
    var saved = restoredTabs ? { content: null, filename: null } : MR.Storage.loadContent();
    var editor = document.getElementById('editor');
    var contentToRender = defaultContent;
    var fileName = 'untitled.md';

    if (restoredTabs) {
      MR.Util.showToast('已恢复上次的标签页', 'info');
      MR.StatusBar.updateCursor(MR.Editor.getCursorPosition());
    } else if (saved.content) {
      contentToRender = saved.content;
      if (saved.filename) fileName = saved.filename;
      MR.Util.showToast('已恢复上次未保存的内容', 'info');

      editor.value = contentToRender;
      MR.Tabs.updateContent(contentToRender);
      MR.Tabs.renameTab(fileName);
      MR.StatusBar.setFileName(fileName);
      MR.StatusBar.updateStats(contentToRender);
      MR.Renderer.renderAll(contentToRender);
      MR.StatusBar.updateCursor(MR.Editor.getCursorPosition());
    } else {
      editor.value = contentToRender;
      MR.Tabs.updateContent(contentToRender);
      MR.Tabs.renameTab(fileName);
      MR.StatusBar.setFileName(fileName);
      MR.StatusBar.updateStats(contentToRender);
      MR.Renderer.renderAll(contentToRender);
      MR.StatusBar.updateCursor(MR.Editor.getCursorPosition());
    }

    // Close custom CSS modal on backdrop click
    document.getElementById('css-modal').addEventListener('click', function (e) {
      if (e.target === this) this.classList.add('hidden');
    });

    // Unsaved changes warning
    window.addEventListener('beforeunload', function (e) {
      MR.Tabs.flushCurrentContent();
      var content = MR.Editor.getContent();
      if (content && content.trim()) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    window.addEventListener('pagehide', function () {
      MR.Tabs.flushCurrentContent();
    });

    // Keyboard shortcuts
    setupShortcuts();

    console.log('Mermaid Markdown Editor initialized.');
  }

  function setupShortcuts() {
    var shortcutsOverlay = document.getElementById('shortcuts-overlay');

    document.addEventListener('keydown', function (e) {
      // ? key to toggle shortcuts
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Don't trigger when typing in editor
        if (document.activeElement === document.getElementById('editor')) return;
        e.preventDefault();
        shortcutsOverlay.classList.toggle('hidden');
      }
      // Esc to close modals
      if (e.key === 'Escape') {
        if (!shortcutsOverlay.classList.contains('hidden')) {
          shortcutsOverlay.classList.add('hidden');
          e.preventDefault();
        }
      }
      // Ctrl+Shift+F to toggle focus mode
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        MR.Editor.toggleFocus();
      }
      // Ctrl+F to open search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        MR.Editor.toggleSearch();
      }
      // Ctrl+O to open file - use File System Access API with fallback
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        MR.FileManager.tryOpenFile();
      }
    });

    // Close shortcuts overlay on click outside panel
    shortcutsOverlay.addEventListener('click', function (e) {
      if (e.target === shortcutsOverlay) {
        shortcutsOverlay.classList.add('hidden');
      }
    });
  }

  // Start on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init: init };
})();
