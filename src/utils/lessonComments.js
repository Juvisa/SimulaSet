import { supabase } from '../lib/supabase';

const COMMENT_SELECT = 'id, lesson_id, user_id, user_name, user_role, content, timestamp_marker, parent_id, created_at';

export const getCommentCount = async (lessonId) => {
  const { count, error } = await supabase
    .from('lesson_comments')
    .select('id', { count: 'exact', head: true })
    .eq('lesson_id', lessonId);

  return { count: count || 0, error: error?.message };
};

export const getLessonComments = async ({ lessonId, userId }) => {
  const { data: comments, error } = await supabase
    .from('lesson_comments')
    .select(COMMENT_SELECT)
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: true });

  if (error) return { comments: [], error: error.message };
  if (!comments || comments.length === 0) return { comments: [], error: undefined };

  const commentIds = comments.map((c) => c.id);
  const { data: likes } = await supabase
    .from('lesson_comment_likes')
    .select('comment_id, user_id')
    .in('comment_id', commentIds);

  const likeCountByComment = {};
  const likedByMe = new Set();
  (likes || []).forEach((like) => {
    likeCountByComment[like.comment_id] = (likeCountByComment[like.comment_id] || 0) + 1;
    if (like.user_id === userId) likedByMe.add(like.comment_id);
  });

  return {
    comments: comments.map((c) => ({
      ...c,
      likeCount: likeCountByComment[c.id] || 0,
      likedByMe: likedByMe.has(c.id),
    })),
    error: undefined,
  };
};

export const createLessonComment = async ({ lessonId, userId, userName, userRole, content, timestampMarker, parentId }) => {
  if (!content?.trim()) return { comment: null, error: 'Escribe tu pregunta o comentario.' };

  const payload = {
    lesson_id: lessonId,
    user_id: userId,
    user_name: userName,
    user_role: userRole,
    content: content.trim(),
    timestamp_marker: timestampMarker?.trim() || null,
    parent_id: parentId || null,
  };

  const { data, error } = await supabase
    .from('lesson_comments')
    .insert(payload)
    .select(COMMENT_SELECT)
    .single();

  if (error || !data) return { comment: null, error: error?.message || 'No pudimos publicar tu comentario.' };
  return { comment: { ...data, likeCount: 0, likedByMe: false }, error: undefined };
};

export const toggleCommentLike = async ({ commentId, userId, liked }) => {
  if (liked) {
    const { error } = await supabase
      .from('lesson_comment_likes')
      .delete()
      .eq('comment_id', commentId)
      .eq('user_id', userId);
    return { liked: false, error: error?.message };
  }

  const { error } = await supabase
    .from('lesson_comment_likes')
    .insert({ comment_id: commentId, user_id: userId });
  return { liked: true, error: error?.message };
};

export const buildCommentTree = (flatComments) => {
  const byId = {};
  flatComments.forEach((c) => { byId[c.id] = { ...c, replies: [] }; });
  const roots = [];
  flatComments.forEach((c) => {
    const node = byId[c.id];
    if (c.parent_id && byId[c.parent_id]) byId[c.parent_id].replies.push(node);
    else roots.push(node);
  });
  return roots;
};
