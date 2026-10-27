const $ = (s) => document.querySelector(s);
const libraryKey = "hanji-vocabulary-v1";
const folderStorageKey = "hanji-vocabulary-folders-v1";
const studyFolderKey = "hanji-study-folder-v1";
const unsortedFolderId = "unsorted";
const pinyinPreferenceKey = "hanji-show-pinyin";
const scriptPreferenceKey = "hanji-traditional-script";
const statsKey = "hanji-learning-stats-v1";
const chatKey = "hanji-study-coach-chat-v1";
const defaults = [
  {
    id: "n1",
    term: "朋友",
    pronunciation: "péngyou",
    meaning: "friend",
    note: "A person you enjoy spending time with.",
    known: false,
  },
  {
    id: "n2",
    term: "学习",
    pronunciation: "xuéxí",
    meaning: "to study; to learn",
    note: "学习中文 — study Chinese",
    known: false,
  },
  {
    id: "n3",
    term: "温柔",
    pronunciation: "wēnróu",
    meaning: "gentle; tender",
    note: "A lovely word for a manner or feeling.",
    known: true,
  },
];
const localTerms = {
  你好: ["nǐ hǎo", "hello; hi"],
  谢谢: ["xièxie", "thank you"],
  再见: ["zàijiàn", "goodbye; see you again"],
  请: ["qǐng", "please; to invite"],
  爱: ["ài", "love; to love"],
  家: ["jiā", "home; family"],
  水: ["shuǐ", "water"],
  中国: ["Zhōngguó", "China"],
  中文: ["Zhōngwén", "Chinese language"],
  老师: ["lǎoshī", "teacher"],
  学生: ["xuésheng", "student"],
  快乐: ["kuàilè", "happy; happiness"],
  朋友: ["péngyou", "friend"],
  学习: ["xuéxí", "to study; to learn"],
  温柔: ["wēnróu", "gentle; tender"],
};
let words = JSON.parse(localStorage.getItem(libraryKey) || "null") || defaults;
let folders = JSON.parse(localStorage.getItem(folderStorageKey) || "null") || [
  { id: unsortedFolderId, name: "Unsorted" },
];
let activeFolderId = null;
if (!folders.some((folder) => folder.id === unsortedFolderId)) {
  folders.unshift({ id: unsortedFolderId, name: "Unsorted" });
}
words.forEach((word) => {
  if (!folders.some((folder) => folder.id === word.folderId)) word.folderId = unsortedFolderId;
});
let selectedFolderId = "all";
let selectedWordIds = new Set();
let selectMode = false;
let selectedStudyFolderId = localStorage.getItem(studyFolderKey) || "all";
function scopedChatKey() {
  return `${chatKey}:${selectedStudyFolderId}`;
}
if (selectedStudyFolderId !== "all" && !folders.some((folder) => folder.id === selectedStudyFolderId)) {
  selectedStudyFolderId = "all";
}
const aiCacheKey = "hanji-ai-enrichment-cache-v2";
let aiCache = JSON.parse(localStorage.getItem(aiCacheKey) || "{}") || {};
function termKey(term) {
  return String(term).normalize("NFKC").trim().toLocaleLowerCase();
}
function saveAiCache() {
  localStorage.setItem(aiCacheKey, JSON.stringify(aiCache));
}
function studyLevel(word) {
  return word.studyLevel || (word.known ? "known" : "new");
}
function setStudyLevel(word, level) {
  word.studyLevel = level;
  word.known = level === "known";
}
let cardIndex = 0;
let cardDeck = [];
let activeStudyLevel = "all";
let quizIndex = 0;
let quizVariant = 0;
let quizLevel = "intermediate";
let showPinyin = localStorage.getItem(pinyinPreferenceKey) !== "false";
let quizShowPinyin = showPinyin;
let useTraditional = localStorage.getItem(scriptPreferenceKey) === "true";
const savedStats = JSON.parse(localStorage.getItem(statsKey) || "null") || {};
let stats = {
  streak: savedStats.streak || 0,
  lastActive: savedStats.lastActive || "",
};
let chatHistory = JSON.parse(
  localStorage.getItem(scopedChatKey()) ||
    (selectedStudyFolderId === "all" ? localStorage.getItem(chatKey) : "null") ||
    "null",
) || [];
let chatBusy = false;
let activeDetailId = null;
let detailChatHistory = [];
let detailChatBusy = false;
let folderChatHistory = [];
let folderChatBusy = false;
function folderChatKey(folderId) {
  return `hanji-folder-chat-v1:${folderId}`;
}
function loadFolderChat(folderId) {
  folderChatHistory = JSON.parse(localStorage.getItem(folderChatKey(folderId)) || "null") || [];
}
function saveFolderChat(folderId) {
  if (!folderId) return;
  localStorage.setItem(folderChatKey(folderId), JSON.stringify(folderChatHistory.slice(-12)));
}
function saveStats() {
  localStorage.setItem(statsKey, JSON.stringify({
    streak: stats.streak,
    lastActive: stats.lastActive,
  }));
}
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
function touchStreak() {
  const today = todayKey();
  if (stats.lastActive === today) return;
  const previous = new Date();
  previous.setDate(previous.getDate() - 1);
  const yesterday = previous.toISOString().slice(0, 10);
  stats.streak = stats.lastActive === yesterday ? stats.streak + 1 : 1;
  stats.lastActive = today;
  saveStats();
}
function studyWords() {
  return selectedStudyFolderId === "all"
    ? words
    : words.filter((word) => word.folderId === selectedStudyFolderId);
}
function studyFolderName() {
  return selectedStudyFolderId === "all" ? "all folders" : folderName(selectedStudyFolderId);
}
let quizWords = [];
function studyEmptyMessage(defaultMessage) {
  return selectedStudyFolderId === "all"
    ? defaultMessage
    : `No words in “${studyFolderName()}” yet. Add words to this folder from your vocabulary library.`;
}
function selectStudyFolder(folderId) {
  selectedStudyFolderId = folders.some((folder) => folder.id === folderId) ? folderId : "all";
  localStorage.setItem(studyFolderKey, selectedStudyFolderId);
  chatHistory = JSON.parse(localStorage.getItem(scopedChatKey()) || "null") || [];
  cardDeck = [];
  cardIndex = 0;
  activeStudyLevel = "all";
  quizIndex = 0;
  quizVariant = 0;
}
function renderChat() {
  const container = $("#chat-messages");
  if (!container) return;
  container.replaceChildren();
  if (!chatHistory.length) {
    const welcome = document.createElement("div");
    welcome.className = "chat-welcome";
    welcome.innerHTML = `<span>✦</span><div><strong>Ready when you are.</strong><p>I can quiz you, explain patterns, or help you build a sentence with your saved words.</p></div>`;
    container.append(welcome);
  }
  chatHistory.forEach((item) => {
    const bubble = document.createElement("div");
    bubble.className = `chat-message chat-${item.role}`;
    bubble.innerHTML = `<span class="chat-label">${item.role === "user" ? "YOU" : "HANJI COACH"}</span><p>${escapeHtml(item.content).replace(/\\n/g, "<br>")}</p>`;
    container.append(bubble);
  });
  container.scrollTop = container.scrollHeight;
  $("#coach-word-count").textContent = studyWords().length;
  $("#coach-folder-name").textContent = studyFolderName();
}
function saveChat() {
  localStorage.setItem(scopedChatKey(), JSON.stringify(chatHistory.slice(-12)));
}
async function sendChatMessage(content) {
  if (chatBusy || !content.trim()) return;
  chatBusy = true;
  chatHistory.push({ role: "user", content: content.trim() });
  chatHistory = chatHistory.slice(-12);
  saveChat();
  renderChat();
  const input = $("#chat-input"), send = $("#chat-form button");
  input.value = "";
  input.disabled = true;
  send.disabled = true;
  const loading = document.createElement("div");
  loading.className = "chat-message chat-assistant chat-loading";
  loading.innerHTML = `<span class="chat-label">HANJI COACH</span><p><i></i><i></i><i></i></p>`;
  $("#chat-messages").append(loading);
  $("#chat-messages").scrollTop = $("#chat-messages").scrollHeight;
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: chatHistory,
        words: studyWords(),
        folderName: studyFolderName(),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Chat unavailable");
    chatHistory.push({ role: "assistant", content: data.message });
    saveChat();
    touchStreak();
  } catch (error) {
    showToast(error.message || "The Study Coach is unavailable.");
  } finally {
    chatBusy = false;
    input.disabled = false;
    send.disabled = false;
    renderChat();
    input.focus();
  }
}
function loadDetailChat(word) {
  const key = `hanji-word-chat-${word.id}`;
  detailChatHistory = JSON.parse(localStorage.getItem(key) || "null") || [];
}
function saveDetailChat(word) {
  if (!word) return;
  localStorage.setItem(`hanji-word-chat-${word.id}`, JSON.stringify(detailChatHistory.slice(-12)));
}
function renderWordChat(word) {
  const container = $("#word-chat-messages");
  if (!container || !word) return;
  container.replaceChildren();
  if (!detailChatHistory.length) {
    const welcome = document.createElement("div");
    welcome.className = "chat-welcome";
    welcome.innerHTML = `<span>✦</span><div><strong>Your focused tutor is ready.</strong><p>Ask about tones, grammar, register, collocations, or ask for a mini quiz on ${escapeHtml(word.term)}.</p></div>`;
    container.append(welcome);
  }
  detailChatHistory.forEach((item) => {
    const bubble = document.createElement("div");
    bubble.className = `chat-message chat-${item.role}`;
    bubble.innerHTML = `<span class="chat-label">${item.role === "user" ? "YOU" : "WORD TUTOR"}</span><p>${escapeHtml(item.content).replace(/\\n/g, "<br>")}</p>`;
    container.append(bubble);
  });
  container.scrollTop = container.scrollHeight;
}
function renderWordDetail() {
  const word = words.find((item) => item.id === activeDetailId);
  if (!word) return;
  $("#detail-term").textContent = displayChinese(word.term);
  $("#detail-pinyin").textContent = word.pronunciation || "Pinyin not saved yet — refresh AI data";
  $("#detail-meaning").textContent = word.meaning || "Meaning not saved yet";
  $("#detail-part-of-speech").textContent = (word.partOfSpeech || "VOCABULARY").toUpperCase();
  $("#detail-note").textContent = word.note || "Build a personal connection to this word by asking the tutor below.";
  const levels = ["beginner", "intermediate", "advanced"];
  const examples = $("#detail-examples");
  examples.replaceChildren();
  levels.forEach((level) => {
    const row = document.createElement("div");
    row.className = "detail-example-row";
    row.innerHTML = `<span class="level-tag">${level}</span><p>${escapeHtml(word.sentences?.[level]?.[0] || "Generate AI study data to add a natural example sentence.")}</p>`;
    examples.append(row);
  });
  const tips = $("#detail-tips");
  tips.innerHTML = `<p><b>Pronunciation</b><br>${escapeHtml(word.pronunciation || "Refresh AI data to save pinyin with tone marks.")}</p><p><b>Practice move</b><br>Ask the tutor to compare this word with a similar word, then use it in your own sentence.</p>`;
  loadDetailChat(word);
  renderWordChat(word);
}
async function sendWordChatMessage(content) {
  const word = words.find((item) => item.id === activeDetailId);
  if (detailChatBusy || !word || !content.trim()) return;
  detailChatBusy = true;
  detailChatHistory.push({ role: "user", content: content.trim() });
  detailChatHistory = detailChatHistory.slice(-12);
  saveDetailChat(word);
  renderWordChat(word);
  const input = $("#word-chat-input"), send = $("#word-chat-form button");
  input.value = "";
  input.disabled = true;
  send.disabled = true;
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: detailChatHistory, words, focusWord: word }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Word tutor unavailable");
    detailChatHistory.push({ role: "assistant", content: data.message });
    saveDetailChat(word);
    touchStreak();
  } catch (error) {
    showToast(error.message || "The word tutor is unavailable.");
  } finally {
    detailChatBusy = false;
    input.disabled = false;
    send.disabled = false;
    renderWordChat(word);
    input.focus();
  }
}
function renderStats() {
  $("#streak-count").textContent = stats.streak;
  $("#review-count").textContent = words.filter((word) => !word.known).length;
}
function showToast(message, type = "info") {
  const region = $("#toast-region");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span aria-hidden="true">i</span>${escapeHtml(message)}`;
  region.append(toast);
  setTimeout(() => toast.classList.add("toast-out"), 2200);
  setTimeout(() => toast.remove(), 2600);
}
const fallbackTraditional = {
  汉: "漢",
  语: "語",
  学: "學",
  习: "習",
  温: "溫",
  柔: "柔",
  谢: "謝",
  请: "請",
  见: "見",
  国: "國",
  乐: "樂",
  师: "師",
  书: "書",
  车: "車",
  门: "門",
  后: "後",
  里: "裡",
  这: "這",
  个: "個",
  们: "們",
  来: "來",
  说: "說",
  听: "聽",
  时: "時",
  间: "間",
  为: "為",
  从: "從",
  与: "與",
  对: "對",
  开: "開",
  会: "會",
  还: "還",
  让: "讓",
  发: "發",
  现: "現",
  题: "題",
  问: "問",
  动: "動",
  话: "話",
};
const fallbackSimplified = Object.fromEntries(
  Object.entries(fallbackTraditional).map(([simple, traditional]) => [
    traditional,
    simple,
  ]),
);
function localPinyin(value) {
  if (!/[\u3400-\u9fff]/.test(value) || !globalThis.pinyinPro?.pinyin) return "";
  return globalThis.pinyinPro.pinyin(value, { toneType: "symbol" });
}
function renderPinyinReader() {
  const input = $("#pinyin-reader-input"), output = $("#pinyin-reader-output");
  if (!input || !output) return;
  const text = input.value;
  if (!text.trim() || !globalThis.pinyinPro?.html) {
    output.replaceChildren();
    return;
  }
  output.innerHTML = text
    .split(/([\u3400-\u9fff]+)/)
    .map((part) =>
      /[\u3400-\u9fff]/.test(part)
        ? globalThis.pinyinPro.html(part, { toneType: "symbol" })
        : escapeHtml(part),
    )
    .join("");
}
function displayChinese(value) {
  try {
    if (globalThis.OpenCC) {
      const converter = globalThis.OpenCC.Converter({
        from: useTraditional ? "cn" : "tw",
        to: useTraditional ? "tw" : "cn",
      });
      return converter(value);
    }
  } catch {}
  const map = useTraditional ? fallbackTraditional : fallbackSimplified;
  return [...value].map((character) => map[character] || character).join("");
}
const quizExamples = {
  朋友: [
    ["在异乡独自生活时，一个能够坦诚交流的", "往往比热闹的聚会更珍贵。"],
    ["遇到困难时，真正的", "会愿意耐心听你倾诉。"],
    ["即使多年未见，他们仍然把彼此当作最重要的", "。"],
  ],
  学习: [
    ["掌握声调需要反复", "，而不是只靠记忆规则。"],
    ["为了提高听力，她每天利用通勤时间", "中文播客。"],
    ["语言", "需要耐心，短时间内很难看见全部成果。"],
  ],
  温柔: [
    ["即使提出不同意见，她仍以", "的语气说明自己的理由。"],
    ["母亲用", "的目光安慰了情绪低落的孩子。"],
    ["这首歌旋律", "，却能让人感受到坚定的力量。"],
  ],
  你好: [
    ["第一次见面时，用", "向对方打招呼会显得自然又礼貌。"],
    ["走进教室后，他先微笑着说了一句", "。"],
    ["在中文里，", "是最常见也最亲切的问候。"],
  ],
  谢谢: [
    ["收到邻居的帮助后，他认真地说了一声", "。"],
    ["即使只是小事，也别忘了向帮助你的人说", "。"],
    ["她用一句简单的", "表达了真诚的感激。"],
  ],
  再见: [
    ["会议结束后，大家互相道", "，并约好下周再见。"],
    ["临走前，他挥挥手说", "，然后走进地铁站。"],
    ["虽然舍不得离开，我们还是笑着说了", "。"],
  ],
  快乐: [
    ["真正的", "不一定来自热闹，有时也来自平静的独处。"],
    ["和家人共进晚餐的时光，让他感到格外", "。"],
    ["她把日常生活里的小事，当成发现", "的机会。"],
  ],
  老师: [
    ["这位", "会耐心纠正每位学生的发音。"],
    ["毕业多年后，他仍然记得启发过自己的", "。"],
    ["遇到不懂的问题时，可以主动请教", "。"],
  ],
  学生: [
    ["认真做笔记的", "很快就理解了这段课文。"],
    ["每位", "都需要找到适合自己的学习节奏。"],
    ["老师鼓励", "在课堂上大胆提出问题。"],
  ],
};
const beginnerQuizExamples = {
  朋友: [
    ["小美是我的好", "，我们常常一起玩。"],
    ["有困难的时候，", "会来帮助我。"],
  ],
  学习: [
    ["我每天晚上", "中文。"],
    ["想说好中文，要认真", "。"],
  ],
  温柔: [
    ["妈妈说话很", "，我觉得很安心。"],
    ["她用", "的声音安慰孩子。"],
  ],
  你好: [
    ["早上见到老师，我说", "。"],
    ["第一次见面，我们可以说", "。"],
  ],
  谢谢: [
    ["别人帮助我，我要说", "。"],
    ["收到礼物后，她说了", "。"],
  ],
  再见: [
    ["放学时，我对同学说", "。"],
    ["我要回家了，和老师说", "。"],
  ],
  快乐: [
    ["今天和家人在一起，我很", "。"],
    ["做喜欢的事情让我感到", "。"],
  ],
  老师: [
    ["学校里的", "教我们中文。"],
    ["我有问题，会问", "。"],
  ],
  学生: [
    ["教室里的", "正在看书。"],
    ["认真听课的", "回答了问题。"],
  ],
};
const advancedQuizExamples = {
  朋友: [
    [
      "在人生低谷时，能够坦诚相待并给予支持的",
      "，往往比一时的热闹更值得珍惜。",
    ],
    ["尽管彼此的生活轨迹渐行渐远，他们仍把对方视为可以无话不谈的", "。"],
  ],
  学习: [
    ["语言能力的提升并非一蹴而就，而是长期", "与反思累积的结果。"],
    ["为了避免知识停留在表面，研究者强调应通过实践不断", "。"],
  ],
  温柔: [
    ["她没有回避尖锐的问题，却以极其", "的方式维护了在场每个人的尊严。"],
    ["这部作品最打动人的地方，在于它以", "的笔触呈现了复杂而克制的情感。"],
  ],
  你好: [
    ["在跨文化交流的开端，一句真诚的", "常常能迅速缩短陌生人之间的距离。"],
    ["尽管只是简单的", "，却为后续的对话奠定了友善的基调。"],
  ],
  谢谢: [
    ["面对对方不求回报的协助，他郑重地说了一句", "，其中包含着深切的感激。"],
    ["比起华丽的辞藻，一句及时的", "更能让善意得到回应。"],
  ],
  再见: [
    ["告别并不总意味着结束；那句", "也可能包含着对下一次重逢的期待。"],
    ["在车站分别时，他们没有多说什么，只是轻轻道了声", "。"],
  ],
  快乐: [
    ["他逐渐明白，持久的", "并非来自外在评价，而是来自内心的充实与平衡。"],
    ["即使生活节奏紧凑，她仍能在细微之处发现", "。"],
  ],
  老师: [
    ["真正优秀的", "不只传授知识，也善于引导学生建立独立思考的能力。"],
    ["多年以后，他仍感谢那位在关键时刻给予自己方向的", "。"],
  ],
  学生: [
    ["面对开放式问题，", "需要在掌握基础知识后提出自己的论证。"],
    ["这项研究提醒教育者，应为每一位", "提供探索和犯错的空间。"],
  ],
};
function save() {
  localStorage.setItem(libraryKey, JSON.stringify(words));
}
function saveFolders() {
  localStorage.setItem(folderStorageKey, JSON.stringify(folders));
}
function folderName(folderId) {
  return folders.find((folder) => folder.id === folderId)?.name || "Unsorted";
}
function deleteFolder(folderId) {
  const folder = folders.find((item) => item.id === folderId);
  if (!folder || folderId === unsortedFolderId) return;
  const wordCount = words.filter((word) => word.folderId === folderId).length;
  const wordMessage = wordCount
    ? `${wordCount} ${wordCount === 1 ? "word" : "words"} will be moved to Unsorted.`
    : "This folder is empty.";
  if (!window.confirm(`Delete “${folder.name}”? ${wordMessage} This cannot be undone.`)) return;

  words.forEach((word) => {
    if (word.folderId === folderId) word.folderId = unsortedFolderId;
  });
  folders = folders.filter((item) => item.id !== folderId);
  if (selectedFolderId === folderId) selectedFolderId = "all";
  localStorage.removeItem(folderChatKey(folderId));
  if (activeFolderId === folderId) activeFolderId = null;
  if (selectedStudyFolderId === folderId) {
    selectStudyFolder("all");
    renderChat();
  }
  save();
  saveFolders();
  render();
  showToast(`Deleted ${folder.name}.${wordCount ? ` ${wordCount} ${wordCount === 1 ? "word was" : "words were"} moved to Unsorted.` : ""}`);
}
function renderFoldersDashboard() {
  const dashboard = $("#folder-dashboard-list");
  if (!dashboard) return;
  dashboard.replaceChildren();
  folders.forEach((folder) => {
    const folderWords = words.filter((word) => word.folderId === folder.id);
    const card = document.createElement("article");
    card.className = "folder-dashboard-card";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "folder-dashboard-open";
    open.setAttribute("aria-label", `Open ${folder.name} folder and its ${folderWords.length} words`);
    open.innerHTML = `<span class="folder-dashboard-icon" aria-hidden="true">${folder.id === unsortedFolderId ? "▱" : "冊"}</span><span class="folder-dashboard-copy"><strong>${escapeHtml(folder.name)}</strong><small>${folderWords.length} ${folderWords.length === 1 ? "word" : "words"}</small><span class="folder-dashboard-preview">${folderWords.slice(0, 4).map((word) => `<i>${escapeHtml(displayChinese(word.term))}</i>`).join("") || "Add your first words"}</span></span><span class="folder-dashboard-arrow" aria-hidden="true">↗</span>`;
    open.onclick = () => { location.hash = `folder-${encodeURIComponent(folder.id)}`; };
    card.append(open);
    if (folder.id !== unsortedFolderId) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "folder-dashboard-delete";
      remove.textContent = "×";
      remove.title = `Delete ${folder.name}`;
      remove.setAttribute("aria-label", `Delete folder ${folder.name}`);
      remove.onclick = () => deleteFolder(folder.id);
      card.append(remove);
    }
    dashboard.append(card);
  });
  $("#folder-dashboard-empty").hidden = folders.some((folder) => folder.id !== unsortedFolderId);
}
function renderFolderSpace() {
  const folder = folders.find((item) => item.id === activeFolderId);
  if (!folder) return;
  const folderWords = words.filter((word) => word.folderId === folder.id);
  $("#folder-space-title").textContent = folder.name;
  $("#folder-space-subtitle").textContent = `${folderWords.length} ${folderWords.length === 1 ? "word" : "words"} in this folder`;
  $("#folder-space-count").textContent = `${folderWords.length} ${folderWords.length === 1 ? "word" : "words"}`;
  $("#folder-space-review-count").textContent = `${folderWords.filter((word) => !word.known).length} to review`;
  const list = $("#folder-space-word-list");
  list.replaceChildren();
  folderWords.forEach((word) => {
    const row = document.createElement("article");
    row.className = "folder-word-row";
    row.innerHTML = `<div class="folder-word-copy"><strong>${escapeHtml(displayChinese(word.term))}</strong><span>${escapeHtml(word.pronunciation || "Pinyin not saved")}</span><p>${escapeHtml(word.meaning || "Meaning not saved")}</p>${word.note ? `<small>${escapeHtml(word.note)}</small>` : ""}</div><div class="folder-word-actions"><button class="folder-word-detail" type="button">Study word</button><button class="folder-word-remove" type="button" aria-label="Remove ${escapeHtml(word.term)}">×</button></div>`;
    row.querySelector(".folder-word-detail").onclick = () => { location.hash = `word-${encodeURIComponent(word.id)}`; };
    row.querySelector(".folder-word-remove").onclick = () => {
      words = words.filter((item) => item.id !== word.id);
      save();
      render();
    };
    list.append(row);
  });
  $("#folder-space-empty").hidden = folderWords.length > 0;
  $("#folder-space-word-list").hidden = folderWords.length === 0;
  $("#folder-space-coach").onclick = () => { location.hash = `folder-coach-${encodeURIComponent(folder.id)}`; };
}
function renderFolderCoach() {
  const folder = folders.find((item) => item.id === activeFolderId);
  if (!folder) return;
  const folderWords = words.filter((word) => word.folderId === folder.id);
  $("#folder-coach-title").textContent = `${folder.name} Hanji`;
  $("#folder-coach-name").textContent = `${folder.name} Hanji`;
  $("#folder-coach-folder-name").textContent = folder.name;
  $("#folder-coach-word-count").textContent = folderWords.length;
  const container = $("#folder-chat-messages");
  container.replaceChildren();
  if (!folderChatHistory.length) {
    const welcome = document.createElement("div");
    welcome.className = "chat-welcome";
    welcome.innerHTML = `<span>✦</span><div><strong>Your ${escapeHtml(folder.name)} Hanji is ready.</strong><p>I’ll keep our practice focused on the words saved in this folder.</p></div>`;
    container.append(welcome);
  }
  folderChatHistory.forEach((item) => {
    const bubble = document.createElement("div");
    bubble.className = `chat-message chat-${item.role}`;
    bubble.innerHTML = `<span class="chat-label">${item.role === "user" ? "YOU" : escapeHtml(folder.name.toUpperCase()) + " HANJI"}</span><p>${escapeHtml(item.content).replace(/\\n/g, "<br>")}</p>`;
    container.append(bubble);
  });
  container.scrollTop = container.scrollHeight;
}
async function sendFolderChatMessage(content) {
  const folder = folders.find((item) => item.id === activeFolderId);
  if (folderChatBusy || !folder || !content.trim()) return;
  folderChatBusy = true;
  const folderId = folder.id;
  folderChatHistory.push({ role: "user", content: content.trim() });
  folderChatHistory = folderChatHistory.slice(-12);
  saveFolderChat(folderId);
  renderFolderCoach();
  const input = $("#folder-chat-input"), send = $("#folder-chat-form button");
  input.value = "";
  input.disabled = true;
  send.disabled = true;
  const loading = document.createElement("div");
  loading.className = "chat-message chat-assistant chat-loading";
  loading.innerHTML = `<span class="chat-label">${escapeHtml(folder.name.toUpperCase())} HANJI</span><p><i></i><i></i><i></i></p>`;
  $("#folder-chat-messages").append(loading);
  $("#folder-chat-messages").scrollTop = $("#folder-chat-messages").scrollHeight;
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: folderChatHistory, words: words.filter((word) => word.folderId === folderId), folderName: folder.name }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Folder Hanji is unavailable");
    folderChatHistory.push({ role: "assistant", content: data.message });
    folderChatHistory = folderChatHistory.slice(-12);
    saveFolderChat(folderId);
    touchStreak();
  } catch (error) {
    showToast(error.message || "Folder Hanji is unavailable.");
  } finally {
    folderChatBusy = false;
    input.disabled = false;
    send.disabled = false;
    if (activeFolderId === folderId) renderFolderCoach();
    input.focus();
  }
}
function createFolder(name) {
  const cleanName = name.trim();
  if (!cleanName) return false;
  if (folders.some((folder) => folder.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) {
    $("#folder-dialog-error").textContent = "A folder with this title already exists.";
    return false;
  }
  const folder = { id: crypto.randomUUID(), name: cleanName };
  folders.push(folder);
  activeFolderId = folder.id;
  selectedFolderId = folder.id;
  selectStudyFolder(folder.id);
  saveFolders();
  save();
  render();
  location.hash = `folder-${encodeURIComponent(folder.id)}`;
  showToast(`Created ${cleanName}. Your folder and dedicated Hanji are ready.`);
  return true;
}
function renderFolderControls() {
  const folderList = $("#folder-list");
  folderList.replaceChildren();
  const folderCards = [
    { id: "all", name: "All words", count: words.length },
    ...folders.map((folder) => ({
      ...folder,
      count: words.filter((word) => word.folderId === folder.id).length,
    })),
  ];
  folderCards.forEach((folder) => {
    const card = document.createElement("div");
    card.className = "folder-item";
    const button = document.createElement("button");
    button.type = "button";
  button.className = "folder-card";
    button.classList.toggle("is-selected", selectedFolderId === folder.id);
    button.setAttribute("aria-pressed", String(selectedFolderId === folder.id));
    button.innerHTML = `<span class="folder-card-icon" aria-hidden="true">${folder.id === "all" ? "▦" : "▱"}</span><span class="folder-card-copy"><strong>${escapeHtml(folder.name)}</strong><small>${folder.count} ${folder.count === 1 ? "word" : "words"}</small></span>`;
    button.onclick = () => {
      selectedFolderId = folder.id;
      selectedWordIds.clear();
      selectStudyFolder(folder.id === "all" ? "all" : folder.id);
      renderChat();
      render();
    };
    card.append(button);

    if (folder.id !== "all" && folder.id !== unsortedFolderId) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "folder-delete-btn";
      remove.textContent = "×";
      remove.title = `Delete ${folder.name}`;
      remove.setAttribute("aria-label", `Delete folder ${folder.name}`);
      remove.onclick = () => deleteFolder(folder.id);
      card.append(remove);
    }
    folderList.append(card);
  });

  const addFolderSelect = $("#add-folder-select");
  const previousAddFolderId = addFolderSelect.value;
  addFolderSelect.innerHTML = folders
    .map((folder) => `<option value="${escapeHtml(folder.id)}">${escapeHtml(folder.name)}</option>`)
    .join("");
  const nextAddFolderId = selectedFolderId !== "all"
    ? selectedFolderId
    : selectedStudyFolderId !== "all"
      ? selectedStudyFolderId
      : previousAddFolderId;
  if (folders.some((folder) => folder.id === nextAddFolderId)) {
    addFolderSelect.value = nextAddFolderId;
  }

  const studyFolderSelect = $("#study-folder-select");
  studyFolderSelect.replaceChildren();
  const studyFolders = [
    { id: "all", name: "All folders" },
    ...folders,
  ];
  studyFolders.forEach((folder) => {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = folder.name;
    studyFolderSelect.append(option);
  });
  studyFolderSelect.value = selectedStudyFolderId;
  $("#study-scope-count").textContent = `${studyWords().length} ${studyWords().length === 1 ? "word" : "words"}`;
  $("#coach-word-count").textContent = studyWords().length;
  $("#coach-folder-name").textContent = studyFolderName();
}
function setupMoveFolderSelect(select, word) {
  const destinations = folders.filter((folder) => folder.id !== word.folderId);
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = destinations.length ? "Move to…" : "No other folders";
  placeholder.selected = true;
  select.append(placeholder);
  destinations.forEach((folder) => {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = folder.name;
    select.append(option);
  });
  select.disabled = destinations.length === 0;
  select.setAttribute("aria-label", `Move ${word.term} from ${folderName(word.folderId)} to another folder`);
  select.title = destinations.length
    ? `Move ${word.term} from ${folderName(word.folderId)}`
    : "Create another folder before moving this word";
  select.onchange = () => {
    const folderId = select.value;
    if (!folderId || !folders.some((folder) => folder.id === folderId)) return;
    word.folderId = folderId;
    save();
    render();
    showToast(`Moved ${word.term} to ${folderName(folderId)}.`);
  };
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
function render() {
  renderStats();
  const query = $("#search-input").value.trim().toLowerCase(),
    filter = $("#filter-select").value;
  const folderWords = selectedFolderId === "all"
    ? words
    : words.filter((word) => word.folderId === selectedFolderId);
  const shown = folderWords.filter(
    (w) =>
      (!query ||
        [w.term, w.meaning, w.pronunciation, w.note]
          .join(" ")
          .toLowerCase()
          .includes(query)) &&
      (filter === "all" || (filter === "known" ? w.known : !w.known)),
  );
  const list = $("#word-list");
  list.innerHTML = "";
  shown.forEach((word) => {
    const node = $("#word-template").content.firstElementChild.cloneNode(true);
    node.classList.toggle("is-selected", selectedWordIds.has(word.id));
    node.classList.toggle("is-selecting", selectMode);
    const selectControl = node.querySelector(".word-select-control");
    selectControl.hidden = !selectMode;
    const selectCheckbox = node.querySelector(".word-select-checkbox");
    selectCheckbox.dataset.wordId = word.id;
    selectCheckbox.checked = selectedWordIds.has(word.id);
    selectCheckbox.setAttribute("aria-label", `Select ${word.term}`);
    selectCheckbox.onchange = () => {
      if (selectCheckbox.checked) selectedWordIds.add(word.id);
      else selectedWordIds.delete(word.id);
      renderSelectionControls();
      node.classList.toggle("is-selected", selectCheckbox.checked);
    };
    node.querySelector(".term").textContent = displayChinese(word.term);
    const pronunciation = node.querySelector(".pronunciation");
    pronunciation.textContent = word.pronunciation;
    pronunciation.classList.toggle(
      "pinyin-hidden",
      !showPinyin || !word.pronunciation,
    );
    node.querySelector(".meaning").textContent = word.meaning;
    const note = node.querySelector(".note");
    if (word.note) note.textContent = word.note;
    else note.remove();
    node.querySelector(".word-folder-label").textContent = folderName(word.folderId);
    const moveFolderSelect = node.querySelector(".move-folder-select");
    moveFolderSelect.dataset.wordId = word.id;
    moveFolderSelect.dataset.folderId = word.folderId;
    setupMoveFolderSelect(moveFolderSelect, word);
    const aiBadge = node.querySelector(".ai-card-badge");
    if (word.sentences) aiBadge.hidden = false;
    const openWordButton = node.querySelector(".open-word-btn");
    openWordButton.setAttribute("aria-label", `Open study room for ${word.term}`);
    openWordButton.onclick = () => {
      location.hash = `word-${encodeURIComponent(word.id)}`;
    };
    const status = node.querySelector(".status-btn");
    status.classList.toggle("is-known", word.known);
    status.title = word.known ? "Mark for review" : "Mark as confident";
    status.setAttribute("aria-label", word.known ? `Mark ${word.term} for review` : `Mark ${word.term} as confident`);
    status.setAttribute("aria-pressed", String(word.known));
    status.onclick = () => {
      setStudyLevel(word, word.known ? "new" : "known");
      status.setAttribute("aria-pressed", String(word.known));
      save();
      render();
    };
    const deleteButton = node.querySelector(".delete-btn");
    deleteButton.setAttribute("aria-label", `Remove ${word.term}`);
    deleteButton.onclick = () => {
      words = words.filter((w) => w.id !== word.id);
      selectedWordIds.delete(word.id);
      save();
      cardIndex = 0;
      render();
    };
    const regenerateButton = node.querySelector(".regenerate-btn");
    regenerateButton.setAttribute("aria-label", `Refresh study data for ${word.term}`);
    regenerateButton.onclick = async () => {
      const button = node.querySelector(".regenerate-btn");
      button.disabled = true;
      button.classList.add("is-loading");
      showToast(`Refreshing AI data for ${word.term}…`);
      try {
        const [item] = (await enrichWithAI([word.term], true)) || [];
        if (!item?.meaning) throw new Error("No AI result");
        word.meaning = item.meaning;
        word.pronunciation = localPinyin(word.term) || item.pinyin || item.pronunciation || "";
        word.partOfSpeech = item.partOfSpeech || word.partOfSpeech || "";
        word.sentences = item.sentences || null;
        save();
        touchStreak();
        render();
      } catch {
        showToast("AI enrichment is unavailable right now.");
        button.disabled = false;
        button.classList.remove("is-loading");
      }
    };
    list.append(node);
  });
  const hasSelectedFolder = selectedFolderId !== "all";
  const isFolderEmpty = hasSelectedFolder && folderWords.length === 0;
  $("#empty-state").hidden =
    hasSelectedFolder || words.length !== 0 || !!query || filter !== "all";
  $("#folder-empty").hidden = !isFolderEmpty;
  if (isFolderEmpty) {
    const folder = folders.find((item) => item.id === selectedFolderId);
    const isUnsorted = selectedFolderId === unsortedFolderId;
    $("#folder-empty-title").textContent = `${folder?.name || "This folder"} is empty.`;
    $("#folder-empty-message").textContent = isUnsorted
      ? "Words without a folder will appear here. Add words and choose Unsorted to save them here."
      : `Add a new word list directly to ${folder?.name || "this folder"}, or move words here from another folder.`;
  }
  renderFolderControls();
  renderFoldersDashboard();
  if (activeFolderId && $("#top").dataset.page === "folder-space") renderFolderSpace();
  if (activeFolderId && $("#top").dataset.page === "folder-coach") renderFolderCoach();
  renderSelectionControls();
  $("#word-total-label").textContent = `${shown.length} ${shown.length === 1 ? "word" : "words"}`;
  $("#word-count").textContent = words.length;
  const percent = words.length
    ? Math.round((words.filter((w) => w.known).length / words.length) * 100)
    : 0;
  $("#known-percent").textContent = percent + "%";
  $(".progress-ring").style.setProperty("--progress", percent);
  $("#clear-filter").hidden = !query;
  renderCard();
  renderReverseCard();
  renderQuiz();
  renderStudyLevels();
}
function selectedWords() {
  return words.filter((word) => selectedWordIds.has(word.id));
}
function renderSelectionControls() {
  const validSelectedIds = new Set(words.filter((word) => selectedWordIds.has(word.id)).map((word) => word.id));
  selectedWordIds = validSelectedIds;
  const shownIds = [...document.querySelectorAll(".word-select-checkbox")]
    .map((checkbox) => checkbox.dataset.wordId)
    .filter(Boolean);
  const visibleSelected = shownIds.filter((id) => selectedWordIds.has(id));
  const allVisibleSelected = shownIds.length > 0 && visibleSelected.length === shownIds.length;
  const selectAll = $("#select-all-words");
  selectAll.checked = allVisibleSelected;
  selectAll.indeterminate = visibleSelected.length > 0 && !allVisibleSelected;
  const targets = selectedWords();
  const moveSelect = $("#bulk-move-select");
  const previousDestination = moveSelect.value;
  moveSelect.replaceChildren();
  const movePlaceholder = document.createElement("option");
  movePlaceholder.value = "";
  movePlaceholder.textContent = targets.length ? "Move selected to…" : "Select words first…";
  movePlaceholder.selected = true;
  moveSelect.append(movePlaceholder);
  folders
    .filter((folder) => targets.some((word) => word.folderId !== folder.id))
    .forEach((folder) => {
      const option = document.createElement("option");
      option.value = folder.id;
      option.textContent = folder.name;
      moveSelect.append(option);
    });
  if ([...moveSelect.options].some((option) => option.value === previousDestination)) {
    moveSelect.value = previousDestination;
  }
  moveSelect.disabled = !targets.length || moveSelect.options.length < 2;
  const selectionBar = $("#selection-toolbar");
  selectionBar.hidden = !selectMode;
  $("#toggle-select-mode").setAttribute("aria-pressed", String(selectMode));
  $("#toggle-select-mode").textContent = selectMode ? "Done selecting" : "Select words";
  $("#selection-count").textContent = `${selectedWordIds.size} selected`;
  $("#bulk-edit-words").disabled = !selectedWordIds.size;
  $("#bulk-enrich-words").disabled = !selectedWordIds.size;
  $("#bulk-delete-words").disabled = !selectedWordIds.size;
}
function renderStudyLevels() {
  const board = $("#study-level-list");
  if (!board) return;
  const scopedWords = studyWords();
  const levels = [
    ["new", "New / review", "Words you have not marked as confident yet."],
    ["learning", "Still learning", "Words that need another pass, but are starting to stick."],
    ["known", "Confident", "Words you can recall comfortably."],
  ];
  board.replaceChildren();
  levels.forEach(([level, title, description]) => {
    const column = document.createElement("article");
    column.className = `level-column level-${level}`;
    const items = scopedWords.filter((word) => studyLevel(word) === level);
    column.innerHTML = `<div class="level-column-header"><div><span class="level-kicker">${level === "new" ? "01" : level === "learning" ? "02" : "03"}</span><h3>${title}</h3></div><strong>${items.length}</strong><p>${description}</p><div class="level-review-actions"><button class="level-review-btn" type="button" data-level="${level}" data-mode="study"${items.length ? "" : " disabled"}>Study cards</button><button class="level-review-btn" type="button" data-level="${level}" data-mode="reverse"${items.length ? "" : " disabled"}>Reverse recall</button></div></div>`;
    const list = document.createElement("div");
    list.className = "level-word-list";
    if (!items.length) {
      list.innerHTML = `<p class="level-empty">Nothing here yet.</p>`;
    } else {
      items.forEach((word) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "level-word-card";
        card.title = `Open study room for ${word.term}`;
        card.innerHTML = `<strong>${escapeHtml(displayChinese(word.term))}</strong><span>${escapeHtml(word.pronunciation || "Pinyin not saved")}</span><p>${escapeHtml(word.meaning || "Meaning not saved")}</p>`;
        card.onclick = () => {
          location.hash = `word-${encodeURIComponent(word.id)}`;
        };
        list.append(card);
      });
    }
    column.append(list);
    column.querySelectorAll(".level-review-btn").forEach((button) => {
      button.onclick = () => {
        activeStudyLevel = level;
        cardDeck = [];
        cardIndex = 0;
        location.hash = button.dataset.mode === "reverse" ? "reverse-study" : "study";
        renderCard();
        renderReverseCard();
      };
    });
    board.append(column);
  });
}
function syncCardDeck() {
  const scopedWords = studyWords();
  const eligibleWords = activeStudyLevel === "all"
    ? scopedWords
    : scopedWords.filter((word) => studyLevel(word) === activeStudyLevel);
  const validIds = new Set(eligibleWords.map((word) => word.id));
  cardDeck = cardDeck.filter((id) => validIds.has(id));
  eligibleWords.forEach((word) => {
    if (!cardDeck.includes(word.id)) cardDeck.push(word.id);
  });
}
function cardAt(index) {
  return words.find((word) => word.id === cardDeck[index]);
}
function shuffleCardDeck() {
  syncCardDeck();
  for (let i = cardDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cardDeck[i], cardDeck[j]] = [cardDeck[j], cardDeck[i]];
  }
  cardIndex = 0;
  renderCard();
  renderReverseCard();
}
function renderCard() {
  syncCardDeck();
  const area = $("#flashcard-area"),
    empty = $("#study-empty"),
    count = $("#study-count");
  if (!cardDeck.length) {
    area.hidden = true;
    empty.hidden = false;
    empty.textContent = studyEmptyMessage("Add a few words above and your review deck will appear here.");
    count.textContent = "";
    return;
  }
  empty.hidden = true;
  area.hidden = false;
  cardIndex = ((cardIndex % cardDeck.length) + cardDeck.length) % cardDeck.length;
  const w = cardAt(cardIndex),
    pronunciation = $("#card-pronunciation");
  $("#card-term").textContent = displayChinese(w.term);
  pronunciation.textContent = w.pronunciation;
  pronunciation.classList.toggle(
    "pinyin-hidden",
    !showPinyin || !w.pronunciation,
  );
  $("#card-meaning").textContent = w.meaning;
  $("#card-note").textContent = w.note || "";
  $("#flashcard").classList.remove("flipped");
  count.textContent = `${cardIndex + 1} of ${cardDeck.length}${activeStudyLevel === "all" ? "" : ` · ${activeStudyLevel}`}`;
}
function renderReverseCard() {
  syncCardDeck();
  const area = $("#reverse-card-area"),
    empty = $("#reverse-empty"),
    count = $("#reverse-count");
  if (!cardDeck.length) {
    area.hidden = true;
    empty.hidden = false;
    empty.textContent = studyEmptyMessage("Add a few words above and your reverse review deck will appear here.");
    count.textContent = "";
    return;
  }
  empty.hidden = true;
  area.hidden = false;
  cardIndex = ((cardIndex % cardDeck.length) + cardDeck.length) % cardDeck.length;
  const w = cardAt(cardIndex),
    pronunciation = $("#reverse-pronunciation");
  $("#reverse-meaning").textContent = w.meaning;
  pronunciation.textContent = w.pronunciation || "No pinyin saved";
  pronunciation.classList.toggle(
    "pinyin-hidden",
    !showPinyin || !w.pronunciation,
  );
  $("#reverse-term").textContent = displayChinese(w.term);
  $("#reverse-note").textContent = w.note || "";
  $("#reverse-flashcard").classList.remove("flipped");
  count.textContent = `${cardIndex + 1} of ${cardDeck.length}${activeStudyLevel === "all" ? "" : ` · ${activeStudyLevel}`}`;
}
function renderQuiz() {
  const area = $("#quiz-area"),
    empty = $("#quiz-empty"),
    count = $("#quiz-count");
  quizWords = studyWords();
  if (!quizWords.length) {
    area.hidden = true;
    empty.hidden = false;
    empty.textContent = studyEmptyMessage("Add a few words above and your contextual quizzes will appear here.");
    count.textContent = "";
    return;
  }
  empty.hidden = true;
  area.hidden = false;
  quizIndex = ((quizIndex % quizWords.length) + quizWords.length) % quizWords.length;
  const w = quizWords[quizIndex],
    fallback = [
      ["请根据已学词汇完成这个句子：我想用一个合适的中文词填入", "。"],
      ["结合上下文，选择最合适的词填入空格：", "。"],
      ["读完这句话后，请从你的词汇表中找出适合填入", "的词。"],
    ],
    aiExamples = Array.isArray(w.sentences?.[quizLevel])
      ? w.sentences[quizLevel]
          .map((sentence) => {
            const position = sentence.indexOf(w.term);
            return position >= 0
              ? [sentence.slice(0, position), sentence.slice(position + w.term.length)]
              : null;
          })
          .filter(Boolean)
      : [],
    intermediate = quizExamples[w.term] || fallback,
    beginner = beginnerQuizExamples[w.term] || intermediate,
    advanced = advancedQuizExamples[w.term] || intermediate,
    examples = aiExamples.length
      ? aiExamples
      : quizLevel === "beginner"
        ? beginner
        : quizLevel === "advanced"
          ? advanced
          : intermediate,
    example = examples[quizVariant % examples.length],
    sentence = $("#quiz-sentence"),
    blank = document.createElement("span");
  blank.className = "quiz-blank";
  blank.textContent = "_____";
  sentence.replaceChildren(
    document.createTextNode(displayChinese(example[0]) + " "),
    blank,
    document.createTextNode(" " + displayChinese(example[1])),
  );
  $("#quiz-answer").value = "";
  const pinyin = $("#quiz-pinyin");
  const sentencePinyin = `${localPinyin(example[0])} _____ ${localPinyin(example[1])}`.trim();
  pinyin.textContent = sentencePinyin;
  pinyin.classList.toggle("pinyin-hidden", !quizShowPinyin || !sentencePinyin);
  $("#quiz-feedback").textContent = "";
  $("#quiz-feedback").classList.remove("incorrect");
  count.textContent = `${quizIndex + 1} of ${quizWords.length}`;
}
function openDialog() {
  $("#word-form").reset();
  $("#add-folder-select").value =
    selectedFolderId !== "all"
      ? selectedFolderId
      : selectedStudyFolderId !== "all"
        ? selectedStudyFolderId
        : unsortedFolderId;
  $("#lookup-status").textContent = "";
  $("#lookup-progress").hidden = true;
  $("#lookup-progress").value = 0;
  $("#word-dialog").showModal();
  setTimeout(() => $("#terms-input").focus(), 30);
}
function openFolderAddDialog() {
  if (activeFolderId) {
    selectedFolderId = activeFolderId;
    $("#add-folder-select").value = activeFolderId;
  }
  openDialog();
  if (activeFolderId) $("#add-folder-select").value = activeFolderId;
}
async function enrichWithAI(terms, force = false) {
  const uniqueTerms = [...new Set(terms)];
  const cached = terms.map((term) => (force ? null : aiCache[termKey(term)] || null));
  const missing = uniqueTerms.filter((term) => force || !aiCache[termKey(term)]);
  for (let start = 0; start < missing.length; start += 10) {
    const batch = missing.slice(start, start + 10);
    const response = await fetch("/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terms: batch }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.error || "AI enrichment is unavailable");
    if (!Array.isArray(data.items)) throw new Error("AI returned no study data");
    batch.forEach((term, index) => {
      const item = data.items[index];
      if (item && (item.meaning || item.pinyin || item.sentences)) {
        aiCache[termKey(term)] = {
          ...item,
          term,
          pinyin: item.pinyin || item.pronunciation || "",
        };
      }
    });
    saveAiCache();
  }
  return terms.map((term, index) => aiCache[termKey(term)] || cached[index] || null);
}
async function lookupWord(term) {
  const saved = localTerms[term];
  if (saved) return { pronunciation: saved[0], meaning: saved[1] };
  const isChinese = /[\u3400-\u9fff]/.test(term);
  try {
    if (!isChinese) {
      const response = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`,
      );
      const data = await response.json();
      const meaning = data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
      if (meaning)
        return {
          meaning,
          pronunciation: (
            data?.[0]?.phonetic ||
            data?.[0]?.phonetics?.find((x) => x.text)?.text ||
            ""
          ).replaceAll("/", ""),
        };
    }
    const pair = isChinese ? "zh-CN|en" : "en|zh-CN";
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(term)}&langpair=${pair}`,
    );
    const data = await response.json();
    const meaning = data?.responseData?.translatedText;
    if (meaning && meaning.toLowerCase() !== term.toLowerCase())
      return { meaning, pronunciation: "" };
  } catch {
    /* An unavailable service should not discard the user's word list. */
  }
  return {
    meaning: "Meaning not found — edit this card later.",
    pronunciation: "",
  };
}
$("#open-add").onclick = openDialog;
$("#empty-add").onclick = openDialog;
$("#folder-add").onclick = openDialog;
$("#new-folder-btn").onclick = () => {
  const form = $("#folder-form");
  form.hidden = false;
  $("#folder-name").focus();
};
function openFolderDialog() {
  $("#folder-dialog-error").textContent = "";
  $("#folder-form-dialog").reset();
  $("#folder-dialog").showModal();
  $("#folder-dialog-name").focus();
}
$("#dashboard-new-folder").onclick = openFolderDialog;
$("#dashboard-empty-create").onclick = openFolderDialog;
$("#folder-dialog-close").onclick = () => $("#folder-dialog").close();
$("#folder-dialog-cancel").onclick = () => $("#folder-dialog").close();
$("#folder-form-dialog").addEventListener("submit", (event) => {
  event.preventDefault();
  if (createFolder($("#folder-dialog-name").value)) $("#folder-dialog").close();
});
$("#folder-back-to-dashboard").onclick = () => { location.hash = "folders"; };
$("#folder-space-add").onclick = () => openFolderAddDialog();
$("#folder-space-empty-add").onclick = () => openFolderAddDialog();
$("#folder-coach-back").onclick = () => { location.hash = `folder-${encodeURIComponent(activeFolderId)}`; };
$("#folder-chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  sendFolderChatMessage($("#folder-chat-input").value);
});
document.querySelectorAll("[data-folder-prompt]").forEach((button) => {
  button.onclick = () => sendFolderChatMessage(button.dataset.folderPrompt);
});
$("#clear-folder-chat-btn").onclick = () => {
  if (!activeFolderId) return;
  folderChatHistory = [];
  saveFolderChat(activeFolderId);
  renderFolderCoach();
};
$("#cancel-folder-btn").onclick = () => {
  $("#folder-form").reset();
  $("#folder-form").hidden = true;
};
$("#folder-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("#folder-name").value.trim();
  if (!name) return;
  if (folders.some((folder) => folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    showToast("A folder with that name already exists.");
    $("#folder-name").focus();
    return;
  }
  const folder = { id: crypto.randomUUID(), name };
  folders.push(folder);
  selectedFolderId = folder.id;
  selectStudyFolder(folder.id);
  renderChat();
  saveFolders();
  $("#folder-form").reset();
  $("#folder-form").hidden = true;
  render();
  location.hash = `folder-${encodeURIComponent(folder.id)}`;
  showToast(`Created ${name}. Your folder and dedicated Hanji are ready.`);
});
$("#cancel-btn").onclick = () => $("#word-dialog").close();
$("#dialog-close").onclick = () => $("#word-dialog").close();
$("#word-chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  sendWordChatMessage($("#word-chat-input").value);
});
$("#back-to-library").onclick = () => {
  location.hash = "library";
};
$("#detail-regenerate").onclick = async () => {
  const word = words.find((item) => item.id === activeDetailId);
  if (!word) return;
  const button = $("#detail-regenerate");
  button.disabled = true;
  try {
    const [item] = (await enrichWithAI([word.term], true)) || [];
    if (!item?.meaning) throw new Error("No AI result");
    Object.assign(word, { meaning: item.meaning, pronunciation: localPinyin(word.term) || item.pinyin || item.pronunciation || "", partOfSpeech: item.partOfSpeech || "", sentences: item.sentences || null });
    save();
    renderWordDetail();
    touchStreak();
    showToast("AI study room refreshed.");
  } catch (error) {
    showToast(error.message || "AI enrichment is unavailable.");
  } finally {
    button.disabled = false;
  }
};
$("#word-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submit = e.submitter,
    status = $("#lookup-status"),
    targetFolderId = $("#add-folder-select").value || unsortedFolderId,
    terms = [
      ...new Set(
        $("#terms-input")
          .value.split(/\r?\n/)
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    ];
  if (!terms.length) return;
  submit.disabled = true;
  const progress = $("#lookup-progress");
  progress.hidden = false;
  progress.value = 12;
  let aiItems = null;
  try {
    const cachedCount = terms.filter((term) => aiCache[termKey(term)]).length;
    status.textContent = cachedCount
      ? `Restoring ${cachedCount} saved AI result${cachedCount === 1 ? "" : "s"}…`
      : "AI is composing your study deck…";
    aiItems = await enrichWithAI(terms);
    progress.value = 48;
  } catch (error) {
    status.textContent = `AI unavailable: ${error.message}. Using dictionary lookup instead.`;
  }
  const added = [];
  for (let i = 0; i < terms.length; i++) {
    status.textContent = `Polishing ${i + 1} of ${terms.length}: ${terms[i]}`;
    progress.value = 48 + Math.round(((i + 1) / terms.length) * 44);
    const aiItem = aiItems?.[i];
    const result = aiItem?.meaning
      ? { meaning: aiItem.meaning, pronunciation: "" }
      : await lookupWord(terms[i]);
    result.pronunciation = localPinyin(terms[i]) || result.pronunciation || "";
    const existing = words.find((word) => termKey(word.term) === termKey(terms[i]));
    if (existing) {
      existing.folderId = targetFolderId;
      existing.meaning = result.meaning || existing.meaning;
      existing.pronunciation = result.pronunciation || existing.pronunciation;
      existing.sentences = aiItem?.sentences || existing.sentences || null;
      existing.partOfSpeech = aiItem?.partOfSpeech || existing.partOfSpeech || "";
      continue;
    }
    added.push({
      id: crypto.randomUUID(),
      term: terms[i],
      folderId: targetFolderId,
      meaning: result.meaning,
      pronunciation: result.pronunciation,
      note: "",
      known: false,
      sentences: aiItem?.sentences || null,
      partOfSpeech: aiItem?.partOfSpeech || "",
    });
  }
  words = [...added, ...words];
  save();
  touchStreak();
  progress.value = 100;
  $("#word-dialog").close();
  submit.disabled = false;
  cardIndex = 0;
  render();
});
$("#pinyin-toggle").checked = showPinyin;
$("#script-toggle").checked = useTraditional;
$("#search-input").oninput = () => {
  selectedWordIds.clear();
  render();
};
$("#filter-select").onchange = () => {
  selectedWordIds.clear();
  render();
};
$("#toggle-select-mode").onclick = () => {
  selectMode = !selectMode;
  selectedWordIds.clear();
  render();
};
$("#select-all-words").onchange = (event) => {
  document.querySelectorAll(".word-select-checkbox").forEach((checkbox) => {
    if (event.target.checked) selectedWordIds.add(checkbox.dataset.wordId);
    else selectedWordIds.delete(checkbox.dataset.wordId);
    checkbox.checked = event.target.checked;
    checkbox.closest(".word-card")?.classList.toggle("is-selected", event.target.checked);
  });
  renderSelectionControls();
};
$("#deselect-all-words").onclick = () => {
  selectedWordIds.clear();
  render();
};
$("#bulk-add-words").onclick = () => openDialog();
$("#bulk-move-select").onchange = (event) => {
  const folderId = event.target.value;
  const targets = selectedWords();
  if (!folderId || !targets.length) return;
  const count = targets.length;
  targets.forEach((word) => { word.folderId = folderId; });
  save();
  selectedWordIds.clear();
  render();
  showToast(`Moved ${count} ${count === 1 ? "word" : "words"} to ${folderName(folderId)}.`);
};
$("#bulk-delete-words").onclick = () => {
  const targets = selectedWords();
  if (!targets.length) return;
  if (!window.confirm(`Remove ${targets.length} selected ${targets.length === 1 ? "word" : "words"}? This cannot be undone.`)) return;
  const count = targets.length;
  const removedIds = new Set(targets.map((word) => word.id));
  words = words.filter((word) => !removedIds.has(word.id));
  selectedWordIds.clear();
  cardDeck = cardDeck.filter((id) => !removedIds.has(id));
  save();
  render();
  showToast(`Removed ${count} ${count === 1 ? "word" : "words"}.`);
};
$("#bulk-edit-words").onclick = openBulkEdit;
$("#edit-words-close").onclick = () => $("#edit-words-dialog").close();
$("#cancel-edit-words").onclick = () => $("#edit-words-dialog").close();
$("#edit-words-form").addEventListener("submit", saveBulkEdit);
$("#bulk-enrich-words").onclick = enrichSelectedWords;
$("#study-folder-select").onchange = (event) => {
  selectStudyFolder(event.target.value);
  renderChat();
  render();
};
function openBulkEdit() {
  const selected = selectedWords();
  if (!selected.length) return;
  const list = $("#bulk-edit-list");
  list.replaceChildren();
  selected.forEach((word) => {
    const row = document.createElement("fieldset");
    row.className = "bulk-edit-word";
    const legend = document.createElement("legend");
    legend.textContent = `${displayChinese(word.term)} · ${word.meaning || "No meaning"}`;
    row.append(legend);
    [
      ["term", "Word", word.term],
      ["pronunciation", "Pronunciation", word.pronunciation || ""],
      ["meaning", "Meaning", word.meaning || ""],
      ["note", "Note", word.note || ""],
    ].forEach(([field, labelText, value]) => {
      const label = document.createElement("label");
      label.textContent = labelText;
      const input = document.createElement(field === "note" || field === "meaning" ? "textarea" : "input");
      input.value = value;
      input.dataset.wordId = word.id;
      input.dataset.field = field;
      input.setAttribute("aria-label", `${labelText} for ${word.term}`);
      label.append(input);
      row.append(label);
    });
    list.append(row);
  });
  $("#edit-words-dialog").showModal();
}
function saveBulkEdit(event) {
  event.preventDefault();
  const count = selectedWords().length;
  const updates = [...$("#bulk-edit-list").querySelectorAll("[data-word-id][data-field]")];
  updates.forEach((input) => {
    const word = words.find((item) => item.id === input.dataset.wordId);
    if (word) word[input.dataset.field] = input.value.trim();
  });
  save();
  $("#edit-words-dialog").close();
  render();
  showToast(`Updated ${count} ${count === 1 ? "word" : "words"}.`);
}
async function enrichSelectedWords() {
  const targets = selectedWords();
  if (!targets.length) return;
  const button = $("#bulk-enrich-words");
  button.disabled = true;
  button.textContent = "Enriching…";
  try {
    const results = await enrichWithAI(targets.map((word) => word.term), true);
    let enriched = 0;
    targets.forEach((word, index) => {
      const item = results[index];
      if (!item?.meaning) return;
      word.meaning = item.meaning;
      word.pronunciation = localPinyin(word.term) || item.pinyin || item.pronunciation || word.pronunciation || "";
      word.partOfSpeech = item.partOfSpeech || word.partOfSpeech || "";
      word.sentences = item.sentences || word.sentences || null;
      enriched++;
    });
    if (!enriched) throw new Error("AI returned no study data for the selected words.");
    save();
    touchStreak();
    render();
    showToast(`AI enriched ${enriched} ${enriched === 1 ? "word" : "words"}.`);
  } catch (error) {
    showToast(error.message || "AI enrichment is unavailable.");
  } finally {
    button.disabled = !selectedWordIds.size;
    button.textContent = "✦ AI enrich";
    renderSelectionControls();
  }
}
function generateMissingPinyin() {
  const missing = words.filter(
    (word) => !word.pronunciation && /[\u3400-\u9fff]/.test(word.term),
  );
  if (!missing.length) return;
  let generated = 0;
  missing.forEach((word) => {
    const pronunciation = localPinyin(word.term);
    if (!pronunciation) return;
    word.pronunciation = pronunciation;
    generated++;
  });
  if (!generated) return;
  save();
  render();
  touchStreak();
  showToast(`Pinyin saved for ${generated} word${generated === 1 ? "" : "s"}.`);
}
$("#pinyin-toggle").onchange = async (e) => {
  showPinyin = e.target.checked;
  localStorage.setItem(pinyinPreferenceKey, showPinyin);
  render();
  if (showPinyin) generateMissingPinyin();
};
$("#pinyin-toggle").closest("label").addEventListener("click", (event) => {
  if (event.target === $("#pinyin-toggle")) return;
  event.preventDefault();
  const input = $("#pinyin-toggle");
  input.checked = !input.checked;
  input.dispatchEvent(new Event("change", { bubbles: true }));
});
$("#script-toggle").onchange = (e) => {
  useTraditional = e.target.checked;
  localStorage.setItem(scriptPreferenceKey, useTraditional);
  render();
};
$("#clear-filter").onclick = () => {
  $("#search-input").value = "";
  render();
};
$("#flashcard").onclick = () => $("#flashcard").classList.toggle("flipped");
$("#shuffle-btn").onclick = shuffleCardDeck;
$("#reverse-shuffle-btn").onclick = shuffleCardDeck;
$("#again-btn").onclick = () => {
  const word = cardAt(cardIndex);
  if (word) setStudyLevel(word, "new");
  save();
  cardIndex++;
  render();
};
$("#learning-btn").onclick = () => {
  const word = cardAt(cardIndex);
  if (word) setStudyLevel(word, "learning");
  save();
  cardIndex++;
  render();
};
$("#known-btn").onclick = () => {
  const word = cardAt(cardIndex);
  if (word) setStudyLevel(word, "known");
  touchStreak();
  save();
  cardIndex++;
  render();
};
$("#reverse-flashcard").onclick = () =>
  $("#reverse-flashcard").classList.toggle("flipped");
$("#reverse-again-btn").onclick = () => {
  const word = cardAt(cardIndex);
  if (word) setStudyLevel(word, "new");
  save();
  cardIndex++;
  render();
};
$("#reverse-learning-btn").onclick = () => {
  const word = cardAt(cardIndex);
  if (word) setStudyLevel(word, "learning");
  save();
  cardIndex++;
  render();
};
$("#reverse-known-btn").onclick = () => {
  const word = cardAt(cardIndex);
  if (word) setStudyLevel(word, "known");
  touchStreak();
  save();
  cardIndex++;
  render();
};
$("#check-answer-btn").onclick = () => {
  const answer = $("#quiz-answer").value.trim().replaceAll(" ", ""),
    correct = displayChinese(quizWords[quizIndex]?.term || "").replaceAll(" ", ""),
    feedback = $("#quiz-feedback");
  if (answer && answer === correct) {
    feedback.textContent = "Correct — nice recall.";
    touchStreak();
    feedback.classList.remove("incorrect");
  } else {
    feedback.textContent = answer
      ? "Not quite. Read the context once more, or reveal the answer."
      : "Type your answer first.";
    feedback.classList.add("incorrect");
  }
};
$("#quiz-answer").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#check-answer-btn").click();
});
$("#reveal-answer-btn").onclick = () => {
  const feedback = $("#quiz-feedback");
  feedback.textContent = `Answer: ${displayChinese(quizWords[quizIndex]?.term || "")}`;
  feedback.classList.remove("incorrect");
};
$("#new-sentence-btn").onclick = () => {
  quizVariant++;
  renderQuiz();
};
$("#next-quiz-btn").onclick = () => {
  quizIndex++;
  quizVariant = 0;
  renderQuiz();
};
$("#quiz-level").onchange = (e) => {
  quizLevel = e.target.value;
  quizVariant = 0;
  renderQuiz();
};
$("#quiz-pinyin-toggle").checked = quizShowPinyin;
$("#quiz-pinyin-toggle").onchange = (e) => {
  quizShowPinyin = e.target.checked;
  renderQuiz();
};
$("#quiz-pinyin-toggle").closest("label").addEventListener("click", (event) => {
  if (event.target === $("#quiz-pinyin-toggle")) return;
  event.preventDefault();
  const input = $("#quiz-pinyin-toggle");
  input.checked = !input.checked;
  input.dispatchEvent(new Event("change", { bubbles: true }));
});
$("#pinyin-reader-input").addEventListener("input", renderPinyinReader);
$("#chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  sendChatMessage($("#chat-input").value);
});
document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.onclick = () => sendChatMessage(button.dataset.prompt);
});
$("#clear-chat-btn").onclick = () => {
  chatHistory = [];
  saveChat();
  renderChat();
};
const pageConfig = {
  library: ["PERSONAL LANGUAGE STUDIO", "Words worth keeping."],
  folders: ["YOUR WORD SETS", "My folders"],
  "folder-space": ["YOUR FOLDER WORKSPACE", "Folder"],
  "folder-coach": ["PRIVATE FOLDER PRACTICE", "Hanji"],
  study: ["A QUIET MOMENT TO PRACTICE", "Study cards"],
  "reverse-study": ["RECALL FROM THE CLUE", "Reverse recall"],
  "context-quiz": ["READ THE CONTEXT, FIND THE WORD", "Context quiz"],
  "pinyin-reader": ["CHARACTERS INTO SOUND", "Pinyin reader"],
  "study-levels": ["SORT YOUR REVIEW DECK", "Study levels"],
  "study-coach": ["YOUR PERSONAL PRACTICE PARTNER", "Study Coach"],
  "word-detail": ["FOCUSED VOCABULARY PRACTICE", "Word Study Room"],
};
function setPage(page) {
  const nextPage = pageConfig[page] ? page : "library";
  $("#top").dataset.page = nextPage;
  $("#page-eyebrow").textContent = pageConfig[nextPage][0];
  $("#page-title").textContent = pageConfig[nextPage][1];
  const activeNav = nextPage === "word-detail" || nextPage === "folder-space" || nextPage === "folder-coach"
    ? "#folders"
    : nextPage === "folders" ? "#folders" : `#${nextPage}`;
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === activeNav);
  });
  $("#study-scope-bar").hidden =
    nextPage === "library" || nextPage === "folders" || nextPage === "folder-space" || nextPage === "folder-coach" || nextPage === "word-detail" || nextPage === "pinyin-reader";
  if (nextPage === "word-detail") renderWordDetail();
  if (nextPage === "folders") renderFoldersDashboard();
  if (nextPage === "folder-space") renderFolderSpace();
  if (nextPage === "folder-coach") renderFolderCoach();
  if (nextPage === "study-levels") renderStudyLevels();
}
function pageFromHash() {
  const hash = location.hash.slice(1);
  if (hash.startsWith("folder-coach-")) {
    const folderId = decodeURIComponent(hash.slice("folder-coach-".length));
    if (folders.some((folder) => folder.id === folderId)) {
      activeFolderId = folderId;
      loadFolderChat(folderId);
      return setPage("folder-coach");
    }
  }
  if (hash.startsWith("folder-")) {
    const folderId = decodeURIComponent(hash.slice("folder-".length));
    if (folders.some((folder) => folder.id === folderId)) {
      activeFolderId = folderId;
      loadFolderChat(folderId);
      return setPage("folder-space");
    }
  }
  if (hash.startsWith("word-")) {
    activeDetailId = decodeURIComponent(hash.slice(5));
    if (words.some((word) => word.id === activeDetailId)) return setPage("word-detail");
  }
  setPage(hash === "top" || hash === "" ? "library" : hash);
}
function setupSectionReveal() {
  const sections = document.querySelectorAll(".study-section, .library-section");
  if (!("IntersectionObserver" in window)) {
    sections.forEach((section) => section.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries, currentObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        currentObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.12 },
  );
  sections.forEach((section) => observer.observe(section));
}
window.addEventListener("hashchange", pageFromHash);
saveStats();
save();
saveFolders();
render();
if (showPinyin) generateMissingPinyin();
renderPinyinReader();
renderChat();
pageFromHash();
setupSectionReveal();

document.querySelectorAll(".nav-group-label").forEach((toggle) => {
  toggle.addEventListener("click", () => {
    const group = toggle.closest(".nav-group");
    const isOpen = group.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
});

document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    const page = link.getAttribute("href").slice(1);
    if (page === "study" || page === "reverse-study") {
      activeStudyLevel = "all";
      cardDeck = [];
      cardIndex = 0;
      renderCard();
      renderReverseCard();
    }
    setPage(page);
  });
});
