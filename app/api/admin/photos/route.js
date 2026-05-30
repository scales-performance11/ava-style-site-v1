import { createClient } from "@supabase/supabase-js";
import { isApprovedAvaAdminEmail, normalizeAdminEmail } from "../../../../lib/avaAdminAccess";
import { LANDING_PHOTO_SLOTS } from "../../../../lib/landingPhotos";

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxImageSizeBytes = 10 * 1024 * 1024;

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

function safeFileName(name) {
  return String(name || "photo")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "photo";
}

function readUint32(buffer, offset) {
  return buffer.readUInt32BE(offset);
}

function getPngDimensions(buffer) {
  if (
    buffer.length >= 24 &&
    buffer.toString("ascii", 1, 4) === "PNG"
  ) {
    return {
      width: readUint32(buffer, 16),
      height: readUint32(buffer, 20),
    };
  }

  return null;
}

function getJpegDimensions(buffer) {
  let offset = 2;

  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      return null;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);

    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + length;
  }

  return null;
}

function getWebpDimensions(buffer) {
  if (
    buffer.length < 30 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }

  const format = buffer.toString("ascii", 12, 16);

  if (format === "VP8X" && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }

  if (format === "VP8 " && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (format === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  return null;
}

function getImageDimensions(buffer, mimeType) {
  const dimensions =
    mimeType === "image/png"
      ? getPngDimensions(buffer)
      : mimeType === "image/jpeg"
        ? getJpegDimensions(buffer)
        : mimeType === "image/webp"
          ? getWebpDimensions(buffer)
          : null;

  if (!dimensions || dimensions.width < 1 || dimensions.height < 1) {
    return { width: 1, height: 1 };
  }

  return dimensions;
}

function publicPhotoUrl(supabase, photo) {
  if (!photo) {
    return "";
  }

  return supabase.storage.from(photo.storage_bucket).getPublicUrl(photo.storage_path).data.publicUrl;
}

async function draftPhotoUrl(supabase, photo) {
  if (!photo) {
    return "";
  }

  const { data } = await supabase.storage
    .from(photo.storage_bucket)
    .createSignedUrl(photo.storage_path, 60 * 10);

  return data?.signedUrl || "";
}

async function serializePhoto(supabase, photo) {
  if (!photo) {
    return null;
  }

  return {
    ...photo,
    imageUrl:
      photo.storage_bucket === "ava-content-public"
        ? publicPhotoUrl(supabase, photo)
        : await draftPhotoUrl(supabase, photo),
  };
}

async function loadPhotos(supabase) {
  const { data, error } = await supabase
    .from("ava_photos")
    .select(
      "id, alt_text, storage_bucket, storage_path, sort_order, status, updated_at, published_at",
    )
    .eq("placement", "hero")
    .in(
      "sort_order",
      LANDING_PHOTO_SLOTS.map((slot) => slot.sortOrder),
    )
    .in("status", ["draft", "published"])
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  const photos = {};

  for (const slot of LANDING_PHOTO_SLOTS) {
    const slotPhotos = (data || []).filter((photo) => photo.sort_order === slot.sortOrder);
    const currentPhoto = slotPhotos.find((photo) => photo.status === "published") || null;
    const draftPhoto = slotPhotos.find((photo) => photo.status === "draft") || null;

    photos[slot.key] = {
      currentPhoto: await serializePhoto(supabase, currentPhoto),
      draftPhoto: await serializePhoto(supabase, draftPhoto),
    };
  }

  return photos;
}

function unauthorized() {
  return Response.json({ message: "This email is not approved for Ava Admin" }, { status: 403 });
}

function saveFailed() {
  return Response.json({ message: "Something didn’t save. Please try again." }, { status: 400 });
}

export async function GET(request) {
  const email = normalizeAdminEmail(new URL(request.url).searchParams.get("email"));

  if (!isApprovedAvaAdminEmail(email)) {
    return unauthorized();
  }

  const supabase = createAdminClient();

  if (!supabase) {
    return saveFailed();
  }

  try {
    return Response.json({ photos: await loadPhotos(supabase) });
  } catch (_error) {
    return saveFailed();
  }
}

export async function POST(request) {
  const formData = await request.formData();
  const email = normalizeAdminEmail(formData.get("email"));
  const slot = getSlot(String(formData.get("slotKey") || ""));
  const file = formData.get("photo");

  if (!isApprovedAvaAdminEmail(email)) {
    return unauthorized();
  }

  if (!slot || !file || !allowedImageTypes.includes(file.type) || file.size > maxImageSizeBytes) {
    return Response.json({ message: "Try a smaller image" }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (!supabase) {
    return saveFailed();
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const dimensions = getImageDimensions(buffer, file.type);
    const draftPath = `landing-page/${slot.key}/${Date.now()}-${crypto.randomUUID()}-${safeFileName(file.name)}`;

    const uploaded = await supabase.storage
      .from("ava-content-drafts")
      .upload(draftPath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploaded.error) {
      throw uploaded.error;
    }

    const inserted = await supabase
      .from("ava_photos")
      .insert({
        placement: "hero",
        title: slot.title,
        alt_text: slot.fallbackAlt,
        storage_bucket: "ava-content-drafts",
        storage_path: draftPath,
        mime_type: file.type,
        file_size_bytes: file.size,
        width: dimensions.width,
        height: dimensions.height,
        sort_order: slot.sortOrder,
        status: "draft",
      })
      .select(
        "id, alt_text, storage_bucket, storage_path, sort_order, status, updated_at, published_at",
      )
      .single();

    if (inserted.error) {
      throw inserted.error;
    }

    return Response.json({
      message: "Photo saved",
      draftPhoto: await serializePhoto(supabase, inserted.data),
    });
  } catch (_error) {
    return saveFailed();
  }
}
