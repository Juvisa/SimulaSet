-- Necesario para el modal "¡Es un Match!": al confirmarse un match, se revela un
-- enlace de contacto directo (WhatsApp o Calendly) provisto por la empresa.
alter table public.company_vacancies
  add column if not exists contact_link text;
