import { createClient } from "@supabase/supabase-js";
import { isApprovedAvaAdminEmail, normalizeAdminEmail } from "../../../../../lib/avaAdminAccess";
import { LANDING_PHOTO_SLOTS } from "../../../../../lib/landingPhotos";

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getSlot(slotKey) {
  return LANDING_PHOTO_SLOTS.find((slot) => slot.key === slotKey) || null;
}

function saveFailed() {
  return Response.json({ message: "Something didn’t save. Please try again." }, { status: 400 });
}

export async function POST(request) {
  let body = {};

  try {
    body = await request.json();
  } catch (_error) {
    body = {};
  }

  const email = normalizeAdminEmail(body.email);
  const slot = getSlot(String(body.slotKey || ""));
  const photoId = String(body.photoId || "");

  if (!isApprovedAvaAdminEmail(email)) {
    return Response.json({ message: "This email is not approved for Ava Admin" }, { status: 403 });
  }

  if (!slot || !photoId) {
    return saveFailed();
  }

  const supabase = createAdminClient();

  if (!supabase) {
    return saveFailed();
  }

  try {
    const draft = await supabase
      .from("ava_photos")
      .select("*")
      .eq("id", photoId)
      .eq("placement", "hero")
      .eq("sort_order", slot.sortOrder)
      .eq("status", "draft")
      .single();

    if (draft.error) {
      throw draft.error;
    }

    const downloaded = await supabase.storage
      .from("ava-content-drafts")
      .download(draft.data.storage_path);

    if (downloaded.error) {
      throw downloaded.error;
    }

    const fileName = draft.data.storage_path.split("/").pop() || `${draft.data.id}.jpg`;
    const publicPath = `landing-page/${slot.key}/${draft.data.id}-${fileName}`;
    const uploaded = await supabase.storage
      .from("ava-content-public")
      .upload(publicPath, downloaded.data, {
        contentType: draft.data.mime_type,
        upsert: false,
      });

    if (uploaded.error) {
      throw uploaded.error;
    }

    const now = new Date().toISOString();
    const archived = await supabase
      .from("ava_photos")
      .update({ status: "archived", archived_at: now })
      .eq("placement", "hero")
      .eq("sort_order", slot.sortOrder)
      .eq("status", "published");

    if (archived.error) {
      throw archived.error;
    }

    const published = await supabase
      .from("ava_photos")
      .update({
        storage_bucket: "ava-content-public",
        storage_path: publicPath,
        status: "published",
        published_at: now,
      })
      .eq("id", draft.data.id)
      .select(
        "id, alt_text, storage_bucket, storage_path, sort_order, status, updated_at, published_at",
      )
      .single();

    if (published.error) {
      throw published.error;
    }

    const publicUrl = supabase.storage
      .from(published.data.storage_bucket)
      .getPublicUrl(published.data.storage_path).data.publicUrl;

    return Response.json({
      message: "Photo published",
      currentPhoto: {
        ...published.data,
        imageUrl: publicUrl,
      },
    });
  } catch (_error) {
    return saveFailed();
  }
}
