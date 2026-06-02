<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { bitfun, type AiModelInfo } from './bitfun-sdk';

/* ─── state ─── */
const connected = ref(false);
const currentTheme = ref('unknown');
const currentLocale = ref('unknown');
const bitfunTheme = ref('dark');
const logs = ref<string[]>([]);
const events = ref<{ type: string; payload: string; time: string }[]>([]);

/* storage */
const storageKey = ref('demo-key');
const storageValue = ref('hello bitfun');
const storageResult = ref('');

/* ai complete */
const aiPrompt = ref('Hello, who are you?');
const aiCompleteResult = ref('');
const aiCompleteLoading = ref(false);
const selectedCompleteModel = ref('');

/* ai chat */
const chatMessage = ref('Explain quantum computing in one sentence.');
const chatStreamId = ref('stream-1');
const chatResult = ref('');
const chatLoading = ref(false);
const aiModels = ref<AiModelInfo[]>([]);
const selectedAiModel = ref('');

/* clipboard */
const clipboardText = ref('Copied from BitFun Demo App');
const clipboardResult = ref('');

/* state report */
const stateJson = ref('{"currentFilter":"all","itemCount":5,"lastAction":"init"}');
const reportStateResult = ref('');

/* ─── command demo: task list ─── */
interface TaskItem {
  id: number;
  title: string;
  date: string; // ISO date
  category: string;
}

const allTasks: TaskItem[] = [
  { id: 1, title: 'Review pull request #42', date: new Date().toISOString().slice(0, 10), category: 'Dev' },
  { id: 2, title: 'Update documentation', date: new Date(Date.now() - 86400000).toISOString().slice(0, 10), category: 'Doc' },
  { id: 3, title: 'Team standup meeting', date: new Date().toISOString().slice(0, 10), category: 'Meeting' },
  { id: 4, title: 'Refactor auth module', date: new Date(Date.now() - 86400000 * 3).toISOString().slice(0, 10), category: 'Dev' },
  { id: 5, title: 'Deploy to staging', date: new Date(Date.now() - 86400000 * 6).toISOString().slice(0, 10), category: 'Ops' },
  { id: 6, title: 'Write unit tests', date: new Date(Date.now() - 86400000 * 8).toISOString().slice(0, 10), category: 'Dev' },
  { id: 7, title: 'Design system sync', date: new Date(Date.now() - 86400000 * 12).toISOString().slice(0, 10), category: 'Design' },
  { id: 8, title: 'Customer feedback review', date: new Date(Date.now() - 86400000 * 25).toISOString().slice(0, 10), category: 'PM' },
];

const currentFilter = ref<'today' | 'week' | 'month' | 'all'>('all');
const highlightedIndex = ref<number | null>(null);

const filteredTasks = computed(() => {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);

  switch (currentFilter.value) {
    case 'today':
      return allTasks.filter((t) => t.date === todayStr);
    case 'week':
      return allTasks.filter((t) => t.date >= weekAgo);
    case 'month':
      return allTasks.filter((t) => t.date >= monthAgo);
    default:
      return allTasks;
  }
});

/* ─── helpers ─── */
function log(msg: string) {
  const time = new Date().toLocaleTimeString();
  logs.value.unshift(`[${time}] ${msg}`);
  if (logs.value.length > 100) logs.value.pop();
}

function addEvent(type: string, payload: unknown) {
  events.value.unshift({
    type,
    payload: JSON.stringify(payload),
    time: new Date().toLocaleTimeString(),
  });
  if (events.value.length > 50) events.value.pop();
}

async function wrap<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  log(`→ ${label}`);
  try {
    const result = await fn();
    log(`✓ ${label}: ${JSON.stringify(result).slice(0, 200)}`);
    return result;
  } catch (e) {
    log(`✗ ${label}: ${e}`);
    throw e;
  }
}

/* ─── actions ─── */
async function doStorageGet() {
  const v = await wrap('storage.get', () => bitfun.storage.get(storageKey.value));
  storageResult.value = JSON.stringify(v);
}
async function doStorageSet() {
  await wrap('storage.set', () => bitfun.storage.set(storageKey.value, storageValue.value));
  storageResult.value = 'saved';
}
async function doStorageClear() {
  storageValue.value = '';
  await wrap('storage.set', () => bitfun.storage.set(storageKey.value, ''));
  storageResult.value = 'cleared';
}

async function doAiComplete() {
  aiCompleteLoading.value = true;
  aiCompleteResult.value = '';
  try {
    const r = await wrap('ai.complete', () =>
      bitfun.ai.complete(aiPrompt.value, { model: selectedCompleteModel.value || undefined, maxTokens: 256 })
    );
    aiCompleteResult.value = JSON.stringify(r, null, 2);
  } finally {
    aiCompleteLoading.value = false;
  }
}

async function doAiChat() {
  chatLoading.value = true;
  chatResult.value = '';
  try {
    const r = await wrap('ai.chat', () =>
      bitfun.ai.chat([{ role: 'user', content: chatMessage.value }], chatStreamId.value, {
        model: selectedAiModel.value || undefined,
        maxTokens: 256,
      })
    );
    chatResult.value = JSON.stringify(r, null, 2);
  } finally {
    chatLoading.value = false;
  }
}

async function doAiCancel() {
  await wrap('ai.cancel', () => bitfun.ai.cancel(chatStreamId.value));
}
async function doAiGetModels() {
  const r = await wrap('ai.getModels', () => bitfun.ai.getModels());
  if (Array.isArray(r)) {
    aiModels.value = r as AiModelInfo[];
    if (r.length > 0) {
      const firstId = (r[0] as { id: string }).id;
      if (!selectedAiModel.value) selectedAiModel.value = firstId;
      if (!selectedCompleteModel.value) selectedCompleteModel.value = firstId;
    }
  }
  chatResult.value = JSON.stringify(r, null, 2);
}

async function doDialogOpen() {
  const r = await wrap('dialog.open', () => bitfun.dialog.open({ multiple: false }));
  log(`dialog.open result: ${JSON.stringify(r)}`);
}
async function doDialogSave() {
  const r = await wrap('dialog.save', () => bitfun.dialog.save({}));
  log(`dialog.save result: ${JSON.stringify(r)}`);
}
async function doDialogMessage() {
  const r = await wrap('dialog.message', () =>
    bitfun.dialog.message({ title: 'Demo', message: 'This is a test message from Demo App.' })
  );
  log(`dialog.message result: ${JSON.stringify(r)}`);
}

async function doClipboardWrite() {
  await wrap('clipboard.writeText', () => bitfun.clipboard.writeText(clipboardText.value));
  clipboardResult.value = 'written';
}
async function doClipboardRead() {
  const r = await wrap('clipboard.readText', () => bitfun.clipboard.readText());
  clipboardResult.value = String(r);
}

async function doRequestTheme() {
  const r = await wrap('requestTheme', () => bitfun.requestTheme());
  currentTheme.value = JSON.stringify(r);
}
async function doRequestLocale() {
  const r = await wrap('requestLocale', () => bitfun.requestLocale());
  currentLocale.value = JSON.stringify(r);
}

function doReportState() {
  try {
    const state = JSON.parse(stateJson.value);
    bitfun.reportState(state);
    reportStateResult.value = 'State reported successfully';
    log('reportState sent');
  } catch (e) {
    reportStateResult.value = `Failed: ${e}`;
    log(`reportState error: ${e}`);
  }
}

/* ─── command handlers ─── */
function handleCommand(payload: Record<string, unknown>) {
  const cmd = payload.action as string;
  const params = (payload.params || {}) as Record<string, unknown>;

  if (cmd === 'setFilter') {
    const range = params.timeRange as 'today' | 'week' | 'month' | 'all' | undefined;
    if (range && ['today', 'week', 'month', 'all'].includes(range)) {
      currentFilter.value = range;
      highlightedIndex.value = null;
      log(`Command setFilter executed: timeRange=${range}`);
      // Auto report state after filter change
      bitfun.reportState({
        currentFilter: range,
        itemCount: filteredTasks.value.length,
        lastAction: 'setFilter',
      });
    } else {
      log(`Command setFilter ignored: invalid timeRange=${range}`);
    }
    return;
  }

  if (cmd === 'highlightItem') {
    const idx = typeof params.index === 'number' ? params.index : null;
    if (idx !== null && idx >= 0 && idx < filteredTasks.value.length) {
      highlightedIndex.value = idx;
      log(`Command highlightItem executed: index=${idx}`);
      // Auto report state after highlight
      bitfun.reportState({
        currentFilter: currentFilter.value,
        itemCount: filteredTasks.value.length,
        lastAction: 'highlightItem',
      });
    } else {
      log(`Command highlightItem ignored: index=${idx} out of range`);
    }
    return;
  }

  log(`Received unknown command: ${cmd}`);
}

/* ─── event listeners ─── */
let unsubTheme: (() => void) | null = null;
let unsubLocale: (() => void) | null = null;
let unsubCommand: (() => void) | null = null;
let unsubToolSetFilter: (() => void) | null = null;
let unsubToolHighlight: (() => void) | null = null;

onMounted(() => {
  connected.value = true;
  log('Demo App mounted');

  unsubTheme = bitfun.on('themeChange', (payload) => {
    currentTheme.value = JSON.stringify(payload);
    addEvent('themeChange', payload);
    const p = payload as Record<string, unknown> | undefined;
    const theme = (p?.theme as string) || 'dark';
    bitfunTheme.value = theme;
    const root = document.documentElement;
    if (theme === 'light') {
      root.style.setProperty('--app-bg', '#ffffff');
      root.style.setProperty('--app-fg', '#1f1f1f');
      root.style.setProperty('--app-border', '#e5e5e5');
      root.style.setProperty('--app-header-bg', '#f8f8f8');
      root.style.setProperty('--app-title', '#111111');
      root.style.setProperty('--app-panel-bg', '#f5f5f5');
      root.style.setProperty('--app-muted', '#666666');
    } else {
      root.style.setProperty('--app-bg', '#0f0f11');
      root.style.setProperty('--app-fg', '#e6e6e6');
      root.style.setProperty('--app-border', '#2a2a2e');
      root.style.setProperty('--app-header-bg', '#0f0f11');
      root.style.setProperty('--app-title', '#ffffff');
      root.style.setProperty('--app-panel-bg', '#18181b');
      root.style.setProperty('--app-muted', '#a0a0a0');
    }
  });

  unsubLocale = bitfun.on('localeChange', (payload) => {
    currentLocale.value = JSON.stringify(payload);
    addEvent('localeChange', payload);
  });

  unsubCommand = bitfun.on('command', (payload) => {
    addEvent('command', payload);
    handleCommand(payload as Record<string, unknown>);
  });

  // Register tool handlers for LLM invocation
  unsubToolSetFilter = bitfun.tools.registerHandler('setFilter', (params: unknown) => {
    const p = params as Record<string, unknown> | undefined;
    const timeRange = (p?.timeRange as string) || 'all';
    const valid = ['today', 'week', 'month', 'all'] as const;
    if (valid.includes(timeRange as typeof valid[number])) {
      currentFilter.value = timeRange as typeof currentFilter.value;
    }
    log(`Tool setFilter called: timeRange=${timeRange}`);
    return { success: true, filter: currentFilter.value, tasks: filteredTasks.value };
  });

  unsubToolHighlight = bitfun.tools.registerHandler('highlightItem', (params: unknown) => {
    const p = params as Record<string, unknown> | undefined;
    const index = (p?.index as number) ?? 0;
    highlightedIndex.value = index;
    log(`Tool highlightItem called: index=${index}`);
    return { success: true, index, item: filteredTasks.value[index] ?? null };
  });

  // 初始请求主题和语言
  doRequestTheme();
  doRequestLocale();
});

onUnmounted(() => {
  unsubTheme?.();
  unsubLocale?.();
  unsubCommand?.();
  unsubToolSetFilter?.();
  unsubToolHighlight?.();
});
</script>

<template>
  <div class="demo-app">
    <header class="app-header">
      <h1>BitFun Demo App</h1>
      <div class="status-bar">
        <span class="badge" :class="connected ? 'ok' : 'err'">
          {{ connected ? 'Connected' : 'Disconnected' }}
        </span>
        <span class="badge">Theme: {{ currentTheme }}</span>
        <span class="badge">Locale: {{ currentLocale }}</span>
      </div>
    </header>

    <main class="app-body">
      <!-- Command Demo -->
      <section class="panel command-panel">
        <h2>
          Command Demo
          <span class="sub">Filter: <strong>{{ currentFilter }}</strong> | Items: {{ filteredTasks.length }}</span>
        </h2>
        <div class="task-list">
          <div
            v-for="(task, idx) in filteredTasks"
            :key="task.id"
            class="task-item"
            :class="{ highlight: highlightedIndex === idx }"
          >
            <span class="task-idx">{{ idx }}</span>
            <span class="task-title">{{ task.title }}</span>
            <span class="task-meta">{{ task.date }} · {{ task.category }}</span>
          </div>
          <div v-if="filteredTasks.length === 0" class="task-empty">No tasks match the current filter</div>
        </div>
      </section>

      <!-- Storage -->
      <section class="panel">
        <h2>Storage</h2>
        <div class="row">
          <input v-model="storageKey" placeholder="key" />
          <input v-model="storageValue" placeholder="value" />
        </div>
        <div class="row">
          <button @click="doStorageGet">get</button>
          <button @click="doStorageSet">set</button>
          <button @click="doStorageClear">clear</button>
        </div>
        <pre v-if="storageResult" class="result">{{ storageResult }}</pre>
      </section>

      <!-- AI Complete -->
      <section class="panel">
        <h2>AI Complete</h2>
        <div class="row">
          <select v-model="selectedCompleteModel" class="model-select">
            <option value="">Default model</option>
            <option v-for="m in aiModels" :key="m.id" :value="m.id">{{ m.name }}/{{ m.modelName }}</option>
          </select>
        </div>
        <textarea v-model="aiPrompt" rows="2" placeholder="prompt" />
        <button :disabled="aiCompleteLoading" @click="doAiComplete">
          {{ aiCompleteLoading ? 'Loading…' : 'Complete' }}
        </button>
        <pre v-if="aiCompleteResult" class="result">{{ aiCompleteResult }}</pre>
      </section>

      <!-- AI Chat -->
      <section class="panel">
        <h2>AI Chat</h2>
        <input v-model="chatStreamId" placeholder="streamId" />
        <div class="row">
          <select v-model="selectedAiModel" class="model-select">
            <option value="">Default model</option>
            <option v-for="m in aiModels" :key="m.id" :value="m.id">{{ m.name }}/{{ m.modelName }}</option>
          </select>
          <button @click="doAiGetModels">Get Models</button>
        </div>
        <textarea v-model="chatMessage" rows="2" placeholder="user message" />
        <div class="row">
          <button :disabled="chatLoading" @click="doAiChat">
            {{ chatLoading ? 'Loading…' : 'Chat' }}
          </button>
          <button @click="doAiCancel">Cancel</button>
        </div>
        <pre v-if="chatResult" class="result">{{ chatResult }}</pre>
      </section>

      <!-- Dialog -->
      <section class="panel">
        <h2>Dialog</h2>
        <div class="row">
          <button @click="doDialogOpen">Open File</button>
          <button @click="doDialogSave">Save File</button>
          <button @click="doDialogMessage">Message</button>
        </div>
      </section>

      <!-- Clipboard -->
      <section class="panel">
        <h2>Clipboard</h2>
        <input v-model="clipboardText" placeholder="text to write" />
        <div class="row">
          <button @click="doClipboardWrite">Write</button>
          <button @click="doClipboardRead">Read</button>
        </div>
        <pre v-if="clipboardResult" class="result">{{ clipboardResult }}</pre>
      </section>

      <!-- Theme / Locale -->
      <section class="panel">
        <h2>Theme / Locale</h2>
        <div class="row">
          <button @click="doRequestTheme">Request Theme</button>
          <button @click="doRequestLocale">Request Locale</button>
        </div>
      </section>

      <!-- State Report -->
      <section class="panel">
        <h2>Report State</h2>
        <textarea v-model="stateJson" rows="3" placeholder="JSON state object" />
        <button @click="doReportState">Report State</button>
        <pre v-if="reportStateResult" class="result">{{ reportStateResult }}</pre>
      </section>

      <!-- Events -->
      <section class="panel">
        <h2>Incoming Events ({{ events.length }})</h2>
        <ul class="event-list">
          <li v-for="(ev, i) in events.slice(0, 4)" :key="i">
            <span class="event-time">{{ ev.time }}</span>
            <span class="event-type">{{ ev.type }}</span>
            <span class="event-payload">{{ ev.payload }}</span>
          </li>
          <li v-if="events.length === 0" class="empty">No events yet</li>
        </ul>
      </section>

      <!-- Logs -->
      <section class="panel">
        <h2>Logs</h2>
        <ul class="log-list">
          <li v-for="(l, i) in logs.slice(0, 5)" :key="i">{{ l }}</li>
          <li v-if="logs.length === 0" class="empty">No logs yet</li>
        </ul>
      </section>
    </main>
  </div>
</template>

<style scoped>
.demo-app {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  background: var(--app-bg, #0f0f11);
  color: var(--app-fg, #e6e6e6);
  font-size: 13px;
}

.app-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--app-border, #2a2a2e);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  background: var(--app-header-bg, #0f0f11);
}

.app-header h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--app-title, #fff);
}

.status-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.badge {
  background: var(--app-panel-bg, #1e1e22);
  border: 1px solid var(--app-border, #2a2a2e);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: var(--app-muted, #a0a0a0);
}

.badge.ok { border-color: #2e7d32; color: #66bb6a; }
.badge.err { border-color: #c62828; color: #ef5350; }

.app-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  align-content: start;
}

.panel {
  background: var(--app-panel-bg, #18181b);
  border: 1px solid var(--app-border, #2a2a2e);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.panel h2 {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-title, #fff);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.panel h2 .sub {
  font-size: 11px;
  font-weight: 400;
  color: var(--app-muted, #a0a0a0);
}

.row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

input,
textarea,
select {
  background: var(--app-bg, #0f0f11);
  border: 1px solid var(--app-border, #2a2a2e);
  border-radius: 4px;
  padding: 6px 8px;
  color: var(--app-fg, #e6e6e6);
  font-size: 12px;
  font-family: inherit;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

input:focus,
textarea:focus,
select:focus {
  border-color: #3b82f6;
}

select {
  cursor: pointer;
}

.model-select {
  flex: 1;
  min-width: 280px;
}

textarea {
  resize: vertical;
  min-height: 40px;
}

button {
  background: #2563eb;
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

button:hover:not(:disabled) {
  background: #1d4ed8;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.result {
  background: var(--app-bg, #0f0f11);
  border: 1px solid var(--app-border, #2a2a2e);
  border-radius: 4px;
  padding: 8px;
  margin: 0;
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 120px;
  overflow-y: auto;
  color: var(--app-muted, #b0b0b0);
}

/* ─── task list (command demo) ─── */
.command-panel {
  grid-column: 1 / -1;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--app-bg, #0f0f11);
  border: 1px solid var(--app-border, #2a2a2e);
  transition: border-color 0.2s, background 0.2s;
}

.task-item.highlight {
  border-color: #2563eb;
  background: rgba(37, 99, 235, 0.12);
}

.task-idx {
  font-size: 10px;
  font-family: monospace;
  color: var(--app-muted, #888);
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.task-title {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-meta {
  font-size: 11px;
  color: var(--app-muted, #888);
  flex-shrink: 0;
}

.task-empty {
  padding: 12px;
  text-align: center;
  color: var(--app-muted, #666);
  font-style: italic;
  border: 1px dashed var(--app-border, #2a2a2e);
  border-radius: 6px;
}

.event-list,
.log-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 130px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.event-list li,
.log-list li {
  background: var(--app-bg, #0f0f11);
  border: 1px solid var(--app-border, #2a2a2e);
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 11px;
  display: flex;
  gap: 8px;
  align-items: center;
}

.event-time {
  color: #666;
  flex-shrink: 0;
}

.event-type {
  background: #2563eb;
  color: #fff;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  flex-shrink: 0;
}

.event-payload {
  color: var(--app-muted, #aaa);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  color: #555;
  font-style: italic;
  justify-content: center;
}
</style>
