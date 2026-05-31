"use client";

import { useEffect, useState } from "react";
import { LANDING_PHOTO_SLOTS } from "../../lib/landingPhotos";

const maxOriginalImageSizeBytes = 50 * 1024 * 1024;
const targetImageSizeBytes = 4 * 1024 * 1024;
const maxImageDimension = 2400;
const compressionQualities = [0.84, 0.76, 0.68, 0.6];

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

export default function AdminClient() {
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
        await loadLandingPhotosForCurrentAdmin(storedEmail);
      } else {
        window.localStorage.removeItem("ava-admin-email");
        setIsAllowed(false);
      }

      setIsLoading(false);
    }

    confirmStoredAccess();

    return () => {
      isMounted = false;
    };
  }, []);

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
    await loadLandingPhotosForCurrentAdmin(cleanEmail);
  }

  async function handleSignOut() {
    window.localStorage.removeItem("ava-admin-email");
    setIsAllowed(false);
    setMessage("");
  }

  async function loadLandingPhotosForCurrentAdmin(adminEmail = email) {
    try {
      const response = await fetch(
        `/api/admin/photos?email=${encodeURIComponent(adminEmail)}`,
      );

      if (!response.ok) {
        return;
      }

      const result = await response.json();
      mergePhotoResults(result.photos || {});
    } catch (_error) {
      setMessage("Something didn’t save. Please try again.");
    }
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
    return photo?.imageUrl || fallbackSrc;
  }

  function mergePhotoResults(photos) {
    setPhotoStates((current) => {
      const next = { ...current };

      LANDING_PHOTO_SLOTS.forEach((slot) => {
        next[slot.key] = {
          ...next[slot.key],
          currentPhoto: photos[slot.key]?.currentPhoto || next[slot.key].currentPhoto,
          draftPhoto: photos[slot.key]?.draftPhoto || next[slot.key].draftPhoto,
        };
      });

      return next;
    });
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const imageUrl = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(imageUrl);
        resolve(image);
      };

      image.onerror = () => {
        URL.revokeObjectURL(imageUrl);
        reject(new Error("image-load-failed"));
      };

      image.src = imageUrl;
    });
  }

  function canvasToBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
            return;
          }

          reject(new Error("image-compress-failed"));
        },
        "image/jpeg",
        quality,
      );
    });
  }

  function compressedFileName(fileName) {
    const cleanName = String(fileName || "ava-photo")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 70) || "ava-photo";

    return `${cleanName}.jpg`;
  }

  function isLikelyImageFile(file) {
    if (!file) {
      return false;
    }

    if (file.type.startsWith("image/")) {
      return true;
    }

    return /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name || "");
  }

  async function preparePhotoForUpload(file) {
    if (!isLikelyImageFile(file) || file.size > maxOriginalImageSizeBytes) {
      throw new Error("image-not-ready");
    }

    const image = await loadImageFromFile(file);
    const scale = Math.min(1, maxImageDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("image-compress-failed");
    }

    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    let smallestBlob = null;

    for (const quality of compressionQualities) {
      const blob = await canvasToBlob(canvas, quality);
      smallestBlob = blob;

      if (blob.size <= targetImageSizeBytes) {
        return new File([blob], compressedFileName(file.name), {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
      }
    }

    if (smallestBlob && smallestBlob.size <= targetImageSizeBytes * 2) {
      return new File([smallestBlob], compressedFileName(file.name), {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
    }

    throw new Error("image-too-large-after-compress");
  }

  async function handlePhotoChoice(slot, file) {
    updatePhotoState(slot.key, {
      file: null,
      previewUrl: "",
      message: "",
    });

    try {
      const preparedFile = await preparePhotoForUpload(file);

      updatePhotoState(slot.key, {
        file: preparedFile,
        previewUrl: URL.createObjectURL(preparedFile),
        message: "",
      });
    } catch (_error) {
      updatePhotoState(slot.key, {
        file: null,
        previewUrl: "",
        message: "Try a smaller image",
      });
    }
  }

  async function handleSavePhoto(slot) {
    const slotState = photoStates[slot.key];
    const file = slotState.file;

    if (!file) {
      updatePhotoState(slot.key, { message: "Something didn’t save. Please try again." });
      return;
    }

    updatePhotoState(slot.key, { isSaving: true, message: "" });

    try {
      const adminEmail = window.localStorage.getItem("ava-admin-email") || email;
      const formData = new FormData();
      formData.append("email", adminEmail);
      formData.append("slotKey", slot.key);
      formData.append("photo", file);

      const response = await fetch("/api/admin/photos", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "save-failed");
      }

      updatePhotoState(slot.key, {
        draftPhoto: result.draftPhoto,
        file: null,
        previewUrl: "",
        message: result.message || "Photo saved",
        isSaving: false,
      });
    } catch (_error) {
      updatePhotoState(slot.key, {
        message: "Something didn’t save. Please try again.",
        isSaving: false,
      });
    }
  }

  async function handlePublishPhoto(slot) {
    const slotState = photoStates[slot.key];
    const draftPhoto = slotState.draftPhoto;

    if (!draftPhoto) {
      updatePhotoState(slot.key, { message: "Something didn’t save. Please try again." });
      return;
    }

    updatePhotoState(slot.key, { isPublishing: true, message: "" });

    try {
      const adminEmail = window.localStorage.getItem("ava-admin-email") || email;
      const response = await fetch("/api/admin/photos/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: adminEmail,
          slotKey: slot.key,
          photoId: draftPhoto.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "publish-failed");
      }

      updatePhotoState(slot.key, {
        currentPhoto: result.currentPhoto,
        draftPhoto: null,
        message: result.message || "Photo published",
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
              <div className="adminHeaderActions">
                <a className="adminGhostButton" href="/">
                  View site
                </a>
                <button className="adminGhostButton" type="button" onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
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
                        accept="image/*"
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
