// Auto Scroll - Content Script
// Prevent double injection
if (window.__autoScrollInjected) {
  // Already injected, skip
} else {
  window.__autoScrollInjected = true;

  let isScrolling = false;
  let reachedBottom = false;
  let currentTimeout = null;
  let config = {
    scrollMin: 100,
    scrollMax: 200,
    timeMin: 10000,
    timeMax: 15000,
  };

  // Load saved config from chrome.storage on injection
  function loadSavedConfig() {
    try {
      chrome.storage.local.get('scrollConfig', (result) => {
        if (result.scrollConfig) {
          config.scrollMin = result.scrollConfig.scrollMin || config.scrollMin;
          config.scrollMax = result.scrollConfig.scrollMax || config.scrollMax;
          config.timeMin = (result.scrollConfig.timeMin || 10) * 1000;
          config.timeMax = (result.scrollConfig.timeMax || 15) * 1000;
        }
      });
    } catch (e) {
      // storage not available, use defaults
    }
  }

  // --- Utility ---

  function randomInRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // --- Bottom detection ---

  function getScrollHeight() {
    return Math.max(
      document.documentElement.scrollHeight || 0,
      document.body.scrollHeight || 0
    );
  }

  function hasReachedBottom() {
    const scrollTop =
      document.documentElement.scrollTop || document.body.scrollTop;
    const scrollHeight = getScrollHeight();
    const clientHeight = document.documentElement.clientHeight;
    // 2px tolerance for sub-pixel rounding
    return scrollTop + clientHeight >= scrollHeight - 2;
  }

  // --- Scroll engine ---

  function stopScrolling() {
    isScrolling = false;
    if (currentTimeout) {
      clearTimeout(currentTimeout);
      currentTimeout = null;
    }
  }

  function resetBottomFlag() {
    reachedBottom = false;
  }

  function scheduleNextScroll() {
    if (!isScrolling) return;

    const delay = randomInRange(config.timeMin, config.timeMax);

    currentTimeout = setTimeout(() => {
      if (!isScrolling) return;

      const distance = randomInRange(config.scrollMin, config.scrollMax);
      window.scrollBy({ top: distance, behavior: 'smooth' });

      // Check if we've reached the bottom
      if (hasReachedBottom()) {
        // Grace period: wait 1.5s and re-check for lazy-loaded content
        const scrollHeightBefore = getScrollHeight();
        setTimeout(() => {
          const scrollHeightAfter = getScrollHeight();
          if (scrollHeightAfter > scrollHeightBefore) {
            // Page grew (lazy-loaded content), keep scrolling
            scheduleNextScroll();
          } else {
            // Truly at the bottom
            stopScrolling();
            reachedBottom = true;
            updateFloatingButton();
            // Notify popup that we've reached the bottom
            try {
              chrome.runtime.sendMessage({ action: 'statusUpdate', status: 'reached_bottom' });
            } catch (e) {
              // popup may be closed, ignore
            }
          }
        }, 1500);
      } else {
        scheduleNextScroll();
      }
    }, delay);
  }

  // --- Floating Button (Shadow DOM) ---

  let floatingHost = null;
  let floatingBtn = null;
  let floatingIcon = null;
  let floatingLabel = null;

  function createFloatingButton() {
    floatingHost = document.createElement('div');
    floatingHost.id = '__auto-scroll-float-host';
    const shadow = floatingHost.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .float-btn {
        position: fixed;
        right: -4px;
        top: 50%;
        transform: translateY(-50%);
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 10px 10px 12px;
        border: none;
        border-radius: 12px 0 0 12px;
        background: rgba(120, 120, 128, 0.85);
        color: #fff;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.2px;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 2px 12px rgba(0,0,0,0.18);
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        z-index: 2147483647;
        user-select: none;
        -webkit-user-select: none;
        overflow: hidden;
        max-width: 40px;
      }
      .float-btn:hover {
        right: 0;
        max-width: 120px;
        background: rgba(80, 80, 86, 0.92);
        padding-right: 14px;
      }
      .float-btn.scrolling {
        background: rgba(0, 122, 255, 0.88);
      }
      .float-btn.scrolling:hover {
        background: rgba(0, 102, 214, 0.92);
      }
      .float-btn.bottom {
        background: rgba(255, 149, 0, 0.88);
      }
      .float-btn.bottom:hover {
        background: rgba(214, 122, 0, 0.92);
      }
      .btn-icon {
        font-size: 16px;
        line-height: 1;
        flex-shrink: 0;
      }
      .btn-label {
        white-space: nowrap;
        opacity: 0;
        transition: opacity 0.2s;
      }
      .float-btn:hover .btn-label {
        opacity: 1;
      }
    `;

    floatingBtn = document.createElement('button');
    floatingBtn.className = 'float-btn';
    floatingBtn.title = 'Auto Scroll';

    floatingIcon = document.createElement('span');
    floatingIcon.className = 'btn-icon';
    floatingIcon.textContent = '▶';

    floatingLabel = document.createElement('span');
    floatingLabel.className = 'btn-label';
    floatingLabel.textContent = '开始';

    floatingBtn.appendChild(floatingIcon);
    floatingBtn.appendChild(floatingLabel);

    floatingBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      toggleFromFloatingButton();
    });

    shadow.appendChild(style);
    shadow.appendChild(floatingBtn);
    document.documentElement.appendChild(floatingHost);
  }

  function updateFloatingButton() {
    if (!floatingBtn) return;

    floatingBtn.classList.remove('scrolling', 'bottom');

    if (isScrolling) {
      floatingIcon.textContent = '⏸';
      floatingLabel.textContent = '暂停';
      floatingBtn.classList.add('scrolling');
    } else if (reachedBottom) {
      floatingIcon.textContent = '▶';
      floatingLabel.textContent = '继续';
      floatingBtn.classList.add('bottom');
    } else {
      floatingIcon.textContent = '▶';
      floatingLabel.textContent = '开始';
    }
  }

  function toggleFromFloatingButton() {
    if (isScrolling) {
      // Pause
      stopScrolling();
      updateFloatingButton();
      // Notify popup
      try {
        chrome.runtime.sendMessage({ action: 'statusUpdate', status: 'stopped' });
      } catch (e) {}
    } else {
      // Start / resume
      if (hasReachedBottom()) {
        reachedBottom = false;
      }
      resetBottomFlag();
      isScrolling = true;
      scheduleNextScroll();
      updateFloatingButton();
      // Notify popup
      try {
        chrome.runtime.sendMessage({ action: 'statusUpdate', status: 'scrolling' });
      } catch (e) {}
    }
  }

  // --- Message listener ---

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'start') {
      config.scrollMin = message.scrollMin;
      config.scrollMax = message.scrollMax;
      config.timeMin = message.timeMin * 1000; // seconds → ms
      config.timeMax = message.timeMax * 1000;

      // Check if already at bottom before starting
      if (hasReachedBottom()) {
        isScrolling = false;
        reachedBottom = true;
        updateFloatingButton();
        sendResponse({ status: 'reached_bottom' });
        return true;
      }

      // Stop any previous scroll before starting fresh
      stopScrolling();
      resetBottomFlag();

      isScrolling = true;
      scheduleNextScroll();
      updateFloatingButton();
      sendResponse({ status: 'scrolling' });
    } else if (message.action === 'stop') {
      stopScrolling();
      reachedBottom = false;
      updateFloatingButton();
      sendResponse({ status: 'stopped' });
    } else if (message.action === 'getStatus') {
      let status = 'stopped';
      if (isScrolling) {
        status = 'scrolling';
      } else if (reachedBottom) {
        status = 'reached_bottom';
      }
      sendResponse({ status });
    }

    return true; // keep sendResponse channel open for async
  });

  // --- Init floating button on injection ---
  loadSavedConfig();
  createFloatingButton();
}
