// Preview local: alumno ficticio, sin sesión real ni Supabase.
/* eslint-disable react-refresh/only-export-components */
const SANDBOX_USER = Object.freeze({ id: 'preview-local', name: 'Alumno de prueba (preview local)', email: '' });

export const AuthProvider = ({ children }) => children;
export const useAuth = () => ({ user: SANDBOX_USER, refreshUser: async () => {}, loading: false });
