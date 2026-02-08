import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: callerUser },
      error: callerError,
    } = await callerClient.auth.getUser();
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
      return new Response(
        JSON.stringify({ error: "Kun administratorer har adgang" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { action, userId, email, displayName, role, newPassword } =
      await req.json();

    console.log(`Admin action: ${action} by user ${callerUser.id}`);

    // === LIST USERS ===
    if (action === "list-users") {
      const {
        data: { users },
        error: listError,
      } = await adminClient.auth.admin.listUsers({ perPage: 1000 });

      if (listError) {
        console.error("Error listing users:", listError);
        return new Response(JSON.stringify({ error: listError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Return map of user_id -> { last_sign_in_at, email }
      const userMap: Record<
        string,
        { last_sign_in_at: string | null; email: string | null }
      > = {};
      for (const u of users || []) {
        userMap[u.id] = {
          last_sign_in_at: u.last_sign_in_at || null,
          email: u.email || null,
        };
      }

      return new Response(JSON.stringify({ users: userMap }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === UPDATE USER ===
    if (action === "update-user") {
      if (!userId) {
        return new Response(
          JSON.stringify({ error: "userId er påkrævet" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Update email via admin API if provided
      if (email) {
        const { error: emailError } =
          await adminClient.auth.admin.updateUserById(userId, { email });
        if (emailError) {
          console.error("Error updating email:", emailError);
          return new Response(
            JSON.stringify({ error: `Email fejl: ${emailError.message}` }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }

      // Update display_name in profiles if provided
      if (displayName !== undefined) {
        const { error: nameError } = await adminClient
          .from("profiles")
          .update({ display_name: displayName })
          .eq("user_id", userId);
        if (nameError) {
          console.error("Error updating display name:", nameError);
        }

        // Also update user_metadata
        await adminClient.auth.admin.updateUserById(userId, {
          user_metadata: { display_name: displayName },
        });
      }

      // Update role if provided
      if (role) {
        const { data: existing } = await adminClient
          .from("user_roles")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();

        if (existing) {
          await adminClient
            .from("user_roles")
            .update({ role })
            .eq("user_id", userId);
        } else {
          await adminClient
            .from("user_roles")
            .insert({ user_id: userId, role });
        }
      }

      console.log(`User ${userId} updated successfully`);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === RESET PASSWORD ===
    if (action === "reset-password") {
      if (!userId || !newPassword) {
        return new Response(
          JSON.stringify({
            error: "userId og newPassword er påkrævet",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (newPassword.length < 6) {
        return new Response(
          JSON.stringify({
            error: "Adgangskoden skal være mindst 6 tegn",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { error: pwError } =
        await adminClient.auth.admin.updateUserById(userId, {
          password: newPassword,
        });

      if (pwError) {
        console.error("Error resetting password:", pwError);
        return new Response(
          JSON.stringify({ error: pwError.message }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      console.log(`Password reset for user ${userId}`);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === DELETE USER ===
    if (action === "delete-user") {
      if (!userId) {
        return new Response(
          JSON.stringify({ error: "userId er påkrævet" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Delete from user_roles first
      await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      // Delete from profiles
      await adminClient
        .from("profiles")
        .delete()
        .eq("user_id", userId);

      // Delete auth user via admin API
      const { error: deleteError } =
        await adminClient.auth.admin.deleteUser(userId);

      if (deleteError) {
        console.error("Error deleting user:", deleteError);
        return new Response(
          JSON.stringify({ error: deleteError.message }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      console.log(`User ${userId} deleted successfully`);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: `Ukendt action: ${action}` }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
