import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Ikke autoriseret" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: "Ikke autoriseret" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUser.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Kun administratorer kan oprette brugere" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, displayName, role } = await req.json();

    if (!email || !password || !displayName) {
      return new Response(JSON.stringify({ error: "Email, adgangskode og navn er påkrævet" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for soft-deleted profile with same email
    const { data: deletedProfile } = await adminClient
      .from("profiles")
      .select("id, user_id")
      .eq("email", email)
      .eq("is_deleted", true)
      .maybeSingle();

    if (deletedProfile) {
      // REACTIVATION: Create new auth user, transfer data to new user_id
      console.log(`Reactivating soft-deleted profile for ${email}`);

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const oldUserId = deletedProfile.user_id;
      const newUserId = newUser.user!.id;

      // Transfer all patterns to new user
      await adminClient
        .from("bead_patterns")
        .update({ user_id: newUserId })
        .eq("user_id", oldUserId);

      // Transfer favorites and progress
      await adminClient
        .from("user_favorites")
        .update({ user_id: newUserId })
        .eq("user_id", oldUserId);

      await adminClient
        .from("user_progress")
        .update({ user_id: newUserId })
        .eq("user_id", oldUserId);

      // Update profile: new user_id, reactivate
      await adminClient
        .from("profiles")
        .update({
          user_id: newUserId,
          display_name: displayName,
          email,
          is_deleted: false,
          is_banned: false,
        })
        .eq("id", deletedProfile.id);

      // Assign role
      if (role) {
        await adminClient
          .from("user_roles")
          .insert({ user_id: newUserId, role });
      }

      console.log(`Reactivated user: old=${oldUserId}, new=${newUserId}`);
      return new Response(
        JSON.stringify({ success: true, userId: newUserId, reactivated: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // NORMAL CREATION: No soft-deleted profile found
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });

    if (createError) {
      // Better error message for duplicate email
      if (createError.message?.includes("already been registered") || createError.message?.includes("email_exists")) {
        return new Response(JSON.stringify({ error: "Denne email er allerede i brug" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (newUser.user) {
      // Update profile with email and display name
      await adminClient
        .from("profiles")
        .update({ display_name: displayName, email })
        .eq("user_id", newUser.user.id);

      // Assign role
      if (role) {
        await adminClient
          .from("user_roles")
          .insert({ user_id: newUser.user.id, role });
      }
    }

    return new Response(
      JSON.stringify({ success: true, userId: newUser.user?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
