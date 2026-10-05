const $ = (s) => document.querySelector(s);
const libraryKey = "hanji-vocabulary-v1";
const folderStorageKey = "hanji-vocabulary-folders-v1";
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
if (!folders.some((folder) => folder.id === unsortedFolderId)) {
  folders.unshift({ id: unsortedFolderId, name: "Unsorted" });
}
words.forEach((word) => {
  if (!folders.some((folder) => folder.id === word.folderId)) word.folderId = unsortedFolderId;
});
let selectedFolderId = "all";
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
let stats = JSON.parse(localStorage.getItem(statsKey) || "null") || {
  xp: 0,
  streak: 0,
  lastActive: "",
  dailyXp: 0,
  dailyDate: "",
};
let chatHistory = JSON.parse(localStorage.getItem(chatKey) || "null") || [];
let chatBusy = false;
let activeDetailId = null;
let detailChatHistory = [];
let detailChatBusy = false;
function saveStats() {
  localStorage.setItem(statsKey, JSON.stringify(stats));
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
  stats.dailyXp = 0;
  stats.dailyDate = today;
  saveStats();
}
function awardXp(amount) {
  touchStreak();
  if (stats.dailyDate !== todayKey()) stats.dailyXp = 0;
  stats.xp += amount;
  stats.dailyXp += amount;
  saveStats();
  renderStats();
  showToast(`+${amount} XP · Keep going!`, "xp");
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
  $("#coach-word-count").textContent = words.length;
}
function saveChat() {
  localStorage.setItem(chatKey, JSON.stringify(chatHistory.slice(-12)));
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
      body: JSON.stringify({ messages: chatHistory, words }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Chat unavailable");
    chatHistory.push({ role: "assistant", content: data.message });
    saveChat();
    awardXp(2);
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
    awardXp(3);
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
  const today = todayKey();
  if (stats.dailyDate !== today) stats.dailyXp = 0;
  $("#streak-count").textContent = stats.streak;
  $("#xp-count").textContent = stats.xp;
  $("#level-count").textContent = Math.floor(stats.xp / 100) + 1;
  $("#review-count").textContent = words.filter((word) => !word.known).length;
  $("#goal-label").textContent = `${Math.min(stats.dailyXp, 5)} / 5 XP`;
  $("#goal-progress").style.width = `${Math.min((stats.dailyXp / 5) * 100, 100)}%`;
}
function showToast(message, type = "info") {
  const region = $("#toast-region");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === "xp" ? "✦" : "i"}</span>${message}`;
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
function renderFolderControls() {
  const folderList = $("#folder-list");
  folderList.replaceChildren();
  const folderButtons = [
    { id: "all", name: "All words", count: words.length },
    ...folders.map((folder) => ({
      ...folder,
      count: words.filter((word) => word.folderId === folder.id).length,
    })),
  ];
  folderButtons.forEach((folder) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "folder-card";
    button.classList.toggle("is-selected", selectedFolderId === folder.id);
    button.setAttribute("aria-pressed", String(selectedFolderId === folder.id));
    button.innerHTML = `<span class="folder-card-icon" aria-hidden="true">${folder.id === "all" ? "▦" : "▱"}</span><span class="folder-card-copy"><strong>${escapeHtml(folder.name)}</strong><small>${folder.count} ${folder.count === 1 ? "word" : "words"}</small></span>`;
    button.onclick = () => {
      selectedFolderId = folder.id;
      render();
    };
    folderList.append(button);
  });

  const addFolderSelect = $("#add-folder-select");
  const moveFolderOptions = `<option value="">Move to folder…</option>${folders
    .map((folder) => `<option value="${escapeHtml(folder.id)}">${escapeHtml(folder.name)}</option>`)
    .join("")}`;
  const previousAddFolderId = addFolderSelect.value;
  addFolderSelect.innerHTML = folders
    .map((folder) => `<option value="${escapeHtml(folder.id)}">${escapeHtml(folder.name)}</option>`)
    .join("");
  const nextAddFolderId = selectedFolderId !== "all"
    ? selectedFolderId
    : previousAddFolderId;
  if (folders.some((folder) => folder.id === nextAddFolderId)) {
    addFolderSelect.value = nextAddFolderId;
  }
  document.querySelectorAll(".move-folder-select").forEach((select) => {
    const currentFolderId = select.dataset.folderId;
    select.innerHTML = moveFolderOptions;
    select.value = "";
    select.onchange = () => {
      const word = words.find((item) => item.id === select.dataset.wordId);
      if (!word || !select.value || select.value === word.folderId) return;
      word.folderId = select.value;
      save();
      render();
      showToast(`Moved to ${folderName(word.folderId)}.`);
    };
    select.title = `In ${folderName(currentFolderId)}`;
  });
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
        render();
        awardXp(3);
      } catch {
        showToast("AI enrichment is unavailable right now.");
        button.disabled = false;
        button.classList.remove("is-loading");
      }
    };
    list.append(node);
  });
  $("#empty-state").hidden =
    selectedFolderId !== "all" || words.length !== 0 || !!query || filter !== "all";
  $("#folder-empty").hidden =
    selectedFolderId === "all" || folderWords.length !== 0;
  renderFolderControls();
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
function renderStudyLevels() {
  const board = $("#study-level-list");
  if (!board) return;
  const levels = [
    ["new", "New / review", "Words you have not marked as confident yet."],
    ["learning", "Still learning", "Words that need another pass, but are starting to stick."],
    ["known", "Confident", "Words you can recall comfortably."],
  ];
  board.replaceChildren();
  levels.forEach(([level, title, description]) => {
    const column = document.createElement("article");
    column.className = `level-column level-${level}`;
    const items = words.filter((word) => studyLevel(word) === level);
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
  const eligibleWords = activeStudyLevel === "all"
    ? words
    : words.filter((word) => studyLevel(word) === activeStudyLevel);
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
  if (!words.length) {
    area.hidden = true;
    empty.hidden = false;
    count.textContent = "";
    return;
  }
  empty.hidden = true;
  area.hidden = false;
  quizIndex = ((quizIndex % words.length) + words.length) % words.length;
  const w = words[quizIndex],
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
  count.textContent = `${quizIndex + 1} of ${words.length}`;
}
function openDialog() {
  $("#word-form").reset();
  $("#add-folder-select").value =
    selectedFolderId === "all" ? unsortedFolderId : selectedFolderId;
  $("#lookup-status").textContent = "";
  $("#lookup-progress").hidden = true;
  $("#lookup-progress").value = 0;
  $("#word-dialog").showModal();
  setTimeout(() => $("#terms-input").focus(), 30);
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
  saveFolders();
  $("#folder-form").reset();
  $("#folder-form").hidden = true;
  render();
  showToast(`Created ${name}. Add a word list to get started.`);
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
    showToast("AI study room refreshed.", "xp");
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
  progress.value = 100;
  awardXp(Math.max(5, terms.length * 2));
  $("#word-dialog").close();
  submit.disabled = false;
  cardIndex = 0;
  render();
});
$("#pinyin-toggle").checked = showPinyin;
$("#script-toggle").checked = useTraditional;
$("#search-input").oninput = render;
$("#filter-select").onchange = render;
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
  showToast(`Pinyin saved for ${generated} word${generated === 1 ? "" : "s"}.`, "xp");
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
  awardXp(5);
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
  awardXp(5);
  save();
  cardIndex++;
  render();
};
$("#check-answer-btn").onclick = () => {
  const answer = $("#quiz-answer").value.trim().replaceAll(" ", ""),
    correct = displayChinese(words[quizIndex]?.term || "").replaceAll(" ", ""),
    feedback = $("#quiz-feedback");
  if (answer && answer === correct) {
    feedback.textContent = "Correct — nice recall.";
    awardXp(10);
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
  feedback.textContent = `Answer: ${displayChinese(words[quizIndex]?.term || "")}`;
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
  const activeNav = nextPage === "word-detail" ? "#library" : `#${nextPage}`;
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === activeNav);
  });
  if (nextPage === "word-detail") renderWordDetail();
  if (nextPage === "study-levels") renderStudyLevels();
}
function pageFromHash() {
  const hash = location.hash.slice(1);
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
