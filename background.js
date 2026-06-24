let edgeAuthToken = null
let tokenExpiration = 0

async function getEdgeToken () {
  if (edgeAuthToken && Date.now() < tokenExpiration) {
    return edgeAuthToken
  }
  try {
    const res = await fetch('https://edge.microsoft.com/translate/auth')
    edgeAuthToken = await res.text()
    tokenExpiration = Date.now() + 9 * 60 * 1000
    return edgeAuthToken
  } catch (err) {
    console.error('Failed to get Edge token:', err)
    return null
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    (async () => {
      try {
        const token = await getEdgeToken()
        if (!token) throw new Error('No auth token')

        const targetLang = request.targetLang === 'zh-CN' ? 'zh-Hans' : request.targetLang

        const res = await fetch(`https://api-edge.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${targetLang}`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{ Text: request.text }])
        })

        const data = await res.json()
        sendResponse({ success: true, data })
      } catch (err) {
        sendResponse({ success: false, error: err.toString() })
      }
    })()
    return true
  }
})
