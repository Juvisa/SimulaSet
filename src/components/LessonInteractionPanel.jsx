import { useEffect, useState } from 'react';
import { FileText, MessageSquare, Loader2, Send, ThumbsUp, Shield, Clock3 } from 'lucide-react';
import {
  getCommentCount, getLessonComments, createLessonComment, toggleCommentLike, buildCommentTree,
} from '../utils/lessonComments';

const getInitials = (name) => (name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const formatRelativeTime = (isoString) => {
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

const RoleBadge = ({ role }) => (
  role === 'admin'
    ? <span className="inline-flex items-center gap-1 rounded-full bg-accent-gold/15 px-2 py-0.5 text-[10px] font-black text-accent-gold"><Shield size={10} /> Admin/Mentor</span>
    : <span className="inline-block rounded-full bg-bg-input px-2 py-0.5 text-[10px] font-bold text-text-secondary">Alumno</span>
);

const CommentRow = ({ comment, userId, isReply, onReply, onToggleLike }) => (
  <div className={isReply ? 'ml-8 mt-3' : ''}>
    <div className="flex gap-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-input text-[10px] font-bold text-text-primary">{getInitials(comment.user_name)}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-text-primary">{comment.user_name}</span>
          <RoleBadge role={comment.user_role} />
          {comment.timestamp_marker && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-bg-input px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
              <Clock3 size={10} /> {comment.timestamp_marker}
            </span>
          )}
          <span className="text-[11px] text-text-secondary">{formatRelativeTime(comment.created_at)}</span>
        </div>
        {comment.user_role === 'admin' && isReply && (
          <div className="mt-1 text-[11px] font-black uppercase tracking-wide text-accent-gold">🛡️ Respuesta Oficial / Criterio</div>
        )}
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-text-primary">{comment.content}</p>
        <div className="mt-1.5 flex items-center gap-3">
          <button
            onClick={() => onToggleLike(comment)}
            className={`flex items-center gap-1 text-xs font-bold transition-colors ${comment.likedByMe ? 'text-accent-coral' : 'text-text-secondary hover:text-text-primary'}`}
          >
            <ThumbsUp size={13} /> Me sirvió {comment.likeCount > 0 && `(${comment.likeCount})`}
          </button>
          {!isReply && (
            <button onClick={() => onReply(comment.id)} className="text-xs font-bold text-text-secondary hover:text-text-primary">Responder</button>
          )}
        </div>
      </div>
    </div>
    {!isReply && comment.replies?.length > 0 && (
      <div className="border-l border-border-subtle pl-2">
        {comment.replies.map((reply) => (
          <CommentRow key={reply.id} comment={reply} userId={userId} isReply onToggleLike={onToggleLike} />
        ))}
      </div>
    )}
  </div>
);

const DiscussionTab = ({ lessonId, userId, userName, userRole, comments, loading, error, onCommentPosted, onToggleLike }) => {
  const [content, setContent] = useState('');
  const [timestampMarker, setTimestampMarker] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [localError, setLocalError] = useState('');

  const handlePublish = async () => {
    setPosting(true);
    setLocalError('');
    const { comment, error: postError } = await createLessonComment({
      lessonId, userId, userName, userRole, content, timestampMarker,
    });
    setPosting(false);
    if (postError) { setLocalError(postError); return; }
    onCommentPosted(comment);
    setContent('');
    setTimestampMarker('');
  };

  const handleReply = async (parentId) => {
    if (!replyDraft.trim()) return;
    setPosting(true);
    setLocalError('');
    const { comment, error: postError } = await createLessonComment({
      lessonId, userId, userName, userRole, content: replyDraft, parentId,
    });
    setPosting(false);
    if (postError) { setLocalError(postError); return; }
    onCommentPosted(comment);
    setReplyDraft('');
    setReplyingTo(null);
  };

  const tree = buildCommentTree(comments);

  return (
    <div>
      <div className="rounded-xl border border-border-subtle bg-bg-input/40 p-3.5">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          placeholder="¿Qué duda tienes sobre esta clase?"
          className="w-full resize-y rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-coral"
        />
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={timestampMarker}
            onChange={(e) => setTimestampMarker(e.target.value)}
            placeholder="¿En qué minuto? MM:SS (opcional)"
            className="w-full max-w-[220px] rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-xs text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-coral"
          />
          <button
            onClick={handlePublish}
            disabled={posting || !content.trim()}
            className="flex items-center justify-center gap-2 rounded-lg bg-accent-coral px-4 py-2 text-xs font-black text-white transition-opacity disabled:opacity-40 sm:ml-auto"
          >
            {posting ? <><Loader2 size={14} className="animate-spin" /> Enviando...</> : 'Enviar Pregunta'}
          </button>
        </div>
        {localError && <p className="mt-2 text-xs text-red-400">{localError}</p>}
      </div>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-text-secondary"><Loader2 size={14} className="animate-spin" /> Cargando preguntas...</div>
      ) : tree.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">Sé el primero en preguntar sobre esta clase.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {tree.map((comment) => (
            <div key={comment.id}>
              <CommentRow comment={comment} userId={userId} onReply={setReplyingTo} onToggleLike={onToggleLike} />
              {replyingTo === comment.id && (
                <div className="ml-8 mt-2 flex items-center gap-2">
                  <input
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleReply(comment.id); }}
                    placeholder="Escribe tu respuesta..."
                    className="flex-1 rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-xs text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-coral"
                  />
                  <button onClick={() => handleReply(comment.id)} disabled={posting || !replyDraft.trim()} className="flex items-center justify-center rounded-lg bg-accent-coral p-2 text-white disabled:opacity-40">
                    {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MaterialsTab = ({ lesson }) => {
  if (!Array.isArray(lesson.resources) || lesson.resources.length === 0) {
    return <p className="text-sm text-text-secondary">No hay materiales adicionales para esta clase todavía.</p>;
  }
  return (
    <div className="space-y-2">
      {lesson.resources.map((resource, index) => (
        <a
          key={resource.id || `${lesson.id}-resource-${index}`}
          href={resource.url}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 w-full items-center rounded-xl border border-border-subtle bg-bg-input px-4 py-2.5 text-sm font-semibold text-text-primary hover:border-accent-coral/40"
        >
          {resource.title || 'Abrir recurso'}
        </a>
      ))}
    </div>
  );
};

const LessonInteractionPanel = ({ lesson, userId, userName, userRole }) => {
  const [activeTab, setActiveTab] = useState('materials');
  const [comments, setComments] = useState([]);
  const [commentCount, setCommentCount] = useState(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getCommentCount(lesson.id).then(({ count }) => {
      if (active) setCommentCount(count);
    });
    return () => { active = false; };
  }, [lesson.id]);

  const openDiscussion = () => {
    setActiveTab('discussion');
    if (loadedOnce) return;
    setLoadedOnce(true);
    setLoadingComments(true);
    getLessonComments({ lessonId: lesson.id, userId }).then(({ comments: loaded, error: loadError }) => {
      setComments(loaded);
      setCommentCount(loaded.length);
      if (loadError) setError(`No pudimos cargar las preguntas: ${loadError}`);
    }).finally(() => setLoadingComments(false));
  };

  const handleCommentPosted = (comment) => {
    setComments((prev) => [...prev, comment]);
    setCommentCount((prev) => (prev || 0) + 1);
  };

  const handleToggleLike = async (comment) => {
    const liked = comment.likedByMe;
    setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, likedByMe: !liked, likeCount: c.likeCount + (liked ? -1 : 1) } : c)));
    await toggleCommentLike({ commentId: comment.id, userId, liked });
  };

  return (
    <div className="mt-5 rounded-2xl border border-border-subtle bg-bg-input/20 p-4">
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('materials')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === 'materials' ? 'bg-accent-coral text-white' : 'text-text-secondary hover:text-text-primary'}`}
        >
          <FileText size={13} /> Materiales & Recursos
        </button>
        <button
          onClick={openDiscussion}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === 'discussion' ? 'bg-accent-coral text-white' : 'text-text-secondary hover:text-text-primary'}`}
        >
          <MessageSquare size={13} /> Preguntas & Criterio {commentCount !== null && `(${commentCount})`}
        </button>
      </div>

      <div className="mt-4">
        {activeTab === 'materials' ? (
          <MaterialsTab lesson={lesson} />
        ) : (
          <DiscussionTab
            lessonId={lesson.id}
            userId={userId}
            userName={userName}
            userRole={userRole}
            comments={comments}
            loading={loadingComments}
            error={error}
            onCommentPosted={handleCommentPosted}
            onToggleLike={handleToggleLike}
          />
        )}
      </div>
    </div>
  );
};

export default LessonInteractionPanel;
