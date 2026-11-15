// Application state, persisted in localStorage. Every storage access is
// wrapped in try/catch because storage can be unavailable or full
// (private mode, blocked site data, quota).

import { SCHEMA_VERSION, parseGroup } from './schema.js';

const STORAGE_KEY = 'wwl:v1';
const CORRUPT_KEY = 'wwl:v1:corrupt';

export function safeGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Persistent state. */
export const state = {
  groups: [],
  currentId: null,
  /** gid -> person id ("Ich bin ...") */
  me: {},
};

/** Volatile UI state, never stored. */
export const ui = {
  tab: 'lists',
  creating: false,
  reveal: null,
  storageOk: true,
  open: new Set(),
  focusKey: null,
};

const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);
export const emit = () => listeners.forEach((fn) => fn());

export function load() {
  const raw = safeGet(STORAGE_KEY);
  if (raw === null) return;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    safeSet(CORRUPT_KEY, raw);
    return;
  }
  if (!data || data.v !== SCHEMA_VERSION || !Array.isArray(data.groups)) return;
  for (const g of data.groups) {
    try {
      state.groups.push(parseGroup(g));
    } catch {
      /* skip invalid groups */
    }
  }
  const known = new Set(state.groups.map((g) => g.gid));
  state.currentId = known.has(data.currentId) ? data.currentId : (state.groups[0]?.gid ?? null);
  if (data.me && typeof data.me === 'object') {
    for (const [gid, pid] of Object.entries(data.me)) {
      const group = state.groups.find((g) => g.gid === gid);
      if (group?.people.some((p) => p.id === pid)) state.me[gid] = pid;
    }
  }
}

function persist() {
  const payload = JSON.stringify({
    v: SCHEMA_VERSION,
    groups: state.groups,
    currentId: state.currentId,
    me: state.me,
  });
  ui.storageOk = safeSet(STORAGE_KEY, payload);
}

export const currentGroup = () => state.groups.find((g) => g.gid === state.currentId) ?? null;
export const currentMeId = () => {
  const group = currentGroup();
  const id = group ? state.me[group.gid] : null;
  return group?.people.some((p) => p.id === id) ? id : null;
};

/**
 * Runs `fn` on a copy of the current group. If it throws, nothing changes.
 * Otherwise the copy replaces the group, is saved and the UI re-renders.
 */
export function mutateGroup(fn) {
  const copy = structuredClone(currentGroup());
  const result = fn(copy);
  const clean = parseGroup(copy);
  state.groups = state.groups.map((g) => (g.gid === clean.gid ? clean : g));
  persist();
  emit();
  return result;
}

/** Adds or replaces a whole group and makes it the current one. */
export function putGroup(group) {
  const exists = state.groups.some((g) => g.gid === group.gid);
  state.groups = exists
    ? state.groups.map((g) => (g.gid === group.gid ? group : g))
    : [...state.groups, group];
  state.currentId = group.gid;
  if (state.me[group.gid] && !group.people.some((p) => p.id === state.me[group.gid])) {
    delete state.me[group.gid];
  }
  ui.creating = false;
  ui.tab = 'lists';
  persist();
  emit();
}

export function deleteGroup(gid) {
  state.groups = state.groups.filter((g) => g.gid !== gid);
  delete state.me[gid];
  if (state.currentId === gid) state.currentId = state.groups[0]?.gid ?? null;
  persist();
  emit();
}

export function selectGroup(gid) {
  if (!state.groups.some((g) => g.gid === gid)) return;
  state.currentId = gid;
  ui.creating = false;
  persist();
  emit();
}

export function setMe(gid, personId) {
  if (personId) state.me[gid] = personId;
  else delete state.me[gid];
  persist();
  emit();
}

export function wipeAll() {
  state.groups = [];
  state.currentId = null;
  state.me = {};
  safeRemove(STORAGE_KEY);
  safeRemove(CORRUPT_KEY);
  emit();
}

export function setUi(patch) {
  Object.assign(ui, patch);
  emit();
}
