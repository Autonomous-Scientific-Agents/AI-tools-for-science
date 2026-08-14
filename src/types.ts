export type SortKey = "highest-rated" | "most-rated" | "most-used" | "newest";

export type ModerationStatus = "pending" | "approved" | "rejected";

export type DirectoryTool = {
  id: string;
  slug: string;
  category: string;
  name: string;
  bestFor: string;
  pricing: string;
  strengths: string;
  caveats: string;
  status: string;
  websiteUrl: string;
  sourceUrl: string;
  lastChecked: string;
  createdAt?: string;
};

export type ToolMetrics = {
  toolId: string;
  averageRating: number | null;
  ratingCount: number;
  useCount: number;
  commentCount: number;
};

export type RatingRecord = {
  toolId: string;
  rating: number;
};

export type UseRecord = {
  toolId: string;
};

export type ToolComment = {
  id: string;
  toolId: string;
  userId?: string;
  displayName: string | null;
  body: string;
  status: ModerationStatus;
  createdAt: string;
};

export type ToolSuggestion = {
  id: string;
  userId?: string;
  name: string;
  category: string;
  bestFor: string;
  pricing: string;
  websiteUrl: string;
  notes: string;
  displayName: string | null;
  contactEmail: string | null;
  status: ModerationStatus;
  createdAt: string;
};

export type AuthStatus = {
  userId: string | null;
  isAnonymous: boolean;
  isAdmin: boolean;
  email: string | null;
  loading: boolean;
};

export type DirectoryMode = "supabase" | "local";
