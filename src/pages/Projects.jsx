import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getProjects, deleteProject } from '../utils/storage';
import Layout from '../components/Layout';
import { Plus, Trash2, Edit3, Play, BarChart2, ChevronRight } from 'lucide-react';

const Projects = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    setProjects(getProjects(user.id));
  }, [user.id]);

  const handleDelete = (id, name) => {
    if (!window.confirm(`¿Eliminar el proyecto "${name}"?`)) return;
    deleteProject(id);
    setProjects(getProjects(user.id));
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Mis Proyectos</h1>
          <p className="text-text-secondary text-sm mt-1">Cada proyecto es el contexto de un experto o campaña</p>
        </div>
        <Link
          to="/projects/new"
          className="flex items-center gap-2 bg-accent-coral text-white px-4 py-2.5 rounded-xl font-medium hover:bg-accent-coral/90 transition-all text-sm"
        >
          <Plus size={16} />
          Nuevo proyecto
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="bg-bg-card border border-border-subtle rounded-2xl p-12 text-center">
          <div className="text-5xl mb-4">📁</div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">Sin proyectos aún</h3>
          <p className="text-text-secondary text-sm mb-6">
            Crea tu primer proyecto con los datos del experto para empezar a practicar
          </p>
          <Link
            to="/projects/new"
            className="inline-flex items-center gap-2 bg-accent-coral text-white px-5 py-2.5 rounded-xl font-medium hover:bg-accent-coral/90 transition-all"
          >
            <Plus size={16} />
            Crear primer proyecto
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map(project => (
            <div
              key={project.id}
              className="bg-bg-card border border-border-subtle rounded-2xl p-5 hover:border-accent-coral/30 transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-text-primary group-hover:text-accent-coral transition-colors">
                    {project.name}
                  </h3>
                  <p className="text-text-secondary text-sm mt-0.5">{project.expertName} · {project.niche}</p>
                </div>
                <div className="flex items-center gap-1 ml-3">
                  <button
                    onClick={() => navigate(`/projects/${project.id}/edit`)}
                    className="p-2 text-text-secondary hover:text-accent-gold hover:bg-accent-gold/10 rounded-lg transition-all"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(project.id, project.name)}
                    className="p-2 text-text-secondary hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <p className="text-text-secondary text-xs line-clamp-2 mb-4">{project.promise}</p>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs bg-bg-input px-2 py-1 rounded-full text-text-secondary">
                  💰 {project.price || 'Sin precio'}
                </span>
                {project.testimonials?.length > 0 && (
                  <span className="text-xs bg-bg-input px-2 py-1 rounded-full text-text-secondary">
                    ⭐ {project.testimonials.length} testimonios
                  </span>
                )}
                {project.resources?.length > 0 && (
                  <span className="text-xs bg-bg-input px-2 py-1 rounded-full text-text-secondary">
                    📚 {project.resources.length} recursos
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border-subtle">
                <button
                  onClick={() => navigate('/simulate', { state: { projectId: project.id } })}
                  className="flex-1 flex items-center justify-center gap-2 bg-accent-coral/10 text-accent-coral border border-accent-coral/20 px-3 py-2 rounded-lg text-sm font-medium hover:bg-accent-coral/20 transition-all"
                >
                  <Play size={14} />
                  Simular
                </button>
                <button
                  onClick={() => navigate('/analyzer', { state: { projectId: project.id } })}
                  className="flex-1 flex items-center justify-center gap-2 bg-bg-input text-text-secondary border border-border-subtle px-3 py-2 rounded-lg text-sm font-medium hover:text-text-primary transition-all"
                >
                  <BarChart2 size={14} />
                  Analizar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
};

export default Projects;
