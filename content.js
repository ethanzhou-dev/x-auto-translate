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
  let isMain = false
  const timeNodes = tweet.querySelectorAll('time')
  for (const timeEl of timeNodes) {
    const link = timeEl.closest('a')
    if (link) {
      const href = link.getAttribute('href')
      const match = href ? href.match(/\/status\/(\d+)/i) : null
      if (match) {
        isMain = match[1] === pageStatusId
        break
      }
    }
  }

  if (!isMain && timeNodes.length === 0) {
    isMain = !!tweet.querySelector('article')
  }

  if (isMain) {
    const article = tweet.closest('article')
    const primaryColumn = tweet.closest('[data-testid="primaryColumn"]')
    if (article && primaryColumn) {
      const allArticles = Array.from(primaryColumn.querySelectorAll('article'))
      const topArticles = allArticles.filter(a => !a.parentElement.closest('article'))

      if (topArticles.length > 0 && topArticles[0] !== article) {
        return false
      }
    }

    const tweetText = tweet.querySelector('[data-testid="tweetText"]')
    if (tweetText) {
      let curr = tweetText
      for (let i = 0; i < 4; i++) {
        if (!curr) break
        let prev = curr.previousElementSibling
        while (prev) {
          const isUserName = prev.getAttribute('data-testid') === 'User-Name' || prev.querySelector('[data-testid="User-Name"]')
          if (!isUserName) {
            const textContent = (prev.innerText || prev.textContent).trim()
            if (textContent.includes('@') && textContent.length < 50) {
              const aTags = Array.from(prev.querySelectorAll('a'))
              if (prev.tagName.toUpperCase() === 'A') aTags.push(prev)
              for (const a of aTags) {
                if (a.textContent.trim().startsWith('@')) {
                  return false
                }
              }
            }
          }
          prev = prev.previousElementSibling
        }
        curr = curr.parentElement
      }
    }
  }

  return isMain
}

function getLangName (code) {
  if (!code) return '未知语言'
  const shortCode = code.split('-')[0].toLowerCase()

  try {
    const languageNames = new Intl.DisplayNames(['zh-CN'], { type: 'language' })
    return languageNames.of(shortCode)
  } catch {
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
      if (tag === 'BR') {
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
        if (data && data[0] && data[0].translations && data[0].translations.length > 0) {
          const translatedText = data[0].translations[0].text
          const detectedLang = data[0].detectedLanguage ? data[0].detectedLanguage.language : 'unknown'
          resolve({
            translatedText,
            detectedLang
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
  if (textBox.parentElement) {
    const existingContainers = textBox.parentElement.querySelectorAll('.x-auto-translate-container')
    existingContainers.forEach(c => c.remove())
  }
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
        <svg viewBox="0 0 24 24" fill="currentColor" style="width: 14px; height: 14px; margin-right: 4px; flex-shrink: 0;">
            <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"></path>
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
  const textContent = tweet.textContent || ''
  if (!/Translate|翻译|翻譯/.test(textContent)) {
    return
  }

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

      const target = btn.closest('[role="button"]') || btn.closest('a') || btn

      let curr = target
      const targetText = (target.innerText || target.textContent).trim()

      for (let i = 0; i < 4; i++) {
        const parent = curr.parentElement
        if (!parent || parent === tweet) break

        const parentText = (parent.innerText || parent.textContent).trim()
        if (parentText === targetText) {
          curr = parent
        } else {
          break
        }
      }

      curr.style.display = 'none'
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
    const textContent = tweet.textContent || ''
    if (textContent.includes('显示原文') || textContent.includes('顯示原文') || textContent.includes('Show original')) {
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
    const failTime = parseInt(textBox.dataset.translationFailTime || '0', 10)
    if (Date.now() - failTime < 10000) return // Wait 10 seconds before retrying on failure

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
    } else {
      delete textBox.dataset.translatedText
      textBox.dataset.translationFailTime = Date.now().toString()
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
