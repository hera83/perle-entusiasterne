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
    const url = new URL(req.url);
    const shareToken = url.searchParams.get('share_token');

    if (!shareToken) {
      return new Response(
        JSON.stringify({ error: 'share_token parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role to bypass RLS
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch pattern by share_token
    const { data: pattern, error: patternError } = await supabase
      .from('bead_patterns')
      .select(`
        id, title, category_id, plate_width, plate_height, plate_dimension,
        total_beads, thumbnail, user_id,
        categories(name),
        profiles(display_name)
      `)
      .eq('share_token', shareToken)
      .single();

    if (patternError || !pattern) {
      console.error('Pattern not found:', patternError);
      return new Response(
        JSON.stringify({ error: 'Pattern not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch plates
    const { data: plates, error: platesError } = await supabase
      .from('bead_plates')
      .select('row_index, column_index, beads')
      .eq('pattern_id', pattern.id)
      .order('row_index')
      .order('column_index');

    if (platesError) {
      console.error('Error fetching plates:', platesError);
      return new Response(
        JSON.stringify({ error: 'Could not load plates' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all colors
    const { data: colors, error: colorsError } = await supabase
      .from('bead_colors')
      .select('id, hex_color, name, code')
      .order('code');

    if (colorsError) {
      console.error('Error fetching colors:', colorsError);
      return new Response(
        JSON.stringify({ error: 'Could not load colors' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract first name only for privacy
    const fullName = (pattern as any).profiles?.display_name || 'Ukendt';
    const firstName = fullName.split(' ')[0];

    const result = {
      pattern: {
        id: pattern.id,
        title: pattern.title,
        category_name: (pattern as any).categories?.name || null,
        creator_name: firstName,
        plate_width: pattern.plate_width,
        plate_height: pattern.plate_height,
        plate_dimension: pattern.plate_dimension,
        total_beads: pattern.total_beads,
        thumbnail: pattern.thumbnail,
      },
      plates: plates || [],
      colors: colors || [],
    };

    console.log(`Shared pattern fetched: ${pattern.title} (token: ${shareToken})`);

    return new Response(
      JSON.stringify(result),
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
