// Path Engine — Supabase Client
const SUPABASE_URL = 'https://jzznpmrnaaxgsuolfdyr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6em5wbXJuYWF4Z3N1b2xmZHlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMjAzMTYsImV4cCI6MjA4OTg5NjMxNn0.CZljK2ai3bU5ejim4r04m0S_HTnlYvDxkRb2enLXjdE';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Sign up with email — sends OTP instead of password-based signup
async function signUpWithOTP(email, password, fullName, domain, skillLevel) {
  // First create the account with password
  const { data, error } = await supabaseClient.auth.signUp({
    email: email,
    password: password,
    options: {
      data: {
        full_name: fullName,
        domain: domain,
        skill_level: skillLevel
      },
      emailRedirectTo: window.location.origin + '/pages/auth.html'
    }
  });
  return { data, error };
}

// Send OTP to email for verification
async function sendOTP(email) {
  const { data, error } = await supabaseClient.auth.signInWithOtp({
    email: email,
    options: {
      shouldCreateUser: false
    }
  });
  return { data, error };
}

// Verify OTP code
async function verifyOTP(email, token) {
  const { data, error } = await supabaseClient.auth.verifyOtp({
    email: email,
    token: token,
    type: 'email'
  });
  return { data, error };
}

// Sign in with email + password
async function signIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: password
  });
  return { data, error };
}

// Google sign in
async function signInWithGoogle() {
  const { data, error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/pages/academic-profile.html'
    }
  });
  return { data, error };
}

// Sign out
async function signOut() {
  const { error } = await supabaseClient.auth.signOut();
  return { error };
}

// Get current user
async function getUser() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  return user;
}

// Get current session
async function getSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session;
}

// Check if user has domain set (Google users might not)
async function hasDomainSet(userId) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('domain')
    .eq('id', userId)
    .single();
  if (error || !data) return false;
  return data.domain && data.domain.length > 0;
}

// Update profile with domain and skill level
async function updateProfileBasics(userId, domain, skillLevel) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .update({ domain: domain, skill_level: skillLevel, updated_at: new Date().toISOString() })
    .eq('id', userId);
  return { data, error };
}

// Check if academic profile is completed
async function isAcademicProfileComplete(userId) {
  const { data, error } = await supabaseClient
    .from('academic_profiles')
    .select('completed')
    .eq('user_id', userId)
    .single();
  if (error || !data) return false;
  return data.completed === true;
}

// Get assessment deadline status
async function getDeadlineStatus(userId) {
  const { data, error } = await supabaseClient
    .from('assessment_deadlines')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error || !data) return null;
  return data;
}

// Figure out where user should go based on their state
async function getUserState() {
  var session = await getSession();
  if (!session) return 'not_logged_in';
  var user = session.user;
  var hasDomain = await hasDomainSet(user.id);
  if (!hasDomain) return 'needs_basics';
  var profileDone = await isAcademicProfileComplete(user.id);
  if (!profileDone) return 'needs_academic_profile';
  return 'ready_for_dashboard';
}

// Redirect user to the right page based on state
async function smartRedirect() {
  var state = await getUserState();
  if (state === 'not_logged_in') {
    window.location.href = '/pages/auth.html';
  } else if (state === 'needs_basics') {
    window.location.href = '/pages/academic-profile.html';
  } else if (state === 'needs_academic_profile') {
    window.location.href = '/pages/academic-profile.html';
  } else {
    window.location.href = '/pages/dashboard.html';
  }
}