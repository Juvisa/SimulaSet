import { Component } from 'react';

// Esta app nunca tuvo un Error Boundary — cualquier excepción no capturada
// durante el render (en cualquier página) desmontaba TODO el árbol de React,
// dejando una pantalla negra sin ninguna pista de qué pasó. Este componente
// atrapa esos errores y los muestra en pantalla (mensaje + stack trace), para
// poder diagnosticar sin depender de que alguien abra la consola del
// navegador en el momento exacto del crash.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Error no capturado:', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-left">
          <p className="text-center text-sm font-black uppercase tracking-wide text-red-400">Ocurrió un error inesperado</p>
          <p className="mt-3 text-sm text-text-primary">{error.message || 'Error desconocido'}</p>
          <pre className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/40 p-3 text-xs text-red-300/90">
            {error.stack || 'Sin stack trace disponible.'}
          </pre>
          <div className="mt-4 flex justify-center gap-3">
            <button onClick={this.handleReset} className="rounded-xl bg-accent-coral px-4 py-2 text-sm font-bold text-white">Reintentar</button>
            <button onClick={() => window.location.reload()} className="rounded-xl border border-border-subtle px-4 py-2 text-sm font-bold text-text-secondary">Recargar página</button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
