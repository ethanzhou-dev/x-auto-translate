chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    // 使用 MyMemory API 代替被拉黑的 Google API，增加一个通用邮箱以获取每天 50,000 词的免费额度
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(request.text)}&langpair=Autodetect|${request.targetLang}&de=x-auto-translate-user@example.com`

    fetch(url)
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.toString() }))

    return true
  }
})
