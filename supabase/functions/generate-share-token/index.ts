import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { pattern_id } = await req.json();

    if (!pattern_id) {
      return new Response(
        JSON.stringify({ error: 'pattern_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role to bypass RLS
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check if pattern exists and already has a share_token
    const { data: pattern, error: fetchError } = await supabase
      .from('bead_patterns')
      .select('id, share_token')
      .eq('id', pattern_id)
      .single();

    if (fetchError || !pattern) {
      console.error('Pattern not found:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Pattern not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If token already exists, return it
    if (pattern.share_token) {
      console.log(`Returning existing share_token for pattern ${pattern_id}`);
      return new Response(
        JSON.stringify({ share_token: pattern.share_token }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate new token
    const newToken = crypto.randomUUID();

    const { error: updateError } = await supabase
      .from('bead_patterns')
      .update({ share_token: newToken })
      .eq('id', pattern_id);

    if (updateError) {
      console.error('Failed to save share_token:', updateError);
      return new Response(
        JSON.stringify({ error: 'Could not generate share token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify it was actually saved
    const { data: verify } = await supabase
      .from('bead_patterns')
      .select('share_token')
      .eq('id', pattern_id)
      .single();

    if (!verify?.share_token) {
      console.error('share_token was not persisted after update');
      return new Response(
        JSON.stringify({ error: 'Token was not saved correctly' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generated new share_token for pattern ${pattern_id}: ${newToken}`);

    return new Response(
      JSON.stringify({ share_token: newToken }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
