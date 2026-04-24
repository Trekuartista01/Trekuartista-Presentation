"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type PresentationData = {
  id: string;
  title: string;
  description: string;
  published_at: string | null;
  is_pinned?: boolean;
  media: { id: string; media_url: string; media_type: "image" | "video"; sort_order?: number }[];
};

const MAX_FILE_SIZE_MB = 500;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ADMIN_NICKNAME = "trekuartista";
const ADMIN_PASSWORD = "18192021";

const initialForm = {
  title: "",
  description: "",
  published_at: "",
  template: "classic" as "classic" | "social",
  layoutCols: 1 as 1 | 3,
  socialMediaWidth: "card" as "card" | "full",
  featuredFullWidth: false,
  featuredPosition: "top" as "top" | "bottom",
  includeCustomText: false,
  customText: "",
};

export default function AdminPage() {
  const [form, setForm] = useState(initialForm);
  const [items, setItems] = useState<PresentationData[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [mediaTexts, setMediaTexts] = useState<string[]>([]);
  const [featuredFiles, setFeaturedFiles] = useState<File[]>([]);
  const [featuredMediaTexts, setFeaturedMediaTexts] = useState<string[]>([]);
  const [keepValues, setKeepValues] = useState(true);
  const [addingToId, setAddingToId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState<1 | 2>(1);
  const [editingItem, setEditingItem] = useState<PresentationData | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", published_at: "" });
  const [adminUser, setAdminUser] = useState<string | null>(null);
  const [credentials, setCredentials] = useState({ nickname: "", password: "" });

  const addFilesToQueue = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const next = Array.from(incoming);
    setFiles((prev) => [...prev, ...next]);
    setMediaTexts((prev) => [...prev, ...next.map(() => "")]);
  };

  const refresh = async () => {
    const withPinned = await supabase
      .from("presentations")
      .select("id,title,description,published_at,is_pinned,media:presentation_media(id,media_url,media_type,sort_order)")
      .order("created_at", { ascending: false });
    if (!withPinned.error && withPinned.data) {
      setItems(withPinned.data as PresentationData[]);
      return;
    }
    const fallback = await supabase
      .from("presentations")
      .select("id,title,description,published_at,media:presentation_media(id,media_url,media_type,sort_order)")
      .order("created_at", { ascending: false });
    if (fallback.error) {
      setStatus(fallback.error.message);
      return;
    }
    if (fallback.data) setItems((fallback.data as PresentationData[]).map((x) => ({ ...x, is_pinned: false })));
  };

  useEffect(() => {
    const stored = localStorage.getItem("treku_admin_user");
    if (stored) {
      setAdminUser(stored);
    }

    void refresh();
  }, []);

  const togglePin = async (item: PresentationData) => {
    const nextPinned = !item.is_pinned;
    const { error } = await supabase.from("presentations").update({ is_pinned: nextPinned }).eq("id", item.id);
    if (error) {
      setStatus("Pin nuk u ruajt në databazë. Kontrollo kolonën is_pinned dhe RLS update policy.");
      return;
    }
    setStatus(nextPinned ? "Prezantimi u vendos pin." : "Prezantimi u hoq nga pin.");
    await refresh();
  };

  const loginUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!credentials.nickname || !credentials.password) return;
    if (credentials.nickname.trim() !== ADMIN_NICKNAME || credentials.password !== ADMIN_PASSWORD) {
      setStatus("Nickname ose password gabim.");
      return;
    }
    setAdminUser(ADMIN_NICKNAME);
    localStorage.setItem("treku_admin_user", ADMIN_NICKNAME);
    setStatus("U kyçe me sukses.");
  };

  const logoutUser = () => {
    setAdminUser(null);
    localStorage.removeItem("treku_admin_user");
    setShowModal(false);
    setStatus("U çkyçe.");
  };

  const uploadMediaToPresentation = async (presentationId: string, selectedFiles: File[], startOrder = 0) => {
    const mediaRows: { presentation_id: string; media_url: string; media_type: "image" | "video"; sort_order: number }[] = [];
    for (let i = 0; i < selectedFiles.length; i += 1) {
      const current = selectedFiles[i];
      const ext = current.name.split(".").pop() ?? "bin";
      const baseName = current.name.replace(/\.[^/.]+$/, "");
      const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${presentationId}/${current.lastModified}-${i}-${safeName}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("presentations").upload(path, current, {
        upsert: false,
      });
      if (uploadError) {
        if (uploadError.message.toLowerCase().includes("bucket not found")) {
          throw new Error("Bucket 'presentations' nuk ekziston. Krijoje manualisht si public në Supabase Storage.");
        }
        if (uploadError.message.toLowerCase().includes("maximum allowed size")) {
          throw new Error("File tejkalon limitin e bucket-it. Rrite file size limit në Supabase Storage ose përdor file më të vogël.");
        }
        throw new Error(uploadError.message);
      }
      const { data: publicData } = supabase.storage.from("presentations").getPublicUrl(path);
      mediaRows.push({
        presentation_id: presentationId,
        media_url: publicData.publicUrl,
        media_type: current.type.startsWith("video/") ? "video" : "image",
        sort_order: startOrder + i,
      });
    }
    const { error: mediaError } = await supabase.from("presentation_media").insert(mediaRows);
    if (mediaError) throw new Error(mediaError.message);
    return mediaRows.length;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const isSocialFeaturedFlow = form.template === "social" && form.layoutCols === 3 && form.featuredFullWidth;
    const filesToUpload = isSocialFeaturedFlow ? [...featuredFiles, ...files] : files;

    if (filesToUpload.length === 0) {
      setStatus("Zgjidh të paktën një file.");
      return;
    }
    if (isSocialFeaturedFlow && featuredFiles.length === 0) {
      setStatus("Zgjidh të paktën 1 media featured (w-full).");
      return;
    }
    setSaving(true);
    const tooLarge = filesToUpload.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (tooLarge) {
      setSaving(false);
      setStatus(`File shumë i madh: ${tooLarge.name}. Maksimumi ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }

    let inserted: { id: string } | null = null;
    let insertError: { message: string } | null = null;

    const insertWithPinned = await supabase
      .from("presentations")
      .insert({
        title: form.title,
        description: form.description,
        published_at: form.published_at || null,
        is_pinned: false,
      })
      .select("id")
      .single();
    inserted = insertWithPinned.data;
    insertError = insertWithPinned.error ? { message: insertWithPinned.error.message } : null;

    if (insertError && insertError.message.toLowerCase().includes("is_pinned")) {
      const fallbackInsert = await supabase
        .from("presentations")
        .insert({
          title: form.title,
          description: form.description,
          published_at: form.published_at || null,
        })
        .select("id")
        .single();
      inserted = fallbackInsert.data;
      insertError = fallbackInsert.error ? { message: fallbackInsert.error.message } : null;
    }

    if (insertError || !inserted) {
      setSaving(false);
      setStatus(insertError?.message ?? "Gabim gjatë ruajtjes.");
      return;
    }

    try {
      const count = await uploadMediaToPresentation(inserted.id, filesToUpload, 0);
      const savedDesigns = localStorage.getItem("treku_presentation_designs");
      const designsMap = savedDesigns
        ? (JSON.parse(savedDesigns) as Record<
            string,
            {
              template: "classic" | "social";
              layoutCols: 1 | 3;
              socialMediaWidth?: "card" | "full";
              featuredFullWidth?: boolean;
              featuredPosition?: "top" | "bottom";
              featuredCount?: number;
              customText?: string;
              mediaTexts?: string[];
            }
          >)
        : {};
      const savedMediaTexts =
        form.template === "social"
          ? isSocialFeaturedFlow
            ? [...featuredMediaTexts.map((t) => t.trim()), ...mediaTexts.map((t) => t.trim())]
            : mediaTexts.map((t) => t.trim())
          : [];
      designsMap[inserted.id] = {
        template: form.template,
        layoutCols: form.layoutCols,
        socialMediaWidth: form.socialMediaWidth,
        featuredFullWidth: !!form.featuredFullWidth,
        featuredPosition: form.featuredPosition,
        featuredCount: isSocialFeaturedFlow ? featuredFiles.length : 0,
        customText: form.includeCustomText ? form.customText.trim() : "",
        mediaTexts: savedMediaTexts,
      };
      localStorage.setItem("treku_presentation_designs", JSON.stringify(designsMap));
      setSaving(false);
      if (!keepValues) setForm(initialForm);
      setFiles([]);
      setMediaTexts([]);
      setFeaturedFiles([]);
      setFeaturedMediaTexts([]);
      setStatus(`U ruajt me sukses. U shtuan ${count} file.`);
      setShowModal(false);
      setModalStep(1);
      await refresh();
    } catch (error) {
      setSaving(false);
      setStatus(error instanceof Error ? error.message : "Gabim gjatë upload.");
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("presentations").delete().eq("id", id);
    if (error) {
      setStatus(error.message);
      return;
    }
    setStatus("U fshi me sukses.");
    await refresh();
  };

  const addFilesToExisting = async (presentationId: string, selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    const fileList = Array.from(selectedFiles);
    const tooLarge = fileList.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (tooLarge) {
      setStatus(`File shumë i madh: ${tooLarge.name}. Maksimumi ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }
    setAddingToId(presentationId);
    const current = items.find((x) => x.id === presentationId);
    const startOrder = current?.media?.length ?? 0;
    try {
      const count = await uploadMediaToPresentation(presentationId, fileList, startOrder);
      setStatus(`U shtuan ${count} file te prezantimi ekzistues.`);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Gabim gjatë upload.");
    } finally {
      setAddingToId(null);
    }
  };

  const openEdit = (item: PresentationData) => {
    setEditingItem(item);
    setEditForm({
      title: item.title ?? "",
      description: item.description ?? "",
      published_at: item.published_at ?? "",
    });
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    const { error } = await supabase
      .from("presentations")
      .update({
        title: editForm.title,
        description: editForm.description,
        published_at: editForm.published_at || null,
      })
      .eq("id", editingItem.id);
    if (error) {
      setStatus(error.message);
      return;
    }
    setStatus("Prezantimi u përditësua me sukses.");
    setEditingItem(null);
    await refresh();
  };

  if (!adminUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#071528] p-6 text-white">
        <div className="w-full max-w-[520px] rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
          <div className="mb-5 text-center">
            <h1 className="text-2xl font-bold">Admin</h1>
          </div>
          <form onSubmit={loginUser} className="space-y-3">
            <div className="grid gap-3">
              <input
                className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 outline-none"
                placeholder="Username"
                value={credentials.nickname}
                onChange={(e) => setCredentials((p) => ({ ...p, nickname: e.target.value }))}
                required
              />
              <input
                className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 outline-none"
                type="password"
                placeholder="Password"
                value={credentials.password}
                onChange={(e) => setCredentials((p) => ({ ...p, password: e.target.value }))}
                required
              />
            </div>
            <button className="w-full rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold">Kyçu</button>
          </form>
          {status && <p className="mt-3 text-center text-sm text-white/70">{status}</p>}
          <div className="mt-5 flex justify-center">
            <Link href="/" className="rounded-xl border border-white/20 px-4 py-2 text-sm text-white/80">
              Kthehu
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#071528] p-6 text-white">
      <div className="mx-auto w-full max-w-[1200px] space-y-6">
        <section className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur-xl">
          <div>
            <h1 className="text-2xl font-bold">Admin Panel</h1>
            <p className="text-sm text-white/70">
              {adminUser ? `Kyçur si: ${adminUser}` : "Kyçu për të menaxhuar prezantimet."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setModalStep(1);
                setShowModal(true);
              }}
              disabled={!adminUser}
              className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold"
            >
              + Shto prezantim
            </button>
            {adminUser ? (
              <button onClick={logoutUser} className="rounded-xl border border-white/20 px-4 py-2 text-sm text-white/80">
                Dil
              </button>
            ) : null}
            <Link href="/" className="rounded-xl border border-white/20 px-4 py-2 text-sm text-white/80">
              Kthehu
            </Link>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <h2 className="mb-4 text-xl font-bold">Të dhënat e prezantimit</h2>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="flex min-w-0 items-center gap-3">
                  {item.media?.[0]?.media_type === "video" ? (
                    <video src={item.media[0].media_url} className="h-14 w-14 rounded-lg object-cover" muted />
                  ) : (
                    <img src={item.media?.[0]?.media_url ?? "/assets/logo-treku.png"} alt={item.title} className="h-14 w-14 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{item.title}</p>
                    <p className="truncate text-sm text-white/60">
                      {item.media?.length ?? 0} media · {item.published_at ?? "pa datë"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className={`cursor-pointer rounded-lg border px-3 py-1 text-sm ${adminUser ? "border-white/20 text-white/80" : "border-white/10 text-white/40"}`}>
                    {addingToId === item.id ? "Duke shtuar..." : "Shto file"}
                    <input
                      type="file"
                      accept="image/*,video/mp4"
                      multiple
                      className="hidden"
                      disabled={!adminUser}
                      onChange={(e) => {
                        void addFilesToExisting(item.id, e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <Link href={`/presentation/${item.id}`} className="rounded-lg border border-white/20 px-3 py-1 text-sm text-white/80">
                    Hap
                  </Link>
                  <button onClick={() => openEdit(item)} className="rounded-lg border border-indigo-300/40 px-3 py-1 text-sm text-indigo-200">
                    Edit
                  </button>
                  <button
                    onClick={() => void togglePin(item)}
                    className={`rounded-lg border px-3 py-1 text-sm ${item.is_pinned ? "border-amber-300/60 text-amber-200" : "border-white/20 text-white/80"}`}
                  >
                    {item.is_pinned ? "🔑 Unpin" : "🔑 Pin"}
                  </button>
                  <button disabled={!adminUser} onClick={() => remove(item.id)} className="rounded-lg border border-red-400/40 px-3 py-1 text-sm text-red-300 disabled:opacity-40">
                    Fshi
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4">
          <div className="mx-auto my-6 w-full max-w-[640px] rounded-3xl border border-white/10 bg-[#0f1f36] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold">{modalStep === 1 ? "Zgjidh template" : "Shto prezantim"}</h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setModalStep(1);
                }}
                className="rounded-lg border border-white/20 px-3 py-1 text-sm"
              >
                Mbyll
              </button>
            </div>
            {modalStep === 1 ? (
              <div className="space-y-4">
                <p className="text-sm text-white/70">Zgjidh fillimisht template-in, pastaj vazhdo te forma e shtimit.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, template: "classic" }));
                      setModalStep(2);
                    }}
                    className={`rounded-xl border px-4 py-3 text-left ${form.template === "classic" ? "border-indigo-400 bg-indigo-500/20" : "border-white/15 bg-white/5"}`}
                  >
                    <p className="font-semibold">PDF template</p>
                    <p className="text-xs text-white/70">Layout klasik për prezantim.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, template: "social" }));
                      setModalStep(2);
                    }}
                    className={`rounded-xl border px-4 py-3 text-left ${form.template === "social" ? "border-indigo-400 bg-indigo-500/20" : "border-white/15 bg-white/5"}`}
                  >
                    <p className="font-semibold">Social Media Template</p>
                    <p className="text-xs text-white/70">Kartela sociale me tekst për media.</p>
                  </button>
                </div>
              </div>
            ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-white/70">Template: <span className="font-semibold text-white">{form.template === "classic" ? "PDF template" : "Social Media Template"}</span></p>
                <button type="button" onClick={() => setModalStep(1)} className="rounded-lg border border-white/20 px-3 py-1 text-xs">
                  Ndrysho template
                </button>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="mb-2 text-sm font-semibold text-white">Detajet</p>
                <div className="space-y-3">
                  <input className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 outline-none" placeholder="Titulli i prezantimit" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                  <textarea className="h-24 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 outline-none" placeholder="Përshkrimi (opsionale)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  <input className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 outline-none" type="date" value={form.published_at} onChange={(e) => setForm({ ...form, published_at: e.target.value })} />
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="mb-2 text-sm font-semibold text-white">Layout</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, layoutCols: 1, featuredFullWidth: false })}
                    className={`rounded-lg px-3 py-1 text-sm ${form.layoutCols === 1 ? "bg-indigo-500 text-white" : "bg-white/10 text-white/80"}`}
                  >
                    Grid 1 kolonë
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, layoutCols: 3 })}
                    className={`rounded-lg px-3 py-1 text-sm ${form.layoutCols === 3 ? "bg-indigo-500 text-white" : "bg-white/10 text-white/80"}`}
                  >
                    Grid 3 kolona
                  </button>
                </div>
                {form.template === "social" && form.layoutCols === 3 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1 text-sm">
                      <input
                        type="checkbox"
                        checked={!!form.featuredFullWidth}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setForm({ ...form, featuredFullWidth: checked });
                          if (!checked) {
                            setFeaturedFiles([]);
                            setFeaturedMediaTexts([]);
                          }
                        }}
                      />
                      1 media featured (w-full)
                    </label>
                    {form.featuredFullWidth && (
                      <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1 text-sm">
                        <span className="text-white/80">Pozicioni:</span>
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            name="featuredPosition"
                            checked={form.featuredPosition === "top"}
                            onChange={() => setForm({ ...form, featuredPosition: "top" })}
                          />
                          Sipër
                        </label>
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            name="featuredPosition"
                            checked={form.featuredPosition === "bottom"}
                            onChange={() => setForm({ ...form, featuredPosition: "bottom" })}
                          />
                          Poshtë
                        </label>
                      </div>
                    )}
                  </div>
                )}
                {form.template === "social" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, socialMediaWidth: "card" })}
                      className={`rounded-lg px-3 py-1 text-sm ${form.socialMediaWidth === "card" ? "bg-fuchsia-500" : "bg-white/10"}`}
                    >
                      Card width
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, socialMediaWidth: "full" })}
                      className={`rounded-lg px-3 py-1 text-sm ${form.socialMediaWidth === "full" ? "bg-fuchsia-500" : "bg-white/10"}`}
                    >
                      w-full
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="mb-2 text-sm font-semibold text-white">Tekste</p>
                <label className="flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={!!form.includeCustomText}
                    onChange={(e) => setForm({ ...form, includeCustomText: e.target.checked })}
                  />
                  Shto tekst shtesë për prezantimin
                </label>
                {!!form.includeCustomText && (
                  <textarea
                    className="mt-2 h-20 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 outline-none"
                    placeholder="Shkruaj tekstin që do shfaqet në prezantim..."
                    value={form.customText ?? ""}
                    onChange={(e) => setForm({ ...form, customText: e.target.value })}
                  />
                )}
              </div>

              {form.template === "social" && (files.length > 0 || (featuredFiles.length > 0 && form.layoutCols === 3 && form.featuredFullWidth)) && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="mb-2 text-sm font-semibold">Tekst për çdo media</p>
                  {form.layoutCols === 3 && form.featuredFullWidth ? (
                    <div className="mb-3 space-y-2 rounded-lg border border-white/10 bg-white/5 p-2">
                      <p className="text-xs font-semibold text-white/75">Tekst për media featured (w-full)</p>
                      {featuredFiles.map((f, idx) => (
                        <div key={`${f.name}-${f.lastModified}`} className="space-y-1">
                          <p className="truncate text-[11px] text-white/60">{f.name}</p>
                          <input
                            className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
                            placeholder={`Teksti për featured media ${idx + 1}`}
                            value={featuredMediaTexts[idx] ?? ""}
                            onChange={(e) =>
                              setFeaturedMediaTexts((prev) => {
                                const next = [...prev];
                                next[idx] = e.target.value;
                                return next;
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="max-h-56 space-y-3 overflow-auto pr-1">
                    {files.map((f, idx) => (
                      <div key={`${f.name}-${f.lastModified}`} className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-2">
                        <p className="text-xs font-semibold text-white/75">{f.name}</p>
                        <input
                          className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
                          placeholder={`Teksti për media ${idx + 1}`}
                          value={mediaTexts[idx] ?? ""}
                          onChange={(e) =>
                            setMediaTexts((prev) => {
                              const next = [...prev];
                              next[idx] = e.target.value;
                              return next;
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="mb-2 text-sm font-semibold text-white">Media</p>
                {form.template === "social" && form.layoutCols === 3 && form.featuredFullWidth ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <p className="mb-2 text-sm font-semibold">Media featured (w-full)</p>
                      <label className="block cursor-pointer rounded-xl border border-dashed border-fuchsia-300/60 bg-fuchsia-500/10 p-3 text-center transition hover:bg-fuchsia-500/20">
                        <p className="text-sm font-semibold text-fuchsia-100">Shto foto/video featured (mund të shtosh më shumë se 1)</p>
                        <input
                          className="hidden"
                          type="file"
                          accept="image/*,video/mp4"
                          multiple
                          onChange={(e) => {
                            const incoming = e.target.files ? Array.from(e.target.files) : [];
                            if (incoming.length > 0) {
                              setFeaturedFiles((prev) => [...prev, ...incoming]);
                              setFeaturedMediaTexts((prev) => [...prev, ...incoming.map(() => "")]);
                            }
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>
                      {featuredFiles.length > 0 ? (
                        <div className="mt-2 max-h-28 space-y-1 overflow-auto text-xs text-white/75">
                          {featuredFiles.map((f, idx) => (
                            <div key={`${f.name}-${f.lastModified}`} className="flex items-center justify-between gap-2">
                              <p className="truncate">{f.name}</p>
                              <button
                                type="button"
                                onClick={() => {
                                  setFeaturedFiles((prev) => prev.filter((_, i) => i !== idx));
                                  setFeaturedMediaTexts((prev) => prev.filter((_, i) => i !== idx));
                                }}
                                className="rounded border border-white/20 px-2 py-0.5 text-[11px]"
                              >
                                Hiq
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-white/55">Asnjë media featured e zgjedhur.</p>
                      )}
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <p className="mb-2 text-sm font-semibold">Media për grid-cols-3</p>
                      <label className="block cursor-pointer rounded-xl border border-dashed border-indigo-300/60 bg-indigo-500/10 p-3 text-center transition hover:bg-indigo-500/20">
                        <p className="text-sm font-semibold text-indigo-100">Shto foto/video për grid</p>
                        <p className="mt-1 text-xs text-white/70">Këto shfaqen ndaras nga featured media.</p>
                        <input
                          className="hidden"
                          type="file"
                          accept="image/*,video/mp4"
                          multiple
                          onChange={(e) => {
                            addFilesToQueue(e.target.files);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <label className="block cursor-pointer rounded-2xl border border-dashed border-indigo-300/60 bg-indigo-500/10 p-4 text-center transition hover:bg-indigo-500/20">
                    <p className="text-sm font-semibold text-indigo-100">Shto foto ose video (mund të shtosh shumë herë)</p>
                    <p className="mt-1 text-xs text-white/70">Kliko këtu dhe vazhdo të shtosh file. Emri pastrohet pas çdo zgjedhjeje.</p>
                    <input
                      className="hidden"
                      type="file"
                      accept="image/*,video/mp4"
                      multiple
                      onChange={(e) => {
                        addFilesToQueue(e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm text-white/80">
                <input type="checkbox" checked={keepValues} onChange={(e) => setKeepValues(e.target.checked)} />
                Mbaj titullin/përshkrimin për shtim të shpejtë të të dhënave të tjera
              </label>
              {files.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="mb-2 text-sm font-semibold">{files.length} file të zgjedhura</p>
                  <div className="max-h-28 space-y-1 overflow-auto text-xs text-white/70">
                    {files.map((f, idx) => (
                      <div key={`${f.name}-${f.lastModified}`} className="flex items-center justify-between gap-2">
                        <p className="truncate">
                          {f.name} ({Math.max(1, Math.round(f.size / 1024 / 1024))}MB)
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setFiles((prev) => prev.filter((_, i) => i !== idx));
                            setMediaTexts((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          className="rounded border border-white/20 px-2 py-0.5 text-[11px]"
                        >
                          Hiq
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {form.template === "social" && form.layoutCols === 3 && form.featuredFullWidth && featuredFiles.length > 0 ? (
                <div className="rounded-xl border border-fuchsia-300/30 bg-fuchsia-500/10 p-3 text-xs text-fuchsia-100">
                  Featured media: {featuredFiles.length} file
                </div>
              ) : null}
              <button disabled={saving} className="w-full rounded-xl bg-indigo-500 px-4 py-2 font-semibold disabled:opacity-50">
                {saving ? "Duke ruajtur..." : "Shto prezantim"}
              </button>
              {status && <p className="text-sm text-white/70">{status}</p>}
            </form>
            )}
          </div>
        </div>
      )}

      {editingItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4">
          <div className="mx-auto my-8 w-full max-w-[640px] rounded-3xl border border-white/10 bg-[#0f1f36] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold">Edit prezantim</h3>
              <button onClick={() => setEditingItem(null)} className="rounded-lg border border-white/20 px-3 py-1 text-sm">
                Mbyll
              </button>
            </div>
            <form onSubmit={saveEdit} className="space-y-3">
              <input
                className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 outline-none"
                placeholder="Titulli i prezantimit"
                value={editForm.title}
                onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
                required
              />
              <textarea
                className="h-24 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 outline-none"
                placeholder="Përshkrimi (opsionale)"
                value={editForm.description}
                onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
              />
              <input
                className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 outline-none"
                type="date"
                value={editForm.published_at}
                onChange={(e) => setEditForm((prev) => ({ ...prev, published_at: e.target.value }))}
              />
              <button className="w-full rounded-xl bg-indigo-500 px-4 py-2 font-semibold">Ruaj ndryshimet</button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
