(function () {
  const scrollMinEl = document.getElementById('scrollMin');
  const scrollMaxEl = document.getElementById('scrollMax');
  const timeMinEl = document.getElementById('timeMin');
  const timeMaxEl = document.getElementById('timeMax');
  const toggleBtn = document.getElementById('toggleBtn');
  const statusEl = document.getElementById('status');
  const statusDot = document.getElementById('statusDot');
  const errorEl = document.getElementById('error');

  let currentTabId = null;
  let currentStatus = 'stopped'; // 'stopped' | 'scrolling' | 'reached_bottom'

  // --- UI helpers ---

  function setStatus(status) {
    currentStatus = status;
    statusDot.className = 'status-dot';
    statusEl.className = 'status-text';

    if (status === 'scrolling') {
      statusEl.textContent = '滚动中';
      statusDot.classList.add('running');
      statusEl.classList.add('running');
      toggleBtn.textContent = '停止滚动';
      toggleBtn.className = 'stop';
    } else if (status === 'reached_bottom') {
      statusEl.textContent = '已到达底部';
      statusDot.classList.add('bottom');
      statusEl.classList.add('bottom');
      toggleBtn.textContent = '开始滚动';
      toggleBtn.className = 'start';
    } else {
      statusEl.textContent = '已停止';
      toggleBtn.textContent = '开始滚动';
      toggleBtn.className = 'start';
    }
  }

  function showError(msg) {
    errorEl.textContent = msg;
  }

  function clearError() {
    errorEl.textContent = '';
  }

  // --- Persistence ---

  const DEFAULT_CONFIG = {
    scrollMin: 100,
    scrollMax: 200,
    timeMin: 10,
    timeMax: 15,
  };

  function loadConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get('scrollConfig', (result) => {
        resolve(result.scrollConfig || DEFAULT_CONFIG);
      });
    });
  }

  function saveConfig(cfg) {
    chrome.storage.local.set({
      scrollConfig: {
        scrollMin: cfg.scrollMin,
        scrollMax: cfg.scrollMax,
        timeMin: cfg.timeMin,
        timeMax: cfg.timeMax,
      },
    });
  }

  // --- Validation ---

  function validate() {
    const scrollMin = parseInt(scrollMinEl.value, 10);
    const scrollMax = parseInt(scrollMaxEl.value, 10);
    const timeMin = parseInt(timeMinEl.value, 10);
    const timeMax = parseInt(timeMaxEl.value, 10);

    if (isNaN(scrollMin) || isNaN(scrollMax) || isNaN(timeMin) || isNaN(timeMax)) {
      showError('请输入有效数字');
      return null;
    }
    if (scrollMin <= 0 || scrollMax <= 0 || timeMin <= 0 || timeMax <= 0) {
      showError('所有值必须大于 0');
      return null;
    }
    if (scrollMin > scrollMax) {
      showError('最小滚动距离不能大于最大');
      return null;
    }
    if (timeMin > timeMax) {
      showError('最短间隔不能大于最长');
      return null;
    }
    clearError();
    return { scrollMin, scrollMax, timeMin, timeMax };
  }

  // --- Messaging ---

  function sendToContentScript(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  function injectContentScript(tabId) {
    return chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
  }

  // --- Actions ---

  async function queryStatus() {
    if (!currentTabId) return;
    try {
      const response = await sendToContentScript(currentTabId, { action: 'getStatus' });
      if (response && response.status) {
        setStatus(response.status);
      } else {
        setStatus('stopped');
      }
    } catch (e) {
      // Content script not injected yet
      setStatus('stopped');
    }
  }

  async function startScroll() {
    if (!currentTabId) return;

    const config = validate();
    if (!config) return;

    try {
      // Try to message existing content script first
      const response = await sendToContentScript(currentTabId, { action: 'start', ...config });
      saveConfig(config);
      if (response && response.status === 'reached_bottom') {
        setStatus('reached_bottom');
      } else {
        setStatus('scrolling');
      }
    } catch (e) {
      // Content script not injected yet, inject it
      try {
        await injectContentScript(currentTabId);
        // Wait for content script to initialize
        await new Promise((r) => setTimeout(r, 150));
        const response = await sendToContentScript(currentTabId, { action: 'start', ...config });
        saveConfig(config);
        if (response && response.status === 'reached_bottom') {
          setStatus('reached_bottom');
        } else {
          setStatus('scrolling');
        }
      } catch (injectErr) {
        showError('无法在当前页面启动自动滚动');
      }
    }
  }

  async function stopScroll() {
    if (!currentTabId) return;
    try {
      await sendToContentScript(currentTabId, { action: 'stop' });
      setStatus('stopped');
    } catch (e) {
      setStatus('stopped');
    }
  }

  // --- Event listeners ---

  // Listen for proactive status updates from content script (e.g. reached bottom)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'statusUpdate') {
      setStatus(message.status);
    }
  });

  toggleBtn.addEventListener('click', () => {
    if (currentStatus === 'scrolling') {
      stopScroll();
    } else {
      startScroll();
    }
  });

  // --- Init ---
  // In popup scripts, the DOM is already ready when the script runs,
  // so we call init directly instead of waiting for DOMContentLoaded.

  async function init() {
    // Load saved config into input fields
    const saved = await loadConfig();
    scrollMinEl.value = saved.scrollMin;
    scrollMaxEl.value = saved.scrollMax;
    timeMinEl.value = saved.timeMin;
    timeMaxEl.value = saved.timeMax;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      currentTabId = tab.id;
      queryStatus();
    }
  }

  init();
})();
