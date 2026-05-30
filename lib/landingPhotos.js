import { createClient } from "@supabase/supabase-js";

export const LANDING_PHOTO_SLOTS = [
  {
    key: "portrait",
    label: "Opening Hero Photo",
    title: "Opening Hero Photo",
    sortOrder: 1,
    fallbackSrc: "/images/ava-editorial-closeup.jpeg",
    fallbackAlt: "Ava editorial portrait",
  },
  {
    key: "main-brand",
    label: "Gallery Feature Photo",
    title: "Gallery Feature Photo",
    sortOrder: 0,
    fallbackSrc: "/images/ava-warm-casual.jpeg",
    fallbackAlt: "Ava casual style reference",
  },
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function createPublicSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function buildLandingPhotoMap(photos = []) {
  const bySortOrder = new Map(photos.map((photo) => [photo.sort_order, photo]));

  return LANDING_PHOTO_SLOTS.reduce((result, slot) => {
    const photo = bySortOrder.get(slot.sortOrder);
    result[slot.key] = {
      src: photo?.publicUrl || slot.fallbackSrc,
      alt: photo?.alt_text || slot.fallbackAlt,
      fallbackSrc: slot.fallbackSrc,
      fallbackAlt: slot.fallbackAlt,
    };
    return result;
  }, {});
}

export async function getPublishedLandingPhotos() {
  const supabase = createPublicSupabaseClient();

  if (!supabase) {
    return buildLandingPhotoMap();
  }

  const { data, error } = await supabase
    .from("ava_photos")
    .select("alt_text, storage_bucket, storage_path, sort_order")
    .eq("placement", "hero")
    .eq("status", "published")
    .in(
      "sort_order",
      LANDING_PHOTO_SLOTS.map((slot) => slot.sortOrder),
    )
    .order("published_at", { ascending: false });

  if (error || !data) {
    return buildLandingPhotoMap();
  }

  const seen = new Set();
  const photos = data
    .filter((photo) => {
      if (seen.has(photo.sort_order)) {
        return false;
      }
      seen.add(photo.sort_order);
      return true;
    })
    .map((photo) => {
      const { data: publicData } = supabase.storage
        .from(photo.storage_bucket)
        .getPublicUrl(photo.storage_path);

      return {
        ...photo,
        publicUrl: publicData.publicUrl,
      };
    });

  return buildLandingPhotoMap(photos);
}
