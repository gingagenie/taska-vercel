import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { meApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["/api/me"], queryFn: meApi.get });

  const [profile, setProfile] = useState({ name: "", role: "", phone: "", avatar_url: "" });
  const [org, setOrg] = useState({ name: "", abn: "", street: "", suburb: "", state: "", postcode: "", default_labour_rate_cents: 0 });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const u = data.user || {};
    const o = data.org || {};
    setProfile({ name: u.name || "", role: u.role || "", phone: u.phone || "", avatar_url: u.avatar_url || "" });
    setOrg({
      name: o.name || "", abn: o.abn || "", street: o.street || "", suburb: o.suburb || "",
      state: o.state || "", postcode: o.postcode || "", default_labour_rate_cents: o.default_labour_rate_cents || 0
    });
  }, [data]);

  async function saveProfile() {
    setSaving(true);
    try {
      await meApi.updateProfile({
        name: profile.name || null,
        role: profile.role || null,
        phone: profile.phone || null,
        avatarUrl: profile.avatar_url || null
      });
      qc.invalidateQueries({ queryKey: ["/api/me"] });
      toast({
        title: "Profile updated",
        description: "Your profile information has been saved successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }
  
  async function changePassword() {
    if (!pw.next || pw.next !== pw.confirm) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      await meApi.changePassword({ currentPassword: pw.current || null, newPassword: pw.next });
      setPw({ current: "", next: "", confirm: "" });
      toast({
        title: "Password changed",
        description: "Your password has been updated successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to change password",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }
  
  async function saveOrg() {
    setSaving(true);
    try {
      await meApi.updateOrg({
        name: org.name || null,
        abn: org.abn || null,
        street: org.street || null,
        suburb: org.suburb || null,
        state: org.state || null,
        postcode: org.postcode || null,
        defaultLabourRateCents: Number(org.default_labour_rate_cents) || 0
      });
      qc.invalidateQueries({ queryKey: ["/api/me"] });
      toast({
        title: "Organization updated",
        description: "Your organization information has been saved successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to update organization",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <div className="p-6">Loading settings...</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="profile" data-testid="tab-profile">Profile</TabsTrigger>
          <TabsTrigger value="org" data-testid="tab-organization">Organization</TabsTrigger>
          <TabsTrigger value="subscription" data-testid="tab-subscription">Subscription</TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-security">Security</TabsTrigger>
        </TabsList>

        {/* Profile */}
        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input 
                  value={profile.name} 
                  onChange={(e)=>setProfile(p=>({...p, name: e.target.value}))} 
                  data-testid="input-profile-name"
                />
              </div>
              <div>
                <Label>Role / Title</Label>
                <Input 
                  value={profile.role} 
                  onChange={(e)=>setProfile(p=>({...p, role: e.target.value}))} 
                  data-testid="input-profile-role"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input 
                  value={profile.phone} 
                  onChange={(e)=>setProfile(p=>({...p, phone: e.target.value}))} 
                  data-testid="input-profile-phone"
                />
              </div>
              {/* Avatar upload */}
              <div className="md:col-span-2">
                <Label>Avatar</Label>
                <div className="mt-2 flex items-center gap-4">
                  <img
                    src={profile.avatar_url || "/placeholder-avatar.svg"}
                    alt="avatar"
                    className="h-12 w-12 rounded-full object-cover border"
                    onError={(e:any)=>{ e.currentTarget.src="/placeholder-avatar.svg"; }}
                    data-testid="img-avatar-preview"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        // Optional immediate preview
                        const localUrl = URL.createObjectURL(file);
                        setProfile(p => ({ ...p, avatar_url: localUrl }));

                        const res = await meApi.uploadAvatar(file);
                        // Use the server URL
                        setProfile(p => ({ ...p, avatar_url: res.url }));
                        // Refresh /api/me so rest of app sees it
                        await qc.invalidateQueries({ queryKey: ["/api/me"] });
                        toast({
                          title: "Avatar updated",
                          description: "Your profile picture has been uploaded successfully.",
                        });
                      } catch (err:any) {
                        toast({
                          title: "Upload failed",
                          description: err.message || "Failed to upload avatar",
                          variant: "destructive",
                        });
                      }
                    }}
                    data-testid="input-avatar-file"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">PNG/JPG/WebP up to 5MB.</p>
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button 
                  onClick={saveProfile} 
                  disabled={saving}
                  data-testid="button-save-profile"
                >
                  {saving ? "Saving..." : "Save Profile"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Organization */}
        <TabsContent value="org" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Organization</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Company name</Label>
                <Input 
                  value={org.name} 
                  onChange={(e)=>setOrg(o=>({...o, name: e.target.value}))} 
                  data-testid="input-org-name"
                />
              </div>
              <div>
                <Label>ABN / Company No</Label>
                <Input 
                  value={org.abn} 
                  onChange={(e)=>setOrg(o=>({...o, abn: e.target.value}))} 
                  data-testid="input-org-abn"
                />
              </div>
              <div>
                <Label>Street</Label>
                <Input 
                  value={org.street} 
                  onChange={(e)=>setOrg(o=>({...o, street: e.target.value}))} 
                  data-testid="input-org-street"
                />
              </div>
              <div>
                <Label>Suburb</Label>
                <Input 
                  value={org.suburb} 
                  onChange={(e)=>setOrg(o=>({...o, suburb: e.target.value}))} 
                  data-testid="input-org-suburb"
                />
              </div>
              <div>
                <Label>State</Label>
                <Input 
                  value={org.state} 
                  onChange={(e)=>setOrg(o=>({...o, state: e.target.value}))} 
                  data-testid="input-org-state"
                />
              </div>
              <div>
                <Label>Postcode</Label>
                <Input 
                  value={org.postcode} 
                  onChange={(e)=>setOrg(o=>({...o, postcode: e.target.value}))} 
                  data-testid="input-org-postcode"
                />
              </div>
              <div>
                <Label>Default labour rate (cents)</Label>
                <Input
                  type="number"
                  value={org.default_labour_rate_cents}
                  onChange={(e)=>setOrg(o=>({...o, default_labour_rate_cents: Number(e.target.value||0)}))}
                  placeholder="e.g. 12500 = $125.00/hr"
                  data-testid="input-org-labour-rate"
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button 
                  onClick={saveOrg} 
                  disabled={saving}
                  data-testid="button-save-organization"
                >
                  {saving ? "Saving..." : "Save Organization"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscription (read-only for now) */}
        <TabsContent value="subscription" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Subscription</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span>Plan:</span>
                <span className="font-semibold capitalize" data-testid="text-subscription-plan">
                  {data?.org?.plan || "free"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Renews:</span>
                <span data-testid="text-subscription-renewal">
                  {data?.org?.plan_renews_at ? new Date(data.org.plan_renews_at).toLocaleDateString() : "—"}
                </span>
              </div>
              <div className="pt-4">
                <Button 
                  disabled 
                  title="Coming soon"
                  data-testid="button-manage-subscription"
                >
                  Manage in Stripe
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security */}
        <TabsContent value="security" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Change Password</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Current password</Label>
                <Input 
                  type="password" 
                  value={pw.current} 
                  onChange={(e)=>setPw(p=>({...p, current: e.target.value}))} 
                  data-testid="input-current-password"
                />
              </div>
              <div>
                <Label>New password</Label>
                <Input 
                  type="password" 
                  value={pw.next} 
                  onChange={(e)=>setPw(p=>({...p, next: e.target.value}))} 
                  data-testid="input-new-password"
                />
              </div>
              <div>
                <Label>Confirm new password</Label>
                <Input 
                  type="password" 
                  value={pw.confirm} 
                  onChange={(e)=>setPw(p=>({...p, confirm: e.target.value}))} 
                  data-testid="input-confirm-password"
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button 
                  onClick={changePassword} 
                  disabled={saving}
                  data-testid="button-change-password"
                >
                  {saving ? "Changing..." : "Change Password"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}