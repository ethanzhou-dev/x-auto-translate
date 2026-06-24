chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'translate') {
        // 使用与 X 相同的底层翻译服务 (Google Translate API)
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${request.targetLang}&dt=t&q=${encodeURIComponent(request.text)}`;
        
        fetch(url)
            .then(res => res.json())
            .then(data => sendResponse({ success: true, data: data }))
            .catch(err => sendResponse({ success: false, error: err.toString() }));
            
        return true; // 保持通道处于开启状态，等待异步的 fetch 完成
    }
});
