"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createAvaSupabaseBrowserClient,
  isAvaSupabaseConfigured,
} from "../../lib/supabase/client";
import { LANDING_PHOTO_SLOTS } from "../../lib/landingPhotos";

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxImageSizeBytes = 10 * 1024 * 1024;

function createEmptyPhotoState() {
  return LANDING_PHOTO_SLOTS.reduce((result, slot) => {
    result[slot.key] = {
      currentPhoto: null,
      draftPhoto: null,
      file: null,
      previewUrl: "",
      message: "",
      isSaving: false,
      isPublishing: false,
    };
    return result;
  }, {});
}

function friendlyAccessMessage() {
  return "This email is not approved for Ava Admin";
}

function safeFileName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image-load-failed"));
    };

    image.src = url;
  });
}

export default function AdminClient() {
  const isConfigured = isAvaSupabaseConfigured();
  const supabase = useMemo(() => createAvaSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [isAllowed, setIsAllowed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [photoStates, setPhotoStates] = useState(createEmptyPhotoState);

  useEffect(() => {
    let isMounted = true;

    async function confirmStoredAccess() {
      const storedEmail = window.localStorage.getItem("ava-admin-email");

      if (!storedEmail) {
        setIsLoading(false);
        return;
      }

      const allowed = await checkAdminEmail(storedEmail);

      if (!isMounted) {
        return;
      }

      if (allowed) {
        setIsAllowed(true);
        setEmail(storedEmail);
        setMessage("");
        if (isConfigured && supabase) {
          await loadLandingPhotos();
        }
      } else {
        window.localStorage.removeItem("ava-admin-email");
        setIsAllowed(false);
      }

      setIsLoading(false);
    }

    async function loadLandingPhotos() {
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

      if (error || !data) {
        return;
      }

      setPhotoStates((current) => {
        const next = { ...current };

        LANDING_PHOTO_SLOTS.forEach((slot) => {
          const slotPhotos = data.filter((photo) => photo.sort_order === slot.sortOrder);
          const currentPhoto = slotPhotos.find((photo) => photo.status === "published") || null;
          const draftPhoto = slotPhotos.find((photo) => photo.status === "draft") || null;

          next[slot.key] = {
            ...next[slot.key],
            currentPhoto,
            draftPhoto,
          };
        });

        return next;
      });
    }

    confirmStoredAccess();

    return () => {
      isMounted = false;
    };
  }, [isConfigured, supabase]);

  async function checkAdminEmail(nextEmail) {
    try {
      const response = await fetch("/api/admin/access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: nextEmail }),
      });

      if (!response.ok) {
        return false;
      }

      const result = await response.json();
      return result.allowed === true;
    } catch (_error) {
      return false;
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setMessage("");

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setMessage("This email is not approved for Ava Admin");
      return;
    }

    const allowed = await checkAdminEmail(cleanEmail);

    if (!allowed) {
      setMessage("This email is not approved for Ava Admin");
      return;
    }

    window.localStorage.setItem("ava-admin-email", cleanEmail);
    setIsAllowed(true);
    setMessage("");

    if (isConfigured && supabase) {
      await loadLandingPhotosForCurrentAdmin();
    }
  }

  async function handleSignOut() {
    window.localStorage.removeItem("ava-admin-email");
    setIsAllowed(false);
    setMessage("");
  }

  async function loadLandingPhotosForCurrentAdmin() {
    if (!supabase) {
      return;
    }

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

    if (error || !data) {
      return;
    }

    setPhotoStates((current) => {
      const next = { ...current };

      LANDING_PHOTO_SLOTS.forEach((slot) => {
        const slotPhotos = data.filter((photo) => photo.sort_order === slot.sortOrder);
        const currentPhoto = slotPhotos.find((photo) => photo.status === "published") || null;
        const draftPhoto = slotPhotos.find((photo) => photo.status === "draft") || null;

        next[slot.key] = {
          ...next[slot.key],
          currentPhoto,
          draftPhoto,
        };
      });

      return next;
    });
  }

  function updatePhotoState(slotKey, updates) {
    setPhotoStates((current) => ({
      ...current,
      [slotKey]: {
        ...current[slotKey],
        ...updates,
      },
    }));
  }

  function getPhotoUrl(photo, fallbackSrc) {
    if (!photo) {
      return fallbackSrc;
    }

    const { data } = supabase.storage.from(photo.storage_bucket).getPublicUrl(photo.storage_path);
    return data.publicUrl || fallbackSrc;
  }

  async function handlePhotoChoice(slot, file) {
    if (!file || !allowedImageTypes.includes(file.type) || file.size > maxImageSizeBytes) {
      updatePhotoState(slot.key, {
        file: null,
        previewUrl: "",
        message: "Try a smaller image",
      });
      return;
    }

    updatePhotoState(slot.key, {
      file,
      previewUrl: URL.createObjectURL(file),
      message: "",
    });
  }

  async function handleSavePhoto(slot) {
    const slotState = photoStates[slot.key];
    const file = slotState.file;

    if (!file || !supabase) {
      updatePhotoState(slot.key, { message: "Something didn’t save. Please try again." });
      return;
    }

    updatePhotoState(slot.key, { isSaving: true, message: "" });

    try {
      const dimensions = await getImageDimensions(file);
      const fileName = safeFileName(file.name) || "photo";
      const draftPath = `landing-page/${slot.key}/${Date.now()}-${crypto.randomUUID()}-${fileName}`;

      const uploaded = await supabase.storage.from("ava-content-drafts").upload(draftPath, file, {
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

      updatePhotoState(slot.key, {
        draftPhoto: inserted.data,
        file: null,
        message: "Photo saved",
        isSaving: false,
      });
    } catch (_error) {
      updatePhotoState(slot.key, {
        message: file.size > maxImageSizeBytes ? "Try a smaller image" : "Something didn’t save. Please try again.",
        isSaving: false,
      });
    }
  }

  async function handlePublishPhoto(slot) {
    const slotState = photoStates[slot.key];
    const draftPhoto = slotState.draftPhoto;

    if (!draftPhoto || !supabase) {
      updatePhotoState(slot.key, { message: "Something didn’t save. Please try again." });
      return;
    }

    updatePhotoState(slot.key, { isPublishing: true, message: "" });

    try {
      const downloaded = await supabase.storage
        .from("ava-content-drafts")
        .download(draftPhoto.storage_path);

      if (downloaded.error) {
        throw downloaded.error;
      }

      const fileName = draftPhoto.storage_path.split("/").pop() || `${draftPhoto.id}.jpg`;
      const publicPath = `landing-page/${slot.key}/${draftPhoto.id}-${fileName}`;

      const uploaded = await supabase.storage
        .from("ava-content-public")
        .upload(publicPath, downloaded.data, {
          contentType: downloaded.data.type || "image/jpeg",
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
        .eq("id", draftPhoto.id)
        .select(
          "id, alt_text, storage_bucket, storage_path, sort_order, status, updated_at, published_at",
        )
        .single();

      if (published.error) {
        throw published.error;
      }

      updatePhotoState(slot.key, {
        currentPhoto: published.data,
        draftPhoto: null,
        message: "Photo published",
        isPublishing: false,
      });
    } catch (_error) {
      updatePhotoState(slot.key, {
        message: "Something didn’t save. Please try again.",
        isPublishing: false,
      });
    }
  }

  return (
    <main className="adminPage">
      <section className="adminShell" aria-label="Ava Admin">
        <div className="adminHeader">
          <p className="eyebrow dark">Private creative space</p>
          <h1>Ava Admin</h1>
        </div>

        {isLoading ? (
          <div className="adminPanel">
            <p className="adminStatus">Opening Ava Admin...</p>
          </div>
        ) : isAllowed ? (
          <div className="adminPanel">
            <div className="adminPanelHeader">
              <div>
                <p className="adminStatus success">Signed in</p>
                <h2>Ava Control Center</h2>
              </div>
              <button className="adminGhostButton" type="button" onClick={handleSignOut}>
                Sign out
              </button>
            </div>

            <div className="photoSlotGrid">
              {LANDING_PHOTO_SLOTS.map((slot) => (
                <article className="photoSlot" key={slot.key}>
                  <div className="photoSlotPreview">
                    <img
                      src={photoStates[slot.key].previewUrl || getPhotoUrl(photoStates[slot.key].currentPhoto, slot.fallbackSrc)}
                      alt={slot.fallbackAlt}
                    />
                  </div>
                  <div className="photoSlotControls">
                    <h3>{slot.label}</h3>
                    <label className="photoPicker">
                      <span>Choose photo</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) => handlePhotoChoice(slot, event.target.files?.[0])}
                      />
                    </label>
                    <div className="photoActions">
                      <button
                        type="button"
                        onClick={() => handleSavePhoto(slot)}
                        disabled={photoStates[slot.key].isSaving || !photoStates[slot.key].file}
                      >
                        {photoStates[slot.key].isSaving ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePublishPhoto(slot)}
                        disabled={photoStates[slot.key].isPublishing || !photoStates[slot.key].draftPhoto}
                      >
                        {photoStates[slot.key].isPublishing ? "Publishing..." : "Publish"}
                      </button>
                    </div>
                    {photoStates[slot.key].message ? (
                      <p className="adminMessage">{photoStates[slot.key].message}</p>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="adminPanel">
            <form className="adminLoginForm" onSubmit={handleLogin}>
              <label htmlFor="admin-email">Admin email</label>
              <input
                id="admin-email"
                name="email"
                type="email"
                value={email}
                autoComplete="email"
                placeholder="ava@example.com"
                required
                onChange={(event) => setEmail(event.target.value)}
              />
              <button type="submit">Continue</button>
            </form>

            {message ? <p className="adminMessage">{message}</p> : null}
          </div>
        )}

        {message && !isAllowed ? <p className="adminMessage outside">{message}</p> : null}
      </section>
    </main>
  );
}
