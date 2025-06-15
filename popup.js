class PopupController {
  constructor() {
    this.isDetectorActive = false;
    this.init();
  }

  init() {
    this.toggleButton = document.getElementById('toggle-detector');
    this.buttonText = document.getElementById('button-text');
    this.status = document.getElementById('status');
    
    this.toggleButton.addEventListener('click', () => {
      this.toggleDetector();
    });
    
    // Verificar estado inicial
    this.checkDetectorStatus();
  }

  async toggleDetector() {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      
      if (!tab) {
        this.showError('No se pudo acceder a la pestaña actual');
        return;
      }
      
      // Verificar si es una URL válida para content scripts
      if (!this.isValidUrl(tab.url)) {
        this.showError('Esta página no es compatible con la extensión');
        return;
      }
      
      this.setLoading(true);
      
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "toggle_detector"
      });
      
      if (response) {
        this.isDetectorActive = response.isActive;
        this.updateUI();
        
        if (this.isDetectorActive) {
          // Cerrar popup después de activar
          setTimeout(() => window.close(), 500);
        }
      }
      
    } catch (error) {
      console.error('Error:', error);
      this.showError('Error al comunicarse con la página');
    } finally {
      this.setLoading(false);
    }
  }

  async checkDetectorStatus() {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      
      if (!tab || !this.isValidUrl(tab.url)) {
        this.showError('Página no compatible');
        return;
      }
      
      // Intentar verificar el estado
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "get_status"
      }).catch(() => null);
      
      if (response) {
        this.isDetectorActive = response.isActive;
        this.updateUI();
      }
      
    } catch (error) {
      // Silenciar errores de verificación de estado
    }
  }

  updateUI() {
    if (this.isDetectorActive) {
      this.toggleButton.classList.add('active');
      this.buttonText.textContent = '🛑 Desactivar Detector';
      this.status.textContent = 'Detector ACTIVO - Explora la página';
      this.status.style.background = 'rgba(76, 175, 80, 0.3)';
    } else {
      this.toggleButton.classList.remove('active');
      this.buttonText.textContent = '🎯 Activar Detector';
      this.status.textContent = 'Detector inactivo - Listo para usar';
      this.status.style.background = 'rgba(255, 255, 255, 0.1)';
    }
  }

  setLoading(loading) {
    this.toggleButton.disabled = loading;
    if (loading) {
      this.buttonText.textContent = '⏳ Cargando...';
      this.status.textContent = 'Procesando solicitud...';
    }
  }

  showError(message) {
    this.status.textContent = `❌ ${message}`;
    this.status.style.background = 'rgba(244, 67, 54, 0.3)';
    
    // Resetear después de 3 segundos
    setTimeout(() => {
      this.updateUI();
    }, 3000);
  }

  isValidUrl(url) {
    // Verificar si la URL es válida para content scripts
    const invalidProtocols = ['chrome:', 'chrome-extension:', 'moz-extension:', 'edge:', 'about:'];
    const invalidPages = ['chrome.google.com/webstore'];
    
    if (!url) return false;
    
    // Verificar protocolos inválidos
    if (invalidProtocols.some(protocol => url.startsWith(protocol))) {
      return false;
    }
    
    // Verificar páginas específicas inválidas
    if (invalidPages.some(page => url.includes(page))) {
      return false;
    }
    
    return true;
  }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});