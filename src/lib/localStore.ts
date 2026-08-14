import type {
  RatingRecord,
  ToolComment,
  ToolSuggestion,
  UseRecord,
} from "../types";

const STORAGE_KEY = "ai-tools-directory-local-state";
const GUEST_KEY = "ai-tools-directory-guest-id";

type LocalState = {
  ratings: RatingRecord[];
  uses: UseRecord[];
  comments: ToolComment[];
  suggestions: ToolSuggestion[];
};

const emptyState: LocalState = {
  ratings: [],
  uses: [],
  comments: [],
  suggestions: [],
};

export function getLocalGuestId(): string {
  const existing = window.localStorage.getItem(GUEST_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  window.localStorage.setItem(GUEST_KEY, id);
  return id;
}

export function loadLocalState(): LocalState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...emptyState, ...JSON.parse(raw) } : emptyState;
  } catch {
    return emptyState;
  }
}

export function saveLocalState(state: LocalState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
