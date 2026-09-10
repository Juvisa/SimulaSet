import { supabase } from '../lib/supabase';
import { addXp } from './xp';
import { getIsoWeekday } from './dailyMissions';

export const POST_TYPES = {
  victoria: { label: 'Victoria / Agendamiento', emoji: '🏆', xp: 40, color: '#C9920A' },
  rescate: { label: 'Rescate de Chat (S.O.S.)', emoji: '🥊', xp: 0, color: '#DC2626' },
  criterio: { label: 'Criterio / Hallazgo', emoji: '💡', xp: 20, color: '#2563EB' },
};

const POST_SELECT = 'id, user_id, author_name, post_type, content, niche, evidence_url, created_at';

const sanitizeFileName = (name) => name.replace(/[^a-zA-Z0-9.\-_]/g, '_');

const getStartOfWeekIso = () => {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (getIsoWeekday(now) - 1));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString();
};

export const formatRelativeTime = (isoString) => {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return new Date(isoString).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
};

export const getFeed = async ({ limit = 30 } = {}) => {
  const { data: posts, error } = await supabase
    .from('community_posts')
    .select(POST_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { posts: [], error: error.message };
  if (!posts || posts.length === 0) return { posts: [], error: undefined };

  const postIds = posts.map((p) => p.id);

  const [{ data: reactions }, { data: comments }] = await Promise.all([
    supabase.from('community_post_reactions').select('post_id, user_id').in('post_id', postIds),
    supabase.from('community_post_comments').select('id, post_id').in('post_id', postIds),
  ]);

  const fireCountByPost = {};
  (reactions || []).forEach((r) => {
    fireCountByPost[r.post_id] = (fireCountByPost[r.post_id] || 0) + 1;
  });
  const commentCountByPost = {};
  (comments || []).forEach((c) => {
    commentCountByPost[c.post_id] = (commentCountByPost[c.post_id] || 0) + 1;
  });

  return {
    posts: posts.map((post) => ({
      ...post,
      fireCount: fireCountByPost[post.id] || 0,
      commentCount: commentCountByPost[post.id] || 0,
    })),
    error: undefined,
  };
};

export const getMyReactions = async ({ userId, postIds }) => {
  const { data, error } = await supabase
    .from('community_post_reactions')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', postIds);

  if (error) return { reactedPostIds: new Set(), error: error.message };
  return { reactedPostIds: new Set((data || []).map((r) => r.post_id)), error: undefined };
};

export const createPost = async ({ userId, authorName, postType, content, niche, evidenceUrl }) => {
  if (!content?.trim()) return { post: null, error: 'Escribe el contenido de tu publicación.' };
  if (postType === 'victoria' && (!niche?.trim() || !evidenceUrl?.trim())) {
    return { post: null, error: 'Para una Victoria necesitas nicho y captura/link.' };
  }

  const payload = {
    user_id: userId,
    author_name: authorName,
    post_type: postType,
    content: content.trim(),
    niche: niche?.trim() || null,
    evidence_url: evidenceUrl?.trim() || null,
  };

  const { data, error } = await supabase
    .from('community_posts')
    .insert(payload)
    .select(POST_SELECT)
    .single();

  if (error || !data) return { post: null, error: error?.message || 'No pudimos publicar tu SET WIN.' };

  const xpReward = POST_TYPES[postType]?.xp || 0;
  if (xpReward > 0) await addXp({ userId, amount: xpReward });

  return { post: { ...data, fireCount: 0, commentCount: 0 }, error: undefined };
};

export const uploadPostEvidenceFile = async ({ userId, file }) => {
  const path = `${userId}/${Date.now()}-${sanitizeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from('community-posts').upload(path, file, { upsert: false });
  if (uploadError) return { url: null, error: uploadError.message };

  const { data } = supabase.storage.from('community-posts').getPublicUrl(path);
  return { url: data?.publicUrl || null, error: data?.publicUrl ? undefined : 'No pudimos generar el enlace de tu captura.' };
};

export const toggleFireReaction = async ({ postId, userId, reacted }) => {
  if (reacted) {
    const { error } = await supabase
      .from('community_post_reactions')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId)
      .eq('reaction', 'fire');
    return { reacted: false, error: error?.message };
  }

  const { error } = await supabase
    .from('community_post_reactions')
    .insert({ post_id: postId, user_id: userId, reaction: 'fire' });
  return { reacted: true, error: error?.message };
};

export const getComments = async (postId) => {
  const { data, error } = await supabase
    .from('community_post_comments')
    .select('id, post_id, author_name, content, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  return { comments: data || [], error: error?.message };
};

export const addComment = async ({ postId, userId, authorName, content }) => {
  if (!content?.trim()) return { comment: null, error: 'Escribe un comentario.' };

  const { data, error } = await supabase
    .from('community_post_comments')
    .insert({ post_id: postId, user_id: userId, author_name: authorName, content: content.trim() })
    .select('id, post_id, author_name, content, created_at')
    .single();

  return { comment: data || null, error: error?.message };
};

export const getWeeklyVictoryLeaderboard = async () => {
  const { data, error } = await supabase
    .from('community_posts')
    .select('author_name')
    .eq('post_type', 'victoria')
    .gte('created_at', getStartOfWeekIso());

  if (error) return { leaderboard: [], error: error.message };

  const countByAuthor = {};
  (data || []).forEach(({ author_name }) => {
    countByAuthor[author_name] = (countByAuthor[author_name] || 0) + 1;
  });

  const leaderboard = Object.entries(countByAuthor)
    .map(([authorName, count]) => ({ authorName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return { leaderboard, error: undefined };
};
