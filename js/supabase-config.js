// Configuración pública de Supabase para Strumio.
//
// La "anon key" está diseñada para exponerse en el cliente: solo permite las
// operaciones que las políticas RLS autorizan. NO pongas aquí la service_role.
//
// Puedes sobreescribir estos valores desde Ajustes → Conexión / Backend;
// lo que guardes en la app tiene prioridad sobre este archivo.

export const SUPABASE_URL = "https://ljivvfvkdwecgblyepdg.supabase.co";

export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqaXZ2ZnZrZHdlY2dibHllcGRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMjk2MjEsImV4cCI6MjEwODYwNTYyMX0.fbn5ub4Az_ivmhx463WTbWIT6NN0Fh8ahJ2zaRwjIlA";

export const SUPABASE_REALTIME = true;
