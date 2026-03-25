// Path Engine — Supabase Client
const SUPABASE_URL = 'https://jzznpmrnaaxgsuolfdyr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6em5wbXJuYWF4Z3N1b2xmZHlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMjAzMTYsImV4cCI6MjA4OTg5NjMxNn0.CZljK2ai3bU5ejim4r04m0S_HTnlYvDxkRb2enLXjdE';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// CORE FIX: Ensure profile exists before ANY database operation
// This runs every time a user is detected — if profile missing, creates it
async function ensureProfile(user) {
  if (!user) return;
  
  var { data } = await supabaseClient
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single();
  
  if (!data) {
    var name = user.user_metadata.full_name || user.user_metadata.name || user.email.split('@')[0];
    var domain = user.user_metadata.domain || '';
    var skill = user.user_metadata.skill_level || '';
    
    await supabaseClient.from('profiles').insert({
      id: user.id,
      full_name: name,
      email: user.email,
      domain: domain,
      skill_level: skill
    });
  }
  
  var { data: deadline } = await supabaseClient
    .from('assessment_deadlines')
    .select('id')
    .eq('user_id', user.id)
    .single();
  
  if (!deadline) {
    var deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + 5);
    
    await supabaseClient.from('assessment_deadlines').insert({
      user_id: user.id,
      deadline_date: deadlineDate.toISOString()
    });
  }
}

// Sign up with email
async function signUpWithOTP(email, password, fullName, domain, skillLevel) {
  var { data, error } = await supabaseClient.auth.signUp({
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

// Send OTP
async function sendOTP(email) {
  var { data, error } = await supabaseClient.auth.signInWithOtp({
    email: email,
    options: { shouldCreateUser: false }
  });
  return { data, error };
}

// Verify OTP
async function verifyOTP(email, token) {
  var { data, error } = await supabaseClient.auth.verifyOtp({
    email: email,
    token: token,
    type: 'email'
  });
  if (data && data.user) {
    await ensureProfile(data.user);
  }
  return { data, error };
}

// Sign in with password
async function signIn(email, password) {
  var { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: password
  });
  if (data && data.user) {
    await ensureProfile(data.user);
  }
  return { data, error };
}

// Google sign in
async function signInWithGoogle() {
  var { data, error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/pages/academic-profile.html'
    }
  });
  return { data, error };
}

// Sign out
async function signOut() {
  var { error } = await supabaseClient.auth.signOut();
  return { error };
}

// Get current user
async function getUser() {
  var { data: { user } } = await supabaseClient.auth.getUser();
  return user;
}

// Get current session — also ensures profile exists
async function getSession() {
  var { data: { session } } = await supabaseClient.auth.getSession();
  if (session && session.user) {
    await ensureProfile(session.user);
  }
  return session;
}

// Check if user has domain set
async function hasDomainSet(userId) {
  var { data } = await supabaseClient
    .from('profiles')
    .select('domain')
    .eq('id', userId)
    .single();
  if (!data) return false;
  return data.domain && data.domain.length > 0;
}

// Update profile with domain and skill level
async function updateProfileBasics(userId, domain, skillLevel) {
  var { data, error } = await supabaseClient
    .from('profiles')
    .update({ domain: domain, skill_level: skillLevel, updated_at: new Date().toISOString() })
    .eq('id', userId);
  return { data, error };
}

// Check if academic profile is completed
async function isAcademicProfileComplete(userId) {
  var { data } = await supabaseClient
    .from('academic_profiles')
    .select('completed')
    .eq('user_id', userId)
    .single();
  if (!data) return false;
  return data.completed === true;
}

// Get assessment deadline status
async function getDeadlineStatus(userId) {
  var { data } = await supabaseClient
    .from('assessment_deadlines')
    .select('*')
    .eq('user_id', userId)
    .single();
  return data;
}

// Figure out where user should go
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

// Smart redirect
async function smartRedirect() {
  var state = await getUserState();
  if (state === 'not_logged_in') window.location.href = '/pages/auth.html';
  else if (state === 'needs_basics') window.location.href = '/pages/academic-profile.html';
  else if (state === 'needs_academic_profile') window.location.href = '/pages/academic-profile.html';
  else window.location.href = '/pages/dashboard.html';
}