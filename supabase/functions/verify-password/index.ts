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

    // Resolve login identifier to an actual email. Users may log in with:
    //   - username only (e.g. "jasontrost")  -> look up user_profiles.email
    //   - full email (e.g. "x@itau-unibanco.com.br") -> use as-is
    let resolvedEmail: string | null = null;
    const looksLikeEmail = typeof username === 'string' && username.includes('@');

    if (looksLikeEmail) {
      resolvedEmail = username;
    } else {
      const lookupResp = await fetch(
        `${supabaseUrl}/rest/v1/user_profiles?username=eq.${encodeURIComponent(username)}&select=email`,
        {
          headers: {
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
        }
      );
      const lookup = await lookupResp.json();
      if (Array.isArray(lookup) && lookup.length > 0 && lookup[0].email) {
        resolvedEmail = lookup[0].email;
      } else {
        resolvedEmail = `${username}@soc.local`;
      }
    }

    // Use fetch to check password without creating a session
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
      },
      body: JSON.stringify({
        email: resolvedEmail,
        password: password,
      }),
    });

    const authData = await authResponse.json();

    if (authResponse.ok && authData.access_token) {
      // Password is valid, now get user profile by email (works for both login flows)
      const profileResponse = await fetch(
        `${supabaseUrl}/rest/v1/user_profiles?email=eq.${encodeURIComponent(resolvedEmail!)}&is_active=eq.true&select=*`,
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