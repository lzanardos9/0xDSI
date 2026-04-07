import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    if (req.method === "DELETE") {
      const { user_id } = await req.json();
      
      if (!user_id) {
        return new Response(
          JSON.stringify({ error: 'User ID required' }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        );
      }

      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);

      if (deleteError) {
        return new Response(
          JSON.stringify({ error: deleteError.message }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'User deleted' }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const { email, password, full_name, user_id, username } = await req.json();

    if (!password) {
      return new Response(
        JSON.stringify({ error: 'Password required' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    let finalEmail = email;
    let profileId = null;

    if (username) {
      finalEmail = `${username}@soc.local`;
      
      const { data: profiles } = await supabaseAdmin
        .from('user_profiles')
        .select('id')
        .eq('username', username)
        .single();

      profileId = profiles?.id;
    } else if (email) {
      const { data: profiles } = await supabaseAdmin
        .from('user_profiles')
        .select('id')
        .eq('email', email)
        .single();

      profileId = profiles?.id;
    }

    if (!profileId) {
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    try {
      await supabaseAdmin.auth.admin.deleteUser(profileId);
    } catch (e) {
    }

    const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      id: profileId,
      email: finalEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name || '',
        user_id: user_id || username || ''
      }
    });

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: {
          id: authUser.user.id,
          email: authUser.user.email
        }
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});