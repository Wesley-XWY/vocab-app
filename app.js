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

// ===== 状态 =====
let words = [];
let nextId = 1;

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

// ===== Supabase API 基础函数 =====
async function apiRequest(path, method = 'GET', body = null) {
    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
    };
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
        return await resp.json();
    } catch (e) {
        console.error('请求失败:', e);
        throw e;
    }
}

// 数据库字段名（下划线）转前端字段名（驼峰）
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
    return {
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
        // 显示加载状态
        const list = document.getElementById('wordList');
        if (list) list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">正在从云端加载单词...</div>';

        // 从Supabase加载所有单词
        const data = await apiRequest('/words?select=*&order=date.desc');
        words = (data || []).map(dbToFrontend);
        nextId = words.length > 0 ? Math.max(...words.map(w => w.id)) + 1 : 1;

        console.log(`从云端加载了 ${words.length} 个单词`);
    } catch (e) {
        console.error('加载数据失败:', e);
        alert('从云端加载单词失败，请检查网络连接后刷新页面。\n\n错误信息: ' + e.message);
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

// 更新单词的最近复习日期和复习次数（同步到云端）
async function updateLastReview(wordId) {
    const w = words.find(x => x.id === wordId);
    if (w) {
        const today = new Date().toISOString().split('T')[0];
        w.lastReview = today;
        w.reviewCount = (w.reviewCount || 0) + 1;

        // 异步同步到云端，不阻塞UI
        apiRequest(`/words?id=eq.${wordId}`, 'PATCH', {
            last_review: today,
            review_count: w.reviewCount
        }).catch(e => console.error('更新复习日期失败:', e));
    }
}

// ===== 渲染 =====
function updateStats() {
    document.getElementById('totalStats').textContent = `共 ${words.length} 词`;
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
            <div class="word-card-actions">
                <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); editWord(${w.id})">编辑</button>
                <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); deleteWord(${w.id})">删除</button>
            </div>
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
                updateLastReview(wordId);
                // 更新卡片上的复习日期和次数显示
                const dateItems = card.querySelectorAll('.date-item');
                const today = new Date().toISOString().split('T')[0];
                const w = words.find(x => x.id === wordId);
                if (dateItems.length >= 2) {
                    dateItems[1].textContent = '复习：' + today;
                }
                if (dateItems.length >= 3 && w) {
                    dateItems[2].textContent = '次数：' + w.reviewCount;
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
    document.getElementById('modalTitle').textContent = '新增单词';
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
    document.getElementById('modalTitle').textContent = '编辑单词';
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
    if (!confirm(`确定删除单词「${w.word}」吗？`)) return;

    try {
        // 先从内存删除，更新UI
        words = words.filter(x => x.id !== id);
        updateStats();
        renderCategoryOptions();
        renderWordList();

        // 同步到云端
        await apiRequest(`/words?id=eq.${id}`, 'DELETE');
    } catch (e) {
        alert('删除失败，请检查网络后重试。\n错误: ' + e.message);
        // 失败则重新加载
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
        if (id) {
            // 编辑：先更新内存
            const idx = words.findIndex(x => x.id === parseInt(id));
            if (idx >= 0) {
                words[idx] = { ...words[idx], ...data };
            }
            // 同步到云端
            await apiRequest(`/words?id=eq.${id}`, 'PATCH', frontendToDb(data));
        } else {
            // 新增：先插入云端，拿到自动生成的id
            const result = await apiRequest('/words?select=id', 'POST', frontendToDb(data));
            const newId = result && result.length > 0 ? result[0].id : nextId++;
            words.push({ id: newId, ...data, lastReview: '', reviewCount: 0 });
        }

        updateStats();
        renderCategoryOptions();
        renderWordList();
        closeModal();

        // 如果正在复习，更新当前复习卡片的显示
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
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const importedWords = (data.words || []).map(w => {
                // 兼容旧格式
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
                // 合并：批量插入到云端
                const existing = new Set(words.map(w => w.word + '|' + w.meaning));
                const toAdd = importedWords.filter(w => {
                    const key = w.word + '|' + w.meaning;
                    return !existing.has(key);
                });

                if (toAdd.length === 0) {
                    alert('没有新单词，全部是重复项。');
                    return;
                }

                // 分批插入，每批50条
                let added = 0;
                for (let i = 0; i < toAdd.length; i += 50) {
                    const batch = toAdd.slice(i, i + 50).map(frontendToDb);
                    await apiRequest('/words', 'POST', batch);
                    added += batch.length;
                }

                alert(`合并完成！新增 ${added} 个单词，跳过 ${importedWords.length - added} 个重复项。`);
            } else {
                // 替换：先清空现有，再批量插入
                if (!confirm('确定要替换现有所有单词吗？此操作不可撤销。')) return;

                // 清空云端
                await apiRequest('/words?id=gte.0', 'DELETE');
                words = [];

                // 分批插入
                for (let i = 0; i < importedWords.length; i += 50) {
                    const batch = importedWords.slice(i, i + 50).map(frontendToDb);
                    await apiRequest('/words', 'POST', batch);
                }

                alert(`已替换为 ${importedWords.length} 个单词。`);
            }

            // 重新从云端加载
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

    // 绑定闪卡发音按钮
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

    // 异步同步等级到云端
    if (updatedLevel) {
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

    // 异步同步等级到云端
    if (updatedLevel) {
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
document.addEventListener('DOMContentLoaded', () => {
    initData();

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

    // 新增
    document.getElementById('addBtn').addEventListener('click', openAddModal);
    document.getElementById('saveBtn').addEventListener('click', saveWord);
    document.getElementById('cancelBtn').addEventListener('click', closeModal);
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('formLevel').addEventListener('change', updatePriorityDisplay);

    // 点击弹窗外部关闭
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
            }
        }
    });
});