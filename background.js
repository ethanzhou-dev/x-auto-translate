chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(request.text)}&langpair=Autodetect|${request.targetLang}&de=x-auto-translate-user@example.com`

    fetch(url)
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.toString() }))

    return true
  }
})
