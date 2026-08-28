// ===== 常量 =====
const SUPABASE_URL = 'https://ycgfwshoywewqdhnuslq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pXa1vmtE_ERMs7o90rtS7w_Ei3E5W-Y';
const CATEGORIES = ['Noun', 'Verb', 'Adjective', 'Adverb', 'Preposition', 'Others'];
const CATEGORY_LABELS = {
    'Noun': '名词',
    'Verb': '动词',
    'Adjective': '形容词',
    'Adverb': '副词',
    'Preposition': '介词',
    'Others': '其他'
};

// ===== Supabase 客户端 =====
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== 状态 =====
let words = [];
let nextId = 1;
let currentUser = null;
let isGuest = true;

// 访客模式本地单词（存在localStorage，最多20个）
const MAX_LOCAL_WORDS = 20;
const LOCAL_STORAGE_KEY = 'vocab_app_local_words';
let localWords = [];
let localNextId = 100000; // 本地单词ID从100000开始，避免和云端ID冲突

let filters = {
    level: '',
    priority: '',
    category: '',
    search: '',
    sort: 'date_desc'
};

let reviewState = {
    queue: [],
    currentIndex: 0,
    knowCount: 0,
    dontKnowCount: 0,
    settings: { priority: '', level: '' }
};

// ===== API 请求（带用户认证） =====
async function apiRequest(path, method = 'GET', body = null) {
    const headers = {
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json'
    };

    // 如果已登录，使用用户的 access token
    if (currentUser && currentUser.access_token) {
        headers['Authorization'] = `Bearer ${currentUser.access_token}`;
    } else {
        headers['Authorization'] = `Bearer ${SUPABASE_KEY}`;
    }

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    try {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1${path}`, options);
        if (!resp.ok) {
            const errText = await resp.text();
            console.error('API错误:', resp.status, errText);
            throw new Error(`API ${resp.status}: ${errText}`);
        }
        if (resp.status === 204) return null;
        const text = await resp.text();
        if (!text) return null;
        return JSON.parse(text);
    } catch (e) {
        console.error('请求失败:', e);
        throw e;
    }
}

// 数据库字段名转前端字段名
function dbToFrontend(w) {
    return {
        id: w.id,
        word: w.word || '',
        phonetic: w.phonetic || '',
        definition: w.definition || '',
        meaning: w.meaning || '',
        level: w.level || '',
        priority: w.priority || '',
        category: w.category || '',
        example: w.example || '',
        extend: w.extend || '',
        scene: w.scene || '',
        date: w.date || '',
        lastReview: w.last_review || '',
        reviewCount: w.review_count || 0
    };
}

// 前端字段名转数据库字段名
function frontendToDb(w) {
    const data = {
        word: w.word || '',
        phonetic: w.phonetic || '',
        definition: w.definition || '',
        meaning: w.meaning || '',
        level: w.level || '',
        priority: w.priority || '',
        category: w.category || '',
        example: w.example || '',
        extend: w.extend || '',
        scene: w.scene || '',
        date: w.date || '',
        last_review: w.lastReview || '',
        review_count: w.reviewCount || 0
    };
    // 如果已登录，加上 user_id
    if (currentUser && currentUser.id) {
        data.user_id = currentUser.id;
    }
    return data;
}

// ===== 用户认证 =====
async function checkAuth() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (data && data.session) {
        currentUser = {
            id: data.session.user.id,
            email: data.session.user.email,
            access_token: data.session.access_token
        };
        isGuest = false;
    } else {
        currentUser = null;
        isGuest = true;
    }
    updateAuthUI();
}

function updateAuthUI() {
    const guestButtons = document.getElementById('guestButtons');
    const userButtons = document.getElementById('userButtons');
    const userStatus = document.getElementById('userStatus');
    const guestBanner = document.getElementById('guestBanner');
    const emptyText = document.getElementById('emptyText');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');

    if (isGuest) {
        guestButtons.style.display = 'inline-block';
        userButtons.style.display = 'none';
        userStatus.style.display = 'none';
        guestBanner.style.display = 'flex';
        if (emptyText) emptyText.textContent = '没有找到匹配的示例单词';
        if (clearFiltersBtn) clearFiltersBtn.style.display = 'none';
    } else {
        guestButtons.style.display = 'none';
        userButtons.style.display = 'inline-block';
        userStatus.style.display = 'inline';
        userStatus.textContent = `👤 ${currentUser.email}`;
        guestBanner.style.display = 'none';
        if (emptyText) emptyText.textContent = '没有找到匹配的单词';
        if (clearFiltersBtn) clearFiltersBtn.style.display = 'inline-block';
    }
}

// ===== 访客模式本地单词管理 =====
function loadLocalWords() {
    try {
        const data = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (data) {
            localWords = JSON.parse(data);
            localNextId = localWords.length > 0 ? Math.max(...localWords.map(w => w.id)) + 1 : 100000;
        } else {
            localWords = [];
            localNextId = 100000;
        }
    } catch (e) {
        console.error('加载本地单词失败:', e);
        localWords = [];
        localNextId = 100000;
    }
}

function saveLocalWords() {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localWords));
    } catch (e) {
        console.error('保存本地单词失败:', e);
    }
}

function isLocalWord(id) {
    return id >= 100000;
}

let authMode = 'login'; // 'login' or 'register'

function openAuthModal(mode) {
    authMode = mode;
    const title = document.getElementById('authTitle');
    const submitBtn = document.getElementById('authSubmitBtn');
    const message = document.getElementById('authMessage');

    message.style.display = 'none';
    message.textContent = '';

    // 仅登录模式（注册功能已关闭，由管理员在后台创建用户）
    title.textContent = '登录';
    submitBtn.textContent = '登录';

    document.getElementById('authForm').reset();
    document.getElementById('authModal').style.display = 'flex';
    document.getElementById('authEmail').focus();
}

function closeAuthModal() {
    document.getElementById('authModal').style.display = 'none';
}

function showAuthMessage(text, isError = true) {
    const msg = document.getElementById('authMessage');
    msg.textContent = text;
    msg.style.display = 'block';
    msg.style.color = isError ? '#f85149' : '#3fb950';
}

async function handleAuthSubmit() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;

    if (!email || !password) {
        showAuthMessage('请填写邮箱和密码');
        return;
    }

    const submitBtn = document.getElementById('authSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = authMode === 'login' ? '登录中...' : '注册中...';

    try {
        if (authMode === 'login') {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            currentUser = {
                id: data.user.id,
                email: data.user.email,
                access_token: data.session.access_token
            };
            isGuest = false;
            closeAuthModal();
            await initData();
            alert('登录成功！');
        } else {
            const { data, error } = await supabaseClient.auth.signUp({ email, password });
            if (error) throw error;
            if (data.user && data.session) {
                currentUser = {
                    id: data.user.id,
                    email: data.user.email,
                    access_token: data.session.access_token
                };
                isGuest = false;
                closeAuthModal();
                await initData();
                alert('注册成功！欢迎使用我的单词本。');
            } else {
                showAuthMessage('注册成功，请检查邮箱验证后登录（如果开启了邮箱验证）', false);
            }
        }
    } catch (e) {
        console.error('认证失败:', e);
        showAuthMessage(e.message || '操作失败，请重试');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = authMode === 'login' ? '登录' : '注册';
    }
}

async function handleLogout() {
    if (!confirm('确定要退出登录吗？')) return;
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        alert('退出失败: ' + error.message);
        return;
    }
    currentUser = null;
    isGuest = true;
    updateAuthUI();
    await initData();
}

// ===== 发音功能 =====
function speakWord(word) {
    if (!word || !window.speechSynthesis) {
        alert('当前浏览器不支持发音功能');
        return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
}

// ===== 数据管理 =====
async function initData() {
    try {
        const list = document.getElementById('wordList');
        if (list) list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">正在加载单词...</div>';

        const data = await apiRequest('/words?select=*&order=date.desc');
        words = (data || []).map(dbToFrontend);
        nextId = words.length > 0 ? Math.max(...words.map(w => w.id)) + 1 : 1;

        // 访客模式：加载本地单词并合并
        if (isGuest) {
            loadLocalWords();
            // 本地单词标记isLocal，放在列表前面
            localWords.forEach(w => w.isLocal = true);
            words = [...localWords, ...words];
            console.log(`加载了 ${words.length} 个单词 (示例 ${words.length - localWords.length} + 本地 ${localWords.length})`);
        } else {
            console.log(`加载了 ${words.length} 个单词 (已登录: ${currentUser.email})`);
        }
    } catch (e) {
        console.error('加载数据失败:', e);
        alert('加载单词失败，请检查网络连接后刷新页面。\n\n错误信息: ' + e.message);
        words = [];
    }
    updateStats();
    renderCategoryOptions();
    renderWordList();
}

function calcPriority(level) {
    if (level === 'A' || level === 'B') return '低';
    if (level === 'C' || level === 'D') return '中';
    if (level === 'E') return '高';
    return '';
}

// 更新单词的最近复习日期和复习次数
async function updateLastReview(wordId) {
    const w = words.find(x => x.id === wordId);
    if (!w) return;

    // 示例单词不更新复习记录（公共示例，只读）
    if (isGuest && !w.isLocal) return;

    const today = new Date().toISOString().split('T')[0];
    w.lastReview = today;
    w.reviewCount = (w.reviewCount || 0) + 1;

    if (isGuest && w.isLocal) {
        // 访客模式：更新本地单词，保存到localStorage
        const idx = localWords.findIndex(x => x.id === wordId);
        if (idx >= 0) {
            localWords[idx].lastReview = today;
            localWords[idx].reviewCount = w.reviewCount;
            saveLocalWords();
        }
    } else if (!isGuest) {
        // 登录模式：同步到云端
        apiRequest(`/words?id=eq.${wordId}`, 'PATCH', {
            last_review: today,
            review_count: w.reviewCount
        }).catch(e => console.error('更新复习日期失败:', e));
    }
}

// ===== 渲染 =====
function updateStats() {
    const stats = document.getElementById('totalStats');
    if (isGuest) {
        const localCount = words.filter(w => w.isLocal).length;
        const sampleCount = words.length - localCount;
        stats.textContent = `示例 ${sampleCount} 词 · 本地 ${localCount}/${MAX_LOCAL_WORDS} 词`;
    } else {
        stats.textContent = `共 ${words.length} 词`;
    }
}

function renderCategoryOptions() {
    const select = document.getElementById('categoryFilter');
    const categories = [...new Set(words.map(w => w.category).filter(c => c))].sort();
    const current = select.value;
    select.innerHTML = '<option value="">全部</option>' +
        categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}${CATEGORY_LABELS[c] ? ' ' + CATEGORY_LABELS[c] : ''}</option>`).join('');
    select.value = current;
}

function getFilteredWords() {
    let result = [...words];

    if (filters.search) {
        const q = filters.search.toLowerCase();
        result = result.filter(w =>
            (w.word && w.word.toLowerCase().includes(q)) ||
            (w.meaning && w.meaning.toLowerCase().includes(q)) ||
            (w.phonetic && w.phonetic.toLowerCase().includes(q)) ||
            (w.definition && w.definition.toLowerCase().includes(q)) ||
            (w.example && w.example.toLowerCase().includes(q))
        );
    }

    if (filters.level) result = result.filter(w => w.level === filters.level);
    if (filters.priority) result = result.filter(w => w.priority === filters.priority);
    if (filters.category) result = result.filter(w => w.category === filters.category);

    switch (filters.sort) {
        case 'date_asc': result.sort((a, b) => (a.date || '').localeCompare(b.date || '')); break;
        case 'date_desc': result.sort((a, b) => (b.date || '').localeCompare(a.date || '')); break;
        case 'word_asc': result.sort((a, b) => (a.word || '').localeCompare(b.word || '')); break;
        case 'level_asc': result.sort((a, b) => (a.level || 'Z').localeCompare(b.level || 'Z')); break;
        case 'level_desc': result.sort((a, b) => (b.level || 'A').localeCompare(a.level || 'A')); break;
    }

    return result;
}

function renderWordList() {
    const list = document.getElementById('wordList');
    const emptyState = document.getElementById('emptyState');
    const filtered = getFilteredWords();

    if (filtered.length === 0) {
        list.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    emptyState.style.display = 'none';

    list.innerHTML = filtered.map(w => `
        <div class="word-card" data-id="${w.id}">
            <div class="word-card-header">
                <div class="word-card-word">
                    ${escapeHtml(w.word)}
                    <button class="speak-btn" data-word="${escapeHtml(w.word)}" title="发音">🔊</button>
                </div>
                <div class="word-card-tags">
                    ${w.level ? `<span class="tag tag-level tag-level-${w.level}">${w.level}</span>` : '<span class="tag tag-level tag-pending">待评级</span>'}
                    ${w.priority ? `<span class="tag tag-priority-${w.priority}">${w.priority}优先</span>` : '<span class="tag tag-priority-pending">待评级</span>'}
                    ${w.category ? `<span class="tag tag-category">${escapeHtml(w.category)}</span>` : ''}
                    ${isGuest && w.isLocal ? '<span class="tag" style="background:rgba(63,185,80,0.2);color:#3fb950;border:1px solid rgba(63,185,80,0.3);">体验</span>' : ''}
                    ${isGuest && !w.isLocal ? '<span class="tag" style="background:#30363d;color:#8b949e;">示例</span>' : ''}
                </div>
            </div>
            ${w.phonetic ? `<div class="word-card-phonetic">${escapeHtml(w.phonetic)}</div>` : ''}
            <div class="word-card-meaning">${escapeHtml(w.definition || '')}</div>
            <div class="word-card-dates">
                <span class="date-item">添加：${w.date || '未知'}</span>
                <span class="date-item">复习：${w.lastReview || '未复习'}</span>
                <span class="date-item">次数：${w.reviewCount || 0}</span>
            </div>
            <div class="word-card-details">
                ${w.meaning ? `<div class="detail-section"><div class="detail-label">中文释义</div><div class="detail-content">${escapeHtml(w.meaning)}</div></div>` : ''}
                ${w.example ? `<div class="detail-section"><div class="detail-label">例句</div><div class="detail-content">${escapeHtml(w.example)}</div></div>` : ''}
                ${w.extend ? `<div class="detail-section"><div class="detail-label">扩展 / 搭配</div><div class="detail-content">${escapeHtml(w.extend)}</div></div>` : ''}
                ${w.scene ? `<div class="detail-section"><div class="detail-label">场景 / 备注</div><div class="detail-content">${escapeHtml(w.scene)}</div></div>` : ''}
            </div>
            ${(!isGuest || w.isLocal) ? `
            <div class="word-card-actions">
                <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); editWord(${w.id})">编辑</button>
                <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); deleteWord(${w.id})">删除</button>
            </div>
            ` : ''}
        </div>
    `).join('');

    // 卡片点击展开
    list.querySelectorAll('.word-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('speak-btn')) return;
            const isExpanding = !card.classList.contains('expanded');
            card.classList.toggle('expanded');
            if (isExpanding) {
                const wordId = parseInt(card.dataset.id);
                const w = words.find(x => x.id === wordId);
                // 示例单词不更新复习记录，本地单词和登录用户的单词都更新
                if (!isGuest || (w && w.isLocal)) {
                    updateLastReview(wordId);
                    const dateItems = card.querySelectorAll('.date-item');
                    const today = new Date().toISOString().split('T')[0];
                    if (dateItems.length >= 2) {
                        dateItems[1].textContent = '复习：' + today;
                    }
                    if (dateItems.length >= 3 && w) {
                        dateItems[2].textContent = '次数：' + w.reviewCount;
                    }
                }
            }
        });
    });

    // 发音按钮
    list.querySelectorAll('.speak-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            speakWord(btn.dataset.word);
        });
    });
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===== 单词 CRUD =====
function openAddModal() {
    if (isGuest) {
        // 访客模式：检查本地单词数量上限
        if (localWords.length >= MAX_LOCAL_WORDS) {
            alert(`体验模式最多可新增 ${MAX_LOCAL_WORDS} 个单词。\n\n登录后可使用完整功能，数据云端同步。\n管理员微信/电话：17623258916`);
            return;
        }
        document.getElementById('modalTitle').textContent = '体验新增（仅保存在本地）';
    } else {
        document.getElementById('modalTitle').textContent = '新增单词';
    }
    document.getElementById('wordId').value = '';
    document.getElementById('wordForm').reset();
    document.getElementById('formDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('formLevel').value = 'E';
    document.getElementById('formCategory').value = '';
    updatePriorityDisplay();
    document.getElementById('wordModal').style.display = 'flex';
    document.getElementById('formWord').focus();
}

function editWord(id) {
    const w = words.find(x => x.id === id);
    if (!w) return;
    if (isGuest && !w.isLocal) {
        alert('示例单词不能编辑，请登录后使用完整功能。\n管理员微信/电话：17623258916');
        return;
    }
    if (isGuest && w.isLocal) {
        document.getElementById('modalTitle').textContent = '编辑（仅本地）';
    } else {
        document.getElementById('modalTitle').textContent = '编辑单词';
    }
    document.getElementById('wordId').value = w.id;
    document.getElementById('formWord').value = w.word || '';
    document.getElementById('formCategory').value = w.category || '';
    document.getElementById('formLevel').value = w.level || 'E';
    document.getElementById('formPhonetic').value = w.phonetic || '';
    document.getElementById('formDefinition').value = w.definition || '';
    document.getElementById('formMeaning').value = w.meaning || '';
    document.getElementById('formExample').value = w.example || '';
    document.getElementById('formExtend').value = w.extend || '';
    document.getElementById('formDate').value = w.date || '';
    document.getElementById('formScene').value = w.scene || '';
    updatePriorityDisplay();
    document.getElementById('wordModal').style.display = 'flex';
}

async function deleteWord(id) {
    const w = words.find(x => x.id === id);
    if (!w) return;
    if (isGuest && !w.isLocal) {
        alert('示例单词不能删除，请登录后使用完整功能。\n管理员微信/电话：17623258916');
        return;
    }
    if (!confirm(`确定删除单词「${w.word}」吗？`)) return;

    try {
        words = words.filter(x => x.id !== id);

        if (isGuest && w.isLocal) {
            // 访客模式：从本地删除
            localWords = localWords.filter(x => x.id !== id);
            saveLocalWords();
        } else {
            // 登录模式：同步到云端
            await apiRequest(`/words?id=eq.${id}`, 'DELETE');
        }

        updateStats();
        renderCategoryOptions();
        renderWordList();
    } catch (e) {
        alert('删除失败，请检查网络后重试。\n错误: ' + e.message);
        await initData();
    }
}

async function saveWord() {
    const id = document.getElementById('wordId').value;
    const word = document.getElementById('formWord').value.trim();
    const meaning = document.getElementById('formMeaning').value.trim();

    if (!word) { alert('请输入单词'); return; }
    if (!meaning) { alert('请输入中文释义'); return; }

    const level = document.getElementById('formLevel').value;
    const data = {
        word,
        category: document.getElementById('formCategory').value,
        level,
        priority: calcPriority(level),
        phonetic: document.getElementById('formPhonetic').value.trim(),
        definition: document.getElementById('formDefinition').value.trim(),
        meaning,
        example: document.getElementById('formExample').value.trim(),
        extend: document.getElementById('formExtend').value.trim(),
        date: document.getElementById('formDate').value,
        scene: document.getElementById('formScene').value.trim()
    };

    try {
        if (isGuest) {
            // 访客模式：保存到本地
            if (id) {
                // 编辑本地单词
                const idx = localWords.findIndex(x => x.id === parseInt(id));
                if (idx >= 0) {
                    localWords[idx] = { ...localWords[idx], ...data };
                }
                // 同步更新words列表
                const widx = words.findIndex(x => x.id === parseInt(id));
                if (widx >= 0) {
                    words[widx] = { ...words[widx], ...data, isLocal: true };
                }
            } else {
                // 新增本地单词
                if (localWords.length >= MAX_LOCAL_WORDS) {
                    alert(`体验模式最多可新增 ${MAX_LOCAL_WORDS} 个单词。\n\n登录后可使用完整功能，数据云端同步。\n管理员微信/电话：17623258916`);
                    return;
                }
                const newId = localNextId++;
                const newWord = { id: newId, ...data, lastReview: '', reviewCount: 0, isLocal: true };
                localWords.push(newWord);
                words.unshift(newWord); // 本地单词放在列表前面
            }
            saveLocalWords();
            alert('保存成功！体验模式下单词仅保存在本地浏览器，清除浏览器数据后会丢失。\n\n登录后可使用完整功能，数据云端同步。\n管理员微信/电话：17623258916');
        } else {
            // 登录模式：保存到云端
            if (id) {
                const idx = words.findIndex(x => x.id === parseInt(id));
                if (idx >= 0) {
                    words[idx] = { ...words[idx], ...data };
                }
                await apiRequest(`/words?id=eq.${id}`, 'PATCH', frontendToDb(data));
            } else {
                const result = await apiRequest('/words?select=id', 'POST', frontendToDb(data));
                const newId = result && result.length > 0 ? result[0].id : nextId++;
                words.push({ id: newId, ...data, lastReview: '', reviewCount: 0 });
            }
        }

        updateStats();
        renderCategoryOptions();
        renderWordList();
        closeModal();

        if (document.getElementById('reviewOverlay').style.display === 'flex' &&
            document.getElementById('flashcard').style.display !== 'none') {
            const currentWord = reviewState.queue[reviewState.currentIndex];
            if (currentWord) {
                const updated = words.find(x => x.id === currentWord.id);
                if (updated) {
                    reviewState.queue[reviewState.currentIndex] = { ...updated };
                    showFlashcard();
                }
            }
        }
    } catch (e) {
        alert('保存失败，请检查网络后重试。\n错误: ' + e.message);
    }
}

function closeModal() {
    document.getElementById('wordModal').style.display = 'none';
}

function updatePriorityDisplay() {
    const level = document.getElementById('formLevel').value;
    document.getElementById('formPriority').value = calcPriority(level);
}

// ===== 导入导出 =====
function exportData() {
    if (isGuest) {
        alert('请先登录后再导出数据');
        openAuthModal('login');
        return;
    }
    const data = {
        version: 2,
        exported_at: new Date().toLocaleString('zh-CN'),
        total: words.length,
        words
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `单词本_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

async function importData(file) {
    if (isGuest) {
        alert('请先登录后再导入数据');
        openAuthModal('login');
        return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const importedWords = (data.words || []).map(w => {
                if (w.phonetic === undefined && w.paraphrase) {
                    const raw = w.paraphrase || '';
                    const phoneticPattern = /^(\/[^\/]+\/|\[[^\]]+\])\s*/;
                    const match = raw.match(phoneticPattern);
                    let phonetic = '';
                    let definition = raw;
                    if (match) {
                        phonetic = match[1].trim();
                        definition = raw.slice(match[0].length).trim();
                    }
                    return { ...w, phonetic, definition, lastReview: w.lastReview || '', reviewCount: w.reviewCount || 0 };
                }
                return { ...w, lastReview: w.lastReview || '', reviewCount: w.reviewCount || 0 };
            });

            if (importedWords.length === 0) { alert('文件中没有单词数据'); return; }

            const choice = confirm(`找到 ${importedWords.length} 个单词。\n\n点击「确定」= 合并到现有单词本\n点击「取消」= 替换现有单词本`);

            if (choice) {
                const existing = new Set(words.map(w => w.word + '|' + w.meaning));
                const toAdd = importedWords.filter(w => {
                    const key = w.word + '|' + w.meaning;
                    return !existing.has(key);
                });

                if (toAdd.length === 0) {
                    alert('没有新单词，全部是重复项。');
                    return;
                }

                let added = 0;
                for (let i = 0; i < toAdd.length; i += 50) {
                    const batch = toAdd.slice(i, i + 50).map(frontendToDb);
                    await apiRequest('/words', 'POST', batch);
                    added += batch.length;
                }

                alert(`合并完成！新增 ${added} 个单词，跳过 ${importedWords.length - added} 个重复项。`);
            } else {
                if (!confirm('确定要替换现有所有单词吗？此操作不可撤销。')) return;
                await apiRequest('/words?id=gte.0', 'DELETE');
                words = [];

                for (let i = 0; i < importedWords.length; i += 50) {
                    const batch = importedWords.slice(i, i + 50).map(frontendToDb);
                    await apiRequest('/words', 'POST', batch);
                }

                alert(`已替换为 ${importedWords.length} 个单词。`);
            }

            await initData();
        } catch (err) {
            alert('导入失败：' + err.message);
            console.error(err);
        }
    };
    reader.readAsText(file, 'UTF-8');
}

// ===== 闪卡复习 =====
function startReview() {
    if (isGuest) {
        if (!confirm('体验模式：闪卡复习可正常体验，但等级变化不会保存。\n\n登录后可使用完整功能，复习进度云端同步。\n管理员微信/电话：17623258916\n\n是否继续体验？')) {
            return;
        }
    }
    document.getElementById('reviewOverlay').style.display = 'flex';
    document.getElementById('reviewSettings').style.display = 'flex';
    document.getElementById('flashcard').style.display = 'none';
    document.getElementById('review-actions').style.display = 'none';
    document.getElementById('reviewResult').style.display = 'none';
}

function beginReview() {
    let queue = [...words];
    if (reviewState.settings.priority) queue = queue.filter(w => w.priority === reviewState.settings.priority);
    if (reviewState.settings.level) queue = queue.filter(w => w.level === reviewState.settings.level);

    for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
    }

    reviewState.queue = queue;
    reviewState.currentIndex = 0;
    reviewState.knowCount = 0;
    reviewState.dontKnowCount = 0;

    if (queue.length === 0) {
        alert('当前筛选条件下没有单词');
        return;
    }

    document.getElementById('reviewSettings').style.display = 'none';
    document.getElementById('flashcard').style.display = 'block';
    document.getElementById('review-actions').style.display = 'flex';
    document.getElementById('reviewResult').style.display = 'none';
    showFlashcard();
}

function showFlashcard() {
    const w = reviewState.queue[reviewState.currentIndex];
    if (!w) return;

    document.getElementById('reviewProgress').textContent = `${reviewState.currentIndex + 1} / ${reviewState.queue.length}`;
    document.getElementById('cardWord').innerHTML = `
        ${escapeHtml(w.word)}
        <button class="speak-btn speak-btn-lg" data-word="${escapeHtml(w.word)}" title="发音">🔊</button>
    `;
    document.getElementById('cardCategory').textContent = w.category ? `${w.category}${CATEGORY_LABELS[w.category] ? ' · ' + CATEGORY_LABELS[w.category] : ''}` : '';
    document.getElementById('cardWordBack').textContent = w.word;
    document.getElementById('cardPhonetic').textContent = w.phonetic || '';
    document.getElementById('cardMeaning').textContent = w.meaning || '';
    document.getElementById('cardDefinition').textContent = w.definition || '';
    document.getElementById('cardExample').textContent = w.example ? '例句：' + w.example : '';
    document.getElementById('cardExtend').textContent = w.extend ? '扩展：' + w.extend : '';
    document.getElementById('flashcard').classList.remove('flipped');

    setTimeout(() => {
        const btn = document.querySelector('#cardWord .speak-btn');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                speakWord(btn.dataset.word);
            });
        }
    }, 10);
}

function nextFlashcard() {
    const w = reviewState.queue[reviewState.currentIndex];
    if (w) updateLastReview(w.id);
    reviewState.currentIndex++;
    if (reviewState.currentIndex >= reviewState.queue.length) {
        finishReview();
    } else {
        showFlashcard();
    }
}

async function markKnow() {
    reviewState.knowCount++;
    const w = reviewState.queue[reviewState.currentIndex];
    const wordInList = words.find(x => x.id === w.id);
    let updatedLevel = null;
    let updatedPriority = null;

    if (wordInList && wordInList.level !== 'A') {
        const levels = ['E', 'D', 'C', 'B', 'A'];
        const idx = levels.indexOf(wordInList.level);
        if (idx >= 0 && idx < levels.length - 1) {
            wordInList.level = levels[idx + 1];
            wordInList.priority = calcPriority(wordInList.level);
            updatedLevel = wordInList.level;
            updatedPriority = wordInList.priority;
        }
    }
    updateLastReview(w.id);

    // 访客模式不更新云端，仅登录用户同步
    if (updatedLevel && !isGuest) {
        apiRequest(`/words?id=eq.${w.id}`, 'PATCH', {
            level: updatedLevel,
            priority: updatedPriority
        }).catch(e => console.error('更新等级失败:', e));
    }

    nextFlashcard();
}

async function markDontKnow() {
    reviewState.dontKnowCount++;
    const w = reviewState.queue[reviewState.currentIndex];
    const wordInList = words.find(x => x.id === w.id);
    let updatedLevel = null;
    let updatedPriority = null;

    if (wordInList && wordInList.level !== 'E') {
        const levels = ['A', 'B', 'C', 'D', 'E'];
        const idx = levels.indexOf(wordInList.level);
        if (idx >= 0 && idx < levels.length - 1) {
            wordInList.level = levels[idx + 1];
            wordInList.priority = calcPriority(wordInList.level);
            updatedLevel = wordInList.level;
            updatedPriority = wordInList.priority;
        }
    }
    updateLastReview(w.id);

    // 访客模式不更新云端，仅登录用户同步
    if (updatedLevel && !isGuest) {
        apiRequest(`/words?id=eq.${w.id}`, 'PATCH', {
            level: updatedLevel,
            priority: updatedPriority
        }).catch(e => console.error('更新等级失败:', e));
    }

    nextFlashcard();
}

function finishReview() {
    document.getElementById('flashcard').style.display = 'none';
    document.getElementById('review-actions').style.display = 'none';
    document.getElementById('reviewResult').style.display = 'block';
    document.getElementById('resultSummary').innerHTML =
        `共复习 <strong>${reviewState.queue.length}</strong> 个单词<br>` +
        `✅ 认识：<strong>${reviewState.knowCount}</strong> 个（等级已提升）<br>` +
        `❌ 不认识：<strong>${reviewState.dontKnowCount}</strong> 个（等级已降低，需重点复习）`;
    renderWordList();
    renderCategoryOptions();
}

function closeReview() {
    document.getElementById('reviewOverlay').style.display = 'none';
}

// ===== 事件绑定 =====
document.addEventListener('DOMContentLoaded', async () => {
    // 先检查登录状态
    await checkAuth();
    // 然后加载数据
    await initData();

    // 搜索
    document.getElementById('searchInput').addEventListener('input', (e) => {
        filters.search = e.target.value;
        renderWordList();
    });

    // 等级筛选
    document.querySelectorAll('#levelFilters .chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#levelFilters .chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filters.level = chip.dataset.level;
            renderWordList();
        });
    });

    // 优先级筛选
    document.querySelectorAll('#priorityFilters .chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#priorityFilters .chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filters.priority = chip.dataset.priority;
            renderWordList();
        });
    });

    // 词性筛选
    document.getElementById('categoryFilter').addEventListener('change', (e) => {
        filters.category = e.target.value;
        renderWordList();
    });

    // 排序
    document.getElementById('sortSelect').addEventListener('change', (e) => {
        filters.sort = e.target.value;
        renderWordList();
    });

    // 认证相关
    document.getElementById('loginBtn').addEventListener('click', () => openAuthModal('login'));
    // 已关闭注册功能，仅管理员可在后台创建用户
    // document.getElementById('registerBtn').addEventListener('click', () => openAuthModal('register'));
    document.getElementById('bannerLoginBtn').addEventListener('click', () => openAuthModal('login'));
    // document.getElementById('bannerRegisterBtn').addEventListener('click', () => openAuthModal('register'));
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    // 访客体验新增按钮
    const guestAddBtn = document.getElementById('guestAddBtn');
    if (guestAddBtn) guestAddBtn.addEventListener('click', openAddModal);
    document.getElementById('authSubmitBtn').addEventListener('click', handleAuthSubmit);
    document.getElementById('authCancelBtn').addEventListener('click', closeAuthModal);
    document.getElementById('authClose').addEventListener('click', closeAuthModal);
    // 已关闭注册切换
    // document.getElementById('authSwitchBtn').addEventListener('click', () => {
    //     openAuthModal(authMode === 'login' ? 'register' : 'login');
    // });
    document.getElementById('authForm').addEventListener('submit', (e) => {
        e.preventDefault();
        handleAuthSubmit();
    });
    document.getElementById('authModal').addEventListener('click', (e) => {
        if (e.target.id === 'authModal') closeAuthModal();
    });

    // 新增
    document.getElementById('addBtn').addEventListener('click', openAddModal);
    document.getElementById('saveBtn').addEventListener('click', saveWord);
    document.getElementById('cancelBtn').addEventListener('click', closeModal);
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('formLevel').addEventListener('change', updatePriorityDisplay);

    document.getElementById('wordModal').addEventListener('click', (e) => {
        if (e.target.id === 'wordModal') closeModal();
    });

    // 导出
    document.getElementById('exportBtn').addEventListener('click', exportData);

    // 导入
    document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', (e) => {
        if (e.target.files[0]) importData(e.target.files[0]);
        e.target.value = '';
    });

    // 清除筛选
    document.getElementById('clearFiltersBtn').addEventListener('click', () => {
        filters = { level: '', priority: '', category: '', search: '', sort: 'date_desc' };
        document.getElementById('searchInput').value = '';
        document.getElementById('categoryFilter').value = '';
        document.getElementById('sortSelect').value = 'date_desc';
        document.querySelectorAll('#levelFilters .chip').forEach(c => c.classList.remove('active'));
        document.querySelector('#levelFilters .chip[data-level=""]').classList.add('active');
        document.querySelectorAll('#priorityFilters .chip').forEach(c => c.classList.remove('active'));
        document.querySelector('#priorityFilters .chip[data-priority=""]').classList.add('active');
        renderWordList();
    });

    // 闪卡复习
    document.getElementById('reviewBtn').addEventListener('click', startReview);
    document.getElementById('closeReviewBtn').addEventListener('click', closeReview);
    document.getElementById('reviewSettingsBtn').addEventListener('click', () => {
        const s = document.getElementById('reviewSettings');
        s.style.display = s.style.display === 'none' ? 'flex' : 'none';
    });
    document.getElementById('startReviewBtn').addEventListener('click', beginReview);
    document.getElementById('flashcard').addEventListener('click', (e) => {
        if (e.target.classList.contains('speak-btn')) return;
        document.getElementById('flashcard').classList.toggle('flipped');
    });
    document.getElementById('knowBtn').addEventListener('click', markKnow);
    document.getElementById('dontKnowBtn').addEventListener('click', markDontKnow);
    document.getElementById('skipBtn').addEventListener('click', nextFlashcard);
    document.getElementById('editCurrentBtn').addEventListener('click', () => {
        const w = reviewState.queue[reviewState.currentIndex];
        if (w) editWord(w.id);
    });
    document.getElementById('reviewAgainBtn').addEventListener('click', () => {
        document.getElementById('reviewResult').style.display = 'none';
        document.getElementById('reviewSettings').style.display = 'flex';
    });

    // 复习设置 - 优先级
    document.querySelectorAll('[data-review-priority]').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('[data-review-priority]').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            reviewState.settings.priority = chip.dataset.reviewPriority;
        });
    });

    // 复习设置 - 等级
    document.querySelectorAll('[data-review-level]').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('[data-review-level]').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            reviewState.settings.level = chip.dataset.reviewLevel;
        });
    });

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
        if (document.getElementById('reviewOverlay').style.display === 'flex' &&
            document.getElementById('flashcard').style.display !== 'none') {
            if (e.key === 'ArrowRight' || e.key === ' ') {
                e.preventDefault();
                document.getElementById('flashcard').classList.toggle('flipped');
            } else if (e.key === '1') {
                markDontKnow();
            } else if (e.key === '2') {
                markKnow();
            }
        }
        if (e.key === 'Escape') {
            if (document.getElementById('reviewOverlay').style.display === 'flex') {
                closeReview();
            } else if (document.getElementById('wordModal').style.display === 'flex') {
                closeModal();
            } else if (document.getElementById('authModal').style.display === 'flex') {
                closeAuthModal();
            }
        }
    });

    // 监听登录状态变化
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentUser = {
                id: session.user.id,
                email: session.user.email,
                access_token: session.access_token
            };
            isGuest = false;
            updateAuthUI();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            isGuest = true;
            updateAuthUI();
        }
    });
});