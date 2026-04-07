import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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
    const { username, password } = await req.json();

    if (!username || !password) {
      return new Response(
        JSON.stringify({ valid: false, message: 'Username and password required' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Create a Supabase client with service role to query auth.users
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Use fetch to check password without creating a session
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
      },
      body: JSON.stringify({
        email: `${username}@soc.local`,
        password: password,
      }),
    });

    const authData = await authResponse.json();

    if (authResponse.ok && authData.access_token) {
      // Password is valid, now get user profile
      const profileResponse = await fetch(
        `${supabaseUrl}/rest/v1/user_profiles?username=eq.${username}&is_active=eq.true&select=*`,
        {
          headers: {
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
        }
      );

      const profiles = await profileResponse.json();

      if (profiles && profiles.length > 0) {
        const profile = profiles[0];
        return new Response(
          JSON.stringify({
            valid: true,
            userId: profile.id,
            username: profile.username,
            movementPattern: profile.movement_pattern,
          }),
          {
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        );
      }
    }

    return new Response(
      JSON.stringify({ valid: false, message: 'Invalid credentials' }),
      {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ valid: false, message: 'Authentication error', error: error.message }),
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