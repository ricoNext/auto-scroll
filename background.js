// Auto Scroll - Background Service Worker
// The content script's lifecycle is tied to the page;
// when the user navigates away or closes a tab,
// the content script and its timers are automatically cleaned up.

// Relay status updates from content script to popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'statusUpdate') {
    // Forward to popup (popup.js also listens for this directly,
    // but the background relay ensures delivery even if popup
    // opens after the status update was sent)
    try {
      chrome.runtime.sendMessage(message).catch(() => {
        // No listener (popup closed), ignore
      });
    } catch (e) {
      // No listener available, ignore
    }
  }
});
