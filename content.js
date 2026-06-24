let settings = { enabled: true, targetLang: 'zh-CN', onlyComments: false };

async function loadSettings() {
    settings = await chrome.storage.local.get({ enabled: true, targetLang: 'zh-CN', onlyComments: false });
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        if (changes.enabled) settings.enabled = changes.enabled.newValue;
        if (changes.targetLang) settings.targetLang = changes.targetLang.newValue;
        if (changes.onlyComments) settings.onlyComments = changes.onlyComments.newValue;
    }
});

loadSettings();

function getPageContext() {
    const urlMatch = window.location.pathname.match(/\/status\/(\d+)/i);
    return {
        pageStatusId: urlMatch ? urlMatch[1] : null,
        isPhotoVideoOverlay: /\/status\/\d+\/(?:photo|video)\//i.test(window.location.pathname)
    };
}

function resolveStatusPage(tweet, pageContext) {
    if (pageContext.isPhotoVideoOverlay) {
        if (tweet.closest('[role="dialog"]') !== null) return true;
        return false;
    }
    return !!pageContext.pageStatusId;
}

function checkIsMainTweet(tweet, pageStatusId) {
    const timeNodes = tweet.querySelectorAll('time');
    for (const timeEl of timeNodes) {
        const link = timeEl.closest('a');
        if (link) {
            const href = link.getAttribute('href');
            const match = href ? href.match(/\/status\/(\d+)/i) : null;
            if (match) {
                return match[1] === pageStatusId;
            }
        }
    }
    return !!tweet.querySelector('article');
}

const langMap = {
    'en': '英语', 'ja': '日语', 'ko': '韩语', 'fr': '法语', 'de': '德语',
    'es': '西班牙语', 'ru': '俄语', 'it': '意大利语', 'pt': '葡萄牙语',
    'ar': '阿拉伯语', 'th': '泰语', 'vi': '越南语', 'id': '印尼语',
    'tr': '土耳其语', 'hi': '印地语', 'nl': '荷兰语', 'pl': '波兰语'
};

function getLangName(code) {
    if (!code) return '未知语言';
    const shortCode = code.split('-')[0].toLowerCase();
    return langMap[shortCode] || '未知语言';
}

async function translateText(text) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'translate', text: text, targetLang: settings.targetLang }, (response) => {
            if (response && response.success) {
                const data = response.data;
                let translatedText = '';
                if (data && data[0]) {
                    data[0].forEach(item => {
                        if (item[0]) translatedText += item[0];
                    });
                }
                resolve({ translatedText, detectedLang: data[2] });
            } else {
                resolve(null);
            }
        });
    });
}

function injectFakeGrokTranslation(textBox, translatedText, detectedLang) {
    if (textBox.dataset.hasFakeTranslation === "true") return;
    textBox.dataset.hasFakeTranslation = "true";

    const container = document.createElement('div');
    container.className = 'x-auto-translate-container';
    container.style.marginTop = textBox.style.marginTop;
    
    const langName = getLangName(detectedLang);

    // X 官方标准字体堆栈
    const xFontFamily = 'TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

    const header = document.createElement('div');
    header.style.fontSize = '13px'; // 更小一点的字体
    header.style.fontFamily = xFontFamily;
    header.style.color = 'rgb(113, 118, 123)'; 
    header.style.marginBottom = '4px';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.lineHeight = '20px';
    
    // 使用谷歌官方的彩色 G 图标
    const iconSvg = `
        <svg viewBox="0 0 24 24" aria-hidden="true" style="width: 14px; height: 14px; margin-right: 4px;">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
            <path d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"></path>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path>
        </svg>
    `;

    header.innerHTML = `
        ${iconSvg}
        <span>翻译自 ${langName}</span>
        <span class="show-original-btn" style="color: rgb(29, 155, 240); cursor: pointer; margin-left: 4px;">显示原文</span>
    `;
    
    const content = document.createElement('div');
    const computed = window.getComputedStyle(textBox);
    content.style.color = computed.color;
    content.style.fontFamily = computed.fontFamily; // 原文正文字体也是 X 的
    content.style.fontSize = computed.fontSize;
    content.style.lineHeight = computed.lineHeight;
    content.style.fontWeight = computed.fontWeight;
    content.style.whiteSpace = 'pre-wrap';
    content.style.wordBreak = 'break-word';
    content.innerText = translatedText;

    container.appendChild(header);
    container.appendChild(content);
    
    textBox.parentElement.insertBefore(container, textBox);
    textBox.style.display = 'none';

    const restoreBtn = document.createElement('div');
    restoreBtn.style.color = 'rgb(29, 155, 240)';
    restoreBtn.style.fontSize = '13px'; 
    restoreBtn.style.fontFamily = xFontFamily;
    restoreBtn.style.cursor = 'pointer';
    restoreBtn.style.marginTop = '4px';
    restoreBtn.innerText = '翻译推文';
    restoreBtn.style.display = 'none'; 
    textBox.parentElement.insertBefore(restoreBtn, textBox.nextSibling);

    const btn = header.querySelector('.show-original-btn');
    
    btn.addEventListener('click', () => {
        container.style.display = 'none';
        textBox.style.display = ''; 
        restoreBtn.style.display = '';
    });

    restoreBtn.addEventListener('click', () => {
        textBox.style.display = 'none';
        container.style.display = '';
        restoreBtn.style.display = 'none';
    });
}

const visibilityObserver = new IntersectionObserver((entries) => {
    if (!settings.enabled) return;
    
    const pageContext = getPageContext();

    entries.forEach(async entry => {
        if (entry.isIntersecting) {
            const tweet = entry.target;

            if (settings.onlyComments) {
                const isStatusPage = resolveStatusPage(tweet, pageContext);
                if (!isStatusPage) return; // 不在详情页，说明是主页时间线，跳过
                
                if (pageContext.pageStatusId) {
                    const isMainTweet = checkIsMainTweet(tweet, pageContext.pageStatusId);
                    if (isMainTweet) return; // 是详情页的主推文，跳过
                }
            }
            
            const textBox = tweet.querySelector('[data-testid="tweetText"]');
            if (!textBox) return;
            
            const text = textBox.innerText || textBox.textContent;
            if (!text || text.trim() === '') return;

            if (textBox.dataset.translatedText === text) return;
            textBox.dataset.translatedText = text; 

            const result = await translateText(text);
            
            if (result && result.translatedText) {
                if (!result.detectedLang.startsWith('zh')) {
                    const currentText = textBox.innerText || textBox.textContent;
                    if (currentText === text) {
                        injectFakeGrokTranslation(textBox, result.translatedText, result.detectedLang);
                    }
                }
            }
        }
    });
}, { root: null, rootMargin: '150px', threshold: 0.1 });

const domObserver = new MutationObserver(() => {
    const tweets = document.querySelectorAll('[data-testid="tweet"]');
    tweets.forEach(tweet => {
        if (!tweet.dataset.translateObserved) {
            tweet.dataset.translateObserved = "true";
            visibilityObserver.observe(tweet);
        }
    });
});

domObserver.observe(document.body, { childList: true, subtree: true });

setTimeout(() => {
    const tweets = document.querySelectorAll('[data-testid="tweet"]');
    tweets.forEach(tweet => {
        if (!tweet.dataset.translateObserved) {
            tweet.dataset.translateObserved = "true";
            visibilityObserver.observe(tweet);
        }
    });
}, 1000);
