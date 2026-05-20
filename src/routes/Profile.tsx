/**
 * SPEC-028 — Profile (kind 0) editor.
 *
 * Two render modes:
 *  - `pubkey` omitted → editable view of the current authenticated user.
 *  - `pubkey` provided → read-only view of that hex pubkey.
 *
 * The editor is intentionally tiny: four text fields + a picture upload.
 * Save calls `updateProfile()` with only the fields that actually changed
 * vs. the cached profile, so we don't clobber unknown kind-0 fields.
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { useAuthStore } from '@/lib/auth';
import { useProfile, updateProfile, type Profile } from '@/lib/profile';
import { uploadPhoto, BlossomError } from '@/lib/blossom';
import { cn } from '@/lib/cn';

export interface ProfileProps {
  pubkey?: string;
  onBack?: () => void;
}

interface FormState {
  displayName: string;
  picture: string;
  about: string;
  nip05: string;
  lud16: string;
}

function profileToForm(p: Profile): FormState {
  return {
    displayName: p.displayName ?? '',
    picture: p.picture ?? '',
    about: p.about ?? '',
    nip05: p.nip05 ?? '',
    lud16: p.lud16 ?? '',
  };
}

function diffPatch(form: FormState, original: FormState): Partial<Profile> {
  const out: Partial<Profile> = {};
  if (form.displayName !== original.displayName) out.displayName = form.displayName;
  if (form.picture !== original.picture) out.picture = form.picture;
  if (form.about !== original.about) out.about = form.about;
  if (form.nip05 !== original.nip05) out.nip05 = form.nip05;
  if (form.lud16 !== original.lud16) out.lud16 = form.lud16;
  return out;
}

function Avatar({ url, hex }: { url?: string; hex: string }) {
  const swatch = `#${(hex.slice(0, 6) || '888888').padEnd(6, '0')}`;
  const cls = 'h-20 w-20 rounded-card ring-1 ring-soil-200';
  return url
    ? <img src={url} alt="" className={cn(cls, 'object-cover')} />
    : <span aria-hidden="true" className={cn(cls, 'inline-block')} style={{ backgroundColor: swatch }} />;
}

export function Profile({ pubkey, onBack }: ProfileProps) {
  const me = useAuthStore((s) => s.signer);
  const myNpub = useAuthStore((s) => s.npub);
  const [myPubkey, setMyPubkey] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!me) { setMyPubkey(null); return; }
    void me.user().then((u) => { if (!cancelled) setMyPubkey(u.pubkey); });
    return () => { cancelled = true; };
  }, [me]);

  const target = pubkey ?? myPubkey ?? '';
  const editable = !pubkey && !!myPubkey;
  const profile = useProfile(target);
  const original = useMemo(() => profileToForm(profile), [profile]);
  const [form, setForm] = useState<FormState>(original);
  const [pristine, setPristine] = useState(true);
  useEffect(() => {
    // When the cached kind-0 lands or the target pubkey switches, reset
    // the form — but only while the user hasn't started editing.
    if (pristine) setForm(original);
    // We intentionally watch a stable JSON form to avoid fighting React's
    // referential equality on object literals from `useMemo`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(original), pristine]);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setPristine(false);
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function pickPicture(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ref = await uploadPhoto(file);
      update('picture', ref.url);
      toast.success('Photo uploaded');
    } catch (err) {
      const msg =
        err instanceof BlossomError ? err.message : (err as Error)?.message ?? 'Upload failed';
      toast.danger('Photo upload failed', msg);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function save() {
    const patch = diffPatch(form, original);
    if (Object.keys(patch).length === 0) {
      toast.warning('Nothing to save', 'No fields have changed.');
      return;
    }
    setSaving(true);
    try {
      await updateProfile(patch);
      setPristine(true);
      toast.success('Profile saved');
    } catch (err) {
      toast.danger('Could not save', (err as Error)?.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  const headerName = profile.displayName?.trim() || (editable ? 'Your profile' : 'Profile');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col px-5 py-6 gap-4">
      <header className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back">
          {'←'} Back
        </Button>
        {editable && myNpub && (
          <span className="font-mono text-[11px] text-soil-500 truncate max-w-[60%]">
            {myNpub}
          </span>
        )}
      </header>

      <Card>
        <div className="flex items-center gap-4">
          <Avatar url={form.picture || profile.picture} hex={target} />
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">{headerName}</CardTitle>
            {profile.nip05 && (
              <CardSubtitle className="truncate">{profile.nip05}</CardSubtitle>
            )}
          </div>
        </div>
        {!editable && profile.about && (
          <p className="mt-4 whitespace-pre-wrap text-sm text-soil-700">{profile.about}</p>
        )}
        {!editable && profile.lud16 && (
          <p className="mt-3 text-xs text-soil-500">
            <span className="font-mono uppercase tracking-eyebrow">Zap</span>{' '}
            <span className="font-mono">{profile.lud16}</span>
          </p>
        )}
      </Card>

      {editable && (
        <Card>
          <CardTitle>Edit profile</CardTitle>
          <CardSubtitle>Stored as a kind-0 event on the chapter relay.</CardSubtitle>
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={pickPicture}
                aria-label="Upload picture"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileRef.current?.click()}
                loading={uploading}
                disabled={uploading || saving}
              >
                {form.picture ? 'Replace picture' : 'Upload picture'}
              </Button>
              {form.picture && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => update('picture', '')}
                  disabled={uploading || saving}
                >
                  Remove
                </Button>
              )}
            </div>
            <Input
              label="Display name"
              value={form.displayName}
              onChange={(e) => update('displayName', e.target.value)}
              placeholder="What people call you"
            />
            <Textarea
              label="About"
              value={form.about}
              onChange={(e) => update('about', e.target.value)}
              autoGrow
              placeholder="Optional bio"
            />
            <Input
              label="NIP-05"
              value={form.nip05}
              onChange={(e) => update('nip05', e.target.value)}
              placeholder="you@example.com"
            />
            <Input
              label="Lightning address (lud16)"
              value={form.lud16}
              onChange={(e) => update('lud16', e.target.value)}
              placeholder="you@walletofsatoshi.com"
            />
            <Button
              variant="primary"
              fullWidth
              onClick={save}
              loading={saving}
              disabled={saving || uploading}
            >
              Save
            </Button>
          </div>
        </Card>
      )}
    </main>
  );
}

export default Profile;
