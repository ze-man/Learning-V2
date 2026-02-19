if (typeof BareMux === 'undefined') {
    BareMux = { BareMuxConnection: class { constructor() { } setTransport() { } } };
}

// Browser state
let scramjet;
let tabs = [];
let activeTabId = null;
let nextTabId = 1;
let basePath = location.pathname.replace(/[^/]*$/, '');
let connectionActive = false;

// WISP Configuration
const DEFAULT_WISP = "wss://dash.goip.de/wisp/";
const WISP_SERVERS = [
    { name: "DaydreamX's Wisp", url: "wss://dash.goip.de/wisp/" },
    { name: "Space's Wisp", url: "wss://register.goip.it/wisp/" },
    { name: "Rhw's Wisp", url: "wss://wisp.rhw.one/wisp/" },
    { name: "GoToSpace", url: "wss://gointospace.app/wisp/" }
];

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async function () {
    initializeBrowser();
});

async function initializeBrowser() {
    try {
        const { ScramjetController } = $scramjetLoadController();
        scramjet = new ScramjetController({
            files: {
                wasm: "https://cdn.jsdelivr.net/gh/Destroyed12121/Staticsj@main/JS/scramjet.wasm.wasm",
                all: "https://cdn.jsdelivr.net/gh/Destroyed12121/Staticsj@main/JS/scramjet.all.js",
                sync: "https://cdn.jsdelivr.net/gh/Destroyed12121/Staticsj@main/JS/scramjet.sync.js"
            }
        });

        await scramjet.init();

        if ('serviceWorker' in navigator) {
            try {
                const reg = await navigator.serviceWorker.register(basePath + 'sw.js', { scope: basePath });
                await navigator.serviceWorker.ready;
                const wispUrl = localStorage.getItem("proxServer") || DEFAULT_WISP;

                if (!localStorage.getItem("proxServer")) {
                    localStorage.setItem("proxServer", DEFAULT_WISP);
                }

                reg.active.postMessage({ type: "config", wispurl: wispUrl });

                const connection = new BareMux.BareMuxConnection(basePath + "bareworker.js");
                await connection.setTransport("https://cdn.jsdelivr.net/npm/@mercuryworkshop/epoxy-transport/dist/index.mjs", [{ wisp: wispUrl }]);
                connectionActive = true;
            } catch (e) {
                console.log("Service worker setup (may work without):", e);
            }
        }

        setupBrowserUI();
        createTab(true);
        setupEventListeners();

    } catch (e) {
        console.error("Initialization error:", e);
        alert("Failed to initialize proxy browser. Check console.");
    }
}

function setupBrowserUI() {
    // Event bindings
    document.getElementById('back-btn').onclick = () => getActiveTab()?.frame?.back?.();
    document.getElementById('fwd-btn').onclick = () => getActiveTab()?.frame?.forward?.();
    document.getElementById('reload-btn').onclick = () => getActiveTab()?.frame?.reload?.();

    const addrBar = document.getElementById("address-bar");
    addrBar.onkeyup = (e) => { if (e.key === 'Enter') handleSubmit(); };
    addrBar.onfocus = () => addrBar.select();

    // WISP server selection
    document.getElementById('wisp-select').onchange = (e) => {
        localStorage.setItem("proxServer", e.target.value);
        location.reload();
    };

    // Set current WISP in dropdown
    const currentWisp = localStorage.getItem("proxServer") || DEFAULT_WISP;
    document.getElementById('wisp-select').value = currentWisp;
}

function setupEventListeners() {
    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'navigate') {
            handleSubmit(e.data.url);
        }
    });
}

// TAB MANAGEMENT

function createTab(makeActive = true) {
    const frame = scramjet.createFrame();
    const tab = {
        id: nextTabId++,
        title: "New Tab",
        url: "about:blank",
        frame: frame,
        loading: false,
        favicon: null
    };

    frame.frame.src = "about:blank";

    // Event: URL Change (Navigation started)
    frame.addEventListener("urlchange", (e) => {
        tab.url = e.url;
        tab.loading = true;

        try {
            const urlObj = new URL(e.url);
            tab.title = urlObj.hostname;
            tab.favicon = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
        } catch (err) {
            tab.title = "Browsing";
            tab.favicon = null;
        }

        updateTabsUI();
        updateAddressBar();
        updateLoadingBar(tab, 10);
    });

    // Event: Load Finished
    frame.frame.addEventListener('load', () => {
        tab.loading = false;

        try {
            const internalTitle = frame.frame.contentWindow.document.title;
            if (internalTitle) tab.title = internalTitle;
        } catch (e) { }

        updateTabsUI();
        updateAddressBar();
        updateLoadingBar(tab, 100);
    });

    tabs.push(tab);
    document.getElementById("iframe-container").appendChild(frame.frame);
    if (makeActive) switchTab(tab.id);
    return tab;
}

function switchTab(tabId) {
    activeTabId = tabId;
    tabs.forEach(t => t.frame.frame.classList.toggle("hidden", t.id !== tabId));
    updateTabsUI();
    updateAddressBar();
}

function closeTab(tabId) {
    const idx = tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;

    const tab = tabs[idx];
    tab.frame.frame.remove();
    tabs.splice(idx, 1);

    if (activeTabId === tabId) {
        if (tabs.length > 0) {
            switchTab(tabs[Math.max(0, idx - 1)].id);
        } else {
            createTab(true);
        }
    } else {
        updateTabsUI();
    }
}

function updateTabsUI() {
    const container = document.getElementById("tabs-container");
    container.innerHTML = "";

    tabs.forEach(tab => {
        const el = document.createElement("div");
        el.className = `tab ${tab.id === activeTabId ? "active" : ""}`;

        let iconHtml = '';
        if (tab.favicon) {
            iconHtml = `<img src="${tab.favicon}" style="width:16px; height:16px; border-radius:3px;" onerror="this.style.display='none'">`;
        }

        el.innerHTML = `
            ${iconHtml}
            <span class="tab-title">${tab.loading ? "Loading..." : tab.title}</span>
            <span class="tab-close">&times;</span>
        `;

        el.onclick = () => switchTab(tab.id);
        el.querySelector(".tab-close").onclick = (e) => { e.stopPropagation(); closeTab(tab.id); };
        container.appendChild(el);
    });

    const newBtn = document.createElement("button");
    newBtn.className = "new-tab-btn";
    newBtn.innerHTML = "<i class='fas fa-plus'></i>";
    newBtn.onclick = () => createTab(true);
    container.appendChild(newBtn);
}

function updateAddressBar() {
    const bar = document.getElementById("address-bar");
    const tab = getActiveTab();
    if (bar && tab) {
        bar.value = (tab.url && tab.url !== "about:blank") ? tab.url : "";
    }
}

function getActiveTab() {
    return tabs.find(t => t.id === activeTabId);
}

function handleSubmit(url) {
    const tab = getActiveTab();
    let input = url || document.getElementById("address-bar").value.trim();
    
    if (!input) return;

    if (!input.startsWith('http')) {
        if (input.includes('.') && !input.includes(' ')) {
            input = 'https://' + input;
        } else {
            input = 'https://search.brave.com/search?q=' + encodeURIComponent(input);
        }
    }
    
    tab.frame.go(input);
}

function updateLoadingBar(tab, percent) {
    if (tab.id !== activeTabId) return;
    const bar = document.getElementById("loading-bar");
    bar.style.width = percent + "%";
    if (percent === 100) {
        setTimeout(() => { bar.style.width = "0%"; }, 300);
    }
}
