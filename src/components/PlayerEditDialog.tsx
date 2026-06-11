import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Camera, User, FileImage, StickyNote, Send, Shield, ImagePlus, Ban, Eye } from "lucide-react";
import PhotoCapture from "@/components/PhotoCapture";
import PlayerPhotoLightbox from "@/components/player/PlayerPhotoLightbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/format-date";
import CategoryBadge, { ALL_CATEGORIES, type PlayerCategory } from "@/components/player/CategoryBadge";
import FlagBadges from "@/components/player/FlagBadges";
import { useIsMobile } from "@/hooks/use-mobile";
import { FormGrid, FormField, FormSection } from "@/components/ui/form-grid";
import { compressImage } from "@/lib/image-compress";
import { BlacklistPlayerDialog } from "@/components/player/BlacklistPlayerDialog";

interface PlayerEditDialogProps {
  player: {
    id: string;
    first_name: string;
    last_name: string;
    nickname?: string;
    phone?: string;
    photo_url?: string | null;
    id_number?: string;
    id_document_url?: string | null;
    player_type?: string;
    category?: string;
    birth_date?: string | null;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NOTE_TYPES = ["info", "vip", "warning", "suspicious", "incident"] as const;
const NOTE_TYPE_COLORS: Record<string, string> = {
  info: "border-l-blue-500",
  vip: "border-l-amber-500",
  warning: "border-l-orange-500",
  suspicious: "border-l-red-500",
  incident: "border-l-destructive",
};

const PlayerEditDialog = ({ player, open, onOpenChange }: PlayerEditDialogProps) => {
  const isMobile = useIsMobile();
  const { user, roles, isManager, casinoId } = useAuth();
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [playerType, setPlayerType] = useState("table");
  const [category, setCategory] = useState<PlayerCategory>("normal");
  const [uploading, setUploading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState<string>("info");
  const [addingNote, setAddingNote] = useState(false);
  const [blacklistOpen, setBlacklistOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const openLightbox = (src: string | null | undefined) => {
    if (!src) return;
    setLightboxSrc(src);
    setLightboxOpen(true);
  };

  // Pit gets read-only view: can see Notes but cannot edit fields or add notes.
  // Reception/HR/etc. get the standard editable view (no Notes).
  // Surveillance + Manager: full access (read & write Notes, edit fields).
  const isPit = roles.some(r => r === "pit") && !isManager;
  const readOnly = isPit;
  const canSeeNotes = roles.some(r => ["pit", "surveillance", "manager"].includes(r)) || isManager;
  const canAddNotes = (roles.some(r => r === "surveillance") || isManager) && !readOnly;
  const canEditCategory = isManager && !readOnly;

  useEffect(() => {
    if (player && open) {
      setFirstName(player.first_name || "");
      setLastName(player.last_name || "");
      setNickname(player.nickname || "");
      setPhone(player.phone || "");
      setIdNumber(player.id_number || "");
      setBirthDate(player.birth_date || "");
      setPlayerType(player.player_type || "table");
      setCategory((player.category as PlayerCategory) || "normal");
      setPhotoUrl(player.photo_url || null);
      setNewNote("");
      setNoteType("info");

      // Generate signed URL for private document bucket
      if (player.id_document_url && !player.id_document_url.startsWith("http")) {
        supabase.storage.from("player-documents").createSignedUrl(player.id_document_url, 3600)
          .then(({ data }) => setDocUrl(data?.signedUrl || null));
      } else {
        setDocUrl(player.id_document_url || null);
      }
    }
  }, [player, open]);

  const { data: notes = [], refetch: refetchNotes } = useQuery({
    queryKey: ["player_notes", player?.id],
    queryFn: async () => {
      if (!player) return [];
      const { data, error } = await supabase
        .from("player_notes")
        .select("*")
        .eq("player_id", player.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!player && open && canSeeNotes,
  });

  const { data: playerTags = [] } = useQuery({
    queryKey: ["player_tags_dialog", player?.id],
    queryFn: async () => {
      if (!player) return [];
      const { data } = await supabase.from("player_tags").select("tag").eq("player_id", player.id);
      return (data || []).map(t => t.tag);
    },
    enabled: !!player && open,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles_for_notes"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, display_name");
      return data || [];
    },
    enabled: open && notes.length > 0,
  });

  const getAuthorName = (userId: string) => {
    const p = profiles.find((pr: any) => pr.user_id === userId);
    return p ? (p as any).display_name : "Staff";
  };

  const handlePhotoUpload = async (file: File) => {
    if (!player) return;
    setUploading(true);
    try {
      // Compress to keep upload small and consistent (jpeg)
      const { thumbnail } = await compressImage(file);
      const path = `${casinoId || "global"}/${player.id}/photo.jpg`;
      const { error: upErr } = await supabase.storage
        .from("player-photos")
        .upload(path, thumbnail, { upsert: true, contentType: "image/jpeg", cacheControl: "0" });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("player-photos").getPublicUrl(path);
      const url = `${urlData.publicUrl}?t=${Date.now()}`;
      await supabase.from("players").update({ photo_url: url }).eq("id", player.id);
      setPhotoUrl(url);
      queryClient.invalidateQueries({ queryKey: ["players"] });
      toast.success("Photo updated");
    } catch (err: any) {
      toast.error(err?.message || "Photo upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDocUpload = async (file: File) => {
    if (!player) return;
    setUploadingDoc(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${casinoId}/${player.id}/docs/id_document.${ext}`;
      const { error: upErr } = await supabase.storage.from("player-documents").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const storagePath = path;
      await supabase.from("players").update({ id_document_url: storagePath } as any).eq("id", player.id);
      const { data: signedData } = await supabase.storage.from("player-documents").createSignedUrl(storagePath, 3600);
      setDocUrl(signedData?.signedUrl || storagePath);
      toast.success("ID document uploaded");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleAddNote = async () => {
    if (!player || !newNote.trim() || !user) return;
    setAddingNote(true);
    try {
      const { data: playerData } = await supabase.from("players").select("casino_id").eq("id", player.id).single();
      if (!playerData) throw new Error("Player not found");
      const { error } = await supabase.from("player_notes").insert({
        player_id: player.id,
        casino_id: playerData.casino_id,
        content: newNote.trim(),
        created_by: user.id,
        note_type: noteType,
      } as any);
      if (error) throw error;
      setNewNote("");
      setNoteType("info");
      refetchNotes();
      toast.success("Note added");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAddingNote(false);
    }
  };

  const handleSave = async () => {
    if (!player) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      if (firstName && firstName !== player.first_name) updates.first_name = firstName;
      if (lastName && lastName !== player.last_name) updates.last_name = lastName;
      if (nickname !== (player.nickname || "")) updates.nickname = nickname;
      if (phone !== (player.phone || "")) updates.phone = phone;
      if (idNumber !== (player.id_number || "")) updates.id_number = idNumber;
      if (birthDate !== (player.birth_date || "")) updates.birth_date = birthDate || null;
      if (playerType !== (player.player_type || "table")) updates.player_type = playerType;
      if (canEditCategory && category !== ((player.category as PlayerCategory) || "normal")) updates.category = category;
      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from("players").update(updates as any).eq("id", player.id);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["players"] });
      queryClient.invalidateQueries({ queryKey: ["player", player.id] });
      queryClient.invalidateQueries({ queryKey: ["casino_visits"] });
      toast.success("Player updated");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const hasPhoto = photoUrl || player?.photo_url;
  const hasDoc = docUrl || player?.id_document_url;
  const hasId = idNumber || player?.id_number;
  const incomplete = player && (!hasPhoto || !hasDoc || !hasId);

  const formContent = player ? (
    <div className="space-y-4 px-1">
      {/* Flags */}
      {playerTags.length > 0 && (
        <div><FlagBadges tags={playerTags} /></div>
      )}

      {/* Photos column (left, stacked) + form (right) */}
      <div className="flex gap-4">
        <div className="w-[136px] shrink-0 space-y-3">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Profile</label>
            <button
              type="button"
              onClick={() => openLightbox(photoUrl || player.photo_url || null)}
              disabled={!(photoUrl || player.photo_url)}
              aria-label="View profile photo"
              className="relative w-full aspect-square rounded-lg bg-muted flex items-center justify-center overflow-hidden border border-border group disabled:cursor-default enabled:hover:ring-2 enabled:hover:ring-primary/40 transition"
            >
              {(photoUrl || player.photo_url) ? (
                <>
                  <img src={photoUrl || player.photo_url || ""} className="w-full h-full object-cover" alt="Profile" />
                  <span className="absolute inset-0 group-hover:bg-black/30 transition flex items-center justify-center">
                    <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition" />
                  </span>
                </>
              ) : (
                <User className="w-10 h-10 text-muted-foreground" />
              )}
            </button>
            {!readOnly && (
              <PhotoCapture
                photoUrl={photoUrl || player.photo_url || null}
                onPhotoSelect={handlePhotoUpload}
                label="Photo"
                size="sm"
                captureId={`edit-photo-${player.id}`}
                disabled={uploading}
                compact
              />
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">ID / Passport</label>
            {readOnly ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full h-10 gap-1.5"
                disabled={!docUrl}
                onClick={() => openLightbox(docUrl)}
              >
                <Eye className="w-3.5 h-3.5" />
                {docUrl ? "Preview" : "No file"}
              </Button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => openLightbox(docUrl)}
                  disabled={!docUrl}
                  aria-label="View ID document"
                  className="relative w-full aspect-square rounded-lg bg-muted flex items-center justify-center overflow-hidden border border-border group disabled:cursor-default enabled:hover:ring-2 enabled:hover:ring-primary/40 transition"
                >
                  {docUrl ? (
                    <>
                      <img src={docUrl} className="w-full h-full object-cover" alt="ID" />
                      <span className="absolute inset-0 group-hover:bg-black/30 transition flex items-center justify-center">
                        <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition" />
                      </span>
                    </>
                  ) : (
                    <FileImage className="w-8 h-8 text-muted-foreground" />
                  )}
                </button>
                <PhotoCapture
                  photoUrl={docUrl || null}
                  onPhotoSelect={handleDocUpload}
                  label="ID Doc"
                  size="sm"
                  captureId={`edit-doc-${player.id}`}
                  disabled={uploadingDoc}
                  compact
                />
              </>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">

      {/* Row 2+: All form fields on a unified 12-col grid */}
      <FormGrid>
        <FormField span={6} label="First Name">
          <Input value={firstName} onChange={e => setFirstName(e.target.value)} className="h-10" disabled={readOnly} />
        </FormField>
        <FormField span={6} label="Last Name">
          <Input value={lastName} onChange={e => setLastName(e.target.value)} className="h-10" disabled={readOnly} />
        </FormField>

        <FormField span={6} label="Nickname">
          <Input value={nickname} onChange={e => setNickname(e.target.value.toUpperCase())} className="h-10 uppercase tracking-wide" disabled={readOnly} />
        </FormField>
        <FormField span={6} label="Phone">
          <Input value={phone} onChange={e => setPhone(e.target.value)} className="h-10" type="tel" disabled={readOnly} />
        </FormField>

        <FormField span={6} label="ID / Passport">
          <Input value={idNumber} onChange={e => setIdNumber(e.target.value)} className="h-10 font-mono" placeholder="Enter ID" disabled={readOnly} />
        </FormField>
        <FormField span={6} label="Birth Date">
          <Input value={birthDate} onChange={e => setBirthDate(e.target.value)} className="h-10" type="date" disabled={readOnly} />
        </FormField>

        <FormField span={6} label="Player Type">
          <Select value={playerType} onValueChange={setPlayerType} disabled={readOnly}>
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="table">Table</SelectItem>
              <SelectItem value="slots">Slots</SelectItem>
              <SelectItem value="mix">Mix</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField
          span={6}
          label={
            <>
              Category
              {!canEditCategory && <Shield className="w-3 h-3 text-muted-foreground" />}
            </>
          }
        >
          <Select value={category} onValueChange={v => setCategory(v as PlayerCategory)} disabled={!canEditCategory}>
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ALL_CATEGORIES.map(cat => (
                <SelectItem key={cat} value={cat} className="capitalize">{cat.charAt(0).toUpperCase() + cat.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {/* Notes — CCTV/Manager only. Hidden for Reception, Pit, etc. */}
        {canSeeNotes && (
          <FormSection
            title={
              <span className="flex items-center gap-1.5 normal-case tracking-normal">
                <StickyNote className="w-3 h-3" />
                Intelligence Notes ({notes.length})
              </span>
            }
          >
            {canAddNotes && (
              <FormGrid>
                <FormField span={3}>
                  <Select value={noteType} onValueChange={setNoteType}>
                    <SelectTrigger className="h-10 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {NOTE_TYPES.map(t => (
                        <SelectItem key={t} value={t} className="capitalize text-xs">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField span={8}>
                  <Textarea
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    placeholder="Add note..."
                    className="text-xs min-h-[40px] h-10 resize-none"
                  />
                </FormField>
                <FormField span={1}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-full p-0"
                    onClick={handleAddNote}
                    disabled={!newNote.trim() || addingNote}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </FormField>
              </FormGrid>
            )}
            {notes.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {notes.map((note: any) => (
                  <div key={note.id} className={`text-xs p-2 rounded bg-muted/50 border border-border border-l-2 ${NOTE_TYPE_COLORS[note.note_type] || NOTE_TYPE_COLORS.info}`}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[9px] font-mono uppercase text-muted-foreground">{note.note_type || "info"}</span>
                    </div>
                    <p className="text-card-foreground">{note.content}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {getAuthorName(note.created_by)} · {fmtDateTime(note.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </FormSection>
        )}
          </FormGrid>
        </div>
      </div>
    </div>

  ) : null;

  const titleContent = (
    <span className="flex items-center gap-2">
      {readOnly ? "View Player" : "Edit Player"}
      {player && <CategoryBadge category={(player.category as PlayerCategory) || "normal"} size="md" />}
      {incomplete && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
    </span>
  );

  const isBlacklisted = (player as any)?.status === "blacklist";
  const canBlacklist = isManager && !readOnly && !isBlacklisted && !!player;

  const footerContent = readOnly ? (
    <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none h-10">Close</Button>
  ) : (
    <>
      {canBlacklist && (
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setBlacklistOpen(true)}
          className="flex-1 sm:flex-none h-10 gap-1.5"
        >
          <Ban className="w-4 h-4" /> Blacklist
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none h-10">Cancel</Button>
      <Button size="sm" onClick={handleSave} disabled={saving} className="flex-1 sm:flex-none h-10">{saving ? "Saving…" : "Save"}</Button>
    </>
  );

  const blacklistDialog = player ? (
    <BlacklistPlayerDialog
      open={blacklistOpen}
      onClose={() => {
        setBlacklistOpen(false);
        queryClient.invalidateQueries({ queryKey: ["players"] });
      }}
      playerId={player.id}
      playerName={`${player.first_name} ${player.last_name}`}
    />
  ) : null;

  const sharedExtras = (
    <>
      {blacklistDialog}
      <PlayerPhotoLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        src={lightboxSrc}
        alt={player ? `${player.first_name} ${player.last_name}` : undefined}
      />
    </>
  );

  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent className="max-h-[92vh]">
            <DrawerHeader>
              <DrawerTitle>{titleContent}</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto flex-1 px-4 pb-2">
              {formContent}
            </div>
            <DrawerFooter className="flex-row gap-2 flex-wrap">
              {footerContent}
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
        {sharedExtras}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{titleContent}</DialogTitle>
          </DialogHeader>
          {formContent}
          <DialogFooter className="flex-wrap gap-2">
            {footerContent}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {sharedExtras}
    </>
  );
};

export default PlayerEditDialog;
