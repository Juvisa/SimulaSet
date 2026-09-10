import { useEffect, useState } from 'react';
import {
  Trophy, LifeBuoy, Lightbulb, Flame, MessageCircle, Link as LinkIcon,
  Upload, Loader2, Send, Crown,
} from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import {
  POST_TYPES, formatRelativeTime, getFeed, getMyReactions, createPost,
  uploadPostEvidenceFile, toggleFireReaction, getComments, addComment, getWeeklyVictoryLeaderboard,
} from '../utils/communityPosts';

const TABS = [
  { key: 'victoria', icon: Trophy },
  { key: 'rescate', icon: LifeBuoy },
  { key: 'criterio', icon: Lightbulb },
];

const CONTENT_LABEL = {
  victoria: 'Objeción superada',
  rescate: '¿Qué necesitas del equipo? Describe la situación en vivo.',
  criterio: '¿Qué ajuste táctico funcionó?',
};

const getInitials = (name) => (name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const isImageUrl = (url) => /\.(png|jpe?g|gif|webp)$/i.test(url || '');

const Composer = ({ userId, authorName, onPosted }) => {
  const [activeTab, setActiveTab] = useState('victoria');
  const [content, setContent] = useState('');
  const [niche, setNiche] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  const selectTab = (key) => {
    setActiveTab(key);
    setContent('');
    setNiche('');
    setEvidenceUrl('');
    setError('');
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    const { url, error: uploadError } = await uploadPostEvidenceFile({ userId, file });
    setUploading(false);
    if (uploadError) { setError(uploadError); return; }
    setEvidenceUrl(url);
  };

  const handlePublish = async () => {
    setPosting(true);
    setError('');
    const { post, error: postError } = await createPost({
      userId, authorName, postType: activeTab, content, niche: activeTab === 'victoria' ? niche : '', evidenceUrl,
    });
    setPosting(false);
    if (postError) { setError(postError); return; }
    onPosted(post, POST_TYPES[activeTab].xp);
    setContent('');
    setNiche('');
    setEvidenceUrl('');
  };

  const canPublish = content.trim() && (activeTab !== 'victoria' || (niche.trim() && evidenceUrl.trim()));

  return (
    <div className="rounded-3xl border border-border-subtle bg-bg-card p-5 md:p-6">
      <div className="flex flex-wrap gap-2">
        {TABS.map(({ key, icon: Icon }) => {
          const meta = POST_TYPES[key];
          const selected = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => selectTab(key)}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
                selected ? 'text-white' : 'bg-bg-input text-text-secondary hover:text-text-primary'
              }`}
              style={selected ? { backgroundColor: meta.color } : {}}
            >
              <Icon size={15} />
              {meta.emoji} {meta.label}
              {meta.xp > 0 && <span className="opacity-80">+{meta.xp} XP</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-5 space-y-3">
        {activeTab === 'victoria' && (
          <input
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="Nicho (ej. Coaching de negocios, Fitness online...)"
            className="w-full rounded-xl border border-border-subtle bg-bg-input px-3.5 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-coral"
          />
        )}

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder={CONTENT_LABEL[activeTab]}
          className="w-full resize-y rounded-xl border border-border-subtle bg-bg-input px-3.5 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-coral"
        />

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-border-subtle bg-bg-input px-3 py-2.5">
            <LinkIcon size={14} className="shrink-0 text-text-secondary" />
            <input
              type="url"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder={activeTab === 'victoria' ? 'Link de tu captura/agendamiento...' : 'Link de captura (opcional)...'}
              className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary"
            />
          </div>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border-subtle px-3 py-2.5 text-xs font-bold text-text-secondary transition-colors hover:text-text-primary">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Subir captura
            <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={handleFileChange} />
          </label>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          onClick={handlePublish}
          disabled={posting || uploading || !canPublish}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-coral px-5 py-3 text-sm font-black text-white transition-opacity disabled:opacity-40 sm:w-auto"
        >
          {posting ? <><Loader2 size={16} className="animate-spin" /> Publicando...</> : 'Publicar en SET WINS'}
        </button>
      </div>
    </div>
  );
};

const CommentsSection = ({ postId, userId, authorName }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    getComments(postId).then(({ comments: loaded }) => {
      if (active) setComments(loaded);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [postId]);

  const handleSend = async () => {
    if (!draft.trim()) return;
    setSending(true);
    const { comment } = await addComment({ postId, userId, authorName, content: draft });
    setSending(false);
    if (comment) {
      setComments((prev) => [...prev, comment]);
      setDraft('');
    }
  };

  return (
    <div className="mt-4 border-t border-border-subtle pt-4">
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-text-secondary"><Loader2 size={14} className="animate-spin" /> Cargando comentarios...</div>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2 text-sm">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-input text-[10px] font-bold text-text-primary">{getInitials(c.author_name)}</div>
              <div>
                <span className="font-bold text-text-primary">{c.author_name}</span>{' '}
                <span className="text-text-secondary">{c.content}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
          placeholder="Escribe un comentario..."
          className="flex-1 rounded-xl border border-border-subtle bg-bg-input px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-coral"
        />
        <button onClick={handleSend} disabled={sending || !draft.trim()} className="flex items-center justify-center rounded-xl bg-accent-coral p-2.5 text-white disabled:opacity-40">
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
};

const PostCard = ({ post, userId, authorName, reacted, onToggleFire }) => {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const meta = POST_TYPES[post.post_type];

  return (
    <article className="rounded-2xl border border-border-subtle bg-bg-card p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-input text-xs font-bold text-text-primary">{getInitials(post.author_name)}</div>
          <div>
            <div className="text-sm font-bold text-text-primary">{post.author_name}</div>
            <div className="text-xs text-text-secondary">{formatRelativeTime(post.created_at)}</div>
          </div>
        </div>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ backgroundColor: meta.color }}>
          {meta.emoji} {meta.label}
        </span>
      </div>

      <div className="mt-3">
        {post.post_type === 'victoria' && post.niche && (
          <span className="mb-2 inline-block rounded-full border border-accent-gold/30 bg-accent-gold/5 px-2.5 py-1 text-[11px] font-bold text-accent-gold">{post.niche}</span>
        )}
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">{post.content}</p>
        {post.evidence_url && (
          isImageUrl(post.evidence_url) ? (
            <img src={post.evidence_url} alt="Evidencia" className="mt-3 max-h-96 w-full rounded-xl border border-border-subtle object-cover" />
          ) : (
            <a href={post.evidence_url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-bold text-accent-coral underline">Ver evidencia →</a>
          )
        )}
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          onClick={() => onToggleFire(post.id)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${reacted ? 'bg-accent-coral/10 text-accent-coral' : 'bg-bg-input text-text-secondary hover:text-text-primary'}`}
        >
          <Flame size={14} /> {post.fireCount || 0}
        </button>
        <button
          onClick={() => setCommentsOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-full bg-bg-input px-3 py-1.5 text-xs font-bold text-text-secondary hover:text-text-primary"
        >
          <MessageCircle size={14} /> {post.commentCount || 0}
        </button>
      </div>

      {commentsOpen && <CommentsSection postId={post.id} userId={userId} authorName={authorName} />}
    </article>
  );
};

const Leaderboard = ({ leaderboard }) => {
  if (!leaderboard || leaderboard.length === 0) return null;
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div className="mb-6 rounded-2xl border border-accent-gold/30 bg-accent-gold/5 p-4 md:p-5">
      <div className="flex items-center gap-2 text-xs font-black tracking-[0.16em] text-accent-gold"><Crown size={16} /> TOP AGENDADORES DE LA SEMANA</div>
      <div className="mt-3 space-y-2">
        {leaderboard.map((entry, index) => (
          <div key={entry.authorName} className="flex items-center justify-between rounded-xl bg-bg-card/60 px-3 py-2">
            <span className="flex items-center gap-2 text-sm font-bold text-text-primary">{medals[index]} {entry.authorName}</span>
            <span className="text-sm font-black text-accent-gold">{entry.count} victoria{entry.count === 1 ? '' : 's'}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const SetWins = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [reactedPostIds, setReactedPostIds] = useState(new Set());
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    let active = true;
    getFeed({}).then(async ({ posts: loadedPosts, error: feedError }) => {
      if (!active) return;
      setPosts(loadedPosts);
      if (feedError) setError(`No pudimos cargar el muro: ${feedError}`);
      if (loadedPosts.length > 0) {
        const { reactedPostIds: reacted } = await getMyReactions({ userId: user.id, postIds: loadedPosts.map((p) => p.id) });
        if (active) setReactedPostIds(reacted);
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    getWeeklyVictoryLeaderboard().then(({ leaderboard: board }) => {
      if (active) setLeaderboard(board);
    });
    return () => { active = false; };
  }, [user.id]);

  const handlePosted = (post, xpReward) => {
    setPosts((prev) => [post, ...prev]);
    setSuccessMsg(xpReward > 0 ? `¡Publicado! +${xpReward} XP` : '¡Publicado! El equipo verá tu S.O.S.');
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleToggleFire = async (postId) => {
    const reacted = reactedPostIds.has(postId);
    setReactedPostIds((prev) => {
      const next = new Set(prev);
      if (reacted) next.delete(postId); else next.add(postId);
      return next;
    });
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, fireCount: p.fireCount + (reacted ? -1 : 1) } : p)));
    await toggleFireReaction({ postId, userId: user.id, reacted });
  };

  return (
    <Layout>
      <div className="mx-auto max-w-3xl animate-fade-in">
        <header className="mb-6">
          <div className="text-xs font-black uppercase tracking-[0.25em] text-accent-coral">Comunidad</div>
          <h1 className="mt-2 text-3xl font-black text-text-primary md:text-4xl">SET WINS</h1>
          <p className="mt-2 text-sm text-text-secondary">Muro de victorias, llamadas agendadas y rescate de chats. El número, no la sensación.</p>
        </header>

        <Leaderboard leaderboard={leaderboard} />

        <div className="mb-6">
          <Composer userId={user.id} authorName={user.name} onPosted={handlePosted} />
        </div>

        {error && <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
        {successMsg && <div className="mb-5 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">{successMsg}</div>}

        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-text-secondary"><Loader2 size={18} className="animate-spin" /> Cargando el muro...</div>
        ) : posts.length === 0 ? (
          <p className="text-center text-sm text-text-secondary">Aún no hay publicaciones. ¡Sé el primero en compartir un SET WIN!</p>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                userId={user.id}
                authorName={user.name}
                reacted={reactedPostIds.has(post.id)}
                onToggleFire={handleToggleFire}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default SetWins;
