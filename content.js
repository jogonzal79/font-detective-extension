class FontDetector {
  constructor() {
    this.isActive = false;
    this.overlay = null;
    this.boundHandlers = {};
    this.dragState = {
      isDragging: false,
      startX: 0,
      startY: 0,
      offsetX: 0,
      offsetY: 0
    };
    this.clickMode = false;
    this.lockedInfo = null;
    
    // Nueva propiedad para manejar la posición relativa al scroll
    this.scrollPosition = {
      initialScrollX: 0,
      initialScrollY: 0,
      overlayX: 0,
      overlayY: 0
    };
    
    this.init();
  }

  init() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "toggle_detector") {
        this.toggleDetector();
        sendResponse({status: "toggled", isActive: this.isActive});
      }
    });
  }

  toggleDetector() {
    if (this.isActive) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  activate() {
    this.isActive = true;
    document.body.style.cursor = 'crosshair';
    this.createOverlay();
    
    // Crear referencias bound una sola vez
    this.boundHandlers = {
      onMouseOver: this.onMouseOver.bind(this),
      onMouseOut: this.onMouseOut.bind(this),
      onClick: this.onClick.bind(this),
      onKeyDown: this.onKeyDown.bind(this),
      onScroll: this.onScroll.bind(this) // Nuevo handler para scroll
    };
    
    document.addEventListener('mouseover', this.boundHandlers.onMouseOver);
    document.addEventListener('mouseout', this.boundHandlers.onMouseOut);
    document.addEventListener('click', this.boundHandlers.onClick);
    document.addEventListener('keydown', this.boundHandlers.onKeyDown);
    
    // Listener para el scroll
    window.addEventListener('scroll', this.boundHandlers.onScroll, { passive: true });
    
    // Guardar posición inicial del scroll
    this.updateInitialScrollPosition();
  }

  deactivate() {
    this.isActive = false;
    document.body.style.cursor = 'default';
    
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    
    // Remover event listeners usando las referencias bound
    document.removeEventListener('mouseover', this.boundHandlers.onMouseOver);
    document.removeEventListener('mouseout', this.boundHandlers.onMouseOut);
    document.removeEventListener('click', this.boundHandlers.onClick);
    document.removeEventListener('keydown', this.boundHandlers.onKeyDown);
    
    // Remover listener del scroll
    window.removeEventListener('scroll', this.boundHandlers.onScroll);
    
    this.clearHighlights();
    this.lockedInfo = null;
  }

  // Nuevo método para manejar el scroll
  onScroll() {
    if (!this.overlay || this.dragState.isDragging) return;
    
    this.updateOverlayPositionOnScroll();
  }

  // Actualizar posición inicial del scroll
  updateInitialScrollPosition() {
    this.scrollPosition.initialScrollX = window.pageXOffset || document.documentElement.scrollLeft;
    this.scrollPosition.initialScrollY = window.pageYOffset || document.documentElement.scrollTop;
  }

  // Actualizar posición del overlay basada en el scroll
  updateOverlayPositionOnScroll() {
    const currentScrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
    
    const scrollDeltaX = currentScrollX - this.scrollPosition.initialScrollX;
    const scrollDeltaY = currentScrollY - this.scrollPosition.initialScrollY;
    
    const newX = this.scrollPosition.overlayX + scrollDeltaX;
    const newY = this.scrollPosition.overlayY + scrollDeltaY;
    
    // Aplicar límites para mantener el overlay visible
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const overlayRect = this.overlay.getBoundingClientRect();
    
    const boundedX = Math.max(0, Math.min(newX, windowWidth - overlayRect.width + currentScrollX));
    const boundedY = Math.max(currentScrollY, Math.min(newY, windowHeight - overlayRect.height + currentScrollY));
    
    this.overlay.style.left = boundedX + 'px';
    this.overlay.style.top = boundedY + 'px';
  }

  onKeyDown(event) {
    if (!this.isActive) return;
    // Escape para desactivar
    if (event.key === 'Escape') {
      this.deactivate();
    }
    // 'U' para desbloquear en modo click
    if (event.key.toLowerCase() === 'u' && this.clickMode && this.lockedInfo) {
      this.unlockInfo();
    }
  }

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'font-detector-overlay';
    this.overlay.innerHTML = `
      <div id="font-info">
        <div class="overlay-header" id="drag-header">
          <div class="header-content">
            <h3>Font Detective</h3>
            <span class="drag-hint">Arrastra para mover</span>
          </div>
          <button id="close-detector" title="Cerrar (Esc)">✕</button>
        </div>
        
        <!-- Nueva sección de configuración -->
        <div class="overlay-config">
          <div class="mode-toggle">
            <label class="toggle-container">
              <input type="checkbox" id="click-mode-toggle">
              <span class="toggle-slider"></span>
              <span class="toggle-label">Modo Click</span>
            </label>
            <div class="mode-description" id="mode-description">
              Pasa el mouse sobre el texto para ver la información
            </div>
          </div>
        </div>
        
        <div id="font-details">
          <p class="help-text">Pasa el cursor sobre cualquier texto para analizar su fuente</p>
        </div>
        
        <!-- Status bar para modo click -->
        <div id="click-mode-status" class="click-status" style="display: none;">
          <span class="status-text">💡 Haz clic en el texto para fijar la información</span>
        </div>
        
        <div class="overlay-actions">
          <button id="copy-css" disabled>📋 Copiar CSS</button>
          <button id="copy-json" disabled>📄 Copiar JSON</button>
          <button id="unlock-info" style="display: none;">🔓 Desbloquear (U)</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);
    
    // Configurar posición inicial (absoluta en lugar de fija)
    this.setInitialOverlayPosition();
    
    // Configurar funcionalidad de arrastre
    this.setupDragFunctionality();
    
    // Event listeners para botones
    document.getElementById('close-detector').addEventListener('click', (e) => {
      e.stopPropagation();
      this.deactivate();
    });
    
    document.getElementById('copy-css').addEventListener('click', (e) => {
      e.preventDefault();
      this.copyCurrentFontInfo('css');
    });
    
    document.getElementById('copy-json').addEventListener('click', (e) => {
      e.preventDefault();
      this.copyCurrentFontInfo('json');
    });
    
    document.getElementById('unlock-info').addEventListener('click', (e) => {
      e.preventDefault();
      this.unlockInfo();
    });
    
    // Toggle para modo click
    document.getElementById('click-mode-toggle').addEventListener('change', (e) => {
      this.toggleClickMode(e.target.checked);
    });
  }

  // Nuevo método para establecer la posición inicial del overlay
  setInitialOverlayPosition() {
    const currentScrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
    
    // Posición inicial relativa a la ventana visible
    const initialX = currentScrollX + window.innerWidth - 370; // 20px de margen + 350px de ancho
    const initialY = currentScrollY + 20; // 20px desde arriba
    
    this.overlay.style.position = 'absolute';
    this.overlay.style.left = initialX + 'px';
    this.overlay.style.top = initialY + 'px';
    this.overlay.style.right = 'auto';
    this.overlay.style.bottom = 'auto';
    
    // Guardar posición inicial
    this.scrollPosition.overlayX = initialX;
    this.scrollPosition.overlayY = initialY;
  }

  setupDragFunctionality() {
    const dragHeader = document.getElementById('drag-header');
    const closeButton = document.getElementById('close-detector');
    
    // Eventos de mouse para arrastre
    dragHeader.addEventListener('mousedown', (e) => {
      // No iniciar drag si se hace clic en el botón de cerrar
      if (e.target === closeButton || closeButton.contains(e.target)) {
        return;
      }
      
      this.startDrag(e);
    });
    
    document.addEventListener('mousemove', (e) => {
      if (this.dragState.isDragging) {
        this.drag(e);
      }
    });
    
    document.addEventListener('mouseup', () => {
      this.stopDrag();
    });
    
    // Eventos táctiles para dispositivos móviles
    dragHeader.addEventListener('touchstart', (e) => {
      if (e.target === closeButton || closeButton.contains(e.target)) {
        return;
      }
      
      const touch = e.touches[0];
      this.startDrag({
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      e.preventDefault();
    });
    
    document.addEventListener('touchmove', (e) => {
      if (this.dragState.isDragging) {
        const touch = e.touches[0];
        this.drag({
          clientX: touch.clientX,
          clientY: touch.clientY
        });
        e.preventDefault();
      }
    });
    
    document.addEventListener('touchend', () => {
      this.stopDrag();
    });
  }

  startDrag(e) {
    this.dragState.isDragging = true;
    
    const rect = this.overlay.getBoundingClientRect();
    this.dragState.offsetX = e.clientX - rect.left;
    this.dragState.offsetY = e.clientY - rect.top;
    
    // Cambiar cursor y estilo visual
    document.body.style.cursor = 'grabbing';
    this.overlay.style.transform = 'scale(1.02)';
    this.overlay.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.4)';
    this.overlay.style.transition = 'none';
  }

  drag(e) {
    if (!this.dragState.isDragging) return;
    
    let newX = e.clientX - this.dragState.offsetX;
    let newY = e.clientY - this.dragState.offsetY;
    
    // Obtener dimensiones de la ventana y del overlay
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const overlayRect = this.overlay.getBoundingClientRect();
    const currentScrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
    
    // Limitar el movimiento dentro de la ventana visible
    newX = Math.max(currentScrollX, Math.min(newX, currentScrollX + windowWidth - overlayRect.width));
    newY = Math.max(currentScrollY, Math.min(newY, currentScrollY + windowHeight - overlayRect.height));
    
    this.overlay.style.left = newX + 'px';
    this.overlay.style.top = newY + 'px';
    
    // Actualizar posición guardada para el scroll
    this.scrollPosition.overlayX = newX - (currentScrollX - this.scrollPosition.initialScrollX);
    this.scrollPosition.overlayY = newY - (currentScrollY - this.scrollPosition.initialScrollY);
  }

  stopDrag() {
    if (this.dragState.isDragging) {
      this.dragState.isDragging = false;
      
      // Restaurar cursor y estilo visual
      document.body.style.cursor = this.isActive ? 'crosshair' : 'default';
      this.overlay.style.transform = 'scale(1)';
      this.overlay.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3)';
      this.overlay.style.transition = 'all 0.2s ease';
    }
  }

  toggleClickMode(enabled) {
    this.clickMode = enabled;
    const modeDescription = document.getElementById('mode-description');
    const clickStatus = document.getElementById('click-mode-status');
    const helpText = document.querySelector('.help-text');
    
    if (enabled) {
      modeDescription.textContent = 'Haz clic en el texto para fijar la información';
      clickStatus.style.display = 'block';
      if (helpText) {
        helpText.textContent = 'Haz clic sobre cualquier texto para analizar su fuente';
      }
      // Limpiar información previa al cambiar a modo click
      this.lockedInfo = null;
      this.clearHighlights();
      this.clearFontDetails();
    } else {
      modeDescription.textContent = 'Pasa el mouse sobre el texto para ver la información';
      clickStatus.style.display = 'none';
      if (helpText) {
        helpText.textContent = 'Pasa el cursor sobre cualquier texto para analizar su fuente';
      }
      // Limpiar información bloqueada al salir del modo click
      this.lockedInfo = null;
      this.updateUnlockButton();
    }
  }

  onMouseOver(event) {
    if (!this.isActive || this.dragState.isDragging) return;
    const element = event.target;
    
    // Evitar el overlay mismo
    if (element.closest('#font-detector-overlay')) return;
    
    // En modo click, solo mostrar highlight, no la información
    if (this.clickMode) {
      if (!this.lockedInfo) {
        this.highlightElement(element);
      }
    } else {
      // Modo hover normal
      this.highlightElement(element);
      this.showFontInfo(element);
    }
  }

  onMouseOut(event) {
    if (!this.isActive || this.dragState.isDragging) return;
    
    // En modo click, no limpiar highlights si hay información bloqueada
    if (this.clickMode && this.lockedInfo) return;
    
    // Solo limpiar si no estamos moviendo a un elemento hijo
    if (!event.relatedTarget || !event.target.contains(event.relatedTarget)) {
      this.clearHighlights();
    }
  }

  onClick(event) {
    if (!this.isActive || this.dragState.isDragging) return;
    
    // Evitar el overlay mismo
    if (event.target.closest('#font-detector-overlay')) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    // En modo click, capturar la información
    if (this.clickMode) {
      this.lockFontInfo(event.target);
    }
  }

  lockFontInfo(element) {
    // Prevenir navegación en enlaces
    if (element.tagName.toLowerCase() === 'a') {
      event.preventDefault();
    }
    
    this.lockedInfo = element;
    this.highlightElement(element);
    this.showFontInfo(element);
    this.updateClickStatus(true);
    this.updateUnlockButton();
  }

  unlockInfo() {
    this.lockedInfo = null;
    this.clearHighlights();
    this.clearFontDetails();
    this.updateClickStatus(false);
    this.updateUnlockButton();
  }

  updateClickStatus(locked) {
    const statusElement = document.getElementById('click-mode-status');
    const statusText = statusElement.querySelector('.status-text');
    
    if (locked) {
      statusText.innerHTML = '🔒 Información fijada - <span style="color: #2196F3;">Presiona U o el botón para desbloquear</span>';
      statusElement.classList.add('locked');
    } else {
      statusText.innerHTML = '💡 Haz clic en el texto para fijar la información';
      statusElement.classList.remove('locked');
    }
  }

  updateUnlockButton() {
    const unlockButton = document.getElementById('unlock-info');
    unlockButton.style.display = (this.clickMode && this.lockedInfo) ? 'block' : 'none';
  }

  highlightElement(element) {
    // En modo click, no cambiar highlight si hay información bloqueada
    if (this.clickMode && this.lockedInfo && this.lockedInfo !== element) {
      return;
    }
    
    this.clearHighlights();
    element.classList.add('font-detector-highlight');
    this.currentElement = element;
  }

  clearHighlights() {
    const highlighted = document.querySelectorAll('.font-detector-highlight');
    highlighted.forEach(el => el.classList.remove('font-detector-highlight'));
  }

  clearFontDetails() {
    const detailsDiv = document.getElementById('font-details');
    const copyButtons = document.querySelectorAll('#copy-css, #copy-json');
    
    detailsDiv.innerHTML = `
      <p class="help-text">${this.clickMode ? 'Haz clic sobre cualquier texto para analizar su fuente' : 'Pasa el cursor sobre cualquier texto para analizar su fuente'}</p>
    `;
    
    copyButtons.forEach(btn => btn.disabled = true);
    this.currentFontInfo = null;
    this.currentElement = null;
  }

  showFontInfo(element) {
    const computedStyle = window.getComputedStyle(element);
    const fontInfo = this.extractFontInfo(computedStyle, element);
    
    const detailsDiv = document.getElementById('font-details');
    const copyButtons = document.querySelectorAll('#copy-css, #copy-json');
    
    detailsDiv.innerHTML = `
      <div class="font-section">
        <h4>📝 Información Básica</h4>
        <p><strong>Familia:</strong> ${fontInfo.family}</p>
        <p><strong>Tamaño:</strong> ${fontInfo.size}</p>
        <p><strong>Peso:</strong> ${fontInfo.weight}</p>
        <p><strong>Estilo:</strong> ${fontInfo.style}</p>
      </div>
      
      <div class="font-section">
        <h4>📏 Espaciado y Layout</h4>
        <p><strong>Altura de línea:</strong> ${fontInfo.lineHeight}</p>
        <p><strong>Espaciado de letras:</strong> ${fontInfo.letterSpacing}</p>
        <p><strong>Espaciado de palabras:</strong> ${fontInfo.wordSpacing}</p>
        <p><strong>Alineación:</strong> ${fontInfo.textAlign}</p>
      </div>
      
      <div class="font-section">
        <h4>🎨 Apariencia</h4>
        <p><strong>Color:</strong> <span class="color-preview" style="background: ${fontInfo.color}"></span> ${fontInfo.color}</p>
        <p><strong>Decoración:</strong> ${fontInfo.textDecoration}</p>
        <p><strong>Transformación:</strong> ${fontInfo.textTransform}</p>
        <p><strong>Sombra:</strong> ${fontInfo.textShadow}</p>
      </div>
      
      <div class="font-section">
        <h4>🏷️ Elemento</h4>
        <p><strong>Tag:</strong> ${element.tagName.toLowerCase()}</p>
        <p><strong>Clases:</strong> ${element.className || 'ninguna'}</p>
        ${element.id ? `<p><strong>ID:</strong> ${element.id}</p>` : ''}
      </div>
    `;
    
    // Habilitar botones de copia
    copyButtons.forEach(btn => btn.disabled = false);
    
    // Guardar info actual para los botones
    this.currentFontInfo = fontInfo;
    this.currentElement = element;
  }

  extractFontInfo(computedStyle, element) {
    return {
      family: computedStyle.fontFamily,
      size: computedStyle.fontSize,
      weight: computedStyle.fontWeight,
      style: computedStyle.fontStyle,
      lineHeight: computedStyle.lineHeight,
      letterSpacing: computedStyle.letterSpacing,
      wordSpacing: computedStyle.wordSpacing,
      color: computedStyle.color,
      textDecoration: computedStyle.textDecoration,
      textTransform: computedStyle.textTransform,
      textAlign: computedStyle.textAlign,
      textShadow: computedStyle.textShadow || 'none',
      // Información adicional del elemento
      tagName: element.tagName.toLowerCase(),
      className: element.className,
      elementId: element.id
    };
  }

  copyCurrentFontInfo(format = 'css') {
    if (!this.currentFontInfo) return;
    
    let textToCopy = '';
    
    if (format === 'css') {
      textToCopy = this.generateCSSText(this.currentFontInfo);
    } else if (format === 'json') {
      textToCopy = JSON.stringify(this.currentFontInfo, null, 2);
    }
    
    this.copyToClipboard(textToCopy, format);
  }

  generateCSSText(fontInfo) {
    return `/* Font Detective - Información extraída */
font-family: ${fontInfo.family};
font-size: ${fontInfo.size};
font-weight: ${fontInfo.weight};
font-style: ${fontInfo.style};
line-height: ${fontInfo.lineHeight};
letter-spacing: ${fontInfo.letterSpacing};
word-spacing: ${fontInfo.wordSpacing};
color: ${fontInfo.color};
text-decoration: ${fontInfo.textDecoration};
text-transform: ${fontInfo.textTransform};
text-align: ${fontInfo.textAlign};
text-shadow: ${fontInfo.textShadow};`.trim();
  }

  async copyToClipboard(text, format) {
    try {
      await navigator.clipboard.writeText(text);
      this.showNotification(`Información copiada como ${format.toUpperCase()}`, 'success');
    } catch (err) {
      // Fallback para navegadores sin soporte para clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      
      try {
        document.execCommand('copy');
        this.showNotification(`Información copiada como ${format.toUpperCase()}`, 'success');
      } catch (fallbackErr) {
        this.showNotification('Error al copiar al portapapeles', 'error');
      }
      
      document.body.removeChild(textArea);
    }
  }

  showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `font-detector-notification ${type}`;
    notification.innerHTML = `
      <span class="notification-icon">${type === 'success' ? '✅' : '❌'}</span>
      <span class="notification-text">${message}</span>
    `;
    document.body.appendChild(notification);
    
    // Animación de entrada
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Remover después de 3 segundos
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

// Inicializar solo si no existe ya
if (!window.fontDetector) {
  window.fontDetector = new FontDetector();
}