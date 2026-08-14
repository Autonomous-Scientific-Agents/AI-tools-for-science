import { useCallback, useEffect, useMemo, useState } from "react";
import { seedTools } from "../data/seedTools";
import type {
  AuthStatus,
  DirectoryMode,
  DirectoryTool,
  RatingRecord,
  ToolComment,
  ToolMetrics,
  ToolSuggestion,
  UseRecord,
} from "../types";
import { getLocalGuestId, loadLocalState, saveLocalState } from "./localStore";
import { isAnonymousUser, isSupabaseConfigured, supabase } from "./supabase";

type MetricsByTool = Record<string, ToolMetrics>;
type RatingsByTool = Record<string, number>;
type UsesByTool = Record<string, boolean>;

type ToolRow = {
  id: string;
  slug: string;
  category: string;
  name: string;
  best_for: string;
  pricing: string;
  strengths: string;
  caveats: string;
  status: string;
  website_url: string;
  source_url: string;
  last_checked: string;
  created_at: string;
};

type MetricsRow = {
  tool_id: string;
  average_rating: number | null;
  rating_count: number | null;
  use_count: number | null;
  comment_count: number | null;
};

type RatingRow = {
  tool_id: string;
  rating: number;
};

type UseRow = {
  tool_id: string;
};

type CommentRow = {
  id: string;
  tool_id: string;
  user_id: string;
  display_name: string | null;
  body: string;
  moderation_status: "pending" | "approved" | "rejected";
  created_at: string;
};

type SuggestionRow = {
  id: string;
  user_id: string;
  name: string;
  category: string;
  best_for: string;
  pricing: string;
  website_url: string;
  notes: string;
  display_name: string | null;
  contact_email: string | null;
  moderation_status: "pending" | "approved" | "rejected";
  created_at: string;
};

const initialAuth: AuthStatus = {
  userId: null,
  isAnonymous: false,
  isAdmin: false,
  email: null,
  loading: true,
};

function zeroMetric(toolId: string): ToolMetrics {
  return {
    toolId,
    averageRating: null,
    ratingCount: 0,
    useCount: 0,
    commentCount: 0,
  };
}

function buildEmptyMetrics(tools: DirectoryTool[]): MetricsByTool {
  return Object.fromEntries(tools.map((tool) => [tool.id, zeroMetric(tool.id)]));
}

function mapTool(row: ToolRow): DirectoryTool {
  return {
    id: row.id,
    slug: row.slug,
    category: row.category,
    name: row.name,
    bestFor: row.best_for,
    pricing: row.pricing,
    strengths: row.strengths,
    caveats: row.caveats,
    status: row.status,
    websiteUrl: row.website_url,
    sourceUrl: row.source_url,
    lastChecked: row.last_checked,
    createdAt: row.created_at,
  };
}

function mapMetrics(rows: MetricsRow[], tools: DirectoryTool[]): MetricsByTool {
  const merged = buildEmptyMetrics(tools);
  rows.forEach((row) => {
    merged[row.tool_id] = {
      toolId: row.tool_id,
      averageRating:
        row.average_rating === null ? null : Number(row.average_rating),
      ratingCount: row.rating_count ?? 0,
      useCount: row.use_count ?? 0,
      commentCount: row.comment_count ?? 0,
    };
  });
  return merged;
}

function mapComments(rows: CommentRow[]): ToolComment[] {
  return rows.map((row) => ({
    id: row.id,
    toolId: row.tool_id,
    userId: row.user_id,
    displayName: row.display_name,
    body: row.body,
    status: row.moderation_status,
    createdAt: row.created_at,
  }));
}

function mapSuggestions(rows: SuggestionRow[]): ToolSuggestion[] {
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    category: row.category,
    bestFor: row.best_for,
    pricing: row.pricing,
    websiteUrl: row.website_url,
    notes: row.notes,
    displayName: row.display_name,
    contactEmail: row.contact_email,
    status: row.moderation_status,
    createdAt: row.created_at,
  }));
}

function ratingMap(rows: RatingRecord[]): RatingsByTool {
  return Object.fromEntries(rows.map((row) => [row.toolId, row.rating]));
}

function buildUsesMap(rows: UseRecord[]): UsesByTool {
  return Object.fromEntries(rows.map((row) => [row.toolId, true]));
}

function messageFrom(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unexpected error";
}

function recalculateLocalMetrics(
  tools: DirectoryTool[],
  ratings: RatingRecord[],
  uses: UseRecord[],
  comments: ToolComment[],
): MetricsByTool {
  const metrics = buildEmptyMetrics(tools);
  ratings.forEach((rating) => {
    const entry = metrics[rating.toolId] ?? zeroMetric(rating.toolId);
    const total = (entry.averageRating ?? 0) * entry.ratingCount + rating.rating;
    entry.ratingCount += 1;
    entry.averageRating = total / entry.ratingCount;
    metrics[rating.toolId] = entry;
  });
  uses.forEach((use) => {
    const entry = metrics[use.toolId] ?? zeroMetric(use.toolId);
    entry.useCount += 1;
    metrics[use.toolId] = entry;
  });
  comments
    .filter((comment) => comment.status === "approved")
    .forEach((comment) => {
      const entry = metrics[comment.toolId] ?? zeroMetric(comment.toolId);
      entry.commentCount += 1;
      metrics[comment.toolId] = entry;
    });
  return metrics;
}

export function useDirectoryData() {
  const [mode, setMode] = useState<DirectoryMode>(
    isSupabaseConfigured ? "supabase" : "local",
  );
  const [tools, setTools] = useState<DirectoryTool[]>(seedTools);
  const [metrics, setMetrics] = useState<MetricsByTool>(
    buildEmptyMetrics(seedTools),
  );
  const [ratings, setRatings] = useState<RatingsByTool>({});
  const [uses, setUses] = useState<UsesByTool>({});
  const [comments, setComments] = useState<ToolComment[]>([]);
  const [suggestions, setSuggestions] = useState<ToolSuggestion[]>([]);
  const [auth, setAuth] = useState<AuthStatus>(initialAuth);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(tools.map((tool) => tool.category))].sort(),
    [tools],
  );

  const loadLocal = useCallback(() => {
    const local = loadLocalState();
    const guestId = getLocalGuestId();
    setMode("local");
    setTools(seedTools);
    setRatings(ratingMap(local.ratings));
    setUses(buildUsesMap(local.uses));
    setComments(local.comments);
    setSuggestions(local.suggestions);
    setMetrics(
      recalculateLocalMetrics(
        seedTools,
        local.ratings,
        local.uses,
        local.comments,
      ),
    );
    setAuth({
      userId: guestId,
      isAnonymous: true,
      isAdmin: false,
      email: null,
      loading: false,
    });
    setLoading(false);
  }, []);

  const loadSupabase = useCallback(async () => {
    if (!supabase) {
      loadLocal();
      return;
    }

    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      let user = sessionData.session?.user ?? null;

      if (!user) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        user = data.user;
      }

      const [{ data: profile }, toolsResult, metricsResult, ratingsResult, usesResult, commentsResult] =
        await Promise.all([
          user
            ? supabase
                .from("profiles")
                .select("role")
                .eq("id", user.id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          supabase
            .from("tools")
            .select(
              "id,slug,category,name,best_for,pricing,strengths,caveats,status,website_url,source_url,last_checked,created_at",
            )
            .eq("moderation_status", "approved")
            .order("name", { ascending: true }),
          supabase
            .from("tool_metrics")
            .select("tool_id,average_rating,rating_count,use_count,comment_count"),
          user
            ? supabase
                .from("ratings")
                .select("tool_id,rating")
                .eq("user_id", user.id)
            : Promise.resolve({ data: [], error: null }),
          user
            ? supabase.from("tool_uses").select("tool_id").eq("user_id", user.id)
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from("comments")
            .select(
              "id,tool_id,user_id,display_name,body,moderation_status,created_at",
            )
            .order("created_at", { ascending: false })
            .limit(500),
        ]);

      if (toolsResult.error) throw toolsResult.error;
      if (metricsResult.error) throw metricsResult.error;
      if (ratingsResult.error) throw ratingsResult.error;
      if (usesResult.error) throw usesResult.error;
      if (commentsResult.error) throw commentsResult.error;

      if (!toolsResult.data || toolsResult.data.length === 0) {
        throw new Error("No approved tools found. Run supabase/seed.sql.");
      }
      const loadedTools = (toolsResult.data as ToolRow[]).map(mapTool);
      const isAdmin = profile?.role === "admin";

      setMode("supabase");
      setTools(loadedTools);
      setMetrics(mapMetrics((metricsResult.data ?? []) as MetricsRow[], loadedTools));
      setRatings(
        Object.fromEntries(
          ((ratingsResult.data ?? []) as RatingRow[]).map((row) => [
            row.tool_id,
            row.rating,
          ]),
        ),
      );
      setUses(
        Object.fromEntries(
          ((usesResult.data ?? []) as UseRow[]).map((row) => [row.tool_id, true]),
        ),
      );
      setComments(mapComments((commentsResult.data ?? []) as CommentRow[]));

      if (isAdmin) {
        const { data, error } = await supabase
          .from("tool_suggestions")
          .select(
            "id,user_id,name,category,best_for,pricing,website_url,notes,display_name,contact_email,moderation_status,created_at",
          )
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        setSuggestions(mapSuggestions((data ?? []) as SuggestionRow[]));
      } else {
        setSuggestions([]);
      }

      setAuth({
        userId: user?.id ?? null,
        isAnonymous: isAnonymousUser(user),
        isAdmin,
        email: user?.email ?? null,
        loading: false,
      });
      setNotice(null);
    } catch (error) {
      setNotice(
        `Using local demo data because Supabase is not ready: ${messageFrom(error)}`,
      );
      loadLocal();
    } finally {
      setLoading(false);
    }
  }, [loadLocal]);

  useEffect(() => {
    if (isSupabaseConfigured) {
      void loadSupabase();
      const subscription = supabase?.auth.onAuthStateChange(() => {
        void loadSupabase();
      });
      return () => subscription?.data.subscription.unsubscribe();
    }
    loadLocal();
    return undefined;
  }, [loadLocal, loadSupabase]);

  const refresh = useCallback(async () => {
    if (mode === "supabase") {
      await loadSupabase();
    } else {
      loadLocal();
    }
  }, [loadLocal, loadSupabase, mode]);

  const rateTool = useCallback(
    async (toolId: string, rating: number) => {
      const boundedRating = Math.max(1, Math.min(5, rating));
      if (mode === "supabase" && supabase && auth.userId) {
        const previous = ratings[toolId];
        const { error } = await supabase.from("ratings").upsert(
          {
            tool_id: toolId,
            user_id: auth.userId,
            rating: boundedRating,
          },
          { onConflict: "tool_id,user_id" },
        );
        if (error) throw error;

        setRatings((current) => ({ ...current, [toolId]: boundedRating }));
        setMetrics((current) => {
          const entry = current[toolId] ?? zeroMetric(toolId);
          if (previous) {
            return {
              ...current,
              [toolId]: {
                ...entry,
                averageRating:
                  ((entry.averageRating ?? 0) * entry.ratingCount -
                    previous +
                    boundedRating) /
                  Math.max(entry.ratingCount, 1),
              },
            };
          }
          const count = entry.ratingCount + 1;
          return {
            ...current,
            [toolId]: {
              ...entry,
              ratingCount: count,
              averageRating:
                ((entry.averageRating ?? 0) * entry.ratingCount + boundedRating) /
                count,
            },
          };
        });
        return;
      }

      const local = loadLocalState();
      const nextRatings = [
        ...local.ratings.filter((row) => row.toolId !== toolId),
        { toolId, rating: boundedRating },
      ];
      const next = { ...local, ratings: nextRatings };
      saveLocalState(next);
      setRatings(ratingMap(nextRatings));
      setMetrics(
        recalculateLocalMetrics(seedTools, nextRatings, local.uses, local.comments),
      );
    },
    [auth.userId, mode, ratings],
  );

  const toggleUse = useCallback(
    async (toolId: string) => {
      const active = Boolean(uses[toolId]);
      if (mode === "supabase" && supabase && auth.userId) {
        const result = active
          ? await supabase
              .from("tool_uses")
              .delete()
              .eq("tool_id", toolId)
              .eq("user_id", auth.userId)
          : await supabase
              .from("tool_uses")
              .insert({ tool_id: toolId, user_id: auth.userId });
        if (result.error) throw result.error;
        setUses((current) => {
          const next = { ...current };
          if (active) delete next[toolId];
          else next[toolId] = true;
          return next;
        });
        setMetrics((current) => {
          const entry = current[toolId] ?? zeroMetric(toolId);
          return {
            ...current,
            [toolId]: {
              ...entry,
              useCount: Math.max(0, entry.useCount + (active ? -1 : 1)),
            },
          };
        });
        return;
      }

      const local = loadLocalState();
      const nextUses = active
        ? local.uses.filter((row) => row.toolId !== toolId)
        : [...local.uses, { toolId }];
      const next = { ...local, uses: nextUses };
      saveLocalState(next);
      setUses(buildUsesMap(nextUses));
      setMetrics(
        recalculateLocalMetrics(seedTools, local.ratings, nextUses, local.comments),
      );
    },
    [auth.userId, mode, uses],
  );

  const addComment = useCallback(
    async (toolId: string, displayName: string, body: string) => {
      const trimmedBody = body.trim();
      if (!trimmedBody) return;

      if (mode === "supabase" && supabase && auth.userId) {
        const { data, error } = await supabase
          .from("comments")
          .insert({
            tool_id: toolId,
            user_id: auth.userId,
            display_name: displayName.trim() || null,
            body: trimmedBody,
            moderation_status: "pending",
          })
          .select(
            "id,tool_id,user_id,display_name,body,moderation_status,created_at",
          )
          .single();
        if (error) throw error;
        setComments((current) => [mapComments([data as CommentRow])[0], ...current]);
        return;
      }

      const local = loadLocalState();
      const comment: ToolComment = {
        id: crypto.randomUUID(),
        toolId,
        userId: auth.userId ?? getLocalGuestId(),
        displayName: displayName.trim() || null,
        body: trimmedBody,
        status: "approved",
        createdAt: new Date().toISOString(),
      };
      const nextComments = [comment, ...local.comments];
      const next = { ...local, comments: nextComments };
      saveLocalState(next);
      setComments(nextComments);
      setMetrics(
        recalculateLocalMetrics(seedTools, local.ratings, local.uses, nextComments),
      );
    },
    [auth.userId, mode],
  );

  const submitSuggestion = useCallback(
    async (
      suggestion: Omit<
        ToolSuggestion,
        "id" | "userId" | "status" | "createdAt"
      >,
    ) => {
      if (mode === "supabase" && supabase && auth.userId) {
        const { error } = await supabase.from("tool_suggestions").insert({
          user_id: auth.userId,
          name: suggestion.name,
          category: suggestion.category,
          best_for: suggestion.bestFor,
          pricing: suggestion.pricing,
          website_url: suggestion.websiteUrl,
          notes: suggestion.notes,
          display_name: suggestion.displayName,
          contact_email: suggestion.contactEmail,
          moderation_status: "pending",
        });
        if (error) throw error;
        return;
      }

      const local = loadLocalState();
      const nextSuggestion: ToolSuggestion = {
        ...suggestion,
        id: crypto.randomUUID(),
        userId: auth.userId ?? getLocalGuestId(),
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      const next = {
        ...local,
        suggestions: [nextSuggestion, ...local.suggestions],
      };
      saveLocalState(next);
      setSuggestions(next.suggestions);
    },
    [auth.userId, mode],
  );

  const moderateComment = useCallback(
    async (commentId: string, status: "approved" | "rejected") => {
      if (mode !== "supabase" || !supabase || !auth.isAdmin) return;
      const { error } = await supabase
        .from("comments")
        .update({ moderation_status: status })
        .eq("id", commentId);
      if (error) throw error;
      setComments((current) =>
        current.map((comment) =>
          comment.id === commentId ? { ...comment, status } : comment,
        ),
      );
    },
    [auth.isAdmin, mode],
  );

  const moderateSuggestion = useCallback(
    async (suggestionId: string, status: "approved" | "rejected") => {
      if (mode !== "supabase" || !supabase || !auth.isAdmin) return;
      if (status === "approved") {
        const { error } = await supabase.rpc("approve_tool_suggestion", {
          p_suggestion_id: suggestionId,
        });
        if (error) throw error;
        await refresh();
        return;
      }
      const { error } = await supabase
        .from("tool_suggestions")
        .update({ moderation_status: status })
        .eq("id", suggestionId);
      if (error) throw error;
      setSuggestions((current) =>
        current.map((suggestion) =>
          suggestion.id === suggestionId ? { ...suggestion, status } : suggestion,
        ),
      );
    },
    [auth.isAdmin, mode, refresh],
  );

  const upgradeAnonymous = useCallback(async (email: string) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { error } = await supabase.auth.updateUser({
      email,
    });
    if (error) throw error;
    await refresh();
  }, [refresh]);

  const signIn = useCallback(async (email: string) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.href,
      },
    });
    if (error) throw error;
    await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    await loadSupabase();
  }, [loadSupabase]);

  return {
    auth,
    categories,
    comments,
    loading,
    metrics,
    mode,
    notice,
    ratings,
    suggestions,
    tools,
    uses,
    addComment,
    moderateComment,
    moderateSuggestion,
    rateTool,
    refresh,
    signIn,
    signOut,
    submitSuggestion,
    toggleUse,
    upgradeAnonymous,
  };
}
