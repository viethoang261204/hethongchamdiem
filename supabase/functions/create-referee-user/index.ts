/// <reference types="https://esm.sh/@supabase/functions-js/dist/deno/edge-runtime.d.ts" />

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) throw new Error('Thiếu token');

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) throw new Error('Không xác thực được');

    // Kiểm tra admin
    const { data: profile } = await supabaseClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role !== 'admin') throw new Error('Chỉ admin mới có quyền tạo tài khoản');

    const { email, password, username, full_name, area_id } = await req.json();
    if (!email || !password || !username) {
      throw new Error('Thiếu email, password hoặc username');
    }

    // Tạo auth user
    const { data: authUser, error: createError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username },
    });
    if (createError) throw new Error(createError.message);

    // Tạo profile
    const { data: newProfile, error: profileError } = await supabaseClient
      .from('users')
      .insert({
        id: authUser.user.id,
        username,
        full_name: full_name || username,
        role: 'referee',
        area_id: area_id || null,
      })
      .select()
      .single();
    if (profileError) throw new Error(profileError.message);

    return new Response(JSON.stringify({ user: newProfile }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
