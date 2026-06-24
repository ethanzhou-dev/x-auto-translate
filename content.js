let settings = { enabled: true, targetLang: 'zh-CN', onlyComments: false }

async function loadSettings () {
  settings = await chrome.storage.local.get({ enabled: true, targetLang: 'zh-CN', onlyComments: false })
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.enabled) settings.enabled = changes.enabled.newValue
    if (changes.targetLang) settings.targetLang = changes.targetLang.newValue
    if (changes.onlyComments) settings.onlyComments = changes.onlyComments.newValue
  }
})

loadSettings()

function getPageContext () {
  const urlMatch = window.location.pathname.match(/\/status\/(\d+)/i)
  return {
    pageStatusId: urlMatch ? urlMatch[1] : null,
    isPhotoVideoOverlay: /\/status\/\d+\/(?:photo|video)\//i.test(window.location.pathname)
  }
}

function resolveStatusPage (tweet, pageContext) {
  if (pageContext.isPhotoVideoOverlay) {
    if (tweet.closest('[role="dialog"]') !== null) return true
    return false
  }
  return !!pageContext.pageStatusId
}

function checkIsMainTweet (tweet, pageStatusId) {
  const timeNodes = tweet.querySelectorAll('time')
  for (const timeEl of timeNodes) {
    const link = timeEl.closest('a')
    if (link) {
      const href = link.getAttribute('href')
      const match = href ? href.match(/\/status\/(\d+)/i) : null
      if (match) {
        return match[1] === pageStatusId
      }
    }
  }
  return !!tweet.querySelector('article')
}

function getLangName (code) {
  if (!code) return '未知语言'
  const shortCode = code.split('-')[0].toLowerCase()

  try {
    const languageNames = new Intl.DisplayNames(['zh-CN'], { type: 'language' })
    return languageNames.of(shortCode)
  } catch (e) {
    return '未知语言'
  }
}

function escapeHtml (unsafe) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function extractRichText (textBox) {
  let sourceText = ''
  const entityMap = {}
  let entityIndex = 0

  function traverse (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      sourceText += node.textContent
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toUpperCase()
      if (tag === 'IMG' && node.src && node.src.includes('emoji')) {
        const marker = `__X_TRANSLATE_${entityIndex}__`
        sourceText += marker
        entityMap[entityIndex] = node.outerHTML
        entityIndex++
      } else if (tag === 'A') {
        const marker = `__X_TRANSLATE_${entityIndex}__`
        sourceText += marker
        entityMap[entityIndex] = node.outerHTML
        entityIndex++
      } else if (tag === 'BR') {
        sourceText += '\n'
      } else if (tag === 'SPAN' || tag === 'DIV') {
        for (const child of node.childNodes) {
          traverse(child)
        }
      } else {
        const marker = `__X_TRANSLATE_${entityIndex}__`
        sourceText += marker
        entityMap[entityIndex] = node.outerHTML
        entityIndex++
      }
    }
  }

  for (const child of textBox.childNodes) {
    traverse(child)
  }

  return { sourceText: sourceText.trim(), entityMap }
}

function restoreRichText (translatedText, entityMap) {
  const escapedText = escapeHtml(translatedText)
  return escapedText.replace(/__\s*X_TRANSLATE_(\d+)\s*__/gi, (match, p1, offset, string) => {
    const index = parseInt(p1, 10)
    if (entityMap[index]) {
      const entity = entityMap[index]
      if (entity.toLowerCase().startsWith('<a')) {
        let prefix = ''
        let suffix = ''
        if (offset > 0 && !/[\s\n，。？！：；、,.?!:;]/.test(string[offset - 1])) {
          prefix = ' '
        }
        if (offset + match.length < string.length && !/[\s\n，。？！：；、,.?!:;]/.test(string[offset + match.length])) {
          suffix = ' '
        }
        return prefix + entity + suffix
      }
      return entity
    }
    return match
  })
}

async function translateText (text) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'translate', text, targetLang: settings.targetLang }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn(chrome.runtime.lastError.message)
        resolve(null)
        return
      }
      if (response && response.success) {
        const data = response.data
        if (data && data.responseData && data.responseData.translatedText) {
          if (data.responseData.translatedText === 'PLEASE SELECT TWO DISTINCT LANGUAGES' || data.responseStatus === 403 || data.responseStatus === '403') {
            resolve(null)
            return
          }
          resolve({ 
            translatedText: data.responseData.translatedText, 
            detectedLang: data.responseData.detectedLanguage || 'unknown' 
          })
        } else {
          resolve(null)
        }
      } else {
        resolve(null)
      }
    })
  })
}

function injectFakeGrokTranslation (textBox, translatedText, detectedLang, isHtml = false) {
  if (textBox.dataset.hasFakeTranslation === 'true') return
  textBox.dataset.hasFakeTranslation = 'true'

  const container = document.createElement('div')
  container.className = 'x-auto-translate-container'
  container.style.marginTop = textBox.style.marginTop

  const langName = getLangName(detectedLang)

  const xFontFamily = 'TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

  const header = document.createElement('div')
  header.style.fontSize = '13px'
  header.style.fontFamily = xFontFamily
  header.style.color = 'rgb(113, 118, 123)'
  header.style.marginBottom = '4px'
  header.style.display = 'flex'
  header.style.alignItems = 'center'
  header.style.lineHeight = '20px'

  const iconSvg = `
        <svg viewBox="0 0 24 24" aria-hidden="true" style="width: 14px; height: 14px; margin-right: 4px; flex-shrink: 0;">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
            <path d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"></path>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path>
        </svg>
    `

  const translatedStateHtml = `
        <span>翻译自 ${langName}</span>
        <span class="action-btn" data-action="show-original" style="color: rgb(29, 155, 240); cursor: pointer; margin-left: 4px;">显示原文</span>
    `

  const originalStateHtml = `
        <span class="action-btn" data-action="show-translation" style="color: rgb(29, 155, 240); cursor: pointer;">翻译推文</span>
    `

  header.innerHTML = `
        ${iconSvg}
        <div class="header-text-wrapper" style="display: flex; align-items: center;">
            ${translatedStateHtml}
        </div>
    `

  const content = document.createElement('div')
  const computed = window.getComputedStyle(textBox)
  content.style.color = computed.color
  content.style.fontFamily = computed.fontFamily
  content.style.fontSize = computed.fontSize
  content.style.lineHeight = computed.lineHeight
  content.style.fontWeight = computed.fontWeight
  content.style.whiteSpace = 'pre-wrap'
  content.style.wordBreak = 'break-word'

  if (isHtml) {
    content.innerHTML = translatedText
  } else {
    content.innerText = translatedText
  }

  container.appendChild(header)
  container.appendChild(content)

  textBox.parentElement.insertBefore(container, textBox)
  textBox.style.display = 'none'

  const wrapper = header.querySelector('.header-text-wrapper')

  wrapper.addEventListener('click', (e) => {
    const btn = e.target.closest('.action-btn')
    if (!btn) return

    if (btn.dataset.action === 'show-original') {
      content.style.display = 'none'
      textBox.style.display = ''
      wrapper.innerHTML = originalStateHtml
    } else if (btn.dataset.action === 'show-translation') {
      textBox.style.display = 'none'
      content.style.display = ''
      wrapper.innerHTML = translatedStateHtml
    }
  })
}

const translationCache = new Map()

async function getCachedTranslation (text) {
  if (translationCache.has(text)) {
    return translationCache.get(text)
  }
  const result = await translateText(text)
  if (result) {
    if (translationCache.size > 2000) {
      const firstKey = translationCache.keys().next().value
      translationCache.delete(firstKey)
    }
    translationCache.set(text, result)
  }
  return result
}

function hideNativeTranslate (tweet) {
  const buttons = tweet.querySelectorAll('[role="button"], span')
  for (const btn of buttons) {
    const text = btn.innerText || btn.textContent
    if (!text) continue

    const cleanText = text.trim()
    if (
      cleanText === 'Translate post' ||
            cleanText === '翻译推文' ||
            cleanText === '翻译贴文' ||
            cleanText === '显示翻译' ||
            cleanText === 'Show translation' ||
            cleanText.includes('Translate with Grok') ||
            cleanText.includes('用 Grok 翻译') ||
            (cleanText.includes('Grok') && cleanText.includes('翻译')) ||
            (cleanText.includes('Grok') && cleanText.includes('Translate'))
    ) {
      if (btn.closest('.x-auto-translate-container')) continue
      if (btn.classList.contains('action-btn')) continue

      let target = btn
      const parentBtn = btn.closest('[role="button"]') || btn.closest('a')
      if (parentBtn) {
        target = parentBtn
      } else {
        let curr = btn
        let foundWrapper = btn
        for (let i = 0; i < 3; i++) {
          curr = curr.parentElement
          if (!curr) break
          if (curr.querySelector('svg') && (curr.innerText || curr.textContent).length < 30) {
            foundWrapper = curr
            break
          }
        }
        target = foundWrapper
        if ((target.innerText || target.textContent).length > 30) {
          target = btn.parentElement || btn
        }
      }

      target.style.display = 'none'
    }
  }
}

function checkAllTweets () {
  if (!settings.enabled) return
  const pageContext = getPageContext()

  const tweets = document.querySelectorAll('[data-testid="tweet"]')
  tweets.forEach(async (tweet) => {
    if (tweet.dataset.ignorePluginTranslate === 'true') return

    let hasNativeTranslated = false
    const spans = tweet.querySelectorAll('[role="button"], span')
    for (const el of spans) {
      const txt = (el.innerText || el.textContent).trim()
      if (txt === '显示原文' || txt === '顯示原文' || txt === 'Show original') {
        if (!el.classList.contains('action-btn') && !el.closest('.x-auto-translate-container')) {
          hasNativeTranslated = true
          break
        }
      }
    }

    if (hasNativeTranslated) {
      tweet.dataset.ignorePluginTranslate = 'true'
      return
    }

    if (settings.onlyComments) {
      const isStatusPage = resolveStatusPage(tweet, pageContext)
      if (!isStatusPage) return

      if (checkIsMainTweet(tweet, pageContext.pageStatusId)) {
        return
      }
    }

    hideNativeTranslate(tweet)

    const textBox = tweet.querySelector('[data-testid="tweetText"]')
    if (!textBox) return

    const { sourceText, entityMap } = extractRichText(textBox)
    if (!sourceText || sourceText.trim() === '') return

    if (textBox.dataset.translatedText === sourceText) return
    textBox.dataset.translatedText = sourceText

    const result = await getCachedTranslation(sourceText)

    if (result && result.translatedText) {
      if (!result.detectedLang.startsWith('zh')) {
        const currentExtracted = extractRichText(textBox).sourceText
        if (currentExtracted === sourceText) {
          const richHtml = restoreRichText(result.translatedText, entityMap)
          injectFakeGrokTranslation(textBox, richHtml, result.detectedLang, true)
        }
      }
    }
  })
}

let rafScheduled = false
const domObserver = new MutationObserver(() => {
  if (!rafScheduled) {
    rafScheduled = true
    requestAnimationFrame(() => {
      checkAllTweets()
      rafScheduled = false
    })
  }
})

domObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
