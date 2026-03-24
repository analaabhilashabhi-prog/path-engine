// Supabase Client Initialization
// This file connects our frontend to Supabase

const SUPABASE_URL = 'https://jzznpmrnaaxgsuolfdyr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6em5wbXJuYWF4Z3N1b2xmZHlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMjAzMTYsImV4cCI6MjA4OTg5NjMxNn0.CZljK2ai3bU5ejim4r04m0S_HTnlYvDxkRb2enLXjdE';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Auth helper functions
async function signUp(email, password, fullName, domain, skillLevel) {
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
    options: {
      data: {
        full_name: fullName,
        domain: domain,
        skill_level: skillLevel
      }
    }
  });
  return { data, error };
}

async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password
  });
  return { data, error };
}

async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/pages/academic-profile.html'
    }
  });
  return { data, error };
}

async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// Check if academic profile is completed
async function isAcademicProfileComplete(userId) {
  const { data, error } = await supabase
    .from('academic_profiles')
    .select('completed')
    .eq('user_id', userId)
    .single();
  
  if (error || !data) return false;
  return data.completed === true;
}

// Check assessment deadline status
async function getDeadlineStatus(userId) {
  const { data, error } = await supabase
    .from('assessment_deadlines')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (error || !data) return null;
  return data;
}

// Redirect based on user state
async function redirectBasedOnState() {
  const user = await getUser();
  if (!user) {
    window.location.href = '/pages/auth.html';
    return;
  }
  
  const profileComplete = await isAcademicProfileComplete(user.id);
  if (!profileComplete) {
    window.location.href = '/pages/academic-profile.html';
    return;
  }
  
  window.location.href = '/pages/dashboard.html';
}